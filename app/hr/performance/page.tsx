'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'

const C = {
  bg: '#F6F8FB', surface: '#FFFFFF', border: '#DDE8EE', text: '#0F1923',
  muted: '#5B7080', green: '#00897B', amber: '#D97706', red: '#8B1A1A',
  blue: '#0284C7', purple: '#6C54B5',
}

const RATING_LABELS = ['', 'Needs Improvement', 'Below Expectations', 'Meets Expectations', 'Exceeds Expectations', 'Outstanding']
const RATING_COLORS = ['', C.red, C.amber, C.blue, C.green, C.purple]
const STATUS_MAP: Record<string, { label: string; color: string }> = {
  draft:        { label: 'Draft', color: C.muted },
  submitted:    { label: 'Submitted', color: C.blue },
  acknowledged: { label: 'Acknowledged', color: C.amber },
  completed:    { label: 'Completed', color: C.green },
}

type Session = { sid: string; adm: boolean; jl: string }
type Staff = { id: string; name: string; department: string | null; manager_id: string | null }
type Review = {
  id: string; staff_id: string; reviewer_id: string | null; review_period: string;
  review_date: string | null; overall_rating: number | null; kpi_score: number | null;
  strengths: string | null; areas_to_improve: string | null; goals_next_period: string | null;
  reviewer_comments: string | null; staff_comments: string | null; status: string;
  created_at: string;
  staff?: { id: string; name: string; department: string | null } | null
  reviewer?: { id: string; name: string } | null
}

function getSession(): Session | null {
  if (typeof document === 'undefined') return null
  const raw = document.cookie.split('; ').find(c => c.startsWith('tcs_session='))?.split('=')[1]
  if (!raw) return null
  try { return JSON.parse(atob(raw)) } catch { return null }
}

