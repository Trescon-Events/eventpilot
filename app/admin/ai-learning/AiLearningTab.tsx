'use client'

import AnalyticsSection from './AnalyticsSection'
import CourseGeneratorSection from './CourseGeneratorSection'

const SUB_TABS: { key: 'analytics' | 'course-generator'; label: string }[] = [
  { key: 'analytics', label: 'Analytics' },
  { key: 'course-generator', label: 'Course Generator' },
]

const ACCENT = '#A478FF'

export default function AiLearningTab({
  sub,
  onSubChange,
}: {
  sub: 'analytics' | 'course-generator'
  onSubChange: (sub: 'analytics' | 'course-generator') => void
}) {
  return (
    <div>
      <div style={{ display: 'flex', gap: '6px', marginBottom: '24px', flexWrap: 'wrap' }}>
        {SUB_TABS.map(t => {
          const active = sub === t.key
          return (
            <button key={t.key} onClick={() => onSubChange(t.key)}
              style={{
                padding:       active ? '8px 18px' : '8px 16px',
                borderRadius:  '9px',
                border:        active ? `1.5px solid ${ACCENT}` : '1px solid var(--border)',
                cursor:        'pointer',
                fontFamily:    'inherit',
                fontSize:      '12.5px',
                fontWeight:    active ? 800 : 600,
                background:    active ? ACCENT : 'var(--card)',
                color:         active ? 'var(--surface)' : 'var(--ink3)',
                transition:    'all 0.15s ease',
              }}>
              {t.label}
            </button>
          )
        })}
        <button onClick={() => { window.location.href = '/admin/courses' }}
          style={{
            padding:       '8px 16px',
            borderRadius:  '9px',
            border:        '1px solid var(--border)',
            cursor:        'pointer',
            fontFamily:    'inherit',
            fontSize:      '12.5px',
            fontWeight:    600,
            background:    'var(--card)',
            color:         'var(--ink3)',
          }}>
          Course Manager ↗
        </button>
      </div>

      {sub === 'analytics' && <AnalyticsSection />}
      {sub === 'course-generator' && <CourseGeneratorSection />}
    </div>
  )
}
