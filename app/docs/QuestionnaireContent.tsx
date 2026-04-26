'use client'

import { useState } from 'react'
import { buildQuestions, ALL_DEPARTMENTS } from '@/app/lib/questions'
import type { Question } from '@/app/lib/questions'

const DEPT_COLORS: Record<string, { bg: string; text: string; border: string; accent: string }> = {
  'Events':               { bg: 'rgba(255,243,224,0.08)', text: '#FFB74D', border: 'rgba(255,183,77,0.3)',  accent: '#FF9F43' },
  'Sales & Sponsorship':  { bg: 'rgba(232,245,233,0.08)', text: '#66BB6A', border: 'rgba(102,187,106,0.3)', accent: '#66BB6A' },
  'Marketing':            { bg: 'rgba(252,228,236,0.08)', text: '#F48FB1', border: 'rgba(244,143,177,0.3)', accent: '#F06292' },
  'Finance':              { bg: 'rgba(227,242,253,0.08)', text: '#64B5F6', border: 'rgba(100,181,246,0.3)',  accent: '#42A5F5' },
  'Operations':           { bg: 'rgba(243,229,245,0.08)', text: '#CE93D8', border: 'rgba(206,147,216,0.3)', accent: '#BA68C8' },
  'IT':                   { bg: 'rgba(224,247,250,0.08)', text: '#4DD0E1', border: 'rgba(77,208,225,0.3)',  accent: '#00BCD4' },
  'HR & Recruitment':     { bg: 'rgba(255,248,225,0.08)', text: '#FFD54F', border: 'rgba(255,213,79,0.3)',  accent: '#FFC107' },
  'Content & Design':     { bg: 'rgba(237,231,246,0.08)', text: '#B39DDB', border: 'rgba(179,157,219,0.3)', accent: '#9575CD' },
  'Government Relations': { bg: 'rgba(239,235,233,0.08)', text: '#A1887F', border: 'rgba(161,136,127,0.3)', accent: '#8D6E63' },
  'DemandifyMedia':       { bg: 'rgba(232,234,246,0.08)', text: '#7986CB', border: 'rgba(121,134,203,0.3)', accent: '#5C6BC0' },
  'Leadership':           { bg: 'rgba(241,248,233,0.08)', text: '#AED581', border: 'rgba(174,213,129,0.3)', accent: '#9CCC65' },
  'Other':                { bg: 'rgba(250,250,250,0.05)', text: 'rgba(255,255,255,0.6)', border: 'rgba(255,255,255,0.12)', accent: 'rgba(255,255,255,0.5)' },
}

