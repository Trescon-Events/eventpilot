'use client'

import { use, useCallback, useEffect, useState } from 'react'
import PageHeader from '@/app/components/PageHeader'
import { useBreadcrumbLabel } from '@/app/lib/nav/breadcrumb-labels'

type Doc = { id: string; file_name: string; mime_type: string }
type Candidate = {
  id: string; name: string; job_title: string | null; company: string | null; country: string | null
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
type Data = { ready: Candidate[]; notReadyCount: number; batches: Batch[]; vendors: Vendor[] }
type Preview = { title: string; url: string; mime: string } | { error: string } | 'loading'

const STATUS: Record<string, { label: string; color: string; bg: string }> = {
  draft:      { label: 'Draft',      color: 'var(--ink3)',  bg: 'var(--border-light)' },
  sent:       { label: 'Sent',       color: 'var(--amber)', bg: 'var(--amber-light)' },
  downloaded: { label: 'Downloaded', color: 'var(--amber)', bg: 'var(--amber-light)' },
  completed:  { label: 'Completed',  color: 'var(--lime)',  bg: 'var(--lime-light)' },
  expired:    { label: 'Expired',    color: 'var(--ink3)',  bg: 'var(--border-light)' },
  cancelled:  { label: 'Cancelled',  color: 'var(--ink3)',  bg: 'var(--border-light)' },
}

export default function LicensesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = use(params)
  const [data, setData] = useState<Data | null>(null)
  const [eventName, setEventName] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<'ready' | 'batches'>('ready')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [vendorId, setVendorId] = useState('')
  const [days, setDays] = useState(7)
  const [creating, setCreating] = useState(false)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [reloadTick, setReloadTick] = useState(0)
  const reload = useCallback(() => setReloadTick(t => t + 1), [])

  useBreadcrumbLabel(eventId, eventName)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const [res, eRes] = await Promise.all([
        fetch(`/api/events/operations/licenses?event_id=${eventId}`),
        fetch(`/api/events?id=${eventId}`),
      ])
      const body = await res.json().catch(() => null)
      const ev = eRes.ok ? await eRes.json().catch(() => null) : null
      if (cancelled) return
      if (res.ok) { setData(body); setError(null) } else setError(body?.error ?? 'Could not load licences.')
      setEventName(ev?.name ?? null)
    })()
    return () => { cancelled = true }
  }, [eventId, reloadTick])

  const ready = data?.ready ?? []
  const effectiveVendor = vendorId || (data?.vendors.length === 1 ? data.vendors[0].id : '')
  // Only ever act on rows that are still ready (a refresh may have dropped some).
  const selectedIds = ready.filter(c => selected.has(c.id)).map(c => c.id)

  function toggle(id: string) {
    setSelected(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })
  }

  async function openDoc(title: string, docId: string) {
    setPreview('loading')
    const res = await fetch(`/api/events/operations/licenses/document?doc_id=${docId}`)
    const body = await res.json().catch(() => null)
    setPreview(res.ok ? { title, url: body.url, mime: body.mime_type } : { error: body?.error ?? 'Could not open the document.' })
  }

  async function createBatch() {
    setCreating(true); setError(null)
    const res = await fetch('/api/events/operations/licenses/batches', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_id: eventId, vendor_id: effectiveVendor, speaker_ids: selectedIds, access_days: days }),
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
                <div style={{ ...rowGrid, fontSize: '11px', fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.04em', padding: '0 14px 8px' }}>
                  <input type="checkbox" aria-label="Select all" checked={selectedIds.length === ready.length} onChange={e => setSelected(e.target.checked ? new Set(ready.map(c => c.id)) : new Set())} />
                  <div>Name</div><div>Job title</div><div>Company</div><div>Country</div><div>UAE resident</div><div>Documents</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {ready.map(c => (
                    <div key={c.id} style={{ ...rowGrid, padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border)', background: selected.has(c.id) ? 'var(--teal-light)' : 'var(--card)', fontSize: '13px', color: 'var(--ink)' }}>
                      <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} aria-label={`Select ${c.name}`} />
                      <div style={{ fontWeight: 700 }}>{c.name}</div>
                      <div style={cell}>{c.job_title || '—'}</div>
                      <div style={cell}>{c.company || '—'}</div>
                      <div style={cell}>{c.country || '—'}</div>
                      <div><span style={{ fontSize: '11px', fontWeight: 700, padding: '3px 8px', borderRadius: '999px', background: c.is_uae_resident ? 'var(--teal-light)' : 'var(--border-light)', color: c.is_uae_resident ? 'var(--teal)' : 'var(--ink3)' }}>{c.is_uae_resident ? 'Yes' : 'No'}</span></div>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <DocIcon label="Passport" onClick={() => openDoc(`${c.name} — Passport`, c.passport.id)} />
                        {c.national_id && <DocIcon label="National ID" onClick={() => openDoc(`${c.name} — National ID`, c.national_id!.id)} />}
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{ position: 'sticky', bottom: '16px', marginTop: '18px', padding: '12px 16px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--card)', display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink)' }}>{selectedIds.length} selected</span>
                  {data.vendors.length === 0 ? (
                    <span style={{ fontSize: '12px', color: 'var(--amber)' }}>No licence vendor is assigned to this event yet — add one under Vendors.</span>
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
              <MultiLicensePanel eventId={eventId} batches={data.batches} onChanged={reload} onError={setError} />
              {data.batches.map(b => <BatchCard key={b.id} batch={b} eventId={eventId} onCancel={() => cancelBatch(b)} onChanged={reload} onError={setError} />)}
            </div>
          )
        )}
      </div>

      {preview && <PreviewModal preview={preview} onClose={() => setPreview(null)} />}
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

async function uploadLicense(eventId: string, batchIds: string[], file: File): Promise<string | null> {
  const form = new FormData()
  form.append('event_id', eventId); form.append('batch_ids', JSON.stringify(batchIds)); form.append('file', file)
  const res = await fetch('/api/events/operations/licenses/files', { method: 'POST', body: form })
  return res.ok ? null : ((await res.json().catch(() => null))?.error ?? 'The upload failed.')
}

async function openLicenseFile(fileId: string, onError: (e: string) => void) {
  const res = await fetch(`/api/events/operations/licenses/files/${fileId}`)
  const body = await res.json().catch(() => null)
  if (!res.ok) { onError(body?.error ?? 'Could not open the file.'); return }
  window.open(body.url, '_blank', 'noopener,noreferrer')
}

function BatchCard({ batch: b, eventId, onCancel, onChanged, onError }: { batch: Batch; eventId: string; onCancel: () => void; onChanged: () => void; onError: (e: string | null) => void }) {
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
    const err = await uploadLicense(eventId, [b.id], file)
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
function MultiLicensePanel({ eventId, batches, onChanged, onError }: { eventId: string; batches: Batch[]; onChanged: () => void; onError: (e: string | null) => void }) {
  const eligible = batches.filter(b => ['sent', 'downloaded', 'expired', 'completed'].includes(b.status))
  const [open, setOpen] = useState(false)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  if (eligible.length < 2) return null

  async function upload(file: File | undefined) {
    if (!file || picked.size === 0) return
    setBusy(true); onError(null)
    const err = await uploadLicense(eventId, [...picked], file)
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

function PreviewModal({ preview, onClose }: { preview: Preview; onClose: () => void }) {
  const ok = typeof preview === 'object' && 'url' in preview ? preview : null
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'var(--overlay-scrim)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '24px' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--card)', borderRadius: '12px', width: 'min(900px, 100%)', height: 'min(85vh, 900px)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--ink)' }}>{ok ? ok.title : 'Document preview'}</div>
          <button onClick={onClose} style={btnGhost}>Close</button>
        </div>
        <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--surface)' }}>
          {preview === 'loading' && <span style={{ color: 'var(--ink3)', fontSize: '13px' }}>Opening…</span>}
          {typeof preview === 'object' && 'error' in preview && <span style={{ color: 'var(--amber)', fontSize: '13px' }}>{preview.error}</span>}
          {ok && (ok.mime.startsWith('image/')
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={ok.url} alt={ok.title} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
            : <iframe src={ok.url} title={ok.title} style={{ width: '100%', height: '100%', border: 0 }} />)}
        </div>
      </div>
    </div>
  )
}

const rowGrid: React.CSSProperties = { display: 'grid', gridTemplateColumns: '24px 1.4fr 1.2fr 1.2fr 0.9fr 0.8fr 1.1fr', gap: '12px', alignItems: 'center' }
const cell: React.CSSProperties = { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--ink3)' }
const field: React.CSSProperties = { padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--ink)', fontSize: '13px' }
const btnPrimary: React.CSSProperties = { padding: '9px 16px', borderRadius: '8px', border: 'none', background: 'var(--teal)', color: 'var(--teal-light)', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }
const btnGhost: React.CSSProperties = { padding: '7px 14px', borderRadius: '8px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--ink3)', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }
const tabOn: React.CSSProperties = { padding: '8px 14px', borderRadius: '8px', border: '1px solid var(--teal)', background: 'var(--teal-light)', color: 'var(--teal)', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }
const tabOff: React.CSSProperties = { padding: '8px 14px', borderRadius: '8px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--ink3)', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }
