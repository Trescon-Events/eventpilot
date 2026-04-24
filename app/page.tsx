'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/app/lib/supabase'

const OFFICES = [
  { id: 'dubai',     name: 'Dubai',     total: 15,  color: '#00A5A3', bg: 'rgba(0,165,163,0.12)',  border: 'rgba(0,165,163,0.25)' },
  { id: 'bangalore', name: 'Bangalore', total: 91,  color: '#C0F43C', bg: 'rgba(192,244,60,0.1)',  border: 'rgba(192,244,60,0.25)' },
  { id: 'mangalore', name: 'Mangalore', total: 15,  color: '#F4ED3C', bg: 'rgba(244,237,60,0.1)',  border: 'rgba(244,237,60,0.25)' },
  { id: 'manipal',   name: 'Manipal',   total: 63,  color: '#FF6B6B', bg: 'rgba(255,107,107,0.1)', border: 'rgba(255,107,107,0.25)' },
]
const TOTAL_STAFF = OFFICES.reduce((s, o) => s + o.total, 0)

type OfficeCounts = Record<string, number>

export default function HomePage() {
  const [counts, setCounts] = useState<OfficeCounts>({})
  const [totalJoined, setTotalJoined] = useState(0)
  const [loading, setLoading] = useState(true)
  const [latestJoins, setLatestJoins] = useState<{ name: string; office_id: string; joined_at: string }[]>([])

  async function fetchCounts() {
    const { data } = await supabase
      .from('staff_members')
      .select('office_id')
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

  const pct = TOTAL_STAFF > 0 ? Math.round((totalJoined / TOTAL_STAFF) * 100) : 0

  return (
    <div style={{ fontFamily: 'var(--font-manrope), Manrope, sans-serif', background: '#F2F5F5', minHeight: '100vh' }}>

      {/* ── NAV ── */}
      <nav style={{ background: '#010103', padding: '0 48px', height: '60px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 50 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '28px', height: '28px', background: '#00A5A3', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="14" height="14" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
          </div>
          <span style={{ fontSize: '14px', fontWeight: 800, color: 'white', letterSpacing: '0.5px' }}>TAOS</span>
          <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', marginLeft: '4px' }}>Trescon AI Operating System</span>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <Link href="/admin" style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', textDecoration: 'none', fontWeight: 600 }}>Admin</Link>
          <Link href="/join" style={{ background: '#00A5A3', color: 'white', fontSize: '13px', fontWeight: 700, padding: '8px 20px', borderRadius: '50px', textDecoration: 'none' }}>
            Join the Journey
          </Link>
        </div>
      </nav>

      {/* ── HERO ── */}
      <div style={{ background: 'linear-gradient(155deg, #464D53 0%, #010103 60%)', padding: '80px 48px 72px', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: '-100px', right: '-80px', width: '480px', height: '480px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(0,165,163,0.2) 0%, transparent 65%)' }} />
        <div style={{ position: 'absolute', bottom: '-80px', left: '20%', width: '320px', height: '320px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(192,244,60,0.08) 0%, transparent 65%)' }} />

        <div style={{ maxWidth: '1100px', margin: '0 auto', position: 'relative', zIndex: 1 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'rgba(0,165,163,0.15)', border: '1px solid rgba(0,165,163,0.3)', borderRadius: '50px', padding: '6px 16px', marginBottom: '28px' }}>
            <div style={{ width: '7px', height: '7px', background: '#C0F43C', borderRadius: '50%', animation: 'pulse 2s infinite' }} />
            <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '2.5px', textTransform: 'uppercase', color: '#00A5A3' }}>Live — Journey has begun</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: '60px', alignItems: 'center' }}>
            <div>
              <h1 style={{ fontSize: '56px', fontWeight: 800, color: 'white', lineHeight: 1.05, letterSpacing: '-1.5px', marginBottom: '18px' }}>
                TAOS starts<br />with <span style={{ color: '#C0F43C' }}>you.</span>
              </h1>
              <p style={{ fontSize: '17px', color: 'rgba(255,255,255,0.6)', lineHeight: 1.75, marginBottom: '32px', maxWidth: '500px' }}>
                We are building an AI-powered operating system for Trescon. But before we build anything, we need to understand exactly what every person in this company does — and where AI can give you your time back.
              </p>
              <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.4)', lineHeight: 1.7, maxWidth: '480px', marginBottom: '36px' }}>
                This takes 8 minutes. Your input directly decides what gets built first, for your office, for your role. The more people who contribute, the smarter TAOS becomes — before a single line of code is written.
              </p>
              <Link href="/join" style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', background: '#C0F43C', color: '#1E2124', fontSize: '15px', fontWeight: 800, padding: '16px 36px', borderRadius: '50px', textDecoration: 'none', letterSpacing: '0.3px' }}>
                <svg width="16" height="16" fill="none" stroke="#1E2124" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                Add My Input — I&apos;m Part of This
              </Link>
            </div>

            {/* Live total counter */}
            <div style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '24px', padding: '36px 32px', textAlign: 'center' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '2.5px', textTransform: 'uppercase', color: '#00A5A3', marginBottom: '16px' }}>Team Joined — Live</div>

              <div style={{ fontSize: '72px', fontWeight: 800, color: 'white', lineHeight: 1, marginBottom: '4px' }}>
                {loading ? '—' : totalJoined}
              </div>
              <div style={{ fontSize: '15px', color: 'rgba(255,255,255,0.35)', marginBottom: '24px' }}>of {TOTAL_STAFF} team members</div>

              {/* Progress bar */}
              <div style={{ height: '8px', background: 'rgba(255,255,255,0.08)', borderRadius: '10px', overflow: 'hidden', marginBottom: '8px' }}>
                <div style={{ height: '100%', width: `${pct}%`, background: 'linear-gradient(to right, #00A5A3, #C0F43C)', borderRadius: '10px', transition: 'width 0.8s ease' }} />
              </div>
              <div style={{ fontSize: '13px', color: '#C0F43C', fontWeight: 700, marginBottom: '28px' }}>{pct}% of Trescon has joined</div>

              {/* Latest joins */}
              {latestJoins.length > 0 && (
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '20px' }}>
                  <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', marginBottom: '12px' }}>Just joined</div>
                  {latestJoins.map((j, i) => {
                    const office = OFFICES.find(o => o.id === j.office_id)
                    return (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                        <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: office?.bg ?? 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 800, color: office?.color ?? 'white' }}>
                          {j.name.charAt(0).toUpperCase()}
                        </div>
                        <div style={{ textAlign: 'left' }}>
                          <div style={{ fontSize: '12px', fontWeight: 600, color: 'rgba(255,255,255,0.85)' }}>{j.name}</div>
                          <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)' }}>{office?.name}</div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── OFFICE BREAKDOWN ── */}
      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '64px 48px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
          <div style={{ width: '18px', height: '2px', background: '#00A5A3', borderRadius: '2px' }} />
          <span style={{ fontSize: '10px', fontWeight: 800, letterSpacing: '3px', textTransform: 'uppercase', color: '#00A5A3' }}>Office Progress — Real Time</span>
        </div>
        <h2 style={{ fontSize: '32px', fontWeight: 800, color: '#1E2124', marginBottom: '8px', letterSpacing: '-0.5px' }}>Who has joined so far</h2>
        <p style={{ fontSize: '14px', color: '#464D53', marginBottom: '36px' }}>Live count per office. Updates the moment someone joins.</p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
          {OFFICES.map(office => {
            const joined = counts[office.id] ?? 0
            const officePct = Math.round((joined / office.total) * 100)
            return (
              <div key={office.id} style={{ background: 'white', border: `1px solid ${office.border}`, borderRadius: '20px', padding: '28px 24px', position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: office.color }} />

                <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: office.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}>
                  <svg width="20" height="20" fill="none" stroke={office.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
                </div>

                <div style={{ fontSize: '16px', fontWeight: 800, color: '#1E2124', marginBottom: '2px' }}>{office.name}</div>
                <div style={{ fontSize: '11px', color: '#888', marginBottom: '20px' }}>Trescon {office.name} Office</div>

                <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px', marginBottom: '6px' }}>
                  <span style={{ fontSize: '36px', fontWeight: 800, color: office.color, lineHeight: 1 }}>{loading ? '—' : joined}</span>
                  <span style={{ fontSize: '14px', color: '#888' }}>/ {office.total}</span>
                </div>
                <div style={{ fontSize: '12px', color: '#888', marginBottom: '14px' }}>staff have joined</div>

                <div style={{ height: '6px', background: '#F0F0F0', borderRadius: '10px', overflow: 'hidden', marginBottom: '8px' }}>
                  <div style={{ height: '100%', width: `${officePct}%`, background: office.color, borderRadius: '10px', transition: 'width 0.8s ease' }} />
                </div>
                <div style={{ fontSize: '12px', fontWeight: 700, color: office.color }}>{officePct}% joined</div>

                {joined === 0 && (
                  <div style={{ marginTop: '14px', background: office.bg, borderRadius: '8px', padding: '8px 12px', fontSize: '11px', color: office.color, fontWeight: 600, textAlign: 'center' }}>
                    Waiting for first member
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* ── HOW IT WORKS ── */}
      <div style={{ background: 'white', padding: '64px 48px' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
            <div style={{ width: '18px', height: '2px', background: '#00A5A3', borderRadius: '2px' }} />
            <span style={{ fontSize: '10px', fontWeight: 800, letterSpacing: '3px', textTransform: 'uppercase', color: '#00A5A3' }}>The Approach</span>
          </div>
          <h2 style={{ fontSize: '32px', fontWeight: 800, color: '#1E2124', marginBottom: '8px', letterSpacing: '-0.5px' }}>How TAOS learns what to build</h2>
          <p style={{ fontSize: '14px', color: '#464D53', marginBottom: '44px', maxWidth: '600px' }}>You tell us your work. AI transforms that into a build plan. Management approves. We build exactly what your team needs — nothing more, nothing less.</p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0', position: 'relative' }}>
            {/* connector line */}
            <div style={{ position: 'absolute', top: '32px', left: '10%', right: '10%', height: '2px', background: 'linear-gradient(to right, #00A5A3, #C0F43C)', zIndex: 0 }} />

            {[
              { n: '01', icon: <svg width="18" height="18" fill="none" stroke="#00A5A3" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>, title: 'You Join', desc: 'Enter name, email, select your office — 30 seconds' },
              { n: '02', icon: <svg width="18" height="18" fill="none" stroke="#00A5A3" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>, title: 'Map Your Work', desc: 'Tell us your tasks, tools, and how long each takes today' },
              { n: '03', icon: <svg width="18" height="18" fill="none" stroke="#00A5A3" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>, title: 'AI Processes', desc: 'Claude API clusters pain points and calculates time savings per role' },
              { n: '04', icon: <svg width="18" height="18" fill="none" stroke="#00A5A3" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>, title: 'Management Decides', desc: 'Leadership sees live insights and approves the build sequence' },
              { n: '05', icon: <svg width="18" height="18" fill="none" stroke="#C0F43C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>, title: 'TAOS Gets Built', desc: 'Each module built from your inputs. You see your contribution go live.' },
            ].map((step, i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '0 12px', position: 'relative', zIndex: 1 }}>
                <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: i === 4 ? '#1E2124' : 'white', border: `3px solid ${i === 4 ? '#C0F43C' : '#00A5A3'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px', boxShadow: '0 0 0 6px #F2F5F5' }}>
                  {step.icon}
                </div>
                <div style={{ fontSize: '10px', fontWeight: 800, letterSpacing: '2px', color: '#00A5A3', marginBottom: '4px' }}>{step.n}</div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#1E2124', marginBottom: '6px' }}>{step.title}</div>
                <div style={{ fontSize: '11px', color: '#666', lineHeight: 1.55 }}>{step.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── WHAT YOU TELL US / WHAT YOU GET ── */}
      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '64px 48px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>

          <div style={{ background: 'white', border: '1px solid #E5E7EB', borderRadius: '20px', padding: '32px 28px' }}>
            <div style={{ fontSize: '10px', fontWeight: 800, letterSpacing: '2.5px', textTransform: 'uppercase', color: '#00A5A3', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '18px', height: '2px', background: '#00A5A3', borderRadius: '2px' }} />
              What you tell us
            </div>
            <h3 style={{ fontSize: '20px', fontWeight: 800, color: '#1E2124', marginBottom: '20px' }}>8 minutes of your time</h3>
            {[
              'Your name, role, and which office you work from',
              'The 3–5 tasks that take most of your working day',
              'The tools you currently use for each task',
              'How long each task takes you right now',
              'What you wish could be faster or automated',
              'How comfortable you are with AI tools today (1–5)',
            ].map((item, i) => (
              <div key={i} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', padding: '8px 0', borderBottom: i < 5 ? '1px solid #F3F4F6' : 'none' }}>
                <div style={{ width: '20px', height: '20px', borderRadius: '6px', background: 'rgba(0,165,163,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '2px' }}>
                  <svg width="10" height="10" fill="none" stroke="#00A5A3" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                </div>
                <span style={{ fontSize: '13px', color: '#464D53', lineHeight: 1.55 }}>{item}</span>
              </div>
            ))}
          </div>

          <div style={{ background: 'linear-gradient(155deg, #464D53 0%, #010103 60%)', borderRadius: '20px', padding: '32px 28px' }}>
            <div style={{ fontSize: '10px', fontWeight: 800, letterSpacing: '2.5px', textTransform: 'uppercase', color: '#C0F43C', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '18px', height: '2px', background: '#C0F43C', borderRadius: '2px' }} />
              What TAOS builds for you
            </div>
            <h3 style={{ fontSize: '20px', fontWeight: 800, color: 'white', marginBottom: '20px' }}>Your time back</h3>
            {[
              { before: '4 days to compile a report', after: '20 minutes — AI generates it' },
              { before: '2 hrs chasing payments daily', after: 'Automated — system does it' },
              { before: 'Copy-pasting the same emails', after: 'AI drafts, you just approve' },
              { before: 'Waiting for assets from another team', after: 'Status visible live — no chasing' },
              { before: 'Not knowing whose task it is', after: 'Every task has an owner, always' },
            ].map((item, i) => (
              <div key={i} style={{ padding: '8px 0', borderBottom: i < 4 ? '1px solid rgba(255,255,255,0.07)' : 'none' }}>
                <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)', textDecoration: 'line-through', marginBottom: '2px' }}>{item.before}</div>
                <div style={{ fontSize: '13px', color: '#C0F43C', fontWeight: 600 }}>{item.after}</div>
              </div>
            ))}
          </div>

        </div>
      </div>

      {/* ── BOTTOM CTA ── */}
      <div style={{ background: '#1E2124', padding: '64px 48px', textAlign: 'center' }}>
        <div style={{ maxWidth: '560px', margin: '0 auto' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '2.5px', textTransform: 'uppercase', color: '#00A5A3', marginBottom: '16px' }}>The journey starts here</div>
          <h2 style={{ fontSize: '36px', fontWeight: 800, color: 'white', lineHeight: 1.2, letterSpacing: '-0.8px', marginBottom: '16px' }}>
            Every person who joins makes TAOS smarter.
          </h2>
          <p style={{ fontSize: '15px', color: 'rgba(255,255,255,0.5)', marginBottom: '32px', lineHeight: 1.7 }}>
            8 minutes. Your voice in the build. Fill in your details and see your office counter go up in real time.
          </p>
          <Link href="/join" style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', background: '#C0F43C', color: '#1E2124', fontSize: '15px', fontWeight: 800, padding: '16px 40px', borderRadius: '50px', textDecoration: 'none' }}>
            <svg width="16" height="16" fill="none" stroke="#1E2124" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
            Join the TAOS Journey
          </Link>
        </div>
      </div>

      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
    </div>
  )
}
