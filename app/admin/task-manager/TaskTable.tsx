'use client'
import { useState } from 'react'
import { Avatar, PillSelect } from './ui'
import { PRIORITIES, PRIORITY_COLOR, STATUSES, STATUS_COLOR, Task, TaskPriority, TaskStatus, formatHours } from './types'

function DeadlineBadge({ deadline, status }: { deadline: string | null; status: TaskStatus }) {
  if (!deadline) return <span style={{ color: 'var(--ink4)' }}>—</span>

  const target = new Date(deadline)
  const today = new Date(new Date().toDateString())
  const diffDays = Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

  if (status === 'Completed') {
    return (
      <span style={{ color: 'var(--ink4)', fontSize: '12px' }}>
        {target.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
      </span>
    )
  }

  if (diffDays < 0) {
    const daysLate = Math.abs(diffDays)
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          padding: '2px 8px',
          borderRadius: '6px',
          fontSize: '11px',
          fontWeight: 700,
          background: 'var(--red-light)',
          color: 'var(--red)',
          border: '1px solid var(--red-border)',
        }}
        title={`Overdue by ${daysLate} day${daysLate === 1 ? '' : 's'} (${deadline})`}
      >
        <span>⚠️</span> {daysLate === 0 ? 'Overdue' : `${daysLate}d overdue`}
      </span>
    )
  }

  if (diffDays === 0) {
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          padding: '2px 8px',
          borderRadius: '6px',
          fontSize: '11px',
          fontWeight: 700,
          background: 'var(--amber-light)',
          color: 'var(--amber)',
          border: '1px solid var(--amber-border)',
        }}
        title={`Due Today (${deadline})`}
      >
        <span>🟡</span> Today
      </span>
    )
  }

  if (diffDays === 1) {
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          padding: '2px 8px',
          borderRadius: '6px',
          fontSize: '11px',
          fontWeight: 600,
          background: 'var(--border-light)',
          color: 'var(--ink2)',
        }}
        title={`Due Tomorrow (${deadline})`}
      >
        Tomorrow
      </span>
    )
  }

  if (diffDays <= 3) {
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          padding: '2px 8px',
          borderRadius: '6px',
          fontSize: '11px',
          fontWeight: 600,
          background: 'var(--border-light)',
          color: 'var(--ink3)',
        }}
        title={`Due in ${diffDays} days (${deadline})`}
      >
        In {diffDays}d
      </span>
    )
  }

  return (
    <span style={{ color: 'var(--ink3)', fontSize: '12px' }}>
      {target.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
    </span>
  )
}

function FollowupButton({ task }: { task: Task }) {
  const [open, setOpen] = useState(false)
  const assigner = task.assigned_by_staff
  if (!assigner) return null

  const email = (assigner as { id: string; name: string; email?: string }).email
    || `${assigner.name.toLowerCase().replace(/\s+/g, '')}@tresconglobal.com`

  const eventName = task.event?.name ?? 'General'
  const teamsMsg = `Hi, I am following up regarding the task "${task.description}" for ${eventName}. Current status: ${task.status}.`
  const teamsUrl = `https://teams.microsoft.com/l/chat/0/0?users=${encodeURIComponent(email)}&message=${encodeURIComponent(teamsMsg)}`

  const emailSubject = `Follow-up: [${eventName}] ${task.description}`
  const emailBody = `Hi ${assigner.name},\n\nI'm following up on the task: "${task.description}" for "${eventName}".\n\nCurrent Status: ${task.status}\nRemarks: ${task.remarks || 'None'}\n\nBest regards`
  const emailUrl = `mailto:${email}?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`

  return (
    <div style={{ position: 'relative', display: 'inline-block' }} onClick={e => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        title={`Follow-up with ${assigner.name}`}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: '2px',
          borderRadius: '4px',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '18px',
            height: '18px',
            borderRadius: '4px',
            background: 'var(--border-light)',
            color: 'var(--teal-mid)',
          }}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
          </svg>
        </span>
      </button>

      {open && (
        <>
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 50 }}
            onClick={() => setOpen(false)}
          />
          <div
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              zIndex: 51,
              marginTop: '4px',
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              boxShadow: '0 8px 24px var(--border)',
              padding: '8px',
              minWidth: '180px',
              fontSize: '12px',
            }}
          >
            <div style={{ padding: '4px 8px', color: 'var(--ink4)', fontSize: '11px', borderBottom: '1px solid var(--border-light)', marginBottom: '4px' }}>
              Follow up with <strong>{assigner.name}</strong>
            </div>
            <a
              href={teamsUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setOpen(false)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 8px',
                color: 'var(--ink)',
                textDecoration: 'none',
                borderRadius: '4px',
                transition: 'background 0.1s',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--border-light)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <span>💬</span> Ping on MS Teams
            </a>
            <a
              href={emailUrl}
              onClick={() => setOpen(false)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 8px',
                color: 'var(--ink)',
                textDecoration: 'none',
                borderRadius: '4px',
                transition: 'background 0.1s',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--border-light)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <span>✉️</span> Send Outlook Email
            </a>
          </div>
        </>
      )}
    </div>
  )
}

