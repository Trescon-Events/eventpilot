'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button, Card, Input } from '@/app/components/ui'

/* "Client approval — badge printing" (2026-10-21). For events where the client signs off speaker badges before they are printed: an on/off switch and
   the client's approvers (any one of them is enough). Lives once per umbrella (the umbrella's Event Details page); an event follows its umbrella
   unless it is set up separately. A standalone event just uses its own list. Separate from the announcement "Client Approval Contacts". */

type Contact = { name: string; email: string }
type EventData = { kind: 'event'; required: boolean; setting: boolean | null; umbrella: { id: string; name: string; enabled: boolean } | null; own_contacts: Contact[]; umbrella_contacts: Contact[]; contacts_from: string }
type UmbrellaData = { kind: 'umbrella'; umbrella: { id: string; name: string }; enabled: boolean; contacts: Contact[] }

const label: React.CSSProperties = { fontSize: '12px', fontWeight: 700, color: 'var(--ink3)', marginBottom: '4px' }

function ContactList({ value, onChange, disabled }: { value: Contact[]; onChange: (v: Contact[]) => void; disabled: boolean }) {
  return (
    <div style={{ display: 'grid', gap: '8px' }}>
      {value.map((c, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr auto', gap: '8px', alignItems: 'center' }}>
          <Input value={c.name} disabled={disabled} placeholder="Name" onChange={e => onChange(value.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
          <Input value={c.email} disabled={disabled} placeholder="Email" onChange={e => onChange(value.map((x, j) => (j === i ? { ...x, email: e.target.value } : x)))} />
          {!disabled && <Button variant="ghost" onClick={() => onChange(value.filter((_, j) => j !== i))}>Remove</Button>}
        </div>
      ))}
      {!disabled && <div><Button variant="ghost" onClick={() => onChange([...value, { name: '', email: '' }])}>+ Add approver</Button></div>}
    </div>
  )
}

export default function BadgeApprovalCard({ scope, id, canManage = true }: { scope: 'event' | 'umbrella'; id: string; canManage?: boolean }) {
  const q = scope === 'umbrella' ? `umbrella_id=${id}` : `event_id=${id}`
  const [data, setData] = useState<EventData | UmbrellaData | null>(null)
  const [enabled, setEnabled] = useState(false)        // umbrella: on/off; event: its own on/off when overriding
  const [override, setOverride] = useState(false)      // event only: set up separately from the umbrella
  const [contacts, setContacts] = useState<Contact[]>([])
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)

  const load = useCallback(async () => {
    const res = await fetch(`/api/events/badges/client-approval-settings?${q}`)
    const d = await res.json().catch(() => ({}))
    if (!res.ok) { setMsg({ text: d.error ?? 'Could not load.', ok: false }); return }
    setData(d)
    if (d.kind === 'umbrella') { setEnabled(d.enabled); setContacts(d.contacts) }
    else {
      const separate = d.setting !== null || d.own_contacts.length > 0 || !d.umbrella
      setOverride(separate)
      setEnabled(d.setting ?? (d.umbrella ? d.umbrella.enabled : false))
      setContacts(d.own_contacts.length ? d.own_contacts : d.umbrella ? [] : [])
    }
  }, [q])
  // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load
  useEffect(() => { void load() }, [load])

  async function save() {
    setSaving(true); setMsg(null)
    const body = scope === 'umbrella'
      ? { umbrella_id: id, enabled, contacts }
      : override ? { event_id: id, setting: enabled, contacts } : { event_id: id, setting: null, contacts: [] }
    const res = await fetch('/api/events/badges/client-approval-settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const d = await res.json().catch(() => ({}))
    setSaving(false)
    if (!res.ok) { setMsg({ text: d.error ?? 'Could not save.', ok: false }); return }
    setMsg({ text: 'Saved.', ok: true }); await load()
  }

  if (!data) return <Card padded><div style={{ fontSize: '13px', color: 'var(--ink3)' }}>{msg?.text ?? 'Loading…'}</div></Card>
  const ev = data.kind === 'event' ? data : null
  const inherits = !!ev && !!ev.umbrella && !override

  return (
    <Card padded>
      <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--ink)', marginBottom: '4px' }}>Client approval — badge printing</div>
      <div style={{ fontSize: '12.5px', color: 'var(--ink3)', lineHeight: 1.6, marginBottom: '14px' }}>
        {scope === 'umbrella'
          ? `When this is on, speaker badges for every event in ${data.kind === 'umbrella' ? data.umbrella.name : 'this umbrella'} go to the client for approval before the print file is built. The producer reviews the artwork, sends the batch, and the client approves from a private link (no login). Only ONE of the approvers below needs to act; the others then see what was decided. Each event can still be set up separately on its own Integrations page.`
          : 'When this is on, the producer sends the badge batch to the client for approval before the print file is built. The client approves from a private link (no login). Only ONE of the approvers needs to act.'}
      </div>

      {ev && ev.umbrella && (
        <div style={{ marginBottom: '14px', display: 'grid', gap: '6px' }}>
          <label style={{ display: 'flex', gap: '8px', fontSize: '13px', color: 'var(--ink2)', cursor: canManage ? 'pointer' : 'default' }}>
            <input type="radio" checked={!override} disabled={!canManage} onChange={() => setOverride(false)} />
            <span>Use {ev.umbrella.name}&rsquo;s settings — client approval is <strong>{ev.umbrella.enabled ? 'on' : 'off'}</strong>{ev.umbrella_contacts.length ? `, ${ev.umbrella_contacts.length} approver${ev.umbrella_contacts.length === 1 ? '' : 's'}: ${ev.umbrella_contacts.map(c => c.name).join(', ')}` : ', no approvers added yet'}</span>
          </label>
          <label style={{ display: 'flex', gap: '8px', fontSize: '13px', color: 'var(--ink2)', cursor: canManage ? 'pointer' : 'default' }}>
            <input type="radio" checked={override} disabled={!canManage} onChange={() => setOverride(true)} />
            <span>Set up separately for this event</span>
          </label>
        </div>
      )}

      {!inherits && (
        <>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13.5px', fontWeight: 700, color: 'var(--ink)', marginBottom: '12px', cursor: canManage ? 'pointer' : 'default' }}>
            <input type="checkbox" checked={enabled} disabled={!canManage} onChange={e => setEnabled(e.target.checked)} />
            Speaker badges need client approval
          </label>
          <div style={label}>Client approvers (any one of them is enough)</div>
          <ContactList value={contacts} onChange={setContacts} disabled={!canManage} />
          {enabled && contacts.filter(c => c.email.trim()).length === 0 && <div style={{ fontSize: '12.5px', color: 'var(--amber)', marginTop: '8px' }}>Add at least one approver, or the producer won’t be able to send a batch.</div>}
        </>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '14px' }}>
        {canManage && <Button variant="teal" onClick={() => void save()} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>}
        {msg && <span style={{ fontSize: '12.5px', color: msg.ok ? 'var(--success)' : 'var(--red)' }}>{msg.text}</span>}
      </div>
    </Card>
  )
}
