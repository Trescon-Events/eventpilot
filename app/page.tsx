'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/app/lib/supabase'

const OFFICES = [
  {
    id: 'dubai',     name: 'Dubai',     total: 15,  color: '#00A5A3', bg: 'rgba(0,165,163,0.12)',  border: 'rgba(0,165,163,0.25)',
    location: 'Dubai, UAE',
    role: 'Global HQ & Events',
    focus: 'Deal intelligence, sponsorship pipelines, event ops automation',
  },
  {
    id: 'bangalore', name: 'Bangalore', total: 91,  color: '#C0F43C', bg: 'rgba(192,244,60,0.1)',  border: 'rgba(192,244,60,0.25)',
    location: 'Bengaluru, India',
    role: 'Sales, Tech & Media',
    focus: 'Lead scoring, content automation, campaign intelligence',
  },
  {
    id: 'mangalore', name: 'Mangalore', total: 15,  color: '#F4ED3C', bg: 'rgba(244,237,60,0.1)',  border: 'rgba(244,237,60,0.25)',
    location: 'Mangaluru, India',
    role: 'Finance & Operations',
    focus: 'Reconciliation bots, approval workflows, reporting automation',
  },
  {
    id: 'manipal',   name: 'Manipal',   total: 63,  color: '#FF6B6B', bg: 'rgba(255,107,107,0.1)', border: 'rgba(255,107,107,0.25)',
    location: 'Manipal, India',
    role: 'Content & Growth',
    focus: 'Content generation, audience targeting, performance analytics',
  },
]
const TOTAL_STAFF = OFFICES.reduce((s, o) => s + o.total, 0)

type OfficeCounts = Record<string, number>

