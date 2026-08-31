'use client'
import { useState } from 'react'
import StatCard from '@/app/components/ui/StatCard'
import { Avatar, CUSTOM_SCROLLBAR_STYLE } from './ui'
import { StaffLite, formatHours } from './types'

export type AssigneeCounts = Record<string, { name: string; total: number; not_started: number; in_progress: number; completed: number }>

interface Props {
  counts: AssigneeCounts
  staff?: StaffLite[]
  onQuickAssignForStaff?: (staffId: string) => void
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
  staff = [],
  onQuickAssignForStaff,
  selectedStaffId,
  onSelectStaff,
  totalTasksCount,
  inProgressCount,
  completedCount,
  overdueCount,
  totalTrackedSeconds,
}: Props) {
  const [showIdleTray, setShowIdleTray] = useState(false)

  // Only show staff members who currently have active (in-progress or not-started) tasks
  const entries = Object.entries(counts)
    .filter(([, r]) => (r.in_progress + r.not_started) > 0)
    .sort(([, a], [, b]) => (b.in_progress + b.not_started) - (a.in_progress + a.not_started))
  const activeTasksCount = Math.max(0, totalTasksCount - completedCount)
  const completionRate = totalTasksCount > 0 ? Math.round((completedCount / totalTasksCount) * 100) : 0

  // Staff members with 0 active tasks (available capacity)
  const idleStaff = staff.filter(s => {
    const r = counts[s.id]
    const active = r ? r.in_progress + r.not_started : 0
    return active === 0
  })

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
              Active Tasks
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
              <span style={{ fontSize: '26px', fontWeight: 800, color: 'var(--ink)', lineHeight: 1 }}>{activeTasksCount}</span>
              <span style={{ fontSize: '12px', color: 'var(--ink4)' }}>
                {completedCount} done ({completionRate}%)
              </span>
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
      {(entries.length > 0 || idleStaff.length > 0) && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', marginBottom: '8px', padding: '0 2px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--ink2)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                Team Capacity & Workload
              </span>
              {idleStaff.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowIdleTray(!showIdleTray)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    padding: '2px 8px',
                    borderRadius: '12px',
                    background: showIdleTray ? 'var(--teal)' : 'var(--teal-light)',
                    color: showIdleTray ? 'var(--surface)' : 'var(--teal-mid)',
                    border: '1px solid var(--border)',
                    fontSize: '11px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                  title="Click to view team members with 0 active tasks"
                >
                  <span style={{ fontSize: '9px' }}>🟢</span>
                  <span>{idleStaff.length} Available (0 tasks)</span>
                  <span style={{ fontSize: '9px', opacity: 0.8 }}>{showIdleTray ? '▲' : '▼'}</span>
                </button>
              )}
            </div>

            <span style={{ fontSize: '11px', color: 'var(--ink4)' }}>
              Click any team member to filter
            </span>
          </div>

          {/* ── Expandable Available / Idle Tray ───────────────── */}
          {showIdleTray && idleStaff.length > 0 && (
            <div
              className="tm-scroll"
              style={{
                display: 'flex',
                gap: '10px',
                overflowX: 'auto',
                padding: '12px 14px',
                marginBottom: '12px',
                background: 'var(--surface)',
                borderRadius: '10px',
                border: '1px solid var(--border-light)',
                ...CUSTOM_SCROLLBAR_STYLE,
              }}
            >
              {idleStaff.map(s => {
                const r = counts[s.id]
                const completed = r?.completed ?? 0

                return (
                  <div
                    key={s.id}
                    style={{
                      flex: '0 0 auto',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '8px 12px',
                      background: 'var(--card)',
                      borderRadius: '8px',
                      border: '1px solid var(--border)',
                    }}
                  >
                    <Avatar name={s.name} size={22} />
                    <div>
                      <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--ink)' }}>{s.name}</div>
                      <div style={{ fontSize: '10px', color: 'var(--teal)', fontWeight: 600 }}>
                        🟢 0 active {completed > 0 ? `· ${completed} done` : ''}
                      </div>
                    </div>
                    {onQuickAssignForStaff && (
                      <button
                        type="button"
                        onClick={() => onQuickAssignForStaff(s.id)}
                        style={{
                          marginLeft: '4px',
                          padding: '3px 8px',
                          fontSize: '11px',
                          fontWeight: 700,
                          borderRadius: '6px',
                          border: 'none',
                          background: 'var(--teal-light)',
                          color: 'var(--teal-mid)',
                          cursor: 'pointer',
                        }}
                        title={`Assign a new task to ${s.name}`}
                      >
                        + Assign
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}

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
              const activeCount = r.in_progress + r.not_started
              const inProgressPercent = activeCount > 0 ? (r.in_progress / activeCount) * 100 : 0
              const notStartedPercent = activeCount > 0 ? (r.not_started / activeCount) * 100 : 0

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
                        <span style={{ fontSize: '24px', fontWeight: 800, color: 'var(--ink)', lineHeight: 1 }}>{activeCount}</span>
                        <span style={{ fontSize: '11px', color: 'var(--ink4)' }}>{activeCount === 1 ? 'active task' : 'active tasks'}</span>
                        {r.completed > 0 && (
                          <span style={{ fontSize: '11px', color: 'var(--teal)', marginLeft: 'auto', fontWeight: 600 }}>
                            {r.completed} done
                          </span>
                        )}
                      </div>

                      {/* Segmented Active Progress bar (In Progress vs Not Started) */}
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
                        <div style={{ width: `${inProgressPercent}%`, background: 'var(--purple)', height: '100%' }} title={`In Progress: ${r.in_progress}`} />
                        <div style={{ width: `${notStartedPercent}%`, background: 'var(--ink4)', height: '100%' }} title={`Not Started: ${r.not_started}`} />
                      </div>

                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: 'var(--purple)', flexShrink: 0 }} />
                          <span style={{ fontSize: '10px', color: 'var(--ink3)' }}>{r.in_progress} In progress</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: 'var(--ink4)', flexShrink: 0 }} />
                          <span style={{ fontSize: '10px', color: 'var(--ink4)' }}>{r.not_started} Not started</span>
                        </div>
                        {r.completed > 0 && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: 'var(--teal)', flexShrink: 0 }} />
                            <span style={{ fontSize: '10px', color: 'var(--teal)' }}>{r.completed} Done</span>
                          </div>
                        )}
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
