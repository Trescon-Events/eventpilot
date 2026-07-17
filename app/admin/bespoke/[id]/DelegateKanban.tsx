'use client'
/**
 * Delegate Pipeline Kanban — Nic PRD 16 Jul 2026
 *
 * 6 columns (one per stage) with drag-and-drop cards. Uses @dnd-kit/core
 * which is already a project dependency. Dropping a card in a different
 * column triggers `onStageChange(delegateId, newStage)` — the parent handles
 * the optimistic update and API call (same handler used by the Table view's
 * stage dropdown).
 *
 * No CSS changes to card language — reuses the existing color tokens and
 * card radius from the Pipeline tab per Nic's "functional changes only" rule.
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

export type BespokeDelegate = {
  id: string
  name: string
  company: string | null
  title: string | null
  email: string | null
  stage: string
  source: string
  notes: string | null
  last_contact_date: string | null
}

interface Props {
  delegates: BespokeDelegate[]
  stages: string[]
  stageLabels: Record<string, string>
  stageColors: Record<string, string>
  sourceLabels: Record<string, string>
  onStageChange: (delegateId: string, newStage: string) => void
}

export function DelegateKanban({ delegates, stages, stageLabels, stageColors, sourceLabels, onStageChange }: Props) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const byStage = useMemo(() => {
    const map: Record<string, BespokeDelegate[]> = {}
    for (const s of stages) map[s] = []
    for (const d of delegates) {
      if (map[d.stage]) map[d.stage].push(d)
      else map[stages[0]]?.push(d)
    }
    return map
  }, [delegates, stages])

  const activeDelegate = activeId ? delegates.find(d => d.id === activeId) ?? null : null

  const onDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id))
  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null)
    const overStage = e.over?.id
    if (!overStage) return
    const delegateId = String(e.active.id)
    const delegate = delegates.find(d => d.id === delegateId)
    if (!delegate) return
    if (delegate.stage === overStage) return
    onStageChange(delegateId, String(overStage))
  }

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${stages.length}, minmax(190px, 1fr))`,
          gap: '10px',
          overflowX: 'auto',
        }}
      >
        {stages.map(stage => (
          <KanbanColumn
            key={stage}
            stage={stage}
            label={stageLabels[stage] ?? stage}
            color={stageColors[stage] ?? '#5B7080'}
            delegates={byStage[stage] ?? []}
            sourceLabels={sourceLabels}
          />
        ))}
      </div>

      <DragOverlay dropAnimation={null}>
        {activeDelegate ? <DelegateCard delegate={activeDelegate} sourceLabels={sourceLabels} floating /> : null}
      </DragOverlay>
    </DndContext>
  )
}

function KanbanColumn({
  stage,
  label,
  color,
  delegates,
  sourceLabels,
}: {
  stage: string
  label: string
  color: string
  delegates: BespokeDelegate[]
  sourceLabels: Record<string, string>
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage })
  return (
    <div
      ref={setNodeRef}
      style={{
        background: isOver ? '#F0F9FF' : '#F8FAFC',
        border: `1px solid ${isOver ? color : '#DDE8EE'}`,
        borderRadius: '12px',
        padding: '12px',
        minHeight: '360px',
        transition: 'background 0.15s, border-color 0.15s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: color, display: 'inline-block' }} />
          <span style={{ fontSize: '12px', fontWeight: 700, color: '#0F1923', letterSpacing: '0.2px' }}>{label}</span>
        </div>
        <span style={{ fontSize: '11px', fontWeight: 700, color: '#5B7080', background: '#FFFFFF', padding: '2px 8px', borderRadius: '10px', border: '1px solid #DDE8EE' }}>
          {delegates.length}
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {delegates.map(d => <DraggableCard key={d.id} delegate={d} sourceLabels={sourceLabels} />)}
        {delegates.length === 0 && (
          <div style={{ padding: '20px 8px', textAlign: 'center', fontSize: '11px', color: '#94A3B8', fontStyle: 'italic' }}>
            Drop delegates here
          </div>
        )}
      </div>
    </div>
  )
}

function DraggableCard({ delegate, sourceLabels }: { delegate: BespokeDelegate; sourceLabels: Record<string, string> }) {
  const { setNodeRef, listeners, attributes, isDragging, transform } = useDraggable({ id: delegate.id })
  const style = {
    opacity: isDragging ? 0.3 : 1,
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
  }
  return (
    <div ref={setNodeRef} {...listeners} {...attributes} style={style}>
      <DelegateCard delegate={delegate} sourceLabels={sourceLabels} />
    </div>
  )
}

function DelegateCard({
  delegate,
  sourceLabels,
  floating,
}: {
  delegate: BespokeDelegate
  sourceLabels: Record<string, string>
  floating?: boolean
}) {
  return (
    <div
      style={{
        background: '#FFFFFF',
        border: '1px solid #DDE8EE',
        borderRadius: '8px',
        padding: '10px 12px',
        cursor: 'grab',
        boxShadow: floating ? '0 8px 24px rgba(15, 25, 35, 0.18)' : 'none',
        transition: 'box-shadow 0.15s',
        userSelect: 'none',
      }}
    >
      <div style={{ fontSize: '13px', fontWeight: 700, color: '#0F1923', marginBottom: '2px' }}>{delegate.name}</div>
      {delegate.company && (
        <div style={{ fontSize: '12px', color: '#2D3E50', marginBottom: '2px' }}>{delegate.company}</div>
      )}
      {delegate.title && (
        <div style={{ fontSize: '11px', color: '#5B7080', marginBottom: '6px' }}>{delegate.title}</div>
      )}
      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
        <span
          style={{
            fontSize: '10px', fontWeight: 700, padding: '2px 6px', borderRadius: '4px',
            background: '#F0F4F8', color: '#5B7080',
          }}
        >
          {sourceLabels[delegate.source] ?? delegate.source}
        </span>
      </div>
    </div>
  )
}
