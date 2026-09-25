'use client'

import { use, useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ErrorBox, readError, ghostBtn, linkBtn, type ApiError } from '../../ui'

type Detail = {
  id: string; batch_number: number; event_name: string; status: string
  sent_at: string | null; expires_at: string | null; downloaded_at: string | null; completed_at: string | null; completion_type: string | null
  can_download: boolean; can_respond: boolean
  delete_by: string | null; acknowledged: boolean
  deletion_confirmed_at: string | null; deletion_confirmed_by_name: string | null; can_confirm_deletion_only: boolean
  speakers: { name: string; job_title: string | null; company: string | null; country: string | null; uae_resident: boolean; documents: string[] }[]
  license_files: { file_name: string; uploaded_at: string }[]
}

const primary = (enabled: boolean): React.CSSProperties => ({
  padding: '11px 20px', borderRadius: '8px', border: 'none', background: 'var(--teal)', color: 'var(--teal-light)',
  fontSize: '14px', fontWeight: 700, cursor: enabled ? 'pointer' : 'not-allowed', opacity: enabled ? 1 : 0.45,
})
const panel: React.CSSProperties = { padding: '18px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--card)', marginBottom: '18px' }
const tickRow: React.CSSProperties = { display: 'flex', gap: '10px', alignItems: 'flex-start', cursor: 'pointer', fontSize: '14px', fontWeight: 600, color: 'var(--ink)', lineHeight: 1.5 }

const fmtDate = (d: string | null) => d ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(d) ? d + 'T00:00:00Z' : d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: /^\d{4}-\d{2}-\d{2}$/.test(d) ? 'UTC' : undefined }) : ''

