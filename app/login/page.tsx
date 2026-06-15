'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'

export default function LoginPage() {
  const [error, setError] = useState('')

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const ssoErr = params.get('error')
    if (ssoErr) setError(ssoErr)
  }, [])

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
                {i < 3 && <span style={{ color: '#C0F43C', fontWeight: 900, fontSize: '13px', opacity: 0.6 }}>·</span>}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* ── RIGHT PANEL ── */}
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

          {/* Header */}
          <div style={{ marginBottom: '48px' }}>
            <div style={{ width: '48px', height: '48px', background: 'linear-gradient(135deg, #00897B 0%, #00695C 100%)', borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '24px' }}>
              <svg width="22" height="22" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
            </div>
            <div style={{ fontSize: '12px', fontWeight: 800, letterSpacing: '2.5px', textTransform: 'uppercase', color: '#00695C', marginBottom: '10px' }}>Welcome Back</div>
            <h2 style={{ fontSize: '32px', fontWeight: 900, color: '#0F1923', margin: 0, letterSpacing: '-0.5px', lineHeight: 1.1 }}>Sign in to<br />Event Pilot</h2>
          </div>

          {/* SSO error */}
          {error && (
            <div style={{ padding: '12px 16px', background: '#FFF1F2', border: '1px solid #FCA5A5', borderLeft: '4px solid #B91C1C', borderRadius: '10px', fontSize: '13px', color: '#B91C1C', fontWeight: 700, lineHeight: 1.5, marginBottom: '24px' }}>
              {error}
            </div>
          )}

          {/* Microsoft SSO — only login option */}
          <a
            href="/api/auth/microsoft"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', padding: '16px 20px', borderRadius: '12px', border: '1.5px solid #DDE8EE', background: '#FFFFFF', color: '#0F1923', fontSize: '15px', fontWeight: 700, textDecoration: 'none', cursor: 'pointer', transition: 'border-color 0.2s, box-shadow 0.2s', boxShadow: '0 2px 8px rgba(0,0,0,0.07)', fontFamily: 'inherit' }}
            onMouseOver={e => { (e.currentTarget as HTMLAnchorElement).style.borderColor = '#00897B'; (e.currentTarget as HTMLAnchorElement).style.boxShadow = '0 4px 16px rgba(0,137,123,0.18)' }}
            onMouseOut={e => { (e.currentTarget as HTMLAnchorElement).style.borderColor = '#DDE8EE'; (e.currentTarget as HTMLAnchorElement).style.boxShadow = '0 2px 8px rgba(0,0,0,0.07)' }}
          >
            <svg width="20" height="20" viewBox="0 0 21 21" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="1" y="1"   width="9" height="9" fill="#F35325"/>
              <rect x="11" y="1"  width="9" height="9" fill="#81BC06"/>
              <rect x="1" y="11"  width="9" height="9" fill="#05A6F0"/>
              <rect x="11" y="11" width="9" height="9" fill="#FFBA08"/>
            </svg>
            Sign in with Microsoft 365
          </a>

          {/* Help note */}
          <div style={{ marginTop: '28px', padding: '16px 18px', background: '#E8EEF4', border: '1px solid #DDE8EE', borderRadius: '12px', fontSize: '13px', color: '#2D3E50', lineHeight: 1.65, textAlign: 'center' }}>
            Having trouble logging in?<br />
            <span style={{ fontWeight: 700, color: '#0F1923' }}>Contact your manager or the HR team.</span>
          </div>

          {/* Bottom wordmark */}
          <div style={{ marginTop: '36px', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
            <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#00897B', animation: 'pulse 2s infinite' }} />
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#5B7080', letterSpacing: '1.5px', textTransform: 'uppercase' }}>Event Pilot · Trescon</span>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
      `}</style>
    </div>
  )
}
