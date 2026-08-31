'use client'
import { useEffect, useMemo, useState } from 'react'
import Button from '@/app/components/ui/Button'
import Card from '@/app/components/ui/Card'
import PageHeader from '@/app/components/PageHeader'
import { CategoryDonutChart } from './charts'
import QuickAssignCard from './QuickAssignCard'
import RunningTimerWidget from './RunningTimerWidget'
import SummaryBar, { AssigneeCounts } from './SummaryBar'
import TaskKanban from './TaskKanban'
import TaskModal from './TaskModal'
import TaskTable from './TaskTable'
import TimeLogModal from './TimeLogModal'
import Timesheets from './Timesheets'
import { ACTIVE_PILL_FILTER_STYLE, PILL_FILTER_STYLE, TaskManagerStyles } from './ui'
import { ActiveTimer, EventLite, LogCategory, StaffLite, Task, TaskPriority, TaskSaveValues, TaskStatus, TimeLog } from './types'

type ViewMode = 'table' | 'kanban' | 'timesheets'

export default function TaskManagerPage() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [counts, setCounts] = useState<AssigneeCounts>({})
  const [staff, setStaff] = useState<StaffLite[]>([])
  const [events, setEvents] = useState<EventLite[]>([])
  const [currentStaffId, setCurrentStaffId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [dashboardMode, setDashboardMode] = useState<'focus' | 'admin'>('focus')
  const [groupByEvent, setGroupByEvent] = useState(false)
  const [view, setView] = useState<ViewMode>('table')
  const [myTasksOnly, setMyTasksOnly] = useState(false)
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [eventFilter, setEventFilter] = useState<'all' | string>('all')
  const [assignerFilter, setAssignerFilter] = useState<'all' | string>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | TaskStatus>('all')
  const [priorityFilter, setPriorityFilter] = useState<'all' | TaskPriority>('all')

  const [editingTask, setEditingTask] = useState<Task | null | undefined>(undefined) // undefined = modal closed
  const [modalDefaultStatus, setModalDefaultStatus] = useState<TaskStatus>('Not-Started')
  const [activeTimer, setActiveTimer] = useState<ActiveTimer>(null)

  // Timesheets — lazy-loaded the first time that tab is opened, so the
  // common case (just looking at tasks) doesn't pay for fetching the log
  // history on every page load. `timeLogsLoaded` tracks whether that first
  // fetch has happened yet.
  const [timeLogs, setTimeLogs] = useState<TimeLog[]>([])
  const [timeLogsLoaded, setTimeLogsLoaded] = useState(false)
  const [timeLogsLoading, setTimeLogsLoading] = useState(false)
  const [showTimeLogModal, setShowTimeLogModal] = useState(false)

  async function loadTasks() {
    const res = await fetch('/api/task-manager')
    if (!res.ok) { setError('Failed to load tasks.'); return }
    const data = await res.json()
    setTasks(data.tasks ?? [])
    setCounts(data.counts_by_assignee ?? {})
  }

  async function refreshActiveTimer() {
    const res = await fetch('/api/task-manager/timer/active')
    const data = await res.json().catch(() => ({}))
    setActiveTimer(data.active ?? null)
  }

  async function loadTimeLogs() {
    setTimeLogsLoading(true)
    const res = await fetch('/api/task-manager/timesheets')
    const data = await res.json().catch(() => ({}))
    setTimeLogs(data.logs ?? [])
    setTimeLogsLoading(false)
    setTimeLogsLoaded(true)
  }

  useEffect(() => {
    async function loadAll() {
      const [session, staffList, eventList, taskRes, timerRes] = await Promise.all([
        fetch('/api/auth/session').then(r => r.json()),
        fetch('/api/staff-list').then(r => r.json()),
        fetch('/api/events').then(r => r.json()),
        fetch('/api/task-manager').then(r => r.json()),
        fetch('/api/task-manager/timer/active').then(r => r.json()),
      ])
      setCurrentStaffId(session?.sid ?? null)
      setStaff((staffList ?? []).sort((a: StaffLite, b: StaffLite) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })))
      setEvents(
        (eventList ?? [])
          .map((e: { id: string; name: string }) => ({ id: e.id, name: e.name }))
          .sort((a: EventLite, b: EventLite) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
      )
      setTasks(taskRes.tasks ?? [])
      setCounts(taskRes.counts_by_assignee ?? {})
      setActiveTimer(timerRes.active ?? null)
    }
    loadAll()
      .catch(() => setError('Failed to load Task Manager.'))
      .finally(() => setLoading(false))
  }, [])

  // Fetch timesheets the first time that tab is opened. Fetch is inlined
  // here (not calling the outer loadTimeLogs) so the setState calls are
  // scoped to this effect's own async closure, not a shared named function
  // — same pattern as the initial loadAll effect above.
  useEffect(() => {
    if (view !== 'timesheets' || timeLogsLoaded) return
    async function loadFirstTime() {
      setTimeLogsLoading(true)
      const res = await fetch('/api/task-manager/timesheets')
      const data = await res.json().catch(() => ({}))
      setTimeLogs(data.logs ?? [])
      setTimeLogsLoading(false)
      setTimeLogsLoaded(true)
    }
    loadFirstTime().catch(() => setTimeLogsLoading(false))
  }, [view, timeLogsLoaded])

  const currentStaff = useMemo(() => {
    return staff.find(s => s.id === currentStaffId) ?? null
  }, [staff, currentStaffId])

  // Aggregate global metrics for the Admin KPI ribbon
  const { totalTasksCount, inProgressCount, completedCount, overdueCount, totalTrackedSeconds } = useMemo(() => {
    const today = new Date(new Date().toDateString())
    let inProg = 0
    let done = 0
    let overdue = 0
    let tracked = 0

    for (const t of tasks) {
      if (t.status === 'In-Progress') inProg++
      if (t.status === 'Completed') done++
      if (t.deadline && t.status !== 'Completed' && new Date(t.deadline) < today) overdue++
      tracked += t.tracked_seconds ?? 0
    }

    return {
      totalTasksCount: tasks.length,
      inProgressCount: inProg,
      completedCount: done,
      overdueCount: overdue,
      totalTrackedSeconds: tracked,
    }
  }, [tasks])

  // Personal metrics for Focus Mode
  const personalMetrics = useMemo(() => {
    const today = new Date(new Date().toDateString())
    const myTasks = tasks.filter(t => t.assigned_to === currentStaffId)
    let inProg = 0
    let done = 0
    let overdue = 0
    let dueToday = 0
    let tracked = 0

    for (const t of myTasks) {
      if (t.status === 'In-Progress') inProg++
      if (t.status === 'Completed') done++
      if (t.deadline && t.status !== 'Completed') {
        const d = new Date(t.deadline)
        if (d < today) overdue++
        else if (d.toDateString() === today.toDateString()) dueToday++
      }
      tracked += t.tracked_seconds ?? 0
    }

    return {
      total: myTasks.length,
      inProgress: inProg,
      done,
      overdue,
      dueToday,
      tracked,
    }
  }, [tasks, currentStaffId])

  const filteredTasks = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    const today = new Date(new Date().toDateString())

    const priorityRank: Record<TaskPriority, number> = {
      High: 0,
      Medium: 1,
      Low: 2,
    }

    const list = tasks.filter(t => {
      // In focus mode, automatically filter to current user's tasks
      if (dashboardMode === 'focus' && t.assigned_to !== currentStaffId) return false
      if (dashboardMode === 'admin' && myTasksOnly && t.assigned_to !== currentStaffId) return false
      if (dashboardMode === 'admin' && selectedStaffId && t.assigned_to !== selectedStaffId) return false
      if (statusFilter !== 'all' && t.status !== statusFilter) return false
      if (priorityFilter !== 'all' && t.priority !== priorityFilter) return false
      if (eventFilter !== 'all' && (t.event_id !== eventFilter)) return false
      if (assignerFilter !== 'all' && t.assigned_by !== assignerFilter) return false

      if (q) {
        const matchDesc = t.description.toLowerCase().includes(q)
        const matchRemarks = t.remarks?.toLowerCase().includes(q) ?? false
        const matchEvent = t.event?.name.toLowerCase().includes(q) ?? false
        const matchAssignee = t.assigned_to_staff?.name.toLowerCase().includes(q) ?? false
        const matchAssigner = t.assigned_by_staff?.name.toLowerCase().includes(q) ?? false
        if (!matchDesc && !matchRemarks && !matchEvent && !matchAssignee && !matchAssigner) return false
      }
      return true
    })

    // Sort: Incomplete tasks first (In-Progress -> Not-Started), Overdue -> High Priority -> Deadline, Completed tasks last
    return list.sort((a, b) => {
      // 1. Status Rank: In-Progress (0) -> Not-Started (1) -> Completed (2)
      const statusRank = (s: TaskStatus) => (s === 'In-Progress' ? 0 : s === 'Not-Started' ? 1 : 2)
      const rankA = statusRank(a.status)
      const rankB = statusRank(b.status)
      if (rankA !== rankB) return rankA - rankB

      // 2. If both are incomplete, check overdue
      if (a.status !== 'Completed' && b.status !== 'Completed') {
        const aOverdue = a.deadline && new Date(a.deadline) < today ? 1 : 0
        const bOverdue = b.deadline && new Date(b.deadline) < today ? 1 : 0
        if (aOverdue !== bOverdue) return bOverdue - aOverdue

        // 3. Priority Rank: High -> Medium -> Low
        const pA = priorityRank[a.priority] ?? 1
        const pB = priorityRank[b.priority] ?? 1
        if (pA !== pB) return pA - pB

        // 4. Deadline nearest first
        if (a.deadline && b.deadline) {
          const diff = new Date(a.deadline).getTime() - new Date(b.deadline).getTime()
          if (diff !== 0) return diff
        } else if (a.deadline) {
          return -1
        } else if (b.deadline) {
          return 1
        }
      }

      // 5. Default by newest created
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    })
  }, [tasks, dashboardMode, myTasksOnly, selectedStaffId, currentStaffId, statusFilter, priorityFilter, eventFilter, assignerFilter, searchQuery])

  const categoryChartData = useMemo(() => {
    const byCategory = new Map<string, number>()
    for (const log of timeLogs) {
      const key = log.category ?? 'Uncategorized'
      byCategory.set(key, (byCategory.get(key) ?? 0) + (log.duration_seconds ?? 0))
    }
    return [...byCategory.entries()].map(([label, seconds]) => ({ label, seconds })).sort((a, b) => b.seconds - a.seconds)
  }, [timeLogs])

  async function handleQuickAssign(values: TaskSaveValues) {
    setError(null)
    const res = await fetch('/api/task-manager', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...values, status: 'Not-Started' }),
    })
    if (!res.ok) {
      const b = await res.json().catch(() => ({}))
      throw new Error(b.error ?? 'Failed to assign task')
    }
    await loadTasks()
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

  async function handleTimerAction(taskId: string, action: 'start' | 'pause' | 'stop') {
    setError(null)
    const res = await fetch(`/api/task-manager/${taskId}/timer`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) { setError(body.error ?? 'Timer action failed.'); return }
    await Promise.all([loadTasks(), refreshActiveTimer()])
    if (timeLogsLoaded) await loadTimeLogs()
  }

  async function handleDelete(taskId: string) {
    if (!confirm('Delete this task? This also removes its logged time.')) return
    const res = await fetch(`/api/task-manager/${taskId}`, { method: 'DELETE' })
    if (!res.ok) { setError('Failed to delete task.'); return }
    setTasks(prev => prev.filter(t => t.id !== taskId))
  }

  function openNewTaskModal(defaultStatus: TaskStatus = 'Not-Started') {
    setModalDefaultStatus(defaultStatus)
    setEditingTask(null)
  }

  async function handleSave(values: TaskSaveValues) {
    setError(null)
    if (values.id) {
      const res = await fetch(`/api/task-manager/${values.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      })
      if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b.error ?? 'Failed to save task') }
    } else {
      const res = await fetch('/api/task-manager', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...values, status: modalDefaultStatus }),
      })
      if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b.error ?? 'Failed to create task') }
    }
    setEditingTask(undefined)
    await loadTasks()
  }

  async function handleSaveManualLog(values: { task_id: string; category: LogCategory | ''; description: string; log_date: string; start_time: string; end_time: string }) {
    const res = await fetch('/api/task-manager/timesheets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      setError(body.error ?? 'Failed to log time.')
      return
    }
    setShowTimeLogModal(false)
    await Promise.all([loadTimeLogs(), loadTasks()])
  }

  async function handleEditLog(logId: string, updates: { category?: LogCategory | ''; description?: string }) {
    setTimeLogs(prev => prev.map(l => l.id === logId ? { ...l, ...updates, category: (updates.category ?? l.category) || null } : l))
    const res = await fetch(`/api/task-manager/timesheets/${logId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updates) })
    if (!res.ok) { setError('Failed to update log entry.'); await loadTimeLogs() }
  }

  async function handleDeleteLog(logId: string) {
    if (!confirm('Delete this time log entry? This cannot be undone.')) return
    const res = await fetch(`/api/task-manager/timesheets/${logId}`, { method: 'DELETE' })
    if (!res.ok) { setError('Failed to delete log entry.'); return }
    setTimeLogs(prev => prev.filter(l => l.id !== logId))
    await loadTasks()
  }

  if (loading) return <div style={{ padding: '80px', textAlign: 'center', color: 'var(--ink4)' }}>Loading Task Manager…</div>

  return (
    <>
      <TaskManagerStyles />
      <PageHeader
        title="Task Manager"
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {/* ── Dual Mode Switcher ─────────────────────────── */}
            <div style={{ display: 'inline-flex', background: 'var(--surface)', padding: '3px', borderRadius: '8px', border: '1px solid var(--border)' }}>
              <button
                type="button"
                onClick={() => setDashboardMode('focus')}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: dashboardMode === 'focus' ? 700 : 500,
                  background: dashboardMode === 'focus' ? 'var(--teal-mid)' : 'transparent',
                  color: dashboardMode === 'focus' ? 'var(--surface)' : 'var(--ink3)',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  transition: 'all 0.15s ease',
                }}
              >
                <span>👤</span> My Focus
              </button>
              <button
                type="button"
                onClick={() => setDashboardMode('admin')}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: dashboardMode === 'admin' ? 700 : 500,
                  background: dashboardMode === 'admin' ? 'var(--teal-mid)' : 'transparent',
                  color: dashboardMode === 'admin' ? 'var(--surface)' : 'var(--ink3)',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  transition: 'all 0.15s ease',
                }}
              >
                <span>🌐</span> Team Oversight
              </button>
            </div>

            <Button variant="ghost" href="/admin/task-manager/console">Admin Console</Button>
            <Button variant="ghost" href="/api/task-manager/export" target="_blank">Export CSV</Button>
            <Button variant="teal" onClick={() => openNewTaskModal('Not-Started')}>+ New Task</Button>
          </div>
        }
      />
    <div style={{ padding: '20px 32px 48px' }}>
      <RunningTimerWidget active={activeTimer} onStopped={() => { refreshActiveTimer(); loadTasks(); if (timeLogsLoaded) loadTimeLogs() }} />

      {error && (
        <div style={{ background: 'var(--red-light)', border: '1px solid var(--red-border)', color: 'var(--red)', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', marginBottom: '16px' }}>
          {error}
        </div>
      )}

      {/* ── Mode 1: Admin Oversight View ──────────────────────── */}
      {dashboardMode === 'admin' && (
        <SummaryBar
          counts={counts}
          staff={staff}
          onQuickAssignForStaff={(staffId) => {
            setEditingTask({
              id: '',
              event_id: null,
              event: null,
              description: '',
              assigned_by: currentStaffId ?? staffId,
              assigned_to: staffId,
              assigned_by_staff: null,
              assigned_to_staff: null,
              assigned_date: new Date().toISOString().slice(0, 10),
              deadline: null,
              status: 'Not-Started',
              priority: 'Medium',
              remarks: null,
              tracked_seconds: 0,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
          }}
          selectedStaffId={selectedStaffId}
          onSelectStaff={setSelectedStaffId}
          totalTasksCount={totalTasksCount}
          inProgressCount={inProgressCount}
          completedCount={completedCount}
          overdueCount={overdueCount}
          totalTrackedSeconds={totalTrackedSeconds}
        />
      )}

      {/* ── Mode 2: Individual Focus View ─────────────────────── */}
      {dashboardMode === 'focus' && (
        <div
          style={{
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: '12px',
            padding: '20px 24px',
            marginBottom: '16px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
            <div>
              <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--ink)', marginBottom: '4px' }}>
                Welcome back, {currentStaff?.name ?? 'there'} 👋
              </div>
              <div style={{ fontSize: '13px', color: 'var(--ink3)', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
                <span>
                  You have <strong style={{ color: 'var(--ink)' }}>{personalMetrics.total} assigned task{personalMetrics.total === 1 ? '' : 's'}</strong>
                </span>
                {personalMetrics.overdue > 0 && <span style={{ color: 'var(--red)', fontWeight: 700 }}>({personalMetrics.overdue} overdue)</span>}
                {personalMetrics.dueToday > 0 && <span style={{ color: 'var(--amber)', fontWeight: 700 }}>• {personalMetrics.dueToday} due today</span>}
                {personalMetrics.total > 0 && (
                  <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--teal)', background: 'var(--teal-light)', padding: '2px 8px', borderRadius: '6px', marginLeft: '4px' }}>
                    {Math.round((personalMetrics.done / personalMetrics.total) * 100)}% completed
                  </span>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <div style={{ padding: '10px 18px', background: 'var(--surface)', borderRadius: '8px', border: '1px solid var(--border-light)', borderTop: '3px solid var(--purple)', minWidth: '100px' }}>
                <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--ink4)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '2px' }}>In Progress</div>
                <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--purple)' }}>{personalMetrics.inProgress}</div>
              </div>
              <div style={{ padding: '10px 18px', background: 'var(--surface)', borderRadius: '8px', border: '1px solid var(--border-light)', borderTop: '3px solid var(--amber)', minWidth: '100px' }}>
                <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--ink4)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '2px' }}>Due Today</div>
                <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--amber)' }}>{personalMetrics.dueToday}</div>
              </div>
              <div style={{ padding: '10px 18px', background: 'var(--surface)', borderRadius: '8px', border: '1px solid var(--border-light)', borderTop: '3px solid var(--teal)', minWidth: '100px' }}>
                <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--ink4)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '2px' }}>Completed</div>
                <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--teal)' }}>{personalMetrics.done}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Quick Assign Card ─────────────────────────────────── */}
      <QuickAssignCard
        staff={staff}
        events={events}
        counts={counts}
        currentStaffId={currentStaffId}
        onAssign={handleQuickAssign}
      />

      <Card padded>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
          <ToggleGroup value={view} onChange={setView} options={[['table', 'Table'], ['kanban', 'Kanban'], ['timesheets', 'Timesheets']]} />

          {view !== 'timesheets' && (
            <>
              {/* Real-time search */}
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center', minWidth: '220px', maxWidth: '320px', flex: '1 1 220px' }}>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search tasks, notes, people…"
                  style={{
                    width: '100%',
                    height: '36px',
                    padding: '0 28px 0 12px',
                    fontSize: '12px',
                    borderRadius: '8px',
                    border: '1px solid var(--border)',
                    background: 'var(--surface)',
                    color: 'var(--ink)',
                    outline: 'none',
                  }}
                />
                {searchQuery ? (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    style={{ position: 'absolute', right: '8px', background: 'none', border: 'none', color: 'var(--ink4)', cursor: 'pointer', fontSize: '11px' }}
                  >
                    ✕
                  </button>
                ) : (
                  <span style={{ position: 'absolute', right: '8px', color: 'var(--ink4)', fontSize: '12px', pointerEvents: 'none' }}>🔍</span>
                )}
              </div>

              {dashboardMode === 'admin' && (
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--ink3)', cursor: 'pointer', height: '36px', padding: '0 8px' }}>
                  <input type="checkbox" checked={myTasksOnly} onChange={e => setMyTasksOnly(e.target.checked)} />
                  My Tasks
                </label>
              )}

              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value as 'all' | TaskStatus)}
                style={statusFilter !== 'all' ? ACTIVE_PILL_FILTER_STYLE : PILL_FILTER_STYLE}
              >
                <option value="all">All statuses</option>
                <option value="Not-Started">Not Started</option>
                <option value="In-Progress">In Progress</option>
                <option value="Completed">Completed</option>
              </select>

              <select
                value={priorityFilter}
                onChange={e => setPriorityFilter(e.target.value as 'all' | TaskPriority)}
                style={priorityFilter !== 'all' ? ACTIVE_PILL_FILTER_STYLE : PILL_FILTER_STYLE}
              >
                <option value="all">All priorities</option>
                <option value="High">High</option>
                <option value="Medium">Medium</option>
                <option value="Low">Low</option>
              </select>

              {/* Event Filter */}
              <select
                value={eventFilter}
                onChange={e => setEventFilter(e.target.value)}
                style={eventFilter !== 'all' ? ACTIVE_PILL_FILTER_STYLE : PILL_FILTER_STYLE}
              >
                <option value="all">All events</option>
                {events.map(ev => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
              </select>

              {dashboardMode === 'admin' && (
                <select
                  value={assignerFilter}
                  onChange={e => setAssignerFilter(e.target.value)}
                  style={assignerFilter !== 'all' ? ACTIVE_PILL_FILTER_STYLE : PILL_FILTER_STYLE}
                >
                  <option value="all">All assigners</option>
                  {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              )}

              {/* Reset Filters Shortcut */}
              {(selectedStaffId || searchQuery || eventFilter !== 'all' || assignerFilter !== 'all' || statusFilter !== 'all' || priorityFilter !== 'all' || myTasksOnly) && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedStaffId(null)
                    setSearchQuery('')
                    setEventFilter('all')
                    setAssignerFilter('all')
                    setStatusFilter('all')
                    setPriorityFilter('all')
                    setMyTasksOnly(false)
                  }}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--teal-mid)',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    padding: '4px 8px',
                    whiteSpace: 'nowrap',
                  }}
                >
                  Reset filters ✕
                </button>
              )}

              {/* Group by Event Toggle (in table mode) */}
              {view === 'table' && (
                <button
                  type="button"
                  onClick={() => setGroupByEvent(!groupByEvent)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '0 12px',
                    height: '36px',
                    borderRadius: '8px',
                    fontSize: '12px',
                    fontWeight: 600,
                    border: `1px solid ${groupByEvent ? 'var(--teal)' : 'var(--border)'}`,
                    background: groupByEvent ? 'var(--teal-light)' : 'var(--surface)',
                    color: groupByEvent ? 'var(--teal)' : 'var(--ink3)',
                    cursor: 'pointer',
                    marginLeft: 'auto',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <span>📁</span> Group by Event
                </button>
              )}
            </>
          )}

          {view === 'timesheets' && (
            <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
              <Button variant="ghost" href="/api/task-manager/export/timesheets" target="_blank">Export CSV</Button>
              <Button variant="teal" onClick={() => setShowTimeLogModal(true)}>+ Log Time</Button>
            </div>
          )}
        </div>

        {view === 'table' && (
          <TaskTable
            tasks={filteredTasks}
            currentStaffId={currentStaffId}
            runningTaskId={activeTimer?.task_id ?? null}
            groupByEvent={groupByEvent}
            onOpenTask={setEditingTask}
            onStatusChange={handleStatusChange}
            onPriorityChange={handlePriorityChange}
            onTimerAction={handleTimerAction}
            onDelete={handleDelete}
          />
        )}
        {view === 'kanban' && (
          <TaskKanban
            tasks={filteredTasks}
            currentStaffId={currentStaffId}
            runningTaskId={activeTimer?.task_id ?? null}
            onStatusChange={handleStatusChange}
            onOpenTask={setEditingTask}
            onTimerAction={handleTimerAction}
            onQuickAddInColumn={openNewTaskModal}
          />
        )}
        {view === 'timesheets' && (
          timeLogsLoading ? (
            <div style={{ padding: '48px', textAlign: 'center', color: 'var(--ink4)' }}>Loading timesheets…</div>
          ) : (
            <>
              {timeLogs.length > 0 && (
                <div style={{ marginBottom: '20px', paddingBottom: '20px', borderBottom: '1px solid var(--border-light)' }}>
                  <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--ink3)', marginBottom: '12px' }}>
                    Hours by category
                  </div>
                  <CategoryDonutChart data={categoryChartData} />
                </div>
              )}
              <Timesheets logs={timeLogs} onEdit={handleEditLog} onDelete={handleDeleteLog} />
            </>
          )
        )}
      </Card>

      {editingTask !== undefined && (
        <TaskModal
          task={editingTask}
          staff={staff}
          events={events}
          counts={counts}
          currentStaffId={currentStaffId}
          onClose={() => setEditingTask(undefined)}
          onSave={handleSave}
        />
      )}

      {showTimeLogModal && (
        <TimeLogModal
          tasks={tasks}
          onClose={() => setShowTimeLogModal(false)}
          onSave={handleSaveManualLog}
        />
      )}
    </div>
    </>
  )
}

function ToggleGroup<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: [T, string][] }) {
  return (
    <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden' }}>
      {options.map(([v, label]) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          style={{
            padding: '6px 14px', fontSize: '12px', fontWeight: 700, border: 'none', cursor: 'pointer',
            background: value === v ? 'var(--teal-mid)' : 'var(--card)',
            color: value === v ? 'var(--surface)' : 'var(--ink3)',
          }}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
