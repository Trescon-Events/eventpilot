'use client'

import { use, useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ErrorBox, readError, ghostBtn, primaryBtn, inputStyle, labelStyle, type ApiError } from '../../ui'

/* One speaker photo pack, for the memento vendor: what it is, download the photos, then confirm they look good or report a problem. */

type Detail = {
  id: string; batch_name: string; event_name: string; status: 'sent' | 'downloaded' | 'confirmed' | 'issue'; speakers: number; speaker_names: string[]
  sent_at: string | null; downloaded_at: string | null; download_count: number; responded_at: string | null; vendor_note: string | null
  can_download: boolean; can_respond: boolean
}

export default function MementoBatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [d, setD] = useState<Detail | null>(null)
  const [error, setError] = useState<ApiError | null>(null)
  const [mode, setMode] = useState<null | 'ok' | 'issue'>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const res = await fetch(`/vendor-portal/api/memento-batches/${id}`)
    if (res.status === 401) { router.replace('/vendor-portal/login'); return }
    if (!res.ok) { setError(await readError(res)); return }
    setError(null); setD(await res.json())
  }, [id, router])
  // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load
  useEffect(() => { void load() }, [load])

  async function respond(outcome: 'ok' | 'issue') {
    setBusy(true)
    const res = await fetch(`/vendor-portal/api/memento-batches/${id}/respond`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ outcome, note }) })
    setBusy(false)
    if (!res.ok) { setError(await readError(res)); return }
    setMode(null); setNote(''); await load()
  }

  return (
    <div style={{ maxWidth: '640px' }}>
      <Link href="/vendor-portal" style={{ fontSize: '13px', color: 'var(--ink3)', textDecoration: 'none' }}>← Your batches</Link>
      <ErrorBox error={error} />
      {!d && !error && <p style={{ color: 'var(--ink3)', fontSize: '14px' }}>Loading…</p>}
      {d && (
        <div style={{ marginTop: '12px', padding: '22px', borderRadius: '12px', border: '1px solid var(--border)', background: 'var(--card)' }}>
          <h1 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--ink)', margin: '0 0 4px' }}>{d.batch_name}</h1>
          <div style={{ fontSize: '14px', color: 'var(--ink3)', marginBottom: '18px' }}>{d.event_name} · {d.speakers} speaker photo{d.speakers === 1 ? '' : 's'}{d.sent_at ? ` · sent ${new Date(d.sent_at).toLocaleDateString()}` : ''}</div>

          {d.status === 'confirmed' ? (
            <div style={{ padding: '14px', borderRadius: '8px', background: 'var(--lime-light)', color: 'var(--lime)', fontSize: '14px', fontWeight: 700 }}>
              You confirmed these photos on {d.responded_at ? new Date(d.responded_at).toLocaleString() : 'record'}. Thank you — this pack is no longer available.
            </div>
          ) : d.status === 'issue' ? (
            <div style={{ padding: '14px', borderRadius: '8px', background: 'var(--amber-light)', color: 'var(--amber)', fontSize: '14px', lineHeight: 1.6 }}>
              You reported a problem{d.responded_at ? ` on ${new Date(d.responded_at).toLocaleString()}` : ''}{d.vendor_note ? `: “${d.vendor_note}”` : ''}. Trescon has been told and will get back to you.
            </div>
          ) : (
            <>
              <ol style={{ margin: '0 0 14px', paddingLeft: '20px', color: 'var(--ink2)', fontSize: '14px', lineHeight: 1.8 }}>
                <li>Download the photos (one ZIP, a transparent PNG per speaker, named after the speaker).</li>
                <li>Check that every photo is usable for the memento.</li>
                <li>Come back here and confirm that everything looks good — or tell us what is wrong.</li>
              </ol>
              <details style={{ marginBottom: '16px', fontSize: '13px', color: 'var(--ink3)' }}>
                <summary style={{ cursor: 'pointer' }}>{d.speakers} speaker{d.speakers === 1 ? '' : 's'} in this pack</summary>
                <div style={{ marginTop: '6px', lineHeight: 1.7 }}>{d.speaker_names.join(' · ')}</div>
              </details>
              <a href={`/vendor-portal/api/memento-batches/${d.id}/download`} onClick={() => setTimeout(load, 5000)} style={{ ...primaryBtn, display: 'block', textAlign: 'center', textDecoration: 'none', boxSizing: 'border-box' }}>
                {d.status === 'downloaded' ? 'Download again' : 'Download photos'}
              </a>
              {d.status === 'downloaded' && (
                <div style={{ marginTop: '22px', paddingTop: '18px', borderTop: '1px solid var(--border-light)' }}>
                  <div style={{ fontSize: '13px', color: 'var(--ink3)' }}>Downloaded {d.downloaded_at ? new Date(d.downloaded_at).toLocaleString() : ''}.</div>
                  {mode === null ? (
                    <div style={{ display: 'flex', gap: '10px', marginTop: '12px', flexWrap: 'wrap' }}>
                      <button onClick={() => setMode('ok')} style={{ ...ghostBtn }}>Everything looks good…</button>
                      <button onClick={() => setMode('issue')} style={{ ...ghostBtn }}>Report a problem…</button>
                    </div>
                  ) : (
                    <div style={{ marginTop: '10px' }}>
                      <label style={labelStyle}>{mode === 'ok' ? 'Note for Trescon (optional)' : 'What is wrong? (required)'}</label>
                      <textarea value={note} onChange={e => setNote(e.target.value)} rows={3} style={{ ...inputStyle, resize: 'vertical' }} placeholder={mode === 'ok' ? 'e.g. all photos are fine' : 'e.g. two photos are too small to print'} />
                      <div style={{ display: 'flex', gap: '10px', marginTop: '12px' }}>
                        <button onClick={() => void respond(mode)} disabled={busy || (mode === 'issue' && note.trim().length < 3)} style={{ ...primaryBtn, width: 'auto', marginTop: 0 }}>{busy ? 'Sending…' : mode === 'ok' ? 'Yes, everything looks good' : 'Send the problem report'}</button>
                        <button onClick={() => { setMode(null); setNote('') }} style={ghostBtn}>Cancel</button>
                      </div>
                      <p style={{ fontSize: '12px', color: 'var(--ink3)', margin: '10px 0 0' }}>{mode === 'ok' ? 'Once confirmed, Trescon is notified and this pack is no longer available to you.' : 'Trescon is notified straight away and will get back to you.'}</p>
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
