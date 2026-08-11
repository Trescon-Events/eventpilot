'use client'

import { useState, useEffect, use } from 'react'
import Link from 'next/link'
import PageHeader from '@/app/components/PageHeader'
import { Button, Card, Input, Select } from '@/app/components/ui'
import { FormType, FORM_TYPES, FORM_TITLES, FieldSchema } from '@/app/lib/forms/types'
import { HubSpotFieldMapping, HubSpotFormField, EventHubSpotForm } from '@/app/lib/hubspot/types'

/* Connect a HubSpot form to this event+form_type, inspect its real fields
   via the HubSpot API, and map each one to an EventPilot concept — Phase A
   of the HubSpot Forms integration, superseding the custom Form Builder
   (app/admin/events/[id]/stakeholders/form-builder/[formType]/page.tsx,
   left in place/untouched) as the active path for onboarding forms.
   Once connected, the public page (app/public/forms/[event_id]/[form_type])
   embeds HubSpot's own form instead of rendering our own fields. */

const TARGET_TYPE_OPTIONS = [
  { value: 'concept', label: 'EventPilot field' },
  { value: 'asset', label: 'Photo / logo asset' },
  { value: 'secure_document', label: 'Secure document (passport/ID)' },
  { value: 'custom', label: "Store as extra data (don't map)" },
]

const ASSET_ROLE_OPTIONS = [
  { value: 'photo', label: 'Speaker Photo' },
  { value: 'company_logo', label: 'Company Logo (speaker)' },
  { value: 'logo', label: 'Partner Logo' },
]

const SECURE_ROLE_OPTIONS = [
  { value: 'passport', label: 'Passport Copy' },
  { value: 'national_id', label: 'National ID' },
  { value: 'other_document', label: 'Other Secure Document' },
]

function targetType(m: HubSpotFieldMapping | undefined): string {
  return m?.target?.type ?? 'custom'
}

