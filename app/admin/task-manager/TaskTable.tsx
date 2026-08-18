'use client'
import { Avatar, PillSelect } from './ui'
import { PRIORITIES, PRIORITY_COLOR, STATUSES, STATUS_COLOR, Task, TaskPriority, TaskStatus, formatHours } from './types'

interface Props {
  tasks: Task[]
  currentStaffId: string | null
  runningTaskId: string | null
  onOpenTask: (task: Task) => void
  onStatusChange: (taskId: string, newStatus: TaskStatus) => void
  onPriorityChange: (taskId: string, newPriority: TaskPriority) => void
  onTimerAction: (taskId: string, action: 'start' | 'pause' | 'stop') => void
  onDelete: (taskId: string) => void
}

export default function TaskTable({ tasks, currentStaffId, runningTaskId, onOpenTask, onStatusChange, onPriorityChange, onTimerAction, onDelete }: Props) {
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
            {['Event', 'Task', 'Created', 'Assigned By', 'Assigned To', 'Deadline', 'Priority', 'Status', 'Tracked', 'Timer', ''].map(h => (
              <th key={h} style={{ padding: '10px 12px', fontSize: '11px', fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.3px', whiteSpace: 'nowrap' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {tasks.map(t => {
            const isMine = currentStaffId && t.assigned_to === currentStaffId
            const isRunning = runningTaskId === t.id
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
                <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }} onClick={e => e.stopPropagation()}>
                  {isMine && t.status !== 'Completed' ? (
                    <button
                      type="button"
                      onClick={() => onTimerAction(t.id, isRunning ? 'stop' : 'start')}
                      style={{
                        fontSize: '11px', fontWeight: 700, padding: '4px 10px', borderRadius: '6px', border: 'none', cursor: 'pointer',
                        background: isRunning ? 'var(--danger)' : 'var(--teal-mid)', color: 'var(--surface)',
                      }}
                    >
                      {isRunning ? '■ Stop' : '▶ Start'}
                    </button>
                  ) : <span style={{ color: 'var(--ink4)' }}>—</span>}
                </td>
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
