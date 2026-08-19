'use client'
/**
 * Task Manager Kanban — adapted from app/admin/bespoke/[id]/DelegateKanban.tsx.
 * Kept as its own copy (not a shared primitive) so every file Khalifa
 * routinely touches stays inside app/admin/task-manager/ — pulling this into
 * app/components/ would put his day-to-day PRs outside the CI pipeline's
 * isolated-path check and flag them REVIEW_CLOSELY forever.
 *
 * Columns are the 3 fixed status values (not an open-ended stages prop —
 * status is CHECK-constrained, unlike DelegateKanban's free-text stage).
 */
import { useMemo, useState } from 'react'
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import Badge from '@/app/components/ui/Badge'
import { PRIORITY_COLOR, STATUSES, Task, TaskStatus, formatHours } from './types'
import { Avatar } from './ui'

const STATUS_LABEL: Record<TaskStatus, string> = {
  'Not-Started': 'Not Started',
  'In-Progress': 'In Progress',
  'Completed': 'Completed',
}

const STATUS_DOT: Record<TaskStatus, string> = {
  'Not-Started': 'var(--ink3)',
  'In-Progress': 'var(--purple)',
  'Completed': 'var(--teal)',
}

interface Props {
  tasks: Task[]
  currentStaffId: string | null
  runningTaskId: string | null
  onStatusChange: (taskId: string, newStatus: TaskStatus) => void
  onOpenTask: (task: Task) => void
  onTimerAction: (taskId: string, action: 'start' | 'pause' | 'stop') => void
  onQuickAddInColumn: (status: TaskStatus) => void
}

