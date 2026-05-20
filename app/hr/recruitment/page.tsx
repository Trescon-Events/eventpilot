'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

const C = {
  bg:      '#F6F8FB',
  surface: '#FFFFFF',
  border:  '#DDE8EE',
  text:    '#0F1923',
  muted:   '#5B7080',
  green:   '#00897B',
  amber:   '#D97706',
  red:     '#8B1A1A',
  purple:  '#6C54B5',
  blue:    '#1D4ED8',
}

/* ── Types ───────────────────────────────────────────────────────────── */
type Requisition = {
  id: string; title: string; department: string | null; location: string | null
  employment_type: string; headcount: number; status: string
  description: string | null; requirements: string | null
  salary_min: number | null; salary_max: number | null; currency: string
  opened_at: string; created_at: string
  hiring_manager: { id: string; name: string; department: string } | null
}

type Application = {
  id: string; stage: string; ai_score: number | null; ai_recommendation: string | null
  applied_at: string; stage_updated_at: string; notes: string | null
  ai_strengths: string[] | null; ai_gaps: string[] | null
  candidate: { id: string; full_name: string; email: string; phone: string | null; source: string; resume_url: string | null } | null
  interviews: { id: string; round_number: number; round_type: string; status: string; scheduled_at: string | null; overall_rating: number | null }[]
}

type KanbanData = {
  apps: Application[]
  grouped: Record<string, Application[]>
  stage_order: string[]
}

/* ── Stage config ────────────────────────────────────────────────────── */
const STAGES: Record<string, { label: string; color: string; description: string }> = {
  applied:          { label: 'Applied',        color: C.muted,   description: 'New applications' },
  ai_screening:     { label: 'AI Screening',   color: C.blue,    description: 'Being analysed' },
  shortlisted:      { label: 'Shortlisted',    color: C.purple,  description: 'AI approved' },
  interview_r1:     { label: 'Interview R1',   color: C.amber,   description: 'First round' },
  interview_r2:     { label: 'Interview R2',   color: C.amber,   description: 'Second round' },
  interview_final:  { label: 'Final Round',    color: C.amber,   description: 'Final interview' },
  offer:            { label: 'Offer',          color: C.green,   description: 'Offer extended' },
  hired:            { label: 'Hired',          color: C.green,   description: 'Joined' },
  rejected:         { label: 'Rejected',       color: C.red,     description: 'Not proceeding' },
  withdrawn:        { label: 'Withdrawn',      color: C.muted,   description: 'Candidate withdrew' },
}

const ACTIVE_STAGES = ['applied', 'ai_screening', 'shortlisted', 'interview_r1', 'interview_r2', 'interview_final', 'offer']

function pill(color: string, text: string) {
  return (
    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 700, background: color + '20', color, letterSpacing: '0.3px' }}>
      {text}
    </span>
  )
}

