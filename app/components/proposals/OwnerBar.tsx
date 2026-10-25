'use client'

import { useCallback, useEffect, useState } from 'react'
import { Badge, Button } from '@/app/components/ui'
import { notify } from '@/app/lib/ui/notify'

/* Who is responsible for a Speaker Proposals drop. The OWNER is who client emails go out as and who gets the notifications; CO-OWNERS are copied on every email (to the client, and to the team) and every notification.
   Anyone who can edit the drop can make themselves the owner; the owner, a co-owner or an admin can name someone else and manage co-owners. */

type Person = { sid: string; name: string; email: string | null; access?: boolean }
type State = { owner: Person | null; co_owners: Person[]; team: Person[]; me: string | null; can_manage: boolean }

export default function OwnerBar({ batchId, canEdit, onChanged, batchName, backHref }: { batchId: string; canEdit: boolean; onChanged?: () => void; batchName?: string; backHref?: string }) {
  const [s, setS] = useState<State | null>(null)
  const [busy, setBusy] = useState(false)
  const url = `/api/events/speaker-proposals/batches/${batchId}/owners`
  const load = useCallback(async () => {
    const r = await fetch(url).catch(() => null)
    if (r?.ok) setS(await r.json() as State)
  }, [url])
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const r = await fetch(url).catch(() => null)
      if (!cancelled && r?.ok) setS(await r.json() as State)
    })()
    return () => { cancelled = true }
  }, [url])

  async function save(body: Record<string, unknown>, done: string, to: string = url, method: string = 'PUT') {
    setBusy(true)
    const r = await fetch(to, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const d = await r.json().catch(() => ({})) as { error?: string }
    setBusy(false)
    if (!r.ok) { notify(d.error ?? 'Could not save that.', 'error'); return }
    notify(done); await load(); onChanged?.()
  }
  async function renameDrop() {
    const next = window.prompt('Rename this drop', batchName ?? '')?.trim()
    if (!next || next === batchName) return
    await save({ name: next }, 'Drop renamed.', `/api/events/speaker-proposals/batches/${batchId}`, 'PATCH')
  }
  async function deleteDrop() {
    const typed = window.prompt(`Delete “${batchName ?? 'this drop'}” and all its speakers? This cannot be undone.\n\nType DELETE to confirm.`)
    if (typed?.trim() !== 'DELETE') return
    setBusy(true)
    const r = await fetch(`/api/events/speaker-proposals/batches/${batchId}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirm: 'DELETE' }) })
    const d = await r.json().catch(() => ({})) as { error?: string }
    setBusy(false)
    if (!r.ok) { notify(d.error ?? 'Could not delete the drop.', 'error'); return }
    notify('Drop deleted.'); if (backHref) window.location.assign(backHref)
  }
  if (!s) return null

  const co = s.co_owners.map(c => c.sid)
  const iAmOwner = !!s.me && s.owner?.sid === s.me
  const pool = s.team.filter(p => p.sid !== s.owner?.sid && !co.includes(p.sid))
  const pick: React.CSSProperties = { fontSize: '12.5px', padding: '4px 8px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--ink2)', maxWidth: '220px' }
  const label: React.CSSProperties = { fontSize: '11.5px', fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--ink3)' }

  return (
    <div style={{ padding: '8px 32px', borderBottom: '1px solid var(--border-light)', background: 'var(--card)', display: 'flex', alignItems: 'center', gap: '8px 16px', flexWrap: 'wrap' }}>
      <span style={label}>Owner</span>
      {s.owner ? <Badge color="teal">{s.owner.name}{iAmOwner ? ' (you)' : ''}</Badge> : <Badge color="grey">Nobody yet</Badge>}
      {canEdit && s.me && !iAmOwner && <Button variant="ghost" disabled={busy} onClick={() => void save({ owner_sid: s.me }, 'You are now the owner of this drop.')}>Make me the owner</Button>}
      {canEdit && s.can_manage && s.team.some(p => p.sid !== s.owner?.sid) && (
        <select aria-label="Change owner" style={pick} value="" disabled={busy} onChange={e => e.target.value && void save({ owner_sid: e.target.value }, 'Owner changed.')}>
          <option value="">{s.owner ? 'Change owner…' : 'Select owner…'}</option>
          {s.team.filter(p => p.sid !== s.owner?.sid).map(p => <option key={p.sid} value={p.sid}>{p.name}{p.access === false ? ' — has no access yet' : ''}</option>)}
        </select>
      )}
      <span style={{ ...label, marginLeft: '8px' }}>Co-owners</span>
      {s.co_owners.length === 0 && <span style={{ fontSize: '13px', color: 'var(--ink3)' }}>none</span>}
      {s.co_owners.map(c => (
        <Badge key={c.sid} color="grey">
          {c.name}
          {canEdit && s.can_manage && <button aria-label={`Remove ${c.name}`} disabled={busy} onClick={() => void save({ co_owner_sids: co.filter(x => x !== c.sid) }, `${c.name} is no longer a co-owner.`)} style={{ marginLeft: '6px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)' }}>×</button>}
        </Badge>
      ))}
      {canEdit && s.can_manage && pool.length > 0 && (
        <select aria-label="Add co-owner" style={pick} value="" disabled={busy} onChange={e => e.target.value && void save({ co_owner_sids: [...co, e.target.value] }, 'Co-owner added.')}>
          <option value="">+ Add co-owner…</option>
          {pool.map(p => <option key={p.sid} value={p.sid}>{p.name}{p.access === false ? ' — has no access yet' : ''}</option>)}
        </select>
      )}
      {canEdit && batchName && <Button variant="ghost" disabled={busy} onClick={() => void renameDrop()}>Rename drop</Button>}
      {canEdit && s.can_manage && backHref && <Button variant="ghost" disabled={busy} onClick={() => void deleteDrop()}>Delete this drop</Button>}
      <span style={{ fontSize: '12.5px', color: 'var(--ink3)', flex: 1, minWidth: '220px' }}>Client emails go out from the owner’s mailbox; the owner and co-owners are all copied and notified.</span>
    </div>
  )
}
