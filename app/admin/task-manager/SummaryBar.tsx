'use client'
import StatCard from '@/app/components/ui/StatCard'
import { Avatar } from './ui'
import { StaffLite, isCoreBrandingOrVendor } from './types'

export type AssigneeCounts = Record<string, { name: string; total: number; not_started: number; in_progress: number; completed: number }>

interface Props {
  counts: AssigneeCounts
  staff?: StaffLite[]
  onQuickAssignForStaff?: (staffId: string) => void
  selectedStaffId?: string | null
  onSelectStaff?: (staffId: string | null) => void
  totalTasksCount: number
  inProgressCount: number
  notStartedCount: number
  notStartedHighCount: number
  completedCount: number
  overdueCount: number
  dueTodayCount: number
  dueTomorrowCount: number
  highPriorityOpenCount: number
  highPriorityOverdueCount: number
}

export default function SummaryBar({
  counts,
  staff = [],
  onQuickAssignForStaff,
  selectedStaffId,
  onSelectStaff,
  totalTasksCount,
  inProgressCount,
  notStartedCount,
  notStartedHighCount,
  completedCount,
  overdueCount,
  dueTodayCount,
  dueTomorrowCount,
  highPriorityOpenCount,
  highPriorityOverdueCount,
}: Props) {
  // Only show staff members who currently have active (in-progress or not-started) tasks
  const entries = Object.entries(counts)
    .filter(([, r]) => (r.in_progress + r.not_started) > 0)
    .sort(([, a], [, b]) => (b.in_progress + b.not_started) - (a.in_progress + a.not_started))
  const activeTasksCount = Math.max(0, totalTasksCount - completedCount)
  const completionRate = totalTasksCount > 0 ? Math.round((completedCount / totalTasksCount) * 100) : 0

  // Core Branding team (Nazim, Waseem, Sajeesh, Shafi, Lohith, Krishanu, Sohaila, Durai, Rajesh VM) + Vendors with 0 active tasks
  const idleStaff = staff.filter(s => {
    if (!isCoreBrandingOrVendor(s)) return false
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
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
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

        <StatCard color="teal">
          <div style={{ padding: '14px 16px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '6px' }}>
              Not Started
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
              <span style={{ fontSize: '26px', fontWeight: 800, color: 'var(--teal-mid)', lineHeight: 1 }}>{notStartedCount}</span>
              <span style={{ fontSize: '12px', color: 'var(--ink4)' }}>
                {notStartedHighCount > 0 ? `${notStartedHighCount} high priority` : 'in queue'}
              </span>
            </div>
          </div>
        </StatCard>

        <StatCard color="amber">
          <div style={{ padding: '14px 16px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: dueTodayCount > 0 ? 'var(--amber)' : 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '6px' }}>
              Due Today
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
              <span style={{ fontSize: '26px', fontWeight: 800, color: dueTodayCount > 0 ? 'var(--amber)' : 'var(--ink)', lineHeight: 1 }}>
                {dueTodayCount}
              </span>
              <span style={{ fontSize: '12px', color: 'var(--ink4)' }}>
                {dueTomorrowCount > 0 ? `${dueTomorrowCount} tomorrow` : 'clear tomorrow'}
              </span>
            </div>
          </div>
        </StatCard>

        <StatCard color="red">
          <div style={{ padding: '14px 16px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: highPriorityOpenCount > 0 ? 'var(--red)' : 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '6px' }}>
              High Priority Open
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
              <span style={{ fontSize: '26px', fontWeight: 800, color: highPriorityOpenCount > 0 ? 'var(--red)' : 'var(--ink)', lineHeight: 1 }}>
                {highPriorityOpenCount}
              </span>
              <span style={{ fontSize: '12px', color: 'var(--ink4)' }}>
                {highPriorityOverdueCount > 0 ? `${highPriorityOverdueCount} overdue` : 'urgent open'}
              </span>
            </div>
          </div>
        </StatCard>

        <StatCard color={overdueCount > 0 ? 'red' : 'lime'}>
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
      </div>

      {/* ── Team Capacity & Workload (Concept B: Split Panel — Available Left · Active Grid Right) ── */}
      {(entries.length > 0 || idleStaff.length > 0) && (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '12px',
            alignItems: 'stretch',
          }}
        >
          {/* Left Panel: Available Now (0 tasks — Core Branding & Vendors) */}
          {idleStaff.length > 0 && (
            <div
              style={{
                flex: entries.length > 0 ? '0 1 280px' : '1 1 100%',
                minWidth: '240px',
                background: 'var(--surface)',
                border: '1px solid var(--teal-mid)',
                borderRadius: '12px',
                padding: '12px 14px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                boxSizing: 'border-box',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  fontSize: '10.5px',
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  letterSpacing: '0.6px',
                  color: 'var(--teal-mid)',
                }}
              >
                <span>🟢 Available Now (0 tasks)</span>
                <span>{idleStaff.length} free</span>
              </div>

              <div
                style={{
                  display: entries.length > 0 ? 'flex' : 'grid',
                  flexDirection: 'column',
                  gridTemplateColumns: entries.length > 0 ? undefined : 'repeat(auto-fill, minmax(220px, 1fr))',
                  gap: '6px',
                }}
              >
                {idleStaff.map(s => (
                  <div
                    key={s.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '8px',
                      padding: '7px 10px',
                      borderRadius: '8px',
                      background: 'var(--card)',
                      border: '1px solid var(--border-light)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                      <div style={{ flexShrink: 0 }}>
                        <Avatar name={s.name} size={26} />
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '5px', minWidth: 0 }}>
                        <span
                          style={{
                            fontSize: '12.5px',
                            fontWeight: 700,
                            color: 'var(--ink)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                          title={s.name}
                        >
                          {s.name}
                        </span>
                        {s.account_type === 'vendor' && (
                          <span
                            style={{
                              fontSize: '9px',
                              fontWeight: 700,
                              textTransform: 'uppercase',
                              color: 'var(--purple)',
                              background: 'var(--purple-light)',
                              padding: '1px 5px',
                              borderRadius: '4px',
                              flexShrink: 0,
                            }}
                          >
                            Vendor
                          </span>
                        )}
                      </div>
                    </div>

                    {onQuickAssignForStaff && (
                      <button
                        type="button"
                        onClick={() => onQuickAssignForStaff(s.id)}
                        style={{
                          flexShrink: 0,
                          padding: '3px 9px',
                          borderRadius: '6px',
                          background: 'var(--teal-light)',
                          color: 'var(--teal-mid)',
                          border: '1px solid var(--teal-mid)',
                          fontSize: '11px',
                          fontWeight: 700,
                          cursor: 'pointer',
                          whiteSpace: 'nowrap',
                        }}
                        title={`Assign a new task to ${s.name}`}
                      >
                        + Assign
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Right Panel: Active Workload Grid (Zero Horizontal Scroll) */}
          {entries.length > 0 && (
            <div
              style={{
                flex: '1 1 520px',
                minWidth: 0,
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: '12px',
                padding: '12px 14px',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
                boxSizing: 'border-box',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                <span
                  style={{
                    fontSize: '10.5px',
                    fontWeight: 800,
                    textTransform: 'uppercase',
                    letterSpacing: '0.6px',
                    color: 'var(--ink3)',
                  }}
                >
                  Active Workload ({entries.length} busy)
                </span>
                <span style={{ fontSize: '11px', color: 'var(--ink4)' }}>
                  Click any member to filter
                </span>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(175px, 1fr))',
                  gap: '8px',
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
                      title={`${r.name} · ${r.in_progress} in progress, ${r.not_started} queued`}
                      style={{
                        position: 'relative',
                        overflow: 'hidden',
                        padding: '9px 11px 11px',
                        borderRadius: '8px',
                        background: isSelected ? 'var(--teal-light)' : 'var(--card)',
                        border: isSelected ? '1px solid var(--teal-mid)' : '1px solid var(--border-light)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '8px',
                        cursor: onSelectStaff ? 'pointer' : 'default',
                        transition: 'all 0.15s ease',
                        boxSizing: 'border-box',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                        <div style={{ flexShrink: 0 }}>
                          <Avatar name={r.name} size={26} />
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                            <span
                              style={{
                                fontSize: '12.5px',
                                fontWeight: 700,
                                color: 'var(--ink)',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {r.name}
                            </span>
                          </div>
                          <div style={{ fontSize: '10.5px', color: 'var(--ink4)', marginTop: '1px', whiteSpace: 'nowrap' }}>
                            <span style={{ color: 'var(--purple)', fontWeight: 600 }}>{r.in_progress} prog</span>
                            {' · '}
                            <span>{r.not_started} queue</span>
                          </div>
                        </div>
                      </div>

                      <div
                        style={{
                          fontSize: '15px',
                          fontWeight: 800,
                          color: isSelected ? 'var(--teal-mid)' : 'var(--ink)',
                          flexShrink: 0,
                        }}
                      >
                        {activeCount}
                      </div>

                      {/* Subtle bottom edge progress bar */}
                      <div
                        style={{
                          position: 'absolute',
                          left: 0,
                          right: 0,
                          bottom: 0,
                          height: '2.5px',
                          background: 'var(--border-light)',
                          display: 'flex',
                        }}
                      >
                        <div style={{ width: `${inProgressPercent}%`, background: 'var(--purple)', height: '100%' }} />
                        <div style={{ width: `${notStartedPercent}%`, background: 'var(--ink4)', height: '100%' }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
