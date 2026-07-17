'use client'

import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Suspense } from 'react'

const OFFICE_NAMES: Record<string, string> = {
  dubai: 'Dubai', bangalore: 'Bangalore', mangalore: 'Mangalore', manipal: 'Manipal',
}
// Literal hex (not CSS vars) — these need `${color}NN` alpha-suffix concatenation
// below, which only works with plain hex. Each value equals a brand token's hex
// (teal/lime/orange/red) and was verified for 4.5:1+ contrast on both --surface
// and --card; bangalore/mangalore/dubai were brightened up from their old
// light-theme shades to clear that bar on the new dark background.
const OFFICE_COLORS: Record<string, string> = {
  dubai: '#0EA79D', bangalore: '#C0F43C', mangalore: '#FB923C', manipal: '#F1667A',
}

function WelcomeContent() {
  const params = useSearchParams()
  const name   = params.get('name') ?? 'there'
  const office = params.get('office') ?? ''
  const firstName = name.split(' ')[0]
  const color = OFFICE_COLORS[office] ?? '#12C9BD' // matches var(--teal-mid)

  return (
    <div style={{ fontFamily: 'var(--font-manrope), Manrope, sans-serif', background: 'var(--surface)', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 24px', position: 'relative', overflow: 'hidden' }}>

      <div style={{ position: 'absolute', top: '-100px', right: '-80px', width: '400px', height: '400px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(0,165,163,0.2) 0%, transparent 65%)' }} />
      <div style={{ position: 'absolute', bottom: '-80px', left: '10%', width: '300px', height: '300px', borderRadius: '50%', background: `radial-gradient(circle, ${color}20 0%, transparent 65%)` }} />

      <div style={{ maxWidth: '500px', textAlign: 'center', position: 'relative', zIndex: 1 }}>

        {/* Check icon */}
        <div style={{ width: '80px', height: '80px', borderRadius: '50%', border: `3px solid ${color}`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 28px', background: `${color}20` }}>
          <svg width="36" height="36" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
        </div>

        <div style={{ fontSize: '13px', fontWeight: 700, letterSpacing: '2.5px', textTransform: 'uppercase', color, marginBottom: '14px' }}>
          {OFFICE_NAMES[office] ?? 'Trescon'} Office — Joined
        </div>

        <h1 style={{ fontSize: '42px', fontWeight: 800, color: 'var(--ink)', marginBottom: '12px', letterSpacing: '-1px', lineHeight: 1.1 }}>
          You&apos;re in,<br /><span style={{ color }}>{firstName}.</span>
        </h1>

        <p style={{ fontSize: '13px', color: 'var(--ink2)', lineHeight: 1.65, marginBottom: '12px' }}>
          Welcome to Event Pilot. You are now part of something being built for everyone at Trescon.
        </p>
        <p style={{ fontSize: '13px', color: 'var(--ink2)', lineHeight: 1.65, marginBottom: '40px' }}>
          Your profile is live. Head to your dashboard to see your learning path and start your first course.
        </p>

        {/* Next step card */}
        <div style={{ background: 'var(--card)', border: '1px solid var(--teal-border)', borderRadius: '16px', padding: '28px', marginBottom: '28px', textAlign: 'left' }}>
          <div style={{ fontSize: '13px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: color, marginBottom: '12px' }}>What happens next</div>
          {[
            'Your details are now on record in Event Pilot',
            'Your profile is added to Event Pilot',
            'Next: tell us what your work looks like daily',
            'Your input shapes what gets built first',
          ].map((step, i) => (
            <div key={i} style={{ display: 'flex', gap: '12px', alignItems: 'center', padding: '8px 0', borderBottom: i < 3 ? '1px solid var(--border-light)' : 'none' }}>
              <div style={{ width: '22px', height: '22px', borderRadius: '6px', background: i === 0 ? `${color}25` : 'var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {i === 0 ? (
                  <svg width="11" height="11" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                ) : (
                  <span style={{ fontSize: '13px', color: 'var(--ink)', fontWeight: 700 }}>{i + 1}</span>
                )}
              </div>
              <span style={{ fontSize: '13px', color: i === 0 ? color : 'var(--ink2)', fontWeight: i === 0 ? 600 : 400 }}>{step}</span>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link href="/dashboard" style={{ background: color, color: 'var(--surface)', fontSize: '13px', fontWeight: 800, padding: '14px 28px', borderRadius: '50px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
            <svg width="14" height="14" fill="none" stroke="var(--surface)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>
            Go to My Dashboard
          </Link>
          <Link href="/profile" style={{ background: 'var(--card)', color: 'var(--ink2)', fontSize: '13px', fontWeight: 700, padding: '14px 28px', borderRadius: '50px', textDecoration: 'none', border: '1px solid var(--teal-border)', display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
            Map My Work
            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>
          </Link>
        </div>

      </div>
    </div>
  )
}

export default function WelcomePage() {
  return (
    <Suspense>
      <WelcomeContent />
    </Suspense>
  )
}
