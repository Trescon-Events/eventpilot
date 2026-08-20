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
  onOpenTask: (task: Task) => void
  onStatusChange: (taskId: string, newStatus: TaskStatus) => void
  onPriorityChange: (taskId: string, newPriority: TaskPriority) => void
  onTimerAction?: (taskId: string, action: 'start' | 'pause' | 'stop') => void
  onDelete: (taskId: string) => void
}

export default function TaskTable({ tasks, onOpenTask, onStatusChange, onPriorityChange, onDelete }: Props) {
  if (tasks.length === 0) {
    return (
      <div style={{ padding: '48px', textAlign: 'center', color: 'var(--ink4)', fontSize: '13px' }}>
        No tasks match the current filters.
      </div>
    )
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
            {['Event', 'Task', 'Created', 'Assigned By', 'Assigned To', 'Deadline', 'Priority', 'Status', 'Tracked', ''].map(h => (
              <th key={h} style={{ padding: '10px 12px', fontSize: '11px', fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.3px', whiteSpace: 'nowrap' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {tasks.map(t => {
            return (
              <tr
                key={t.id}
                onClick={() => onOpenTask(t)}
                style={{ borderBottom: '1px solid var(--border-light)', cursor: 'pointer', transition: 'background 0.1s' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--border-light)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <td style={{ padding: '10px 12px', color: 'var(--ink3)', whiteSpace: 'nowrap' }}>{t.event?.name ?? '—'}</td>
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
                </td>
                <td style={{ padding: '10px 12px', color: 'var(--ink4)', whiteSpace: 'nowrap' }} title={new Date(t.created_at).toLocaleString('en-GB')}>
                  {new Date(t.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                </td>
                <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                  {t.assigned_by_staff && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Avatar name={t.assigned_by_staff.name} size={22} />
                      <span style={{ color: 'var(--ink3)' }}>{t.assigned_by_staff.name}</span>
                      <FollowupButton task={t} />
                    </div>
                  )}
                </td>
                <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                  {t.assigned_to_staff && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Avatar name={t.assigned_to_staff.name} size={22} />
                      <span style={{ color: 'var(--ink)', fontWeight: 600 }}>{t.assigned_to_staff.name}</span>
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
                <td style={{ padding: '10px 12px', color: 'var(--ink3)', whiteSpace: 'nowrap' }}>{formatHours(t.tracked_seconds)}</td>
                <td style={{ padding: '10px 12px' }} onClick={e => e.stopPropagation()}>
                  <button type="button" onClick={() => onDelete(t.id)} title="Delete task" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink4)', fontSize: '13px' }}>
                    ✕
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
