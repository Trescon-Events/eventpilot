'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import PageHeader from '@/app/components/PageHeader'
import { useBreadcrumbLabel } from '@/app/lib/nav/breadcrumb-labels'
import SensitiveDocViewer from '@/app/components/SensitiveDocViewer'
import { useOpsScope } from './scope-context'
import EventDaysNotice from './EventDaysNotice'

type Doc = { id: string; file_name: string; mime_type: string }
type Candidate = {
  id: string; event_id: string; event_name: string; also_in: string[]; name: string; job_title: string | null; company: string | null; country: string | null
  is_uae_resident: boolean; passport: Doc; national_id: Doc | null
}
type BatchItem = {
  id: string; speaker_id: string; speaker_name: string; job_title: string | null; company: string | null
  country: string | null; is_uae_resident: boolean; flags: ('documents_changed' | 'speaker_cancelled')[]
}
type Batch = {
  id: string; batch_number: number; status: string; access_days: number; notes: string | null; vendor_name: string
  created_at: string; created_by_name: string | null; sent_at: string | null; expires_at: string | null
  downloaded_at: string | null; completed_at: string | null; completion_type: string | null; items: BatchItem[]
  license_files: { id: string; file_name: string; uploaded_by_type: string; created_at: string }[]
  vendor_id: string
}
type Vendor = { id: string; name: string }
type Data = { scope: { kind: 'event' | 'umbrella'; id: string; name: string; events: number }; ready: Candidate[]; notReadyCount: number; batches: Batch[]; vendors: Vendor[] }

const STATUS: Record<string, { label: string; color: string; bg: string }> = {
  draft:      { label: 'Draft',      color: 'var(--ink3)',  bg: 'var(--border-light)' },
  sent:       { label: 'Sent',       color: 'var(--amber)', bg: 'var(--amber-light)' },
  downloaded: { label: 'Downloaded', color: 'var(--amber)', bg: 'var(--amber-light)' },
  completed:  { label: 'Completed',  color: 'var(--lime)',  bg: 'var(--lime-light)' },
  expired:    { label: 'Expired',    color: 'var(--ink3)',  bg: 'var(--border-light)' },
  cancelled:  { label: 'Cancelled',  color: 'var(--ink3)',  bg: 'var(--border-light)' },
}

