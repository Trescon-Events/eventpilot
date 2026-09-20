'use client'

import { useState, useEffect, use } from 'react'
import { useSearchParams } from 'next/navigation'
import PageHeader from '@/app/components/PageHeader'
import { permissionSetSatisfies } from '@/app/lib/access/permission-match'
import { Button, Card, Input, Select, SearchableSelect } from '@/app/components/ui'
import { FormType, FORM_TYPES, FORM_TITLES, PROPERTY_TITLES, FieldSchema } from '@/app/lib/forms/types'
import { HubSpotFieldMapping, HubSpotFormField, EventHubSpotForm, guessFieldTypeFromHubSpot } from '@/app/lib/hubspot/types'
import { AddFieldForm, NewFieldDraft, EMPTY_FIELD_DRAFT, FIELD_TYPE_OPTIONS, buildFieldFromDraft } from '@/app/components/forms/AddFieldForm'

const CONCEPT_TYPE_OPTIONS = FIELD_TYPE_OPTIONS.filter(o => o.type !== 'file')
const CREATE_NEW_FIELD = '__create_new_field__'

// "Concept" fields can't be type 'file' (files go through the separate
// asset/secure_document mapping types) — if the HubSpot field's own type
// has no concept-safe equivalent (e.g. it's a file field being created as
// a concept for some reason), fall back to 'text' rather than a type the
// form's own type picker doesn't offer.
function draftFromHubSpotField(f: HubSpotFormField): NewFieldDraft {
  const guessed = guessFieldTypeFromHubSpot(f.fieldType)
  const type = CONCEPT_TYPE_OPTIONS.some(o => o.type === guessed) ? guessed : 'text'
  const hasOptions = (type === 'select' || type === 'multiselect') && !!f.options?.length
  return {
    ...EMPTY_FIELD_DRAFT,
    label: f.label,
    type,
    required: f.required,
    options: hasOptions ? f.options!.map(o => o.value) : [''],
  }
}

/* Connect a HubSpot form to this event+form_type, inspect its real fields
   via the HubSpot API, and map each one to an EventPilot concept — Phase A
   of the HubSpot Forms integration, superseding the custom Form Builder
   (app/admin/events/[id]/stakeholders/form-builder/[formType]/page.tsx,
   left in place/untouched) as the active path for onboarding forms.
   Once connected, the public page (app/public/forms/[event_id]/[form_type])
   embeds HubSpot's own form instead of rendering our own fields. */

const TARGET_TYPE_OPTIONS = [
  { value: 'concept', label: 'EventPilot field' },
  { value: 'crm_property', label: 'CRM property (cross-event)' },
  { value: 'asset', label: 'File asset' },
  { value: 'sensitive_document', label: 'Sensitive document (Passport / National ID)' },
  { value: 'custom', label: 'Consent checkbox' },
]

const ASSET_ROLE_OPTIONS = [
  { value: 'photo', label: 'Speaker Photo' },
  { value: 'company_logo', label: 'Company Logo (speaker)' },
  { value: 'logo', label: 'Partner Logo' },
  { value: 'bio_full', label: 'Full Bio (PDF/Word document)' },
]

const SENSITIVE_DOCUMENT_TYPE_OPTIONS = [
  { value: 'passport', label: 'Passport' },
  { value: 'national_id', label: 'National ID' },
]

// Loose keyword check used only to warn (never block) when a HubSpot form
// looks miscategorized — the exact bug that triggered building the CRM
// layer at all (DFS's Speaker form was once connected under 'sponsor').
const CATEGORY_KEYWORDS: Record<FormType, string[]> = {
  speaker: ['speaker'],
  sponsor: ['sponsor'],
  media_partner: ['media'],
  association_partner: ['association'],
}
function formNameLooksMismatched(formName: string | null | undefined, formType: FormType): boolean {
  if (!formName) return false
  const lower = formName.toLowerCase()
  const ownKeywords = CATEGORY_KEYWORDS[formType]
  const otherKeywords = Object.entries(CATEGORY_KEYWORDS).filter(([t]) => t !== formType).flatMap(([, kws]) => kws)
  const mentionsOwn = ownKeywords.some(k => lower.includes(k))
  const mentionsOther = otherKeywords.some(k => lower.includes(k))
  return mentionsOther && !mentionsOwn
}