export default function PerformancePage() {
  const [session, setSession] = useState<Session | null>(null)
  const [tab, setTab] = useState<'overview' | 'create'>('overview')
  const [staff, setStaff] = useState<Staff[]>([])
  const [reviews, setReviews] = useState<Review[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [selectedReview, setSelectedReview] = useState<Review | null>(null)
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterPeriod, setFilterPeriod] = useState('all')

  // Create form
  const [fStaff, setFStaff] = useState('')
  const [fPeriod, setFPeriod] = useState('Q2 2026')
  const [fDate, setFDate] = useState(new Date().toISOString().slice(0, 10))
  const [fRating, setFRating] = useState(3)
  const [fKpi, setFKpi] = useState('')
  const [fStrengths, setFStrengths] = useState('')
  const [fImprove, setFImprove] = useState('')
  const [fGoals, setFGoals] = useState('')
  const [fComments, setFComments] = useState('')

  useEffect(() => { setSession(getSession()) }, [])

  const isManager = session?.jl === 'team_lead' || session?.jl === 'dept_head' || session?.jl === 'office_head' || session?.adm

  const fetchData = useCallback(async () => {
    if (!session) return
    setLoading(true)
    const [sRes, rRes] = await Promise.all([
      fetch('/api/hr/staff'),
      fetch(`/api/hr/performance?reviewer_id=${session.sid}`),
    ])
    const sData = await sRes.json()
    const rData = await rRes.json()
    setStaff(Array.isArray(sData) ? sData : [])
    setReviews(Array.isArray(rData) ? rData : [])
    setLoading(false)
  }, [session])

  useEffect(() => { fetchData() }, [fetchData])

  const periods = [...new Set(reviews.map(r => r.review_period))]
  const filtered = reviews.filter(r => {
    if (filterStatus !== 'all' && r.status !== filterStatus) return false
    if (filterPeriod !== 'all' && r.review_period !== filterPeriod) return false
    return true
  })

  async function createReview() {
    if (!fStaff) { setMsg({ text: 'Select a staff member', ok: false }); return }
    setSaving(true); setMsg(null)
    const res = await fetch('/api/hr/performance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        staff_id: fStaff,
        reviewer_id: session!.sid,
        review_period: fPeriod,
        review_date: fDate,
        overall_rating: fRating,
        kpi_score: fKpi ? Number(fKpi) : null,
        strengths: fStrengths.trim() || null,
        areas_to_improve: fImprove.trim() || null,
        goals_next_period: fGoals.trim() || null,
        reviewer_comments: fComments.trim() || null,
      }),
    })
    if (res.ok) {
      setMsg({ text: 'Review created', ok: true })
      setTab('overview')
      setFStaff(''); setFStrengths(''); setFImprove(''); setFGoals(''); setFComments(''); setFKpi('')
      fetchData()
    } else {
      const d = await res.json()
      setMsg({ text: d.error ?? 'Failed', ok: false })
    }
    setSaving(false)
  }

  async function updateStatus(id: string, status: string) {
    await fetch('/api/hr/performance', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status }),
    })
    fetchData()
    setSelectedReview(null)
  }

  if (!session) return null

  return (
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: "'Inter', system-ui, sans-serif" }}>
      {/* Header */}
      <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, padding: '20px 32px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <Link href="/hr" style={{ color: C.muted, textDecoration: 'none', fontSize: 13 }}>HR Portal</Link>
            <span style={{ color: C.border }}>/</span>
            <span style={{ fontSize: 13, color: C.text, fontWeight: 700 }}>Performance Reviews</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: C.text, margin: 0 }}>Performance Reviews</h1>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => setTab('overview')}
                style={{ padding: '7px 18px', borderRadius: 8, border: tab === 'overview' ? `1.5px solid ${C.purple}` : `1px solid ${C.border}`, background: tab === 'overview' ? C.purple : C.surface, color: tab === 'overview' ? '#fff' : C.muted, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                All Reviews
              </button>
              {isManager && (
                <button onClick={() => setTab('create')}
                  style={{ padding: '7px 18px', borderRadius: 8, border: tab === 'create' ? `1.5px solid ${C.green}` : `1px solid ${C.border}`, background: tab === 'create' ? C.green : C.surface, color: tab === 'create' ? '#fff' : C.muted, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                  + New Review
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 32px' }}>
        {msg && <div style={{ padding: '10px 16px', borderRadius: 8, marginBottom: 16, background: msg.ok ? `${C.green}12` : `${C.red}12`, border: `1px solid ${msg.ok ? C.green : C.red}30`, color: msg.ok ? C.green : C.red, fontSize: 13, fontWeight: 600 }}>{msg.text}</div>}

        {/* ══════════ OVERVIEW TAB ══════════ */}
        {tab === 'overview' && (
          <>
            {/* Filters */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
                style={{ padding: '7px 12px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 12, fontFamily: 'inherit', color: C.muted, background: C.surface }}>
                <option value="all">All Statuses</option>
                {Object.entries(STATUS_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
              <select value={filterPeriod} onChange={e => setFilterPeriod(e.target.value)}
                style={{ padding: '7px 12px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 12, fontFamily: 'inherit', color: C.muted, background: C.surface }}>
                <option value="all">All Periods</option>
                {periods.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>

            {/* Stats */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
              {Object.entries(STATUS_MAP).map(([key, { label, color }]) => {
                const count = reviews.filter(r => r.status === key).length
                return (
                  <div key={key} style={{ padding: '16px 18px', borderRadius: 10, background: C.surface, border: `1px solid ${C.border}` }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, marginBottom: 4 }}>{label}</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color }}>{count}</div>
                  </div>
                )
              })}
            </div>

            {loading && <div style={{ padding: 40, textAlign: 'center', color: C.muted }}>Loading...</div>}

            {!loading && filtered.length === 0 && (
              <div style={{ textAlign: 'center', padding: 48, background: C.surface, borderRadius: 12, border: `1px solid ${C.border}` }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>No reviews found</div>
                <div style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>{isManager ? 'Click "+ New Review" to start a performance review cycle' : 'No reviews have been submitted for your team yet'}</div>
              </div>
            )}

            {filtered.length > 0 && (
              <div style={{ background: C.surface, borderRadius: 12, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#F8FAFB' }}>
                      {['Staff', 'Department', 'Period', 'Rating', 'KPI %', 'Status', 'Date', ''].map(h => (
                        <th key={h} style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, color: C.muted, textAlign: 'left', borderBottom: `1px solid ${C.border}` }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(r => {
                      const s = STATUS_MAP[r.status] ?? STATUS_MAP.draft
                      return (
                        <tr key={r.id} style={{ borderBottom: `1px solid ${C.border}08`, cursor: 'pointer' }} onClick={() => setSelectedReview(r)}>
                          <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 700, color: C.text }}>{r.staff?.name ?? '—'}</td>
                          <td style={{ padding: '10px 14px', fontSize: 12, color: C.muted }}>{r.staff?.department ?? '—'}</td>
                          <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 600, color: C.text }}>{r.review_period}</td>
                          <td style={{ padding: '10px 14px' }}>
                            {r.overall_rating ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span style={{ fontSize: 14, fontWeight: 800, color: RATING_COLORS[r.overall_rating] ?? C.muted }}>{r.overall_rating}</span>
                                <span style={{ fontSize: 11, color: C.muted }}>{RATING_LABELS[r.overall_rating]}</span>
                              </div>
                            ) : <span style={{ fontSize: 12, color: C.border }}>—</span>}
                          </td>
                          <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 700, color: r.kpi_score ? (r.kpi_score >= 80 ? C.green : r.kpi_score >= 50 ? C.amber : C.red) : C.border }}>{r.kpi_score ? `${r.kpi_score}%` : '—'}</td>
                          <td style={{ padding: '10px 14px' }}>
                            <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: `${s.color}12`, color: s.color }}>{s.label}</span>
                          </td>
                          <td style={{ padding: '10px 14px', fontSize: 12, color: C.muted }}>{r.review_date ?? '—'}</td>
                          <td style={{ padding: '10px 14px' }}>
                            <svg width="14" height="14" fill="none" stroke={C.muted} strokeWidth="2" viewBox="0 0 24 24"><path d="M9 18l6-6-6-6"/></svg>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* ══════════ CREATE TAB ══════════ */}
        {tab === 'create' && isManager && (
          <div style={{ maxWidth: 640, background: C.surface, borderRadius: 12, border: `1px solid ${C.border}`, padding: 28 }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: C.text, marginBottom: 20 }}>New Performance Review</div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: C.muted }}>
                Staff Member
                <select value={fStaff} onChange={e => setFStaff(e.target.value)}
                  style={{ display: 'block', width: '100%', marginTop: 4, padding: '8px 10px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, fontFamily: 'inherit', color: C.text, background: C.surface }}>
                  <option value="">Select...</option>
                  {staff.map(s => <option key={s.id} value={s.id}>{s.name} ({s.department ?? 'No dept'})</option>)}
                </select>
              </label>
              <label style={{ fontSize: 12, fontWeight: 700, color: C.muted }}>
                Review Period
                <select value={fPeriod} onChange={e => setFPeriod(e.target.value)}
                  style={{ display: 'block', width: '100%', marginTop: 4, padding: '8px 10px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, fontFamily: 'inherit', color: C.text, background: C.surface }}>
                  {['Q1 2026', 'Q2 2026', 'Q3 2026', 'Q4 2026', 'H1 2026', 'H2 2026', 'Annual 2026'].map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </label>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: C.muted }}>
                Review Date
                <input type="date" value={fDate} onChange={e => setFDate(e.target.value)}
                  style={{ display: 'block', width: '100%', marginTop: 4, padding: '8px 10px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, fontFamily: 'inherit', color: C.text, boxSizing: 'border-box' }} />
              </label>
              <label style={{ fontSize: 12, fontWeight: 700, color: C.muted }}>
                Overall Rating (1-5)
                <select value={fRating} onChange={e => setFRating(Number(e.target.value))}
                  style={{ display: 'block', width: '100%', marginTop: 4, padding: '8px 10px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, fontFamily: 'inherit', color: RATING_COLORS[fRating], background: C.surface, fontWeight: 700 }}>
                  {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n} — {RATING_LABELS[n]}</option>)}
                </select>
              </label>
              <label style={{ fontSize: 12, fontWeight: 700, color: C.muted }}>
                KPI Score (%)
                <input type="number" min="0" max="200" value={fKpi} onChange={e => setFKpi(e.target.value)} placeholder="e.g. 85"
                  style={{ display: 'block', width: '100%', marginTop: 4, padding: '8px 10px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, fontFamily: 'inherit', color: C.text, boxSizing: 'border-box' }} />
              </label>
            </div>

            {/* Rating visual */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
              {[1, 2, 3, 4, 5].map(n => (
                <button key={n} onClick={() => setFRating(n)}
                  style={{ flex: 1, padding: '10px 0', borderRadius: 8, border: fRating === n ? `2px solid ${RATING_COLORS[n]}` : `1px solid ${C.border}`, background: fRating === n ? `${RATING_COLORS[n]}10` : C.surface, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'center' }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: RATING_COLORS[n] }}>{n}</div>
                  <div style={{ fontSize: 10, fontWeight: 600, color: fRating === n ? RATING_COLORS[n] : C.muted, marginTop: 2 }}>{RATING_LABELS[n]}</div>
                </button>
              ))}
            </div>

            {[
              { label: 'Strengths', value: fStrengths, set: setFStrengths, placeholder: 'Key strengths demonstrated this period...' },
              { label: 'Areas to Improve', value: fImprove, set: setFImprove, placeholder: 'Areas where improvement is needed...' },
              { label: 'Goals for Next Period', value: fGoals, set: setFGoals, placeholder: 'Key objectives and targets...' },
              { label: 'Reviewer Comments', value: fComments, set: setFComments, placeholder: 'Additional notes...' },
            ].map(f => (
              <label key={f.label} style={{ display: 'block', fontSize: 12, fontWeight: 700, color: C.muted, marginBottom: 14 }}>
                {f.label}
                <textarea value={f.value} onChange={e => f.set(e.target.value)} rows={3} placeholder={f.placeholder}
                  style={{ display: 'block', width: '100%', marginTop: 4, padding: '8px 10px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, fontFamily: 'inherit', color: C.text, resize: 'vertical', boxSizing: 'border-box' }} />
              </label>
            ))}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
              <button onClick={() => setTab('overview')} style={{ padding: '9px 18px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.surface, color: C.muted, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
              <button onClick={createReview} disabled={saving}
                style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: saving ? C.muted : C.muted, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                Save as Draft
              </button>
              <button onClick={async () => { await createReview(); /* status is draft by default */ }} disabled={saving}
                style={{ padding: '9px 24px', borderRadius: 8, border: 'none', background: saving ? C.muted : C.purple, color: '#fff', fontSize: 13, fontWeight: 700, cursor: saving ? 'wait' : 'pointer', fontFamily: 'inherit' }}>
                {saving ? 'Saving...' : 'Submit Review'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ══════════ REVIEW DETAIL MODAL ══════════ */}
      {selectedReview && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setSelectedReview(null)}>
          <div onClick={e => e.stopPropagation()} style={{ background: C.surface, borderRadius: 14, padding: 28, width: 560, maxHeight: '85vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 800, color: C.text }}>{selectedReview.staff?.name ?? 'Staff'}</div>
                <div style={{ fontSize: 13, color: C.muted }}>{selectedReview.staff?.department ?? '—'} · {selectedReview.review_period}</div>
              </div>
              <span style={{ fontSize: 12, fontWeight: 700, padding: '4px 10px', borderRadius: 6, background: `${(STATUS_MAP[selectedReview.status] ?? STATUS_MAP.draft).color}12`, color: (STATUS_MAP[selectedReview.status] ?? STATUS_MAP.draft).color }}>
                {(STATUS_MAP[selectedReview.status] ?? STATUS_MAP.draft).label}
              </span>
            </div>

            {/* Rating + KPI */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>
              <div style={{ padding: 16, borderRadius: 10, background: `${RATING_COLORS[selectedReview.overall_rating ?? 0] ?? C.muted}08`, border: `1px solid ${RATING_COLORS[selectedReview.overall_rating ?? 0] ?? C.border}20`, textAlign: 'center' }}>
                <div style={{ fontSize: 28, fontWeight: 800, color: RATING_COLORS[selectedReview.overall_rating ?? 0] ?? C.muted }}>{selectedReview.overall_rating ?? '—'}<span style={{ fontSize: 14, fontWeight: 600 }}>/5</span></div>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, marginTop: 4 }}>{RATING_LABELS[selectedReview.overall_rating ?? 0] || 'Not rated'}</div>
              </div>
              <div style={{ padding: 16, borderRadius: 10, background: '#F8FAFB', border: `1px solid ${C.border}`, textAlign: 'center' }}>
                <div style={{ fontSize: 28, fontWeight: 800, color: selectedReview.kpi_score ? (selectedReview.kpi_score >= 80 ? C.green : C.amber) : C.muted }}>{selectedReview.kpi_score ? `${selectedReview.kpi_score}%` : '—'}</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, marginTop: 4 }}>KPI Achievement</div>
              </div>
            </div>

            {/* Sections */}
            {[
              { label: 'Strengths', value: selectedReview.strengths, color: C.green },
              { label: 'Areas to Improve', value: selectedReview.areas_to_improve, color: C.amber },
              { label: 'Goals for Next Period', value: selectedReview.goals_next_period, color: C.blue },
              { label: 'Reviewer Comments', value: selectedReview.reviewer_comments, color: C.purple },
              { label: 'Staff Comments', value: selectedReview.staff_comments, color: C.muted },
            ].filter(s => s.value).map(s => (
              <div key={s.label} style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: s.color, marginBottom: 4 }}>{s.label}</div>
                <div style={{ fontSize: 13, color: C.text, lineHeight: 1.6, padding: '10px 14px', borderRadius: 8, background: '#F8FAFB', border: `1px solid ${C.border}` }}>{s.value}</div>
              </div>
            ))}

            {/* Actions */}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20, borderTop: `1px solid ${C.border}`, paddingTop: 16 }}>
              <button onClick={() => setSelectedReview(null)} style={{ padding: '8px 16px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.surface, color: C.muted, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Close</button>
              {selectedReview.status === 'draft' && (
                <button onClick={() => updateStatus(selectedReview.id, 'submitted')} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: C.blue, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Submit</button>
              )}
              {selectedReview.status === 'submitted' && (
                <button onClick={() => updateStatus(selectedReview.id, 'acknowledged')} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: C.amber, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Acknowledge</button>
              )}
              {selectedReview.status === 'acknowledged' && (
                <button onClick={() => updateStatus(selectedReview.id, 'completed')} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: C.green, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Mark Complete</button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
