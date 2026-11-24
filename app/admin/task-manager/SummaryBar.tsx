'use client'
import { useRef } from 'react'
import StatCard from '@/app/components/ui/StatCard'
import { Avatar, CUSTOM_SCROLLBAR_STYLE } from './ui'
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
  const firstAvailableRef = useRef<HTMLDivElement | null>(null)

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

      {/* ── Team Capacity & Workload Strip (Design 1: Horizontal Person Pills) ── */}
      {(entries.length > 0 || idleStaff.length > 0) && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', marginBottom: '10px', padding: '0 2px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--ink2)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                Team Capacity & Workload
              </span>
              {idleStaff.length > 0 && (
                <button
                  type="button"
                  onClick={() => firstAvailableRef.current?.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' })}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    padding: '2px 9px',
                    borderRadius: '12px',
                    background: 'var(--teal-light)',
                    color: 'var(--teal-mid)',
                    border: '1px solid var(--border)',
                    fontSize: '11px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                  title="Jump to available Branding team & Vendors"
                >
                  <span style={{ fontSize: '9px' }}>🟢</span>
                  <span>{idleStaff.length} Available (0 tasks)</span>
                </button>
              )}
            </div>

            <span style={{ fontSize: '11px', color: 'var(--ink4)' }}>
              Click any busy member to filter · Click + Assign on available members
            </span>
          </div>

          <div
            className="tm-scroll"
            style={{
              display: 'flex',
              alignItems: 'stretch',
              gap: '10px',
              overflowX: 'auto',
              paddingBottom: '8px',
              scrollSnapType: 'x mandatory',
              ...CUSTOM_SCROLLBAR_STYLE,
            }}
          >
            {/* Busy Team Members (Horizontal Compact Person Pills) */}
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
                    flex: '0 0 auto',
                    minWidth: '235px',
                    maxWidth: '265px',
                    padding: '10px 14px',
                    borderRadius: '12px',
                    background: isSelected ? 'var(--teal-light)' : 'var(--card)',
                    border: isSelected ? '1px solid var(--teal-mid)' : '1px solid var(--border)',
                    cursor: onSelectStaff ? 'pointer' : 'default',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    transition: 'all 0.15s ease',
                    transform: isSelected ? 'translateY(-1px)' : 'none',
                    scrollSnapAlign: 'start',
                    boxSizing: 'border-box',
                  }}
                >
                  <div style={{ flexShrink: 0 }}>
                    <Avatar name={r.name} size={32} />
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span
                        style={{
                          fontSize: '13px',
                          fontWeight: 700,
                          color: 'var(--ink)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                        title={r.name}
                      >
                        {r.name}
                      </span>
                      {isSelected && (
                        <span
                          style={{
                            fontSize: '9px',
                            fontWeight: 800,
                            textTransform: 'uppercase',
                            color: 'var(--teal-mid)',
                            background: 'var(--surface)',
                            padding: '1px 5px',
                            borderRadius: '4px',
                            flexShrink: 0,
                          }}
                        >
                          Filtered
                        </span>
                      )}
                    </div>

                    <div style={{ fontSize: '11px', color: 'var(--ink4)', marginTop: '2px', whiteSpace: 'nowrap' }}>
                      <span style={{ color: 'var(--purple)', fontWeight: 600 }}>{r.in_progress} prog</span>
                      {' · '}
                      <span>{r.not_started} queue</span>
                    </div>

                    <div
                      style={{
                        height: '3px',
                        width: '100%',
                        borderRadius: '2px',
                        background: 'var(--border-light)',
                        display: 'flex',
                        overflow: 'hidden',
                        marginTop: '6px',
                      }}
                    >
                      <div style={{ width: `${inProgressPercent}%`, background: 'var(--purple)', height: '100%' }} title={`In Progress: ${r.in_progress}`} />
                      <div style={{ width: `${notStartedPercent}%`, background: 'var(--ink4)', height: '100%' }} title={`Not Started: ${r.not_started}`} />
                    </div>
                  </div>

                  <div
                    style={{
                      flexShrink: 0,
                      minWidth: '30px',
                      height: '30px',
                      padding: '0 6px',
                      borderRadius: '8px',
                      background: isSelected ? 'var(--teal-mid)' : 'var(--surface)',
                      border: isSelected ? 'none' : '1px solid var(--border-light)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '14px',
                      fontWeight: 800,
                      color: isSelected ? 'var(--surface)' : 'var(--ink)',
                    }}
                    title={`${activeCount} active task${activeCount === 1 ? '' : 's'}`}
                  >
                    {activeCount}
                  </div>
                </div>
              )
            })}

            {/* Visual separator between busy & available members */}
            {entries.length > 0 && idleStaff.length > 0 && (
              <div
                style={{
                  flex: '0 0 1px',
                  background: 'var(--border)',
                  margin: '6px 2px',
                }}
              />
            )}

            {/* Available / Free Team Members Inline (0 active tasks — Core Branding & Vendors) */}
            {idleStaff.map((s, idx) => (
              <div
                key={s.id}
                ref={idx === 0 ? firstAvailableRef : undefined}
                style={{
                  flex: '0 0 auto',
                  minWidth: '235px',
                  maxWidth: '305px',
                  padding: '10px 14px',
                  borderRadius: '12px',
                  background: 'var(--surface)',
                  border: '1px dashed var(--teal-mid)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  scrollSnapAlign: 'start',
                  boxSizing: 'border-box',
                }}
              >
                <div style={{ flexShrink: 0 }}>
                  <Avatar name={s.name} size={32} />
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span
                      style={{
                        fontSize: '13px',
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

                  <div style={{ fontSize: '11px', color: 'var(--teal-mid)', fontWeight: 600, marginTop: '3px', whiteSpace: 'nowrap' }}>
                    🟢 Available · 0 tasks
                  </div>
                </div>

                {onQuickAssignForStaff && (
                  <button
                    type="button"
                    onClick={() => onQuickAssignForStaff(s.id)}
                    style={{
                      flexShrink: 0,
                      padding: '5px 10px',
                      borderRadius: '7px',
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
    </div>
  )
}
