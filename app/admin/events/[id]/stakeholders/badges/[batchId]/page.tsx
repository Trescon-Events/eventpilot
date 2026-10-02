'use client'

import { use, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import PageHeader from '@/app/components/PageHeader'
import { Badge, Button, Input } from '@/app/components/ui'
import Toast from '@/app/components/ui/Toast'
import { permissionSetSatisfies } from '@/app/lib/access/permission-match'
import { useBreadcrumbLabel } from '@/app/lib/nav/breadcrumb-labels'
import type { BadgeFlag, BadgeItemRow, BadgeOverrides } from '@/app/lib/badges/types'

/* Review one badge batch: scrollable grid of every badge, automatic flags, small adjustments (text / photo position),
   approve each (or all unflagged), approve the batch for print, then build and download the print file. */

type Batch = {
  id: string; name: string; status: 'draft' | 'review' | 'approved'; template_name: string; canvas_width: number; canvas_height: number
  print?: { width_mm: number; height_mm: number; bleed_mm: number }
  pdf_versions: Array<{ key: string; generated_at: string; badges: number }>; approved_at: string | null
}
type Dispatch = { id: string; status: 'requested' | 'sent' | 'downloaded' | 'printed' | 'revoked'; pdf_version: number; badges: number; requested_at: string; sent_at: string | null; printed_confirmed_at: string | null }
const DISPATCH_LABEL: Record<Dispatch['status'], string> = { requested: 'Sent to Ops — waiting for review', sent: 'Sent to the printer', downloaded: 'Downloaded by the printer', printed: 'Printed', revoked: 'Revoked by Ops' }
type Job = { id: string; kind: 'render' | 'pdf'; status: 'processing' | 'done' | 'error'; progress_done: number; progress_total: number; error_message: string | null }
type Filter = 'all' | 'flagged' | 'unapproved' | 'removed'

const FLAG_COLOR: Record<BadgeFlag['code'], string> = {
  missing_field: 'var(--red)', no_photo: 'var(--red)', low_resolution: 'var(--amber)', text_overflow: 'var(--red)', text_shrunk: 'var(--amber)', photo_overlaps_logo: 'var(--amber)',
}

export default function BadgeBatchPage({ params }: { params: Promise<{ id: string; batchId: string }> }) {
  const { id: eventId, batchId } = use(params)
  const router = useRouter()
  const search = useSearchParams()
  const [eventName, setEventName] = useState<string | null>(null)
  const [permissions, setPermissions] = useState<Set<string>>(new Set())
  const [batch, setBatch] = useState<Batch | null>(null)
  const [items, setItems] = useState<BadgeItemRow[]>([])
  const [jobs, setJobs] = useState<Job[]>([])
  const [dispatches, setDispatches] = useState<Dispatch[]>([])
  const [notifyOpen, setNotifyOpen] = useState(false)
  const [filter, setFilter] = useState<Filter>('all')
  const [adjusting, setAdjusting] = useState<BadgeItemRow | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  useBreadcrumbLabel(eventId, eventName)
  useBreadcrumbLabel(batchId, batch?.name ?? null)
  const can = (key: string) => permissionSetSatisfies(permissions, key)
  const say = (message: string, type: 'success' | 'error' = 'success') => setToast({ message, type })

  const load = useCallback(async () => {
    const [res, permRes, eventRes] = await Promise.all([
      fetch(`/api/events/badges/batches/${batchId}`), fetch(`/api/events/access/me?event_id=${eventId}`), fetch(`/api/events?id=${eventId}`),
    ])
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { setLoadError(data.error ?? 'Could not load this batch.'); return }
    setBatch(data.batch); setItems(data.items); setJobs(data.jobs); setDispatches(data.dispatches ?? [])
    const perm = await permRes.json().catch(() => ({ permissions: [] }))
    setPermissions(new Set(perm.permissions ?? []))
    setEventName((await eventRes.json().catch(() => null))?.name ?? null)
  }, [batchId, eventId])
  // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load
  useEffect(() => { void load() }, [load])

  const activeJob = jobs.find(j => j.status === 'processing') ?? null
  // Poll while a job runs; reload everything when it finishes.
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  useEffect(() => {
    if (!activeJob) return
    pollRef.current = setInterval(async () => {
      const res = await fetch(`/api/events/badges/jobs/${activeJob.id}`)
      const j = await res.json().catch(() => null)
      if (!j) return
      setJobs(prev => prev.map(x => (x.id === activeJob.id ? { ...x, status: j.status, progress_done: j.progress_done, progress_total: j.progress_total, error_message: j.error ?? null } : x)))
      if (j.status !== 'processing') {
        if (pollRef.current) clearInterval(pollRef.current)
        await load()
        if (j.status === 'error') say(j.error ?? 'The job failed.', 'error')
        else say(j.kind === 'pdf' ? 'The print file is ready.' : 'Badges rendered.')
      }
    }, 2000)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [activeJob?.id, load]) // eslint-disable-line react-hooks/exhaustive-deps -- keyed on the job id

  async function api(path: string, method: string, body?: unknown): Promise<{ ok: boolean; data: Record<string, unknown> }> {
    const res = await fetch(path, { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined })
    return { ok: res.ok, data: await res.json().catch(() => ({})) }
  }
  async function startRender(all = false) {
    setBusy('render')
    const r = await api(`/api/events/badges/batches/${batchId}/render`, 'POST', { all })
    setBusy(null)
    if (!r.ok) { say(String(r.data.error ?? 'Could not start rendering.'), 'error'); return }
    await load()
  }
  // Land here from "Create batch": start the first render once.
  const autoStarted = useRef(false)
  useEffect(() => {
    if (autoStarted.current || !batch || !search.get('render')) return
    autoStarted.current = true
    router.replace(`/admin/events/${eventId}/stakeholders/badges/${batchId}`)
    void startRender()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batch])

  async function patchItem(item: BadgeItemRow, body: Record<string, unknown>) {
    const r = await api(`/api/events/badges/batches/${batchId}/items/${item.id}`, 'PATCH', body)
    if (!r.ok) { say(String(r.data.error ?? 'Could not update the badge.'), 'error'); return null }
    const updated = r.data.item as BadgeItemRow
    setItems(prev => prev.map(i => (i.id === updated.id ? updated : i)))
    return updated
  }
  async function batchAction(action: string, label: string) {
    setBusy(action)
    const r = await api(`/api/events/badges/batches/${batchId}`, 'PATCH', { action })
    setBusy(null)
    if (!r.ok) { say(String(r.data.error ?? `Could not ${label}.`), 'error'); return }
    say(action === 'refresh_speakers' ? `${r.data.changed ?? 0} badge${r.data.changed === 1 ? '' : 's'} updated from the speaker records.` : `Done: ${label}.`)
    await load()
  }
  async function approveAllUnflagged() {
    setBusy('approve-all')
    const targets = items.filter(i => !i.removed && !i.approved && i.flags.length === 0 && i.preview_url && !i.preview_stale)
    for (const it of targets) await patchItem(it, { approved: true })
    setBusy(null)
    say(`${targets.length} badge${targets.length === 1 ? '' : 's'} approved.`)
  }
  async function generatePdf() {
    setBusy('pdf')
    const r = await api(`/api/events/badges/batches/${batchId}/pdf`, 'POST')
    setBusy(null)
    if (!r.ok) { say(String(r.data.error ?? 'Could not start the print file.'), 'error'); return }
    await load()
  }
  async function download(version: number) {
    const r = await api(`/api/events/badges/batches/${batchId}/pdf?version=${version}`, 'GET')
    if (!r.ok) { say(String(r.data.error ?? 'Could not get the file.'), 'error'); return }
    const a = document.createElement('a'); a.href = String(r.data.url); a.download = String(r.data.filename); document.body.appendChild(a); a.click(); a.remove()
  }

  const live = items.filter(i => !i.removed)
  const stats = { total: live.length, approved: live.filter(i => i.approved).length, flagged: live.filter(i => i.flags.length > 0).length, stale: live.filter(i => i.preview_stale || !i.preview_url).length }
  const shown = useMemo(() => items.filter(i =>
    filter === 'removed' ? i.removed : !i.removed && (filter === 'all' || (filter === 'flagged' ? i.flags.length > 0 : !i.approved))
  ), [items, filter])
  const locked = batch?.status === 'approved'
  const canManage = can('sae.badges.manage'), canApprove = can('sae.badges.approve')

  if (loadError) return <div style={{ padding: '32px', color: 'var(--red)' }}>{loadError}</div>
  if (!batch) return <div style={{ padding: '32px', color: 'var(--ink3)' }}>Loading…</div>

  return (
    <div>
      <PageHeader
        eyebrow="Speaker badges" title={batch.name}
        description={<>{batch.template_name}{batch.print ? ` · artwork ${batch.print.width_mm} × ${batch.print.height_mm} mm, bleed ${batch.print.bleed_mm} mm` : ''} · <Badge color={locked ? 'teal' : batch.status === 'review' ? 'amber' : 'grey'}>{locked ? 'Approved for print' : batch.status === 'review' ? 'In review' : 'Draft'}</Badge></>}
        backHref={`/admin/events/${eventId}/stakeholders/badges`} backLabel="All batches"
      />
      <div style={{ padding: '20px 32px 60px' }}>
        {/* summary + actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap', marginBottom: '14px' }}>
          <div style={{ fontSize: '15px', color: 'var(--ink2)' }}><strong>{stats.approved}</strong> of {stats.total} approved{stats.flagged > 0 && <> · <span style={{ color: 'var(--amber)', fontWeight: 700 }}>{stats.flagged} flagged</span></>}{stats.stale > 0 && <> · {stats.stale} not rendered</>}</div>
          <div style={{ flex: 1 }} />
          {canManage && !locked && (<>
            <Button variant="ghost" disabled={!!activeJob || !!busy} onClick={() => void startRender(stats.stale === 0)}>{stats.stale > 0 ? `Render ${stats.stale} badge${stats.stale === 1 ? '' : 's'}` : 'Re-render all'}</Button>
            <Button variant="ghost" disabled={!!activeJob || !!busy} title="Pull the latest name, title, company, country and photo from the speaker records" onClick={() => void batchAction('refresh_speakers', 'refreshed from speaker records')}>Refresh from speakers</Button>
            <Button variant="ghost" disabled={!!activeJob || !!busy} title="Use the template's current design (re-renders every badge)" onClick={() => void batchAction('update_template', 'updated the template')}>Update template</Button>
            <Button variant="ghost" disabled={!!activeJob || !!busy || stats.stale > 0} onClick={() => void approveAllUnflagged()}>Approve all unflagged</Button>
          </>)}
          {canApprove && !locked && <Button variant="lime" disabled={!!activeJob || !!busy || stats.approved < stats.total || stats.total === 0} title={stats.approved < stats.total ? 'Approve every badge first' : ''} onClick={() => void batchAction('approve', 'approved for print')}>Approve for print</Button>}
          {canApprove && locked && <Button variant="ghost" disabled={!!busy} onClick={() => void batchAction('reopen', 'reopened')}>Reopen</Button>}
        </div>

        {activeJob && (
          <div style={{ marginBottom: '14px', padding: '12px 14px', border: '1px solid var(--border-light)', borderRadius: '10px', background: 'var(--card)' }}>
            <div style={{ fontSize: '14px', color: 'var(--ink2)', marginBottom: '6px' }}>{activeJob.kind === 'pdf' ? 'Building the print file' : 'Rendering badges'}… {activeJob.progress_done} of {activeJob.progress_total}</div>
            <div style={{ height: '6px', borderRadius: '3px', background: 'var(--border-light)' }}>
              <div style={{ height: '6px', borderRadius: '3px', background: 'var(--teal)', width: `${activeJob.progress_total ? (100 * activeJob.progress_done) / activeJob.progress_total : 5}%`, transition: 'width 0.3s' }} />
            </div>
          </div>
        )}

        {/* print file */}
        {locked && canApprove && (
          <div style={{ marginBottom: '16px', padding: '14px 16px', border: '1px solid var(--border-light)', borderRadius: '10px', background: 'var(--card)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--ink)' }}>Print file</div>
              <span style={{ fontSize: '13.5px', color: 'var(--ink3)', flex: 1 }}>Instruction page, {stats.total} badges, then the common back. Vector layers, outlined text, CMYK.</span>
              <Button variant="teal" disabled={!!activeJob || !!busy} onClick={() => void generatePdf()}>{batch.pdf_versions.length ? 'Generate a new version' : 'Generate print file'}</Button>
            </div>
            {batch.pdf_versions.length > 0 && (() => {
              const activeD = dispatches.find(x => ['requested', 'sent', 'downloaded'].includes(x.status)) ?? dispatches[0]
              return (
                <div style={{ marginTop: '12px', padding: '12px 14px', borderRadius: '8px', background: 'var(--surface)', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                  {activeD ? (
                    <span style={{ fontSize: '14px', color: 'var(--ink2)' }}><strong>{DISPATCH_LABEL[activeD.status]}</strong> · file v{activeD.pdf_version} · {new Date(activeD.requested_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
                  ) : <span style={{ fontSize: '14px', color: 'var(--ink2)' }}>Ready to hand over? Notify Operations to review it and send it to the printer.</span>}
                  <div style={{ flex: 1 }} />
                  {(!activeD || activeD.status === 'revoked' || activeD.status === 'printed') && <Button variant="lime" disabled={!!activeJob || !!busy} onClick={() => setNotifyOpen(true)}>{activeD ? 'Send to Ops again' : 'Notify Ops'}</Button>}
                </div>
              )
            })()}
            {batch.pdf_versions.length > 0 && (
              <div style={{ marginTop: '10px', display: 'grid', gap: '6px' }}>
                {batch.pdf_versions.map((v, i) => (
                  <div key={v.key} style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '14px', color: 'var(--ink2)' }}>
                    <span>Version {i + 1} · {v.badges} badges · {new Date(v.generated_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                    <Button variant="ghost" onClick={() => void download(i + 1)}>Download</Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* filters */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', flexWrap: 'wrap' }}>
          {([['all', 'All'], ['flagged', 'Flagged'], ['unapproved', 'Not approved'], ['removed', 'Removed']] as const).map(([k, label]) => (
            <button key={k} onClick={() => setFilter(k)} style={{ padding: '6px 14px', borderRadius: '20px', border: '1.5px solid var(--border)', background: filter === k ? 'var(--ink)' : 'transparent', color: filter === k ? 'var(--card)' : 'var(--ink2)', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>{label}</button>
          ))}
        </div>

        {/* grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: '16px' }}>
          {shown.map(item => (
            <div key={item.id} style={{ border: `1.5px solid ${item.approved ? 'var(--teal)' : 'var(--border-light)'}`, borderRadius: '12px', background: 'var(--card)', overflow: 'hidden', opacity: item.removed ? 0.55 : 1 }}>
              <div style={{ aspectRatio: `${batch.canvas_width} / ${batch.canvas_height}`, background: 'var(--surface)', position: 'relative' }}>
                {item.preview_url ? (
                  // eslint-disable-next-line @next/next/no-img-element -- generated preview from storage
                  <img src={item.preview_url} alt={item.name ?? 'Badge'} style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block', opacity: item.preview_stale ? 0.4 : 1 }} />
                ) : <div style={{ padding: '40px 10px', textAlign: 'center', fontSize: '13px', color: 'var(--ink3)' }}>Not rendered yet</div>}
                {item.preview_stale && item.preview_url && <span style={{ position: 'absolute', top: '8px', left: '8px', fontSize: '12px', fontWeight: 700, padding: '3px 8px', borderRadius: '12px', background: 'var(--card)', color: 'var(--amber)', border: '1px solid var(--border)' }}>Out of date</span>}
              </div>
              <div style={{ padding: '10px 12px' }}>
                <div style={{ fontSize: '14.5px', fontWeight: 800, color: 'var(--ink)' }}>{item.overrides.name ?? item.name ?? '(no name)'}</div>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', margin: '6px 0 8px', minHeight: '22px' }}>
                  {item.flags.map(f => <span key={f.code} title={f.message} style={{ fontSize: '12px', fontWeight: 700, color: FLAG_COLOR[f.code], border: `1px solid ${FLAG_COLOR[f.code]}`, borderRadius: '10px', padding: '1px 8px' }}>{f.message}</span>)}
                  {Object.keys(item.overrides).length > 0 && <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--ink3)', border: '1px solid var(--border)', borderRadius: '10px', padding: '1px 8px' }}>Adjusted</span>}
                </div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {item.removed ? (
                    canManage && !locked && <Button variant="ghost" onClick={() => void patchItem(item, { removed: false })}>Restore</Button>
                  ) : (<>
                    {canManage && !locked && <Button variant={item.approved ? 'ghost' : 'lime'} disabled={item.preview_stale || !item.preview_url} onClick={() => void patchItem(item, { approved: !item.approved })}>{item.approved ? 'Approved ✓' : 'Approve'}</Button>}
                    {canManage && !locked && <Button variant="ghost" onClick={() => setAdjusting(item)}>Adjust</Button>}
                    {canManage && !locked && <Button variant="ghost" onClick={() => void patchItem(item, { removed: true })}>Remove</Button>}
                  </>)}
                </div>
              </div>
            </div>
          ))}
        </div>
        {shown.length === 0 && <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--ink3)', fontSize: '14px' }}>Nothing here.</div>}

        {canManage && (
          <div style={{ marginTop: '36px', paddingTop: '16px', borderTop: '1px solid var(--border-light)' }}>
            <Button variant="red" onClick={() => setDeleting(true)}>Delete batch</Button>
          </div>
        )}
      </div>

      {adjusting && (
        <AdjustModal item={items.find(i => i.id === adjusting.id) ?? adjusting} onClose={() => setAdjusting(null)}
          onApply={async (overrides) => patchItem(adjusting, { overrides, render: true })} canvas={{ w: batch.canvas_width, h: batch.canvas_height }} />
      )}
      {deleting && <DeleteModal name={batch.name} onClose={() => setDeleting(false)} onConfirm={async () => {
        const r = await api(`/api/events/badges/batches/${batchId}`, 'DELETE', { confirm: 'DELETE' })
        if (!r.ok) { say(String(r.data.error ?? 'Could not delete.'), 'error'); return }
        router.push(`/admin/events/${eventId}/stakeholders/badges`)
      }} />}
      {notifyOpen && (
        <NotifyOpsModal versions={batch.pdf_versions} onClose={() => setNotifyOpen(false)} onSend={async (version, note) => {
          const r = await api(`/api/events/badges/batches/${batchId}/dispatch`, 'POST', { version, note })
          if (!r.ok) { say(String(r.data.error ?? 'Could not notify Ops.'), 'error'); return }
          setNotifyOpen(false); say('Operations has been notified.'); await load()
        }} />
      )}
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  )
}

function NotifyOpsModal({ versions, onClose, onSend }: { versions: Array<{ generated_at: string; badges: number }>; onClose: () => void; onSend: (version: number, note: string) => Promise<void> }) {
  const [version, setVersion] = useState(versions.length)
  const [note, setNote] = useState('')
  const [working, setWorking] = useState(false)
  return modalShell(
    <>
      <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--ink)', marginBottom: '8px' }}>Notify Operations</div>
      <div style={{ fontSize: '14px', color: 'var(--ink2)', lineHeight: 1.5, marginBottom: '12px' }}>The person responsible for Badge Printing gets an email and a notification. They will review this file and send it to the print vendor.</div>
      {versions.length > 1 && (
        <label style={{ fontSize: '13px', color: 'var(--ink3)', display: 'block', marginBottom: '10px' }}>Which print file
          <select value={version} onChange={e => setVersion(Number(e.target.value))} style={{ display: 'block', width: '100%', marginTop: '4px', padding: '9px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--ink)' }}>
            {versions.map((v, i) => <option key={i} value={i + 1}>Version {i + 1} — {v.badges} badges, {new Date(v.generated_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</option>)}
          </select>
        </label>
      )}
      <label style={{ fontSize: '13px', color: 'var(--ink3)' }}>Note for Ops (optional)
        <Input value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Please print by Friday" style={{ marginTop: '4px' }} />
      </label>
      <div style={{ marginTop: '14px', display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="lime" disabled={working} onClick={async () => { setWorking(true); await onSend(version, note); setWorking(false) }}>{working ? 'Sending…' : 'Notify Ops'}</Button>
      </div>
    </>, onClose, 460)
}

function modalShell(children: React.ReactNode, onClose: () => void, width = 560) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'color-mix(in srgb, black 65%, transparent)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ width: `${width}px`, maxWidth: '100%', maxHeight: '100%', overflow: 'auto', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px', padding: '20px' }}>{children}</div>
    </div>
  )
}

function AdjustModal({ item, onClose, onApply, canvas }: { item: BadgeItemRow; onClose: () => void; onApply: (o: BadgeOverrides) => Promise<BadgeItemRow | null>; canvas: { w: number; h: number } }) {
  const o = item.overrides ?? {}
  const frozen = { name: item.name ?? '', title: item.title ?? '', company: item.company ?? '', country: item.country ?? '' }
  // The boxes start with what the badge currently says (an earlier adjustment, else the speaker's own text) so it can be edited in place.
  const [text, setText] = useState({ name: o.name ?? frozen.name, title: o.title ?? frozen.title, company: o.company ?? frozen.company, country: o.country ?? frozen.country })
  const [photo, setPhoto] = useState({ dx: o.photo?.dx ?? 0, dy: o.photo?.dy ?? 0, zoom: o.photo?.zoom ?? 1 })
  const [working, setWorking] = useState(false)

  function build(): BadgeOverrides {
    const out: BadgeOverrides = {}
    // Only text that differs from the speaker record is stored as an adjustment (an emptied box falls back to the record).
    for (const k of ['name', 'title', 'company', 'country'] as const) if (text[k].trim() && text[k].trim() !== frozen[k].trim()) out[k] = text[k].trim()
    if (photo.dx || photo.dy || photo.zoom !== 1) out.photo = { dx: photo.dx, dy: photo.dy, zoom: photo.zoom }
    return out
  }
  async function apply(overrides: BadgeOverrides) { setWorking(true); await onApply(overrides); setWorking(false) }
  const slider = (label: string, value: number, min: number, max: number, step: number, set: (v: number) => void, show: string) => (
    <label style={{ display: 'block', fontSize: '13px', color: 'var(--ink3)' }}>
      {label}: <strong style={{ color: 'var(--ink)' }}>{show}</strong>
      <input type="range" min={min} max={max} step={step} value={value} onChange={e => set(Number(e.target.value))} style={{ width: '100%', display: 'block', marginTop: '4px' }} />
    </label>
  )
  return modalShell(
    <>
      <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--ink)', marginBottom: '12px' }}>Adjust badge — {item.name}</div>
      <div style={{ display: 'flex', gap: '18px', flexWrap: 'wrap' }}>
        <div style={{ flex: '0 0 190px' }}>
          {item.preview_url ? (
            // eslint-disable-next-line @next/next/no-img-element -- generated preview from storage
            <img src={item.preview_url} alt="Badge preview" style={{ width: '190px', aspectRatio: `${canvas.w} / ${canvas.h}`, objectFit: 'contain', border: '1px solid var(--border-light)', borderRadius: '8px', opacity: working || item.preview_stale ? 0.4 : 1 }} />
          ) : <div style={{ width: '190px', height: '290px', border: '1px dashed var(--border)', borderRadius: '8px' }} />}
        </div>
        <div style={{ flex: '1 1 260px', display: 'grid', gap: '10px', alignContent: 'start' }}>
          <div style={{ fontSize: '13px', color: 'var(--ink3)', lineHeight: 1.5 }}>Edit the text in place. It applies to this badge only; the speaker record isn&apos;t touched. Press <strong>Shift + Enter</strong> to start a new line (to control where a word breaks); <strong>Enter</strong> applies and previews.</div>
          {(['name', 'title', 'company', 'country'] as const).map(k => (
            <label key={k} style={{ fontSize: '13px', color: 'var(--ink3)' }}>{k === 'title' ? 'Job title' : k[0].toUpperCase() + k.slice(1)}
              <textarea value={text[k]} rows={Math.max(1, text[k].split('\n').length)}
                onChange={e => setText(t => ({ ...t, [k]: e.target.value }))}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (!working) void apply(build()) } }}
                style={{ display: 'block', width: '100%', boxSizing: 'border-box', marginTop: '3px', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--ink)', fontSize: '14px', fontFamily: 'inherit', resize: 'none', lineHeight: 1.4 }} />
            </label>
          ))}
          <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink2)', marginTop: '4px' }}>Photo position</div>
          {slider('Left / right', photo.dx, -0.15, 0.15, 0.005, v => setPhoto(p => ({ ...p, dx: v })), `${(photo.dx * 100).toFixed(1)}%`)}
          {slider('Up / down', photo.dy, -0.15, 0.15, 0.005, v => setPhoto(p => ({ ...p, dy: v })), `${(photo.dy * 100).toFixed(1)}%`)}
          {slider('Size', photo.zoom, 0.8, 1.3, 0.01, v => setPhoto(p => ({ ...p, zoom: v })), `${Math.round(photo.zoom * 100)}%`)}
        </div>
      </div>
      <div style={{ marginTop: '16px', display: 'flex', gap: '8px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        <Button variant="ghost" disabled={working} onClick={() => { setText(frozen); setPhoto({ dx: 0, dy: 0, zoom: 1 }); void apply({}) }}>Reset adjustments</Button>
        <Button variant="ghost" onClick={onClose}>Close</Button>
        <Button variant="lime" disabled={working} onClick={() => void apply(build())}>{working ? 'Rendering…' : 'Apply & preview'}</Button>
      </div>
    </>, onClose, 640)
}

function DeleteModal({ name, onClose, onConfirm }: { name: string; onClose: () => void; onConfirm: () => Promise<void> }) {
  const [typed, setTyped] = useState('')
  const [working, setWorking] = useState(false)
  return modalShell(
    <>
      <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--red)', marginBottom: '8px' }}>Delete “{name}”?</div>
      <div style={{ fontSize: '14px', color: 'var(--ink2)', lineHeight: 1.5, marginBottom: '12px' }}>This permanently removes the batch, its adjustments and every print file generated from it. The speaker records are not touched.</div>
      <label style={{ fontSize: '13px', color: 'var(--ink3)' }}>Type DELETE to confirm
        <Input value={typed} onChange={e => setTyped(e.target.value)} style={{ marginTop: '4px' }} />
      </label>
      <div style={{ marginTop: '14px', display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="red" disabled={typed !== 'DELETE' || working} onClick={async () => { setWorking(true); await onConfirm(); setWorking(false) }}>{working ? 'Deleting…' : 'Delete batch'}</Button>
      </div>
    </>, onClose, 460)
}
