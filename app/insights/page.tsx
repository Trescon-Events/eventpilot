'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/app/lib/supabase'
import Link from 'next/link'

type InsightReport = {
  generated_at: string
  total_submissions: number
  pain_clusters: Array<{
    theme: string
    count: number
    examples: string[]
    office_spread: string[]
  }>
  time_savings: Array<{
    task: string
    today: string
    with_ai: string
    staff_name: string
    office: string
  }>
  skills_needed: Array<{
    skill: string
    count: number
    departments: string[]
  }>
  build_priority: Array<{
    rank: number
    title: string
    rationale: string
    impact: string
  }>
  readiness_summary: {
    average: number
    low: number
    medium: number
    high: number
  }
  raw_analysis: string
}

export default function InsightsPage() {
  const [authed, setAuthed]       = useState(false)
  const [code, setCode]           = useState('')
  const [codeError, setCodeError] = useState('')
  const [loading, setLoading]     = useState(false)
  const [generating, setGenerating] = useState(false)
  const [report, setReport]       = useState<InsightReport | null>(null)
  const [taskCount, setTaskCount] = useState(0)
  const [error, setError]         = useState('')

  useEffect(() => {
    if (!authed) return
    supabase
      .from('staff_task_profiles')
      .select('id', { count: 'exact', head: true })
      .then(({ count }) => setTaskCount(count ?? 0))
  }, [authed])

  function handleAuth(e: React.FormEvent) {
    e.preventDefault()
    if (code.trim() === (process.env.NEXT_PUBLIC_ADMIN_CODE ?? 'taos2026')) {
      setAuthed(true)
    } else {
      setCodeError('Incorrect access code.')
    }
  }

  async function generateInsights() {
    setError('')
    setGenerating(true)
    setLoading(true)
    try {
      const res = await fetch('/api/generate-insights', { method: 'POST' })
      const data = await res.json()
      if (data.error) { setError(data.error); return }
      setReport(data.report)
    } catch {
      setError('Failed to generate insights. Check your API keys and try again.')
    } finally {
      setGenerating(false)
      setLoading(false)
    }
  }

  if (!authed) {
    return (
      <div style={{ fontFamily: 'var(--font-manrope), Manrope, sans-serif', background: 'linear-gradient(155deg, #464D53 0%, #010103 60%)', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
        <div style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '24px', padding: '48px 40px', maxWidth: '400px', width: '100%', textAlign: 'center' }}>
          <div style={{ width: '56px', height: '56px', background: '#C0F43C20', border: '2px solid #C0F43C', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
            <svg width="24" height="24" fill="none" stroke="#C0F43C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
          </div>
          <h1 style={{ fontSize: '24px', fontWeight: 800, color: 'white', marginBottom: '8px' }}>TAOS Intelligence</h1>
          <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.5)', marginBottom: '32px' }}>Management-ready insights from all staff submissions</p>
          <form onSubmit={handleAuth}>
            <input
              type="password" value={code} onChange={e => { setCode(e.target.value); setCodeError('') }}
              placeholder="Access code"
              style={{ width: '100%', padding: '14px 16px', borderRadius: '12px', border: `1px solid ${codeError ? '#FF6B6B' : 'rgba(255,255,255,0.15)'}`, background: 'rgba(255,255,255,0.08)', color: 'white', fontSize: '15px', outline: 'none', fontFamily: 'inherit', textAlign: 'center', letterSpacing: '3px', marginBottom: '12px', boxSizing: 'border-box' }}
            />
            {codeError && <p style={{ fontSize: '12px', color: '#FF6B6B', marginBottom: '12px' }}>{codeError}</p>}
            <button type="submit" style={{ width: '100%', padding: '14px', borderRadius: '12px', border: 'none', background: '#C0F43C', color: '#1E2124', fontSize: '14px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
              Enter Intelligence Hub
            </button>
          </form>
          <Link href="/" style={{ display: 'block', marginTop: '20px', fontSize: '12px', color: 'rgba(255,255,255,0.3)', textDecoration: 'none' }}>Back to main page</Link>
        </div>
      </div>
    )
  }

  return (
    <div style={{ fontFamily: 'var(--font-manrope), Manrope, sans-serif', background: '#0D0F10', minHeight: '100vh', color: 'white' }}>

      <nav style={{ background: '#010103', borderBottom: '1px solid rgba(255,255,255,0.08)', padding: '0 40px', height: '60px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '8px', textDecoration: 'none' }}>
            <div style={{ width: '28px', height: '28px', background: '#00A5A3', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="14" height="14" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
            </div>
            <span style={{ fontSize: '14px', fontWeight: 800, color: 'white' }}>TAOS</span>
          </Link>
          <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: '14px' }}>/</span>
          <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)' }}>Intelligence Hub</span>
        </div>
        <Link href="/admin" style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', textDecoration: 'none' }}>Admin Dashboard</Link>
      </nav>

      <div style={{ padding: '40px', maxWidth: '1000px', margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px', gap: '24px', flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ fontSize: '28px', fontWeight: 800, color: 'white', marginBottom: '6px' }}>TAOS Intelligence Report</h1>
            <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.4)' }}>
              {taskCount} work profiles submitted — Claude analyses all submissions and surfaces what matters most
            </p>
          </div>
          <button
            onClick={generateInsights}
            disabled={generating || taskCount === 0}
            style={{
              padding: '12px 24px', borderRadius: '12px', border: 'none',
              background: generating || taskCount === 0 ? 'rgba(255,255,255,0.08)' : '#C0F43C',
              color: generating || taskCount === 0 ? 'rgba(255,255,255,0.3)' : '#1E2124',
              fontSize: '14px', fontWeight: 800, cursor: generating || taskCount === 0 ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '8px',
            }}
          >
            {generating ? (
              <>
                <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" style={{ animation: 'spin 1s linear infinite' }}><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"/><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"/></svg>
                Analysing {taskCount} profiles...
              </>
            ) : (
              <>
                <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                {taskCount === 0 ? 'No profiles yet' : 'Generate Intelligence Report'}
              </>
            )}
          </button>
        </div>

        {error && (
          <div style={{ background: '#FF6B6B15', border: '1px solid #FF6B6B40', borderRadius: '12px', padding: '16px 20px', marginBottom: '24px', fontSize: '14px', color: '#FF6B6B' }}>
            {error}
          </div>
        )}

        {!report && !loading && (
          <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '24px', padding: '64px', textAlign: 'center' }}>
            <div style={{ width: '64px', height: '64px', background: '#C0F43C15', border: '2px solid #C0F43C30', borderRadius: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
              <svg width="28" height="28" fill="none" stroke="#C0F43C" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
            </div>
            <h3 style={{ fontSize: '20px', fontWeight: 800, color: 'white', marginBottom: '10px' }}>Ready to generate</h3>
            <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.4)', lineHeight: 1.7, maxWidth: '440px', margin: '0 auto' }}>
              {taskCount === 0
                ? 'Waiting for staff to submit their work profiles. Share the /join link to get started.'
                : `${taskCount} work profiles are ready to analyse. Click Generate to run Claude across all submissions and surface the highest-impact opportunities for TAOS.`
              }
            </p>
          </div>
        )}

        {report && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

            {/* Report header */}
            <div style={{ background: 'linear-gradient(135deg, #00A5A315 0%, #C0F43C10 100%)', border: '1px solid #00A5A330', borderRadius: '20px', padding: '24px 28px', display: 'flex', gap: '32px', flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: '#00A5A3', marginBottom: '6px' }}>Profiles Analysed</div>
                <div style={{ fontSize: '32px', fontWeight: 800, color: 'white' }}>{report.total_submissions}</div>
              </div>
              <div>
                <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: '#C0F43C', marginBottom: '6px' }}>Pain Clusters Found</div>
                <div style={{ fontSize: '32px', fontWeight: 800, color: 'white' }}>{report.pain_clusters.length}</div>
              </div>
              <div>
                <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: '#F4ED3C', marginBottom: '6px' }}>Avg AI Readiness</div>
                <div style={{ fontSize: '32px', fontWeight: 800, color: 'white' }}>{report.readiness_summary.average}/5</div>
              </div>
              <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
                <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', marginBottom: '6px' }}>Generated</div>
                <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)' }}>{new Date(report.generated_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
              </div>
            </div>

            {/* Build Priority */}
            <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '20px', overflow: 'hidden' }}>
              <div style={{ padding: '20px 24px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: '#C0F43C' }}>Build Priority — What TAOS Should Build First</div>
              </div>
              <div style={{ padding: '8px 0' }}>
                {report.build_priority.map((item, i) => (
                  <div key={i} style={{ display: 'flex', gap: '16px', padding: '16px 24px', borderBottom: i < report.build_priority.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none', alignItems: 'flex-start' }}>
                    <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: i === 0 ? '#C0F43C' : 'rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <span style={{ fontSize: '12px', fontWeight: 800, color: i === 0 ? '#1E2124' : 'rgba(255,255,255,0.4)' }}>{item.rank}</span>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '15px', fontWeight: 700, color: 'white', marginBottom: '4px' }}>{item.title}</div>
                      <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)', lineHeight: 1.6, marginBottom: '6px' }}>{item.rationale}</div>
                      <div style={{ display: 'inline-block', fontSize: '11px', fontWeight: 700, color: '#C0F43C', background: '#C0F43C15', padding: '3px 10px', borderRadius: '6px' }}>{item.impact}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Pain clusters */}
            <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '20px', overflow: 'hidden' }}>
              <div style={{ padding: '20px 24px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: '#FF6B6B' }}>Pain Point Clusters — Where Time Is Being Lost</div>
              </div>
              <div style={{ padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {report.pain_clusters.map((cluster, i) => (
                  <div key={i} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '14px', padding: '16px 20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                      <div style={{ fontSize: '15px', fontWeight: 700, color: 'white' }}>{cluster.theme}</div>
                      <div style={{ fontSize: '12px', fontWeight: 700, color: '#FF6B6B', background: '#FF6B6B15', padding: '4px 10px', borderRadius: '8px' }}>{cluster.count} staff</div>
                    </div>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '8px' }}>
                      {cluster.office_spread.map((off, j) => (
                        <span key={j} style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', background: 'rgba(255,255,255,0.06)', padding: '2px 8px', borderRadius: '6px' }}>{off}</span>
                      ))}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      {cluster.examples.map((ex, j) => (
                        <div key={j} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                          <span style={{ color: '#FF6B6B', marginTop: '3px', flexShrink: 0 }}>
                            <svg width="8" height="8" viewBox="0 0 8 8" fill="#FF6B6B"><circle cx="4" cy="4" r="3"/></svg>
                          </span>
                          <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)', lineHeight: 1.5 }}>{ex}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Time savings */}
            <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '20px', overflow: 'hidden' }}>
              <div style={{ padding: '20px 24px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: '#00A5A3' }}>Biggest Time Savings — The 4-Days-to-10-Minutes Moments</div>
              </div>
              <div style={{ padding: '8px 0' }}>
                {report.time_savings.map((ts, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '14px 24px', borderBottom: i < report.time_savings.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none', flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: '200px' }}>
                      <div style={{ fontSize: '14px', fontWeight: 700, color: 'white', marginBottom: '3px' }}>{ts.task}</div>
                      <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.35)' }}>{ts.staff_name} · {ts.office}</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontSize: '14px', fontWeight: 700, color: '#FF6B6B' }}>{ts.today}</span>
                      <svg width="16" height="16" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>
                      <span style={{ fontSize: '14px', fontWeight: 700, color: '#C0F43C' }}>{ts.with_ai}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Skills needed */}
            <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '20px', overflow: 'hidden' }}>
              <div style={{ padding: '20px 24px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: '#F4ED3C' }}>Skills Gap — What the Team Needs to Learn</div>
              </div>
              <div style={{ padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {report.skills_needed.map((s, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, fontSize: '14px', fontWeight: 600, color: 'white' }}>{s.skill}</div>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      {s.departments.map((d, j) => (
                        <span key={j} style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', background: 'rgba(255,255,255,0.06)', padding: '2px 8px', borderRadius: '6px' }}>{d}</span>
                      ))}
                    </div>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: '#F4ED3C', background: '#F4ED3C15', padding: '4px 10px', borderRadius: '8px', flexShrink: 0 }}>{s.count} staff</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Raw analysis */}
            <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '20px', overflow: 'hidden' }}>
              <div style={{ padding: '20px 24px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)' }}>Full Claude Analysis</div>
              </div>
              <div style={{ padding: '24px', fontSize: '14px', color: 'rgba(255,255,255,0.6)', lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>
                {report.raw_analysis}
              </div>
            </div>

          </div>
        )}
      </div>

      <style>{`@keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }`}</style>
    </div>
  )
}