export default function TaskKanban({ tasks, currentStaffId, runningTaskId, onStatusChange, onOpenTask, onTimerAction, onQuickAddInColumn }: Props) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const byStatus = useMemo(() => {
    const map: Record<string, Task[]> = {}
    for (const s of STATUSES) map[s] = []
    for (const t of tasks) (map[t.status] ?? map[STATUSES[0]]).push(t)
    return map
  }, [tasks])

  const activeTask = activeId ? tasks.find(t => t.id === activeId) ?? null : null

  const onDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id))
  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null)
    const overStatus = e.over?.id
    if (!overStatus) return
    const taskId = String(e.active.id)
    const task = tasks.find(t => t.id === taskId)
    if (!task || task.status === overStatus) return
    onStatusChange(taskId, overStatus as TaskStatus)
  }

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${STATUSES.length}, minmax(240px, 1fr))`, gap: '12px', overflowX: 'auto' }}>
        {STATUSES.map(status => (
          <KanbanColumn
            key={status}
            status={status}
            tasks={byStatus[status] ?? []}
            currentStaffId={currentStaffId}
            runningTaskId={runningTaskId}
            onOpenTask={onOpenTask}
            onTimerAction={onTimerAction}
            onQuickAdd={() => onQuickAddInColumn(status)}
          />
        ))}
      </div>

      <DragOverlay dropAnimation={null}>
        {activeTask ? <TaskCard task={activeTask} currentStaffId={currentStaffId} runningTaskId={runningTaskId} onOpenTask={onOpenTask} onTimerAction={onTimerAction} floating /> : null}
      </DragOverlay>
    </DndContext>
  )
}

function KanbanColumn({
  status, tasks, currentStaffId, runningTaskId, onOpenTask, onTimerAction, onQuickAdd,
}: {
  status: TaskStatus
  tasks: Task[]
  currentStaffId: string | null
  runningTaskId: string | null
  onOpenTask: (task: Task) => void
  onTimerAction: (taskId: string, action: 'start' | 'pause' | 'stop') => void
  onQuickAdd: () => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status })
  const color = STATUS_DOT[status]
  return (
    <div
      ref={setNodeRef}
      style={{
        background: isOver ? 'var(--card-hi)' : 'var(--border-light)',
        border: `1px solid ${isOver ? color : 'var(--border)'}`,
        borderRadius: '12px',
        padding: '12px',
        minHeight: '360px',
        transition: 'background 0.15s, border-color 0.15s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: color, display: 'inline-block' }} />
          <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--ink)', letterSpacing: '0.2px' }}>{STATUS_LABEL[status]}</span>
        </div>
        <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink3)', background: 'var(--card)', padding: '2px 8px', borderRadius: '10px', border: '1px solid var(--border)' }}>
          {tasks.length}
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '8px' }}>
        {tasks.map(t => (
          <DraggableCard key={t.id} task={t} currentStaffId={currentStaffId} runningTaskId={runningTaskId} onOpenTask={onOpenTask} onTimerAction={onTimerAction} />
        ))}
        {tasks.length === 0 && (
          <div style={{ padding: '20px 8px', textAlign: 'center', fontSize: '11px', color: 'var(--ink4)', fontStyle: 'italic' }}>
            Drop tasks here
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={onQuickAdd}
        style={{
          width: '100%', padding: '8px', fontSize: '12px', fontWeight: 700, color: 'var(--ink3)',
          background: 'transparent', border: `1px dashed var(--border)`, borderRadius: '8px', cursor: 'pointer',
        }}
      >
        + Add task
      </button>
    </div>
  )
}

function DraggableCard(props: {
  task: Task
  currentStaffId: string | null
  runningTaskId: string | null
  onOpenTask: (task: Task) => void
  onTimerAction: (taskId: string, action: 'start' | 'pause' | 'stop') => void
}) {
  const { setNodeRef, listeners, attributes, isDragging, transform } = useDraggable({ id: props.task.id })
  const style = {
    opacity: isDragging ? 0.3 : 1,
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
  }
  return (
    <div ref={setNodeRef} {...listeners} {...attributes} style={style}>
      <TaskCard {...props} />
    </div>
  )
}

function TaskCard({
  task, currentStaffId, runningTaskId, onOpenTask, onTimerAction, floating,
}: {
  task: Task
  currentStaffId: string | null
  runningTaskId: string | null
  onOpenTask: (task: Task) => void
  onTimerAction: (taskId: string, action: 'start' | 'pause' | 'stop') => void
  floating?: boolean
}) {
  const isMine = currentStaffId && task.assigned_to === currentStaffId
  const isRunning = runningTaskId === task.id

  return (
    <div
      style={{
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: '8px',
        padding: '10px 12px',
        cursor: 'grab',
        boxShadow: floating ? 'var(--shadow-md)' : 'none',
        userSelect: 'none',
      }}
      onClick={() => onOpenTask(task)}
    >
      {task.event && (
        <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--ink4)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '4px' }}>
          {task.event.name}
        </div>
      )}
      <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink)', marginBottom: '6px' }}>{task.description}</div>
      <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '8px' }}>
        <Badge color={PRIORITY_COLOR[task.priority]}>{task.priority}</Badge>
        {task.deadline && (
          <span style={{ fontSize: '11px', color: 'var(--ink3)' }}>Due {task.deadline}</span>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {task.assigned_to_staff && <Avatar name={task.assigned_to_staff.name} size={20} />}
          <span style={{ fontSize: '11px', color: 'var(--ink3)' }}>{task.assigned_to_staff?.name ?? '—'}</span>
        </div>
        {isMine && task.status !== 'Completed' && (
          <button
            type="button"
            onClick={e => { e.stopPropagation(); onTimerAction(task.id, isRunning ? 'stop' : 'start') }}
            style={{
              fontSize: '11px', fontWeight: 700, padding: '3px 8px', borderRadius: '6px', border: 'none', cursor: 'pointer',
              background: isRunning ? 'var(--danger)' : 'var(--teal-mid)', color: 'var(--surface)',
            }}
          >
            {isRunning ? '■ Stop' : '▶ Start'}
          </button>
        )}
        {!isMine && task.tracked_seconds > 0 && (
          <span style={{ fontSize: '11px', color: 'var(--ink4)' }}>{formatHours(task.tracked_seconds)}</span>
        )}
      </div>
    </div>
  )
}
