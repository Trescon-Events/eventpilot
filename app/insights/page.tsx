'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import type { SavedReport } from '@/app/lib/generateInsights'

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
      <div style={{ fontFamily: 'var(--font-manrope), Manrope, sans-serif', background: '#F6FFFE', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
        <div style={{ background: '#EEF9F9', border: '1px solid #E6EFF0', borderRadius: '24px', padding: '48px 40px', maxWidth: '400px', width: '100%', textAlign: 'center' }}>
          <div style={{ width: '56px', height: '56px', background: '#C0F43C20', border: '2px solid #C0F43C', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
            <svg width="24" height="24" fill="none" stroke="#C0F43C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
          </div>
          <h1 style={{ fontSize: '28px', fontWeight: 800, color: '#1E2124', marginBottom: '8px' }}>Trescademy Intelligence</h1>
          <p style={{ fontSize: '16px', color: '#464D53', marginBottom: '32px' }}>Management-ready insights from all staff submissions</p>
          <form onSubmit={handleAuth}>
            <input type="password" value={code} onChange={e => { setCode(e.target.value); setCodeError('') }}
              placeholder="Access code" autoFocus
              style={{ width: '100%', padding: '14px 16px', borderRadius: '12px', border: `1px solid ${codeError ? '#FF6B6B' : '#E6EFF0'}`, background: '#EEF9F9', color: '#1E2124', fontSize: '17px', outline: 'none', fontFamily: 'inherit', textAlign: 'center', letterSpacing: '3px', marginBottom: '12px', boxSizing: 'border-box' }} />
            {codeError && <p style={{ fontSize: '14px', color: '#FF6B6B', marginBottom: '12px' }}>{codeError}</p>}
            <button type="submit" style={{ width: '100%', padding: '14px', borderRadius: '12px', border: 'none', background: '#C0F43C', color: '#1E2124', fontSize: '16px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
              Enter Intelligence Hub
            </button>
          </form>
          <Link href="/dashboard" style={{ display: 'block', marginTop: '20px', fontSize: '14px', color: '#464D53', textDecoration: 'none' }}>Back to dashboard</Link>
        </div>
      </div>
    )
  }

  /* ── Main ── */
  return (
    <div style={{ fontFamily: 'var(--font-manrope), Manrope, sans-serif', background: '#F6FFFE', minHeight: '100vh', color: '#1E2124' }}>

      {/* Nav */}
      <nav style={{ background: '#FFFFFF', borderBottom: '1px solid #E6EFF0', boxShadow: '0 1px 3px rgba(0,165,163,0.08)', padding: '0 40px', height: '64px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Link href="/dashboard" style={{ display: 'flex', alignItems: 'center', gap: '8px', textDecoration: 'none' }}>
            <div style={{ background: 'white', borderRadius: '8px', padding: '4px 10px', display: 'flex', alignItems: 'center' }}>
              <img src="/trescon-logo.png" alt="Trescon" style={{ height: '40px', width: 'auto', display: 'block' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div style={{ width: '24px', height: '24px', background: '#00A5A3', borderRadius: '7px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="12" height="12" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
              </div>
              <span style={{ fontSize: '16px', fontWeight: 800, color: '#1E2124' }}>Trescademy</span>
            </div>
          </Link>
          <span style={{ color: 'rgba(70,77,83,0.35)' }}>/</span>
          <span style={{ fontSize: '15px', color: '#464D53' }}>Intelligence Reports</span>
        </div>
        <Link href="/admin" style={{ fontSize: '13px', fontWeight: 700, color: '#C0F43C', textDecoration: 'none', background: 'rgba(192,244,60,0.12)', border: '1px solid rgba(192,244,60,0.3)', padding: '6px 14px', borderRadius: '20px', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>
          Admin Dashboard
        </Link>
      </nav>

      <div style={{ padding: '40px', maxWidth: '1000px', margin: '0 auto' }}>

        {/* Page header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '28px', gap: '24px', flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ fontSize: '32px', fontWeight: 800, color: '#1E2124', marginBottom: '6px' }}>Trescademy Intelligence Report</h1>
            <p style={{ fontSize: '16px', color: '#464D53', lineHeight: 1.65 }}>
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
              background: generating || taskCount === 0 ? '#EEF9F9' : '#C0F43C',
              color: generating || taskCount === 0 ? 'rgba(70,77,83,0.55)' : '#1E2124',
              fontSize: '16px', fontWeight: 800, cursor: generating || taskCount === 0 ? 'not-allowed' : 'pointer',
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
          <div style={{ background: '#FF6B6B15', border: '1px solid #FF6B6B40', borderRadius: '12px', padding: '16px 20px', marginBottom: '24px', fontSize: '16px', color: '#FF6B6B' }}>
            {error}
          </div>
        )}

        {/* Report history switcher */}
        {savedReports.length > 0 && (
          <div style={{ marginBottom: '28px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: 'rgba(70,77,83,0.55)', marginBottom: '10px' }}>Report History</div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {savedReports.map(r => {
                const isActive = activeReport?.id === r.id
                return (
                  <button key={r.id} onClick={() => setActiveReport(r)}
                    style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 14px', borderRadius: '20px', border: `1px solid ${isActive ? 'rgba(192,244,60,0.4)' : '#E6EFF0'}`, background: isActive ? 'rgba(192,244,60,0.1)' : 'transparent', cursor: 'pointer', fontFamily: 'inherit' }}>
                    <span style={{ fontSize: '14px', fontWeight: 700, color: isActive ? '#C0F43C' : '#464D53' }}>{formatDate(r.generated_at)}</span>
                    <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', background: r.trigger_type === 'cron' ? 'rgba(0,165,163,0.15)' : '#EEF9F9', color: r.trigger_type === 'cron' ? '#00A5A3' : '#464D53' }}>
                      {r.trigger_type === 'cron' ? 'Auto' : 'Manual'}
                    </span>
                    <span style={{ fontSize: '11px', color: 'rgba(70,77,83,0.55)' }}>{r.total_submissions} profiles</span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* No reports yet */}
        {!loading && savedReports.length === 0 && (
          <div style={{ background: '#FFFFFF', border: '1px solid #E6EFF0', borderRadius: '24px', padding: '64px', textAlign: 'center' }}>
            <div style={{ width: '64px', height: '64px', background: '#C0F43C15', border: '2px solid #C0F43C30', borderRadius: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
              <svg width="28" height="28" fill="none" stroke="#C0F43C" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
            </div>
            <h3 style={{ fontSize: '24px', fontWeight: 800, color: '#1E2124', marginBottom: '10px' }}>No reports yet</h3>
            <p style={{ fontSize: '16px', color: '#464D53', lineHeight: 1.65, maxWidth: '440px', margin: '0 auto' }}>
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
                <svg width="18" height="18" fill="none" stroke="#C0F43C" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '15px', fontWeight: 800, color: '#C0F43C', marginBottom: '2px' }}>
                  Gemini analysis — {report.total_submissions} profiles · {activeReport.trigger_type === 'cron' ? 'Auto-generated' : 'Manually generated'}
                </div>
                <div style={{ fontSize: '14px', color: '#464D53' }}>{formatDateFull(activeReport.generated_at)}</div>
              </div>
            </div>

            {/* Pain clusters */}
            {report.pain_clusters?.length > 0 && (
              <div style={{ background: '#FFFFFF', border: '1px solid #E6EFF0', borderRadius: '20px', padding: '24px' }}>
                <div style={{ fontSize: '13px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: 'rgba(70,77,83,0.55)', marginBottom: '20px' }}>Pain Clusters — Shared Problems Across the Team</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {report.pain_clusters.map((c, i) => (
                    <div key={i} style={{ background: 'rgba(255,107,107,0.06)', border: '1px solid rgba(255,107,107,0.15)', borderRadius: '14px', padding: '16px 20px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '8px' }}>
                        <div style={{ fontSize: '16px', fontWeight: 700, color: '#1E2124' }}>{c.theme}</div>
                        <div style={{ fontSize: '14px', fontWeight: 800, color: '#FF6B6B', background: '#FF6B6B15', padding: '3px 10px', borderRadius: '20px', flexShrink: 0 }}>{c.count} staff</div>
                      </div>
                      <div style={{ fontSize: '13px', color: '#464D53', marginBottom: '8px' }}>Offices: {c.office_spread.join(' · ')}</div>
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        {c.examples.map((ex, j) => (
                          <span key={j} style={{ fontSize: '13px', color: '#464D53', background: '#EEF9F9', padding: '3px 8px', borderRadius: '6px' }}>{ex}</span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Build priority */}
            {report.build_priority?.length > 0 && (
              <div style={{ background: '#FFFFFF', border: '1px solid #E6EFF0', borderRadius: '20px', padding: '24px' }}>
                <div style={{ fontSize: '13px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: 'rgba(70,77,83,0.55)', marginBottom: '20px' }}>Build Priority — What to Ship First</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {report.build_priority.map((b) => (
                    <div key={b.rank} style={{ display: 'flex', gap: '16px', padding: '16px 20px', background: b.rank === 1 ? 'rgba(192,244,60,0.06)' : '#EEF9F9', border: `1px solid ${b.rank === 1 ? 'rgba(192,244,60,0.2)' : '#E6EFF0'}`, borderRadius: '14px' }}>
                      <div style={{ width: '32px', height: '32px', borderRadius: '10px', background: b.rank === 1 ? '#C0F43C' : '#E6EFF0', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <span style={{ fontSize: '16px', fontWeight: 800, color: b.rank === 1 ? '#1E2124' : '#464D53' }}>{b.rank}</span>
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '16px', fontWeight: 700, color: '#1E2124', marginBottom: '4px' }}>{b.title}</div>
                        <div style={{ fontSize: '14px', color: '#464D53', lineHeight: 1.65, marginBottom: '6px' }}>{b.rationale}</div>
                        <div style={{ fontSize: '14px', fontWeight: 700, color: '#C0F43C' }}>{b.impact}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Time savings + Skills side by side */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>

              {report.time_savings?.length > 0 && (
                <div style={{ background: '#FFFFFF', border: '1px solid #E6EFF0', borderRadius: '20px', padding: '24px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: 'rgba(70,77,83,0.55)', marginBottom: '20px' }}>Time Savings — Before vs. After AI</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {report.time_savings.slice(0, 6).map((t, i) => (
                      <div key={i} style={{ padding: '12px 14px', background: 'rgba(0,165,163,0.06)', border: '1px solid rgba(0,165,163,0.15)', borderRadius: '12px' }}>
                        <div style={{ fontSize: '14px', fontWeight: 700, color: '#1E2124', marginBottom: '6px' }}>{t.task}</div>
                        <div style={{ display: 'flex', gap: '12px', fontSize: '13px' }}>
                          <span style={{ color: '#FF6B6B' }}>Now: {t.today}</span>
                          <span style={{ color: 'rgba(70,77,83,0.55)' }}>→</span>
                          <span style={{ color: '#C0F43C' }}>With AI: {t.with_ai}</span>
                        </div>
                        <div style={{ fontSize: '13px', color: '#00A5A3', marginTop: '4px', fontWeight: 600 }}>{t.saving}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {report.skills_needed?.length > 0 && (
                <div style={{ background: '#FFFFFF', border: '1px solid #E6EFF0', borderRadius: '20px', padding: '24px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: 'rgba(70,77,83,0.55)', marginBottom: '20px' }}>Training Needs — Skills Gaps Identified</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {report.skills_needed.map((s, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ flex: 1, fontSize: '15px', fontWeight: 600, color: '#1E2124' }}>{s.skill}</div>
                        <div style={{ fontSize: '13px', color: '#FF9F43', fontWeight: 700, background: '#FF9F4315', padding: '2px 8px', borderRadius: '6px' }}>{s.count} staff</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Readiness summary */}
            {report.readiness_summary && (
              <div style={{ background: '#FFFFFF', border: '1px solid #E6EFF0', borderRadius: '20px', padding: '24px' }}>
                <div style={{ fontSize: '13px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: 'rgba(70,77,83,0.55)', marginBottom: '20px' }}>AI Readiness Summary</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
                  {[
                    { label: 'Avg Readiness', value: report.readiness_summary.average?.toFixed(1), sub: 'out of 5', color: '#00A5A3' },
                    { label: 'Not Ready',     value: report.readiness_summary.low,                  sub: 'scored 1–2', color: '#FF6B6B' },
                    { label: 'Developing',    value: report.readiness_summary.medium,               sub: 'scored 3',   color: '#FF9F43' },
                    { label: 'AI-Ready',      value: report.readiness_summary.high,                 sub: 'scored 4–5', color: '#C0F43C' },
                  ].map((k, i) => (
                    <div key={i} style={{ textAlign: 'center', padding: '16px', background: '#FFFFFF', borderRadius: '12px', border: `1px solid ${k.color}25` }}>
                      <div style={{ fontSize: '32px', fontWeight: 800, color: k.color, lineHeight: 1 }}>{k.value}</div>
                      <div style={{ fontSize: '13px', color: '#464D53', marginTop: '4px' }}>{k.label}</div>
                      <div style={{ fontSize: '11px', color: 'rgba(70,77,83,0.55)', marginTop: '2px' }}>{k.sub}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Raw analysis */}
            <div style={{ background: '#FFFFFF', border: '1px solid #E6EFF0', borderRadius: '20px', overflow: 'hidden' }}>
              <div style={{ padding: '20px 24px', borderBottom: '1px solid #E6EFF0' }}>
                <div style={{ fontSize: '13px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: 'rgba(70,77,83,0.55)' }}>Full Gemini Analysis</div>
              </div>
              <div style={{ padding: '24px', fontSize: '16px', color: '#464D53', lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>
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