export default function LicensesView() {
  const opsScope = useOpsScope()
  const eventId = opsScope.id
  const [data, setData] = useState<Data | null>(null)
  const [eventName, setEventName] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<'ready' | 'batches'>('ready')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [vendorId, setVendorId] = useState('')
  const [days, setDays] = useState(7)
  const [creating, setCreating] = useState(false)
  const [viewer, setViewer] = useState<{ docId: string; title: string } | null>(null)
  const [reloadTick, setReloadTick] = useState(0)
  const reload = useCallback(() => setReloadTick(t => t + 1), [])

  useBreadcrumbLabel(eventId, eventName)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const res = await fetch(`/api/events/operations/licenses?${opsScope.query}`)
      const body = await res.json().catch(() => null)
      if (cancelled) return
      if (res.ok) { setData(body); setError(null); setEventName(body?.scope?.name ?? null) } else setError(body?.error ?? 'Could not load licences.')
    })()
    return () => { cancelled = true }
  }, [opsScope.query, reloadTick])

  const ready = data?.ready ?? []
  const isUmbrella = data?.scope.kind === 'umbrella'
  const liftedFromEvent = data?.scope.kind === 'umbrella' && opsScope.kind === 'event'
  const effectiveVendor = vendorId || (data?.vendors.length === 1 ? data.vendors[0].id : '')
  // Only ever act on rows that are still ready (a refresh may have dropped some).
  const selectedIds = ready.filter(c => selected.has(c.id)).map(c => c.id)

  function toggle(id: string) {
    setSelected(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })
  }

  async function createBatch() {
    setCreating(true); setError(null)
    const res = await fetch('/api/events/operations/licenses/batches', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...opsScope.body, vendor_id: effectiveVendor, speaker_ids: selectedIds, access_days: days }),
    })
    const body = await res.json().catch(() => null)
    setCreating(false)
    if (!res.ok) { setError(body?.error ?? 'Could not create the batch.'); reload(); return }
    setSelected(new Set()); setTab('batches'); reload()
  }

  async function cancelBatch(b: Batch) {
    if (!window.confirm(`Cancel Batch ${b.batch_number}? Its ${b.items.length} speaker(s) will go back to the ready list.`)) return
    setError(null)
    const res = await fetch(`/api/events/operations/licenses/batches/${b.id}/cancel`, { method: 'POST' })
    if (!res.ok) setError((await res.json().catch(() => null))?.error ?? 'Could not cancel the batch.')
    reload()
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--surface)' }}>
      <PageHeader
        eyebrow="Operations"
        title="Speaker Licences"
        description="Speakers appear here automatically once every required document has been reviewed by a producer. Group them into batches for the licence vendor."
      />
      <div style={{ padding: '24px 32px', maxWidth: '1100px' }}>
        {error && <div style={{ marginBottom: '14px', padding: '10px 14px', borderRadius: '8px', background: 'var(--amber-light)', color: 'var(--amber)', fontSize: '13px' }}>{error}</div>}
        {liftedFromEvent && data && (
          <div style={{ marginBottom: '14px', padding: '10px 14px', borderRadius: '8px', background: 'var(--teal-light)', color: 'var(--teal)', fontSize: '13px', lineHeight: 1.6 }}>
            Licences for this event are processed together at <strong>{data.scope.name}</strong> level — this list covers all {data.scope.events} of its events.{' '}
            <Link href={`/admin/umbrellas/${data.scope.id}/operations/licenses`} style={{ color: 'inherit', fontWeight: 700 }}>Open the {data.scope.name} workspace</Link>
          </div>
        )}
        <EventDaysNotice scope={data ? { kind: data.scope.kind, id: data.scope.id } : null} hubPath={data ? (data.scope.kind === 'umbrella' ? `/admin/umbrellas/${data.scope.id}/operations` : `/admin/events/${data.scope.id}/operations`) : opsScope.basePath} />

        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
          <button onClick={() => setTab('ready')} style={tab === 'ready' ? tabOn : tabOff}>Ready to apply ({ready.length})</button>
          <button onClick={() => setTab('batches')} style={tab === 'batches' ? tabOn : tabOff}>Batches ({data?.batches.length ?? 0})</button>
          {data && data.notReadyCount > 0 && (
            <span style={{ fontSize: '12px', color: 'var(--ink3)', marginLeft: 'auto' }}>
              {data.notReadyCount} more speaker{data.notReadyCount === 1 ? '' : 's'} still awaiting reviewed documents
            </span>
          )}
        </div>

        {!data && !error && <div style={{ color: 'var(--ink3)', fontSize: '13px' }}>Loading…</div>}

        {data && tab === 'ready' && (
          <>
            {ready.length === 0 ? (
              <div style={{ color: 'var(--ink3)', fontSize: '13px', padding: '40px 0', textAlign: 'center' }}>
                No speakers are ready right now. They appear here as soon as a producer marks their documents reviewed.
              </div>
            ) : (
              <>
                <div style={{ ...gridFor(isUmbrella), fontSize: '11px', fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.04em', padding: '0 14px 8px' }}>
                  <input type="checkbox" aria-label="Select all" checked={selectedIds.length === ready.length} onChange={e => setSelected(e.target.checked ? new Set(ready.map(c => c.id)) : new Set())} />
                  <div>Name</div>{isUmbrella && <div>Event</div>}<div>Job title</div><div>Company</div><div>Country</div><div>UAE resident</div><div>Documents</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {ready.map(c => (
                    <div key={c.id} style={{ ...gridFor(isUmbrella), padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border)', background: selected.has(c.id) ? 'var(--teal-light)' : 'var(--card)', fontSize: '13px', color: 'var(--ink)' }}>
                      <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} aria-label={`Select ${c.name}`} />
                      <div style={{ fontWeight: 700 }}>
                        {c.name}
                        {c.also_in.length > 0 && <span title={`Also a speaker at: ${c.also_in.join(', ')}`} style={{ marginLeft: '6px', fontSize: '10px', fontWeight: 700, color: 'var(--amber)' }}>also in {c.also_in.length} other event{c.also_in.length === 1 ? '' : 's'}</span>}
                      </div>
                      {isUmbrella && <div style={cell} title={c.event_name}>{c.event_name}</div>}
                      <div style={cell}>{c.job_title || '—'}</div>
                      <div style={cell}>{c.company || '—'}</div>
                      <div style={cell}>{c.country || '—'}</div>
                      <div><span style={{ fontSize: '11px', fontWeight: 700, padding: '3px 8px', borderRadius: '999px', background: c.is_uae_resident ? 'var(--teal-light)' : 'var(--border-light)', color: c.is_uae_resident ? 'var(--teal)' : 'var(--ink3)' }}>{c.is_uae_resident ? 'Yes' : 'No'}</span></div>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <DocIcon label="Passport" onClick={() => setViewer({ docId: c.passport.id, title: `${c.name} — Passport` })} />
                        {c.national_id && <DocIcon label="National ID" onClick={() => setViewer({ docId: c.national_id!.id, title: `${c.name} — National ID` })} />}
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{ position: 'sticky', bottom: '16px', marginTop: '18px', padding: '12px 16px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--card)', display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink)' }}>{selectedIds.length} selected</span>
                  {data.vendors.length === 0 ? (
                    <span style={{ fontSize: '12px', color: 'var(--amber)' }}>No licence vendor is assigned here yet — add one under Vendors.</span>
                  ) : (
                    <>
                      <select value={effectiveVendor} onChange={e => setVendorId(e.target.value)} style={field}>
                        <option value="">Choose vendor…</option>
                        {data.vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                      </select>
                      <label style={{ fontSize: '12px', color: 'var(--ink3)', display: 'flex', gap: '6px', alignItems: 'center' }}>
                        Vendor access
                        <input type="number" min={1} max={30} value={days} onChange={e => setDays(Math.min(30, Math.max(1, Number(e.target.value) || 1)))} style={{ ...field, width: '64px' }} />
                        days (max 30)
                      </label>
                      <button onClick={createBatch} disabled={creating || selectedIds.length === 0 || !effectiveVendor} style={{ ...btnPrimary, opacity: creating || selectedIds.length === 0 || !effectiveVendor ? 0.5 : 1, marginLeft: 'auto' }}>
                        {creating ? 'Creating…' : 'Create batch'}
                      </button>
                    </>
                  )}
                </div>
              </>
            )}
          </>
        )}

        {data && tab === 'batches' && (
          data.batches.length === 0 ? (
            <div style={{ color: 'var(--ink3)', fontSize: '13px', padding: '40px 0', textAlign: 'center' }}>No batches yet. Select ready speakers and create the first one.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <MultiLicensePanel batches={data.batches} onChanged={reload} onError={setError} />
              {data.batches.map(b => <BatchCard key={b.id} batch={b} onCancel={() => cancelBatch(b)} onChanged={reload} onError={setError} />)}
            </div>
          )
        )}
      </div>

      {viewer && <SensitiveDocViewer docId={viewer.docId} title={viewer.title} onClose={() => setViewer(null)} />}
    </div>
  )
}

const COMPLETION_LABEL: Record<string, string> = { license_uploaded: 'Licence uploaded', approved: 'Approved (no file)' }
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : '—')

async function postAction(batchId: string, body: Record<string, unknown>): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; error: string }> {
  const res = await fetch(`/api/events/operations/licenses/batches/${batchId}/action`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const data = await res.json().catch(() => ({}))
  return res.ok ? { ok: true, data } : { ok: false, error: data?.error ?? 'That did not go through.' }
}

async function uploadLicense(scopeBody: Record<string, string>, batchIds: string[], file: File): Promise<string | null> {
  const form = new FormData()
  for (const [k, v] of Object.entries(scopeBody)) form.append(k, v)
  form.append('batch_ids', JSON.stringify(batchIds)); form.append('file', file)
  const res = await fetch('/api/events/operations/licenses/files', { method: 'POST', body: form })
  return res.ok ? null : ((await res.json().catch(() => null))?.error ?? 'The upload failed.')
}

async function openLicenseFile(fileId: string, onError: (e: string) => void) {
  const res = await fetch(`/api/events/operations/licenses/files/${fileId}`)
  if (!res.ok) { onError((await res.json().catch(() => null))?.error ?? 'Could not open the file.'); return }
  // The server streams the file (no storage link exists); open it from a local blob URL.
  window.open(URL.createObjectURL(await res.blob()), '_blank', 'noopener')
}

function BatchCard({ batch: b, onCancel, onChanged, onError }: { batch: Batch; onCancel: () => void; onChanged: () => void; onError: (e: string | null) => void }) {
  const scope = useOpsScope()
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState<null | 'send' | 'extend' | 'reopen' | 'revoke' | 'approve'>(null)
  const [days, setDays] = useState(b.access_days)
  const [busy, setBusy] = useState(false)
  const st = STATUS[b.status] ?? STATUS.draft
  const flagged = b.items.filter(i => i.flags.length).length
  const live = b.status === 'sent' || b.status === 'downloaded'

  async function run(body: Record<string, unknown>, okMessage?: string) {
    setBusy(true); onError(null)
    const r = await postAction(b.id, body)
    setBusy(false)
    if (!r.ok) onError(r.error)
    else {
      if (body.action === 'send' && typeof r.data.emailed === 'number') onError(`${okMessage ?? 'Sent.'} Notice emailed to ${r.data.emailed} of ${String(r.data.of)} vendor login(s).`)
      setPending(null)
    }
    onChanged()
  }
  async function attachLicense(file: File | undefined) {
    if (!file) return
    setBusy(true); onError(null)
    const err = await uploadLicense(scope.body, [b.id], file)
    setBusy(false)
    if (err) onError(err)
    onChanged()
  }

  return (
    <div style={{ borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--card)' }}>
      <div style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
        <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--ink)' }}>Batch {b.batch_number}</div>
        <span style={{ fontSize: '11px', fontWeight: 700, padding: '4px 10px', borderRadius: '999px', color: st.color, background: st.bg }}>{st.label}</span>
        {b.status === 'completed' && b.completion_type && <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--lime)' }}>{COMPLETION_LABEL[b.completion_type] ?? b.completion_type}</span>}
        <div style={{ fontSize: '12px', color: 'var(--ink3)' }}>
          {b.vendor_name} · {b.items.length} speaker{b.items.length === 1 ? '' : 's'} · {b.access_days}-day access
          {b.created_by_name ? ` · created by ${b.created_by_name}` : ''} · {new Date(b.created_at).toLocaleDateString()}
        </div>
        {flagged > 0 && <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--amber)' }}>⚠ {flagged} changed since batch</span>}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button onClick={() => setOpen(o => !o)} style={btnGhost}>{open ? 'Hide details' : 'Details'}</button>
          {b.status === 'draft' && <><button onClick={() => setPending('send')} disabled={busy} style={btnPrimary}>Send to vendor</button><button onClick={onCancel} style={btnGhost}>Cancel batch</button></>}
          {live && <><button onClick={() => setPending('extend')} style={btnGhost}>Extend</button><button onClick={() => setPending('revoke')} style={btnGhost}>Revoke access</button></>}
          {(b.status === 'completed' || b.status === 'expired') && <button onClick={() => setPending('reopen')} style={btnGhost}>Reopen</button>}
        </div>
      </div>

      {pending && (
        <div style={{ borderTop: '1px solid var(--border)', padding: '12px 18px', display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap', background: 'var(--surface)', fontSize: '13px', color: 'var(--ink)' }}>
          {(pending === 'send' || pending === 'extend' || pending === 'reopen') && (
            <>
              <span>{pending === 'send' ? 'Make available to the vendor for' : pending === 'extend' ? 'Extend access to' : 'Reopen for'}</span>
              <input type="number" min={1} max={30} value={days} onChange={e => setDays(Math.min(30, Math.max(1, Number(e.target.value) || 1)))} style={{ ...field, width: '64px' }} />
              <span>days from now (max 30)</span>
              <button disabled={busy} onClick={() => run({ action: pending, days }, 'Sent.')} style={btnPrimary}>{busy ? 'Working…' : pending === 'send' ? 'Send now' : 'Confirm'}</button>
            </>
          )}
          {pending === 'revoke' && (
            <>
              <span>Vendor access ends immediately and the speakers return to the ready list. Files the vendor already downloaded stay with them.</span>
              <button disabled={busy} onClick={() => run({ action: 'revoke' })} style={btnPrimary}>{busy ? 'Working…' : 'Revoke access'}</button>
            </>
          )}
          {pending === 'approve' && (
            <>
              <span>Mark this batch approved without a licence file? Vendor access ends.</span>
              <button disabled={busy} onClick={() => run({ action: 'mark_approved' })} style={btnPrimary}>{busy ? 'Working…' : 'Mark approved'}</button>
            </>
          )}
          <button onClick={() => setPending(null)} style={btnGhost}>Cancel</button>
        </div>
      )}

      {open && (
        <div style={{ borderTop: '1px solid var(--border)', padding: '12px 18px 14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ fontSize: '12px', color: 'var(--ink3)', display: 'flex', gap: '18px', flexWrap: 'wrap' }}>
            <span>Sent: {when(b.sent_at)}</span>
            <span>Access until: {when(b.expires_at)}</span>
            <span>Downloaded: {when(b.downloaded_at)}</span>
            <span>Completed: {when(b.completed_at)}</span>
          </div>
          {b.status !== 'draft' && b.status !== 'cancelled' && (
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', fontSize: '12px', color: 'var(--ink3)' }}>
              <label style={{ ...btnGhost, cursor: 'pointer' }}>
                {busy ? 'Uploading…' : 'Upload licence copy'}
                <input type="file" accept="application/pdf,image/jpeg,image/png" style={{ display: 'none' }} disabled={busy} onChange={e => { attachLicense(e.target.files?.[0]); e.target.value = '' }} />
              </label>
              {b.status !== 'completed' && <button onClick={() => setPending('approve')} style={btnGhost}>Mark approved (no file)</button>}
              {b.license_files.map(f => (
                <button key={f.id} onClick={() => openLicenseFile(f.id, e => onError(e))} style={{ ...btnGhost, color: 'var(--teal)' }}>
                  View {f.file_name} ({f.uploaded_by_type === 'vendor' ? 'vendor' : 'ops'})
                </button>
              ))}
            </div>
          )}
          {b.items.map(i => (
            <div key={i.id} style={{ fontSize: '13px', color: 'var(--ink)', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <strong>{i.speaker_name}</strong>
              <span style={{ color: 'var(--ink3)' }}>{[i.job_title, i.company, i.country].filter(Boolean).join(' · ')} · UAE resident: {i.is_uae_resident ? 'Yes' : 'No'}</span>
              {i.flags.includes('documents_changed') && <span style={{ color: 'var(--amber)', fontWeight: 700, fontSize: '11px' }}>documents changed since batch</span>}
              {i.flags.includes('speaker_cancelled') && <span style={{ color: 'var(--amber)', fontWeight: 700, fontSize: '11px' }}>speaker cancelled</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* One licence often covers several batches (ops may receive a single licence at the end). */
function MultiLicensePanel({ batches, onChanged, onError }: { batches: Batch[]; onChanged: () => void; onError: (e: string | null) => void }) {
  const scope = useOpsScope()
  const eligible = batches.filter(b => ['sent', 'downloaded', 'expired', 'completed'].includes(b.status))
  const [open, setOpen] = useState(false)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  if (eligible.length < 2) return null

  async function upload(file: File | undefined) {
    if (!file || picked.size === 0) return
    setBusy(true); onError(null)
    const err = await uploadLicense(scope.body, [...picked], file)
    setBusy(false)
    if (err) onError(err); else { setPicked(new Set()); setOpen(false) }
    onChanged()
  }
  return (
    <div style={{ borderRadius: '10px', border: '1px dashed var(--border)', padding: '12px 16px', fontSize: '13px', color: 'var(--ink3)' }}>
      {!open ? (
        <button onClick={() => setOpen(true)} style={btnGhost}>One licence for several batches…</button>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div>Pick the batches this licence covers (same vendor), then choose the file. Batches not yet completed will be completed.</div>
          <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
            {eligible.map(b => (
              <label key={b.id} style={{ display: 'flex', gap: '6px', alignItems: 'center', color: 'var(--ink)' }}>
                <input type="checkbox" checked={picked.has(b.id)} onChange={() => setPicked(p => { const n = new Set(p); if (n.has(b.id)) n.delete(b.id); else n.add(b.id); return n })} />
                Batch {b.batch_number} <span style={{ color: 'var(--ink3)' }}>({b.vendor_name})</span>
              </label>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <label style={{ ...btnPrimary, cursor: picked.size && !busy ? 'pointer' : 'not-allowed', opacity: picked.size && !busy ? 1 : 0.5 }}>
              {busy ? 'Uploading…' : `Choose file for ${picked.size} batch${picked.size === 1 ? '' : 'es'}`}
              <input type="file" accept="application/pdf,image/jpeg,image/png" style={{ display: 'none' }} disabled={!picked.size || busy} onChange={e => { upload(e.target.files?.[0]); e.target.value = '' }} />
            </label>
            <button onClick={() => setOpen(false)} style={btnGhost}>Close</button>
          </div>
        </div>
      )}
    </div>
  )
}

function DocIcon({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} title={`Preview ${label}`} aria-label={`Preview ${label}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 8px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--ink)', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>
      <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
      {label === 'Passport' ? 'Passport' : 'ID'}
    </button>
  )
}

const gridFor = (umbrella: boolean): React.CSSProperties => ({ display: 'grid', gridTemplateColumns: umbrella ? '24px 1.5fr 1.3fr 1.2fr 1.2fr 0.9fr 0.8fr 1.1fr' : '24px 1.4fr 1.2fr 1.2fr 0.9fr 0.8fr 1.1fr', gap: '12px', alignItems: 'center' })
const cell: React.CSSProperties = { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--ink3)' }
const field: React.CSSProperties = { padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--ink)', fontSize: '13px' }
const btnPrimary: React.CSSProperties = { padding: '9px 16px', borderRadius: '8px', border: 'none', background: 'var(--teal)', color: 'var(--teal-light)', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }
const btnGhost: React.CSSProperties = { padding: '7px 14px', borderRadius: '8px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--ink3)', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }
const tabOn: React.CSSProperties = { padding: '8px 14px', borderRadius: '8px', border: '1px solid var(--teal)', background: 'var(--teal-light)', color: 'var(--teal)', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }
const tabOff: React.CSSProperties = { padding: '8px 14px', borderRadius: '8px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--ink3)', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }
