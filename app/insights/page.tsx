'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { supabase } from '@/app/lib/supabase'

type Report = {
  generated_at: string
  total_submissions: number
  pain_clusters: { theme: string; count: number; examples: string[]; office_spread: string[] }[]
  time_savings: { task: string; today: string; with_ai: string; saving: string; staff_name: string; office: string }[]
  skills_needed: { skill: string; count: number; departments: string[] }[]
  build_priority: { rank: number; title: string; rationale: string; impact: string }[]
  readiness_summary: { average: number; low: number; medium: number; high: number }
  raw_analysis: string
}

export default function InsightsPage() {
  const [authed, setAuthed]     = useState(false)
  const [code, setCode]         = useState('')
  const [codeError, setCodeError] = useState('')
  const [taskCount, setTaskCount] = useState(0)
  const [report, setReport]     = useState<Report | null>(null)
  const [generating, setGenerating] = useState(false)
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    if (!authed) return
    supabase.from('staff_task_profiles').select('id', { count: 'exact', head: true })
      .then(({ count }) => { setTaskCount(count ?? 0); setLoading(false) })
  }, [authed])

  function handleAuth(e: React.FormEvent) {
    e.preventDefault()
    if (code.trim() === (process.env.NEXT_PUBLIC_ADMIN_CODE ?? 'taos2026')) {
      setAuthed(true)
    } else { setCodeError('Incorrect access code.') }
  }

  async function generateInsights() {
    setGenerating(true)
    setError('')
    try {
      const res = await fetch('/api/generate-insights', { method: 'POST' })
      const data = await res.json()
      if (data.error) { setError(data.error); return }
      setReport(data.report)
    } catch {
      setError('Network error — please try again.')
    } finally {
      setGenerating(false)
    }
  }

  /* ── Auth gate ── */
  if (!authed) {
    return (
      <div style={{ fontFamily: 'var(--font-manrope), Manrope, sans-serif', background: 'linear-gradient(155deg, #464D53 0%, #010103 60%)', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
        <div style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '24px', padding: '48px 40px', maxWidth: '400px', width: '100%', textAlign: 'center' }}>
          <div style={{ width: '56px', height: '56px', background: '#C0F43C20', border: '2px solid #C0F43C', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
            <svg width="24" height="24" fill="none" stroke="#C0F43C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
          </div>
          <h1 style={{ fontSize: '24px', fontWeight: 800, color: 'white', marginBottom: '8px' }}>TAI Intelligence</h1>
          <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.5)', marginBottom: '32px' }}>Management-ready insights from all staff submissions</p>
          <form onSubmit={handleAuth}>
            <input type="password" value={code} onChange={e => { setCode(e.target.value); setCodeError('') }}
              placeholder="Access code" autoFocus
              style={{ width: '100%', padding: '14px 16px', borderRadius: '12px', border: `1px solid ${codeError ? '#FF6B6B' : 'rgba(255,255,255,0.15)'}`, background: 'rgba(255,255,255,0.08)', color: 'white', fontSize: '15px', outline: 'none', fontFamily: 'inherit', textAlign: 'center', letterSpacing: '3px', marginBottom: '12px', boxSizing: 'border-box' as const }} />
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

  /* ── Main ── */
  return (
    <div style={{ fontFamily: 'var(--font-manrope), Manrope, sans-serif', background: '#0D0F10', minHeight: '100vh', color: 'white' }}>
      <nav style={{ background: '#010103', borderBottom: '1px solid rgba(255,255,255,0.08)', padding: '0 40px', height: '60px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Link href="/admin" style={{ display: 'flex', alignItems: 'center', gap: '10px', textDecoration: 'none' }}>
            <div style={{ background: 'white', borderRadius: '8px', padding: '4px 10px' }}>
              <img src="/trescon-logo.png" alt="Trescon" style={{ height: '22px', width: 'auto', display: 'block' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
              <div style={{ width: '24px', height: '24px', background: '#C0F43C', borderRadius: '7px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="12" height="12" fill="none" stroke="#1E2124" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
              </div>
              <span style={{ fontSize: '13px', fontWeight: 800, color: 'white' }}>TAI Intelligence</span>
            </div>
          </Link>
          <span style={{ color: 'rgba(255,255,255,0.2)' }}>/</span>
          <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)' }}>Gemini Analysis</span>
        </div>
        <Link href="/admin" style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', textDecoration: 'none', border: '1px solid rgba(255,255,255,0.1)', padding: '6px 14px', borderRadius: '8px' }}>
          Back to Dashboard
        </Link>
      </nav>

      <div style={{ padding: '40px', maxWidth: '1000px', margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px', gap: '24px', flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ fontSize: '28px', fontWeight: 800, color: 'white', marginBottom: '6px' }}>TAI Intelligence Report</h1>
            <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.6)', lineHeight: 1.6 }}>
              {loading ? 'Loading...' : `${taskCount} work profiles submitted — Gemini analyses all submissions and surfaces what matters most`}
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
              fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0,
            }}>
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
            <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.5)', lineHeight: 1.7, maxWidth: '440px', margin: '0 auto' }}>
              {taskCount === 0
                ? 'Waiting for staff to submit their work profiles. Share the /join link to get started.'
                : `${taskCount} work profiles are ready to analyse. Click Generate to run Gemini across all submissions and surface the highest-impact opportunities for TAI.`}
            </p>
          </div>
        )}

        {report && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

            {/* Report header */}
            <div style={{ background: 'rgba(192,244,60,0.06)', border: '1px solid rgba(192,244,60,0.2)', borderRadius: '16px', padding: '20px 24px', display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
              <div style={{ width: '40px', height: '40px', background: '#C0F43C20', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="18" height="18" fill="none" stroke="#C0F43C" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '13px', fontWeight: 800, color: '#C0F43C', marginBottom: '2px' }}>Gemini analysis complete — {report.total_submissions} profiles processed</div>
                <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)' }}>Generated {new Date(report.generated_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>
              </div>
            </div>

            {/* Pain clusters */}
            {report.pain_clusters?.length > 0 && (
              <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '20px', padding: '24px' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.5)', marginBottom: '20px' }}>Pain Clusters — Shared Problems Across the Team</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {report.pain_clusters.map((c, i) => (
                    <div key={i} style={{ background: 'rgba(255,107,107,0.06)', border: '1px solid rgba(255,107,107,0.15)', borderRadius: '14px', padding: '16px 20px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '8px' }}>
                        <div style={{ fontSize: '14px', fontWeight: 700, color: 'white' }}>{c.theme}</div>
                        <div style={{ fontSize: '12px', fontWeight: 800, color: '#FF6B6B', background: '#FF6B6B15', padding: '3px 10px', borderRadius: '20px', flexShrink: 0 }}>{c.count} staff</div>
                      </div>
                      <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', marginBottom: '8px' }}>Offices: {c.office_spread.join(' · ')}</div>
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        {c.examples.map((ex, j) => (
                          <span key={j} style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', background: 'rgba(255,255,255,0.06)', padding: '3px 8px', borderRadius: '6px' }}>{ex}</span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Build priority */}
            {report.build_priority?.length > 0 && (
              <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '20px', padding: '24px' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.5)', marginBottom: '20px' }}>TAI Build Priority — What to Ship First</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {report.build_priority.map((b) => (
                    <div key={b.rank} style={{ display: 'flex', gap: '16px', padding: '16px 20px', background: b.rank === 1 ? 'rgba(192,244,60,0.06)' : 'rgba(255,255,255,0.03)', border: `1px solid ${b.rank === 1 ? 'rgba(192,244,60,0.2)' : 'rgba(255,255,255,0.06)'}`, borderRadius: '14px' }}>
                      <div style={{ width: '32px', height: '32px', borderRadius: '10px', background: b.rank === 1 ? '#C0F43C' : 'rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <span style={{ fontSize: '14px', fontWeight: 800, color: b.rank === 1 ? '#1E2124' : 'rgba(255,255,255,0.5)' }}>{b.rank}</span>
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '14px', fontWeight: 700, color: 'white', marginBottom: '4px' }}>{b.title}</div>
                        <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', lineHeight: 1.5, marginBottom: '6px' }}>{b.rationale}</div>
                        <div style={{ fontSize: '12px', fontWeight: 700, color: '#C0F43C' }}>{b.impact}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Time savings + Skills side by side */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>

              {report.time_savings?.length > 0 && (
                <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '20px', padding: '24px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.5)', marginBottom: '20px' }}>Time Savings — Before vs. After TAI</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {report.time_savings.slice(0, 6).map((t, i) => (
                      <div key={i} style={{ padding: '12px 14px', background: 'rgba(0,165,163,0.06)', border: '1px solid rgba(0,165,163,0.15)', borderRadius: '12px' }}>
                        <div style={{ fontSize: '12px', fontWeight: 700, color: 'white', marginBottom: '6px' }}>{t.task}</div>
                        <div style={{ display: 'flex', gap: '12px', fontSize: '11px' }}>
                          <span style={{ color: '#FF6B6B' }}>Now: {t.today}</span>
                          <span style={{ color: 'rgba(255,255,255,0.3)' }}>→</span>
                          <span style={{ color: '#C0F43C' }}>With TAI: {t.with_ai}</span>
                        </div>
                        <div style={{ fontSize: '11px', color: '#00A5A3', marginTop: '4px', fontWeight: 600 }}>{t.saving}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {report.skills_needed?.length > 0 && (
                <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '20px', padding: '24px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.5)', marginBottom: '20px' }}>Training Needs — Skills Gaps Identified</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {report.skills_needed.map((s, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ flex: 1, fontSize: '13px', fontWeight: 600, color: 'white' }}>{s.skill}</div>
                        <div style={{ fontSize: '11px', color: '#FF9F43', fontWeight: 700, background: '#FF9F4315', padding: '2px 8px', borderRadius: '6px' }}>{s.count} staff</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Readiness summary */}
            {report.readiness_summary && (
              <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '20px', padding: '24px' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.5)', marginBottom: '20px' }}>AI Readiness Summary</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
                  {[
                    { label: 'Avg Readiness', value: report.readiness_summary.average?.toFixed(1), sub: 'out of 5', color: '#00A5A3' },
                    { label: 'Not Ready', value: report.readiness_summary.low, sub: 'scored 1–2', color: '#FF6B6B' },
                    { label: 'Developing', value: report.readiness_summary.medium, sub: 'scored 3', color: '#FF9F43' },
                    { label: 'AI-Ready', value: report.readiness_summary.high, sub: 'scored 4–5', color: '#C0F43C' },
                  ].map((k, i) => (
                    <div key={i} style={{ textAlign: 'center', padding: '16px', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', border: `1px solid ${k.color}25` }}>
                      <div style={{ fontSize: '28px', fontWeight: 800, color: k.color, lineHeight: 1 }}>{k.value}</div>
                      <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.6)', marginTop: '4px' }}>{k.label}</div>
                      <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.35)', marginTop: '2px' }}>{k.sub}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Raw analysis */}
            <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '20px', overflow: 'hidden' }}>
              <div style={{ padding: '20px 24px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.5)' }}>Full Gemini Analysis</div>
              </div>
              <div style={{ padding: '24px', fontSize: '14px', color: 'rgba(255,255,255,0.7)', lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>
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
