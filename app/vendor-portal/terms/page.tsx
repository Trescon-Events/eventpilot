'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ErrorBox, readError, ghostBtn, type ApiError } from '../ui'

type Terms = { version: string; title: string; intro: string; items: string[]; checkbox: string; accepted: boolean }

export default function VendorTermsPage() {
  const router = useRouter()
  const [terms, setTerms] = useState<Terms | null>(null)
  const [ticked, setTicked] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<ApiError | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const res = await fetch('/vendor-portal/api/terms')
      if (cancelled) return
      if (res.status === 401) { router.replace('/vendor-portal/login'); return }
      if (!res.ok) { setError(await readError(res)); return }
      const body: Terms = await res.json()
      if (cancelled) return
      if (body.accepted) { router.replace('/vendor-portal'); return }
      setTerms(body)
    })()
    return () => { cancelled = true }
  }, [router])

  async function accept() {
    if (!terms || !ticked) return
    setBusy(true); setError(null)
    try {
      const res = await fetch('/vendor-portal/api/terms', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accept: true, version: terms.version }) })
      if (res.status === 401) { router.replace('/vendor-portal/login'); return }
      if (!res.ok) { setError(await readError(res)); return }
      router.replace('/vendor-portal')
    } catch {
      setError({ error: 'That did not go through. Please try again.' })
    } finally { setBusy(false) }
  }

  async function signOut() {
    await fetch('/vendor-portal/api/auth/logout', { method: 'POST' })
    router.replace('/vendor-portal/login')
  }

  return (
    <div style={{ maxWidth: '640px', margin: '0 auto' }}>
      <ErrorBox error={error} />
      {!terms && !error && <p style={{ color: 'var(--ink3)', fontSize: '14px' }}>Loading…</p>}
      {terms && (
        <div style={{ padding: '24px', borderRadius: '12px', border: '1px solid var(--border)', background: 'var(--card)' }}>
          <h1 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--ink)', margin: '0 0 10px' }}>{terms.title}</h1>
          <p style={{ fontSize: '14px', color: 'var(--ink2)', lineHeight: 1.6, margin: '0 0 10px' }}>{terms.intro}</p>
          <ol style={{ margin: '0 0 18px', paddingLeft: '20px', fontSize: '14px', color: 'var(--ink)', lineHeight: 1.7, display: 'grid', gap: '8px' }}>
            {terms.items.map(t => <li key={t}>{t}</li>)}
          </ol>
          <label style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', cursor: 'pointer', fontSize: '14px', fontWeight: 600, color: 'var(--ink)' }}>
            <input type="checkbox" checked={ticked} onChange={e => setTicked(e.target.checked)} style={{ marginTop: '3px' }} />
            <span>{terms.checkbox}</span>
          </label>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginTop: '18px', flexWrap: 'wrap' }}>
            <button onClick={accept} disabled={!ticked || busy}
              style={{ padding: '11px 20px', borderRadius: '8px', border: 'none', background: 'var(--teal)', color: 'var(--teal-light)', fontSize: '14px', fontWeight: 700, cursor: !ticked || busy ? 'not-allowed' : 'pointer', opacity: !ticked || busy ? 0.45 : 1 }}>
              {busy ? 'Saving…' : 'Accept and continue'}
            </button>
            <button onClick={signOut} style={ghostBtn}>Sign out</button>
          </div>
        </div>
      )}
    </div>
  )
}
