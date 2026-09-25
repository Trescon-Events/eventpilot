'use client'

import { useState } from 'react'
import Link from 'next/link'
import Turnstile from '../Turnstile'
import { ErrorBox, readError, card, inputStyle, labelStyle, primaryBtn, linkBtn, type ApiError } from '../ui'

export default function VendorForgotPage() {
  const [email, setEmail] = useState('')
  const [captcha, setCaptcha] = useState<string | null>(null)
  const [resetSignal, setResetSignal] = useState(0)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<string | null>(null)
  const [error, setError] = useState<ApiError | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!captcha) { setError({ error: 'Please complete the verification check first.' }); return }
    setBusy(true); setError(null)
    const res = await fetch('/vendor-portal/api/auth/forgot', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, captcha }),
    })
    setBusy(false); setResetSignal(n => n + 1)
    if (!res.ok) { setError(await readError(res)); return }
    setDone((await res.json()).message)
  }

  return (
    <div style={card}>
      <h1 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--ink)', margin: '0 0 4px' }}>Reset your password</h1>
      {done ? (
        <>
          <p style={{ fontSize: '14px', color: 'var(--ink3)', lineHeight: 1.6 }}>{done}</p>
          <Link href="/vendor-portal/login" style={linkBtn}>Back to sign in</Link>
        </>
      ) : (
        <form onSubmit={submit}>
          <p style={{ fontSize: '13px', color: 'var(--ink3)', margin: '0 0 8px' }}>Enter your account email and we will send you a reset link.</p>
          <ErrorBox error={error} />
          <label style={labelStyle} htmlFor="email">Email</label>
          <input id="email" type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} style={inputStyle} />
          <div style={{ marginTop: '16px' }}><Turnstile onToken={setCaptcha} resetSignal={resetSignal} /></div>
          <button type="submit" disabled={busy || !captcha} style={{ ...primaryBtn, opacity: busy || !captcha ? 0.6 : 1 }}>{busy ? 'Sending…' : 'Send reset link'}</button>
          <div style={{ marginTop: '14px', textAlign: 'center' }}><Link href="/vendor-portal/login" style={linkBtn}>Back to sign in</Link></div>
        </form>
      )}
    </div>
  )
}
