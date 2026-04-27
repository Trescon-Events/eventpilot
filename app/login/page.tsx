'use client'

import { useState } from 'react'
import Image from 'next/image'

export default function LoginPage() {
  const [email,       setEmail]       = useState('')
  const [password,    setPassword]    = useState('')
  const [showPass,    setShowPass]    = useState(false)
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState('')

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

      // First login — no questionnaire completed yet → go to questionnaire
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
      background: '#080A0B',
      minHeight:  '100vh',
      display:    'grid',
      gridTemplateColumns: '1fr 440px',
    }}>

      {/* ── LEFT PANEL ── */}
      <div style={{
        background:  'linear-gradient(145deg, #0D1A1A 0%, #080A0B 55%, #0A1208 100%)',
        borderRight: '1px solid rgba(255,255,255,0.07)',
        padding:     '56px 64px',
        display:     'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        position:    'relative',
        overflow:    'hidden',
      }}>

        {/* Background glows */}
        <div style={{ position: 'absolute', top: '-100px', left: '-80px', width: '500px', height: '500px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(0,165,163,0.1) 0%, transparent 65%)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: '-80px', right: '-60px', width: '400px', height: '400px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(192,244,60,0.06) 0%, transparent 65%)', pointerEvents: 'none' }} />

        {/* Top: Logo + badge aligned */}
        <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', gap: '20px' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', background: 'white', borderRadius: '12px', padding: '10px 20px' }}>
            <Image src="/trescon-logo.png" alt="Trescon" width={200} height={48} style={{ height: '48px', width: 'auto', display: 'block' }} />
          </div>
          <div style={{ width: '1px', height: '36px', background: 'rgba(255,255,255,0.12)' }} />
          <div>
            <div style={{ fontSize: '15px', fontWeight: 800, color: 'white', letterSpacing: '-0.2px', lineHeight: 1.2 }}>Trescademy</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
              <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#C0F43C', animation: 'pulse 2s infinite' }} />
              <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#00A5A3' }}>Going live soon</span>
            </div>
          </div>
        </div>

        {/* Middle: Hero content */}
        <div style={{ position: 'relative', zIndex: 1 }}>
          <h1 style={{ fontSize: '52px', fontWeight: 900, color: 'white', lineHeight: 1.05, letterSpacing: '-2px', margin: 0 }}>
            Connecting<br />
            <span style={{ color: '#00A5A3' }}>your skills</span> with<br />
            tomorrow&apos;s work.
          </h1>
        </div>

        {/* Bottom: offices + quote */}
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ width: '40px', height: '2px', background: '#00A5A3', borderRadius: '2px', marginBottom: '20px' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
            {['Dubai', 'Bangalore', 'Mangalore', 'Manipal'].map((city, i) => (
              <span key={city} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '13px', fontWeight: 700, color: '#FFFFFF', letterSpacing: '0.2px' }}>{city}</span>
                {i < 3 && <span style={{ color: '#00A5A3', fontWeight: 900, fontSize: '14px' }}>·</span>}
              </span>
            ))}
          </div>
          <div style={{ fontSize: '13px', fontStyle: 'italic', fontWeight: 500, color: '#00A5A3', letterSpacing: '0.2px' }}>
            &ldquo;Every engagement delivers results.&rdquo; — Trescon Global
          </div>
        </div>
      </div>

      {/* ── RIGHT PANEL — Login form ── */}
      <div style={{
        background:     '#0C0E10',
        display:        'flex',
        flexDirection:  'column',
        alignItems:     'center',
        justifyContent: 'center',
        padding:        '48px 40px',
      }}>
        <div style={{ width: '100%', maxWidth: '340px' }}>

          {/* Form header */}
          <div style={{ marginBottom: '36px' }}>
            <div style={{ width: '44px', height: '44px', background: '#00A5A3', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '20px' }}>
              <svg width="20" height="20" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
            </div>
            <h2 style={{ fontSize: '22px', fontWeight: 900, color: 'white', margin: 0, letterSpacing: '-0.3px' }}>Sign in to Trescademy</h2>
          </div>

          {/* Form */}
          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '11px', fontWeight: 700, color: 'rgba(255,255,255,0.45)', letterSpacing: '1px', textTransform: 'uppercase' }}>
                Work Email
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@tresconglobal.com"
                autoComplete="email"
                disabled={loading}
                style={{ padding: '13px 16px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: 'white', fontSize: '14px', fontFamily: 'inherit', outline: 'none' }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '11px', fontWeight: 700, color: 'rgba(255,255,255,0.45)', letterSpacing: '1px', textTransform: 'uppercase' }}>
                Password
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Your password"
                  autoComplete="current-password"
                  disabled={loading}
                  style={{ width: '100%', boxSizing: 'border-box', padding: '13px 44px 13px 16px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: 'white', fontSize: '14px', fontFamily: 'inherit', outline: 'none' }}
                />
                <button
                  type="button"
                  onClick={() => setShowPass(v => !v)}
                  style={{ position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: '0', display: 'flex', alignItems: 'center', color: 'rgba(255,255,255,0.35)' }}
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
              <div style={{ padding: '12px 16px', background: 'rgba(255,107,107,0.08)', border: '1px solid rgba(255,107,107,0.25)', borderRadius: '10px', fontSize: '13px', color: '#FF6B6B', fontWeight: 600 }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{ marginTop: '4px', padding: '14px', borderRadius: '12px', border: 'none', background: loading ? 'rgba(0,165,163,0.5)' : '#00A5A3', color: 'white', fontSize: '15px', fontWeight: 800, cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
              {loading ? (
                <>
                  <div style={{ width: '16px', height: '16px', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: 'white', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
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
          <div style={{ marginTop: '28px', padding: '14px 16px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '12px', fontSize: '12px', color: 'rgba(255,255,255,0.35)', lineHeight: 1.7, textAlign: 'center' }}>
            Having trouble logging in?<br />
            Contact your manager or the HR team.
          </div>

          {/* Bottom wordmark */}
          <div style={{ marginTop: '32px', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
            <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#00A5A3', animation: 'pulse 2s infinite' }} />
            <span style={{ fontSize: '11px', fontWeight: 700, color: 'rgba(255,255,255,0.2)', letterSpacing: '1.5px', textTransform: 'uppercase' }}>Trescademy · Trescon Global</span>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes spin  { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        input:focus { border-color: rgba(0,165,163,0.5) !important; background: rgba(255,255,255,0.07) !important; }
      `}</style>
    </div>
  )
}