export default function HomePage() {
  const [counts, setCounts] = useState<OfficeCounts>({})
  const [totalJoined, setTotalJoined] = useState(0)
  const [loading, setLoading] = useState(true)
  const [latestJoins, setLatestJoins] = useState<{ name: string; office_id: string; joined_at: string }[]>([])
  const [officeTotals, setOfficeTotals] = useState<Record<string, number>>(
    Object.fromEntries(OFFICES.map(o => [o.id, o.total]))  // fallback to hardcoded
  )

  async function fetchOfficeTotals() {
    try {
      const res = await fetch('/api/office-config')
      if (res.ok) {
        const data: { office_id: string; total_staff: number }[] = await res.json()
        if (data.length > 0) {
          setOfficeTotals(Object.fromEntries(data.map(d => [d.office_id, d.total_staff])))
        }
      }
    } catch { /* use fallback hardcoded totals */ }
  }

  async function fetchCounts() {
    const { data } = await supabase.from('staff_members').select('office_id')
    if (!data) return
    const c: OfficeCounts = {}
    data.forEach(r => { c[r.office_id] = (c[r.office_id] ?? 0) + 1 })
    setCounts(c)
    setTotalJoined(data.length)
    setLoading(false)
  }

  async function fetchLatest() {
    const { data } = await supabase
      .from('staff_members')
      .select('name, office_id, joined_at')
      .order('joined_at', { ascending: false })
      .limit(5)
    if (data) setLatestJoins(data)
  }

  useEffect(() => {
    fetchOfficeTotals()
    fetchCounts()
    fetchLatest()
    const channel = supabase
      .channel('staff-live')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'staff_members' }, () => {
        fetchCounts()
        fetchLatest()
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  const totalStaff = Object.values(officeTotals).reduce((s, n) => s + n, 0)
  const pct = totalStaff > 0 ? Math.round((totalJoined / totalStaff) * 100) : 0

  return (
    <div style={{ fontFamily: 'var(--font-manrope), Manrope, sans-serif', background: '#F2F5F5', minHeight: '100vh' }}>

      {/* NAV */}
      <nav style={{ background: '#010103', padding: '0 48px', height: '64px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 50 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          {/* Trescon logo — contained in a frosted card */}
          <div style={{ background: 'white', borderRadius: '10px', padding: '5px 14px 5px 10px', display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 0 0 1px rgba(255,255,255,0.08)' }}>
            <img src="/trescon-logo.png" alt="Trescon" style={{ height: '28px', width: 'auto', display: 'block' }} />
            <div style={{ width: '1px', height: '20px', background: '#E5E7EB' }} />
            <div style={{ fontSize: '9px', fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#888', lineHeight: 1.3 }}>An internal<br/>product</div>
          </div>

          <div style={{ width: '1px', height: '28px', background: 'rgba(255,255,255,0.1)' }} />

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '28px', height: '28px', background: '#00A5A3', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="14" height="14" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
            </div>
            <div>
              <div style={{ fontSize: '15px', fontWeight: 900, color: 'white', letterSpacing: '0.5px', lineHeight: 1.1 }}>TAI</div>
              <div style={{ fontSize: '10px', fontWeight: 600, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.5px', lineHeight: 1 }}>Trescon AI</div>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <Link href="/admin" style={{ background: '#00A5A3', color: 'white', fontSize: '13px', fontWeight: 700, padding: '9px 22px', borderRadius: '50px', textDecoration: 'none' }}>
            Admin
          </Link>
        </div>
      </nav>

      {/* HERO */}
      <div style={{ background: 'linear-gradient(155deg, #464D53 0%, #010103 60%)', padding: '52px 48px 72px', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: '-120px', right: '-80px', width: '500px', height: '500px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(0,165,163,0.18) 0%, transparent 65%)' }} />
        <div style={{ position: 'absolute', bottom: '-100px', left: '15%', width: '360px', height: '360px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(192,244,60,0.07) 0%, transparent 65%)' }} />

        <div style={{ maxWidth: '1100px', margin: '0 auto', position: 'relative', zIndex: 1 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'rgba(0,165,163,0.12)', border: '1px solid rgba(0,165,163,0.3)', borderRadius: '50px', padding: '6px 16px', marginBottom: '20px' }}>
            <div style={{ width: '7px', height: '7px', background: '#C0F43C', borderRadius: '50%', animation: 'pulse 2s infinite' }} />
            <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: '#00A5A3' }}>Live — The Build Has Begun</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: '56px', alignItems: 'center' }}>
            <div>
              <h1 style={{ fontSize: '58px', fontWeight: 900, color: 'white', lineHeight: 1.0, letterSpacing: '-2px', marginBottom: '24px' }}>
                Your work shapes<br />what <span style={{ color: '#C0F43C' }}>TAI</span><br />builds first.
              </h1>
              <p style={{ fontSize: '18px', color: 'rgba(255,255,255,0.65)', lineHeight: 1.75, marginBottom: '20px', maxWidth: '520px' }}>
                TAI — Trescon AI — is being built from the ground up, by this team, for this team. Not from a consultant&apos;s slide deck. From your actual day at work.
              </p>
              <p style={{ fontSize: '15px', color: 'rgba(255,255,255,0.38)', lineHeight: 1.75, maxWidth: '500px', marginBottom: '36px' }}>
                Tell us what you do, what slows you down, and what you wish worked better. 8 minutes. Your input becomes the build plan.
              </p>
              <Link href="/join" style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', background: '#C0F43C', color: '#1E2124', fontSize: '15px', fontWeight: 800, padding: '16px 36px', borderRadius: '50px', textDecoration: 'none', letterSpacing: '0.3px' }}>
                <svg width="16" height="16" fill="none" stroke="#1E2124" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                Join the Journey
              </Link>
            </div>

            {/* Live participation card */}
            <div style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.14)', borderRadius: '24px', padding: '28px 26px', backdropFilter: 'blur(12px)' }}>

              {/* Live badge */}
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', background: 'rgba(0,165,163,0.2)', border: '1px solid rgba(0,165,163,0.4)', borderRadius: '50px', padding: '3px 10px', marginBottom: '20px' }}>
                <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#00A5A3', animation: 'pulse 2s infinite' }} />
                <span style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#00A5A3' }}>Live</span>
              </div>

              {/* Big % */}
              <div style={{ marginBottom: '6px' }}>
                <div style={{ fontSize: '72px', fontWeight: 900, color: 'white', lineHeight: 1, letterSpacing: '-3px' }}>
                  {loading ? <span style={{ fontSize: '36px', color: 'rgba(255,255,255,0.25)' }}>—</span> : `${pct}%`}
                </div>
              </div>
              <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.45)', marginBottom: '20px', lineHeight: 1.5 }}>
                of Trescon has shaped<br /><span style={{ color: '#C0F43C', fontWeight: 700 }}>TAI so far</span>
              </div>

              {/* Overall progress bar */}
              <div style={{ height: '5px', background: 'rgba(255,255,255,0.1)', borderRadius: '10px', overflow: 'hidden', marginBottom: '24px' }}>
                <div style={{ height: '100%', width: `${pct}%`, minWidth: pct > 0 ? '5px' : '0', background: 'linear-gradient(to right, #00A5A3, #C0F43C)', borderRadius: '10px', transition: 'width 0.8s ease' }} />
              </div>

              {/* Per-office bars — % only, no count */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '11px' }}>
                {OFFICES.map(office => {
                  const total  = officeTotals[office.id] ?? 0
                  const joined = counts[office.id] ?? 0
                  const pctOff = total > 0 ? Math.round((joined / total) * 100) : 0
                  return (
                    <div key={office.id}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '5px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                          <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: office.color, flexShrink: 0 }} />
                          <span style={{ fontSize: '12px', fontWeight: 700, color: 'rgba(255,255,255,0.7)' }}>{office.name}</span>
                        </div>
                        <span style={{ fontSize: '12px', fontWeight: 800, color: pctOff > 0 ? office.color : 'rgba(255,255,255,0.2)' }}>
                          {loading ? '—' : `${pctOff}%`}
                        </span>
                      </div>
                      <div style={{ height: '4px', background: 'rgba(255,255,255,0.07)', borderRadius: '4px', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pctOff}%`, minWidth: pctOff > 0 ? '4px' : '0', background: office.color, borderRadius: '4px', transition: 'width 0.8s ease' }} />
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Footer */}
              <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid rgba(255,255,255,0.07)', fontSize: '11px', color: 'rgba(255,255,255,0.25)', lineHeight: 1.6 }}>
                Updates the moment someone joins. Every input shapes the build.
              </div>

            </div>
          </div>
        </div>
      </div>

      {/* OFFICE BREAKDOWN */}
      <div style={{ background: '#0C0E10', padding: '64px 48px' }}>
      <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
          <div style={{ width: '18px', height: '2px', background: '#00A5A3', borderRadius: '2px' }} />
          <span style={{ fontSize: '10px', fontWeight: 800, letterSpacing: '3px', textTransform: 'uppercase', color: '#00A5A3' }}>4 Offices — Real Time</span>
        </div>
        <h2 style={{ fontSize: '32px', fontWeight: 800, color: 'white', marginBottom: '8px', letterSpacing: '-0.5px' }}>Who has joined so far</h2>
        <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.45)', marginBottom: '36px' }}>Live count per office. Updates the moment someone joins.</p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
          {OFFICES.map(office => {
            const total     = officeTotals[office.id] ?? 0
            const joined    = counts[office.id] ?? 0
            const officePct = total > 0 ? Math.round((joined / total) * 100) : 0
            return (
              <div key={office.id} style={{ background: '#1E2124', border: `1px solid ${office.color}20`, borderRadius: '20px', padding: '28px 24px', position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>

                {/* Top colour stripe */}
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: office.color }} />

                {/* Office identity */}
                <div style={{ marginBottom: '18px' }}>
                  <div style={{ fontSize: '20px', fontWeight: 900, color: 'white', letterSpacing: '-0.5px', marginBottom: '3px' }}>{office.name}</div>
                  <div style={{ fontSize: '11px', color: office.color, fontWeight: 700, letterSpacing: '0.5px' }}>{office.location}</div>
                  <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)', marginTop: '2px' }}>{office.role}</div>
                </div>

                {/* TAI is building here */}
                <div style={{ background: `${office.color}0D`, border: `1px solid ${office.color}25`, borderRadius: '10px', padding: '12px 14px', marginBottom: '20px', flex: 1 }}>
                  <div style={{ fontSize: '9px', fontWeight: 800, letterSpacing: '2px', textTransform: 'uppercase', color: office.color, marginBottom: '6px' }}>TAI is building here</div>
                  <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)', lineHeight: 1.55 }}>{office.focus}</div>
                </div>

                {/* Participation bar — no count */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '7px' }}>
                    <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)' }}>Participation</span>
                    <span style={{ fontSize: '18px', fontWeight: 900, color: officePct > 0 ? office.color : 'rgba(255,255,255,0.2)', letterSpacing: '-0.5px' }}>
                      {loading ? '—' : `${officePct}%`}
                    </span>
                  </div>
                  <div style={{ height: '7px', background: 'rgba(255,255,255,0.07)', borderRadius: '10px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${officePct}%`, minWidth: officePct > 0 ? '7px' : '0', background: office.color, borderRadius: '10px', transition: 'width 1s ease' }} />
                  </div>
                </div>

              </div>
            )
          })}
        </div>
      </div>
      </div>

      {/* TAI MODULE PREVIEW — 4-step */}
      <div style={{ background: '#1E2124', padding: '64px 48px' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
            <div style={{ width: '18px', height: '2px', background: '#00A5A3', borderRadius: '2px' }} />
            <span style={{ fontSize: '10px', fontWeight: 800, letterSpacing: '3px', textTransform: 'uppercase', color: '#00A5A3' }}>TAI in Action</span>
          </div>
          <h2 style={{ fontSize: '32px', fontWeight: 800, color: 'white', marginBottom: '8px', letterSpacing: '-0.5px' }}>What TAI does with your input</h2>
          <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.45)', marginBottom: '56px' }}>Four automated steps that turn your profile into real capability.</p>

          <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0' }}>
            {/* Connecting line */}
            <div style={{ position: 'absolute', top: '36px', left: 'calc(12.5%)', right: 'calc(12.5%)', height: '3px', background: 'linear-gradient(to right, #00A5A3, #6EE7B7, #F4ED3C, #C0F43C)', zIndex: 0, borderRadius: '2px' }} />

            {[
              { color: '#00A5A3', title: 'Profile Built', desc: 'Every employee mapped with current skills and role requirements', icon: <svg width="28" height="28" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> },
              { color: '#6EE7B7', title: 'Gap Identified', desc: 'TAI detects what each person needs for their role and for AI adoption', icon: <svg width="28" height="28" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg> },
              { color: '#F4ED3C', title: 'Training Assigned', desc: 'System assigns relevant training automatically — no HR intervention needed', icon: <svg width="28" height="28" fill="none" stroke="#1E2124" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z"/><path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z"/></svg> },
              { color: '#C0F43C', title: 'Performance Tracked', desc: 'Before and after scores measured. Improvement visible in the command center', icon: <svg width="28" height="28" fill="none" stroke="#1E2124" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg> },
            ].map((item, i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '0 24px', position: 'relative', zIndex: 1 }}>
                <div style={{ width: '72px', height: '72px', borderRadius: '50%', background: item.color, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '28px', boxShadow: `0 0 0 8px ${item.color}20` }}>
                  {item.icon}
                </div>
                <div style={{ fontSize: '15px', fontWeight: 800, color: 'white', marginBottom: '10px' }}>{item.title}</div>
                <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)', lineHeight: 1.65 }}>{item.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* HOW IT WORKS — redesigned */}
      <div style={{ background: '#1E2124', padding: '72px 48px' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
            <div style={{ width: '18px', height: '2px', background: '#C0F43C', borderRadius: '2px' }} />
            <span style={{ fontSize: '10px', fontWeight: 800, letterSpacing: '3px', textTransform: 'uppercase', color: '#C0F43C' }}>How It Works</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '48px', alignItems: 'start', marginBottom: '56px' }}>
            <h2 style={{ fontSize: '36px', fontWeight: 800, color: 'white', lineHeight: 1.15, letterSpacing: '-0.8px' }}>
              TAI is built bottom-up.<br /><span style={{ color: '#C0F43C' }}>You are the foundation.</span>
            </h2>
            <p style={{ fontSize: '15px', color: 'rgba(255,255,255,0.45)', lineHeight: 1.8, paddingTop: '6px' }}>
              Most technology is built by consultants guessing what a company needs. TAI is different. Every feature, every automation, every tool is built from what the 184 people at Trescon actually do — sourced directly, processed by AI, approved by leadership.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px' }}>
            {[
              { n: '01', color: '#00A5A3', title: 'You Join', desc: 'Name, email, office. 30 seconds. You are now part of the build.', icon: <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> },
              { n: '02', color: '#6EE7B7', title: 'Tell Us Your Day', desc: 'Your tasks, your tools, your time. What works, what doesn\'t, what you wish was different.', icon: <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg> },
              { n: '03', color: '#A78BFA', title: 'AI Processes All 184', desc: 'Every submission is analysed together. Patterns emerge. Priorities become clear.', icon: <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg> },
              { n: '04', color: '#FCD34D', title: 'Leadership Sees the Picture', desc: 'One clear report. Not 184 responses — one intelligence brief with a ranked build plan.', icon: <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg> },
              { n: '05', color: '#C0F43C', title: 'TAI Gets Built', desc: 'Module by module. Your input goes live. You see it work in your actual job.', icon: <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg> },
            ].map((step, i) => (
              <div key={i} style={{ background: 'rgba(255,255,255,0.05)', border: `1px solid rgba(255,255,255,0.08)`, borderRadius: '18px', padding: '24px 20px', position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: step.color, borderRadius: '18px 18px 0 0' }} />
                <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: `${step.color}18`, border: `1px solid ${step.color}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: step.color, marginBottom: '16px' }}>
                  {step.icon}
                </div>
                <div style={{ fontSize: '10px', fontWeight: 800, letterSpacing: '2px', color: step.color, marginBottom: '8px' }}>{step.n}</div>
                <div style={{ fontSize: '14px', fontWeight: 800, color: 'white', marginBottom: '8px', lineHeight: 1.3 }}>{step.title}</div>
                <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', lineHeight: 1.6 }}>{step.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* WHAT YOU TELL US / WHAT YOU GET */}
      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '72px 48px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
          <div style={{ width: '18px', height: '2px', background: '#00A5A3', borderRadius: '2px' }} />
          <span style={{ fontSize: '10px', fontWeight: 800, letterSpacing: '3px', textTransform: 'uppercase', color: '#00A5A3' }}>The Exchange</span>
        </div>
        <h2 style={{ fontSize: '32px', fontWeight: 800, color: '#1E2124', marginBottom: '8px', letterSpacing: '-0.5px' }}>8 minutes in. A better working life out.</h2>
        <p style={{ fontSize: '14px', color: '#464D53', marginBottom: '40px' }}>You give us an honest picture of your day. TAI gives you your time back.</p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>

          <div style={{ background: 'white', border: '1px solid #E5E7EB', borderRadius: '20px', padding: '32px 28px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
              <div style={{ width: '32px', height: '32px', borderRadius: '10px', background: 'rgba(0,165,163,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="16" height="16" fill="none" stroke="#00A5A3" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              </div>
              <div>
                <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#00A5A3' }}>What you share</div>
                <div style={{ fontSize: '16px', fontWeight: 800, color: '#1E2124' }}>Your real day — honestly told</div>
              </div>
            </div>
            {[
              { label: 'Who you are', detail: 'Your name, role, office, and department' },
              { label: 'What you actually do', detail: 'The tasks that fill your working day — not just the job title' },
              { label: 'What tools you use', detail: 'Every tool, every platform, every workaround you rely on' },
              { label: 'Where you lose time', detail: 'The frustrations, the chasing, the repetition' },
              { label: 'What you want to learn', detail: 'Where you want to grow and what would excite you' },
              { label: 'Where you are with AI today', detail: 'No judgement — just where you stand right now' },
            ].map((item, i) => (
              <div key={i} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', padding: '10px 0', borderBottom: i < 5 ? '1px solid #F3F4F6' : 'none' }}>
                <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#00A5A3', marginTop: '6px', flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#1E2124', marginBottom: '1px' }}>{item.label}</div>
                  <div style={{ fontSize: '12px', color: '#888', lineHeight: 1.5 }}>{item.detail}</div>
                </div>
              </div>
            ))}
          </div>

          <div style={{ background: 'linear-gradient(155deg, #1A1F22 0%, #010103 100%)', borderRadius: '20px', padding: '32px 28px', border: '1px solid rgba(192,244,60,0.15)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
              <div style={{ width: '32px', height: '32px', borderRadius: '10px', background: 'rgba(192,244,60,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="16" height="16" fill="none" stroke="#C0F43C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
              </div>
              <div>
                <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#C0F43C' }}>What TAI gives back</div>
                <div style={{ fontSize: '16px', fontWeight: 800, color: 'white' }}>Your time — and then some</div>
              </div>
            </div>
            {[
              { before: '4 days to compile a report', after: '20 minutes — AI generates it' },
              { before: '2 hours chasing payments every day', after: 'Automated — system handles it' },
              { before: 'Writing the same email 30 times', after: 'AI drafts it, you just approve' },
              { before: 'Waiting on assets from another team', after: 'Status visible live — no chasing' },
              { before: 'Searching for the latest file version', after: 'One source of truth, always current' },
              { before: 'Not knowing what\'s blocking a deal', after: 'Pipeline intelligence, real time' },
            ].map((item, i) => (
              <div key={i} style={{ padding: '10px 0', borderBottom: i < 5 ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '3px' }}>
                  <div style={{ width: '14px', height: '14px', borderRadius: '4px', background: 'rgba(255,107,107,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <svg width="8" height="8" fill="none" stroke="#FF6B6B" strokeWidth="2.5" strokeLinecap="round" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </div>
                  <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', textDecoration: 'line-through' }}>{item.before}</span>
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <div style={{ width: '14px', height: '14px', borderRadius: '4px', background: 'rgba(192,244,60,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <svg width="8" height="8" fill="none" stroke="#C0F43C" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                  </div>
                  <span style={{ fontSize: '13px', color: '#C0F43C', fontWeight: 700 }}>{item.after}</span>
                </div>
              </div>
            ))}
          </div>

        </div>
      </div>

      {/* BOTTOM CTA */}
      <div style={{ background: 'linear-gradient(155deg, #464D53 0%, #010103 60%)', padding: '80px 48px', textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: '-80px', left: '50%', transform: 'translateX(-50%)', width: '600px', height: '300px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(192,244,60,0.08) 0%, transparent 65%)' }} />
        <div style={{ maxWidth: '580px', margin: '0 auto', position: 'relative', zIndex: 1 }}>
          <div style={{ width: '56px', height: '56px', borderRadius: '16px', background: 'rgba(192,244,60,0.12)', border: '1px solid rgba(192,244,60,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
            <svg width="24" height="24" fill="none" stroke="#C0F43C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
          </div>
          <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '2.5px', textTransform: 'uppercase', color: '#00A5A3', marginBottom: '16px' }}>The foundation starts here</div>
          <h2 style={{ fontSize: '38px', fontWeight: 900, color: 'white', lineHeight: 1.15, letterSpacing: '-1px', marginBottom: '16px' }}>
            TAI is only as smart as<br />the team that builds it.
          </h2>
          <p style={{ fontSize: '16px', color: 'rgba(255,255,255,0.45)', marginBottom: '36px', lineHeight: 1.75 }}>
            Every person who adds their input makes TAI more precise, more useful, and more built for how Trescon actually works. Your 8 minutes is the foundation everything else is built on.
          </p>
          <Link href="/join" style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', background: '#C0F43C', color: '#1E2124', fontSize: '16px', fontWeight: 800, padding: '18px 44px', borderRadius: '50px', textDecoration: 'none', letterSpacing: '0.3px' }}>
            <svg width="16" height="16" fill="none" stroke="#1E2124" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
            Join the TAI Journey
          </Link>
          <div style={{ marginTop: '20px', fontSize: '12px', color: 'rgba(255,255,255,0.25)' }}>
            {TOTAL_STAFF} people · 4 offices · 1 operating system
          </div>
          <div style={{ marginTop: '48px', display: 'flex', justifyContent: 'center' }}>
            <div style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '16px', padding: '16px 28px', display: 'inline-flex', alignItems: 'center', gap: '16px' }}>
              <div style={{ background: 'white', borderRadius: '8px', padding: '6px 14px', display: 'flex', alignItems: 'center' }}>
                <img src="/trescon-logo.png" alt="Trescon" style={{ height: '34px', width: 'auto', display: 'block' }} />
              </div>
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)', marginBottom: '3px' }}>Built for</div>
                <div style={{ fontSize: '14px', fontWeight: 800, color: 'white' }}>The Trescon Team</div>
                <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)' }}>4 offices · 184 people</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
    </div>
  )
}
