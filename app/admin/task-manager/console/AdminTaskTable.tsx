'use client'
import { Avatar, PillSelect, SearchableSelect } from '../ui'
import { PRIORITIES, PRIORITY_COLOR, STATUSES, STATUS_COLOR, StaffLite, Task, TaskPriority, TaskStatus } from '../types'

const STALE_DAYS = 7

interface Props {
  tasks: Task[]
  staff: StaffLite[]
  now: number // sourced from an effect in the parent, not read directly here — see console/page.tsx
  onReassign: (taskId: string, newAssignee: string) => void
  onStatusChange: (taskId: string, newStatus: TaskStatus) => void
  onPriorityChange: (taskId: string, newPriority: TaskPriority) => void
  onDelete: (taskId: string) => void
}

export default function AdminTaskTable({ tasks, staff, now, onReassign, onStatusChange, onPriorityChange, onDelete }: Props) {
  if (tasks.length === 0) {
    return <div style={{ padding: '48px', textAlign: 'center', color: 'var(--ink4)', fontSize: '13px' }}>No tasks match this filter.</div>
  }

  const today = new Date(new Date(now).toDateString())

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
            {['Event', 'Task', 'Created', 'Assigned To', 'Assigned By', 'Deadline', 'Priority', 'Status', 'Last Updated', ''].map(h => (
              <th key={h} style={{ padding: '10px 12px', fontSize: '11px', fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.3px', whiteSpace: 'nowrap' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {tasks.map(t => {
            const isOverdue = t.deadline && t.status !== 'Completed' && new Date(t.deadline) < today
            const idleDays = Math.floor((now - new Date(t.updated_at).getTime()) / (1000 * 60 * 60 * 24))
            const isStale = t.status !== 'Completed' && idleDays >= STALE_DAYS

            return (
              <tr key={t.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                <td style={{ padding: '10px 12px', color: 'var(--ink3)', whiteSpace: 'nowrap' }}>{t.event?.name ?? '—'}</td>
                <td style={{ padding: '10px 12px', maxWidth: '260px' }}>
                  <div style={{ color: 'var(--ink)', fontWeight: 600 }}>{t.description}</div>
                  {t.remarks && <div style={{ fontSize: '11px', color: 'var(--ink4)', marginTop: '2px' }}>{t.remarks}</div>}
                </td>
                <td style={{ padding: '10px 12px', color: 'var(--ink4)', whiteSpace: 'nowrap' }} title={new Date(t.created_at).toLocaleString('en-GB')}>
                  {new Date(t.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                </td>
                <td style={{ padding: '10px 12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {t.assigned_to_staff && <Avatar name={t.assigned_to_staff.name} size={20} />}
                    <SearchableSelect
                      compact
                      options={staff.map(s => ({ id: s.id, label: s.name }))}
                      value={t.assigned_to}
                      onChange={newId => onReassign(t.id, newId)}
                      placeholder="Search staff…"
                    />
                  </div>
                </td>
                <td style={{ padding: '10px 12px', color: 'var(--ink3)', whiteSpace: 'nowrap' }}>{t.assigned_by_staff?.name ?? '—'}</td>
                <td style={{ padding: '10px 12px', whiteSpace: 'nowrap', color: isOverdue ? 'var(--red)' : 'var(--ink3)', fontWeight: isOverdue ? 700 : 400 }}>
                  {t.deadline ?? '—'}
                </td>
                <td style={{ padding: '10px 12px' }}>
                  <PillSelect pillColor={PRIORITY_COLOR[t.priority]} value={t.priority} onChange={e => onPriorityChange(t.id, e.target.value as TaskPriority)}>
                    {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
                  </PillSelect>
                </td>
                <td style={{ padding: '10px 12px' }}>
                  <PillSelect pillColor={STATUS_COLOR[t.status]} value={t.status} onChange={e => onStatusChange(t.id, e.target.value as TaskStatus)}>
                    {STATUSES.map(s => <option key={s} value={s}>{s.replace('-', ' ')}</option>)}
                  </PillSelect>
                </td>
                <td style={{ padding: '10px 12px', whiteSpace: 'nowrap', color: isStale ? 'var(--amber)' : 'var(--ink4)', fontWeight: isStale ? 700 : 400 }}>
                  {idleDays === 0 ? 'today' : `${idleDays}d ago`}
                </td>
                <td style={{ padding: '10px 12px' }}>
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
