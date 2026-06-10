'use client'

import { useState } from 'react'
import Image from 'next/image'

export default function LoginPage() {
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')

  // Forgot password flow
  const [showForgot,   setShowForgot]   = useState(false)
  const [fpEmail,      setFpEmail]      = useState('')
  const [fpLoading,    setFpLoading]    = useState(false)
  const [fpSent,       setFpSent]       = useState(false)
  const [fpError,      setFpError]      = useState('')

  async function handleForgotPassword(e: React.FormEvent) {
    e.preventDefault()
    if (!fpEmail.trim()) { setFpError('Enter your work email.'); return }
    setFpLoading(true)
    setFpError('')
    try {
      await fetch('/api/forgot-password', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email: fpEmail.trim() }),
      })
      setFpSent(true)
    } catch {
      setFpError('Something went wrong. Try again.')
    } finally {
      setFpLoading(false)
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim() || !password.trim()) { setError('Enter your email and password.'); return }
    setLoading(true)
    setError('')
    try {
      const res  = await fetch('/api/login', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email: email.trim(), password: password.trim() }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Login failed. Try again.'); setLoading(false); return }
      localStorage.setItem('tai_staff_id', data.id)
      if (data.is_admin) {
        sessionStorage.setItem('tai_admin_authed',   '1')
        sessionStorage.setItem('tai_admin_staff_id', data.id)
      } else {
        sessionStorage.removeItem('tai_admin_authed')
        sessionStorage.removeItem('tai_admin_staff_id')
      }
      const destination = data.is_admin ? '/admin' : `/dashboard?id=${data.id}`
      // Force password change before anything else
      if (data.must_change_password && data.id !== 'super-admin') {
        const name = encodeURIComponent(data.name ?? '')
        window.location.href = `/set-password?id=${data.id}&name=${name}&next=${encodeURIComponent(destination)}`
        return
      }
      if (!data.has_profile && data.id !== 'super-admin' && data.job_level !== 'super_admin') {
        const name = encodeURIComponent(data.name ?? '')
        const dept = encodeURIComponent(data.department ?? 'Other')
        window.location.href = `/profile?id=${data.id}&name=${name}&dept=${dept}&next=${encodeURIComponent(destination)}`
        return
      }
      window.location.href = destination
    } catch {
      setError('Something went wrong. Check your connection and try again.')
      setLoading(false)
    }
  }

  return (
    <div style={{
      fontFamily: 'var(--font-manrope), Manrope, sans-serif',
      background: '#E8EEF4',
      minHeight:  '100vh',
      display:    'grid',
      gridTemplateColumns: '1fr 480px',
    }}>

      {/* ── LEFT PANEL ── */}
      <div style={{
        background:     'linear-gradient(145deg, #004D40 0%, #00695C 45%, #00897B 100%)',
        padding:        '56px 72px',
        display:        'flex',
        flexDirection:  'column',
        justifyContent: 'space-between',
        position:       'relative',
        overflow:       'hidden',
      }}>
        {/* Decorative orbs */}
        <div style={{ position: 'absolute', top: '-120px', right: '-80px', width: '520px', height: '520px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(192,244,60,0.12) 0%, transparent 60%)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: '-60px', left: '-100px', width: '420px', height: '420px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(0,191,165,0.15) 0%, transparent 65%)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', top: '40%', left: '30%', width: '300px', height: '300px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,255,255,0.03) 0%, transparent 70%)', pointerEvents: 'none' }} />

        {/* Top: Logo */}
        <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', gap: '18px' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', background: 'rgba(255,255,255,0.95)', borderRadius: '12px', padding: '10px 20px' }}>
            <Image src="/trescon-logo.png" alt="Trescon" width={180} height={44} style={{ height: '44px', width: 'auto', display: 'block' }} />
          </div>
          <div style={{ width: '1px', height: '32px', background: 'rgba(255,255,255,0.25)' }} />
          <div>
            <div style={{ fontSize: '14px', fontWeight: 900, color: '#FFFFFF', letterSpacing: '0.5px' }}>Event Pilot</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '3px' }}>
              <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#C0F43C', animation: 'pulse 2s infinite' }} />
              <span style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '2px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.85)' }}>Live Platform</span>
            </div>
          </div>
        </div>

        {/* Middle: Hero */}
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '3px', textTransform: 'uppercase', color: '#C0F43C', marginBottom: '20px' }}>Event Management Platform</div>
          <h1 style={{ fontSize: '54px', fontWeight: 900, color: '#FFFFFF', lineHeight: 1.06, letterSpacing: '-2.5px', margin: '0 0 24px' }}>
            Build the skills<br />
            <span style={{ color: '#C0F43C' }}>AI demands</span><br />
            of your team.
          </h1>
          <p style={{ fontSize: '15px', color: 'rgba(255,255,255,0.75)', lineHeight: 1.7, margin: 0, maxWidth: '400px' }}>
            Event Pilot maps your team&apos;s AI readiness, delivers personalised learning paths, and tracks progress in real time.
          </p>
        </div>

        {/* Bottom: offices + stat pills */}
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
            {[
              { label: 'Courses', value: '20+' },
              { label: 'AI Features', value: '5' },
              { label: 'Offices', value: '4' },
            ].map(s => (
              <div key={s.label} style={{ background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.20)', borderRadius: '10px', padding: '10px 18px', backdropFilter: 'blur(4px)' }}>
                <div style={{ fontSize: '20px', fontWeight: 900, color: '#FFFFFF', lineHeight: 1 }}>{s.value}</div>
                <div style={{ fontSize: '11px', fontWeight: 700, color: 'rgba(255,255,255,0.65)', marginTop: '3px', textTransform: 'uppercase', letterSpacing: '1px' }}>{s.label}</div>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {['Dubai', 'Bangalore', 'Mangalore', 'Manipal'].map((city, i) => (
              <span key={city} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '13px', fontWeight: 600, color: 'rgba(255,255,255,0.70)' }}>{city}</span>
                {i < 3 && <span style={{ color: '#C0F43C', fontWeight: 900, fontSize: '13px', opacity: 0.6 }}>·</span>}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* ── RIGHT PANEL — Login form ── */}
      <div style={{
        background:     '#FFFFFF',
        display:        'flex',
        flexDirection:  'column',
        alignItems:     'center',
        justifyContent: 'center',
        padding:        '56px 52px',
        borderLeft:     '1px solid #DDE8EE',
      }}>
        <div style={{ width: '100%', maxWidth: '360px' }}>

          {/* Form header */}
          <div style={{ marginBottom: '40px' }}>
            <div style={{ width: '48px', height: '48px', background: 'linear-gradient(135deg, #00897B 0%, #00695C 100%)', borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '24px' }}>
              <svg width="22" height="22" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
            </div>
            <div style={{ fontSize: '12px', fontWeight: 800, letterSpacing: '2.5px', textTransform: 'uppercase', color: '#00695C', marginBottom: '10px' }}>Welcome Back</div>
            <h2 style={{ fontSize: '32px', fontWeight: 900, color: '#0F1923', margin: 0, letterSpacing: '-0.5px', lineHeight: 1.1 }}>Sign in to<br />Event Pilot</h2>
          </div>

          {/* Forgot password panel */}
          {showForgot && (
            <div style={{ marginBottom: '28px', padding: '24px', background: '#F0F4F8', borderRadius: '14px', border: '1px solid #DDE8EE' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                <div style={{ fontSize: '15px', fontWeight: 800, color: '#0F1923' }}>Reset your password</div>
                <button type="button" onClick={() => { setShowForgot(false); setFpSent(false); setFpError(''); setFpEmail('') }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#5B7080', padding: 0, fontSize: '20px', lineHeight: 1 }}>×</button>
              </div>
              {fpSent ? (
                <div style={{ fontSize: '14px', color: '#00695C', fontWeight: 600, lineHeight: 1.55 }}>
                  If that email is registered, a reset link has been sent. Check your inbox (and spam folder).
                </div>
              ) : (
                <form onSubmit={handleForgotPassword} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <input
                    type="email"
                    value={fpEmail}
                    onChange={e => { setFpEmail(e.target.value); setFpError('') }}
                    placeholder="your.email@tresconglobal.com"
                    className="tfield"
                    style={{ padding: '12px 14px', borderRadius: '10px', fontSize: '14px' }}
                  />
                  {fpError && <div style={{ fontSize: '12px', color: '#DC2626' }}>{fpError}</div>}
                  <button type="submit" disabled={fpLoading}
                    style={{ padding: '12px', borderRadius: '10px', background: fpLoading ? '#B8CDD8' : '#00697B', color: 'white', fontSize: '14px', fontWeight: 800, border: 'none', cursor: fpLoading ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                    {fpLoading ? 'Sending…' : 'Send reset link'}
                  </button>
                </form>
              )}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
              <label style={{ fontSize: '12px', fontWeight: 800, color: '#0F1923', letterSpacing: '1.2px', textTransform: 'uppercase' }}>
                Work Email
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@tresconglobal.com"
                autoComplete="email"
                disabled={loading}
                className="tfield"
                style={{ padding: '13px 16px', borderRadius: '10px', fontSize: '14px' }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <label style={{ fontSize: '12px', fontWeight: 800, color: '#0F1923', letterSpacing: '1.2px', textTransform: 'uppercase' }}>
                  Password
                </label>
                <button type="button" onClick={() => { setShowForgot(true); setFpSent(false); setFpError(''); setFpEmail(email) }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: 700, color: '#00695C', padding: 0, fontFamily: 'inherit', textDecoration: 'underline' }}>
                  Forgot password?
                </button>
              </div>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Your password"
                  autoComplete="current-password"
                  disabled={loading}
                  className="tfield"
                  style={{ width: '100%', boxSizing: 'border-box', padding: '13px 44px 13px 16px', borderRadius: '10px', fontSize: '14px' }}
                />
                <button
                  type="button"
                  onClick={() => setShowPass(v => !v)}
                  style={{ position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: '0', display: 'flex', alignItems: 'center', color: '#5B7080' }}
                >
                  {showPass ? (
                    <svg width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                  ) : (
                    <svg width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  )}
                </button>
              </div>
            </div>

            {error && (
              <div style={{ padding: '12px 16px', background: '#FFF1F2', border: '1px solid #FCA5A5', borderLeft: '4px solid #B91C1C', borderRadius: '10px', fontSize: '13px', color: '#B91C1C', fontWeight: 700, lineHeight: 1.5 }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{ marginTop: '4px', padding: '15px', borderRadius: '10px', border: 'none', background: loading ? '#B8CDD8' : 'linear-gradient(135deg, #00897B 0%, #00695C 100%)', color: loading ? '#5B7080' : 'white', fontSize: '14px', fontWeight: 800, cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', transition: 'all 0.2s ease' }}>
              {loading ? (
                <>
                  <div style={{ width: '16px', height: '16px', border: '2px solid #B8CDD8', borderTopColor: '#5B7080', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                  Signing in…
                </>
              ) : (
                <>
                  Sign In
                  <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>
                </>
              )}
            </button>
          </form>

          {/* Help note */}
          <div style={{ marginTop: '32px', padding: '16px 18px', background: '#E8EEF4', border: '1px solid #DDE8EE', borderRadius: '12px', fontSize: '13px', color: '#2D3E50', lineHeight: 1.65, textAlign: 'center' }}>
            Having trouble logging in?<br />
            <span style={{ fontWeight: 700, color: '#0F1923' }}>Contact your manager or the HR team.</span>
          </div>

          {/* Bottom wordmark */}
          <div style={{ marginTop: '36px', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
            <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#00897B', animation: 'pulse 2s infinite' }} />
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#5B7080', letterSpacing: '1.5px', textTransform: 'uppercase' }}>Event Pilot · Trescon Global</span>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes spin  { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
      `}</style>
    </div>
  )
}
