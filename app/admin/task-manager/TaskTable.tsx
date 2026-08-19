'use client'
import { useState } from 'react'
import { Avatar, PillSelect } from './ui'
import { PRIORITIES, PRIORITY_COLOR, STATUSES, STATUS_COLOR, Task, TaskPriority, TaskStatus, formatHours } from './types'

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
          padding: '2px 4px',
          fontSize: '13px',
          color: 'var(--teal-mid, #0d9488)',
          borderRadius: '4px',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '2px',
        }}
      >
        💬
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
              background: 'var(--surface, #1e293b)',
              border: '1px solid var(--border, #334155)',
              borderRadius: '8px',
              boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.4)',
              padding: '8px',
              minWidth: '180px',
              fontSize: '12px',
            }}
          >
            <div style={{ padding: '4px 8px', color: 'var(--ink4)', fontSize: '11px', borderBottom: '1px solid var(--border-light, #334155)', marginBottom: '4px' }}>
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
                color: 'var(--ink, #fff)',
                textDecoration: 'none',
                borderRadius: '4px',
                transition: 'background 0.1s',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--border-light, #334155)')}
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
                color: 'var(--ink, #fff)',
                textDecoration: 'none',
                borderRadius: '4px',
                transition: 'background 0.1s',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--border-light, #334155)')}
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
  currentStaffId: string | null
  runningTaskId?: string | null
  onOpenTask: (task: Task) => void
  onStatusChange: (taskId: string, newStatus: TaskStatus) => void
  onPriorityChange: (taskId: string, newPriority: TaskPriority) => void
  onTimerAction?: (taskId: string, action: 'start' | 'pause' | 'stop') => void
  onDelete: (taskId: string) => void
}

export default function TaskTable({ tasks, currentStaffId, onOpenTask, onStatusChange, onPriorityChange, onDelete }: Props) {
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
            const isOverdue = t.deadline && t.status !== 'Completed' && new Date(t.deadline) < new Date(new Date().toDateString())

            return (
              <tr
                key={t.id}
                onClick={() => onOpenTask(t)}
                style={{ borderBottom: '1px solid var(--border-light)', cursor: 'pointer', transition: 'background 0.1s' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--border-light)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <td style={{ padding: '10px 12px', color: 'var(--ink3)', whiteSpace: 'nowrap' }}>{t.event?.name ?? '—'}</td>
                <td style={{ padding: '10px 12px', maxWidth: '280px' }}>
                  <div style={{ color: 'var(--ink)', fontWeight: 600 }}>{t.description}</div>
                  {t.remarks && <div style={{ fontSize: '11px', color: 'var(--ink4)', marginTop: '2px' }}>{t.remarks}</div>}
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
                <td style={{ padding: '10px 12px', whiteSpace: 'nowrap', color: isOverdue ? 'var(--red)' : 'var(--ink3)', fontWeight: isOverdue ? 700 : 400 }}>
                  {t.deadline ?? '—'}
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
