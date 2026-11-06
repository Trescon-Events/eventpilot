'use client'

import { useEffect, useState } from 'react'
import { Button, Card } from '@/app/components/ui'
import { notify } from '@/app/lib/ui/notify'

/* Style notes section of the Rules screen (docs/build_suggestions/copy-library.md §7): writing guidance that cannot be checked mechanically, plus event-level
   style overrides, per level (Trescon-wide, umbrella, this event). Generators read the active notes below the client documents in authority. */

type Note = { id: string; note: string; category: string | null; origin: 'client' | 'trescon'; is_active: boolean }
type Level = { level: 'org' | 'umbrella' | 'event'; label: string; owner_type: string; owner_id: string; can_edit: boolean; inherited: boolean; notes: Note[] }
const input = { width: '100%', padding: '6px 8px', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '12.5px', background: 'var(--card)', color: 'var(--ink)', boxSizing: 'border-box' } as const

export default function StyleNotesPanel({ ownerType, ownerId }: { ownerType: 'event' | 'umbrella' | 'org'; ownerId: string }) {
  const [levels, setLevels] = useState<Level[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [key, setKey] = useState(0)
  const [draft, setDraft] = useState({ note: '', category: '', origin: 'trescon' as 'client' | 'trescon' })
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState<{ id: string; note: string } | null>(null)

  useEffect(() => {
    fetch(`/api/events/style-notes?owner_type=${ownerType}&owner_id=${encodeURIComponent(ownerId)}`)
      .then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j.error || 'Could not load style notes.'); setLevels(j.levels) })
      .catch(e => setErr(e.message))
  }, [ownerType, ownerId, key])

  async function call(url: string, method: string, body: unknown) {
    setBusy(true)
    try {
      const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { notify(j.error || 'Failed.', 'error'); return false }
      setKey(k => k + 1); return true
    } finally { setBusy(false) }
  }

  const own = levels?.find(l => !l.inherited)
  const total = levels?.reduce((n, l) => n + l.notes.length, 0) ?? 0
  return (
    <Card padded>
      <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '0.6px', textTransform: 'uppercase', color: 'var(--teal-mid)', marginBottom: '4px' }}>Style notes ({total})</div>
      <div style={{ fontSize: '12px', color: 'var(--ink3)', marginBottom: '10px' }}>Writing guidance that cannot be checked by a rule, for example “Oxford comma” or “Rupees as ₹ with lakh or crore”. Generators follow these below the client documents.</div>
      {err && <div style={{ fontSize: '12.5px', color: 'var(--red)' }}>{err}</div>}
      {!levels && !err && <div style={{ fontSize: '12.5px', color: 'var(--ink3)' }}>Loading…</div>}
      {levels?.map(l => (
        <div key={l.level} style={{ marginBottom: '12px' }}>
          <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--ink2)', marginBottom: '6px' }}>{l.label} <span style={{ fontWeight: 500, color: 'var(--ink3)' }}>· {l.notes.length} note{l.notes.length === 1 ? '' : 's'}{l.inherited ? ' · inherited' : ''}</span></div>
          {l.notes.length === 0 && <div style={{ fontSize: '12px', color: 'var(--ink3)' }}>None.</div>}
          <div style={{ display: 'grid', gap: '6px' }}>
            {l.notes.map(n => (
              <div key={n.id} style={{ border: '1px solid var(--border-light)', borderRadius: '8px', padding: '8px 10px', opacity: n.is_active ? 1 : 0.55, fontSize: '12.5px' }}>
                {editing?.id === n.id ? (
                  <div style={{ display: 'grid', gap: '6px' }}>
                    <input value={editing.note} onChange={e => setEditing({ id: n.id, note: e.target.value })} style={input} />
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <Button onClick={async () => { if (await call(`/api/events/style-notes?id=${n.id}`, 'PATCH', { note: editing.note })) setEditing(null) }} disabled={busy || !editing.note.trim()}>Save</Button>
                      <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'baseline', justifyContent: 'space-between' }}>
                    <span>{n.note} <span style={{ color: 'var(--ink3)', fontSize: '11px' }}>· {n.origin === 'client' ? 'client' : 'Trescon'}{n.category ? ` · ${n.category}` : ''}{n.is_active ? '' : ' · off'}</span></span>
                    {l.can_edit && (
                      <span style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                        <Button variant="ghost" onClick={() => setEditing({ id: n.id, note: n.note })} disabled={busy}>Edit</Button>
                        <Button variant="ghost" onClick={() => call(`/api/events/style-notes?id=${n.id}`, 'PATCH', { is_active: !n.is_active })} disabled={busy}>{n.is_active ? 'Switch off' : 'Switch on'}</Button>
                      </span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
      {own?.can_edit && (
        <div style={{ borderTop: '1px solid var(--border-light)', paddingTop: '10px', display: 'grid', gap: '6px' }}>
          <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--ink2)' }}>New style note ({own.label})</div>
          <input value={draft.note} onChange={e => setDraft({ ...draft, note: e.target.value })} placeholder="For example: Oxford comma" style={input} />
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            <input value={draft.category} onChange={e => setDraft({ ...draft, category: e.target.value })} placeholder="Category (optional)" style={{ ...input, width: '200px' }} />
            <select value={draft.origin} onChange={e => setDraft({ ...draft, origin: e.target.value as 'client' | 'trescon' })} style={{ ...input, width: '150px' }}>
              <option value="trescon">From Trescon</option><option value="client">From the client</option>
            </select>
            <Button onClick={async () => { if (await call('/api/events/style-notes', 'POST', { owner_type: ownerType, owner_id: ownerId, ...draft })) setDraft({ note: '', category: '', origin: draft.origin }) }} disabled={busy || !draft.note.trim()}>Add note</Button>
          </div>
        </div>
      )}
    </Card>
  )
}
