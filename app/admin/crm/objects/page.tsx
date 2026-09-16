'use client'

import { useState, useEffect, useCallback } from 'react'
import PageHeader from '@/app/components/PageHeader'
import { Button, Card, Input, Select } from '@/app/components/ui'

type EntityType = 'contact' | 'company'
type PropertyGroup = { id: string; entity_type: EntityType; key: string; label: string; order_index: number }
type Property = {
  id: string; entity_type: EntityType; property_key: string; label: string; field_type: string
  group_id: string | null; options: string[]; is_required: boolean; hubspot_property_name: string | null
  crm_property_groups: PropertyGroup | null
}

const FIELD_TYPE_OPTIONS = [
  { value: 'text', label: 'Single-line text' },
  { value: 'textarea', label: 'Multi-line text' },
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Phone' },
  { value: 'url', label: 'URL' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
  { value: 'select', label: 'Dropdown' },
  { value: 'checkbox', label: 'Checkbox' },
]

/* CRM Admin — Properties manager, structurally mirroring HubSpot's own
   Settings -> Properties screen: object picker -> grouped property table ->
   create-property flow. The real, working version of what SmartData's
   sd_properties tried to be (confirmed dead code there). */

export default function CrmObjectsPage() {
  const [entityType, setEntityType] = useState<EntityType>('contact')
  const [groups, setGroups] = useState<PropertyGroup[]>([])
  const [properties, setProperties] = useState<Property[]>([])
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState<string | null>(null)
  const [msgIsError, setMsgIsError] = useState(false)

  const [showAddProperty, setShowAddProperty] = useState(false)
  const [newLabel, setNewLabel] = useState('')
  const [newFieldType, setNewFieldType] = useState('text')
  const [newGroupId, setNewGroupId] = useState('')
  const [newGroupLabel, setNewGroupLabel] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async (type: EntityType) => {
    setLoading(true)
    const [propsRes, groupsRes] = await Promise.all([
      fetch(`/api/crm/properties?entity_type=${type}`).then(r => r.json()).catch(() => []),
      fetch(`/api/crm/property-groups?entity_type=${type}`).then(r => r.json()).catch(() => []),
    ])
    setProperties(Array.isArray(propsRes) ? propsRes : [])
    setGroups(Array.isArray(groupsRes) ? groupsRes : [])
    setLoading(false)
  }, [])

  useEffect(() => { load(entityType) }, [entityType, load])

  async function addProperty() {
    if (!newLabel.trim()) { setMsg('Label required.'); setMsgIsError(true); return }
    setSaving(true); setMsg(null)

    let groupId = newGroupId || null
    if (!groupId && newGroupLabel.trim()) {
      const gRes = await fetch('/api/crm/property-groups', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entity_type: entityType, label: newGroupLabel.trim() }),
      })
      const gData = await gRes.json().catch(() => ({}))
      if (gRes.ok) groupId = gData.id
    }

    const res = await fetch('/api/crm/properties', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entity_type: entityType, label: newLabel.trim(), field_type: newFieldType, group_id: groupId }),
    })
    const data = await res.json().catch(() => ({}))
    setSaving(false)
    if (res.ok) {
      setMsg(`Property "${newLabel.trim()}" created.`); setMsgIsError(false)
      setNewLabel(''); setNewFieldType('text'); setNewGroupId(''); setNewGroupLabel(''); setShowAddProperty(false)
      load(entityType)
    } else {
      setMsg(data.error ?? 'Could not create property.'); setMsgIsError(true)
    }
  }

  async function deleteProperty(id: string, label: string) {
    if (!window.confirm(`Delete property "${label}"? This does not affect any data already stored under it.`)) return
    const res = await fetch(`/api/crm/properties/${id}`, { method: 'DELETE' })
    if (res.ok) load(entityType)
    else setMsg('Could not delete — please try again.')
  }

  const ungroupedLabel = 'Ungrouped'
  const grouped = new Map<string, Property[]>()
  for (const p of properties) {
    const key = p.crm_property_groups?.label ?? ungroupedLabel
    if (!grouped.has(key)) grouped.set(key, [])
    grouped.get(key)!.push(p)
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--surface)' }}>
      <PageHeader
        eyebrow="CRM Admin / Properties"
        title="Properties"
        description='Manage the Contact/Company property registry — these appear as "CRM property" mapping targets on every event’s HubSpot form-connection page.'
        backHref="/admin/crm"
        backLabel="Back to CRM Admin"
      />
      <div style={{ padding: '24px 32px', maxWidth: '900px' }}>
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

        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
          {(['contact', 'company'] as EntityType[]).map(t => (
            <Button key={t} variant={entityType === t ? 'lime' : 'ghost'} onClick={() => setEntityType(t)}>
              {t === 'contact' ? 'Contact properties' : 'Company properties'}
            </Button>
          ))}
        </div>

        {loading ? (
          <div style={{ fontSize: '13px', color: 'var(--ink3)' }}>Loading…</div>
        ) : (
          <>
            {[...grouped.entries()].map(([groupLabel, props]) => (
              <div key={groupLabel} style={{ marginBottom: '12px' }}>
                <Card padded>
                  <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--ink3)', letterSpacing: '0.6px', textTransform: 'uppercase', marginBottom: '10px' }}>{groupLabel}</div>
                  <div style={{ display: 'grid', gap: '6px' }}>
                    {props.map(p => (
                      <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderTop: '1px solid var(--border-light)' }}>
                        <div>
                          <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink)' }}>{p.label}{p.is_required && <span style={{ color: 'var(--red)' }}> *</span>}</div>
                          <div style={{ fontSize: '10.5px', color: 'var(--ink4)' }}>{p.property_key} · {p.field_type}</div>
                        </div>
                        <Button variant="ghost" onClick={() => deleteProperty(p.id, p.label)}>Delete</Button>
                      </div>
                    ))}
                  </div>
                </Card>
              </div>
            ))}
            {properties.length === 0 && (
              <div style={{ fontSize: '12.5px', color: 'var(--ink3)', marginBottom: '12px' }}>No {entityType} properties yet.</div>
            )}

            {!showAddProperty ? (
              <Button variant="lime" onClick={() => setShowAddProperty(true)}>+ Create Property</Button>
            ) : (
              <Card padded>
                <div style={{ display: 'grid', gap: '10px', gridTemplateColumns: '1fr 1fr' }}>
                  <Input placeholder="Label (e.g. Job Title)" value={newLabel} onChange={e => setNewLabel(e.target.value)} />
                  <Select value={newFieldType} onChange={e => setNewFieldType(e.target.value)}>
                    {FIELD_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </Select>
                  <Select value={newGroupId} onChange={e => setNewGroupId(e.target.value)}>
                    <option value="">No group</option>
                    {groups.map(g => <option key={g.id} value={g.id}>{g.label}</option>)}
                  </Select>
                  <Input placeholder="Or create a new group…" value={newGroupLabel} onChange={e => setNewGroupLabel(e.target.value)} disabled={!!newGroupId} />
                </div>
                <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                  <Button variant="lime" onClick={addProperty} disabled={saving}>{saving ? 'Creating…' : 'Create Property'}</Button>
                  <Button variant="ghost" onClick={() => setShowAddProperty(false)} disabled={saving}>Cancel</Button>
                </div>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  )
}
