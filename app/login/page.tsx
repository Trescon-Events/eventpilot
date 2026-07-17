'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'

export default function LoginPage() {
  const router = useRouter()
  const [ssoError, setSsoError] = useState('')
  const [nextParam, setNextParam] = useState('')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(false)
  const [loginError, setLoginError] = useState('')
  const [loading, setLoading]   = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  // Password sign-in is a local-dev-only escape hatch for exception accounts —
  // production is Microsoft SSO for everyone, so this never shows on the live site.
  const [showPasswordForm, setShowPasswordForm] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const err = params.get('error')
    if (err) setSsoError(err)
    const next = params.get('next')
    if (next) setNextParam(next)
    if (process.env.NODE_ENV !== 'production' && params.get('staff') === '1') {
      setShowPasswordForm(true)
    }
  }, [])

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoginError('')
    setLoading(true)
    try {
      const res = await fetch('/api/login', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email: email.trim(), password, rememberMe }),
      })
      const data = await res.json()
      if (!res.ok) {
        setLoginError(data.error ?? 'Login failed. Please try again.')
        return
      }
      router.push('/dashboard')
    } catch {
      setLoginError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const C = {
    teal:    'var(--teal-mid)',
    tealDk:  'var(--teal)', // NOTE: named "tealDk" historically; migration table maps this hex to var(--teal), not var(--teal-dark)
    lime:    'var(--lime)',
    bg:      'var(--surface)',
    border:  'var(--border)',
    text:    'var(--ink)',
    muted:   'var(--ink3)',
  }

  const inputStyle: React.CSSProperties = {
    width:        '100%',
    padding:      '13px 16px',
    borderRadius: '10px',
    border:       `1.5px solid ${C.border}`,
    fontSize:     '15px',
    color:        C.text,
    background:   'var(--card)',
    outline:      'none',
    fontFamily:   'inherit',
    boxSizing:    'border-box',
  }

  return (
    <div style={{
      fontFamily: 'var(--font-manrope), Manrope, sans-serif',
      background: C.bg,
      minHeight:  '100vh',
      display:    'grid',
      gridTemplateColumns: '1fr 480px',
    }}>

      {/* ── LEFT PANEL ── */}
      <div style={{
        background:     `linear-gradient(145deg, #004D40 0%, #00695C 45%, #00897B 100%)`,
        padding:        '56px 72px',
        display:        'flex',
        flexDirection:  'column',
        justifyContent: 'space-between',
        position:       'relative',
        overflow:       'hidden',
      }}>
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
              <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: C.lime, animation: 'pulse 2s infinite' }} />
              <span style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '2px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.85)' }}>Live Platform</span>
            </div>
          </div>
        </div>

        {/* Middle: Hero */}
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '3px', textTransform: 'uppercase', color: C.lime, marginBottom: '20px' }}>Event Management Platform</div>
          <h1 style={{ fontSize: '54px', fontWeight: 900, color: '#FFFFFF', lineHeight: 1.06, letterSpacing: '-2.5px', margin: '0 0 24px' }}>
            Build the skills<br />
            <span style={{ color: C.lime }}>AI demands</span><br />
            of your team.
          </h1>
          <p style={{ fontSize: '15px', color: 'rgba(255,255,255,0.75)', lineHeight: 1.7, margin: 0, maxWidth: '400px' }}>
            Event Pilot maps your team&apos;s AI readiness, delivers personalised learning paths, and tracks progress in real time.
          </p>
        </div>

        {/* Bottom: stat pills + offices */}
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
                {i < 3 && <span style={{ color: C.lime, fontWeight: 900, fontSize: '13px', opacity: 0.6 }}>·</span>}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* ── RIGHT PANEL ── */}
      <div style={{
        background:     'var(--card)',
        display:        'flex',
        flexDirection:  'column',
        alignItems:     'center',
        justifyContent: 'center',
        padding:        '56px 52px',
        borderLeft:     `1px solid ${C.border}`,
      }}>
        <div style={{ width: '100%', maxWidth: '360px' }}>

          {/* Header */}
          <div style={{ marginBottom: '36px' }}>
            <div style={{ width: '48px', height: '48px', background: `linear-gradient(135deg, ${C.teal} 0%, ${C.tealDk} 100%)`, borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '24px' }}>
              <svg width="22" height="22" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
            </div>
            <div style={{ fontSize: '12px', fontWeight: 800, letterSpacing: '2.5px', textTransform: 'uppercase', color: C.teal, marginBottom: '10px' }}>Welcome Back</div>
            <h2 style={{ fontSize: '32px', fontWeight: 900, color: C.text, margin: 0, letterSpacing: '-0.5px', lineHeight: 1.1 }}>Sign in to<br />Event Pilot</h2>
          </div>

          {/* SSO error */}
          {ssoError && (
            <div style={{ padding: '12px 16px', background: 'var(--red-light)', border: '1px solid var(--red-border)', borderLeft: '4px solid var(--red)', borderRadius: '10px', fontSize: '13px', color: 'var(--red)', fontWeight: 700, lineHeight: 1.5, marginBottom: '20px' }}>
              {ssoError}
            </div>
          )}

          {/* Microsoft SSO button */}
          <a
            href={`/api/auth/microsoft${nextParam ? '?next=' + encodeURIComponent(nextParam) : ''}`}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', padding: '14px 20px', borderRadius: '12px', border: `1.5px solid ${C.border}`, background: '#FFFFFF', color: '#0F1923', fontSize: '15px', fontWeight: 700, textDecoration: 'none', cursor: 'pointer', transition: 'border-color 0.2s, box-shadow 0.2s', boxShadow: '0 2px 8px rgba(0,0,0,0.07)', fontFamily: 'inherit', marginBottom: '20px' }}
            onMouseOver={e => { (e.currentTarget as HTMLAnchorElement).style.borderColor = C.teal; (e.currentTarget as HTMLAnchorElement).style.boxShadow = '0 4px 16px rgba(0,137,123,0.18)' }}
            onMouseOut={e => { (e.currentTarget as HTMLAnchorElement).style.borderColor = C.border; (e.currentTarget as HTMLAnchorElement).style.boxShadow = '0 2px 8px rgba(0,0,0,0.07)' }}
          >
            <svg width="20" height="20" viewBox="0 0 21 21" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="1" y="1"   width="9" height="9" fill="#F35325"/>
              <rect x="11" y="1"  width="9" height="9" fill="#81BC06"/>
              <rect x="1" y="11"  width="9" height="9" fill="#05A6F0"/>
              <rect x="11" y="11" width="9" height="9" fill="#FFBA08"/>
            </svg>
            Sign in with Microsoft 365
          </a>

          {showPasswordForm && <>
          {/* Divider */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
            <div style={{ flex: 1, height: '1px', background: C.border }} />
            <span style={{ fontSize: '12px', fontWeight: 700, color: C.muted, letterSpacing: '1px', textTransform: 'uppercase' }}>or</span>
            <div style={{ flex: 1, height: '1px', background: C.border }} />
          </div>

          {/* Email / Password form */}
          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: C.muted, letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '6px' }}>Work Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@tresconglobal.com"
                required
                style={inputStyle}
                onFocus={e => (e.currentTarget.style.borderColor = C.teal)}
                onBlur={e => (e.currentTarget.style.borderColor = C.border)}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: C.muted, letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '6px' }}>Password</label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                  style={{ ...inputStyle, paddingRight: '44px' }}
                  onFocus={e => (e.currentTarget.style.borderColor = C.teal)}
                  onBlur={e => (e.currentTarget.style.borderColor = C.border)}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: C.muted }}
                >
                  {showPassword
                    ? <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                    : <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  }
                </button>
              </div>
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: '9px', cursor: 'pointer', userSelect: 'none' }}>
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={e => setRememberMe(e.target.checked)}
                style={{ width: '16px', height: '16px', accentColor: C.teal, cursor: 'pointer' }}
              />
              <span style={{ fontSize: '13px', color: C.muted, fontWeight: 600 }}>Remember me on this device</span>
            </label>

            {loginError && (
              <div style={{ padding: '10px 14px', background: 'var(--red-light)', border: '1px solid var(--red-border)', borderLeft: '4px solid var(--red)', borderRadius: '8px', fontSize: '13px', color: 'var(--red)', fontWeight: 700, lineHeight: 1.5 }}>
                {loginError}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{ padding: '14px', borderRadius: '12px', border: 'none', background: loading ? '#2A5F58' : `linear-gradient(135deg, ${C.teal} 0%, ${C.tealDk} 100%)`, color: 'var(--teal-light)', fontSize: '15px', fontWeight: 800, cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'inherit', letterSpacing: '0.3px' }}
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          {/* Help note */}
          <div style={{ marginTop: '24px', padding: '14px 16px', background: C.bg, border: `1px solid ${C.border}`, borderRadius: '12px', fontSize: '13px', color: 'var(--ink2)', lineHeight: 1.65, textAlign: 'center' }}>
            Local dev sign-in. Contact your admin if you need help.
          </div>
          </>}

          {/* Bottom wordmark */}
          <div style={{ marginTop: '28px', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
            <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: C.teal, animation: 'pulse 2s infinite' }} />
            <span style={{ fontSize: '12px', fontWeight: 700, color: C.muted, letterSpacing: '1.5px', textTransform: 'uppercase' }}>Event Pilot · Trescon</span>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
      `}</style>
    </div>
  )
}
