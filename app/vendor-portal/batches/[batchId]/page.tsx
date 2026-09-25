'use client'

import { use, useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ErrorBox, readError, ghostBtn, linkBtn, type ApiError } from '../../ui'

type Detail = {
  id: string; batch_number: number; event_name: string; status: string
  sent_at: string | null; expires_at: string | null; downloaded_at: string | null; completed_at: string | null; completion_type: string | null
  can_download: boolean; can_respond: boolean
  speakers: { name: string; job_title: string | null; company: string | null; country: string | null; uae_resident: boolean; documents: string[] }[]
  license_files: { file_name: string; uploaded_at: string }[]
}

export default function VendorBatchPage({ params }: { params: Promise<{ batchId: string }> }) {
  const { batchId } = use(params)
  const router = useRouter()
  const [d, setD] = useState<Detail | null>(null)
  const [error, setError] = useState<ApiError | null>(null)
  const [busy, setBusy] = useState<'download' | 'upload' | 'approve' | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [confirmApprove, setConfirmApprove] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  const reload = useCallback(() => setTick(t => t + 1), [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const res = await fetch(`/vendor-portal/api/batches/${batchId}`)
      if (cancelled) return
      if (res.status === 401) { router.replace('/vendor-portal/login'); return }
      if (!res.ok) { setError(await readError(res)); return }
      const body = await res.json()
      if (!cancelled) setD(body)
    })()
    return () => { cancelled = true }
  }, [batchId, router, tick])

  async function download() {
    setBusy('download'); setError(null); setNotice(null)
    try {
      const res = await fetch(`/vendor-portal/api/batches/${batchId}/download`)
      if (res.status === 401) { router.replace('/vendor-portal/login'); return }
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

  async function upload() {
    if (!file) return
    if (file.size > 20 * 1024 * 1024) { setError({ error: 'That file is larger than 20 MB. Please choose a smaller file.' }); return }
    setBusy('upload'); setError(null); setNotice(null)
    try {
      const form = new FormData(); form.append('file', file)
      const res = await fetch(`/vendor-portal/api/batches/${batchId}/license`, { method: 'POST', body: form })
      if (res.status === 401) { router.replace('/vendor-portal/login'); return }
      if (!res.ok) { setError(await readError(res)); reload(); return }
      setFile(null); setNotice('Licence uploaded. Thank you — Trescon Ops has been notified.'); reload()
    } catch {
      setError({ error: 'The upload did not complete. Please try again.' })
    } finally { setBusy(null) }
  }

  async function approve() {
    setBusy('approve'); setError(null); setNotice(null)
    try {
      const res = await fetch(`/vendor-portal/api/batches/${batchId}/approve`, { method: 'POST' })
      if (res.status === 401) { router.replace('/vendor-portal/login'); return }
      if (!res.ok) { setError(await readError(res)); reload(); return }
      setConfirmApprove(false); setNotice('Thank you — Trescon Ops has been notified that this batch was approved.'); reload()
    } catch {
      setError({ error: 'That did not go through. Please try again.' })
    } finally { setBusy(null) }
  }

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
            {d.speakers.length} speaker{d.speakers.length === 1 ? '' : 's'}
            {d.can_download && d.expires_at ? ` · available until ${new Date(d.expires_at).toLocaleString()}` : ''}
          </p>

          {d.can_download ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', padding: '18px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--card)', marginBottom: '22px' }}>
              <div>
                <button onClick={download} disabled={busy !== null} style={{ padding: '11px 20px', borderRadius: '8px', border: 'none', background: 'var(--teal)', color: 'var(--teal-light)', fontSize: '14px', fontWeight: 700, cursor: 'pointer', opacity: busy ? 0.6 : 1 }}>
                  {busy === 'download' ? 'Preparing download…' : 'Download batch (ZIP)'}
                </button>
                <span style={{ fontSize: '12px', color: 'var(--ink3)', marginLeft: '12px' }}>Includes a manifest.csv and a folder per speaker. You can download again while access remains.</span>
              </div>
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: '16px', display: 'grid', gap: '12px' }}>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--ink)' }}>When the licence is ready</div>
                  <div style={{ fontSize: '12.5px', color: 'var(--ink3)', marginTop: '2px' }}>Choose one of the two options below. Either one completes the batch and ends your access to its documents.</div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px' }}>
                  <div style={{ padding: '14px', borderRadius: '10px', border: '1px solid var(--border)', display: 'grid', gap: '10px', alignContent: 'start' }}>
                    <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--ink)' }}>Option 1 · Upload the licence</div>
                    <label style={{ display: 'block', padding: '18px 14px', borderRadius: '8px', border: `2px dashed ${file ? 'var(--teal)' : 'var(--border)'}`, textAlign: 'center', cursor: 'pointer', color: 'var(--ink2)', fontSize: '13px', fontWeight: 600 }}>
                      <input type="file" accept="application/pdf,image/jpeg,image/png" style={{ display: 'none' }}
                        onChange={e => { setError(null); setFile(e.target.files?.[0] ?? null) }} />
                      {file ? file.name : 'Click here to choose the licence file'}
                      <div style={{ fontSize: '11.5px', fontWeight: 500, color: 'var(--ink3)', marginTop: '4px' }}>
                        {file ? 'Click again to choose a different file' : 'PDF, JPG or PNG · max 20 MB'}
                      </div>
                    </label>
                    <button onClick={upload} disabled={!file || busy !== null}
                      style={{ padding: '11px 16px', borderRadius: '8px', border: 'none', background: 'var(--teal)', color: 'var(--teal-light)', fontSize: '14px', fontWeight: 700, cursor: !file || busy ? 'not-allowed' : 'pointer', opacity: !file || busy ? 0.45 : 1 }}>
                      {busy === 'upload' ? 'Uploading…' : 'Upload licence and complete batch'}
                    </button>
                    {!file && <div style={{ fontSize: '11.5px', color: 'var(--ink3)' }}>Choose a file first — the button turns on once a file is selected.</div>}
                  </div>

                  <div style={{ padding: '14px', borderRadius: '10px', border: '1px solid var(--border)', display: 'grid', gap: '10px', alignContent: 'start' }}>
                    <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--ink)' }}>Option 2 · Confirm approval without a file</div>
                    <div style={{ fontSize: '12.5px', color: 'var(--ink3)' }}>Use this if you only need to tell Trescon Ops that the licences have been approved.</div>
                    {confirmApprove ? (
                      <div style={{ display: 'grid', gap: '8px' }}>
                        <div style={{ fontSize: '12.5px', color: 'var(--ink)', fontWeight: 600 }}>This ends your access to this batch. Confirm?</div>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                          <button onClick={approve} disabled={busy !== null} style={{ padding: '10px 16px', borderRadius: '8px', border: 'none', background: 'var(--teal)', color: 'var(--teal-light)', fontSize: '13.5px', fontWeight: 700, cursor: 'pointer', opacity: busy ? 0.6 : 1 }}>
                            {busy === 'approve' ? 'Sending…' : 'Yes, confirm approved'}
                          </button>
                          <button onClick={() => setConfirmApprove(false)} style={ghostBtn}>Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <button onClick={() => setConfirmApprove(true)} disabled={busy !== null} style={{ ...ghostBtn, padding: '10px 16px', fontWeight: 700 }}>Mark batch as approved</button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div style={{ padding: '14px 16px', borderRadius: '8px', background: 'var(--border-light)', color: 'var(--ink3)', fontSize: '13px', marginBottom: '22px' }}>
              {d.status === 'completed'
                ? `This batch was completed${d.completed_at ? ` on ${new Date(d.completed_at).toLocaleDateString()}` : ''} and access to its documents has ended.`
                : 'Access to this batch has ended. If you still need it, please check with the Trescon Ops team.'}
              {d.license_files.length > 0 && <div style={{ marginTop: '6px' }}>Licence on file: {d.license_files.map(f => f.file_name).join(', ')}</div>}
            </div>
          )}

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
    </div>
  )
}
