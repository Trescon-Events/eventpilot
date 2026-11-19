'use client'
import { useEffect, useMemo, useState } from 'react'
import Button from '@/app/components/ui/Button'
import Card from '@/app/components/ui/Card'
import Toast from '@/app/components/ui/Toast'
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
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set())
  const [isBulkDeleting, setIsBulkDeleting] = useState(false)
  const [archiveScope, setArchiveScope] = useState<'active' | 'archived'>('active')
  const [isBulkArchiving, setIsBulkArchiving] = useState(false)
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
  const isOverdue = (t: Task) => !t.archived_at && !!t.deadline && t.status !== 'Completed' && new Date(t.deadline) < today
  const isStale = (t: Task) => !t.archived_at && t.status !== 'Completed' && Math.floor((now - new Date(t.updated_at).getTime()) / (1000 * 60 * 60 * 24)) >= STALE_DAYS

  const activeTasks = useMemo(() => tasks.filter(t => !t.archived_at), [tasks])
  const archivedTasks = useMemo(() => tasks.filter(t => !!t.archived_at), [tasks])

  const stats = useMemo(() => {
    const weekAgo = now - 7 * 24 * 60 * 60 * 1000
    return {
      total: activeTasks.length,
      overdue: activeTasks.filter(isOverdue).length,
      stale: activeTasks.filter(isStale).length,
      completedThisWeek: activeTasks.filter(t => t.status === 'Completed' && new Date(t.updated_at).getTime() >= weekAgo).length,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- isOverdue/isStale close over `today`/`now`, stable per render
  }, [activeTasks, now])

  const workload = useMemo(() => {
    const byStaff = new Map<string, { name: string; open: number }>()
    for (const t of activeTasks) {
      if (t.status === 'Completed' || !t.assigned_to_staff) continue
      const cur = byStaff.get(t.assigned_to) ?? { name: t.assigned_to_staff.name, open: 0 }
      cur.open++
      byStaff.set(t.assigned_to, cur)
    }
    return [...byStaff.values()].sort((a, b) => b.open - a.open)
  }, [activeTasks])

  const filteredTasks = useMemo(() => {
    return tasks
      .filter(t => {
        const isArchived = Boolean(t.archived_at)
        if (archiveScope === 'active' && isArchived) return false
        if (archiveScope === 'archived' && !isArchived) return false

        if (assigneeFilter !== '' && t.assigned_to !== assigneeFilter) return false
        if (filter === 'overdue') return isOverdue(t)
        if (filter === 'stale') return isStale(t)
        if (filter === 'all') return true
        return t.status === filter
      })
      .sort((a, b) => new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime()) // stalest first
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, filter, assigneeFilter, archiveScope])

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
    setSelectedTaskIds(prev => {
      if (!prev.has(taskId)) return prev
      const next = new Set(prev)
      next.delete(taskId)
      return next
    })
  }

  function handleToggleSelect(taskId: string) {
    setSelectedTaskIds(prev => {
      const next = new Set(prev)
      if (next.has(taskId)) next.delete(taskId)
      else next.add(taskId)
      return next
    })
  }

  function handleToggleSelectAll() {
    const visibleIds = filteredTasks.map(t => t.id)
    const allSelected = visibleIds.length > 0 && visibleIds.every(id => selectedTaskIds.has(id))
    if (allSelected) {
      setSelectedTaskIds(prev => {
        const next = new Set(prev)
        visibleIds.forEach(id => next.delete(id))
        return next
      })
    } else {
      setSelectedTaskIds(prev => new Set([...prev, ...visibleIds]))
    }
  }

  function handleSelectAllFiltered() {
    setSelectedTaskIds(new Set(filteredTasks.map(t => t.id)))
  }

  function handleClearSelection() {
    setSelectedTaskIds(new Set())
  }

  async function handleBulkDelete() {
    const count = selectedTaskIds.size
    if (count === 0) return
    const confirmed = confirm(
      `Permanently delete ${count} selected task${count === 1 ? '' : 's'}?\n\nThis will also remove their associated time logs and cannot be undone.`
    )
    if (!confirmed) return

    setIsBulkDeleting(true)
    setError(null)
    try {
      const res = await fetch('/api/task-manager/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task_ids: Array.from(selectedTaskIds) }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data.error ?? 'Failed to delete selected tasks')
      }
      setSelectedTaskIds(new Set())
      await loadTasks()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Bulk delete failed.')
    } finally {
      setIsBulkDeleting(false)
    }
  }

  async function handleArchive(taskId: string, action: 'archive' | 'unarchive') {
    setError(null)
    try {
      const res = await fetch('/api/task-manager/bulk-archive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task_ids: [taskId], action }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Failed to update archive status')
      await loadTasks()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Archive action failed.')
    }
  }

  async function handleBulkArchive(action: 'archive' | 'unarchive') {
    const count = selectedTaskIds.size
    if (count === 0) return
    const msg = action === 'archive'
      ? `Archive ${count} selected task${count === 1 ? '' : 's'}?\n\nThey will be moved to the archive while preserving all time logs and reports.`
      : `Restore ${count} selected task${count === 1 ? '' : 's'} back to the active list?`
    if (!confirm(msg)) return

    setIsBulkArchiving(true)
    setError(null)
    try {
      const res = await fetch('/api/task-manager/bulk-archive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task_ids: Array.from(selectedTaskIds), action }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data.error ?? 'Bulk archive operation failed')
      }
      setSelectedTaskIds(new Set())
      await loadTasks()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Bulk archive failed.')
    } finally {
      setIsBulkArchiving(false)
    }
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
            <Button variant="ghost" href="/admin/task-manager/console/vendor-contacts">Vendor Contacts</Button>
            <Button variant="ghost" href="/admin/task-manager/console/task-types">Task Types</Button>
            <Button variant="ghost" href="/api/task-manager/export" target="_blank">Export CSV</Button>
          </>
        }
      />
    <div style={{ padding: '20px 32px 48px' }}>
      {error && <Toast message={error} type="error" onClose={() => setError(null)} />}

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
        {/* Active vs Archived scope tabs */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '16px', paddingBottom: '14px', borderBottom: '1px solid var(--border-light)' }}>
          <div style={{ display: 'inline-flex', background: 'var(--surface)', padding: '3px', borderRadius: '8px', border: '1px solid var(--border)' }}>
            <button
              type="button"
              onClick={() => { setArchiveScope('active'); setSelectedTaskIds(new Set()) }}
              style={{
                padding: '6px 14px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
                border: 'none',
                background: archiveScope === 'active' ? 'var(--teal-mid)' : 'transparent',
                color: archiveScope === 'active' ? 'var(--surface)' : 'var(--ink3)',
                transition: 'all 0.15s ease',
              }}
            >
              Active Tasks ({activeTasks.length})
            </button>
            <button
              type="button"
              onClick={() => { setArchiveScope('archived'); setSelectedTaskIds(new Set()) }}
              style={{
                padding: '6px 14px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
                border: 'none',
                background: archiveScope === 'archived' ? 'var(--teal-mid)' : 'transparent',
                color: archiveScope === 'archived' ? 'var(--surface)' : 'var(--ink3)',
                transition: 'all 0.15s ease',
              }}
            >
              📦 Archived ({archivedTasks.length})
            </button>
          </div>

          <div style={{ fontSize: '11px', color: 'var(--ink4)' }}>
            {archiveScope === 'active' ? 'Completed tasks auto-archive next day' : 'Archived tasks preserve timesheets & reporting'}
          </div>
        </div>

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

          <span style={{ fontSize: '12px', color: 'var(--ink4)' }}>
            {filteredTasks.length} {archiveScope === 'archived' ? 'archived task' : 'task'}{filteredTasks.length === 1 ? '' : 's'} · sorted by longest untouched first
          </span>
        </div>

        <AdminTaskTable
          tasks={filteredTasks}
          staff={staff}
          now={now}
          selectedTaskIds={selectedTaskIds}
          onToggleSelect={handleToggleSelect}
          onToggleSelectAll={handleToggleSelectAll}
          onReassign={handleReassign}
          onStatusChange={handleStatusChange}
          onPriorityChange={handlePriorityChange}
          onDelete={handleDelete}
          onArchive={handleArchive}
        />
      </Card>

      {/* Floating Bulk Action Bar */}
      {selectedTaskIds.size > 0 && (
        <div
          style={{
            position: 'fixed',
            bottom: '28px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 100,
            display: 'flex',
            alignItems: 'center',
            gap: '14px',
            padding: '10px 18px',
            borderRadius: '12px',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.45)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '20px',
                height: '20px',
                borderRadius: '50%',
                background: 'var(--teal-light)',
                color: 'var(--teal)',
                fontSize: '11px',
                fontWeight: 700,
              }}
            >
              ✓
            </span>
            <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink)' }}>
              {selectedTaskIds.size} task{selectedTaskIds.size === 1 ? '' : 's'} selected
            </span>
          </div>

          {selectedTaskIds.size < filteredTasks.length && (
            <button
              type="button"
              onClick={handleSelectAllFiltered}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--teal)',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
                textDecoration: 'underline',
                padding: '2px 4px',
              }}
            >
              Select all {filteredTasks.length} {archiveScope === 'archived' ? 'archived' : 'filtered'} tasks
            </button>
          )}

          <div style={{ width: '1px', height: '18px', background: 'var(--border)' }} />

          <button
            type="button"
            onClick={handleClearSelection}
            style={{
              background: 'none',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              padding: '6px 12px',
              color: 'var(--ink2)',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Clear selection
          </button>

          {/* Bulk Archive / Unarchive Action */}
          {archiveScope === 'active' ? (
            <button
              type="button"
              disabled={isBulkArchiving || isBulkDeleting}
              onClick={() => handleBulkArchive('archive')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                background: 'var(--card)',
                color: 'var(--teal)',
                border: '1px solid var(--teal)',
                borderRadius: '6px',
                padding: '6px 14px',
                fontSize: '12px',
                fontWeight: 700,
                cursor: (isBulkArchiving || isBulkDeleting) ? 'not-allowed' : 'pointer',
                opacity: (isBulkArchiving || isBulkDeleting) ? 0.7 : 1,
              }}
            >
              <span>📦</span> {isBulkArchiving ? 'Archiving…' : `Archive (${selectedTaskIds.size})`}
            </button>
          ) : (
            <button
              type="button"
              disabled={isBulkArchiving || isBulkDeleting}
              onClick={() => handleBulkArchive('unarchive')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                background: 'var(--teal-mid)',
                color: 'var(--surface)',
                border: 'none',
                borderRadius: '6px',
                padding: '6px 14px',
                fontSize: '12px',
                fontWeight: 700,
                cursor: (isBulkArchiving || isBulkDeleting) ? 'not-allowed' : 'pointer',
                opacity: (isBulkArchiving || isBulkDeleting) ? 0.7 : 1,
              }}
            >
              <span>↩️</span> {isBulkArchiving ? 'Restoring…' : `Restore to Active (${selectedTaskIds.size})`}
            </button>
          )}

          <button
            type="button"
            disabled={isBulkDeleting || isBulkArchiving}
            onClick={handleBulkDelete}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: 'var(--red)',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              padding: '6px 14px',
              fontSize: '12px',
              fontWeight: 700,
              cursor: (isBulkDeleting || isBulkArchiving) ? 'not-allowed' : 'pointer',
              opacity: (isBulkDeleting || isBulkArchiving) ? 0.7 : 1,
            }}
          >
            <span>🗑️</span> {isBulkDeleting ? 'Deleting…' : `Delete (${selectedTaskIds.size})`}
          </button>
        </div>
      )}
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
