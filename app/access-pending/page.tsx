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
      background:     'var(--surface)',
      minHeight:      '100vh',
      display:        'flex',
      alignItems:     'center',
      justifyContent: 'center',
      padding:        '40px 20px',
    }}>
      <div style={{ width: '100%', maxWidth: '460px' }}>

        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '14px', marginBottom: '40px' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', background: 'rgba(255,255,255,0.95)', borderRadius: '10px', padding: '8px 16px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>
            <Image src="/trescon-logo.png" alt="Trescon" width={120} height={30} style={{ height: '30px', width: 'auto', display: 'block' }} />
          </div>
          <div style={{ width: '1px', height: '24px', background: 'var(--border)' }} />
          <span style={{ fontSize: '15px', fontWeight: 900, color: 'var(--ink)', letterSpacing: '0.3px' }}>Event Pilot</span>
        </div>

        {/* Card */}
        <div style={{ background: 'var(--card)', borderRadius: '20px', padding: '48px 44px', boxShadow: 'var(--shadow-md)', border: '1px solid var(--border-light)' }}>

          {/* Icon */}
          <div style={{ width: '56px', height: '56px', background: 'var(--amber-light)', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '24px' }}>
            <svg width="26" height="26" fill="none" stroke="#F5B94D" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
          </div>

          {sent ? (
            <>
              <div style={{ width: '56px', height: '56px', background: 'var(--success-light)', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '24px' }}>
                <svg width="26" height="26" fill="none" stroke="var(--success)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              </div>
              <h2 style={{ fontSize: '24px', fontWeight: 900, color: 'var(--ink)', margin: '0 0 12px', letterSpacing: '-0.3px' }}>Request sent</h2>
              <p style={{ color: 'var(--ink3)', fontSize: '15px', lineHeight: 1.7, margin: 0 }}>
                We've notified the admin team. You'll receive an email once your access is approved.
              </p>
            </>
          ) : (
            <>
              <h2 style={{ fontSize: '24px', fontWeight: 900, color: 'var(--ink)', margin: '0 0 12px', letterSpacing: '-0.3px' }}>
                Platform in testing
              </h2>
              <p style={{ color: 'var(--ink3)', fontSize: '15px', lineHeight: 1.7, margin: '0 0 32px' }}>
                EventPilot is currently available to a limited group of early testers.
                Enter your work email below to request access — our admin team will review it.
              </p>

              <form onSubmit={handleRequest} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 800, color: 'var(--ink)', letterSpacing: '1.5px', textTransform: 'uppercase' }}>
                    Work Email
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => { setEmail(e.target.value); setError('') }}
                    placeholder="you@tresconglobal.com"
                    disabled={loading}
                    style={{ padding: '13px 16px', borderRadius: '10px', border: '1.5px solid var(--border)', fontSize: '14px', fontFamily: 'inherit', outline: 'none', background: 'var(--card)', color: 'var(--ink)' }}
                  />
                </div>

                {error && (
                  <div style={{ padding: '10px 14px', background: 'var(--red-light)', border: '1px solid var(--red-border)', borderLeft: '4px solid var(--red)', borderRadius: '8px', fontSize: '13px', color: 'var(--red)', fontWeight: 700 }}>
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  style={{ padding: '14px', borderRadius: '10px', border: 'none', background: loading ? 'var(--card-hi)' : 'linear-gradient(135deg, var(--teal-mid) 0%, var(--teal) 100%)', color: loading ? 'var(--ink2)' : 'var(--teal-light)', fontSize: '14px', fontWeight: 800, cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                >
                  {loading ? 'Sending…' : 'Request Access'}
                </button>
              </form>
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{ marginTop: '28px', textAlign: 'center', fontSize: '12px', color: 'var(--ink3)', fontWeight: 600 }}>
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
