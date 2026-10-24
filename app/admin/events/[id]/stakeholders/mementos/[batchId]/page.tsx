'use client'

import { use, useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import PageHeader from '@/app/components/PageHeader'
import { Badge, Button, Input } from '@/app/components/ui'
import Toast from '@/app/components/ui/Toast'
import { permissionSetSatisfies } from '@/app/lib/access/permission-match'
import { useBreadcrumbLabel } from '@/app/lib/nav/breadcrumb-labels'

/* One memento batch: the speakers and their Cleaned Photos, and — while it is a draft — rename, remove a speaker, Push to Ops, delete.
   A pushed batch is locked; its speakers show "Pushed to Ops" everywhere. Ops hands it on to the memento vendor (built later). */

type Item = { speaker_id: string; name: string; company: string | null; title: string | null; photo_url: string | null; changed: boolean }
type Dispatch = { id: string; status: 'requested' | 'sent' | 'downloaded' | 'confirmed' | 'issue' | 'revoked'; requested_at: string; sent_at: string | null; first_downloaded_at: string | null; vendor_response_at: string | null; vendor_note: string | null; vendor_name: string | null }
type PrintInfo = { status: 'none' | 'processing' | 'done' | 'error'; done: number; total: number; error: string | null; generated_at: string | null; bytes: number | null; stale: boolean }
type Batch = { print_template?: boolean; print?: PrintInfo | null; dispatches?: Dispatch[]; id: string; name: string; note: string | null; kind: 'shared' | 'legacy'; status: 'draft' | 'pushed'; shared_at: string; pushed_at: string | null; created_at: string; created_by_name: string | null; speakers: number; changed: number; items: Item[] }

const fmt = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

export default function MementoBatchPage({ params }: { params: Promise<{ id: string; batchId: string }> }) {
  const { id: eventId, batchId } = use(params)
  const router = useRouter()
  const [eventName, setEventName] = useState<string | null>(null)
  const [permissions, setPermissions] = useState<Set<string>>(new Set())
  const [batch, setBatch] = useState<Batch | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [renaming, setRenaming] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const [pushOpen, setPushOpen] = useState(false)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  useBreadcrumbLabel(eventId, eventName)
  useBreadcrumbLabel(batchId, batch?.name ?? null)
  const can = (key: string) => permissionSetSatisfies(permissions, key)
  const say = (message: string, type: 'success' | 'error' = 'success') => setToast({ message, type })

  const load = useCallback(async () => {
    const [res, permRes, eventRes] = await Promise.all([fetch(`/api/events/mementos?event_id=${eventId}&id=${batchId}`), fetch(`/api/events/access/me?event_id=${eventId}`), fetch(`/api/events?id=${eventId}`)])
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { setLoadError(data.error ?? 'Could not load this batch.'); return }
    setBatch(data.batch)
    const perm = await permRes.json().catch(() => ({ permissions: [] }))
    setPermissions(new Set(perm.permissions ?? []))
    const ev = await eventRes.json().catch(() => null)
    setEventName((Array.isArray(ev) ? ev[0] : ev)?.name ?? null)
  }, [eventId, batchId])
  // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load
  useEffect(() => { void load() }, [load])

  async function patch(payload: Record<string, unknown>): Promise<{ ok: boolean; data: Record<string, unknown> }> {
    setBusy(true)
    const res = await fetch('/api/events/mementos', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event_id: eventId, id: batchId, ...payload }) })
    const data = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) say((data.error as string) ?? 'That did not work.', 'error')
    return { ok: res.ok, data }
  }

  const canEdit = can('sae.mementos.manage')
  const printing = batch?.print?.status === 'processing'
  useEffect(() => {
    if (!printing) return
    const t = setInterval(() => void load(), 3000)
    return () => clearInterval(t)
  }, [printing, load])
  async function generatePrint() {
    const r = await patch({ action: 'generate_print' })
    if (r.ok) { say('Building the print file — you can leave this page; it keeps going.'); await load() }
  }
  async function downloadPrint() {
    const res = await fetch(`/api/events/mementos?event_id=${eventId}&id=${batchId}&print_download=1`)
    const d = await res.json().catch(() => ({}))
    if (!res.ok) { say(d.error ?? 'Could not get the file.', 'error'); return }
    const a = document.createElement('a'); a.href = d.url; a.download = d.filename; document.body.appendChild(a); a.click(); a.remove()
  }
  const printReady = !batch?.print_template || (batch.print?.status === 'done' && !batch.print.stale)
  const draft = batch?.status === 'draft'

  async function rename() {
    if (!nameDraft.trim()) return
    const r = await patch({ action: 'rename', name: nameDraft })
    if (r.ok) { setRenaming(false); void load() }
  }
  async function removeSpeaker(it: Item) {
    if (!window.confirm(`Remove ${it.name} from this batch?`)) return
    if ((await patch({ action: 'remove_speaker', speaker_id: it.speaker_id })).ok) void load()
  }
  async function push() {
    const r = await patch({ action: 'push', note })
    if (r.ok) { setPushOpen(false); say(`Pushed ${r.data.pushed as number} speaker${r.data.pushed === 1 ? '' : 's'} to Ops.`); void load() }
  }
  async function deleteBatch() {
    if (!window.confirm('Delete this draft batch? The speakers go back to “Not pushed”.')) return
    setBusy(true)
    const res = await fetch('/api/events/mementos', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event_id: eventId, id: batchId }) })
    const data = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) { say(data.error ?? 'Could not delete.', 'error'); return }
    router.push(`/admin/events/${eventId}/stakeholders/mementos`)
  }

  return (
    <div>
      <PageHeader
        eyebrow="Mementos" title={batch?.name ?? 'Memento batch'}
        description={batch ? (batch.kind === 'legacy' ? `Shared with Ops before EventPilot · ${new Date(batch.shared_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}` : `${batch.speakers} speaker${batch.speakers === 1 ? '' : 's'} · created ${fmt(batch.created_at)}${batch.created_by_name ? ` by ${batch.created_by_name}` : ''}`) : ''}
        backHref={`/admin/events/${eventId}/stakeholders/mementos`} backLabel="Mementos"
        actions={batch && canEdit && draft ? (
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <Button variant="ghost" onClick={() => { setNameDraft(batch.name); setRenaming(true) }} disabled={busy}>Rename</Button>
            <Button variant="ghost" onClick={() => void deleteBatch()} disabled={busy}>Delete batch</Button>
            <Button variant="lime" onClick={() => setPushOpen(true)} disabled={busy || batch.items.length === 0 || !printReady} title={!printReady ? 'Generate the print file first — Ops and the vendor receive the print PDF' : ''}>Push to Ops</Button>
          </div>
        ) : undefined}
      />
      <div style={{ padding: '24px 32px' }}>
        {loadError && <div style={{ color: 'var(--red)', fontSize: '14px' }}>{loadError}</div>}
        {batch && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '16px' }}>
              <Badge color={batch.status === 'pushed' ? 'teal' : 'grey'}>{batch.status === 'pushed' ? 'Pushed to Ops' : 'Draft'}</Badge>
              {batch.status === 'pushed' && batch.pushed_at && <span style={{ fontSize: '13px', color: 'var(--ink3)' }}>Pushed {fmt(batch.pushed_at)} — this batch is locked.</span>}
              {draft && <span style={{ fontSize: '13px', color: 'var(--ink3)' }}>Draft — Ops can’t see it until you push it.</span>}
              {batch.changed > 0 && <span style={{ fontSize: '13px', color: 'var(--amber)', fontWeight: 700 }}>{batch.changed} speaker{batch.changed === 1 ? '' : 's'} had their Cleaned Photo changed after pushing</span>}
            </div>
            {batch.print_template && batch.print && (
              <div style={{ marginBottom: '16px', padding: '14px 16px', border: `1px solid ${batch.print.status === 'done' && !batch.print.stale ? 'var(--teal)' : 'var(--border-light)'}`, borderRadius: '10px', background: 'var(--card)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                  <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--ink)' }}>Print file</div>
                  {batch.print.status === 'processing' ? <Badge color="amber">Building…</Badge> : batch.print.status === 'done' ? (batch.print.stale ? <Badge color="amber">Out of date</Badge> : <Badge color="teal">Ready</Badge>) : batch.print.status === 'error' ? <Badge color="red">Failed</Badge> : <Badge color="grey">Not generated yet</Badge>}
                  <span style={{ fontSize: '13.5px', color: 'var(--ink3)', flex: 1 }}>
                    {batch.print.status === 'processing' ? `Page ${batch.print.done} of ${batch.print.total}…`
                      : batch.print.status === 'done' ? `${batch.speakers} memento${batch.speakers === 1 ? '' : 's'} · ${batch.print.bytes ? `${(batch.print.bytes / 1048576).toFixed(1)} MB · ` : ''}built ${batch.print.generated_at ? fmt(batch.print.generated_at) : ''}. ${batch.print.stale ? 'A speaker or a Cleaned Photo changed since — generate it again before pushing.' : 'Ops and the vendor receive this PDF.'}`
                      : batch.print.status === 'error' ? (batch.print.error ?? 'It could not be built.')
                      : 'Vector background + each speaker, one page each, 6 × 9 in. Ops and the vendor receive this PDF, so build it before pushing.'}
                  </span>
                  {batch.print.status === 'done' && <Button variant="ghost" onClick={() => void downloadPrint()}>Download PDF</Button>}
                  {canEdit && draft && <Button variant={batch.print.status === 'done' && !batch.print.stale ? 'ghost' : 'lime'} disabled={busy || printing} onClick={() => void generatePrint()}>{batch.print.status === 'done' ? 'Generate again' : batch.print.status === 'error' ? 'Try again' : 'Generate print file'}</Button>}
                </div>
                {batch.print.status === 'processing' && <div style={{ marginTop: '10px', height: '6px', borderRadius: '3px', background: 'var(--border-light)' }}><div style={{ height: '6px', borderRadius: '3px', background: 'var(--teal)', width: `${batch.print.total ? (100 * batch.print.done) / batch.print.total : 5}%`, transition: 'width 0.3s' }} /></div>}
              </div>
            )}
            {(() => {
              const d = batch.dispatches?.find(x => x.status !== 'revoked')
              if (!d || batch.kind === 'legacy') return null
              const line = {
                requested: 'With Ops — waiting for them to review and send it to the memento vendor.',
                sent: `Sent to ${d.vendor_name ?? 'the memento vendor'}${d.sent_at ? ` on ${fmt(d.sent_at)}` : ''}. Waiting for them to download.`,
                downloaded: `${d.vendor_name ?? 'The vendor'} downloaded the photos${d.first_downloaded_at ? ` on ${fmt(d.first_downloaded_at)}` : ''}. Waiting for their confirmation.`,
                confirmed: `${d.vendor_name ?? 'The vendor'} confirmed that everything looks good${d.vendor_response_at ? ` on ${fmt(d.vendor_response_at)}` : ''}.${d.vendor_note ? ` Note: “${d.vendor_note}”` : ''}`,
                issue: `${d.vendor_name ?? 'The vendor'} reported a problem${d.vendor_response_at ? ` on ${fmt(d.vendor_response_at)}` : ''}: “${d.vendor_note ?? ''}”. Ops has been told.`,
                revoked: '',
              }[d.status]
              return <div style={{ fontSize: '13.5px', color: d.status === 'issue' ? 'var(--red)' : 'var(--ink2)', marginBottom: '16px', fontWeight: d.status === 'issue' ? 700 : 400 }}>{line}</div>
            })()}
            {batch.note && <div style={{ fontSize: '13px', color: 'var(--ink2)', marginBottom: '16px' }}>Note for Ops: {batch.note}</div>}
            {batch.items.length === 0 ? (
              <div style={{ color: 'var(--ink3)', fontSize: '14px', padding: '30px 0' }}>No speakers in this batch.</div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '14px' }}>
                {batch.items.map(it => (
                  <div key={it.speaker_id} style={{ border: `1px solid ${it.changed ? 'var(--amber)' : 'var(--border-light)'}`, borderRadius: '10px', background: 'var(--card)', overflow: 'hidden' }}>
                    <div style={{ aspectRatio: '1 / 1', background: 'repeating-conic-gradient(var(--surface2) 0% 25%, var(--surface) 0% 50%) 0 0 / 16px 16px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {it.photo_url
                        // eslint-disable-next-line @next/next/no-img-element -- remote Supabase storage URL, same as the rest of the Hub
                        ? <img src={it.photo_url} alt={it.name} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                        : <span style={{ fontSize: '12px', color: 'var(--ink4)' }}>No Cleaned Photo</span>}
                    </div>
                    <div style={{ padding: '10px 12px' }}>
                      <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--ink)' }}>{it.name}</div>
                      <div style={{ fontSize: '12px', color: 'var(--ink3)' }}>{[it.title, it.company].filter(Boolean).join(' · ') || '—'}</div>
                      {it.changed && <div style={{ fontSize: '12px', color: 'var(--amber)', fontWeight: 700, marginTop: '4px' }}>Photo changed since pushed</div>}
                      {draft && canEdit && <button onClick={() => void removeSpeaker(it)} disabled={busy} style={{ marginTop: '6px', background: 'none', border: 'none', color: 'var(--red)', fontSize: '12.5px', cursor: 'pointer', padding: 0 }}>Remove</button>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {renaming && (
        <div style={{ position: 'fixed', inset: 0, background: 'color-mix(in srgb, black 60%, transparent)', zIndex: 70, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }} onClick={() => setRenaming(false)}>
          <div onClick={e => e.stopPropagation()} style={{ width: '420px', maxWidth: '100%', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px', padding: '22px' }}>
            <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--ink)', marginBottom: '10px' }}>Rename batch</div>
            <Input value={nameDraft} onChange={e => setNameDraft(e.target.value)} />
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '16px' }}>
              <Button variant="ghost" onClick={() => setRenaming(false)}>Cancel</Button>
              <Button variant="lime" onClick={() => void rename()} disabled={busy || !nameDraft.trim()}>Save</Button>
            </div>
          </div>
        </div>
      )}

      {pushOpen && batch && (
        <div style={{ position: 'fixed', inset: 0, background: 'color-mix(in srgb, black 60%, transparent)', zIndex: 70, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }} onClick={() => setPushOpen(false)}>
          <div onClick={e => e.stopPropagation()} style={{ width: '460px', maxWidth: '100%', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px', padding: '22px' }}>
            <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--ink)', marginBottom: '8px' }}>Push to Ops?</div>
            <div style={{ fontSize: '12.5px', color: 'var(--ink3)', lineHeight: 1.6, marginBottom: '12px' }}>
              The Cleaned Photos of <strong>{batch.items.length}</strong> speaker{batch.items.length === 1 ? '' : 's'} go to Ops as they are now, the batch is locked, and these speakers show “Pushed to Ops”.
            </div>
            <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--ink3)', marginBottom: '4px' }}>Note for Ops (optional)</div>
            <Input value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. second round, panel speakers" />
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '16px' }}>
              <Button variant="ghost" onClick={() => setPushOpen(false)}>Cancel</Button>
              <Button variant="lime" onClick={() => void push()} disabled={busy}>{busy ? 'Pushing…' : 'Push to Ops'}</Button>
            </div>
          </div>
        </div>
      )}
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  )
}