const TYPE_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  textarea: { label: 'Open text',     bg: '#00A5A3', text: 'white' },
  chips:    { label: 'Multi-select',  bg: '#C0F43C', text: '#1E2124' },
  scale:    { label: 'Scale 1–5',     bg: '#F4ED3C', text: '#1E2124' },
  select:   { label: 'Single choice', bg: '#FF9F43', text: 'white' },
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
        <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', marginBottom: '12px' }}>Select Department</div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {ALL_DEPARTMENTS.map(d => {
            const c = DEPT_COLORS[d] ?? DEPT_COLORS['Other']
            const active = dept === d
            return (
              <button key={d} onClick={() => setDept(d)}
                style={{ padding: '7px 16px', borderRadius: '20px', border: `1.5px solid ${active ? c.border : 'rgba(255,255,255,0.1)'}`, background: active ? c.bg : 'transparent', color: active ? c.text : 'rgba(255,255,255,0.55)', fontSize: '12px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                {d}
              </button>
            )
          })}
        </div>
      </div>

      {/* Dept header */}
      <div style={{ background: dc.bg, border: `1.5px solid ${dc.border}`, borderRadius: '16px', padding: '22px 28px', marginBottom: '28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: dc.accent, marginBottom: '6px' }}>Department</div>
          <div style={{ fontSize: '20px', fontWeight: 800, color: dc.text }}>{dept}</div>
          <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', marginTop: '4px' }}>{questions.length} questions — 2 shared openers · 3 dept-specific · 4 core closers</div>
        </div>
        <div style={{ fontSize: '40px', fontWeight: 900, color: dc.accent, lineHeight: 1 }}>{questions.length}</div>
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
                  <div style={{ height: '1px', flex: 1, background: 'rgba(255,255,255,0.08)' }} />
                  <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)', whiteSpace: 'nowrap' }}>{sectionLabel}</span>
                  <div style={{ height: '1px', flex: 1, background: 'rgba(255,255,255,0.08)' }} />
                </div>
              )}

              <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '14px', padding: '20px 24px', borderLeft: `3px solid ${tc.bg}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                  <div style={{ width: '26px', height: '26px', borderRadius: '50%', background: dc.bg, border: `1.5px solid ${dc.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 800, color: dc.text, flexShrink: 0 }}>
                    {idx + 1}
                  </div>
                  <span style={{ fontSize: '10px', fontWeight: 700, padding: '3px 9px', borderRadius: '6px', background: tc.bg, color: tc.text, letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                    {tc.label}
                  </span>
                  <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.25)', fontFamily: 'monospace' }}>{q.id}</span>
                </div>

                <div style={{ fontSize: '15px', fontWeight: 700, color: 'white', lineHeight: 1.5, marginBottom: q.subtext ? '8px' : '0' }}>
                  {q.question}
                </div>
                {q.subtext && (
                  <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.55)', lineHeight: 1.6 }}>{q.subtext}</div>
                )}

                {q.type === 'chips' && q.options && q.options.length > 0 && (
                  <div style={{ marginTop: '14px', display: 'flex', flexWrap: 'wrap', gap: '7px' }}>
                    {q.options.map(opt => (
                      <span key={opt} style={{ padding: '5px 12px', borderRadius: '20px', border: '1px solid rgba(255,255,255,0.12)', fontSize: '12px', color: 'rgba(255,255,255,0.7)', background: 'rgba(255,255,255,0.04)', fontWeight: 600 }}>
                        {opt}
                      </span>
                    ))}
                  </div>
                )}

                {q.type === 'select' && q.options && q.options.length > 0 && (
                  <div style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {q.options.map(opt => (
                      <div key={opt} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 14px', borderRadius: '9px', border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)' }}>
                        <div style={{ width: '15px', height: '15px', borderRadius: '50%', border: '1.5px solid rgba(255,255,255,0.2)', flexShrink: 0 }} />
                        <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.75)' }}>{opt}</span>
                      </div>
                    ))}
                  </div>
                )}

                {q.type === 'scale' && q.options && q.options.length > 0 && (
                  <div style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '7px' }}>
                    {q.options.map((opt, oi) => (
                      <div key={opt} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '9px 14px', borderRadius: '9px', border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)' }}>
                        <div style={{ width: '26px', height: '26px', borderRadius: '50%', background: `hsla(${oi * 30 + 160},55%,50%,0.15)`, border: `1.5px solid hsla(${oi * 30 + 160},55%,50%,0.4)`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <span style={{ fontSize: '11px', fontWeight: 800, color: `hsl(${oi * 30 + 160},60%,65%)` }}>{oi + 1}</span>
                        </div>
                        <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.75)' }}>{opt}</span>
                      </div>
                    ))}
                  </div>
                )}

                {q.type === 'textarea' && q.placeholder && (
                  <div style={{ marginTop: '14px', padding: '12px 16px', borderRadius: '9px', border: '1px dashed rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.02)' }}>
                    <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.3)', fontStyle: 'italic', lineHeight: 1.6 }}>{q.placeholder}</span>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <div style={{ marginTop: '32px', padding: '16px 20px', background: 'rgba(0,165,163,0.06)', border: '1px solid rgba(0,165,163,0.2)', borderRadius: '12px', fontSize: '12px', color: 'rgba(255,255,255,0.6)', lineHeight: 1.6 }}>
        <strong style={{ color: '#00A5A3' }}>Read-only preview.</strong> Staff go through this questionnaire once they join via the Trescademy portal. Answers are stored and visible in the Interview Answers tab of the admin dashboard.
      </div>
    </div>
  )
}