export default function HubSpotFormConnectPage({ params }: { params: Promise<{ id: string; formType: string }> }) {
  const { id: eventId, formType } = use(params)
  const valid = FORM_TYPES.includes(formType as FormType)

  const [permissions, setPermissions] = useState<Set<string>>(new Set())
  const [connection, setConnection] = useState<EventHubSpotForm | null>(null)
  const [conceptFields, setConceptFields] = useState<FieldSchema[]>([])
  const [mapping, setMapping] = useState<HubSpotFieldMapping[]>([])
  const [loading, setLoading] = useState(valid)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [msgIsError, setMsgIsError] = useState(false)
  const [newFormId, setNewFormId] = useState('')
  const [connecting, setConnecting] = useState(false)

  const can = (key: string) => permissions.has('*') || permissions.has(key)
  const canManage = can('sae.forms.manage')

  async function loadAll() {
    const [permRes, connRes, schemaRes] = await Promise.all([
      fetch(`/api/events/access/me?event_id=${eventId}`).then(r => r.json()).catch(() => ({ permissions: [] })),
      fetch(`/api/events/stakeholders/hubspot/connection?event_id=${eventId}&form_type=${formType}`).then(r => r.json()).catch(() => null),
      fetch(`/api/events/stakeholders/forms/${formType}/schema?event_id=${eventId}`).then(r => r.json()).catch(() => ({ fields: [] })),
    ])
    setPermissions(new Set(permRes.permissions ?? []))
    setConnection(connRes?.id ? connRes : null)
    setConceptFields((schemaRes.fields ?? []).filter((f: FieldSchema) => f.type !== 'file'))
    setMapping(connRes?.field_mapping ?? [])
  }

  useEffect(() => {
    if (!valid) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-mount; matches stakeholders/page.tsx's fetchAll effect
    setLoading(true)
    loadAll().finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadAll is stable for this effect's purpose (mount + eventId/formType change only)
  }, [eventId, formType, valid])

  function updateTarget(fieldName: string, fieldLabel: string, target: HubSpotFieldMapping['target']) {
    setMapping(prev => {
      const next = prev.filter(m => m.hubspot_field_name !== fieldName)
      next.push({ hubspot_field_name: fieldName, hubspot_label: fieldLabel, target })
      return next
    })
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
    if (res.ok) { setConnection(data); setMapping(data.field_mapping ?? []); setNewFormId(''); setMsg('Connected.'); setMsgIsError(false) }
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
      setConnection(data); setMapping(data.field_mapping ?? [])
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
    if (res.ok) { setConnection(data); setMsg('Mapping saved.'); setMsgIsError(false) }
    else { setMsg(data.error ?? 'Save failed.'); setMsgIsError(true) }
  }

  async function disconnect() {
    if (!window.confirm('Disconnect this HubSpot form? The public page will fall back to EventPilot\'s own form until a HubSpot form is connected again.')) return
    setSaving(true)
    const res = await fetch(`/api/events/stakeholders/hubspot/connection?event_id=${eventId}&form_type=${formType}`, { method: 'DELETE' })
    setSaving(false)
    if (res.ok) { setConnection(null); setMapping([]); setMsg('Disconnected.'); setMsgIsError(false) }
    else setMsg('Could not disconnect — please try again.')
  }

  if (!valid) {
    return <div style={{ padding: '32px', fontSize: '13px', color: 'var(--red)' }}>Unknown form type.</div>
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--surface)' }}>
      <PageHeader
        eyebrow="Stakeholder Hub / Connect HubSpot Form"
        title={FORM_TITLES[formType as FormType]}
        description="Connect the HubSpot form your team already built for this event, and map its fields so submissions flow into the Submissions Inbox."
        actions={<Link href={`/admin/events/${eventId}/stakeholders`}><Button variant="ghost">← Back to Stakeholder Hub</Button></Link>}
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
          <Card padded>
            <div style={{ fontSize: '13px', color: 'var(--ink3)', marginBottom: '14px' }}>
              No HubSpot form is connected for this event yet. Find the Form ID from the form&apos;s Share tab in HubSpot (or the URL when editing it), and paste it below.
            </div>
            {canManage && (
              <div style={{ display: 'flex', gap: '8px' }}>
                <Input value={newFormId} onChange={e => setNewFormId(e.target.value)} placeholder="HubSpot Form ID" style={{ flex: 1 }} />
                <Button variant="lime" onClick={connect} disabled={connecting}>{connecting ? 'Connecting…' : 'Fetch & Connect'}</Button>
              </div>
            )}
          </Card>
        ) : (
          <>
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
                      </div>
                      <Select
                        disabled={!canManage}
                        value={type}
                        onChange={e => {
                          const t = e.target.value
                          if (t === 'concept') updateTarget(f.name, f.label, { type: 'concept', key: conceptFields[0]?.key ?? '' })
                          else if (t === 'asset') updateTarget(f.name, f.label, { type: 'asset', role: 'photo' })
                          else if (t === 'secure_document') updateTarget(f.name, f.label, { type: 'secure_document', role: 'passport' })
                          else updateTarget(f.name, f.label, { type: 'custom' })
                        }}
                      >
                        {TARGET_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </Select>
                      {type === 'concept' && (
                        <Select disabled={!canManage} value={m?.target.type === 'concept' ? m.target.key : ''}
                          onChange={e => updateTarget(f.name, f.label, { type: 'concept', key: e.target.value })}>
                          {conceptFields.map(cf => <option key={cf.key} value={cf.key}>{cf.label}</option>)}
                        </Select>
                      )}
                      {type === 'asset' && (
                        <Select disabled={!canManage} value={m?.target.type === 'asset' ? m.target.role : 'photo'}
                          onChange={e => updateTarget(f.name, f.label, { type: 'asset', role: e.target.value as 'photo' | 'company_logo' | 'logo' })}>
                          {ASSET_ROLE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </Select>
                      )}
                      {type === 'secure_document' && (
                        <Select disabled={!canManage} value={m?.target.type === 'secure_document' ? m.target.role : 'passport'}
                          onChange={e => updateTarget(f.name, f.label, { type: 'secure_document', role: e.target.value as 'passport' | 'national_id' | 'other_document' })}>
                          {SECURE_ROLE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </Select>
                      )}
                    </div>
                  </Card>
                )
              })}
              {(connection.cached_fields ?? []).length === 0 && (
                <div style={{ fontSize: '12.5px', color: 'var(--ink3)' }}>This HubSpot form has no fields, or they haven&apos;t been fetched yet — try Re-sync.</div>
              )}
            </div>

            {canManage && (
              <div style={{ marginTop: '16px', display: 'flex', gap: '8px' }}>
                <Button variant="lime" onClick={saveMapping} disabled={saving}>{saving ? 'Saving…' : 'Save Mapping'}</Button>
              </div>
            )}

            {mapping.some(m => m.target.type === 'secure_document') && (
              <SecureFolderCard eventId={eventId} canManage={canManage} />
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

// Shown once at least one field is mapped to "Secure document" — where a
// producer points EventPilot at the Drive/OneDrive folder secure documents
// for THIS event should be copied into, using their own connected
// account (see /account/connections). configured_by is whoever saves this,
// so the copy operation always uses that specific person's delegated access.
function SecureFolderCard({ eventId, canManage }: { eventId: string; canManage: boolean }) {
  const [folderUrl, setFolderUrl] = useState('')
  const [existing, setExisting] = useState<{ provider: string; folder_url: string; configured_at: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [msgIsError, setMsgIsError] = useState(false)

  useEffect(() => {
    fetch(`/api/events/stakeholders/secure-folder?event_id=${eventId}`)
      .then(r => r.json())
      .then(d => { if (d?.folder_url) setExisting(d) })
      .finally(() => setLoading(false))
  }, [eventId])

  async function save() {
    if (!folderUrl.trim()) return
    setSaving(true); setMsg(null)
    const res = await fetch('/api/events/stakeholders/secure-folder', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_id: eventId, folder_url: folderUrl.trim() }),
    })
    const data = await res.json().catch(() => ({}))
    setSaving(false)
    if (res.ok) { setExisting(data); setFolderUrl(''); setMsg('Saved.'); setMsgIsError(false) }
    else { setMsg(data.error ?? 'Could not save that folder.'); setMsgIsError(true) }
  }

  return (
    <div style={{ marginTop: '16px' }}>
    <Card padded color="amber">
      <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--amber)', letterSpacing: '0.6px', textTransform: 'uppercase', marginBottom: '8px' }}>Secure Document Folder</div>
      <div style={{ fontSize: '12px', color: 'var(--ink3)', marginBottom: '10px' }}>
        Passport/ID uploads never touch EventPilot&apos;s own storage — they&apos;re copied straight into a Google Drive or Microsoft OneDrive folder you choose, using <strong>your own</strong> connected account (
        <Link href="/account/connections" style={{ color: 'var(--teal-mid)' }}>Connected Accounts</Link>
        ), never a shared credential.
      </div>
      {loading ? (
        <div style={{ fontSize: '12px', color: 'var(--ink3)' }}>Loading…</div>
      ) : existing ? (
        <div style={{ fontSize: '12.5px', color: 'var(--ink2)' }}>
          Currently: {existing.provider === 'google' ? 'Google Drive' : 'Microsoft OneDrive'} — <a href={existing.folder_url} target="_blank" rel="noreferrer" style={{ color: 'var(--teal-mid)' }}>{existing.folder_url}</a>
        </div>
      ) : (
        <div style={{ fontSize: '12.5px', color: 'var(--ink3)' }}>No folder configured yet — documents will queue until one is set.</div>
      )}
      {canManage && (
        <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
          <Input value={folderUrl} onChange={e => setFolderUrl(e.target.value)} placeholder="Paste a Google Drive or OneDrive folder link" style={{ flex: 1 }} />
          <Button variant="lime" onClick={save} disabled={saving}>{saving ? 'Saving…' : existing ? 'Update' : 'Save'}</Button>
        </div>
      )}
      {msg && <div style={{ fontSize: '12px', marginTop: '8px', color: msgIsError ? 'var(--red)' : 'var(--success)' }}>{msg}</div>}
    </Card>
    </div>
  )
}