interface Props {
  tasks: Task[]
  currentStaffId?: string | null
  runningTaskId?: string | null
  groupByEvent?: boolean
  onOpenTask: (task: Task) => void
  onStatusChange: (taskId: string, newStatus: TaskStatus) => void
  onPriorityChange: (taskId: string, newPriority: TaskPriority) => void
  onTimerAction?: (taskId: string, action: 'start' | 'pause' | 'stop') => void
  onDelete: (taskId: string) => void
}

function TaskRow({
  task: t,
  showEventColumn,
  onOpenTask,
  onStatusChange,
  onPriorityChange,
  onDelete,
}: {
  task: Task
  showEventColumn: boolean
  onOpenTask: (task: Task) => void
  onStatusChange: (taskId: string, newStatus: TaskStatus) => void
  onPriorityChange: (taskId: string, newPriority: TaskPriority) => void
  onDelete: (taskId: string) => void
}) {
  return (
    <tr
      onClick={() => onOpenTask(t)}
      style={{ borderBottom: '1px solid var(--border-light)', cursor: 'pointer', transition: 'background 0.1s' }}
      onMouseEnter={e => (e.currentTarget.style.background = 'var(--border-light)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
    >
      {showEventColumn && (
        <td style={{ padding: '10px 12px', color: 'var(--ink3)', whiteSpace: 'nowrap', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {t.event?.name ?? '—'}
        </td>
      )}
      <td style={{ padding: '10px 12px', maxWidth: '320px' }}>
        <div style={{ color: 'var(--ink)', fontWeight: 600, lineHeight: 1.35 }}>{t.description}</div>
        {t.remarks && (
          <div
            style={{
              fontSize: '11px',
              color: 'var(--ink3)',
              marginTop: '4px',
              padding: '2px 6px',
              borderRadius: '4px',
              background: 'var(--border-light)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              maxWidth: '100%',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
            title={t.remarks}
          >
            <span style={{ fontSize: '10px', color: 'var(--teal-mid)' }}>📝</span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.remarks}</span>
          </div>
        )}
        {t.attachment_url && (
          <a
            href={t.attachment_url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            style={{
              fontSize: '11px',
              color: 'var(--teal)',
              marginTop: '4px',
              marginLeft: t.remarks ? '6px' : '0',
              padding: '2px 6px',
              borderRadius: '4px',
              background: 'var(--teal-light)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              textDecoration: 'none',
              maxWidth: '100%',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
            title={t.attachment_name || 'View attached file'}
          >
            <span>📎</span>
            <span>{t.attachment_name || 'Attachment'}</span>
          </a>
        )}
      </td>
      <td style={{ padding: '10px 12px', color: 'var(--ink4)', whiteSpace: 'nowrap' }} title={new Date(t.created_at).toLocaleString('en-GB')}>
        {new Date(t.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
      </td>
      <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
        {t.assigned_by_staff && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Avatar name={t.assigned_by_staff.name} size={20} />
            <span style={{ color: 'var(--ink3)', fontSize: '12px' }}>{t.assigned_by_staff.name}</span>
            <FollowupButton task={t} />
          </div>
        )}
      </td>
      <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
        {t.assigned_to_staff && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Avatar name={t.assigned_to_staff.name} size={20} />
            <span style={{ color: 'var(--ink)', fontWeight: 600, fontSize: '12px' }}>{t.assigned_to_staff.name}</span>
          </div>
        )}
      </td>
      <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
        <DeadlineBadge deadline={t.deadline} status={t.status} />
      </td>
      <td style={{ padding: '10px 12px' }} onClick={e => e.stopPropagation()}>
        <PillSelect pillColor={PRIORITY_COLOR[t.priority]} value={t.priority} onChange={e => onPriorityChange(t.id, e.target.value as TaskPriority)}>
          {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
        </PillSelect>
      </td>
      <td style={{ padding: '10px 12px' }} onClick={e => e.stopPropagation()}>
        <PillSelect pillColor={STATUS_COLOR[t.status]} value={t.status} onChange={e => onStatusChange(t.id, e.target.value as TaskStatus)}>
          {STATUSES.map(s => <option key={s} value={s}>{s.replace('-', ' ')}</option>)}
        </PillSelect>
      </td>
      <td style={{ padding: '10px 12px', color: 'var(--ink3)', whiteSpace: 'nowrap', fontSize: '12px' }}>{formatHours(t.tracked_seconds)}</td>
      <td style={{ padding: '10px 12px', textAlign: 'center' }} onClick={e => e.stopPropagation()}>
        <button type="button" onClick={() => onDelete(t.id)} title="Delete task" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink4)', fontSize: '13px' }}>
          ✕
        </button>
      </td>
    </tr>
  )
}

export default function TaskTable({ tasks, groupByEvent, onOpenTask, onStatusChange, onPriorityChange, onDelete }: Props) {
  const [collapsedEvents, setCollapsedEvents] = useState<Record<string, boolean>>({})

  if (tasks.length === 0) {
    return (
      <div style={{ padding: '48px', textAlign: 'center', color: 'var(--ink4)', fontSize: '13px' }}>
        No tasks match the current filters.
      </div>
    )
  }

  // ── Event-Centric Grouping ──────────────────────────────────
  if (groupByEvent) {
    const groups: Record<string, Task[]> = {}
    for (const t of tasks) {
      const key = t.event?.name ?? 'General / Non-Event Tasks'
      if (!groups[key]) groups[key] = []
      groups[key].push(t)
    }

    const toggleGroup = (eventKey: string) => {
      setCollapsedEvents(prev => ({ ...prev, [eventKey]: !prev[eventKey] }))
    }

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {Object.entries(groups).map(([eventName, eventTasks]) => {
          const isCollapsed = !!collapsedEvents[eventName]
          const completedCount = eventTasks.filter(t => t.status === 'Completed').length
          const percent = Math.round((completedCount / eventTasks.length) * 100)

          return (
            <div
              key={eventName}
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: '10px',
                overflow: 'hidden',
              }}
            >
              {/* Event Section Accordion Header */}
              <div
                onClick={() => toggleGroup(eventName)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 16px',
                  background: 'var(--card)',
                  borderBottom: isCollapsed ? 'none' : '1px solid var(--border-light)',
                  cursor: 'pointer',
                  userSelect: 'none',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '12px', color: 'var(--teal-mid)', transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}>
                    ▼
                  </span>
                  <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--ink)' }}>
                    {eventName}
                  </span>
                  <span style={{ fontSize: '11px', color: 'var(--ink4)', background: 'var(--border-light)', padding: '2px 8px', borderRadius: '12px' }}>
                    {eventTasks.length} {eventTasks.length === 1 ? 'task' : 'tasks'}
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <div style={{ width: '60px', height: '5px', background: 'var(--border-light)', borderRadius: '3px', overflow: 'hidden' }}>
                      <div style={{ width: `${percent}%`, height: '100%', background: 'var(--teal)' }} />
                    </div>
                    <span style={{ fontSize: '11px', color: 'var(--ink3)' }}>{percent}%</span>
                  </div>
                </div>
              </div>

              {!isCollapsed && (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left', background: 'var(--surface)' }}>
                        {['Task', 'Created', 'Assigned By', 'Assigned To', 'Deadline', 'Priority', 'Status', 'Tracked', ''].map(h => (
                          <th key={h} style={{ padding: '10px 12px', fontSize: '11px', fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.3px', whiteSpace: 'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {eventTasks.map(t => (
                        <TaskRow
                          key={t.id}
                          task={t}
                          showEventColumn={false}
                          onOpenTask={onOpenTask}
                          onStatusChange={onStatusChange}
                          onPriorityChange={onPriorityChange}
                          onDelete={onDelete}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )
        })}
      </div>
    )
  }

  // ── Standard Flat Table Mode (with sticky header) ───────────
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left', position: 'sticky', top: 0, background: 'var(--surface)', zIndex: 5 }}>
            {['Event', 'Task', 'Created', 'Assigned By', 'Assigned To', 'Deadline', 'Priority', 'Status', 'Tracked', ''].map(h => (
              <th key={h} style={{ padding: '10px 12px', fontSize: '11px', fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.3px', whiteSpace: 'nowrap' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {tasks.map(t => (
            <TaskRow
              key={t.id}
              task={t}
              showEventColumn={true}
              onOpenTask={onOpenTask}
              onStatusChange={onStatusChange}
              onPriorityChange={onPriorityChange}
              onDelete={onDelete}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}
