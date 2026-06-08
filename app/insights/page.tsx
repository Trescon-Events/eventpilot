'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import type { SavedReport } from '@/app/lib/generateInsights'
import NavBar, { MOD_INTELLIGENCE } from '@/app/components/NavBar'

export default function InsightsPage() {
  const [authed,      setAuthed]      = useState(false)
  const [code,        setCode]        = useState('')
  const [codeError,   setCodeError]   = useState('')
  const [taskCount,   setTaskCount]   = useState(0)
  const [savedReports, setSavedReports] = useState<SavedReport[]>([])
  const [activeReport, setActiveReport] = useState<SavedReport | null>(null)
  const [generating,  setGenerating]  = useState(false)
  const [error,       setError]       = useState('')
  const [loading,     setLoading]     = useState(true)

  useEffect(() => {
    if (!authed) return
    Promise.all([
      fetch('/api/intelligence-reports').then(r => r.json()),
      fetch('/api/staff-list').then(r => r.json()),
    ]).then(([reports, staff]) => {
      const list: SavedReport[] = Array.isArray(reports) ? reports : []
      setSavedReports(list)
      if (list.length > 0) setActiveReport(list[0])
      setTaskCount(Array.isArray(staff) ? staff.length : 0)
      setLoading(false)
    }).catch(() => setLoading(false))
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
      // Refresh saved reports list
      const updated: SavedReport[] = await fetch('/api/intelligence-reports').then(r => r.json())
      setSavedReports(updated)
      if (updated.length > 0) setActiveReport(updated[0])
    } catch {
      setError('Network error — please try again.')
    } finally {
      setGenerating(false)
    }
  }

  function formatDate(iso: string) {
    const d = new Date(iso)
    return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
  }

  function formatDateFull(iso: string) {
    const d = new Date(iso)
    return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) +
      ' at ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  }

  const report = activeReport?.report ?? null

  /* ── Auth gate ── */
  if (!authed) {
    return (
      <div style={{ fontFamily: 'var(--font-manrope), Manrope, sans-serif', background: '#E8EEF4', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
        <div style={{ background: '#FFFFFF', border: '1.5px solid #DDE8EE', borderRadius: '16px', padding: '48px 40px', maxWidth: '400px', width: '100%', textAlign: 'center' }}>
          <div style={{ width: '56px', height: '56px', background: '#C0F43C20', border: '2px solid #C0F43C', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
            <svg width="24" height="24" fill="none" stroke="#007A6E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
          </div>
          <h1 style={{ fontSize: '36px', fontWeight: 800, color: '#0F1923', marginBottom: '8px' }}>EventPilot Intelligence</h1>
          <p style={{ fontSize: '13px', color: '#2D3E50', marginBottom: '32px' }}>Management-ready insights from all staff submissions</p>
          <form onSubmit={handleAuth}>
            <input type="password" value={code} onChange={e => { setCode(e.target.value); setCodeError('') }}
              placeholder="Access code" autoFocus
              style={{ width: '100%', padding: '14px 16px', borderRadius: '12px', border: `1px solid ${codeError ? '#FF6B6B' : '#DDE8EE'}`, background: '#FFFFFF', color: '#0F1923', fontSize: '13px', outline: 'none', fontFamily: 'inherit', textAlign: 'center', letterSpacing: '3px', marginBottom: '12px', boxSizing: 'border-box' }} />
            {codeError && <p style={{ fontSize: '13px', color: '#FF6B6B', marginBottom: '12px' }}>{codeError}</p>}
            <button type="submit" style={{ width: '100%', padding: '14px', borderRadius: '12px', border: 'none', background: '#C0F43C', color: '#0F1923', fontSize: '13px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
              Enter Intelligence Hub
            </button>
          </form>
          <Link href="/dashboard" style={{ display: 'block', marginTop: '20px', fontSize: '13px', color: '#2D3E50', textDecoration: 'none' }}>Back to dashboard</Link>
        </div>
      </div>
    )
  }

  /* ── Main ── */
  return (
    <div style={{ fontFamily: 'var(--font-manrope), Manrope, sans-serif', background: '#E8EEF4', minHeight: '100vh', color: '#0F1923' }}>

      {/* Nav */}
      <NavBar
        module={MOD_INTELLIGENCE}
        subtitle="Reports"
        homeHref="/admin"
        rightSlot={<Link className="tbtn tbtn-teal" href="/admin">Admin Dashboard</Link>}
      />

      <div style={{ padding: '40px', maxWidth: '1000px', margin: '0 auto' }}>

        {/* Page header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '28px', gap: '24px', flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ fontSize: '36px', fontWeight: 800, color: '#0F1923', marginBottom: '6px' }}>EventPilot Intelligence Report</h1>
            <p style={{ fontSize: '13px', color: '#2D3E50', lineHeight: 1.65 }}>
              {loading
                ? 'Loading reports...'
                : savedReports.length === 0
                  ? `${taskCount} profiles on record — no report generated yet`
                  : `${savedReports.length} report${savedReports.length !== 1 ? 's' : ''} saved · auto-generated every Sunday at 8 PM IST`}
            </p>
          </div>
          <button
            onClick={generateInsights}
            disabled={generating || taskCount === 0}
            style={{
              padding: '12px 24px', borderRadius: '12px', border: 'none',
              background: generating || taskCount === 0 ? '#FFFFFF' : '#C0F43C',
              color: generating || taskCount === 0 ? '#0F1923' : '#0F1923',
              fontSize: '13px', fontWeight: 800, cursor: generating || taskCount === 0 ? 'not-allowed' : 'pointer',
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
                {taskCount === 0 ? 'No profiles yet' : 'Generate Now'}
              </>
            )}
          </button>
        </div>

        {error && (
          <div style={{ background: '#FF6B6B15', border: '1px solid #FF6B6B40', borderRadius: '12px', padding: '18px 20px', marginBottom: '24px', fontSize: '13px', color: '#FF6B6B' }}>
            {error}
          </div>
        )}

        {/* Report history switcher */}
        {savedReports.length > 0 && (
          <div style={{ marginBottom: '28px' }}>
            <div style={{ fontSize: '13px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: '#0F1923', marginBottom: '10px' }}>Report History</div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {savedReports.map(r => {
                const isActive = activeReport?.id === r.id
                return (
                  <button key={r.id} onClick={() => setActiveReport(r)}
                    style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 14px', borderRadius: '16px', border: `1px solid ${isActive ? 'rgba(192,244,60,0.4)' : '#DDE8EE'}`, background: isActive ? 'rgba(192,244,60,0.1)' : 'transparent', cursor: 'pointer', fontFamily: 'inherit' }}>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: isActive ? '#00695C' : '#2D3E50' }}>{formatDate(r.generated_at)}</span>
                    <span style={{ fontSize: '13px', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', background: r.trigger_type === 'cron' ? 'rgba(0,122,110,0.12)' : '#FFFFFF', color: r.trigger_type === 'cron' ? '#00695C' : '#2D3E50' }}>
                      {r.trigger_type === 'cron' ? 'Auto' : 'Manual'}
                    </span>
                    <span style={{ fontSize: '13px', color: '#0F1923' }}>{r.total_submissions} profiles</span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* No reports yet */}
        {!loading && savedReports.length === 0 && (
          <div style={{ background: '#FFFFFF', border: '1.5px solid #DDE8EE', borderRadius: '16px', padding: '64px', textAlign: 'center' }}>
            <div style={{ width: '64px', height: '64px', background: '#C0F43C15', border: '2px solid #C0F43C30', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
              <svg width="28" height="28" fill="none" stroke="#007A6E" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
            </div>
            <h3 style={{ fontSize: '36px', fontWeight: 800, color: '#0F1923', marginBottom: '10px' }}>No reports yet</h3>
            <p style={{ fontSize: '13px', color: '#2D3E50', lineHeight: 1.65, maxWidth: '440px', margin: '0 auto' }}>
              {taskCount === 0
                ? 'Waiting for staff to submit their work profiles. Share the /join link to get started.'
                : `${taskCount} profiles are ready. The weekly auto-report runs every Sunday at 8 PM IST. Click Generate Now to run it immediately.`}
            </p>
          </div>
        )}

        {/* Active report */}
        {report && activeReport && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

            {/* Report header */}
            <div style={{ background: 'rgba(192,244,60,0.06)', border: '1px solid rgba(192,244,60,0.2)', borderRadius: '16px', padding: '20px 24px', display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
              <div style={{ width: '40px', height: '40px', background: '#C0F43C20', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="18" height="18" fill="none" stroke="#007A6E" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '13px', fontWeight: 800, color: '#3D6B00', marginBottom: '2px' }}>
                  Gemini analysis — {report.total_submissions} profiles · {activeReport.trigger_type === 'cron' ? 'Auto-generated' : 'Manually generated'}
                </div>
                <div style={{ fontSize: '13px', color: '#2D3E50' }}>{formatDateFull(activeReport.generated_at)}</div>
              </div>
            </div>

            {/* Pain clusters */}
            {report.pain_clusters?.length > 0 && (
              <div style={{ background: '#FFFFFF', border: '1.5px solid #DDE8EE', borderRadius: '16px', padding: '24px' }}>
                <div style={{ fontSize: '13px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: '#0F1923', marginBottom: '20px' }}>Pain Clusters — Shared Problems Across the Team</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {report.pain_clusters.map((c, i) => (
                    <div key={i} style={{ background: 'rgba(255,107,107,0.06)', border: '1px solid rgba(255,107,107,0.15)', borderRadius: '14px', padding: '18px 20px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '8px' }}>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: '#0F1923' }}>{c.theme}</div>
                        <div style={{ fontSize: '13px', fontWeight: 800, color: '#FF6B6B', background: '#FF6B6B15', padding: '3px 10px', borderRadius: '16px', flexShrink: 0 }}>{c.count} staff</div>
                      </div>
                      <div style={{ fontSize: '13px', color: '#2D3E50', marginBottom: '8px' }}>Offices: {c.office_spread.join(' · ')}</div>
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        {c.examples.map((ex, j) => (
                          <span key={j} style={{ fontSize: '13px', color: '#2D3E50', background: '#FFFFFF', padding: '3px 8px', borderRadius: '6px' }}>{ex}</span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Build priority */}
            {report.build_priority?.length > 0 && (
              <div style={{ background: '#FFFFFF', border: '1.5px solid #DDE8EE', borderRadius: '16px', padding: '24px' }}>
                <div style={{ fontSize: '13px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: '#0F1923', marginBottom: '20px' }}>Build Priority — What to Ship First</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {report.build_priority.map((b) => (
                    <div key={b.rank} style={{ display: 'flex', gap: '16px', padding: '18px 20px', background: b.rank === 1 ? 'rgba(192,244,60,0.06)' : '#FFFFFF', border: `1px solid ${b.rank === 1 ? 'rgba(192,244,60,0.2)' : '#DDE8EE'}`, borderRadius: '14px' }}>
                      <div style={{ width: '32px', height: '32px', borderRadius: '10px', background: b.rank === 1 ? '#00695C' : '#DDE8EE', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <span style={{ fontSize: '13px', fontWeight: 800, color: b.rank === 1 ? 'white' : '#2D3E50' }}>{b.rank}</span>
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: '#0F1923', marginBottom: '4px' }}>{b.title}</div>
                        <div style={{ fontSize: '13px', color: '#2D3E50', lineHeight: 1.65, marginBottom: '6px' }}>{b.rationale}</div>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: '#3D6B00' }}>{b.impact}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Time savings + Skills side by side */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>

              {report.time_savings?.length > 0 && (
                <div style={{ background: '#FFFFFF', border: '1.5px solid #DDE8EE', borderRadius: '16px', padding: '24px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: '#0F1923', marginBottom: '20px' }}>Time Savings — Before vs. After AI</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {report.time_savings.slice(0, 6).map((t, i) => (
                      <div key={i} style={{ padding: '12px 14px', background: 'rgba(0,165,163,0.06)', border: '1px solid rgba(0,165,163,0.15)', borderRadius: '12px' }}>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: '#0F1923', marginBottom: '6px' }}>{t.task}</div>
                        <div style={{ display: 'flex', gap: '12px', fontSize: '13px' }}>
                          <span style={{ color: '#FF6B6B' }}>Now: {t.today}</span>
                          <span style={{ color: '#0F1923' }}>→</span>
                          <span style={{ color: '#3D6B00' }}>With AI: {t.with_ai}</span>
                        </div>
                        <div style={{ fontSize: '13px', color: '#00695C', marginTop: '4px', fontWeight: 600 }}>{t.saving}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {report.skills_needed?.length > 0 && (
                <div style={{ background: '#FFFFFF', border: '1.5px solid #DDE8EE', borderRadius: '16px', padding: '24px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: '#0F1923', marginBottom: '20px' }}>Training Needs — Skills Gaps Identified</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {report.skills_needed.map((s, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ flex: 1, fontSize: '13px', fontWeight: 600, color: '#0F1923' }}>{s.skill}</div>
                        <div style={{ fontSize: '13px', color: '#8B1A1A', fontWeight: 700, background: '#8B1A1A15', padding: '2px 8px', borderRadius: '6px' }}>{s.count} staff</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Readiness summary */}
            {report.readiness_summary && (
              <div style={{ background: '#FFFFFF', border: '1.5px solid #DDE8EE', borderRadius: '16px', padding: '24px' }}>
                <div style={{ fontSize: '13px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: '#0F1923', marginBottom: '20px' }}>AI Readiness Summary</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
                  {[
                    { label: 'Avg Readiness', value: report.readiness_summary.average?.toFixed(1), sub: 'out of 5', color: '#00695C' },
                    { label: 'Not Ready',     value: report.readiness_summary.low,                  sub: 'scored 1–2', color: '#FF6B6B' },
                    { label: 'Developing',    value: report.readiness_summary.medium,               sub: 'scored 3',   color: '#8B1A1A' },
                    { label: 'AI-Ready',      value: report.readiness_summary.high,                 sub: 'scored 4–5', color: '#3D6B00' },
                  ].map((k, i) => (
                    <div key={i} style={{ textAlign: 'center', padding: '16px', background: '#FFFFFF', borderRadius: '12px', border: `1px solid ${k.color}25` }}>
                      <div style={{ fontSize: '36px', fontWeight: 800, color: k.color, lineHeight: 1 }}>{k.value}</div>
                      <div style={{ fontSize: '13px', color: '#2D3E50', marginTop: '4px' }}>{k.label}</div>
                      <div style={{ fontSize: '13px', color: '#0F1923', marginTop: '2px' }}>{k.sub}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Raw analysis */}
            <div style={{ background: '#FFFFFF', border: '1.5px solid #DDE8EE', borderRadius: '16px', overflow: 'hidden' }}>
              <div style={{ padding: '20px 24px', borderBottom: '1px solid #DDE8EE' }}>
                <div style={{ fontSize: '13px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: '#0F1923' }}>Full Gemini Analysis</div>
              </div>
              <div style={{ padding: '24px', fontSize: '13px', color: '#2D3E50', lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>
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