type CrmProperty = { id: string; entity_type: 'contact' | 'company'; property_key: string; label: string }

function targetType(m: HubSpotFieldMapping | undefined): string {
  return m?.target?.type ?? 'custom'
}
function crmPropertyOptionValue(entityType: 'contact' | 'company', propertyKey: string): string {
  return `${entityType}:${propertyKey}`
}

export default function HubSpotFormConnectPage({ params }: { params: Promise<{ id: string; formType: string }> }) {
  const { id: eventId, formType } = use(params)
  const valid = FORM_TYPES.includes(formType as FormType)
  // Reached from both the Stakeholder Hub's own form-status cards and the
  // Integrations page's HubSpot Forms section (2026-09-07) — back-nav
  // follows whichever one the producer actually came from, via a plain
  // `?from=integrations` query param set only by that one link.
  const cameFromIntegrations = useSearchParams().get('from') === 'integrations'

  const [permissions, setPermissions] = useState<Set<string>>(new Set())
  const [connection, setConnection] = useState<EventHubSpotForm | null>(null)
  const [allFields, setAllFields] = useState<FieldSchema[]>([])
  const [conceptFields, setConceptFields] = useState<FieldSchema[]>([])
  const [sharedKeys, setSharedKeys] = useState<Set<string>>(new Set())
  const [crmProperties, setCrmProperties] = useState<CrmProperty[]>([])
  const [mapping, setMapping] = useState<HubSpotFieldMapping[]>([])
  const [loading, setLoading] = useState(valid)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [msgIsError, setMsgIsError] = useState(false)
  const [newFormId, setNewFormId] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [availableForms, setAvailableForms] = useState<{ id: string; name: string }[] | null>(null)
  const [formsLoading, setFormsLoading] = useState(false)
  const [formsError, setFormsError] = useState<string | null>(null)
  const [creatingFor, setCreatingFor] = useState<string | null>(null)
  const [creatingWorkflow, setCreatingWorkflow] = useState(false)
  const [fieldDraft, setFieldDraft] = useState<NewFieldDraft>(EMPTY_FIELD_DRAFT)
  const [creatingField, setCreatingField] = useState(false)
  // True only while `mapping` has changes not yet persisted via Save
  // Mapping — set on every updateTarget() call, cleared whenever `mapping`
  // is freshly loaded from the server (initial load, connect, resync — all
  // of which already reflect the persisted state) or right after a
  // successful save. Drives disabling Save Mapping so its state always
  // matches reality (2026-08-11, Madhu: "user will not be confused whether
  // the mapping was saved or not").
  const [dirty, setDirty] = useState(false)

  const can = (key: string) => permissionSetSatisfies(permissions, key)
  const canManage = can('sae.forms.manage')

  async function loadAll() {
    const [permRes, connRes, schemaRes, crmRes] = await Promise.all([
      fetch(`/api/events/access/me?event_id=${eventId}`).then(r => r.json()).catch(() => ({ permissions: [] })),
      fetch(`/api/events/stakeholders/hubspot/connection?event_id=${eventId}&form_type=${formType}`).then(r => r.json()).catch(() => null),
      fetch(`/api/events/stakeholders/forms/${formType}/schema?event_id=${eventId}`).then(r => r.json()).catch(() => ({ fields: [] })),
      fetch('/api/crm/properties').then(r => r.json()).catch(() => []),
    ])
    setPermissions(new Set(permRes.permissions ?? []))
    setConnection(connRes?.id ? connRes : null)
    setAllFields(schemaRes.fields ?? [])
    setConceptFields((schemaRes.fields ?? []).filter((f: FieldSchema) => f.type !== 'file'))
    setSharedKeys(new Set(schemaRes.sharedKeys ?? []))
    setCrmProperties(Array.isArray(crmRes) ? crmRes : [])
    setMapping(connRes?.field_mapping ?? [])
    setDirty(false)
  }

  // Persists a brand-new EventPilot field (this event's own form_schema
  // override) so a HubSpot field with no existing match — e.g. HubSpot's
  // separate firstname/lastname vs. our single locked full_name — gets a
  // real, reusable target instead of falling back to "extra data." Saves
  // immediately (its own PUT to the schema route, distinct from the
  // mapping's own Save) so the new field is available right away; still
  // requires "Save Mapping" to persist which HubSpot field points at it.
  async function createField(f: HubSpotFormField) {
    const result = buildFieldFromDraft(fieldDraft, allFields)
    if (typeof result === 'string') { setMsg(result); setMsgIsError(true); return }
    setCreatingField(true); setMsg(null)
    const nextFields = [...allFields, result]
    const res = await fetch(`/api/events/stakeholders/forms/${formType}/schema?event_id=${eventId}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: nextFields }),
    })
    const data = await res.json().catch(() => ({}))
    setCreatingField(false)
    if (res.ok) {
      const savedFields = data.fields as FieldSchema[]
      setAllFields(savedFields)
      setConceptFields(savedFields.filter(x => x.type !== 'file'))
      updateTarget(f.name, f.label, { type: 'concept', key: result.key })
      setCreatingFor(null); setFieldDraft(EMPTY_FIELD_DRAFT)
      setMsg(`Field "${result.label}" created.`); setMsgIsError(false)
    } else {
      setMsg(data.error ?? 'Could not create field.'); setMsgIsError(true)
    }
  }

  useEffect(() => {
    if (!valid) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-mount; matches stakeholders/page.tsx's fetchAll effect
    setLoading(true)
    loadAll().finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadAll is stable for this effect's purpose (mount + eventId/formType change only)
  }, [eventId, formType, valid])

  // Only fetched once, lazily, once we know there's actually a "pick a
  // form" screen to show (not yet connected, and permitted to manage) —
  // no reason to hit HubSpot's forms-list API for an event that's already
  // connected.
  useEffect(() => {
    if (loading || connection || !canManage || availableForms !== null || formsLoading) return
    setFormsLoading(true)
    fetch(`/api/events/stakeholders/hubspot/forms?event_id=${eventId}`)
      .then(r => r.json())
      .then(data => {
        if (data.forms) setAvailableForms(data.forms)
        else setFormsError(data.error ?? 'Could not load HubSpot forms.')
      })
      .catch(() => setFormsError('Could not load HubSpot forms.'))
      .finally(() => setFormsLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- guarded by availableForms/formsLoading above; deliberately runs once per mount
  }, [loading, connection, canManage, eventId])

  function updateTarget(fieldName: string, fieldLabel: string, target: HubSpotFieldMapping['target']) {
    setMapping(prev => {
      const next = prev.filter(m => m.hubspot_field_name !== fieldName)
      next.push({ hubspot_field_name: fieldName, hubspot_label: fieldLabel, target })
      return next
    })
    setDirty(true)
  }

  async function connect() {
    if (!newFormId.trim()) { setMsg('Enter a HubSpot Form ID first.'); setMsgIsError(true); return }
    setConnecting(true); setMsg(null)
    const res = await fetch('/api/events/stakeholders/hubspot/connect', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_id: eventId, form_type: formType, hubspot_form_id: newFormId.trim() }),
    })
    const data = await res.json().catch(() => ({}))
    setConnecting(false)
    if (res.ok) { setConnection(data); setMapping(data.field_mapping ?? []); setDirty(false); setNewFormId(''); setMsg('Connected.'); setMsgIsError(false) }
    else { setMsg(data.error ?? 'Could not connect that form.'); setMsgIsError(true) }
  }

  async function resync() {
    setSaving(true); setMsg(null)
    const res = await fetch('/api/events/stakeholders/hubspot/resync', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_id: eventId, form_type: formType }),
    })
    const data = await res.json().catch(() => ({}))
    setSaving(false)
    if (res.ok) {
      setConnection(data); setMapping(data.field_mapping ?? []); setDirty(false)
      const removed = data.removed_fields as string[] | undefined
      setMsg(removed?.length ? `Re-synced. ${removed.length} field(s) no longer exist on the HubSpot form and were unmapped: ${removed.join(', ')}` : 'Re-synced.')
      setMsgIsError(false)
    } else { setMsg(data.error ?? 'Re-sync failed.'); setMsgIsError(true) }
  }

  async function saveMapping() {
    setSaving(true); setMsg(null)
    const res = await fetch('/api/events/stakeholders/hubspot/mapping', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_id: eventId, form_type: formType, field_mapping: mapping }),
    })
    const data = await res.json().catch(() => ({}))
    setSaving(false)
    if (res.ok) {
      setConnection(data); setDirty(false); setMsg('Mapping saved.'); setMsgIsError(false)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } else { setMsg(data.error ?? 'Save failed.'); setMsgIsError(true) }
  }

  async function disconnect() {
    if (!window.confirm('Disconnect this HubSpot form? The public page will fall back to EventPilot\'s own form until a HubSpot form is connected again.')) return
    setSaving(true)
    const res = await fetch(`/api/events/stakeholders/hubspot/connection?event_id=${eventId}&form_type=${formType}`, { method: 'DELETE' })
    setSaving(false)
    if (res.ok) { setConnection(null); setMapping([]); setDirty(false); setMsg('Disconnected.'); setMsgIsError(false) }
    else setMsg('Could not disconnect — please try again.')
  }

  async function createWorkflow() {
    setCreatingWorkflow(true); setMsg(null)
    const res = await fetch('/api/events/stakeholders/hubspot/workflow', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_id: eventId, form_type: formType }),
    })
    const data = await res.json().catch(() => ({}))
    setCreatingWorkflow(false)
    if (res.ok) {
      setConnection(prev => prev ? { ...prev, hubspot_workflow_id: data.hubspot_workflow_id, hubspot_workflow_created_at: new Date().toISOString() } : prev)
      setMsg('Automatic sync is on — submissions to this form will now flow into EventPilot on their own.')
      setMsgIsError(false)
    } else { setMsg(data.error ?? 'Could not set up automatic sync.'); setMsgIsError(true) }
  }

  const crmPropertyKeySet = new Set(crmProperties.map(p => p.property_key))

  if (!valid) {
    return <div style={{ padding: '32px', fontSize: '13px', color: 'var(--red)' }}>Unknown form type.</div>
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--surface)' }}>
      <PageHeader
        eyebrow={cameFromIntegrations ? 'Integrations / Connect HubSpot Form' : 'Stakeholder Hub / Connect HubSpot Form'}
        title={FORM_TITLES[formType as FormType]}
        description="Connect the HubSpot form your team already built for this event, and map its fields so submissions flow into the Submissions Inbox."
        backHref={cameFromIntegrations ? `/admin/events/${eventId}/integrations#hubspot` : `/admin/events/${eventId}/stakeholders`}
        backLabel={cameFromIntegrations ? 'Back to Integrations' : 'Back to Stakeholder Hub'}
      />

      <div style={{ padding: '24px 32px', maxWidth: '900px' }}>
        {!canManage && !loading && (
          <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'var(--amber-light)', border: '1px solid var(--amber-border)', color: 'var(--ink2)', fontSize: '12.5px', marginBottom: '16px' }}>
            You can view this connection but don&apos;t have permission to manage it.
          </div>
        )}
        {msg && (
          <div style={{
            padding: '10px 14px', borderRadius: '8px', marginBottom: '16px', fontSize: '12.5px',
            background: msgIsError ? 'var(--red-light)' : 'var(--success-light)',
            border: `1px solid ${msgIsError ? 'var(--red-border)' : 'color-mix(in srgb, var(--success) 40%, transparent)'}`,
            color: msgIsError ? 'var(--red)' : 'var(--success)',
          }}>
            {msg}
          </div>
        )}

        {loading ? (
          <div style={{ fontSize: '13px', color: 'var(--ink3)' }}>Loading…</div>
        ) : !connection ? (
          <Card padded style={{ overflow: 'visible' }}>
            <div style={{ fontSize: '13px', color: 'var(--ink3)', marginBottom: '14px' }}>
              No HubSpot form is connected for this event yet. Pick the form your team already built from the list below.
            </div>
            {canManage && (
              <>
                {formsError ? (
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <div style={{ flex: 1, fontSize: '12.5px', color: 'var(--red)', alignSelf: 'center' }}>{formsError} You can still paste a Form ID directly below.</div>
                  </div>
                ) : formsLoading || availableForms === null ? (
                  <div style={{ fontSize: '12.5px', color: 'var(--ink3)' }}>Loading forms from HubSpot…</div>
                ) : (
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <div style={{ flex: 1 }}>
                      <SearchableSelect
                        options={availableForms.map(f => ({ id: f.id, label: f.name }))}
                        value={newFormId}
                        onChange={setNewFormId}
                        placeholder={`Type to search ${availableForms.length} forms…`}
                      />
                    </div>
                    <Button variant="lime" onClick={connect} disabled={connecting || !newFormId}>{connecting ? 'Connecting…' : 'Connect'}</Button>
                  </div>
                )}
                {(formsError || (availableForms !== null && availableForms.length === 0)) && (
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <Input value={newFormId} onChange={e => setNewFormId(e.target.value)} placeholder="HubSpot Form ID" style={{ flex: 1 }} />
                    <Button variant="lime" onClick={connect} disabled={connecting || !newFormId.trim()}>{connecting ? 'Connecting…' : 'Fetch & Connect'}</Button>
                  </div>
                )}
              </>
            )}
          </Card>
        ) : (
          <>
            {formNameLooksMismatched(connection.hubspot_form_name, formType as FormType) && (
              <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'var(--amber-light)', border: '1px solid var(--amber-border)', color: 'var(--ink2)', fontSize: '12.5px', marginBottom: '16px' }}>
                This form&apos;s name (&quot;{connection.hubspot_form_name}&quot;) suggests it may not be a {FORM_TITLES[formType as FormType].toLowerCase()} form — double-check it&apos;s connected under the right category.
              </div>
            )}
            <Card padded>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--ink)' }}>{connection.hubspot_form_name || connection.hubspot_form_id}</div>
                  <div style={{ fontSize: '11px', color: 'var(--ink4)' }}>Form ID: {connection.hubspot_form_id} · Last synced {connection.fields_synced_at ? new Date(connection.fields_synced_at).toLocaleString() : 'never'}</div>
                </div>
                {canManage && (
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <Button variant="ghost" onClick={resync} disabled={saving}>Re-sync from HubSpot</Button>
                    <Button variant="red" onClick={disconnect} disabled={saving}>Disconnect</Button>
                  </div>
                )}
              </div>
            </Card>

            {/* Automatic Sync (2026-09-20, Madhu) — the HubSpot Workflow
                (Form submission trigger -> Send a webhook action) that
                actually delivers submissions to EventPilot used to be a
                manual, click-through-HubSpot's-own-UI step per connected
                form, done outside this app entirely and easy to forget
                (exactly what happened live for AI InfraNext Indonesia
                2026's speaker form: fully mapped, zero submissions
                arriving, no way to tell short of noticing the silence).
                hubspot_workflow_id null covers both "never set up" and
                "built by hand in HubSpot before this button existed" —
                either way there's nothing here for EventPilot to manage,
                so the copy stays neutral rather than claiming "off." */}
            <Card padded color={connection.hubspot_workflow_id ? 'teal' : 'amber'} style={{ marginTop: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px' }}>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--ink)' }}>
                    {connection.hubspot_workflow_id ? 'Automatic sync is on' : 'Automatic sync'}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--ink3)', marginTop: '4px', maxWidth: '520px' }}>
                    {connection.hubspot_workflow_id
                      ? `Submissions to this form flow into EventPilot on their own — no manual HubSpot setup step. Workflow ID ${connection.hubspot_workflow_id}.`
                      : 'Creates the HubSpot Workflow that delivers submissions from this form to EventPilot — otherwise nothing arrives here even though the field mapping above is saved. One click, per form, done once.'}
                  </div>
                </div>
                {canManage && !connection.hubspot_workflow_id && (
                  <Button variant="teal" onClick={createWorkflow} disabled={creatingWorkflow}>
                    {creatingWorkflow ? 'Setting up…' : 'Set Up Automatic Sync'}
                  </Button>
                )}
              </div>
            </Card>

            <div style={{ marginTop: '16px', display: 'grid', gap: '8px' }}>
              {(connection.cached_fields ?? []).map((f: HubSpotFormField) => {
                const m = mapping.find(x => x.hubspot_field_name === f.name)
                const type = targetType(m)
                return (
                  <Card key={f.name} padded>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 200px 200px', gap: '10px', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink)' }}>{f.label || f.name}</div>
                        <div style={{ fontSize: '10.5px', color: 'var(--ink4)' }}>{f.name} · {f.fieldType}{f.required ? ' · required' : ''}</div>
                        {f.dependsOn && (
                          <div style={{ fontSize: '10.5px', color: 'var(--amber)', marginTop: '2px' }}>
                            Only shown if &quot;{f.dependsOn.parentLabel}&quot; = {f.dependsOn.values.join(' or ')} — not always collected
                          </div>
                        )}
                      </div>
                      <Select
                        disabled={!canManage}
                        value={type}
                        onChange={e => {
                          const t = e.target.value
                          if (t === 'concept') updateTarget(f.name, f.label, { type: 'concept', key: conceptFields[0]?.key ?? '' })
                          else if (t === 'asset') updateTarget(f.name, f.label, { type: 'asset', role: 'photo' })
                          else if (t === 'sensitive_document') updateTarget(f.name, f.label, { type: 'sensitive_document', document_type: 'passport' })
                          else if (t === 'crm_property') {
                            const first = crmProperties[0]
                            updateTarget(f.name, f.label, first ? { type: 'crm_property', entity_type: first.entity_type, property_key: first.property_key } : { type: 'custom' })
                          }
                          else updateTarget(f.name, f.label, { type: 'custom' })
                        }}
                      >
                        {TARGET_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </Select>
                      {type === 'crm_property' && (
                        <Select disabled={!canManage}
                          value={m?.target.type === 'crm_property' ? crmPropertyOptionValue(m.target.entity_type, m.target.property_key) : ''}
                          onChange={e => {
                            const [entityType, propertyKey] = e.target.value.split(':') as ['contact' | 'company', string]
                            updateTarget(f.name, f.label, { type: 'crm_property', entity_type: entityType, property_key: propertyKey })
                          }}>
                          {crmProperties.length === 0 && <option value="">No CRM properties yet — create one in CRM Admin</option>}
                          {crmProperties.map(p => (
                            <option key={p.id} value={crmPropertyOptionValue(p.entity_type, p.property_key)}>
                              {p.entity_type === 'contact' ? 'Contact' : 'Company'}: {p.label}
                            </option>
                          ))}
                        </Select>
                      )}
                      {type === 'concept' && (() => {
                        const selectedKey = m?.target.type === 'concept' ? m.target.key : ''
                        // Excludes any key that already has a matching CRM
                        // property (2026-09-19, Madhu: "shouldn't show other
                        // fields... which clearly belong to CRM Properties").
                        // Once a key is reachable via "CRM property" (which
                        // also dual-writes the plain key — see the webhook
                        // route's own comment), offering it here too just
                        // invites a second, unrelated HubSpot field silently
                        // colliding with it. The currently-selected key is
                        // always kept visible even if it'd otherwise be
                        // filtered, so an existing valid mapping never
                        // disappears out from under a producer.
                        const available = conceptFields.filter(cf => cf.key === selectedKey || !crmPropertyKeySet.has(cf.key))
                        return (
                          <Select disabled={!canManage} value={selectedKey}
                            onChange={e => {
                              const v = e.target.value
                              if (v === CREATE_NEW_FIELD) { setFieldDraft(draftFromHubSpotField(f)); setCreatingFor(f.name) }
                              else updateTarget(f.name, f.label, { type: 'concept', key: v })
                            }}>
                            <optgroup label={PROPERTY_TITLES[formType as FormType]}>
                              {available.filter(cf => !sharedKeys.has(cf.key)).map(cf => <option key={cf.key} value={cf.key}>{cf.label}</option>)}
                            </optgroup>
                            {available.some(cf => sharedKeys.has(cf.key)) && (
                              <optgroup label="Event Properties (shared)">
                                {available.filter(cf => sharedKeys.has(cf.key)).map(cf => <option key={cf.key} value={cf.key}>{cf.label}</option>)}
                              </optgroup>
                            )}
                            {canManage && <option value={CREATE_NEW_FIELD}>+ Create new field…</option>}
                          </Select>
                        )
                      })()}
                      {type === 'asset' && (
                        <Select disabled={!canManage} value={m?.target.type === 'asset' ? m.target.role : 'photo'}
                          onChange={e => updateTarget(f.name, f.label, { type: 'asset', role: e.target.value as 'photo' | 'company_logo' | 'logo' | 'bio_full' })}>
                          {ASSET_ROLE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </Select>
                      )}
                      {type === 'sensitive_document' && (
                        <Select disabled={!canManage} value={m?.target.type === 'sensitive_document' ? m.target.document_type : 'passport'}
                          onChange={e => updateTarget(f.name, f.label, { type: 'sensitive_document', document_type: e.target.value as 'passport' | 'national_id' })}>
                          {SENSITIVE_DOCUMENT_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </Select>
                      )}
                    </div>
                    {creatingFor === f.name && (
                      <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--border-light)' }}>
                        <AddFieldForm
                          draft={fieldDraft}
                          setDraft={setFieldDraft}
                          typeOptions={CONCEPT_TYPE_OPTIONS}
                          confirmLabel={creatingField ? 'Creating…' : 'Create Field'}
                          onCancel={() => { setCreatingFor(null); setFieldDraft(EMPTY_FIELD_DRAFT) }}
                          onConfirm={() => createField(f)}
                        />
                      </div>
                    )}
                  </Card>
                )
              })}
              {(connection.cached_fields ?? []).length === 0 && (
                <div style={{ fontSize: '12.5px', color: 'var(--ink3)' }}>This HubSpot form has no fields, or they haven&apos;t been fetched yet — try Re-sync.</div>
              )}
            </div>

            {canManage && (
              <div style={{ marginTop: '16px', display: 'flex', gap: '8px' }}>
                <Button variant="lime" onClick={saveMapping} disabled={saving || !dirty}>{saving ? 'Saving…' : 'Save Mapping'}</Button>
              </div>
            )}

            <div style={{ marginTop: '20px' }}>
              <Card padded>
                <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--ink3)', letterSpacing: '0.6px', textTransform: 'uppercase', marginBottom: '8px' }}>Embed Reference</div>
                <div style={{ fontSize: '11.5px', color: 'var(--ink3)' }}>
                  This form is embedded automatically on the public onboarding page for this event — nothing to paste anywhere. Reference only:
                </div>
                <pre style={{ fontSize: '11px', color: 'var(--ink3)', whiteSpace: 'pre-wrap', margin: '8px 0 0' }}>
{`hbspt.forms.create({ portalId: '<HUBSPOT_PORTAL_ID>', formId: '${connection.hubspot_form_id}', target: '#hs-form-target' })`}
                </pre>
              </Card>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

