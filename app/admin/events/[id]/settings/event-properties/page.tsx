'use client'

import { useState, useEffect, use } from 'react'
import PageHeader from '@/app/components/PageHeader'
import { permissionSetSatisfies } from '@/app/lib/access/permission-match'
import { Button, Card } from '@/app/components/ui'
import { FieldSchema } from '@/app/lib/forms/types'
import { AddFieldForm, NewFieldDraft, EMPTY_FIELD_DRAFT, FIELD_TYPE_OPTIONS, buildFieldFromDraft } from '@/app/components/forms/AddFieldForm'

/* Event Properties (2026-09-19, Madhu) — a genuinely shared, type-agnostic
   pool of this event's own custom fields (event_properties table),
   available to speaker/sponsor/media_partner/association_partner alike
   without redefining the same field per type — the same relationship
   CRM Admin's global Properties has to "contact vs company", just scoped
   to this one event instead of cross-event. Deliberately NOT the same
   thing as CRM Admin (global, HubSpot-synced, cross-event) or the
   per-type Properties page (event_form_schemas, type-specific baseline
   fields) — see resolve-schema.ts's merge logic for exactly how these
   three coexist. */

const PROPERTY_TYPE_OPTIONS = FIELD_TYPE_OPTIONS.filter(o => o.type !== 'file')

type EventProperty = {
  id: string; key: string; label: string; type: string; required: boolean; options: string[]; order_index: number
}

export default function EventPropertiesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = use(params)

  const [permissions, setPermissions] = useState<Set<string>>(new Set())
  const [properties, setProperties] = useState<EventProperty[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState<NewFieldDraft>(EMPTY_FIELD_DRAFT)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)

  const can = (key: string) => permissionSetSatisfies(permissions, key)
  const canManage = can('sae.forms.manage')

  async function load() {
    const [permRes, propsRes] = await Promise.all([
      fetch(`/api/events/access/me?event_id=${eventId}`).then(r => r.json()).catch(() => ({ permissions: [] })),
      fetch(`/api/events/event-properties?event_id=${eventId}`).then(r => r.json()).catch(() => ({ properties: [] })),
    ])
    setPermissions(new Set(permRes.permissions ?? []))
    setProperties(propsRes.properties ?? [])
    setLoading(false)
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load() is stable for mount-only fetch
    load()
  }, [eventId])

  async function addProperty() {
    const asFieldSchema: FieldSchema[] = properties.map(p => ({ id: p.id, key: p.key, label: p.label, type: p.type as FieldSchema['type'], required: p.required, locked: false }))
    const result = buildFieldFromDraft(draft, asFieldSchema)
    if (typeof result === 'string') { setMsg({ text: result, ok: false }); return }
    setSaving(true); setMsg(null)
    const res = await fetch('/api/events/event-properties', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_id: eventId, key: result.key, label: result.label, type: result.type, required: result.required, options: result.options ?? [] }),
    })
    const data = await res.json().catch(() => ({}))
    setSaving(false)
    if (res.ok) {
      setProperties(prev => [...prev, data])
      setAdding(false); setDraft(EMPTY_FIELD_DRAFT)
      setMsg({ text: `Property "${data.label}" created.`, ok: true })
    } else {
      setMsg({ text: data.error ?? 'Could not create property.', ok: false })
    }
  }

  async function deleteProperty(p: EventProperty) {
    if (!window.confirm(`Delete "${p.label}"? Any data already stored under this key on speaker/sponsor/etc. records is kept, just no longer editable through this list.`)) return
    const res = await fetch(`/api/events/event-properties/${p.id}`, { method: 'DELETE' })
    if (res.ok) setProperties(prev => prev.filter(x => x.id !== p.id))
    else setMsg({ text: 'Could not delete property.', ok: false })
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--surface)' }}>
      <PageHeader
        eyebrow="Event Workspace / Settings"
        title="Event Properties"
        description="Custom fields local to this event, shared across every stakeholder type — no need to recreate the same field separately for Speaker, Sponsor, Media Partner, or Association Partner."
        backHref={`/admin/events/${eventId}`}
        backLabel="Back to Event Workspace"
      />

      <div style={{ padding: '24px 32px', maxWidth: '760px' }}>
        <div style={{ padding: '12px 16px', borderRadius: '8px', background: 'var(--surface2)', border: '1px solid var(--border)', fontSize: '12.5px', color: 'var(--ink3)', marginBottom: '20px' }}>
          <strong style={{ color: 'var(--ink)' }}>What this is:</strong> a property created here (e.g. a Passport upload, or a question specific to this event) becomes available to <em>any</em> stakeholder type&apos;s form on this event — it just shows up as an option wherever &quot;EventPilot field&quot; is offered (the manual Add/Edit panel, the HubSpot field-mapping page). It&apos;s <strong>not</strong> the same as CRM Admin&apos;s Properties (that registry is global, shared across every event, and syncs with HubSpot) — these stay local to this one event only.
        </div>

        {msg && (
          <div style={{
            padding: '10px 14px', borderRadius: '8px', marginBottom: '16px', fontSize: '12.5px',
            background: msg.ok ? 'var(--success-light)' : 'var(--red-light)',
            border: `1px solid ${msg.ok ? 'color-mix(in srgb, var(--success) 40%, transparent)' : 'var(--red-border)'}`,
            color: msg.ok ? 'var(--success)' : 'var(--red)',
          }}>
            {msg.text}
          </div>
        )}

        {loading ? (
          <div style={{ fontSize: '13px', color: 'var(--ink3)' }}>Loading…</div>
        ) : (
          <>
            <div style={{ display: 'grid', gap: '8px', marginBottom: '16px' }}>
              {properties.length === 0 && (
                <div style={{ fontSize: '13px', color: 'var(--ink4)' }}>No shared properties created for this event yet.</div>
              )}
              {properties.map(p => (
                <Card key={p.id} padded>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink)' }}>
                        {p.label}{p.required && <span style={{ color: 'var(--amber)', fontWeight: 600 }}> · required</span>}
                      </div>
                      <div style={{ fontSize: '10.5px', color: 'var(--ink4)' }}>{p.key} · {PROPERTY_TYPE_OPTIONS.find(o => o.type === p.type)?.label ?? p.type}</div>
                    </div>
                    {canManage && <Button variant="red" onClick={() => deleteProperty(p)}>Delete</Button>}
                  </div>
                </Card>
              ))}
            </div>

            {canManage && !adding && (
              <Button variant="lime" onClick={() => setAdding(true)}>+ Add Property</Button>
            )}
            {canManage && adding && (
              <Card padded>
                <AddFieldForm
                  draft={draft}
                  setDraft={setDraft}
                  typeOptions={PROPERTY_TYPE_OPTIONS}
                  confirmLabel={saving ? 'Creating…' : 'Create Property'}
                  onCancel={() => { setAdding(false); setDraft(EMPTY_FIELD_DRAFT); setMsg(null) }}
                  onConfirm={addProperty}
                />
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  )
}
