'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'

function ResetPasswordForm() {
  const params = useSearchParams()
  const token  = params.get('token') ?? ''

  const [validating, setValidating] = useState(true)
  const [valid,      setValid]      = useState(false)
  const [firstName,  setFirstName]  = useState('')
  const [tokenError, setTokenError] = useState('')

  const [newPass,  setNewPass]  = useState('')
  const [confirm,  setConfirm]  = useState('')
  const [showN,    setShowN]    = useState(false)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')
  const [done,     setDone]     = useState(false)

  useEffect(() => {
    if (!token) { setTokenError('No reset token found. Please use the link from your email.'); setValidating(false); return }
    fetch(`/api/reset-password?token=${encodeURIComponent(token)}`)
      .then(r => r.json())
      .then(d => {
        if (d.valid) { setValid(true); setFirstName(d.name ?? '') }
        else { setTokenError(d.error ?? 'This link is invalid or has expired.') }
        setValidating(false)
      })
      .catch(() => { setTokenError('Could not verify the link. Please try again.'); setValidating(false) })
  }, [token])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (newPass.length < 8) { setError('Password must be at least 8 characters.'); return }
    if (newPass !== confirm)  { setError('Passwords do not match.'); return }
    setLoading(true)
    setError('')
    try {
      const res  = await fetch('/api/reset-password', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ token, new_password: newPass }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Failed to reset password.'); setLoading(false); return }
      setDone(true)
    } catch {
      setError('Something went wrong. Try again.')
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#F0F4F8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-manrope), Manrope, sans-serif', padding: '24px' }}>
      <div style={{ width: '100%', maxWidth: '420px' }}>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{ fontSize: '22px', fontWeight: 900, color: '#00A5A3', letterSpacing: '-0.5px' }}>Trescademy</div>
          <div style={{ fontSize: '12px', color: '#5B7080', marginTop: '4px' }}>by Trescon Global</div>
        </div>

        <div style={{ background: '#FFFFFF', borderRadius: '20px', padding: '36px 32px', boxShadow: '0 4px 24px rgba(0,0,0,0.08)' }}>

          {validating && (
            <div style={{ textAlign: 'center', padding: '32px 0', color: '#5B7080', fontSize: '14px' }}>
              Verifying link…
            </div>
          )}

          {!validating && tokenError && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ width: 44, height: 44, borderRadius: '12px', background: '#FFF1F2', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <circle cx="10" cy="10" r="8" stroke="#DC2626" strokeWidth="1.5"/>
                  <path d="M10 6v4M10 14h.01" stroke="#DC2626" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </div>
              <div style={{ fontSize: '18px', fontWeight: 800, color: '#0F1923', marginBottom: '10px' }}>Link expired</div>
              <div style={{ fontSize: '14px', color: '#5B7080', lineHeight: 1.55, marginBottom: '24px' }}>{tokenError}</div>
              <a href="/login" style={{ display: 'inline-block', padding: '12px 28px', borderRadius: '10px', background: '#00A5A3', color: '#FFFFFF', fontSize: '14px', fontWeight: 700, textDecoration: 'none' }}>
                Back to login
              </a>
            </div>
          )}

          {!validating && valid && !done && (
            <>
              <div style={{ marginBottom: '24px' }}>
                <div style={{ width: 44, height: 44, borderRadius: '12px', background: '#E0F7F6', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}>
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                    <rect x="3" y="9" width="14" height="10" rx="2" stroke="#00A5A3" strokeWidth="1.5"/>
                    <path d="M6 9V6a4 4 0 0 1 8 0v3" stroke="#00A5A3" strokeWidth="1.5" strokeLinecap="round"/>
                    <circle cx="10" cy="14" r="1.5" fill="#00A5A3"/>
                  </svg>
                </div>
                <div style={{ fontSize: '20px', fontWeight: 800, color: '#080A0B', marginBottom: '6px' }}>
                  Set a new password{firstName ? `, ${firstName}` : ''}
                </div>
                <div style={{ fontSize: '14px', color: '#5B7080', lineHeight: 1.5 }}>
                  Choose a strong password for your account.
                </div>
              </div>

              {error && (
                <div style={{ background: '#FFF1F2', border: '1px solid #FCA5A5', borderRadius: '10px', padding: '10px 14px', marginBottom: '16px', fontSize: '13px', color: '#DC2626' }}>
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit}>
                {/* New password */}
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#0F1923', marginBottom: '6px' }}>
                    New password <span style={{ color: '#94A3B8', fontWeight: 500 }}>(min 8 characters)</span>
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type={showN ? 'text' : 'password'}
                      value={newPass}
                      onChange={e => { setNewPass(e.target.value); setError('') }}
                      placeholder="Choose a strong password"
                      style={{ width: '100%', padding: '11px 40px 11px 14px', borderRadius: '10px', border: '1.5px solid #DDE8EE', fontSize: '14px', outline: 'none', boxSizing: 'border-box', color: '#0F1923', fontFamily: 'inherit' }}
                      onFocus={e => (e.target.style.borderColor = '#00A5A3')}
                      onBlur={e  => (e.target.style.borderColor = '#DDE8EE')}
                    />
                    <button type="button" onClick={() => setShowN(v => !v)}
                      style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#5B7080', padding: 0 }}>
                      {showN ? <EyeOff /> : <Eye />}
                    </button>
                  </div>
                  {/* Strength bar */}
                  {newPass.length > 0 && (
                    <div style={{ marginTop: '6px', display: 'flex', gap: '4px', alignItems: 'center' }}>
                      {[newPass.length >= 8, /[A-Z]/.test(newPass), /[0-9]/.test(newPass), /[^A-Za-z0-9]/.test(newPass)].map((met, i) => (
                        <div key={i} style={{ height: '3px', flex: 1, borderRadius: '2px', background: met ? '#00A5A3' : '#DDE8EE', transition: 'background 0.2s' }} />
                      ))}
                      <span style={{ fontSize: '10px', color: '#5B7080', marginLeft: '4px', whiteSpace: 'nowrap' }}>
                        {newPass.length < 8 ? 'Too short' : !/[A-Z]/.test(newPass) ? 'Add uppercase' : !/[0-9]/.test(newPass) ? 'Add number' : !/[^A-Za-z0-9]/.test(newPass) ? 'Add symbol' : 'Strong'}
                      </span>
                    </div>
                  )}
                </div>

                {/* Confirm */}
                <div style={{ marginBottom: '24px' }}>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#0F1923', marginBottom: '6px' }}>
                    Confirm new password
                  </label>
                  <input
                    type="password"
                    value={confirm}
                    onChange={e => { setConfirm(e.target.value); setError('') }}
                    placeholder="Re-enter new password"
                    style={{ width: '100%', padding: '11px 14px', borderRadius: '10px', border: `1.5px solid ${confirm && confirm !== newPass ? '#FCA5A5' : '#DDE8EE'}`, fontSize: '14px', outline: 'none', boxSizing: 'border-box', color: '#0F1923', fontFamily: 'inherit' }}
                    onFocus={e => (e.target.style.borderColor = '#00A5A3')}
                    onBlur={e  => (e.target.style.borderColor = confirm && confirm !== newPass ? '#FCA5A5' : '#DDE8EE')}
                  />
                  {confirm && confirm !== newPass && (
                    <div style={{ fontSize: '11px', color: '#DC2626', marginTop: '4px' }}>Passwords do not match</div>
                  )}
                </div>

                <button type="submit" disabled={loading}
                  style={{ width: '100%', padding: '13px', borderRadius: '11px', background: loading ? '#94A3B8' : '#00A5A3', color: '#FFFFFF', fontSize: '15px', fontWeight: 700, border: 'none', cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'inherit', transition: 'background 0.15s' }}>
                  {loading ? 'Saving…' : 'Set new password'}
                </button>
              </form>
            </>
          )}

          {done && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ width: 44, height: 44, borderRadius: '12px', background: '#E0F7F6', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <circle cx="10" cy="10" r="8" stroke="#00A5A3" strokeWidth="1.5"/>
                  <path d="M6.5 10l2.5 2.5 4.5-5" stroke="#00A5A3" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <div style={{ fontSize: '20px', fontWeight: 800, color: '#080A0B', marginBottom: '8px' }}>Password updated</div>
              <div style={{ fontSize: '14px', color: '#5B7080', marginBottom: '24px', lineHeight: 1.55 }}>
                Your password has been set. You can now log in with your new credentials.
              </div>
              <a href="/login" style={{ display: 'inline-block', width: '100%', padding: '13px', borderRadius: '11px', background: '#00A5A3', color: '#FFFFFF', fontSize: '15px', fontWeight: 700, textDecoration: 'none', textAlign: 'center', boxSizing: 'border-box' }}>
                Go to login
              </a>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}

function Eye() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5Z" stroke="currentColor" strokeWidth="1.3"/>
      <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.3"/>
    </svg>
  )
}

function EyeOff() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M2 2l12 12M6.5 6.6A2 2 0 0 0 9.4 9.5M4.2 4.3C2.6 5.4 1 8 1 8s2.5 5 7 5c1.4 0 2.7-.4 3.8-1M7 3.1C7.3 3 7.7 3 8 3c4.5 0 7 5 7 5s-.7 1.4-2 2.7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  )
}
