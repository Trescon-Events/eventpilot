'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ErrorBox, readError, ghostBtn, type ApiError } from './ui'

type Batch = {
  id: string; batch_number: number; event_name: string; status: string; speaker_count: number
  sent_at: string | null; expires_at: string | null; completed_at: string | null; completion_type: string | null
  can_download: boolean; needs_deletion_confirmation?: boolean
}

const STATUS: Record<string, { label: string; color: string; bg: string }> = {
  sent:       { label: 'Ready to download', color: 'var(--teal)',  bg: 'var(--teal-light)' },
  downloaded: { label: 'Downloaded',        color: 'var(--amber)', bg: 'var(--amber-light)' },
  completed:  { label: 'Completed',         color: 'var(--lime)',  bg: 'var(--lime-light)' },
  expired:    { label: 'Expired',           color: 'var(--ink3)',  bg: 'var(--border-light)' },
  cancelled:  { label: 'Cancelled',         color: 'var(--ink3)',  bg: 'var(--border-light)' },
}

export default function VendorHomePage() {
  const router = useRouter()
  const [batches, setBatches] = useState<Batch[] | null>(null)
  const [who, setWho] = useState<{ vendor: string; user: string } | null>(null)
  const [error, setError] = useState<ApiError | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const res = await fetch('/vendor-portal/api/batches')
      if (cancelled) return
      if (res.status === 401) { router.replace('/vendor-portal/login'); return }
      if (res.status === 403) {
        const denied = await res.clone().json().catch(() => null)
        if (denied?.code === 'terms_required') { router.replace('/vendor-portal/terms'); return }
      }
      if (!res.ok) { setError(await readError(res)); return }
      const body = await res.json()
      if (cancelled) return
      setBatches(body.batches); setWho({ vendor: body.vendor, user: body.user })
    })()
    return () => { cancelled = true }
  }, [router])

  async function signOut() {
    await fetch('/vendor-portal/api/auth/logout', { method: 'POST' })
    router.replace('/vendor-portal/login')
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--ink)', margin: 0 }}>Your batches</h1>
          {who && <p style={{ fontSize: '13px', color: 'var(--ink3)', margin: '4px 0 0' }}>{who.vendor} · signed in as {who.user}</p>}
        </div>
        <button onClick={signOut} style={ghostBtn}>Sign out</button>
      </div>
      <ErrorBox error={error} />
      {!batches && !error && <p style={{ color: 'var(--ink3)', fontSize: '14px' }}>Loading…</p>}
      {batches && batches.length === 0 && (
        <p style={{ color: 'var(--ink3)', fontSize: '14px', padding: '32px 0' }}>Nothing has been sent to you yet. You&rsquo;ll receive an email when a batch is ready.</p>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {batches?.map(b => {
          const st = STATUS[b.status] ?? STATUS.expired
          return (
            <Link key={b.id} href={`/vendor-portal/batches/${b.id}`} style={{ textDecoration: 'none' }}>
              <div style={{ padding: '16px 18px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--card)', display: 'flex', justifyContent: 'space-between', gap: '14px', alignItems: 'center', flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--ink)' }}>Batch {b.batch_number} · {b.event_name}</div>
                  <div style={{ fontSize: '12px', color: 'var(--ink3)', marginTop: '4px' }}>
                    {b.speaker_count} speaker{b.speaker_count === 1 ? '' : 's'}
                    {b.sent_at ? ` · sent ${new Date(b.sent_at).toLocaleDateString()}` : ''}
                    {b.can_download && b.expires_at ? ` · available until ${new Date(b.expires_at).toLocaleString()}` : ''}
                  </div>
                </div>
                <span style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                  {b.needs_deletion_confirmation && <span style={{ fontSize: '11px', fontWeight: 700, padding: '4px 10px', borderRadius: '999px', color: 'var(--amber)', background: 'var(--amber-light)' }}>Confirm deletion</span>}
                  <span style={{ fontSize: '11px', fontWeight: 700, padding: '4px 10px', borderRadius: '999px', color: st.color, background: st.bg }}>{st.label}</span>
                </span>
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
