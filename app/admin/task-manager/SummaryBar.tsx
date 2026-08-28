'use client'
import StatCard from '@/app/components/ui/StatCard'
import { Avatar, CUSTOM_SCROLLBAR_STYLE } from './ui'
import { formatHours } from './types'

export type AssigneeCounts = Record<string, { name: string; total: number; not_started: number; in_progress: number; completed: number }>

const BREAKDOWN: Array<{ key: 'not_started' | 'in_progress' | 'completed'; label: string; dot: string }> = [
  { key: 'not_started', label: 'Not started', dot: 'var(--ink3)' },
  { key: 'in_progress', label: 'In progress', dot: 'var(--purple)' },
  { key: 'completed', label: 'Done', dot: 'var(--teal)' },
]

interface Props {
  counts: AssigneeCounts
  selectedStaffId?: string | null
  onSelectStaff?: (staffId: string | null) => void
  totalTasksCount: number
  inProgressCount: number
  completedCount: number
  overdueCount: number
  totalTrackedSeconds: number
}

export default function SummaryBar({
  counts,
  selectedStaffId,
  onSelectStaff,
  totalTasksCount,
  inProgressCount,
  completedCount,
  overdueCount,
  totalTrackedSeconds,
}: Props) {
  const entries = Object.entries(counts).sort(([, a], [, b]) => b.total - a.total)
  const completionRate = totalTasksCount > 0 ? Math.round((completedCount / totalTasksCount) * 100) : 0

  return (
    <div style={{ marginBottom: '22px' }}>
      {/* ── Macro KPI Pulse Ribbon (Admin Oversight) ───────────── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '12px',
          marginBottom: '16px',
        }}
      >
        <StatCard color="indigo">
          <div style={{ padding: '14px 16px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '6px' }}>
              Active Workload
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
              <span style={{ fontSize: '26px', fontWeight: 800, color: 'var(--ink)', lineHeight: 1 }}>{totalTasksCount}</span>
              <span style={{ fontSize: '12px', color: 'var(--ink4)' }}>total tasks</span>
            </div>
          </div>
        </StatCard>

        <StatCard color="purple">
          <div style={{ padding: '14px 16px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '6px' }}>
              In Progress
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
              <span style={{ fontSize: '26px', fontWeight: 800, color: 'var(--purple)', lineHeight: 1 }}>{inProgressCount}</span>
              <span style={{ fontSize: '12px', color: 'var(--ink4)' }}>({completionRate}% complete)</span>
            </div>
          </div>
        </StatCard>

        <StatCard color="amber">
          <div style={{ padding: '14px 16px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: overdueCount > 0 ? 'var(--red)' : 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '6px' }}>
              {overdueCount > 0 ? '⚠️ Overdue Tasks' : 'Deadlines On-Track'}
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
              <span style={{ fontSize: '26px', fontWeight: 800, color: overdueCount > 0 ? 'var(--red)' : 'var(--teal-mid)', lineHeight: 1 }}>
                {overdueCount}
              </span>
              <span style={{ fontSize: '12px', color: 'var(--ink4)' }}>
                {overdueCount === 1 ? 'needs attention' : overdueCount > 1 ? 'require action' : 'all on schedule'}
              </span>
            </div>
          </div>
        </StatCard>

        <StatCard color="teal">
          <div style={{ padding: '14px 16px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '6px' }}>
              Time Logged
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
              <span style={{ fontSize: '26px', fontWeight: 800, color: 'var(--teal-mid)', lineHeight: 1 }}>
                {formatHours(totalTrackedSeconds)}
              </span>
              <span style={{ fontSize: '12px', color: 'var(--ink4)' }}>total effort</span>
            </div>
          </div>
        </StatCard>
      </div>

      {/* ── Team Capacity Strip (Smooth Horizontal Scroll) ─────── */}
      {entries.length > 0 && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', padding: '0 2px' }}>
            <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--ink2)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
              Team Capacity & Workload
            </span>
            <span style={{ fontSize: '11px', color: 'var(--ink4)' }}>
              Click any team member to filter
            </span>
          </div>

          <div
            className="tm-scroll"
            style={{
              display: 'flex',
              gap: '12px',
              overflowX: 'auto',
              paddingBottom: '8px',
              scrollSnapType: 'x mandatory',
              ...CUSTOM_SCROLLBAR_STYLE,
            }}
          >
            {entries.map(([staffId, r]) => {
              const isSelected = selectedStaffId === staffId
              const donePercent = r.total > 0 ? (r.completed / r.total) * 100 : 0
              const inProgressPercent = r.total > 0 ? (r.in_progress / r.total) * 100 : 0
              const notStartedPercent = r.total > 0 ? (r.not_started / r.total) * 100 : 0

              return (
                <div
                  key={staffId}
                  onClick={() => onSelectStaff && onSelectStaff(isSelected ? null : staffId)}
                  style={{
                    flex: '0 0 230px',
                    cursor: onSelectStaff ? 'pointer' : 'default',
                    borderRadius: '12px',
                    transition: 'all 0.15s ease',
                    outline: isSelected ? '2px solid var(--teal-mid)' : 'none',
                    transform: isSelected ? 'translateY(-2px)' : 'none',
                    scrollSnapAlign: 'start',
                  }}
                >
                  <StatCard color="indigo">
                    <div style={{ padding: '14px 16px', position: 'relative' }}>
                      {isSelected && (
                        <div
                          style={{
                            position: 'absolute',
                            top: '10px',
                            right: '10px',
                            fontSize: '10px',
                            fontWeight: 700,
                            textTransform: 'uppercase',
                            letterSpacing: '0.5px',
                            color: 'var(--teal-mid)',
                            background: 'var(--border-light)',
                            padding: '2px 6px',
                            borderRadius: '4px',
                          }}
                        >
                          Filtered
                        </div>
                      )}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                        <Avatar name={r.name} size={20} />
                        <span
                          style={{
                            fontSize: '12px',
                            fontWeight: 700,
                            color: 'var(--ink2)',
                            maxWidth: '140px',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {r.name}
                        </span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginBottom: '8px' }}>
                        <span style={{ fontSize: '24px', fontWeight: 800, color: 'var(--ink)', lineHeight: 1 }}>{r.total}</span>
                        <span style={{ fontSize: '11px', color: 'var(--ink4)' }}>{r.total === 1 ? 'task' : 'tasks'}</span>
                      </div>

                      {/* Segmented Mini Progress bar */}
                      <div
                        style={{
                          height: '4px',
                          width: '100%',
                          borderRadius: '2px',
                          background: 'var(--border-light)',
                          display: 'flex',
                          overflow: 'hidden',
                          marginBottom: '10px',
                        }}
                      >
                        <div style={{ width: `${donePercent}%`, background: 'var(--teal)', height: '100%' }} title={`Done: ${r.completed}`} />
                        <div style={{ width: `${inProgressPercent}%`, background: 'var(--purple)', height: '100%' }} title={`In Progress: ${r.in_progress}`} />
                        <div style={{ width: `${notStartedPercent}%`, background: 'var(--ink4)', height: '100%' }} title={`Not Started: ${r.not_started}`} />
                      </div>

                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                        {BREAKDOWN.map(b => (
                          <div key={b.key} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: b.dot, flexShrink: 0 }} />
                            <span style={{ fontSize: '10px', color: 'var(--ink4)' }}>{r[b.key]} {b.label}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </StatCard>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
