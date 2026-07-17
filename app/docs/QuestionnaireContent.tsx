'use client'

import { useState } from 'react'
import { buildQuestions, ALL_DEPARTMENTS } from '@/app/lib/questions'
import type { Question } from '@/app/lib/questions'

const T  = 'var(--ink)'
const M  = 'var(--ink2)'
const S  = 'var(--ink3)'
const BG = 'var(--surface)'
const BD = 'var(--border)'

// Categorical department map — each dept's `text`/`accent` now share the
// same bright value (rule 2: text-on-own-tint uses the family's bright
// color, not a separate dark-on-white shade). Depts whose original accent
// exactly matched a documented family hex now reuse that family's token;
// the rest (no matching family) were brightened to clear 4.5:1 on
// var(--card) via the WCAG HSL-bump helper, kept as literals since bg/
// border below concatenate them into rgba().
const DEPT_COLORS: Record<string, { bg: string; text: string; border: string; accent: string }> = {
  'Events':               { bg: 'rgba(245,185,77,0.1)',   text: '#F5B94D',        border: 'rgba(245,185,77,0.3)',   accent: '#F5B94D' },
  'Sales & Sponsorship':  { bg: 'var(--teal-light)',       text: 'var(--teal-mid)', border: 'var(--teal-border)',    accent: 'var(--teal-mid)' },
  'Marketing':            { bg: 'rgba(244,114,182,0.12)',  text: '#F472B6',        border: 'rgba(244,114,182,0.35)', accent: '#F472B6' },
  'Finance':              { bg: 'var(--info-light)',       text: 'var(--info)',    border: 'rgba(90,169,242,0.35)',  accent: 'var(--info)' },
  'Operations':           { bg: 'var(--purple-light)',     text: 'var(--purple)',  border: 'var(--purple-border)',   accent: 'var(--purple)' },
  'IT':                   { bg: 'rgba(18,150,186,0.12)',   text: '#1296BA',        border: 'rgba(18,150,186,0.35)',  accent: '#1296BA' },
  'HR & Recruitment':     { bg: 'rgba(224,103,11,0.12)',   text: '#E0670B',        border: 'rgba(224,103,11,0.35)',  accent: '#E0670B' },
  'Content & Design':     { bg: 'var(--purple-light)',     text: 'var(--purple)',  border: 'var(--purple-border)',   accent: 'var(--purple)' },
  'Government Relations': { bg: 'rgba(230,101,22,0.12)',   text: '#E66516',        border: 'rgba(230,101,22,0.35)',  accent: '#E66516' },
  'DemandifyMedia':       { bg: 'var(--indigo-light)',     text: 'var(--indigo)',  border: 'var(--indigo-border)',   accent: 'var(--indigo)' },
  'Leadership':           { bg: 'rgba(101,163,13,0.12)',   text: '#65A30D',        border: 'rgba(101,163,13,0.35)',  accent: '#65A30D' },
  'Other':                { bg: 'rgba(255,255,255,0.06)',  text: M,               border: 'var(--border)',          accent: S },
}

const TYPE_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  textarea: { label: 'Open text',     bg: 'var(--teal-mid)', text: 'var(--teal-light)' },
  chips:    { label: 'Multi-select',  bg: 'var(--lime)',      text: 'var(--lime-dark)' },
  scale:    { label: 'Scale 1–5',     bg: '#F4ED3C',          text: '#1E2124' },
  select:   { label: 'Single choice', bg: 'var(--red)',       text: 'var(--red-light)' },
  text:     { label: 'Short text',    bg: 'var(--success)',   text: 'var(--success-light)' },
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
                      <span key={opt} style={{ padding: '5px 12px', borderRadius: '16px', border: `1px solid ${BD}`, fontSize: '13px', color: M, background: 'var(--card)', fontWeight: 600 }}>
                        {opt}
                      </span>
                    ))}
                  </div>
                )}

                {q.type === 'select' && q.options && q.options.length > 0 && (
                  <div style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {q.options.map(opt => (
                      <div key={opt} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 14px', borderRadius: '9px', border: `1px solid ${BD}`, background: 'var(--card)' }}>
                        <div style={{ width: '15px', height: '15px', borderRadius: '50%', border: `1.5px solid ${BD}`, flexShrink: 0 }} />
                        <span style={{ fontSize: '13px', color: M }}>{opt}</span>
                      </div>
                    ))}
                  </div>
                )}

                {q.type === 'scale' && q.options && q.options.length > 0 && (
                  <div style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '7px' }}>
                    {q.options.map((opt, oi) => (
                      <div key={opt} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '9px 14px', borderRadius: '9px', border: `1px solid ${BD}`, background: 'var(--card)' }}>
                        <div style={{ width: '26px', height: '26px', borderRadius: '50%', background: `hsla(${oi * 30 + 160},45%,18%,1)`, border: `1.5px solid hsla(${oi * 30 + 160},55%,55%,0.5)`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <span style={{ fontSize: '13px', fontWeight: 800, color: `hsl(${oi * 30 + 160},65%,72%)` }}>{oi + 1}</span>
                        </div>
                        <span style={{ fontSize: '13px', color: M }}>{opt}</span>
                      </div>
                    ))}
                  </div>
                )}

                {q.type === 'textarea' && q.placeholder && (
                  <div style={{ marginTop: '14px', padding: '12px 16px', borderRadius: '9px', border: `1px dashed ${BD}`, background: 'var(--card)' }}>
                    <span style={{ fontSize: '13px', color: S, fontStyle: 'italic', lineHeight: 1.6 }}>{q.placeholder}</span>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <div style={{ marginTop: '32px', padding: '18px 20px', background: 'rgba(18,201,189,0.06)', border: '1px solid rgba(18,201,189,0.2)', borderRadius: '12px', fontSize: '13px', color: M, lineHeight: 1.6 }}>
        <strong style={{ color: 'var(--teal-mid)' }}>Read-only preview.</strong> Staff go through this questionnaire once they join via the Event Pilot portal. Answers are stored and visible in the Interview Answers tab of the admin dashboard.
      </div>
    </div>
  )
}
