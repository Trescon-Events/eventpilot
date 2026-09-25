'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Turnstile from '../Turnstile'
import { ErrorBox, readError, card, inputStyle, labelStyle, primaryBtn, linkBtn, type ApiError } from '../ui'

/* Landing page for both the invite email (first login) and a reset email.
   The vendor picks their own password here; it is never emailed or shown to
   Trescon staff. The token is read from the URL and only ever sent to our
   own API. */
function SetPasswordForm() {
  const token = useSearchParams().get('token') ?? ''
  const [state, setState] = useState<{ status: 'checking' } | { status: 'invalid' } | { status: 'ready'; email: string; purpose: string } | { status: 'done' }>({ status: 'checking' })
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [captcha, setCaptcha] = useState<string | null>(null)
  const [resetSignal, setResetSignal] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<ApiError | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`/vendor-portal/api/auth/set-password?token=${encodeURIComponent(token)}`)
      .then(r => r.json())
      .then(d => { if (!cancelled) setState(d.valid ? { status: 'ready', email: d.email, purpose: d.purpose } : { status: 'invalid' }) })
      .catch(() => { if (!cancelled) setState({ status: 'invalid' }) })
    return () => { cancelled = true }
  }, [token])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirm) { setError({ error: 'The two passwords do not match.' }); return }
    if (!captcha) { setError({ error: 'Please complete the verification check first.' }); return }
    setBusy(true); setError(null)
    const res = await fetch('/vendor-portal/api/auth/set-password', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, password, captcha }),
    })
    setBusy(false); setResetSignal(n => n + 1)
    if (!res.ok) { setError(await readError(res)); return }
    setState({ status: 'done' })
  }

  return (
    <div style={card}>
      {state.status === 'checking' && <p style={{ color: 'var(--ink3)', fontSize: '14px' }}>Checking your link…</p>}
      {state.status === 'invalid' && (
        <>
          <h1 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--ink)', margin: '0 0 8px' }}>This link can&rsquo;t be used</h1>
          <ErrorBox error={{ error: 'This link is not valid or has expired.' }} />
          <Link href="/vendor-portal/forgot" style={linkBtn}>Request a new reset link</Link>
        </>
      )}
      {state.status === 'done' && (
        <>
          <h1 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--ink)', margin: '0 0 8px' }}>Password saved</h1>
          <p style={{ fontSize: '14px', color: 'var(--ink3)', lineHeight: 1.6 }}>You can now sign in with your new password.</p>
          <Link href="/vendor-portal/login" style={linkBtn}>Go to sign in</Link>
        </>
      )}
      {state.status === 'ready' && (
        <form onSubmit={submit}>
          <h1 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--ink)', margin: '0 0 4px' }}>{state.purpose === 'invite' ? 'Create your password' : 'Choose a new password'}</h1>
          <p style={{ fontSize: '13px', color: 'var(--ink3)', margin: '0 0 8px' }}>For {state.email}. Use at least 12 characters.</p>
          <ErrorBox error={error} />
          <label style={labelStyle} htmlFor="pw">New password</label>
          <input id="pw" type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={password} onChange={e => setPassword(e.target.value)} style={inputStyle} />
          <label style={labelStyle} htmlFor="pw2">Confirm password</label>
          <input id="pw2" type="password" autoComplete="new-password" required value={confirm} onChange={e => setConfirm(e.target.value)} style={inputStyle} />
          <div style={{ marginTop: '16px' }}><Turnstile onToken={setCaptcha} resetSignal={resetSignal} /></div>
          <button type="submit" disabled={busy || !captcha} style={{ ...primaryBtn, opacity: busy || !captcha ? 0.6 : 1 }}>{busy ? 'Saving…' : 'Save password'}</button>
        </form>
      )}
    </div>
  )
}

export default function VendorSetPasswordPage() {
  return <Suspense fallback={null}><SetPasswordForm /></Suspense>
}
