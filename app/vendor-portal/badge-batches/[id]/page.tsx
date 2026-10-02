'use client'

import { use, useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ErrorBox, readError, ghostBtn, primaryBtn, inputStyle, labelStyle, type ApiError } from '../../ui'

/* One badge print file, for the print vendor: what it is, download it, then confirm it has been printed. */

type Detail = {
  id: string; batch_name: string; event_name: string; status: 'sent' | 'downloaded' | 'printed'; badges: number
  sent_at: string | null; downloaded_at: string | null; download_count: number; printed_at: string | null
  can_download: boolean; can_confirm: boolean
}

export default function BadgeBatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [d, setD] = useState<Detail | null>(null)
  const [error, setError] = useState<ApiError | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [sure, setSure] = useState(false)

  const load = useCallback(async () => {
    const res = await fetch(`/vendor-portal/api/badge-batches/${id}`)
    if (res.status === 401) { router.replace('/vendor-portal/login'); return }
    if (!res.ok) { setError(await readError(res)); return }
    setError(null); setD(await res.json())
  }, [id, router])
  // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load
  useEffect(() => { void load() }, [load])

  async function confirmPrinted() {
    setBusy(true)
    const res = await fetch(`/vendor-portal/api/badge-batches/${id}/confirm-printed`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ note }) })
    setBusy(false)
    if (!res.ok) { setError(await readError(res)); return }
    setSure(false); await load()
  }

  return (
    <div style={{ maxWidth: '640px' }}>
      <Link href="/vendor-portal" style={{ fontSize: '13px', color: 'var(--ink3)', textDecoration: 'none' }}>← Your batches</Link>
      <ErrorBox error={error} />
      {!d && !error && <p style={{ color: 'var(--ink3)', fontSize: '14px' }}>Loading…</p>}
      {d && (
        <div style={{ marginTop: '12px', padding: '22px', borderRadius: '12px', border: '1px solid var(--border)', background: 'var(--card)' }}>
          <h1 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--ink)', margin: '0 0 4px' }}>{d.batch_name}</h1>
          <div style={{ fontSize: '14px', color: 'var(--ink3)', marginBottom: '18px' }}>{d.event_name} · {d.badges} speaker badge{d.badges === 1 ? '' : 's'}{d.sent_at ? ` · sent ${new Date(d.sent_at).toLocaleDateString()}` : ''}</div>

          {d.status === 'printed' ? (
            <div style={{ padding: '14px', borderRadius: '8px', background: 'var(--lime-light)', color: 'var(--lime)', fontSize: '14px', fontWeight: 700 }}>
              Confirmed as printed{d.printed_at ? ` on ${new Date(d.printed_at).toLocaleString()}` : ''}. Thank you — this file is no longer available.
            </div>
          ) : (
            <>
              <ol style={{ margin: '0 0 18px', paddingLeft: '20px', color: 'var(--ink2)', fontSize: '14px', lineHeight: 1.8 }}>
                <li>Download the print file (one PDF: instruction page first, then each badge, then the common back).</li>
                <li>Print it following the instruction page.</li>
                <li>Come back here and confirm it has been printed.</li>
              </ol>
              <a href={`/vendor-portal/api/badge-batches/${d.id}/download`} onClick={() => setTimeout(load, 4000)} style={{ ...primaryBtn, display: 'block', textAlign: 'center', textDecoration: 'none', boxSizing: 'border-box' }}>
                {d.status === 'downloaded' ? 'Download again' : 'Download print file'}
              </a>
              {d.status === 'downloaded' && (
                <div style={{ marginTop: '22px', paddingTop: '18px', borderTop: '1px solid var(--border-light)' }}>
                  <div style={{ fontSize: '13px', color: 'var(--ink3)' }}>Downloaded {d.downloaded_at ? new Date(d.downloaded_at).toLocaleString() : ''}.</div>
                  {!sure ? (
                    <button onClick={() => setSure(true)} style={{ ...ghostBtn, marginTop: '12px' }}>The badges are printed — confirm…</button>
                  ) : (
                    <div style={{ marginTop: '10px' }}>
                      <label style={labelStyle}>Note for Trescon (optional)</label>
                      <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} style={{ ...inputStyle, resize: 'vertical' }} placeholder="e.g. quantity printed, delivery details" />
                      <div style={{ display: 'flex', gap: '10px', marginTop: '12px' }}>
                        <button onClick={() => void confirmPrinted()} disabled={busy} style={{ ...primaryBtn, width: 'auto', marginTop: 0 }}>{busy ? 'Confirming…' : 'Yes, all badges are printed'}</button>
                        <button onClick={() => setSure(false)} style={ghostBtn}>Cancel</button>
                      </div>
                      <p style={{ fontSize: '12px', color: 'var(--ink3)', margin: '10px 0 0' }}>Once confirmed, Trescon is notified and this file is no longer available to you.</p>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
