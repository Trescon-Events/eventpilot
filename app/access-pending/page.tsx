'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Image from 'next/image'

function AccessPendingContent() {
  const searchParams = useSearchParams()
  const [email,   setEmail]   = useState(searchParams.get('email') ?? '')
  const [loading, setLoading] = useState(false)
  const [sent,    setSent]    = useState(false)
  const [error,   setError]   = useState('')

  async function handleRequest(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim() || !email.includes('@')) { setError('Enter a valid email address.'); return }
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/request-access', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email: email.trim() }),
      })
      if (!res.ok) { const d = await res.json(); setError(d.error ?? 'Something went wrong.'); return }
      setSent(true)
    } catch {
      setError('Something went wrong. Try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      fontFamily:     'var(--font-manrope), Manrope, sans-serif',
      background:     '#E8EEF4',
      minHeight:      '100vh',
      display:        'flex',
      alignItems:     'center',
      justifyContent: 'center',
      padding:        '40px 20px',
    }}>
      <div style={{ width: '100%', maxWidth: '460px' }}>

        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '14px', marginBottom: '40px' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', background: '#fff', borderRadius: '10px', padding: '8px 16px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>
            <Image src="/trescon-logo.png" alt="Trescon" width={120} height={30} style={{ height: '30px', width: 'auto', display: 'block' }} />
          </div>
          <div style={{ width: '1px', height: '24px', background: '#CBD5E0' }} />
          <span style={{ fontSize: '15px', fontWeight: 900, color: '#0F1923', letterSpacing: '0.3px' }}>Event Pilot</span>
        </div>

        {/* Card */}
        <div style={{ background: '#fff', borderRadius: '20px', padding: '48px 44px', boxShadow: '0 4px 24px rgba(0,0,0,0.07)', border: '1px solid #DDE8EE' }}>

          {/* Icon */}
          <div style={{ width: '56px', height: '56px', background: 'linear-gradient(135deg, #FEF3C7 0%, #FDE68A 100%)', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '24px' }}>
            <svg width="26" height="26" fill="none" stroke="#D97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
          </div>

          {sent ? (
            <>
              <div style={{ width: '56px', height: '56px', background: 'linear-gradient(135deg, #D1FAE5 0%, #A7F3D0 100%)', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '24px' }}>
                <svg width="26" height="26" fill="none" stroke="#059669" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              </div>
              <h2 style={{ fontSize: '24px', fontWeight: 900, color: '#0F1923', margin: '0 0 12px', letterSpacing: '-0.3px' }}>Request sent</h2>
              <p style={{ color: '#5B7080', fontSize: '15px', lineHeight: 1.7, margin: 0 }}>
                We've notified the admin team. You'll receive an email once your access is approved.
              </p>
            </>
          ) : (
            <>
              <h2 style={{ fontSize: '24px', fontWeight: 900, color: '#0F1923', margin: '0 0 12px', letterSpacing: '-0.3px' }}>
                Platform in testing
              </h2>
              <p style={{ color: '#5B7080', fontSize: '15px', lineHeight: 1.7, margin: '0 0 32px' }}>
                EventPilot is currently available to a limited group of early testers.
                Enter your work email below to request access — our admin team will review it.
              </p>

              <form onSubmit={handleRequest} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 800, color: '#0F1923', letterSpacing: '1.5px', textTransform: 'uppercase' }}>
                    Work Email
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => { setEmail(e.target.value); setError('') }}
                    placeholder="you@tresconglobal.com"
                    disabled={loading}
                    style={{ padding: '13px 16px', borderRadius: '10px', border: '1.5px solid #DDE8EE', fontSize: '14px', fontFamily: 'inherit', outline: 'none', background: '#fff', color: '#0F1923' }}
                  />
                </div>

                {error && (
                  <div style={{ padding: '10px 14px', background: '#FFF1F2', border: '1px solid #FCA5A5', borderLeft: '4px solid #B91C1C', borderRadius: '8px', fontSize: '13px', color: '#B91C1C', fontWeight: 700 }}>
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  style={{ padding: '14px', borderRadius: '10px', border: 'none', background: loading ? '#B8CDD8' : 'linear-gradient(135deg, #00897B 0%, #00695C 100%)', color: loading ? '#5B7080' : '#fff', fontSize: '14px', fontWeight: 800, cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                >
                  {loading ? 'Sending…' : 'Request Access'}
                </button>
              </form>
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{ marginTop: '28px', textAlign: 'center', fontSize: '12px', color: '#94A3B8', fontWeight: 600 }}>
          Event Pilot · Trescon
        </div>
      </div>
    </div>
  )
}

export default function AccessPendingPage() {
  return (
    <Suspense>
      <AccessPendingContent />
    </Suspense>
  )
}
