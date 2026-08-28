'use client'
import { useEffect, useMemo, useState } from 'react'
import Button from '@/app/components/ui/Button'
import Card from '@/app/components/ui/Card'
import PageHeader from '@/app/components/PageHeader'
import StatCard from '@/app/components/ui/StatCard'
import { WorkloadBarChart } from '../charts'
import { PILL_FILTER_STYLE, SearchableSelect } from '../ui'
import { StaffLite, Task, TaskPriority, TaskStatus } from '../types'
import AdminTaskTable from './AdminTaskTable'

const STALE_DAYS = 7

type FilterMode = 'all' | 'overdue' | 'stale' | TaskStatus

export default function TaskManagerConsolePage() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [staff, setStaff] = useState<StaffLite[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<FilterMode>('all')
  const [assigneeFilter, setAssigneeFilter] = useState('') // '' = everyone, matches SearchableSelect's empty-option convention
  // "Current time" sourced from an effect, not read directly during render —
  // Date.now() during render is flagged as impure by this repo's stricter
  // react-hooks/purity rule. Safe to default to 0 pre-load: every consumer
  // below only renders once `loading` is false, by which point this effect
  // (which sets loading=false in its own .finally()) has already run.
  const [now, setNow] = useState(0)

  // Re-fetch after a mutation (reassign/status/priority/delete) — called from
  // event handlers below, never from the effect body itself, so it doesn't
  // trip the set-state-in-effect rule the way calling it directly from
  // useEffect would.
  async function loadTasks() {
    const res = await fetch('/api/task-manager')
    if (!res.ok) { setError('Failed to load tasks.'); return }
    const data = await res.json()
    setTasks(data.tasks ?? [])
  }

  useEffect(() => {
    async function loadAll() {
      const [taskRes, staffList] = await Promise.all([
        fetch('/api/task-manager').then(r => r.json()),
        fetch('/api/staff-list').then(r => r.json()),
      ])
      setTasks(taskRes.tasks ?? [])
      setStaff(staffList)
      setNow(Date.now())
    }
    loadAll()
      .catch(() => setError('Failed to load the console.'))
      .finally(() => setLoading(false))
  }, [])

  const today = new Date(new Date(now).toDateString())
  const isOverdue = (t: Task) => !!t.deadline && t.status !== 'Completed' && new Date(t.deadline) < today
  const isStale = (t: Task) => t.status !== 'Completed' && Math.floor((now - new Date(t.updated_at).getTime()) / (1000 * 60 * 60 * 24)) >= STALE_DAYS

  const stats = useMemo(() => {
    const weekAgo = now - 7 * 24 * 60 * 60 * 1000
    return {
      total: tasks.length,
      overdue: tasks.filter(isOverdue).length,
      stale: tasks.filter(isStale).length,
      completedThisWeek: tasks.filter(t => t.status === 'Completed' && new Date(t.updated_at).getTime() >= weekAgo).length,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- isOverdue/isStale close over `today`/`now`, stable per render
  }, [tasks, now])

  const workload = useMemo(() => {
    const byStaff = new Map<string, { name: string; open: number }>()
    for (const t of tasks) {
      if (t.status === 'Completed' || !t.assigned_to_staff) continue
      const cur = byStaff.get(t.assigned_to) ?? { name: t.assigned_to_staff.name, open: 0 }
      cur.open++
      byStaff.set(t.assigned_to, cur)
    }
    return [...byStaff.values()].sort((a, b) => b.open - a.open)
  }, [tasks])

  const filteredTasks = useMemo(() => {
    return tasks
      .filter(t => {
        if (assigneeFilter !== '' && t.assigned_to !== assigneeFilter) return false
        if (filter === 'overdue') return isOverdue(t)
        if (filter === 'stale') return isStale(t)
        if (filter === 'all') return true
        return t.status === filter
      })
      .sort((a, b) => new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime()) // stalest first
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, filter, assigneeFilter])

  async function handleReassign(taskId: string, newAssignee: string) {
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, assigned_to: newAssignee } : t))
    const res = await fetch(`/api/task-manager/${taskId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ assigned_to: newAssignee }) })
    if (!res.ok) { setError('Failed to reassign task.'); await loadTasks() }
  }

  async function handleStatusChange(taskId: string, newStatus: TaskStatus) {
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: newStatus } : t))
    const res = await fetch(`/api/task-manager/${taskId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: newStatus }) })
    if (!res.ok) { setError('Failed to update status.'); await loadTasks() }
  }

  async function handlePriorityChange(taskId: string, newPriority: TaskPriority) {
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, priority: newPriority } : t))
    const res = await fetch(`/api/task-manager/${taskId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ priority: newPriority }) })
    if (!res.ok) { setError('Failed to update priority.'); await loadTasks() }
  }

  async function handleDelete(taskId: string) {
    if (!confirm('Delete this task? This also removes its logged time. This cannot be undone.')) return
    const res = await fetch(`/api/task-manager/${taskId}`, { method: 'DELETE' })
    if (!res.ok) { setError('Failed to delete task.'); return }
    setTasks(prev => prev.filter(t => t.id !== taskId))
  }

  if (loading) return <div style={{ padding: '80px', textAlign: 'center', color: 'var(--ink4)' }}>Loading admin console…</div>

  return (
    <>
      <PageHeader
        eyebrow="Task Manager"
        title="Admin Console"
        description="Full visibility across every task, regardless of assignee. Reassign, reprioritize, or delete directly from this view."
        backHref="/admin/task-manager"
        backLabel="Task Manager"
        actions={
          <>
            <Button variant="ghost" href="/admin/task-manager/console/access">Manage Access</Button>
            <Button variant="ghost" href="/api/task-manager/export" target="_blank">Export CSV</Button>
          </>
        }
      />
    <div style={{ padding: '20px 32px 48px' }}>
      {error && (
        <div style={{ background: 'var(--red-light)', border: '1px solid var(--red-border)', color: 'var(--red)', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', marginBottom: '16px' }}>
          {error}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', marginBottom: '18px' }}>
        <StatTile color="indigo" label="Total tasks" value={stats.total} />
        <StatTile color="red" label="Overdue" value={stats.overdue} />
        <StatTile color="amber" label={`Stale (${STALE_DAYS}+ days)`} value={stats.stale} />
        <StatTile color="teal" label="Completed this week" value={stats.completedThisWeek} />
      </div>

      {workload.length > 0 && (
        <Card padded>
          <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--ink3)', marginBottom: '12px' }}>
            Open workload by assignee
          </div>
          <WorkloadBarChart data={workload.map(w => ({ label: w.name, value: w.open }))} />
        </Card>
      )}

      <div style={{ height: '16px' }} />

      {/* ── Microsoft Teams Overdue Task Notifications Panel ─────── */}
      <Card padded>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '14px' }}>
          <div>
            <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>💬</span> Microsoft Teams Automated Overdue Reminders
            </div>
            <div style={{ fontSize: '12px', color: 'var(--ink3)', marginTop: '2px' }}>
              Delivers automated 09:00 AM local morning digests to Assignors and Assignees until resolved or rescheduled.
            </div>
          </div>
          <Button
            variant="teal"
            onClick={async () => {
              try {
                const res = await fetch('/api/task-manager/cron/overdue?force=true', { method: 'POST' })
                const data = await res.json()
                alert(`Teams Sweeper Triggered:\n• Evaluated: ${data.recipients_evaluated ?? 0} staff\n• Digests Dispatched: ${data.digests_dispatched ?? 0}\n• Tasks Notified: ${data.tasks_notified ?? 0}`)
                await loadTasks()
              } catch (err: unknown) {
                alert(`Sweep trigger error: ${err instanceof Error ? err.message : 'Unknown'}`)
              }
            }}
          >
            ⚡ Run Overdue Sweep Test Now
          </Button>
        </div>

        <div style={{ padding: '12px 14px', background: 'var(--surface)', borderRadius: '8px', border: '1px solid var(--border-light)', fontSize: '12px', color: 'var(--ink2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <span style={{ fontWeight: 700, color: stats.overdue > 0 ? 'var(--red)' : 'var(--teal)' }}>
              {stats.overdue} overdue task{stats.overdue === 1 ? '' : 's'}
            </span>{' '}
            currently eligible for morning digest dispatch.
          </div>
          <span style={{ fontSize: '11px', color: 'var(--ink4)' }}>
            Schedule: Mon–Fri @ 09:00 AM recipient local time
          </span>
        </div>
      </Card>

      <div style={{ height: '16px' }} />

      <Card padded>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '16px' }}>
          <select value={filter} onChange={e => setFilter(e.target.value as FilterMode)} style={PILL_FILTER_STYLE}>
            <option value="all">All tasks</option>
            <option value="overdue">Overdue</option>
            <option value="stale">Stale ({STALE_DAYS}+ days)</option>
            <option value="Not-Started">Not Started</option>
            <option value="In-Progress">In Progress</option>
            <option value="Completed">Completed</option>
          </select>

          <div style={{ width: '200px' }}>
            <SearchableSelect
              compact
              options={staff.map(s => ({ id: s.id, label: s.name }))}
              value={assigneeFilter}
              onChange={setAssigneeFilter}
              placeholder="Search staff…"
              emptyOptionLabel="Everyone"
            />
          </div>

          <span style={{ fontSize: '12px', color: 'var(--ink4)' }}>{filteredTasks.length} task{filteredTasks.length === 1 ? '' : 's'} · sorted by longest untouched first</span>
        </div>

        <AdminTaskTable
          tasks={filteredTasks}
          staff={staff}
          now={now}
          onReassign={handleReassign}
          onStatusChange={handleStatusChange}
          onPriorityChange={handlePriorityChange}
          onDelete={handleDelete}
        />
      </Card>
    </div>
    </>
  )
}

function StatTile({ color, label, value }: { color: 'indigo' | 'red' | 'amber' | 'teal'; label: string; value: number }) {
  return (
    <StatCard color={color}>
      <div style={{ padding: '14px 16px' }}>
        <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink3)', marginBottom: '6px' }}>{label}</div>
        <div style={{ fontSize: '24px', fontWeight: 800, color: 'var(--ink)', lineHeight: 1 }}>{value}</div>
      </div>
    </StatCard>
  )
}
