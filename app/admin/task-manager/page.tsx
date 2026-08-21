'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import Button from '@/app/components/ui/Button'
import Card from '@/app/components/ui/Card'
import PageHeader from '@/app/components/PageHeader'
import { CategoryDonutChart } from './charts'
import RunningTimerWidget from './RunningTimerWidget'
import SummaryBar, { AssigneeCounts } from './SummaryBar'
import TaskKanban from './TaskKanban'
import TaskModal from './TaskModal'
import TaskTable from './TaskTable'
import TimeLogModal from './TimeLogModal'
import Timesheets from './Timesheets'
import { PILL_FILTER_STYLE } from './ui'
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

  const [quickAddText, setQuickAddText] = useState('')
  const [quickAddBusy, setQuickAddBusy] = useState(false)
  const quickAddRef = useRef<HTMLInputElement>(null)

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
      setStaff(staffList)
      setEvents((eventList ?? []).map((e: { id: string; name: string }) => ({ id: e.id, name: e.name })))
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

  // "N" jumps straight to the quick-add box from anywhere on the page —
  // matches the create-in-a-jiffy pattern in Linear/Todoist. Ignored while
  // already typing in any field so it doesn't hijack normal text entry.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement
      const isTyping = ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
      if (e.key === 'n' && !isTyping && !e.metaKey && !e.ctrlKey) {
        e.preventDefault()
        quickAddRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

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
    return tasks.filter(t => {
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
  }, [tasks, dashboardMode, myTasksOnly, selectedStaffId, currentStaffId, statusFilter, priorityFilter, eventFilter, assignerFilter, searchQuery])

  const categoryChartData = useMemo(() => {
    const byCategory = new Map<string, number>()
    for (const log of timeLogs) {
      const key = log.category ?? 'Uncategorized'
      byCategory.set(key, (byCategory.get(key) ?? 0) + (log.duration_seconds ?? 0))
    }
    return [...byCategory.entries()].map(([label, seconds]) => ({ label, seconds })).sort((a, b) => b.seconds - a.seconds)
  }, [timeLogs])

  async function handleQuickAdd() {
    const description = quickAddText.trim()
    if (!description || !currentStaffId || quickAddBusy) return
    setQuickAddBusy(true)
    setQuickAddText('')
    const res = await fetch('/api/task-manager', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description, assigned_to: currentStaffId, assigned_by: currentStaffId }),
    })
    setQuickAddBusy(false)
    if (!res.ok) { setError('Failed to create task.'); setQuickAddText(description); return }
    await loadTasks()
    quickAddRef.current?.focus()
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
            marginBottom: '20px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
            <div>
              <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--ink)', marginBottom: '4px' }}>
                Welcome back, {currentStaff?.name ?? 'there'} 👋
              </div>
              <div style={{ fontSize: '13px', color: 'var(--ink3)' }}>
                You have <strong style={{ color: 'var(--ink)' }}>{personalMetrics.total} assigned tasks</strong>
                {personalMetrics.overdue > 0 && <span style={{ color: 'var(--red)', fontWeight: 700 }}> ({personalMetrics.overdue} overdue)</span>}
                {personalMetrics.dueToday > 0 && <span style={{ color: 'var(--amber)', fontWeight: 700 }}> • {personalMetrics.dueToday} due today</span>}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <div style={{ padding: '8px 16px', background: 'var(--surface)', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
                <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--ink4)', textTransform: 'uppercase' }}>In Progress</div>
                <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--purple)' }}>{personalMetrics.inProgress}</div>
              </div>
              <div style={{ padding: '8px 16px', background: 'var(--surface)', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
                <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--ink4)', textTransform: 'uppercase' }}>Due Today</div>
                <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--amber)' }}>{personalMetrics.dueToday}</div>
              </div>
              <div style={{ padding: '8px 16px', background: 'var(--surface)', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
                <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--ink4)', textTransform: 'uppercase' }}>Completed</div>
                <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--teal)' }}>{personalMetrics.done}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Quick add — the "create a task in a jiffy" path. Defaults everything
          (assignee = self, status = Not-Started, priority = Medium) so one
          line + Enter is all it takes; press "N" from anywhere to jump here. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'var(--card)', border: '1.5px solid var(--border-light)', borderRadius: '12px', padding: '4px 6px 4px 16px', marginBottom: '16px', boxShadow: 'var(--shadow-sm)' }}>
        <span style={{ color: 'var(--teal-mid)', fontSize: '16px', fontWeight: 800, flexShrink: 0 }}>+</span>
        <input
          ref={quickAddRef}
          value={quickAddText}
          onChange={e => setQuickAddText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleQuickAdd() }}
          placeholder="Add a task and press Enter… (assigns to you — edit details after)"
          disabled={quickAddBusy}
          style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'var(--ink)', fontSize: '14px', padding: '10px 0' }}
        />
        <kbd style={{ fontSize: '11px', color: 'var(--ink4)', background: 'var(--border-light)', border: '1px solid var(--border)', borderRadius: '5px', padding: '2px 6px', flexShrink: 0 }}>N</kbd>
      </div>

      <Card padded>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '16px' }}>
          <ToggleGroup value={view} onChange={setView} options={[['table', 'Table'], ['kanban', 'Kanban'], ['timesheets', 'Timesheets']]} />

          {view !== 'timesheets' && (
            <>
              {/* Real-time search */}
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search tasks, notes, people…"
                  style={{
                    padding: '6px 28px 6px 10px',
                    fontSize: '12px',
                    borderRadius: '8px',
                    border: '1px solid var(--border)',
                    background: 'var(--surface)',
                    color: 'var(--ink)',
                    minWidth: '180px',
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
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--ink3)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={myTasksOnly} onChange={e => setMyTasksOnly(e.target.checked)} />
                  My Tasks
                </label>
              )}

              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as 'all' | TaskStatus)} style={PILL_FILTER_STYLE}>
                <option value="all">All statuses</option>
                <option value="Not-Started">Not Started</option>
                <option value="In-Progress">In Progress</option>
                <option value="Completed">Completed</option>
              </select>

              <select value={priorityFilter} onChange={e => setPriorityFilter(e.target.value as 'all' | TaskPriority)} style={PILL_FILTER_STYLE}>
                <option value="all">All priorities</option>
                <option value="High">High</option>
                <option value="Medium">Medium</option>
                <option value="Low">Low</option>
              </select>

              {/* Event Filter */}
              <select value={eventFilter} onChange={e => setEventFilter(e.target.value)} style={PILL_FILTER_STYLE}>
                <option value="all">All events</option>
                {events.map(ev => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
              </select>

              {dashboardMode === 'admin' && (
                <select value={assignerFilter} onChange={e => setAssignerFilter(e.target.value)} style={PILL_FILTER_STYLE}>
                  <option value="all">All assigners</option>
                  {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              )}

              {/* Group by Event Toggle (in table mode) */}
              {view === 'table' && (
                <button
                  type="button"
                  onClick={() => setGroupByEvent(!groupByEvent)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '8px',
                    fontSize: '12px',
                    fontWeight: 600,
                    background: groupByEvent ? 'var(--teal-light)' : 'var(--surface)',
                    color: groupByEvent ? 'var(--teal-mid)' : 'var(--ink3)',
                    border: `1px solid ${groupByEvent ? 'var(--teal-mid)' : 'var(--border)'}`,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <span>📁</span> Group by Event
                </button>
              )}

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
                    background: 'none',
                    border: 'none',
                    color: 'var(--teal-mid)',
                    fontSize: '12px',
                    cursor: 'pointer',
                    textDecoration: 'underline',
                    padding: '4px 6px',
                  }}
                >
                  Reset filters
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
