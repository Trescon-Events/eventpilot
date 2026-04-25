'use client'

import { useState } from 'react'
import Link from 'next/link'
import { buildQuestions, ALL_DEPARTMENTS } from '@/app/lib/questions'
import type { Question } from '@/app/lib/questions'

const DEPT_COLORS: Record<string, { bg: string; text: string; border: string; accent: string }> = {
  'Events':               { bg: '#FFF3E0', text: '#E65100', border: '#FFB74D', accent: '#FF6D00' },
  'Sales & Sponsorship':  { bg: '#E8F5E9', text: '#1B5E20', border: '#66BB6A', accent: '#2E7D32' },
  'Marketing':            { bg: '#FCE4EC', text: '#880E4F', border: '#F48FB1', accent: '#C2185B' },
  'Finance':              { bg: '#E3F2FD', text: '#0D47A1', border: '#64B5F6', accent: '#1565C0' },
  'Operations':           { bg: '#F3E5F5', text: '#4A148C', border: '#CE93D8', accent: '#6A1B9A' },
  'IT':                   { bg: '#E0F7FA', text: '#006064', border: '#4DD0E1', accent: '#00838F' },
  'HR & Recruitment':     { bg: '#FFF8E1', text: '#F57F17', border: '#FFD54F', accent: '#F9A825' },
  'Content & Design':     { bg: '#EDE7F6', text: '#311B92', border: '#B39DDB', accent: '#512DA8' },
  'Government Relations': { bg: '#EFEBE9', text: '#3E2723', border: '#A1887F', accent: '#5D4037' },
  'DemandifyMedia':       { bg: '#E8EAF6', text: '#1A237E', border: '#7986CB', accent: '#283593' },
  'Leadership':           { bg: '#F1F8E9', text: '#33691E', border: '#AED581', accent: '#558B2F' },
  'Other':                { bg: '#FAFAFA', text: '#212121', border: '#BDBDBD', accent: '#616161' },
}

const TYPE_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  textarea: { label: 'Open text',    bg: '#00A5A3', text: 'white' },
  chips:    { label: 'Multi-select', bg: '#C0F43C', text: '#1E2124' },
  scale:    { label: 'Scale 1–5',    bg: '#F4ED3C', text: '#1E2124' },
  select:   { label: 'Single choice', bg: '#FF9F43', text: 'white' },
  text:     { label: 'Short text',   bg: '#A8E6CF', text: '#1E2124' },
}

