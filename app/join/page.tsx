'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { joinTAOS } from '@/app/actions/join'
import Link from 'next/link'

const OFFICES = [
  { id: 'dubai',     label: 'Dubai',     total: 15,  color: '#00A5A3' },
  { id: 'bangalore', label: 'Bangalore', total: 91,  color: '#C0F43C' },
  { id: 'mangalore', label: 'Mangalore', total: 15,  color: '#F4ED3C' },
  { id: 'manipal',   label: 'Manipal',   total: 63,  color: '#FF6B6B' },
]

const DEPARTMENTS = [
  'Events', 'Sales & Sponsorship', 'Marketing', 'Finance', 'Operations',
  'IT', 'HR & Recruitment', 'Content & Design', 'Government Relations',
  'DemandifyMedia', 'Leadership', 'Other',
]

export default function JoinPage() {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [error, setError]     = useState('')
  const [office, setOffice]   = useState('')

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    setPending(true)

    const fd = new FormData(e.currentTarget)
    const result = await joinTAOS(fd)

    if (result.error) {
      setError(result.error)
      setPending(false)
      return
    }

    router.push(`/welcome?name=${encodeURIComponent(result.name!)}&office=${result.office_id}`)
  }

  return (
    <div style={{ fontFamily: 'var(--font-manrope), Manrope, sans-serif', background: '#F2F5F5', minHeight: '100vh' }}>

      {/* Nav */}
      <nav style={{ background: '#010103', padding: '0 48px', height: '60px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '10px', textDecoration: 'none' }}>
          <div style={{ width: '28px', height: '28px', background: '#00A5A3', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="14" height="14" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
          </div>
          <span style={{ fontSize: '14px', fontWeight: 800, color: 'white' }}>TAOS</span>
        </Link>
        <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.3)' }}>Join the Journey</span>
      </nav>

      <div style={{ maxWidth: '600px', margin: '0 auto', padding: '60px 24px' }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '44px' }}>
          <div style={{ width: '56px', height: '56px', background: '#1E2124', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
            <svg width="26" height="26" fill="none" stroke="#C0F43C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
          </div>
          <h1 style={{ fontSize: '32px', fontWeight: 800, color: '#1E2124', marginBottom: '10px', letterSpacing: '-0.5px' }}>
            Join the TAOS Journey
          </h1>
          <p style={{ fontSize: '15px', color: '#464D53', lineHeight: 1.7, maxWidth: '460px', margin: '0 auto' }}>
            Takes 2 minutes. You will receive a welcome email instantly and see your office counter go up in real time on the main page.
          </p>
        </div>

        {/* Form card */}
        <div style={{ background: 'white', border: '1px solid #E5E7EB', borderRadius: '24px', padding: '40px', boxShadow: '0 4px 20px rgba(0,0,0,0.05)' }}>

          <form onSubmit={handleSubmit}>

            {/* Name */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#1E2124', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '8px' }}>
                Full Name *
              </label>
              <input
                name="name"
                type="text"
                required
                placeholder="e.g. Priya Sharma"
                style={{ width: '100%', padding: '12px 16px', borderRadius: '12px', border: '1px solid #E5E7EB', fontSize: '14px', color: '#1E2124', outline: 'none', fontFamily: 'inherit', background: '#FAFAFA' }}
              />
            </div>

            {/* Email */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#1E2124', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '8px' }}>
                Work Email *
              </label>
              <input
                name="email"
                type="email"
                required
                placeholder="you@tresconglobal.com"
                style={{ width: '100%', padding: '12px 16px', borderRadius: '12px', border: '1px solid #E5E7EB', fontSize: '14px', color: '#1E2124', outline: 'none', fontFamily: 'inherit', background: '#FAFAFA' }}
              />
            </div>

            {/* Office */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#1E2124', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '12px' }}>
                Your Office *
              </label>
              <input type="hidden" name="office_id" value={office} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                {OFFICES.map(o => (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => setOffice(o.id)}
                    style={{
                      padding: '14px 16px',
                      borderRadius: '12px',
                      border: `2px solid ${office === o.id ? o.color : '#E5E7EB'}`,
                      background: office === o.id ? `${o.color}15` : 'white',
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'all 0.2s ease',
                    }}
                  >
                    <div style={{ fontSize: '14px', fontWeight: 700, color: office === o.id ? '#1E2124' : '#464D53', marginBottom: '2px' }}>{o.label}</div>
                    <div style={{ fontSize: '11px', color: office === o.id ? o.color : '#888' }}>{o.total} staff</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Department */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#1E2124', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '8px' }}>
                Department
              </label>
              <select
                name="department"
                style={{ width: '100%', padding: '12px 16px', borderRadius: '12px', border: '1px solid #E5E7EB', fontSize: '14px', color: '#1E2124', outline: 'none', fontFamily: 'inherit', background: '#FAFAFA', appearance: 'none' }}
              >
                <option value="">Select your department</option>
                {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>

            {/* Role */}
            <div style={{ marginBottom: '32px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#1E2124', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '8px' }}>
                Your Role / Job Title
              </label>
              <input
                name="role"
                type="text"
                placeholder="e.g. Events Manager, Sales Executive"
                style={{ width: '100%', padding: '12px 16px', borderRadius: '12px', border: '1px solid #E5E7EB', fontSize: '14px', color: '#1E2124', outline: 'none', fontFamily: 'inherit', background: '#FAFAFA' }}
              />
            </div>

            {/* Error */}
            {error && (
              <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '10px', padding: '12px 16px', marginBottom: '20px', fontSize: '13px', color: '#C0392B', fontWeight: 600 }}>
                {error}
              </div>
            )}

            {/* What happens next notice */}
            <div style={{ background: '#F8FFFE', border: '1px solid #C6ECE8', borderRadius: '12px', padding: '14px 16px', marginBottom: '24px', display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
              <svg width="18" height="18" fill="none" stroke="#00A5A3" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" style={{ flexShrink: 0, marginTop: '1px' }}><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
              <span style={{ fontSize: '12px', color: '#464D53', lineHeight: 1.6 }}>
                <strong style={{ color: '#1E2124' }}>You will receive a welcome email immediately.</strong> Your office counter on the main page updates in real time the moment you submit.
              </span>
            </div>

            <button
              type="submit"
              disabled={pending || !office}
              style={{
                width: '100%',
                padding: '16px',
                borderRadius: '14px',
                border: 'none',
                background: pending || !office ? '#E5E7EB' : '#C0F43C',
                color: pending || !office ? '#999' : '#1E2124',
                fontSize: '15px',
                fontWeight: 800,
                cursor: pending || !office ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '10px',
                transition: 'all 0.2s ease',
                fontFamily: 'inherit',
              }}
            >
              {pending ? (
                <>
                  <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" style={{ animation: 'spin 1s linear infinite' }}><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"/><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"/></svg>
                  Joining...
                </>
              ) : (
                <>
                  <svg width="16" height="16" fill="none" stroke="#1E2124" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                  {!office ? 'Select your office first' : "I'm joining the TAOS journey"}
                </>
              )}
            </button>

          </form>
        </div>

        <p style={{ textAlign: 'center', fontSize: '12px', color: '#888', marginTop: '20px', lineHeight: 1.6 }}>
          By joining you agree that your work details will be used to build TAOS for the Trescon team only.
        </p>

      </div>

      <style>{`@keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }`}</style>
    </div>
  )
}
