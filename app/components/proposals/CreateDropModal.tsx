'use client'

import { useState } from 'react'
import { Button, Input } from '@/app/components/ui'
import { notify } from '@/app/lib/ui/notify'

/* "Create drop" — the name and the owner are required; co-owners are optional and can all be changed inside the drop. */
export type Producer = { sid: string; name: string; email: string | null; access?: boolean }

export default function CreateDropModal({ eventId, team, me, onClose, onCreated }: { eventId: string; team: Producer[]; me: string | null; onClose: () => void; onCreated: (id: string) => void }) {
  const [name, setName] = useState('')
  const [owner, setOwner] = useState(me && team.some(p => p.sid === me) ? me : '')
  const [co, setCo] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const toggle = (list: string[], set: (v: string[]) => void, id: string) => set(list.includes(id) ? list.filter(x => x !== id) : [...list, id])
  const label: React.CSSProperties = { fontSize: '11.5px', fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--ink3)', margin: '14px 0 6px' }
  const row: React.CSSProperties = { display: 'flex', gap: '8px', alignItems: 'center', fontSize: '14px', color: 'var(--ink2)', padding: '3px 0' }

  async function create() {
    if (!name.trim()) { notify('Give the drop a name.', 'error'); return }
    if (!owner) { notify('Choose an owner for the drop.', 'error'); return }
    setBusy(true)
    const r = await fetch('/api/events/speaker-proposals/batches', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event_id: eventId, name: name.trim(), owner_sid: owner, co_owner_sids: co.filter(c => c !== owner) }) })
    const d = await r.json().catch(() => ({})) as { id?: string; error?: string }
    setBusy(false)
    if (!r.ok || !d.id) { notify(d.error ?? 'Could not create the drop.', 'error'); return }
    onCreated(d.id)
  }

  return (
    <div role="dialog" aria-modal="true" aria-label="Create drop" onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'var(--overlay-scrim)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: '560px', maxHeight: '90vh', overflowY: 'auto', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px', padding: '22px' }}>
        <div style={{ fontSize: '19px', fontWeight: 900, color: 'var(--ink)' }}>Create drop</div>
        <div style={{ fontSize: '13.5px', color: 'var(--ink3)', marginTop: '4px' }}>You add the speakers once it’s created. Everything here can be changed later inside the drop.</div>

        <div style={label}>Drop name *</div>
        <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Drop 27" />

        <div style={label}>Owner *</div>
        <select value={owner} onChange={e => setOwner(e.target.value)} style={{ width: '100%', padding: '9px 10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--ink)', fontSize: '14px' }}>
          <option value="">Choose the producer in charge…</option>
          {team.map(p => <option key={p.sid} value={p.sid}>{p.name}{p.access === false ? ' — has no access yet' : ''}</option>)}
        </select>
        <div style={{ fontSize: '12.5px', color: 'var(--ink3)', marginTop: '4px' }}>The owner gets the notifications when the client decides.</div>

        <div style={label}>Co-owners (optional)</div>
        {team.filter(p => p.sid !== owner).length === 0 ? <div style={{ fontSize: '13.5px', color: 'var(--ink3)' }}>No other producers on this event.</div> : team.filter(p => p.sid !== owner).map(p => (
          <label key={p.sid} style={row}><input type="checkbox" checked={co.includes(p.sid)} onChange={() => toggle(co, setCo, p.sid)} />{p.name}{p.access === false ? <span style={{ color: 'var(--ink4)' }}> — has no access yet</span> : null}</label>
        ))}
        <div style={{ fontSize: '12.5px', color: 'var(--ink3)', marginTop: '4px' }}>Copied on every notification.</div>


        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '20px' }}>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="teal" onClick={() => void create()} disabled={busy || !name.trim() || !owner}>{busy ? 'Creating…' : 'Create drop'}</Button>
        </div>
      </div>
    </div>
  )
}
