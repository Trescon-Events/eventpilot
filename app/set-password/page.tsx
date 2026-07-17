'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'

function SetPasswordForm() {
  const params    = useSearchParams()
  const staffId   = params.get('id')   ?? ''
  const name      = params.get('name') ?? ''
  const next      = params.get('next') ?? '/dashboard'

  const [current,  setCurrent]  = useState('')
  const [newPass,  setNewPass]  = useState('')
  const [confirm,  setConfirm]  = useState('')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')
  const [showC,    setShowC]    = useState(false)
  const [showN,    setShowN]    = useState(false)

  useEffect(() => {
    if (!staffId) window.location.href = '/login'
  }, [staffId])

  function validate() {
    if (!current.trim()) return 'Enter your current (temporary) password.'
    if (newPass.length < 8) return 'New password must be at least 8 characters.'
    if (newPass === current) return 'New password must be different from your current password.'
    if (newPass !== confirm) return 'Passwords do not match.'
    return ''
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const err = validate()
    if (err) { setError(err); return }
    setLoading(true)
    setError('')
    try {
      const res  = await fetch('/api/change-password', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ staff_id: staffId, current_password: current, new_password: newPass }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Failed to set password.'); setLoading(false); return }
      window.location.href = decodeURIComponent(next)
    } catch {
      setError('Something went wrong. Try again.')
      setLoading(false)
    }
  }

  const firstName = decodeURIComponent(name).split(' ')[0]

  return (
    <div style={{ minHeight: '100vh', background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-manrope), Manrope, sans-serif', padding: '24px' }}>
      <div style={{ width: '100%', maxWidth: '420px' }}>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{ fontSize: '22px', fontWeight: 900, color: 'var(--teal-mid)', letterSpacing: '-0.5px' }}>Event Pilot</div>
          <div style={{ fontSize: '12px', color: 'var(--ink3)', marginTop: '4px' }}>by Trescon</div>
        </div>

        <div style={{ background: 'var(--card)', borderRadius: '20px', padding: '36px 32px', boxShadow: 'var(--shadow-md)' }}>
          {/* Header */}
          <div style={{ marginBottom: '24px' }}>
            <div style={{ width: 44, height: 44, borderRadius: '12px', background: 'var(--teal-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}>
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <rect x="3" y="9" width="14" height="10" rx="2" stroke="var(--teal-mid)" strokeWidth="1.5"/>
                <path d="M6 9V6a4 4 0 0 1 8 0v3" stroke="var(--teal-mid)" strokeWidth="1.5" strokeLinecap="round"/>
                <circle cx="10" cy="14" r="1.5" fill="var(--teal-mid)"/>
              </svg>
            </div>
            <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--ink)', marginBottom: '6px' }}>
              Set your password{firstName ? `, ${firstName}` : ''}
            </div>
            <div style={{ fontSize: '14px', color: 'var(--ink3)', lineHeight: 1.5 }}>
              Your account is active. Set a personal password to secure your account — you only need to do this once.
            </div>
          </div>

          {error && (
            <div style={{ background: 'var(--red-light)', border: '1px solid var(--red-border)', borderRadius: '10px', padding: '10px 14px', marginBottom: '16px', fontSize: '13px', color: 'var(--red)' }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            {/* Current password */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--ink)', marginBottom: '6px' }}>
                Current (temporary) password
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showC ? 'text' : 'password'}
                  value={current}
                  onChange={e => { setCurrent(e.target.value); setError('') }}
                  placeholder="Your temp password"
                  style={{ width: '100%', padding: '11px 40px 11px 14px', borderRadius: '10px', border: '1.5px solid var(--border)', fontSize: '14px', outline: 'none', boxSizing: 'border-box', color: 'var(--ink)', fontFamily: 'inherit' }}
                  onFocus={e => (e.target.style.borderColor = 'var(--teal-mid)')}
                  onBlur={e  => (e.target.style.borderColor = 'var(--border)')}
                />
                <button type="button" onClick={() => setShowC(v => !v)}
                  style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', padding: 0 }}>
                  {showC ? <EyeOff /> : <Eye />}
                </button>
              </div>
            </div>

            {/* New password */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--ink)', marginBottom: '6px' }}>
                New password <span style={{ color: 'var(--ink3)', fontWeight: 500 }}>(min 8 characters)</span>
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showN ? 'text' : 'password'}
                  value={newPass}
                  onChange={e => { setNewPass(e.target.value); setError('') }}
                  placeholder="Choose a strong password"
                  style={{ width: '100%', padding: '11px 40px 11px 14px', borderRadius: '10px', border: '1.5px solid var(--border)', fontSize: '14px', outline: 'none', boxSizing: 'border-box', color: 'var(--ink)', fontFamily: 'inherit' }}
                  onFocus={e => (e.target.style.borderColor = 'var(--teal-mid)')}
                  onBlur={e  => (e.target.style.borderColor = 'var(--border)')}
                />
                <button type="button" onClick={() => setShowN(v => !v)}
                  style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', padding: 0 }}>
                  {showN ? <EyeOff /> : <Eye />}
                </button>
              </div>
              {/* Strength indicator */}
              {newPass.length > 0 && (
                <div style={{ marginTop: '6px', display: 'flex', gap: '4px', alignItems: 'center' }}>
                  {[
                    newPass.length >= 8,
                    /[A-Z]/.test(newPass),
                    /[0-9]/.test(newPass),
                    /[^A-Za-z0-9]/.test(newPass),
                  ].map((met, i) => (
                    <div key={i} style={{ height: '3px', flex: 1, borderRadius: '2px', background: met ? 'var(--teal-mid)' : 'var(--border)', transition: 'background 0.2s' }} />
                  ))}
                  <span style={{ fontSize: '10px', color: 'var(--ink3)', marginLeft: '4px', whiteSpace: 'nowrap' }}>
                    {newPass.length < 8 ? 'Too short' : !/[A-Z]/.test(newPass) ? 'Add uppercase' : !/[0-9]/.test(newPass) ? 'Add number' : !/[^A-Za-z0-9]/.test(newPass) ? 'Add symbol' : 'Strong'}
                  </span>
                </div>
              )}
            </div>

            {/* Confirm password */}
            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--ink)', marginBottom: '6px' }}>
                Confirm new password
              </label>
              <input
                type="password"
                value={confirm}
                onChange={e => { setConfirm(e.target.value); setError('') }}
                placeholder="Re-enter new password"
                style={{ width: '100%', padding: '11px 14px', borderRadius: '10px', border: `1.5px solid ${confirm && confirm !== newPass ? 'var(--red-border)' : 'var(--border)'}`, fontSize: '14px', outline: 'none', boxSizing: 'border-box', color: 'var(--ink)', fontFamily: 'inherit' }}
                onFocus={e => (e.target.style.borderColor = 'var(--teal-mid)')}
                onBlur={e  => (e.target.style.borderColor = confirm && confirm !== newPass ? 'var(--red-border)' : 'var(--border)')}
              />
              {confirm && confirm !== newPass && (
                <div style={{ fontSize: '11px', color: 'var(--red)', marginTop: '4px' }}>Passwords do not match</div>
              )}
            </div>

            <button type="submit" disabled={loading}
              style={{ width: '100%', padding: '13px', borderRadius: '11px', background: loading ? 'var(--card-hi)' : 'var(--teal-mid)', color: loading ? 'var(--ink3)' : 'var(--teal-light)', fontSize: '15px', fontWeight: 700, border: 'none', cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'inherit', transition: 'background 0.15s' }}>
              {loading ? 'Saving…' : 'Set password and continue'}
            </button>
          </form>
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

export default function SetPasswordPage() {
  return (
    <Suspense>
      <SetPasswordForm />
    </Suspense>
  )
}