export default function QuestionnairePage() {
  const [dept, setDept] = useState('Events')
  const questions: Question[] = buildQuestions(dept)
  const dc = DEPT_COLORS[dept] ?? DEPT_COLORS['Other']

  return (
    <div style={{ fontFamily: 'var(--font-manrope), Manrope, sans-serif', background: '#F7F8FA', minHeight: '100vh' }}>

      {/* Nav */}
      <nav style={{ background: 'white', borderBottom: '1px solid #E5E7EB', padding: '0 40px', height: '60px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Link href="/admin" style={{ display: 'flex', alignItems: 'center', gap: '10px', textDecoration: 'none' }}>
            <div style={{ background: '#F7F8FA', borderRadius: '8px', padding: '4px 10px', border: '1px solid #E5E7EB', display: 'flex', alignItems: 'center' }}>
              <img src="/trescon-logo.png" alt="Trescon" style={{ height: '20px', width: 'auto', display: 'block' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div style={{ width: '22px', height: '22px', background: '#00A5A3', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="11" height="11" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
              </div>
              <span style={{ fontSize: '13px', fontWeight: 800, color: '#111827' }}>TAI</span>
            </div>
          </Link>
          <span style={{ color: '#D1D5DB' }}>/</span>
          <Link href="/admin" style={{ fontSize: '13px', color: '#6B7280', textDecoration: 'none', fontWeight: 600 }}>Dashboard</Link>
          <span style={{ color: '#D1D5DB' }}>/</span>
          <span style={{ fontSize: '13px', fontWeight: 700, color: '#111827' }}>Questionnaire Flow</span>
        </div>
        <Link href="/admin" style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#F3F4F6', border: '1px solid #E5E7EB', color: '#374151', fontSize: '12px', fontWeight: 700, padding: '7px 16px', borderRadius: '8px', textDecoration: 'none' }}>
          <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>
          Back to Dashboard
        </Link>
      </nav>

      <div style={{ maxWidth: '840px', margin: '0 auto', padding: '48px 24px' }}>

        {/* Page title */}
        <div style={{ marginBottom: '36px' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: '#00A5A315', border: '1px solid #00A5A340', borderRadius: '20px', padding: '5px 14px', marginBottom: '14px' }}>
            <svg width="12" height="12" fill="none" stroke="#00A5A3" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#00A5A3', letterSpacing: '1px', textTransform: 'uppercase' }}>Read-only preview</span>
          </div>
          <h1 style={{ fontSize: '30px', fontWeight: 800, color: '#111827', marginBottom: '8px', lineHeight: 1.2 }}>TAI Discovery Questionnaire</h1>
          <p style={{ fontSize: '14px', color: '#6B7280', lineHeight: 1.6 }}>
            This is the full questionnaire flow as seen by each staff member. Select a department below to preview the exact questions that department receives — including the 2 shared opening questions, their 3 department-specific questions, and 4 core closing questions.
          </p>
        </div>

        {/* Department selector */}
        <div style={{ background: 'white', border: '1px solid #E5E7EB', borderRadius: '20px', padding: '24px', marginBottom: '36px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: '#9CA3AF', marginBottom: '14px' }}>Select Department</div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {ALL_DEPARTMENTS.map(d => {
              const c = DEPT_COLORS[d] ?? DEPT_COLORS['Other']
              const active = dept === d
              return (
                <button key={d} onClick={() => setDept(d)}
                  style={{ padding: '7px 16px', borderRadius: '20px', border: `1.5px solid ${active ? c.border : '#E5E7EB'}`, background: active ? c.bg : 'white', color: active ? c.text : '#6B7280', fontSize: '12px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s', whiteSpace: 'nowrap' }}>
                  {d}
                </button>
              )
            })}
          </div>
        </div>

        {/* Department header card */}
        <div style={{ background: dc.bg, border: `2px solid ${dc.border}`, borderRadius: '20px', padding: '28px 32px', marginBottom: '32px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px' }}>
            <div>
              <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: dc.accent, marginBottom: '6px', opacity: 0.8 }}>Department</div>
              <h2 style={{ fontSize: '24px', fontWeight: 800, color: dc.text, marginBottom: '6px' }}>{dept}</h2>
              <p style={{ fontSize: '13px', color: dc.text, opacity: 0.7, lineHeight: 1.5 }}>
                {questions.length} questions total — 2 shared openers · 3 dept-specific · 4 core closers
              </p>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontSize: '48px', fontWeight: 800, color: dc.accent, lineHeight: 1 }}>{questions.length}</div>
              <div style={{ fontSize: '11px', fontWeight: 700, color: dc.text, opacity: 0.6 }}>questions</div>
            </div>
          </div>

          {/* Type breakdown */}
          <div style={{ display: 'flex', gap: '8px', marginTop: '20px', flexWrap: 'wrap' }}>
            {(['textarea', 'chips', 'scale', 'select'] as const).map(type => {
              const count = questions.filter(q => q.type === type).length
              if (count === 0) return null
              const tc = TYPE_CONFIG[type]
              return (
                <span key={type} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '4px 10px', borderRadius: '20px', background: tc.bg, color: tc.text, fontSize: '11px', fontWeight: 700 }}>
                  <span style={{ fontSize: '13px', fontWeight: 800 }}>{count}</span>
                  {tc.label}
                </span>
              )
            })}
          </div>
        </div>

        {/* Question cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {questions.map((q, idx) => {
            const tc = TYPE_CONFIG[q.type] ?? TYPE_CONFIG['text']

            // Section labels
            let sectionLabel: string | null = null
            if (idx === 0) sectionLabel = 'Opening questions (shared by all)'
            if (idx === 2) sectionLabel = `${dept} department questions`
            if (idx === 5) sectionLabel = 'Core questions (shared by all)'

            return (
              <div key={q.id}>
                {sectionLabel && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: idx === 0 ? '0 0 14px' : '28px 0 14px' }}>
                    <div style={{ height: '1px', flex: 1, background: '#E5E7EB' }} />
                    <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: '#9CA3AF', whiteSpace: 'nowrap' }}>{sectionLabel}</span>
                    <div style={{ height: '1px', flex: 1, background: '#E5E7EB' }} />
                  </div>
                )}

                <div style={{ background: 'white', border: '1px solid #E5E7EB', borderRadius: '16px', padding: '24px 28px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', borderLeft: `4px solid ${tc.bg === 'white' ? '#E5E7EB' : tc.bg}` }}>
                  {/* Step + type row */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
                    <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: dc.bg, border: `1.5px solid ${dc.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 800, color: dc.text, flexShrink: 0 }}>
                      {idx + 1}
                    </div>
                    <span style={{ fontSize: '10px', fontWeight: 700, padding: '4px 10px', borderRadius: '6px', background: tc.bg, color: tc.text, letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                      {tc.label}
                    </span>
                    <span style={{ fontSize: '10px', color: '#9CA3AF', fontFamily: 'monospace', letterSpacing: '0.3px' }}>{q.id}</span>
                  </div>

                  {/* Question text */}
                  <div style={{ fontSize: '16px', fontWeight: 700, color: '#111827', lineHeight: 1.5, marginBottom: q.subtext ? '8px' : '0' }}>
                    {q.question}
                  </div>
                  {q.subtext && (
                    <div style={{ fontSize: '13px', color: '#6B7280', lineHeight: 1.6, marginBottom: '0' }}>
                      {q.subtext}
                    </div>
                  )}

                  {/* Options: chips */}
                  {q.type === 'chips' && q.options && q.options.length > 0 && (
                    <div style={{ marginTop: '16px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                      {q.options.map(opt => (
                        <span key={opt} style={{ padding: '6px 14px', borderRadius: '20px', border: '1.5px solid #E5E7EB', fontSize: '12px', color: '#374151', background: '#F9FAFB', fontWeight: 600 }}>
                          {opt}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Options: select */}
                  {q.type === 'select' && q.options && q.options.length > 0 && (
                    <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {q.options.map(opt => (
                        <div key={opt} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', borderRadius: '10px', border: '1.5px solid #E5E7EB', background: '#FAFAFA' }}>
                          <div style={{ width: '16px', height: '16px', borderRadius: '50%', border: '1.5px solid #D1D5DB', flexShrink: 0 }} />
                          <span style={{ fontSize: '13px', color: '#374151', fontWeight: 500 }}>{opt}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Options: scale */}
                  {q.type === 'scale' && q.options && q.options.length > 0 && (
                    <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {q.options.map((opt, oi) => (
                        <div key={opt} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 16px', borderRadius: '10px', border: '1.5px solid #E5E7EB', background: '#FAFAFA' }}>
                          <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: `hsl(${oi * 30 + 160}, 60%, 90%)`, border: `1.5px solid hsl(${oi * 30 + 160}, 60%, 70%)`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <span style={{ fontSize: '11px', fontWeight: 800, color: `hsl(${oi * 30 + 160}, 60%, 35%)` }}>{oi + 1}</span>
                          </div>
                          <span style={{ fontSize: '13px', color: '#374151', fontWeight: 500 }}>{opt}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Textarea placeholder */}
                  {q.type === 'textarea' && q.placeholder && (
                    <div style={{ marginTop: '16px', padding: '14px 16px', borderRadius: '10px', border: '1.5px dashed #E5E7EB', background: '#FAFAFA' }}>
                      <span style={{ fontSize: '12px', color: '#9CA3AF', fontStyle: 'italic', lineHeight: 1.6 }}>{q.placeholder}</span>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* Footer note */}
        <div style={{ marginTop: '48px', padding: '20px 24px', background: 'white', border: '1px solid #E5E7EB', borderRadius: '16px', display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: '#00A5A315', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="16" height="16" fill="none" stroke="#00A5A3" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          </div>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#111827', marginBottom: '2px' }}>This is a preview only</div>
            <div style={{ fontSize: '12px', color: '#6B7280' }}>Staff go through this questionnaire once they join via the TAI Discovery portal. Answers are stored and visible in the Interview Answers tab of the dashboard.</div>
          </div>
        </div>

      </div>
    </div>
  )
}
