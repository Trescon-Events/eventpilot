'use client'
import { Button, Badge } from '@/app/components/ui'

/* Preview-then-push dialog for the KonfHub adapter. The page first runs the push
   as a dry run (nothing written) and shows what WOULD change — created / updated /
   unchanged / skipped with reasons, tracks that would be created, per-session
   warnings — and only a second click on "Push now" writes to KonfHub. */

export type PushItem = { session_id: string; title: string; action: 'created' | 'updated' | 'unchanged' | 'skipped' | 'error'; reason?: string; warnings?: string[] }
export type PushReport = {
  dryRun: boolean
  tracksCreated: { title: string; date: string }[]
  items: PushItem[]
  counts: { created: number; updated: number; unchanged: number; skipped: number; error: number }
}

export default function PushDialog({ report, busy, onConfirm, onClose }: { report: PushReport; busy: boolean; onConfirm: () => void; onClose: () => void }) {
  const c = report.counts
  const changes = c.created + c.updated + report.tracksCreated.length
  const withNotes = report.items.filter(i => i.action === 'skipped' || i.action === 'error' || (i.warnings && i.warnings.length))
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--overlay-scrim)', zIndex: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ width: '560px', maxWidth: '100%', maxHeight: '86vh', overflowY: 'auto', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px', padding: '22px' }}>
        <div style={{ fontSize: '17px', fontWeight: 800, color: 'var(--ink)' }}>{report.dryRun ? 'Push to KonfHub — preview' : 'Pushed to KonfHub'}</div>
        <div style={{ fontSize: '12.5px', color: 'var(--ink3)', margin: '4px 0 14px', lineHeight: 1.6 }}>
          {report.dryRun ? 'Nothing has been written yet. Only published sessions are sent; nothing on KonfHub is ever deleted.' : 'Done. Here is what happened.'}
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '14px' }}>
          <Badge color="teal">{c.created} {report.dryRun ? 'to create' : 'created'}</Badge>
          <Badge color="amber">{c.updated} {report.dryRun ? 'to update' : 'updated'}</Badge>
          <Badge color="grey">{c.unchanged} unchanged</Badge>
          <Badge color="grey">{c.skipped} skipped</Badge>
          {c.error > 0 && <Badge color="red">{c.error} failed</Badge>}
        </div>

        {report.tracksCreated.length > 0 && (
          <div style={{ marginBottom: '12px', fontSize: '13px', color: 'var(--ink2)' }}>
            <strong>{report.dryRun ? 'Tracks to create on KonfHub:' : 'Tracks created on KonfHub:'}</strong>{' '}
            {report.tracksCreated.map(t => `${t.title} (${t.date})`).join(', ')}
          </div>
        )}

        {withNotes.length > 0 && (
          <div style={{ display: 'grid', gap: '8px', marginBottom: '14px' }}>
            {withNotes.map(i => (
              <div key={i.session_id} style={{ border: '1px solid var(--border-light)', borderRadius: '8px', padding: '8px 10px', fontSize: '12.5px' }}>
                <div style={{ fontWeight: 800, color: 'var(--ink)' }}>{i.title} <span style={{ fontWeight: 600, color: i.action === 'error' ? 'var(--red)' : 'var(--ink4)' }}>· {i.action}</span></div>
                {i.reason && <div style={{ color: i.action === 'error' ? 'var(--red)' : 'var(--ink3)', marginTop: '2px' }}>{i.reason}</div>}
                {i.warnings?.map((w, k) => <div key={k} style={{ color: 'var(--amber)', marginTop: '2px' }}>⚠ {w}</div>)}
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          <Button variant="ghost" onClick={onClose} disabled={busy}>{report.dryRun ? 'Cancel' : 'Close'}</Button>
          {report.dryRun && <Button variant="teal" onClick={onConfirm} disabled={busy || changes === 0}>{busy ? 'Pushing…' : changes === 0 ? 'Nothing to push' : `Push now (${changes} change${changes === 1 ? '' : 's'})`}</Button>}
        </div>
      </div>
    </div>
  )
}
