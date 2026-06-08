'use client'

import { useState } from 'react'
import { buildQuestions, ALL_DEPARTMENTS } from '@/app/lib/questions'
import type { Question } from '@/app/lib/questions'

const T  = '#0F1923'
const M  = '#2D3E50'
const S  = '#5B7080'
const BG = '#F6F8FB'
const BD = '#DDE8EE'

const DEPT_COLORS: Record<string, { bg: string; text: string; border: string; accent: string }> = {
  'Events':               { bg: 'rgba(217,119,6,0.07)',   text: '#92400E', border: 'rgba(217,119,6,0.25)',   accent: '#D97706' },
  'Sales & Sponsorship':  { bg: 'rgba(0,137,123,0.07)',   text: '#004D40', border: 'rgba(0,137,123,0.25)',   accent: '#00897B' },
  'Marketing':            { bg: 'rgba(219,39,119,0.07)',  text: '#9D174D', border: 'rgba(219,39,119,0.25)',  accent: '#DB2777' },
  'Finance':              { bg: 'rgba(21,101,192,0.07)',  text: '#1E3A5F', border: 'rgba(21,101,192,0.25)',  accent: '#1565C0' },
  'Operations':           { bg: 'rgba(108,84,181,0.07)',  text: '#4C1D95', border: 'rgba(108,84,181,0.25)',  accent: '#6C54B5' },
  'IT':                   { bg: 'rgba(14,116,144,0.07)',  text: '#0C4A6E', border: 'rgba(14,116,144,0.25)',  accent: '#0E7490' },
  'HR & Recruitment':     { bg: 'rgba(217,119,6,0.07)',   text: '#78350F', border: 'rgba(217,119,6,0.25)',   accent: '#B45309' },
  'Content & Design':     { bg: 'rgba(124,58,237,0.07)',  text: '#4C1D95', border: 'rgba(124,58,237,0.25)',  accent: '#7C3AED' },
  'Government Relations': { bg: 'rgba(120,53,15,0.07)',   text: '#78350F', border: 'rgba(120,53,15,0.25)',   accent: '#92400E' },
  'DemandifyMedia':       { bg: 'rgba(99,102,241,0.07)',  text: '#3730A3', border: 'rgba(99,102,241,0.25)',  accent: '#6366F1' },
  'Leadership':           { bg: 'rgba(101,163,13,0.07)',  text: '#365314', border: 'rgba(101,163,13,0.25)',  accent: '#65A30D' },
  'Other':                { bg: 'rgba(91,112,128,0.07)',  text: M,         border: 'rgba(91,112,128,0.25)',  accent: S },
}

const TYPE_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  textarea: { label: 'Open text',     bg: '#00897B', text: '#FFFFFF' },
  chips:    { label: 'Multi-select',  bg: '#C0F43C', text: '#1E2124' },
  scale:    { label: 'Scale 1–5',     bg: '#F4ED3C', text: '#1E2124' },
  select:   { label: 'Single choice', bg: '#8B1A1A', text: '#FFFFFF' },
  text:     { label: 'Short text',    bg: '#A8E6CF', text: '#1E2124' },
}

