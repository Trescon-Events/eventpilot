'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Turnstile from '../Turnstile'
import { ErrorBox, readError, card, inputStyle, labelStyle, primaryBtn, linkBtn, type ApiError } from '../ui'

/* Two steps: email + password + captcha, then the 6-digit code emailed to
   that address. Errors are the server's own generic messages. */
export default function VendorLoginPage() {
  const router = useRouter()
  const [step, setStep] = useState<'password' | 'code'>('password')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [challenge, setChallenge] = useState('')
  const [captcha, setCaptcha] = useState<string | null>(null)
  const [resetSignal, setResetSignal] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<ApiError | null>(null)

  async function submitPassword(e: React.FormEvent) {
    e.preventDefault()
    if (!captcha) { setError({ error: 'Please complete the verification check first.' }); return }
    setBusy(true); setError(null)
    const res = await fetch('/vendor-portal/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, captcha }),
    })
    setBusy(false)
    setResetSignal(n => n + 1) // captcha tokens are single-use
    if (!res.ok) { setError(await readError(res)); return }
    setChallenge((await res.json()).challenge)
    setPassword('')
    setStep('code')
  }

  async function submitCode(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError(null)
    const res = await fetch('/vendor-portal/api/auth/verify', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ challenge, code }),
    })
    setBusy(false)
    if (!res.ok) { setError(await readError(res)); setCode(''); return }
    router.replace('/vendor-portal')
  }

  return (
    <div style={card}>
      <h1 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--ink)', margin: '0 0 4px' }}>Sign in</h1>
      <p style={{ fontSize: '13px', color: 'var(--ink3)', margin: '0 0 8px' }}>
        {step === 'password' ? 'Use the email address your Trescon account was created for.' : `We emailed a 6-digit code to ${email}. Enter it to finish signing in.`}
      </p>
      <ErrorBox error={error} />

      {step === 'password' ? (
        <form onSubmit={submitPassword}>
          <label style={labelStyle} htmlFor="email">Email</label>
          <input id="email" type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} style={inputStyle} />
          <label style={labelStyle} htmlFor="password">Password</label>
          <input id="password" type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} style={inputStyle} />
          <div style={{ marginTop: '16px' }}><Turnstile onToken={setCaptcha} resetSignal={resetSignal} /></div>
          <button type="submit" disabled={busy || !captcha} style={{ ...primaryBtn, opacity: busy || !captcha ? 0.6 : 1 }}>{busy ? 'Checking…' : 'Continue'}</button>
          <div style={{ marginTop: '14px', textAlign: 'center' }}><Link href="/vendor-portal/forgot" style={linkBtn}>Forgot your password?</Link></div>
        </form>
      ) : (
        <form onSubmit={submitCode}>
          <label style={labelStyle} htmlFor="code">6-digit code</label>
          <input id="code" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required autoFocus value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} style={{ ...inputStyle, letterSpacing: '6px', fontSize: '20px', textAlign: 'center' }} />
          <button type="submit" disabled={busy || code.length !== 6} style={{ ...primaryBtn, opacity: busy || code.length !== 6 ? 0.6 : 1 }}>{busy ? 'Verifying…' : 'Sign in'}</button>
          <div style={{ marginTop: '14px', textAlign: 'center' }}>
            <button type="button" style={linkBtn} onClick={() => { setStep('password'); setError(null); setCode('') }}>Start over</button>
          </div>
        </form>
      )}
    </div>
  )
}
