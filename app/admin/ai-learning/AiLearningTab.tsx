'use client'

import type { Member, TaskProfile } from '../page'
import ReadinessSection from './ReadinessSection'
import AnalyticsSection from './AnalyticsSection'
import CourseGeneratorSection from './CourseGeneratorSection'

type Sub = 'readiness' | 'analytics' | 'course-generator'

const SUB_TABS: { key: Sub; label: string }[] = [
  { key: 'readiness', label: 'Readiness' },
  { key: 'analytics', label: 'Analytics' },
  { key: 'course-generator', label: 'Course Generator' },
]

const ACCENT = '#A478FF'

export default function AiLearningTab({
  sub,
  onSubChange,
  members,
  tasks,
  filteredMembers,
  getOffice,
  officeFilter,
  setOfficeFilter,
  deptFilter,
  setDeptFilter,
  memberSearch,
  setMemberSearch,
  interviewFilter,
  setInterviewFilter,
}: {
  sub: Sub
  onSubChange: (sub: Sub) => void
  members: Member[]
  tasks: TaskProfile[]
  filteredMembers: Member[]
  getOffice: (id: string) => { id: string; label: string; color: string } | undefined
  officeFilter: string
  setOfficeFilter: (v: string) => void
  deptFilter: string
  setDeptFilter: (v: string) => void
  memberSearch: string
  setMemberSearch: (v: string) => void
  interviewFilter: 'all' | 'done' | 'pending'
  setInterviewFilter: (v: 'all' | 'done' | 'pending') => void
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

      {sub === 'readiness' && (
        <ReadinessSection
          members={members}
          tasks={tasks}
          filteredMembers={filteredMembers}
          getOffice={getOffice}
          officeFilter={officeFilter}
          setOfficeFilter={setOfficeFilter}
          deptFilter={deptFilter}
          setDeptFilter={setDeptFilter}
          memberSearch={memberSearch}
          setMemberSearch={setMemberSearch}
          interviewFilter={interviewFilter}
          setInterviewFilter={setInterviewFilter}
        />
      )}
      {sub === 'analytics' && <AnalyticsSection />}
      {sub === 'course-generator' && <CourseGeneratorSection />}
    </div>
  )
}