export default function VendorBatchPage({ params }: { params: Promise<{ batchId: string }> }) {
  const { batchId } = use(params)
  const router = useRouter()
  const [d, setD] = useState<Detail | null>(null)
  const [error, setError] = useState<ApiError | null>(null)
  const [busy, setBusy] = useState<'download' | 'ack' | 'submit' | 'confirm' | null>(null)
  const [ackTick, setAckTick] = useState(false)
  const [deletedTick, setDeletedTick] = useState(false)
  const [mode, setMode] = useState<'upload' | 'approve'>('upload')
  const [file, setFile] = useState<File | null>(null)
  const [confirmNoFile, setConfirmNoFile] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  const reload = useCallback(() => setTick(t => t + 1), [])

  /** Sends the vendor where they need to be for a 401 (sign in) or the terms gate; returns true if it did. */
  const redirected = useCallback(async (res: Response): Promise<boolean> => {
    if (res.status === 401) { router.replace('/vendor-portal/login'); return true }
    if (res.status === 403) {
      const body = await res.clone().json().catch(() => null)
      if (body?.code === 'terms_required') { router.replace('/vendor-portal/terms'); return true }
    }
    return false
  }, [router])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const res = await fetch(`/vendor-portal/api/batches/${batchId}`)
      if (cancelled) return
      if (await redirected(res)) return
      if (!res.ok) { setError(await readError(res)); return }
      const body = await res.json()
      if (!cancelled) setD(body)
    })()
    return () => { cancelled = true }
  }, [batchId, redirected, tick])

  async function post(path: string, init: RequestInit): Promise<Response | null> {
    setError(null); setNotice(null)
    try {
      const res = await fetch(`/vendor-portal/api/batches/${batchId}/${path}`, init)
      if (await redirected(res)) return null
      if (!res.ok) { setError(await readError(res)); reload(); return null }
      return res
    } catch {
      setError({ error: 'That did not go through. Please try again.' })
      return null
    }
  }

  async function acknowledge() {
    setBusy('ack')
    const res = await post('acknowledge', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirm: true }) })
    setBusy(null)
    if (res) { setAckTick(false); reload() }
  }

  async function download() {
    setBusy('download'); setError(null); setNotice(null)
    try {
      const res = await fetch(`/vendor-portal/api/batches/${batchId}/download`)
      if (await redirected(res)) return
      if (!res.ok) { setError(await readError(res)); reload(); return }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `Batch-${d?.batch_number ?? ''}.zip`
      document.body.appendChild(a); a.click(); a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
      setNotice('Download complete. Trescon Ops has been notified.')
      reload()
    } catch {
      setError({ error: 'The download did not complete. Please try again.' })
    } finally { setBusy(null) }
  }

  async function submit() {
    if (!deletedTick) return
    if (mode === 'upload' && !file) return
    if (file && file.size > 20 * 1024 * 1024) { setError({ error: 'That file is larger than 20 MB. Please choose a smaller file.' }); return }
    if (mode === 'approve' && !confirmNoFile) { setConfirmNoFile(true); return }
    setBusy('submit')
    let res: Response | null
    if (mode === 'upload') {
      const form = new FormData(); form.append('file', file as File); form.append('confirm_deleted', 'true')
      res = await post('license', { method: 'POST', body: form })
    } else {
      res = await post('approve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirm_deleted: true }) })
    }
    setBusy(null); setConfirmNoFile(false)
    if (res) {
      setFile(null); setDeletedTick(false)
      setNotice(`Thank you. Batch ${d?.batch_number ?? ''} is complete and your deletion confirmation is recorded. Trescon Ops has been notified.`)
      reload()
    }
  }

  async function confirmDeletionOnly() {
    if (!deletedTick) return
    setBusy('confirm')
    const res = await post('confirm-deletion', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirm_deleted: true }) })
    setBusy(null)
    if (res) { setDeletedTick(false); setNotice('Thank you. Your deletion confirmation is recorded and Trescon Ops has been notified.'); reload() }
  }

  const deletedLabel = d ? `I confirm that I have deleted all copies of the documents for Batch ${d.batch_number}: the downloaded ZIP and extracted files, any drive or cloud folder, email attachments and devices.` : ''

  return (
    <div>
      <Link href="/vendor-portal" style={linkBtn}>← All batches</Link>
      <ErrorBox error={error} />
      {notice && <div role="status" style={{ margin: '14px 0', padding: '12px 14px', borderRadius: '8px', background: 'var(--lime-light)', color: 'var(--lime)', fontSize: '13px', fontWeight: 600 }}>{notice}</div>}
      {!d && !error && <p style={{ color: 'var(--ink3)', fontSize: '14px', marginTop: '16px' }}>Loading…</p>}
      {d && (
        <>
          <h1 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--ink)', margin: '14px 0 4px' }}>Batch {d.batch_number} · {d.event_name}</h1>
          <p style={{ fontSize: '13px', color: 'var(--ink3)', margin: '0 0 18px' }}>
            {d.speakers.length > 0 ? `${d.speakers.length} speaker${d.speakers.length === 1 ? '' : 's'}` : ''}
            {d.can_respond && d.expires_at ? `${d.speakers.length > 0 ? ' · ' : ''}available until ${new Date(d.expires_at).toLocaleString()}` : ''}
          </p>

          {d.can_respond ? (
            <>
              {/* ── Before download: acknowledge the deletion rule + date ── */}
              {!d.acknowledged ? (
                <div style={panel}>
                  <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--ink)', marginBottom: '8px' }}>Before you download</div>
                  <p style={{ fontSize: '14px', color: 'var(--ink2)', lineHeight: 1.6, margin: '0 0 12px' }}>
                    Delete every copy of these documents <strong>as soon as the permits are approved</strong>. You will be asked to confirm this when you submit the licence.
                    {d.delete_by ? <> In any case, no later than <strong>{fmtDate(d.delete_by)}</strong>.</> : null}
                  </p>
                  <label style={tickRow}>
                    <input type="checkbox" checked={ackTick} onChange={e => setAckTick(e.target.checked)} style={{ marginTop: '3px' }} />
                    <span>I understand, and will use these documents only for the licences of the speakers in this batch.</span>
                  </label>
                  <div style={{ marginTop: '14px' }}>
                    <button onClick={acknowledge} disabled={!ackTick || busy !== null} style={primary(ackTick && busy === null)}>
                      {busy === 'ack' ? 'Saving…' : 'Confirm and enable download'}
                    </button>
                  </div>
                </div>
              ) : (
                <div style={panel}>
                  <button onClick={download} disabled={busy !== null} style={primary(busy === null)}>
                    {busy === 'download' ? 'Preparing download…' : 'Download batch (ZIP)'}
                  </button>
                  <span style={{ fontSize: '12px', color: 'var(--ink3)', marginLeft: '12px' }}>Includes a manifest.csv and a folder per speaker. You can download again while access remains.</span>
                  {d.delete_by && <div style={{ fontSize: '12.5px', color: 'var(--ink2)', marginTop: '12px' }}>Delete every copy as soon as the permits are approved, and no later than <strong>{fmtDate(d.delete_by)}</strong>.</div>}
                </div>
              )}

              {/* ── Completion: confirm deletion → licence (or approval) → submit ── */}
              <div style={panel}>
                <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--ink)' }}>When the permits are approved: complete this batch</div>
                <p style={{ fontSize: '13px', color: 'var(--ink3)', margin: '4px 0 16px', lineHeight: 1.6 }}>
                  Delete every copy of this batch&rsquo;s documents as soon as the permits are approved. Then complete the steps below. Submitting ends your access to the documents.
                </p>

                <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--ink)', marginBottom: '8px' }}>Step 1: Confirm deletion</div>
                <label style={{ ...tickRow, marginBottom: '18px' }}>
                  <input type="checkbox" checked={deletedTick} onChange={e => { setDeletedTick(e.target.checked); setConfirmNoFile(false) }} style={{ marginTop: '3px' }} />
                  <span>{deletedLabel}</span>
                </label>

                <div style={{ opacity: deletedTick ? 1 : 0.45, pointerEvents: deletedTick ? 'auto' : 'none' }} aria-disabled={!deletedTick}>
                  <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--ink)', marginBottom: '8px' }}>Step 2: Your licence <span style={{ fontWeight: 500, color: 'var(--ink3)' }}>(choose one)</span></div>
                  <div style={{ display: 'grid', gap: '10px', marginBottom: '18px' }}>
                    <label style={{ ...tickRow, fontWeight: 700 }}>
                      <input type="radio" name="mode" checked={mode === 'upload'} onChange={() => { setMode('upload'); setConfirmNoFile(false) }} style={{ marginTop: '3px' }} />
                      <span>Upload the licence copy</span>
                    </label>
                    {mode === 'upload' && (
                      <label style={{ display: 'block', margin: '0 0 4px 26px', padding: '18px 14px', borderRadius: '8px', border: `2px dashed ${file ? 'var(--teal)' : 'var(--border)'}`, textAlign: 'center', cursor: 'pointer', color: 'var(--ink2)', fontSize: '13px', fontWeight: 600 }}>
                        <input type="file" accept="application/pdf,image/jpeg,image/png" style={{ display: 'none' }}
                          onChange={e => { setError(null); setFile(e.target.files?.[0] ?? null) }} />
                        {file ? file.name : 'Click here to choose the licence file'}
                        <div style={{ fontSize: '11.5px', fontWeight: 500, color: 'var(--ink3)', marginTop: '4px' }}>
                          {file ? 'Click again to choose a different file' : 'PDF, JPG or PNG · max 20 MB'}
                        </div>
                      </label>
                    )}
                    <label style={{ ...tickRow, fontWeight: 700 }}>
                      <input type="radio" name="mode" checked={mode === 'approve'} onChange={() => { setMode('approve'); setConfirmNoFile(false) }} style={{ marginTop: '3px' }} />
                      <span>Confirm approval without a file</span>
                    </label>
                  </div>
                </div>

                {confirmNoFile ? (
                  <div style={{ display: 'grid', gap: '10px' }}>
                    <div style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--ink)' }}>This ends your access to this batch. Confirm?</div>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      <button onClick={submit} disabled={busy !== null} style={primary(busy === null)}>{busy === 'submit' ? 'Submitting…' : 'Yes, submit'}</button>
                      <button onClick={() => setConfirmNoFile(false)} style={ghostBtn}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <button onClick={submit} disabled={!deletedTick || (mode === 'upload' && !file) || busy !== null} style={primary(deletedTick && (mode === 'approve' || !!file) && busy === null)}>
                      {busy === 'submit' ? 'Submitting…' : 'Submit'}
                    </button>
                    {!deletedTick && <div style={{ fontSize: '11.5px', color: 'var(--ink3)', marginTop: '8px' }}>Tick Step 1 first — the next steps turn on once you have confirmed deletion.</div>}
                    {deletedTick && mode === 'upload' && !file && <div style={{ fontSize: '11.5px', color: 'var(--ink3)', marginTop: '8px' }}>Choose the licence file to enable Submit.</div>}
                  </>
                )}
              </div>
            </>
          ) : (
            <>
              <div style={{ padding: '14px 16px', borderRadius: '8px', background: 'var(--border-light)', color: 'var(--ink3)', fontSize: '13px', marginBottom: '18px' }}>
                {d.status === 'completed'
                  ? `This batch was completed${d.completed_at ? ` on ${new Date(d.completed_at).toLocaleDateString()}` : ''} and access to its documents has ended.`
                  : 'Access to this batch has ended. If you still need it, please check with the Trescon Ops team.'}
                {d.license_files.length > 0 && <div style={{ marginTop: '6px' }}>Licence on file: {d.license_files.map(f => f.file_name).join(', ')}</div>}
              </div>

              {d.deletion_confirmed_at && (
                <div style={{ padding: '12px 14px', borderRadius: '8px', background: 'var(--lime-light)', color: 'var(--lime)', fontSize: '13px', fontWeight: 600, marginBottom: '18px' }}>
                  ✓ Deletion confirmed{d.deletion_confirmed_by_name ? ` by ${d.deletion_confirmed_by_name}` : ''} on {new Date(d.deletion_confirmed_at).toLocaleString()}.
                </div>
              )}

              {d.can_confirm_deletion_only && (
                <div style={panel}>
                  <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--ink)', marginBottom: '6px' }}>Please confirm deletion</div>
                  <p style={{ fontSize: '13px', color: 'var(--ink3)', margin: '0 0 12px', lineHeight: 1.6 }}>
                    You downloaded this batch. Please delete every copy of its documents{d.delete_by ? <> (no later than <strong>{fmtDate(d.delete_by)}</strong>)</> : null} and confirm below.
                  </p>
                  <label style={{ ...tickRow, marginBottom: '14px' }}>
                    <input type="checkbox" checked={deletedTick} onChange={e => setDeletedTick(e.target.checked)} style={{ marginTop: '3px' }} />
                    <span>{deletedLabel}</span>
                  </label>
                  <button onClick={confirmDeletionOnly} disabled={!deletedTick || busy !== null} style={primary(deletedTick && busy === null)}>
                    {busy === 'confirm' ? 'Submitting…' : 'Confirm deletion'}
                  </button>
                </div>
              )}
            </>
          )}

          {d.speakers.length > 0 && (
            <>
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '8px' }}>Speakers in this batch</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {d.speakers.map((s, i) => (
                  <div key={i} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--card)', fontSize: '13px', color: 'var(--ink)' }}>
                    <strong>{s.name}</strong>
                    <span style={{ color: 'var(--ink3)' }}> · {[s.job_title, s.company, s.country].filter(Boolean).join(' · ')} · UAE resident: {s.uae_resident ? 'Yes' : 'No'} · {s.documents.join(' + ')}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