export default function QuestionnaireContent() {
  const [dept, setDept] = useState('Events')
  const questions: Question[] = buildQuestions(dept)
  const dc = DEPT_COLORS[dept] ?? DEPT_COLORS['Other']

  return (
    <div>
      {/* Dept selector */}
      <div style={{ marginBottom: '28px' }}>
        <div style={{ fontSize: '13px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: S, marginBottom: '12px' }}>Select Department</div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {ALL_DEPARTMENTS.map(d => {
            const c = DEPT_COLORS[d] ?? DEPT_COLORS['Other']
            const active = dept === d
            return (
              <button key={d} onClick={() => setDept(d)}
                style={{ padding: '7px 16px', borderRadius: '16px', border: `1.5px solid ${active ? c.border : BD}`, background: active ? c.bg : BG, color: active ? c.accent : M, fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                {d}
              </button>
            )
          })}
        </div>
      </div>

      {/* Dept header */}
      <div style={{ background: dc.bg, border: `1.5px solid ${dc.border}`, borderRadius: '16px', padding: '22px 28px', marginBottom: '28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: '13px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: dc.accent, marginBottom: '6px' }}>Department</div>
          <div style={{ fontSize: '13px', fontWeight: 800, color: dc.text }}>{dept}</div>
          <div style={{ fontSize: '13px', color: S, marginTop: '4px' }}>{questions.length} questions — 2 shared openers · 3 dept-specific · 4 core closers</div>
        </div>
        <div style={{ fontSize: '36px', fontWeight: 900, color: dc.accent, lineHeight: 1 }}>{questions.length}</div>
      </div>

      {/* Question cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {questions.map((q, idx) => {
          const tc = TYPE_CONFIG[q.type] ?? TYPE_CONFIG['text']

          let sectionLabel: string | null = null
          if (idx === 0) sectionLabel = 'Opening questions — shared by all departments'
          if (idx === 2) sectionLabel = `${dept} department questions`
          if (idx === 5) sectionLabel = 'Core questions — shared by all departments'

          return (
            <div key={q.id}>
              {sectionLabel && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: idx === 0 ? '0 0 12px' : '20px 0 12px' }}>
                  <div style={{ height: '1px', flex: 1, background: BD }} />
                  <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: S, whiteSpace: 'nowrap' }}>{sectionLabel}</span>
                  <div style={{ height: '1px', flex: 1, background: BD }} />
                </div>
              )}

              <div style={{ background: BG, border: `1px solid ${BD}`, borderRadius: '14px', padding: '20px 24px', borderLeft: `3px solid ${tc.bg}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                  <div style={{ width: '26px', height: '26px', borderRadius: '50%', background: dc.bg, border: `1.5px solid ${dc.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: 800, color: dc.text, flexShrink: 0 }}>
                    {idx + 1}
                  </div>
                  <span style={{ fontSize: '11px', fontWeight: 700, padding: '3px 9px', borderRadius: '6px', background: tc.bg, color: tc.text, letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                    {tc.label}
                  </span>
                  <span style={{ fontSize: '12px', color: S, fontFamily: 'monospace' }}>{q.id}</span>
                </div>

                <div style={{ fontSize: '14px', fontWeight: 700, color: T, lineHeight: 1.5, marginBottom: q.subtext ? '8px' : '0' }}>
                  {q.question}
                </div>
                {q.subtext && (
                  <div style={{ fontSize: '13px', color: S, lineHeight: 1.6 }}>{q.subtext}</div>
                )}

                {q.type === 'chips' && q.options && q.options.length > 0 && (
                  <div style={{ marginTop: '14px', display: 'flex', flexWrap: 'wrap', gap: '7px' }}>
                    {q.options.map(opt => (
                      <span key={opt} style={{ padding: '5px 12px', borderRadius: '16px', border: `1px solid ${BD}`, fontSize: '13px', color: M, background: '#FFFFFF', fontWeight: 600 }}>
                        {opt}
                      </span>
                    ))}
                  </div>
                )}

                {q.type === 'select' && q.options && q.options.length > 0 && (
                  <div style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {q.options.map(opt => (
                      <div key={opt} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 14px', borderRadius: '9px', border: `1px solid ${BD}`, background: '#FFFFFF' }}>
                        <div style={{ width: '15px', height: '15px', borderRadius: '50%', border: `1.5px solid ${BD}`, flexShrink: 0 }} />
                        <span style={{ fontSize: '13px', color: M }}>{opt}</span>
                      </div>
                    ))}
                  </div>
                )}

                {q.type === 'scale' && q.options && q.options.length > 0 && (
                  <div style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '7px' }}>
                    {q.options.map((opt, oi) => (
                      <div key={opt} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '9px 14px', borderRadius: '9px', border: `1px solid ${BD}`, background: '#FFFFFF' }}>
                        <div style={{ width: '26px', height: '26px', borderRadius: '50%', background: `hsla(${oi * 30 + 160},55%,92%,1)`, border: `1.5px solid hsla(${oi * 30 + 160},55%,65%,0.5)`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <span style={{ fontSize: '13px', fontWeight: 800, color: `hsl(${oi * 30 + 160},55%,30%)` }}>{oi + 1}</span>
                        </div>
                        <span style={{ fontSize: '13px', color: M }}>{opt}</span>
                      </div>
                    ))}
                  </div>
                )}

                {q.type === 'textarea' && q.placeholder && (
                  <div style={{ marginTop: '14px', padding: '12px 16px', borderRadius: '9px', border: `1px dashed ${BD}`, background: '#FFFFFF' }}>
                    <span style={{ fontSize: '13px', color: S, fontStyle: 'italic', lineHeight: 1.6 }}>{q.placeholder}</span>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <div style={{ marginTop: '32px', padding: '18px 20px', background: 'rgba(0,137,123,0.06)', border: '1px solid rgba(0,137,123,0.2)', borderRadius: '12px', fontSize: '13px', color: M, lineHeight: 1.6 }}>
        <strong style={{ color: '#00897B' }}>Read-only preview.</strong> Staff go through this questionnaire once they join via the EventPilot portal. Answers are stored and visible in the Interview Answers tab of the admin dashboard.
      </div>
    </div>
  )
}