function scoreBar(score: number, rec: string | null) {
  const color = rec === 'shortlist' ? C.green : rec === 'reject' ? C.red : C.amber
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
      <div style={{ flex: 1, height: '4px', background: C.border, borderRadius: '2px', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${score}%`, background: color, borderRadius: '2px' }} />
      </div>
      <span style={{ fontSize: '12px', fontWeight: 800, color, minWidth: '30px', textAlign: 'right' }}>{score}</span>
    </div>
  )
}

/* ── Candidate card ──────────────────────────────────────────────────── */
function CandidateCard({ app, onMove, onScreen, onView }: {
  app: Application
  onMove: (appId: string, stage: string) => void
  onScreen: (appId: string) => void
  onView: (app: Application) => void
}) {
  const [acting, setActing] = useState(false)
  const stage = STAGES[app.stage]
  const nextInterview = app.interviews?.find(i => i.status === 'scheduled')
  const latestRound   = app.interviews?.sort((a, b) => b.round_number - a.round_number)[0]

  // Needs action: applied with no AI score yet
  const needsScreen = app.stage === 'applied' && app.ai_score == null
  // Offer stage: awaiting decision
  const awaitingDecision = app.stage === 'offer'

  return (
    <div
      onClick={() => onView(app)}
      style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '12px', padding: '14px', cursor: 'pointer', transition: 'box-shadow 0.15s' }}
      onMouseOver={e => (e.currentTarget.style.boxShadow = '0 2px 12px rgba(0,0,0,0.08)')}
      onMouseOut={e  => (e.currentTarget.style.boxShadow = 'none')}
    >
      {/* Name + source */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          {needsScreen && (
            <span style={{ color: C.amber, fontSize: '12px', lineHeight: 1, flexShrink: 0 }}>●</span>
          )}
          {awaitingDecision && (
            <span style={{ color: C.green, fontSize: '12px', lineHeight: 1, flexShrink: 0, animation: 'pulse 1.5s ease-in-out infinite' }}>●</span>
          )}
          <div style={{ fontSize: '13px', fontWeight: 800, color: C.text }}>{app.candidate?.full_name}</div>
        </div>
        {pill(C.muted, app.candidate?.source ?? 'direct')}
      </div>

      {awaitingDecision && (
        <div style={{ fontSize: '11px', color: C.green, fontWeight: 700, marginBottom: '6px' }}>Awaiting decision</div>
      )}

      <div style={{ fontSize: '12px', color: C.muted, marginBottom: '10px' }}>{app.candidate?.email}</div>

      {/* AI score */}
      {app.ai_score != null && (
        <div style={{ marginBottom: '8px' }}>
          {scoreBar(app.ai_score, app.ai_recommendation)}
          {app.ai_strengths && app.ai_strengths.length > 0 && (
            <div style={{ fontSize: '11px', color: C.muted, marginTop: '4px' }}>
              {app.ai_strengths.slice(0, 2).join(' · ')}
            </div>
          )}
        </div>
      )}

      {/* Interview status */}
      {latestRound && (
        <div style={{ fontSize: '11px', color: C.muted, marginBottom: '8px' }}>
          R{latestRound.round_number} {latestRound.round_type}
          {latestRound.overall_rating ? ` · ${latestRound.overall_rating}/5` : ''}
          {nextInterview?.scheduled_at ? ` · ${new Date(nextInterview.scheduled_at).toLocaleDateString()}` : ''}
        </div>
      )}

      {/* Applied date */}
      <div style={{ fontSize: '11px', color: C.muted, borderTop: `1px solid ${C.border}`, paddingTop: '8px', marginTop: '8px' }}>
        Applied {new Date(app.applied_at).toLocaleDateString()}
      </div>

      {/* Quick actions */}
      <div onClick={e => e.stopPropagation()} style={{ display: 'flex', gap: '6px', marginTop: '8px', flexWrap: 'wrap' }}>
        {/* "Screen now" is the FIRST and most prominent action when needs screening */}
        {needsScreen && (
          <button
            disabled={acting}
            onClick={async () => { setActing(true); await onScreen(app.id); setActing(false) }}
            style={{ padding: '5px 12px', borderRadius: '6px', background: C.amber, color: '#fff', fontSize: '11px', fontWeight: 700, border: 'none', cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>
            Screen now
          </button>
        )}
        {/* Regular AI Screen button for applied with no score (non-needsScreen path handled above) */}
        {app.stage === 'applied' && !needsScreen && (
          <button
            disabled={acting}
            onClick={async () => { setActing(true); await onScreen(app.id); setActing(false) }}
            style={{ padding: '4px 10px', borderRadius: '6px', background: C.purple + '15', color: C.purple, fontSize: '11px', fontWeight: 700, border: `1px solid ${C.purple}30`, cursor: 'pointer', fontFamily: 'inherit' }}>
            AI Screen
          </button>
        )}
        {app.stage === 'shortlisted' && (
          <button
            disabled={acting}
            onClick={async () => { setActing(true); await onMove(app.id, 'interview_r1'); setActing(false) }}
            style={{ padding: '4px 10px', borderRadius: '6px', background: C.amber + '15', color: C.amber, fontSize: '11px', fontWeight: 700, border: `1px solid ${C.amber}30`, cursor: 'pointer', fontFamily: 'inherit' }}>
            Schedule R1
          </button>
        )}
        {(app.stage === 'interview_r1' || app.stage === 'interview_r2') && (
          <button
            disabled={acting}
            onClick={async () => {
              setActing(true)
              const next = app.stage === 'interview_r1' ? 'interview_r2' : 'interview_final'
              await onMove(app.id, next)
              setActing(false)
            }}
            style={{ padding: '4px 10px', borderRadius: '6px', background: C.amber + '15', color: C.amber, fontSize: '11px', fontWeight: 700, border: `1px solid ${C.amber}30`, cursor: 'pointer', fontFamily: 'inherit' }}>
            Next Round
          </button>
        )}
        {app.stage === 'interview_final' && (
          <button
            disabled={acting}
            onClick={async () => { setActing(true); await onMove(app.id, 'offer'); setActing(false) }}
            style={{ padding: '4px 10px', borderRadius: '6px', background: C.green + '15', color: C.green, fontSize: '11px', fontWeight: 700, border: `1px solid ${C.green}30`, cursor: 'pointer', fontFamily: 'inherit' }}>
            Send Offer
          </button>
        )}
        <button
          disabled={acting}
          onClick={async () => { setActing(true); await onMove(app.id, 'rejected'); setActing(false) }}
          style={{ padding: '4px 10px', borderRadius: '6px', background: C.red + '10', color: C.red, fontSize: '11px', fontWeight: 700, border: `1px solid ${C.red}20`, cursor: 'pointer', fontFamily: 'inherit' }}>
          Reject
        </button>
      </div>
    </div>
  )
}

/* ── Application detail drawer ───────────────────────────────────────── */
function AppDrawer({ app, staffList, onClose, onHire, onAddInterview, onRefresh }: {
  app: Application
  staffList: { id: string; name: string; department: string | null }[]
  onClose: () => void
  onHire: (appId: string) => void
  onAddInterview: (appId: string, interviewerId: string | null, type: string, scheduled_at: string) => Promise<void>
  onRefresh: () => void
}) {
  const [interviewForm, setInterviewForm] = useState({ type: 'screening', interviewer_id: '', scheduled_at: '' })
  const [feedbackForm,  setFeedbackForm]  = useState({ round_id: '', rating_comm: 0, rating_tech: 0, rating_culture: 0, rating_ps: 0, overall: 0, strengths: '', concerns: '', recommendation: 'advance', notes: '' })
  const [busy, setBusy] = useState(false)
  const [feedbackOpen, setFeedbackOpen] = useState<string | null>(null)

  const candidate = app.candidate

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex' }}>
      {/* Backdrop */}
      <div onClick={onClose} style={{ flex: 1, background: 'rgba(0,0,0,0.35)' }} />

      {/* Panel */}
      <div style={{ width: '520px', background: C.surface, overflowY: 'auto', borderLeft: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', fontFamily: 'system-ui, sans-serif' }}>
        {/* Header */}
        <div style={{ padding: '24px 24px 0', borderBottom: `1px solid ${C.border}`, paddingBottom: '20px', position: 'sticky', top: 0, background: C.surface, zIndex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: '20px', fontWeight: 800, color: C.text }}>{candidate?.full_name}</div>
              <div style={{ fontSize: '13px', color: C.muted, marginTop: '2px' }}>{candidate?.email}</div>
              {candidate?.phone && <div style={{ fontSize: '12px', color: C.muted }}>{candidate.phone}</div>}
            </div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: C.muted, fontFamily: 'inherit' }}>×</button>
          </div>
          <div style={{ display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap' }}>
            {pill(STAGES[app.stage]?.color ?? C.muted, STAGES[app.stage]?.label ?? app.stage)}
            {pill(C.muted, candidate?.source ?? 'direct')}
            {app.ai_score != null && pill(app.ai_recommendation === 'shortlist' ? C.green : app.ai_recommendation === 'reject' ? C.red : C.amber, `AI: ${app.ai_score}/100`)}
          </div>
        </div>

        <div style={{ padding: '24px', flex: 1 }}>
          {/* AI Summary */}
          {app.ai_score != null && (
            <div style={{ background: C.bg, borderRadius: '12px', padding: '16px', marginBottom: '20px', border: `1px solid ${C.border}` }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: C.purple, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '10px' }}>AI Analysis</div>
              <div style={{ marginBottom: '10px' }}>{scoreBar(app.ai_score, app.ai_recommendation)}</div>
              {app.ai_strengths && app.ai_strengths.length > 0 && (
                <div style={{ marginBottom: '8px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: C.green, marginBottom: '4px' }}>STRENGTHS</div>
                  {app.ai_strengths.map(s => <div key={s} style={{ fontSize: '12px', color: C.text, marginBottom: '2px' }}>· {s}</div>)}
                </div>
              )}
              {app.ai_gaps && app.ai_gaps.length > 0 && (
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: C.red, marginBottom: '4px' }}>GAPS</div>
                  {app.ai_gaps.map(g => <div key={g} style={{ fontSize: '12px', color: C.text, marginBottom: '2px' }}>· {g}</div>)}
                </div>
              )}
            </div>
          )}

          {/* Interview rounds */}
          {app.interviews && app.interviews.length > 0 && (
            <div style={{ marginBottom: '20px' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '10px' }}>Interview Rounds</div>
              {[...app.interviews].sort((a, b) => a.round_number - b.round_number).map(round => (
                <div key={round.id} style={{ border: `1px solid ${C.border}`, borderRadius: '10px', padding: '12px 14px', marginBottom: '8px', background: C.bg }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: C.text }}>R{round.round_number} — {round.round_type.replace('_', ' ')}</div>
                    {round.overall_rating && <div style={{ fontSize: '14px', fontWeight: 800, color: C.amber }}>{round.overall_rating}/5</div>}
                  </div>
                  {round.scheduled_at && <div style={{ fontSize: '12px', color: C.muted }}>{new Date(round.scheduled_at).toLocaleString()}</div>}
                  {pill(round.status === 'completed' ? C.green : C.amber, round.status)}

                  {round.status !== 'completed' && (
                    <button onClick={() => setFeedbackOpen(feedbackOpen === round.id ? null : round.id)}
                      style={{ marginTop: '8px', padding: '4px 10px', borderRadius: '6px', background: C.green + '15', color: C.green, fontSize: '11px', fontWeight: 700, border: `1px solid ${C.green}30`, cursor: 'pointer', fontFamily: 'inherit' }}>
                      Add Feedback
                    </button>
                  )}

                  {feedbackOpen === round.id && (
                    <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {[
                        ['Communication',    'rating_comm',    feedbackForm.rating_comm],
                        ['Technical',        'rating_tech',    feedbackForm.rating_tech],
                        ['Culture Fit',      'rating_culture', feedbackForm.rating_culture],
                        ['Problem Solving',  'rating_ps',      feedbackForm.rating_ps],
                        ['Overall',          'overall',        feedbackForm.overall],
                      ].map(([label, key, val]) => (
                        <div key={key as string} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div style={{ fontSize: '12px', color: C.muted, width: '120px', flexShrink: 0 }}>{label}</div>
                          <div style={{ display: 'flex', gap: '4px' }}>
                            {[1,2,3,4,5].map(n => (
                              <button key={n} onClick={() => setFeedbackForm(f => ({ ...f, [key as string]: n }))}
                                style={{ width: '28px', height: '28px', borderRadius: '6px', border: `1px solid ${(val as number) >= n ? C.amber : C.border}`, background: (val as number) >= n ? C.amber : C.surface, color: (val as number) >= n ? '#fff' : C.muted, fontSize: '12px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                                {n}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                      <textarea placeholder="Strengths" value={feedbackForm.strengths} onChange={e => setFeedbackForm(f => ({ ...f, strengths: e.target.value }))}
                        style={{ padding: '8px', borderRadius: '8px', border: `1px solid ${C.border}`, fontSize: '12px', fontFamily: 'inherit', resize: 'vertical', minHeight: '60px', color: C.text }} />
                      <textarea placeholder="Concerns" value={feedbackForm.concerns} onChange={e => setFeedbackForm(f => ({ ...f, concerns: e.target.value }))}
                        style={{ padding: '8px', borderRadius: '8px', border: `1px solid ${C.border}`, fontSize: '12px', fontFamily: 'inherit', resize: 'vertical', minHeight: '60px', color: C.text }} />
                      <select value={feedbackForm.recommendation} onChange={e => setFeedbackForm(f => ({ ...f, recommendation: e.target.value }))}
                        style={{ padding: '8px', borderRadius: '8px', border: `1px solid ${C.border}`, fontSize: '12px', fontFamily: 'inherit', color: C.text }}>
                        <option value="advance">Advance to next round</option>
                        <option value="hold">Hold / discuss</option>
                        <option value="reject">Reject</option>
                      </select>
                      <button disabled={busy || feedbackForm.overall === 0}
                        onClick={async () => {
                          setBusy(true)
                          await fetch('/api/hr/recruitment/interviews', {
                            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              id: round.id, status: 'completed',
                              rating_communication: feedbackForm.rating_comm || null,
                              rating_technical: feedbackForm.rating_tech || null,
                              rating_culture_fit: feedbackForm.rating_culture || null,
                              rating_problem_solving: feedbackForm.rating_ps || null,
                              overall_rating: feedbackForm.overall || null,
                              strengths: feedbackForm.strengths || null,
                              concerns: feedbackForm.concerns || null,
                              recommendation: feedbackForm.recommendation,
                              feedback_notes: feedbackForm.notes || null,
                            }),
                          })
                          setFeedbackOpen(null)
                          setBusy(false)
                          onRefresh()
                        }}
                        style={{ padding: '8px 16px', borderRadius: '8px', background: C.green, color: '#fff', fontSize: '12px', fontWeight: 700, border: 'none', cursor: 'pointer', fontFamily: 'inherit', opacity: busy ? 0.6 : 1 }}>
                        Submit Feedback
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Schedule interview */}
          {ACTIVE_STAGES.includes(app.stage) && app.stage !== 'offer' && (
            <div style={{ background: C.bg, borderRadius: '12px', padding: '16px', marginBottom: '20px', border: `1px solid ${C.border}` }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '12px' }}>Schedule Interview</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                <div>
                  <div style={{ fontSize: '11px', color: C.muted, fontWeight: 700, marginBottom: '4px' }}>Round Type</div>
                  <select value={interviewForm.type} onChange={e => setInterviewForm(f => ({ ...f, type: e.target.value }))}
                    style={{ width: '100%', padding: '8px', borderRadius: '8px', border: `1px solid ${C.border}`, fontSize: '12px', fontFamily: 'inherit', color: C.text, background: C.surface }}>
                    {['screening', 'technical', 'cultural', 'managerial', 'hr', 'final'].map(t => (
                      <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: C.muted, fontWeight: 700, marginBottom: '4px' }}>Date & Time</div>
                  <input type="datetime-local" value={interviewForm.scheduled_at} onChange={e => setInterviewForm(f => ({ ...f, scheduled_at: e.target.value }))}
                    style={{ width: '100%', padding: '8px', borderRadius: '8px', border: `1px solid ${C.border}`, fontSize: '12px', fontFamily: 'inherit', color: C.text, background: C.surface, boxSizing: 'border-box' }} />
                </div>
              </div>
              <div style={{ marginBottom: '10px' }}>
                <div style={{ fontSize: '11px', color: C.muted, fontWeight: 700, marginBottom: '4px' }}>Interviewer</div>
                <select value={interviewForm.interviewer_id} onChange={e => setInterviewForm(f => ({ ...f, interviewer_id: e.target.value }))}
                  style={{ width: '100%', padding: '8px', borderRadius: '8px', border: `1px solid ${C.border}`, fontSize: '12px', fontFamily: 'inherit', color: C.text, background: C.surface }}>
                  <option value="">Select interviewer</option>
                  {staffList.map(s => <option key={s.id} value={s.id}>{s.name}{s.department ? ` — ${s.department}` : ''}</option>)}
                </select>
              </div>
              <button disabled={busy || !interviewForm.scheduled_at}
                onClick={async () => {
                  setBusy(true)
                  await onAddInterview(app.id, interviewForm.interviewer_id || null, interviewForm.type, interviewForm.scheduled_at)
                  setInterviewForm(f => ({ ...f, scheduled_at: '' }))
                  setBusy(false)
                  onRefresh()
                }}
                style={{ padding: '8px 16px', borderRadius: '8px', background: C.amber, color: '#fff', fontSize: '12px', fontWeight: 700, border: 'none', cursor: 'pointer', fontFamily: 'inherit', opacity: busy ? 0.6 : 1 }}>
                Schedule
              </button>
            </div>
          )}

          {/* Resume link */}
          {candidate?.resume_url && (
            <a href={candidate.resume_url} target="_blank" rel="noopener noreferrer"
              style={{ display: 'block', padding: '10px 14px', borderRadius: '10px', border: `1px solid ${C.border}`, background: C.bg, fontSize: '13px', fontWeight: 700, color: C.text, textDecoration: 'none', marginBottom: '16px', textAlign: 'center' }}>
              View Resume
            </a>
          )}

          {/* Hire button */}
          {(app.stage === 'offer' || app.stage === 'interview_final') && (
            <button disabled={busy}
              onClick={async () => { setBusy(true); await onHire(app.id); setBusy(false) }}
              style={{ width: '100%', padding: '14px', borderRadius: '10px', background: C.green, color: '#fff', fontSize: '14px', fontWeight: 800, border: 'none', cursor: 'pointer', fontFamily: 'inherit', opacity: busy ? 0.6 : 1 }}>
              Mark as Hired — Create Staff Record
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

/* ── Add Candidate Modal ──────────────────────────────────────────────── */
function AddCandidateModal({ requisitionId, onClose, onSave }: {
  requisitionId: string
  onClose: () => void
  onSave: () => void
}) {
  const [form, setForm] = useState({ full_name: '', email: '', phone: '', source: 'direct', resume_url: '', notes: '' })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  async function submit() {
    setSaving(true); setErr('')
    const res  = await fetch('/api/hr/recruitment/applications', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, requisition_id: requisitionId }),
    })
    const data = await res.json()
    if (!res.ok) { setErr(data.error ?? 'Failed'); setSaving(false); return }
    onSave()
    onClose()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.4)' }}>
      <div style={{ background: C.surface, borderRadius: '20px', padding: '32px', width: '480px', maxWidth: '90vw', fontFamily: 'system-ui, sans-serif' }}>
        <div style={{ fontSize: '18px', fontWeight: 800, color: C.text, marginBottom: '24px' }}>Add Candidate</div>

        {[
          { label: 'Full Name *',    key: 'full_name',  type: 'text' },
          { label: 'Email *',        key: 'email',      type: 'email' },
          { label: 'Phone',          key: 'phone',      type: 'tel' },
          { label: 'Resume URL',     key: 'resume_url', type: 'url' },
        ].map(({ label, key, type }) => (
          <div key={key} style={{ marginBottom: '14px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '6px' }}>{label}</div>
            <input type={type} value={form[key as keyof typeof form]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
              style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: `1px solid ${C.border}`, fontSize: '13px', fontFamily: 'inherit', color: C.text, boxSizing: 'border-box' }} />
          </div>
        ))}

        <div style={{ marginBottom: '14px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '6px' }}>Source</div>
          <select value={form.source} onChange={e => setForm(f => ({ ...f, source: e.target.value }))}
            style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: `1px solid ${C.border}`, fontSize: '13px', fontFamily: 'inherit', color: C.text }}>
            {['direct', 'linkedin', 'referral', 'agency', 'website'].map(s => (
              <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
            ))}
          </select>
        </div>

        {err && <div style={{ fontSize: '13px', color: C.red, marginBottom: '12px' }}>{err}</div>}

        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '10px 20px', borderRadius: '10px', background: C.bg, border: `1px solid ${C.border}`, fontSize: '13px', fontWeight: 700, color: C.muted, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
          <button disabled={saving || !form.full_name || !form.email} onClick={submit}
            style={{ padding: '10px 20px', borderRadius: '10px', background: C.green, color: '#fff', fontSize: '13px', fontWeight: 700, border: 'none', cursor: 'pointer', fontFamily: 'inherit', opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Adding…' : 'Add Candidate'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── New Requisition Modal ────────────────────────────────────────────── */
function NewRequisitionModal({ staffList, onClose, onSave }: {
  staffList: { id: string; name: string }[]
  onClose: () => void
  onSave: () => void
}) {
  const [form, setForm] = useState({ title: '', department: '', location: '', employment_type: 'full_time', headcount: '1', description: '', requirements: '', salary_min: '', salary_max: '', currency: 'AED', hiring_manager_id: '' })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  async function submit() {
    setSaving(true); setErr('')
    const res  = await fetch('/api/hr/recruitment/requisitions', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, headcount: parseInt(form.headcount) || 1, salary_min: form.salary_min ? parseFloat(form.salary_min) : null, salary_max: form.salary_max ? parseFloat(form.salary_max) : null, hiring_manager_id: form.hiring_manager_id || null }),
    })
    const data = await res.json()
    if (!res.ok) { setErr(data.error ?? 'Failed'); setSaving(false); return }
    onSave()
    onClose()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.4)' }}>
      <div style={{ background: C.surface, borderRadius: '20px', padding: '32px', width: '560px', maxWidth: '90vw', maxHeight: '85vh', overflowY: 'auto', fontFamily: 'system-ui, sans-serif' }}>
        <div style={{ fontSize: '18px', fontWeight: 800, color: C.text, marginBottom: '24px' }}>Open New Position</div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
          <div style={{ gridColumn: '1/-1' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '6px' }}>Job Title *</div>
            <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: `1px solid ${C.border}`, fontSize: '13px', fontFamily: 'inherit', color: C.text, boxSizing: 'border-box' }} />
          </div>
          {[
            { label: 'Department', key: 'department' },
            { label: 'Location',   key: 'location'   },
          ].map(({ label, key }) => (
            <div key={key}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '6px' }}>{label}</div>
              <input value={form[key as keyof typeof form]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: `1px solid ${C.border}`, fontSize: '13px', fontFamily: 'inherit', color: C.text, boxSizing: 'border-box' }} />
            </div>
          ))}
          <div>
            <div style={{ fontSize: '11px', fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '6px' }}>Type</div>
            <select value={form.employment_type} onChange={e => setForm(f => ({ ...f, employment_type: e.target.value }))}
              style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: `1px solid ${C.border}`, fontSize: '13px', fontFamily: 'inherit', color: C.text }}>
              {['full_time', 'part_time', 'contract', 'intern'].map(t => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
            </select>
          </div>
          <div>
            <div style={{ fontSize: '11px', fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '6px' }}>Headcount</div>
            <input type="number" min="1" value={form.headcount} onChange={e => setForm(f => ({ ...f, headcount: e.target.value }))}
              style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: `1px solid ${C.border}`, fontSize: '13px', fontFamily: 'inherit', color: C.text, boxSizing: 'border-box' }} />
          </div>
          <div>
            <div style={{ fontSize: '11px', fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '6px' }}>Salary Min</div>
            <input type="number" value={form.salary_min} onChange={e => setForm(f => ({ ...f, salary_min: e.target.value }))}
              style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: `1px solid ${C.border}`, fontSize: '13px', fontFamily: 'inherit', color: C.text, boxSizing: 'border-box' }} />
          </div>
          <div>
            <div style={{ fontSize: '11px', fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '6px' }}>Salary Max</div>
            <input type="number" value={form.salary_max} onChange={e => setForm(f => ({ ...f, salary_max: e.target.value }))}
              style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: `1px solid ${C.border}`, fontSize: '13px', fontFamily: 'inherit', color: C.text, boxSizing: 'border-box' }} />
          </div>
          <div style={{ gridColumn: '1/-1' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '6px' }}>Hiring Manager</div>
            <select value={form.hiring_manager_id} onChange={e => setForm(f => ({ ...f, hiring_manager_id: e.target.value }))}
              style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: `1px solid ${C.border}`, fontSize: '13px', fontFamily: 'inherit', color: C.text }}>
              <option value="">None</option>
              {staffList.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div style={{ gridColumn: '1/-1' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '6px' }}>Job Description</div>
            <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={4}
              style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: `1px solid ${C.border}`, fontSize: '13px', fontFamily: 'inherit', color: C.text, resize: 'vertical', boxSizing: 'border-box' }} />
          </div>
          <div style={{ gridColumn: '1/-1' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '6px' }}>Requirements</div>
            <textarea value={form.requirements} onChange={e => setForm(f => ({ ...f, requirements: e.target.value }))} rows={4} placeholder="Experience, skills, qualifications..."
              style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: `1px solid ${C.border}`, fontSize: '13px', fontFamily: 'inherit', color: C.text, resize: 'vertical', boxSizing: 'border-box' }} />
          </div>
        </div>

        {err && <div style={{ fontSize: '13px', color: C.red, marginTop: '12px' }}>{err}</div>}

        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '20px' }}>
          <button onClick={onClose} style={{ padding: '10px 20px', borderRadius: '10px', background: C.bg, border: `1px solid ${C.border}`, fontSize: '13px', fontWeight: 700, color: C.muted, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
          <button disabled={saving || !form.title} onClick={submit}
            style={{ padding: '10px 20px', borderRadius: '10px', background: C.green, color: '#fff', fontSize: '13px', fontWeight: 700, border: 'none', cursor: 'pointer', fontFamily: 'inherit', opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Creating…' : 'Open Position'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── Main Page ───────────────────────────────────────────────────────── */
export default function RecruitmentPage() {
  const [requisitions,   setRequisitions]   = useState<Requisition[]>([])
  const [activeReqId,    setActiveReqId]    = useState<string | null>(null)
  const [kanban,         setKanban]         = useState<KanbanData | null>(null)
  const [staffList,      setStaffList]      = useState<{ id: string; name: string; department: string | null }[]>([])
  const [selectedApp,    setSelectedApp]    = useState<Application | null>(null)
  const [showNewReq,     setShowNewReq]     = useState(false)
  const [showAddCand,    setShowAddCand]    = useState(false)
  const [loading,        setLoading]        = useState(true)
  const [screening,      setScreening]      = useState<string | null>(null)
  const [screenMsg,      setScreenMsg]      = useState<Record<string, string>>({})
  const [reqFilter,      setReqFilter]      = useState<'open' | 'all'>('open')

  async function loadRequisitions() {
    const res  = await fetch(`/api/hr/recruitment/requisitions${reqFilter === 'open' ? '?status=open' : ''}`)
    const data = await res.json()
    const list = Array.isArray(data) ? data : []
    setRequisitions(list)
    if (list.length > 0 && !activeReqId) {
      setActiveReqId(list[0].id)
    }
    setLoading(false)
  }

  async function loadKanban(reqId: string) {
    const res  = await fetch(`/api/hr/recruitment/applications?requisition_id=${reqId}`)
    const data = await res.json()
    setKanban(data)
  }

  async function loadStaff() {
    const res  = await fetch('/api/staff-list')
    const data = await res.json()
    setStaffList(Array.isArray(data) ? data : [])
  }

  useEffect(() => { loadRequisitions(); loadStaff() }, [reqFilter])
  useEffect(() => { if (activeReqId) loadKanban(activeReqId) }, [activeReqId])

  async function moveStage(appId: string, stage: string) {
    await fetch('/api/hr/recruitment/applications', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: appId, stage }),
    })
    if (activeReqId) await loadKanban(activeReqId)
  }

  async function screenCandidate(appId: string) {
    setScreening(appId)
    setScreenMsg(m => ({ ...m, [appId]: 'Screening…' }))
    const res  = await fetch('/api/hr/recruitment/screen', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ application_id: appId, send_email: true }),
    })
    const data = await res.json()
    if (res.ok) {
      setScreenMsg(m => ({ ...m, [appId]: `Score: ${data.ai_score} — ${data.ai_recommendation}` }))
    } else {
      setScreenMsg(m => ({ ...m, [appId]: data.error ?? 'AI screen failed' }))
    }
    setScreening(null)
    if (activeReqId) await loadKanban(activeReqId)
  }

  async function addInterview(appId: string, interviewerId: string | null, type: string, scheduled_at: string) {
    await fetch('/api/hr/recruitment/interviews', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ application_id: appId, interviewer_id: interviewerId, round_type: type, scheduled_at }),
    })
    if (activeReqId) await loadKanban(activeReqId)
  }

  async function hireCandidate(appId: string) {
    const res  = await fetch('/api/hr/recruitment/hire', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ application_id: appId }),
    })
    const data = await res.json()
    if (res.ok) {
      setSelectedApp(null)
      if (activeReqId) await loadKanban(activeReqId)
      await loadRequisitions()
    } else {
      alert(data.error ?? 'Hire failed')
    }
  }

  async function refreshDrawer() {
    if (!selectedApp || !activeReqId) return
    await loadKanban(activeReqId)
    // Re-find the app in the refreshed kanban
    const res = await fetch(`/api/hr/recruitment/applications?requisition_id=${activeReqId}`)
    const data: KanbanData = await res.json()
    const updated = data.apps.find(a => a.id === selectedApp.id)
    if (updated) setSelectedApp(updated)
  }

  const activeReq = requisitions.find(r => r.id === activeReqId)
  const activeStages = kanban?.stage_order.filter(s => !['rejected', 'withdrawn', 'hired'].includes(s)) ?? []
  const totalActive  = kanban ? Object.entries(kanban.grouped).filter(([s]) => ACTIVE_STAGES.includes(s)).reduce((sum, [, apps]) => sum + apps.length, 0) : 0
  const totalHired   = kanban?.grouped['hired']?.length ?? 0
  const totalRejected = kanban?.grouped['rejected']?.length ?? 0

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: C.bg, fontFamily: 'system-ui, sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.muted, fontSize: '15px' }}>
        Loading recruitment pipeline...
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: 'system-ui, sans-serif' }}>
      {/* Header */}
      <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, padding: '0 32px', position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '60px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Link href="/hr" style={{ fontSize: '13px', color: C.muted, textDecoration: 'none', fontWeight: 600 }}>← HR Portal</Link>
            <span style={{ color: C.border, fontSize: '13px' }}>/</span>
            <Link href="/hr/recruitment" style={{ fontSize: '13px', color: C.muted, textDecoration: 'none', fontWeight: 600 }}>Recruitment</Link>
            {activeReq && (
              <>
                <span style={{ color: C.border, fontSize: '13px' }}>/</span>
                <span style={{ fontSize: '14px', fontWeight: 700, color: C.text }}>{activeReq.title}</span>
                {activeReq.department && (
                  <span style={{ fontSize: '12px', color: C.muted }}>{activeReq.department}</span>
                )}
              </>
            )}
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button onClick={() => setReqFilter(f => f === 'open' ? 'all' : 'open')}
              style={{ padding: '7px 14px', borderRadius: '8px', background: C.bg, border: `1px solid ${C.border}`, fontSize: '12px', fontWeight: 700, color: C.muted, cursor: 'pointer', fontFamily: 'inherit' }}>
              {reqFilter === 'open' ? 'Show All' : 'Open Only'}
            </button>
            {activeReqId && (
              <button onClick={() => setShowAddCand(true)}
                style={{ padding: '8px 16px', borderRadius: '10px', border: `1px solid ${C.border}`, fontSize: '13px', fontWeight: 700, color: C.text, background: C.surface, cursor: 'pointer', fontFamily: 'inherit' }}>
                + Add Candidate
              </button>
            )}
            <button onClick={() => setShowNewReq(true)}
              style={{ padding: '8px 16px', borderRadius: '10px', background: C.green, color: '#fff', fontSize: '13px', fontWeight: 700, border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
              + Open Position
            </button>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', height: 'calc(100vh - 60px)' }}>
        {/* ── Left: Requisitions sidebar ── */}
        <div style={{ width: '280px', borderRight: `1px solid ${C.border}`, background: C.surface, overflowY: 'auto', flexShrink: 0 }}>
          <div style={{ padding: '16px', borderBottom: `1px solid ${C.border}` }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '1px' }}>
              {reqFilter === 'open' ? 'Open Positions' : 'All Positions'} ({requisitions.length})
            </div>
          </div>
          {requisitions.length === 0 ? (
            <div style={{ padding: '40px 20px', textAlign: 'center', color: C.muted, fontSize: '13px' }}>
              No {reqFilter === 'open' ? 'open' : ''} positions.<br />
              <button onClick={() => setShowNewReq(true)} style={{ marginTop: '12px', color: C.green, fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', fontFamily: 'inherit' }}>
                Open one now
              </button>
            </div>
          ) : (
            requisitions.map(req => {
              const isActive = activeReqId === req.id
              // Build pipeline mini-funnel for the active position
              const pipelineStages = isActive && kanban
                ? ACTIVE_STAGES.map(s => ({ stage: s, label: STAGES[s]?.label ?? s, count: kanban.grouped[s]?.length ?? 0 })).filter(s => ['applied', 'ai_screening', 'shortlisted', 'interview_r1', 'offer'].includes(s.stage))
                : null

              return (
                <div key={req.id} onClick={() => setActiveReqId(req.id)}
                  style={{
                    padding: '14px 16px',
                    borderBottom: `1px solid ${C.border}`,
                    cursor: 'pointer',
                    background: isActive ? C.green + '08' : 'transparent',
                    borderLeft: isActive ? `3px solid ${C.green}` : '3px solid transparent',
                  }}>
                  <div style={{ fontSize: '13px', fontWeight: 800, color: C.text, marginBottom: '3px' }}>{req.title}</div>
                  <div style={{ fontSize: '12px', color: C.muted, marginBottom: '8px' }}>
                    {req.department ?? '—'}{req.location ? ` · ${req.location}` : ''}
                  </div>

                  {/* Status + headcount pills */}
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: pipelineStages ? '10px' : '0' }}>
                    <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 7px', borderRadius: '8px', background: req.status === 'open' ? C.green + '15' : C.muted + '15', color: req.status === 'open' ? C.green : C.muted }}>
                      {req.status}
                    </span>
                    <span style={{ fontSize: '11px', color: C.muted }}>×{req.headcount}</span>
                  </div>

                  {/* Mini pipeline funnel for active position */}
                  {pipelineStages && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
                      {pipelineStages.map((s, idx) => (
                        <div key={s.stage} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: '13px', fontWeight: 800, color: s.count > 0 ? C.text : C.border, lineHeight: 1 }}>{s.count}</div>
                            <div style={{ fontSize: '9px', color: C.muted, whiteSpace: 'nowrap', marginTop: '1px' }}>{s.label}</div>
                          </div>
                          {idx < pipelineStages.length - 1 && (
                            <span style={{ color: C.border, fontSize: '10px', marginBottom: '10px' }}>›</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* For non-active: show total count if kanban was previously loaded */}
                  {!isActive && (
                    <div style={{ fontSize: '11px', color: C.muted }}></div>
                  )}
                </div>
              )
            })
          )}
        </div>

        {/* ── Right: Kanban board ── */}
        <div style={{ flex: 1, overflowX: 'auto', overflowY: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {!activeReqId || !kanban ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.muted, fontSize: '14px' }}>
              Select a position to view the pipeline
            </div>
          ) : (
            <>
              {/* Pipeline stats bar — 3 prominent stat cards */}
              <div style={{ padding: '16px 24px', borderBottom: `1px solid ${C.border}`, background: C.surface, display: 'flex', gap: '12px', alignItems: 'center', flexShrink: 0, flexWrap: 'wrap' }}>
                {[
                  { label: 'In Pipeline', value: totalActive,   color: C.text    },
                  { label: 'Hired',        value: totalHired,    color: C.green   },
                  { label: 'Rejected',     value: totalRejected, color: C.red     },
                ].map(({ label, value, color }) => (
                  <div key={label} style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: '12px', padding: '10px 18px', display: 'flex', flexDirection: 'column', gap: '2px', minWidth: '80px' }}>
                    <div style={{ fontSize: '24px', fontWeight: 900, color, lineHeight: 1 }}>{value}</div>
                    <div style={{ fontSize: '10px', fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.6px' }}>{label}</div>
                  </div>
                ))}

                {activeReq?.salary_min && (
                  <div style={{ marginLeft: 'auto', fontSize: '13px', color: C.muted, alignSelf: 'center' }}>
                    {activeReq.currency} {activeReq.salary_min.toLocaleString()} – {activeReq.salary_max?.toLocaleString() ?? '?'}
                  </div>
                )}
              </div>

              {/* Kanban columns */}
              <div style={{ flex: 1, overflowX: 'auto', display: 'flex', gap: '0', padding: '0' }}>
                {activeStages.map(stage => {
                  const stageApps = kanban.grouped[stage] ?? []
                  const cfg = STAGES[stage]
                  return (
                    <div key={stage} style={{ minWidth: '240px', maxWidth: '280px', flex: '0 0 240px', borderRight: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', background: C.bg }}>
                      {/* Column header with colored top border */}
                      <div style={{ borderTop: `3px solid ${cfg.color}`, padding: '14px 16px', background: C.surface, borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                        <div>
                          <div style={{ fontSize: '12px', fontWeight: 800, color: cfg.color }}>{cfg.label}</div>
                          <div style={{ fontSize: '11px', color: C.muted }}>{cfg.description}</div>
                        </div>
                        <span style={{ background: cfg.color + '20', color: cfg.color, fontSize: '12px', fontWeight: 800, padding: '2px 8px', borderRadius: '10px' }}>
                          {stageApps.length}
                        </span>
                      </div>

                      {/* Cards */}
                      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {stageApps.map(app => (
                          <div key={app.id}>
                            <CandidateCard
                              app={app}
                              onMove={moveStage}
                              onScreen={screenCandidate}
                              onView={a => setSelectedApp(a)}
                            />
                            {screenMsg[app.id] && (
                              <div style={{ fontSize: '11px', color: C.purple, padding: '4px 8px' }}>{screenMsg[app.id]}</div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}

                {/* Hired + Rejected summary columns */}
                {(['hired', 'rejected'] as const).map(stage => {
                  const stageApps = kanban.grouped[stage] ?? []
                  const cfg = STAGES[stage]
                  return (
                    <div key={stage} style={{ minWidth: '200px', flex: '0 0 200px', borderRight: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', background: C.bg, opacity: 0.85 }}>
                      <div style={{ borderTop: `3px solid ${cfg.color}`, padding: '14px 16px', background: C.surface, borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                        <div style={{ fontSize: '12px', fontWeight: 800, color: cfg.color }}>{cfg.label}</div>
                        <span style={{ background: cfg.color + '20', color: cfg.color, fontSize: '12px', fontWeight: 800, padding: '2px 8px', borderRadius: '10px' }}>{stageApps.length}</span>
                      </div>
                      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {stageApps.map(app => (
                          <div key={app.id} onClick={() => setSelectedApp(app)}
                            style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '10px', padding: '10px 12px', cursor: 'pointer' }}>
                            <div style={{ fontSize: '12px', fontWeight: 700, color: C.text }}>{app.candidate?.full_name}</div>
                            {app.ai_score != null && <div style={{ fontSize: '11px', color: C.muted }}>AI: {app.ai_score}</div>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Modals */}
      {showNewReq && (
        <NewRequisitionModal staffList={staffList} onClose={() => setShowNewReq(false)} onSave={loadRequisitions} />
      )}
      {showAddCand && activeReqId && (
        <AddCandidateModal requisitionId={activeReqId} onClose={() => setShowAddCand(false)} onSave={() => loadKanban(activeReqId)} />
      )}

      {/* Application drawer */}
      {selectedApp && (
        <AppDrawer
          app={selectedApp}
          staffList={staffList}
          onClose={() => setSelectedApp(null)}
          onHire={hireCandidate}
          onAddInterview={addInterview}
          onRefresh={refreshDrawer}
        />
      )}
    </div>
  )
}
