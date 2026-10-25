'use client'

import { useState } from 'react'
import { Button, Input } from '@/app/components/ui'
import { notify } from '@/app/lib/ui/notify'

/* The event's CLIENT APPROVERS — an address book (name + email) kept once for the event. Every drop picks from it; adding someone here makes them available to all drops. */
export type Approver = { id: string; name: string; email: string }

export default function ApproverList({ eventId, approvers, canEdit, onChanged }: { eventId: string; approvers: Approver[]; canEdit: boolean; onChanged: () => void | Promise<void> }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [editing, setEditing] = useState<{ id: string; name: string; email: string } | null>(null)
  const [busy, setBusy] = useState(false)

  async function call(url: string, method: string, body?: unknown) {
    setBusy(true)
    const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
    const d = await r.json().catch(() => ({})) as { error?: string }
    setBusy(false)
    if (!r.ok) { notify(d.error ?? 'That did not work.', 'error'); return false }
    await onChanged(); return true
  }
  async function add() {
    if (await call('/api/events/speaker-proposals/approvers', 'POST', { event_id: eventId, name, email })) { setName(''); setEmail(''); notify('Approver added.') }
  }

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: '12px', padding: '18px', background: 'var(--card)', marginBottom: '24px' }}>
      <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--ink)', marginBottom: '4px' }}>Client approvers</div>
      <div style={{ fontSize: '13.5px', color: 'var(--ink3)', marginBottom: '12px' }}>The client’s people who approve or reject speakers. Add them once here; when you create a drop you pick which of them it needs.</div>
      {approvers.length === 0 && <div style={{ fontSize: '14px', color: 'var(--ink3)', marginBottom: '10px' }}>No approvers yet.</div>}
      <div style={{ display: 'grid', gap: '6px', marginBottom: '12px' }}>
        {approvers.map(p => editing?.id === p.id ? (
          <div key={p.id} style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ flex: '1 1 180px' }}><Input value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} /></div>
            <div style={{ flex: '1 1 220px' }}><Input value={editing.email} onChange={e => setEditing({ ...editing, email: e.target.value })} /></div>
            <Button variant="teal" disabled={busy} onClick={async () => { if (await call(`/api/events/speaker-proposals/approvers/${p.id}`, 'PATCH', { name: editing.name, email: editing.email })) setEditing(null) }}>Save</Button>
            <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
          </div>
        ) : (
          <div key={p.id} style={{ display: 'flex', gap: '10px 14px', flexWrap: 'wrap', alignItems: 'center', fontSize: '14px', color: 'var(--ink2)' }}>
            <span style={{ fontWeight: 700 }}>{p.name}</span><span style={{ color: 'var(--ink3)' }}>{p.email}</span>
            <span style={{ flex: 1 }} />
            {canEdit && <Button variant="ghost" disabled={busy} onClick={() => setEditing(p)}>Edit</Button>}
            {canEdit && <Button variant="red" disabled={busy} onClick={() => { if (window.confirm(`Remove ${p.name} from the list? Drops that already use them keep their own link.`)) void call(`/api/events/speaker-proposals/approvers/${p.id}`, 'DELETE') }}>Remove</Button>}
          </div>
        ))}
      </div>
      {canEdit && (
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ flex: '1 1 180px', maxWidth: '260px' }}><Input value={name} onChange={e => setName(e.target.value)} placeholder="Name" /></div>
          <div style={{ flex: '1 1 220px', maxWidth: '320px' }}><Input value={email} onChange={e => setEmail(e.target.value)} placeholder="email@example.com" onKeyDown={e => { if (e.key === 'Enter') void add() }} /></div>
          <Button variant="teal" disabled={busy || !name.trim() || !email.trim()} onClick={() => void add()}>+ Add approver</Button>
        </div>
      )}
    </div>
  )
}
