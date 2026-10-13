'use client'

import { useState } from 'react'
import { Button, Input } from '@/app/components/ui'

/* Review and create guest codes for confirmed speakers who have no link yet. Proposed codes are editable; nothing exists on
   KonfHub until "Create" is pressed. Works in chunks (the server does a few speakers per call) so a long list can't time out. */
export type CodeRow = { id: string; name: string; proposed_code: string | null; provision_error: string | null }
type Out = { ok: boolean; code?: string; error?: string }

export default function CodesDialog({ eventId, rows, onClose, onFinished }: { eventId: string; rows: CodeRow[]; onClose: () => void; onFinished: () => void }) {
  const [codes, setCodes] = useState<Record<string, string>>(() => Object.fromEntries(rows.map(r => [r.id, r.proposed_code ?? ''])))
  const [out, setOut] = useState<Record<string, Out>>({})
  const [busy, setBusy] = useState<'propose' | 'create' | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function run(kind: 'propose' | 'create') {
    setBusy(kind); setError(null)
    let ids = rows.filter(r => !out[r.id]?.ok).map(r => r.id)
    while (ids.length) {
      const res = await fetch('/api/events/guest-invites/provision', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_id: eventId, speaker_ids: ids, propose_only: kind === 'propose', codes: kind === 'create' ? Object.fromEntries(Object.entries(codes).filter(([, v]) => v.trim()).map(([k, v]) => [k, v.trim().toUpperCase()])) : undefined }) })
      const d = await res.json().catch(() => ({})) as { results?: { id: string; ok: boolean; code?: string; error?: string }[]; remaining?: string[]; error?: string }
      if (!res.ok || !d.results) { setError(d.error ?? 'Something went wrong.'); break }
      setOut(cur => ({ ...cur, ...Object.fromEntries(d.results!.map(r => [r.id, { ok: r.ok, code: r.code, error: r.error }])) }))
      if (kind === 'propose') setCodes(cur => ({ ...cur, ...Object.fromEntries(d.results!.filter(r => r.ok && r.code).map(r => [r.id, r.code as string])) }))
      ids = d.remaining ?? []
    }
    setBusy(null); onFinished()
  }
  const created = Object.values(out).filter(o => o.ok).length
  const pending = rows.filter(r => !out[r.id]?.ok).length
  const allCoded = rows.every(r => out[r.id]?.ok || (codes[r.id] ?? '').trim())
  const failed = rows.filter(r => out[r.id] && !out[r.id].ok).length

  return (
    <div role="dialog" aria-modal="true" style={{ position: 'fixed', inset: 0, background: 'var(--overlay-scrim)', display: 'grid', placeItems: 'center', zIndex: 60, padding: '20px' }}>
      <div style={{ background: 'var(--card)', borderRadius: '14px', border: '1px solid var(--border)', width: 'min(720px, 100%)', maxHeight: '88vh', overflow: 'auto', padding: '20px 22px' }}>
        <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--ink)' }}>Create guest links</div>
        <div style={{ fontSize: '12.5px', color: 'var(--ink3)', lineHeight: 1.6, margin: '6px 0 12px' }}>
          {rows.length} confirmed speaker{rows.length === 1 ? '' : 's'} without a link. <b>Step 1:</b> generate the codes and edit any of them right here. <b>Step 2:</b> generate the links — only then is each code created on KonfHub (for the guest ticket and limit set in Settings) and the speaker’s link saved. No emails are sent.
        </div>
        <div style={{ display: 'grid', gap: '6px' }}>
          {rows.map(r => {
            const o = out[r.id]
            return (
              <div key={r.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 230px 24px', gap: '10px', alignItems: 'center', fontSize: '13px' }}>
                <span style={{ fontWeight: 700, color: 'var(--ink)' }}>{r.name}{(o?.error || r.provision_error) && !o?.ok && <span style={{ display: 'block', fontSize: '11.5px', fontWeight: 400, color: 'var(--red)' }}>{o?.error ?? r.provision_error}</span>}</span>
                <Input value={codes[r.id] ?? ''} placeholder="click Generate codes" disabled={!!busy || o?.ok} onChange={e => setCodes(c => ({ ...c, [r.id]: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') }))} style={{ fontFamily: 'ui-monospace, Menlo, monospace' }} />
                <span style={{ color: o?.ok ? 'var(--teal-mid)' : 'var(--red)' }}>{o ? (o.ok ? '✓' : '!') : ''}</span>
              </div>
            )
          })}
        </div>
        {error && <div style={{ color: 'var(--red)', fontSize: '12.5px', marginTop: '10px' }}>{error}</div>}
        {(created > 0 || failed > 0) && <div style={{ fontSize: '12.5px', color: 'var(--ink2)', marginTop: '10px' }}>{created} link{created === 1 ? '' : 's'} generated{failed ? ` · ${failed} failed (see above)` : ''}.</div>}
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '16px', flexWrap: 'wrap' }}>
          <Button variant="ghost" onClick={onClose} disabled={!!busy}>{created > 0 ? 'Done' : 'Cancel'}</Button>
          {!allCoded && <Button variant="teal" onClick={() => run('propose')} disabled={!!busy}>{busy === 'propose' ? 'Working…' : 'Step 1 · Generate codes'}</Button>}
          {allCoded && <Button variant="teal" onClick={() => run('create')} disabled={!!busy || pending === 0}>{busy === 'create' ? 'Creating…' : `Step 2 · Generate ${pending} link${pending === 1 ? '' : 's'}`}</Button>}
        </div>
      </div>
    </div>
  )
}
