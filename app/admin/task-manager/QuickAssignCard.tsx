'use client'
import { useState } from 'react'
import Button from '@/app/components/ui/Button'
import { EventLite, PRIORITIES, PRIORITY_COLOR, StaffLite, TaskPriority, TaskSaveValues } from './types'
import { Avatar, PillSelect, SearchableSelect } from './ui'

interface Props {
  staff: StaffLite[]
  events: EventLite[]
  counts?: Record<string, { total: number; not_started: number; in_progress: number; completed: number }>
  currentStaffId: string | null
  onAssign: (values: TaskSaveValues) => Promise<void>
}

export default function QuickAssignCard({ staff, events, counts, currentStaffId, onAssign }: Props) {
  const [description, setDescription] = useState('')
  const [assignedTo, setAssignedTo] = useState('')
  const [eventId, setEventId] = useState('')
  const [deadline, setDeadline] = useState('')
  const [priority, setPriority] = useState<TaskPriority>('Medium')
  const [remarks, setRemarks] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canSubmit = description.trim().length > 0 && assignedTo.length > 0 && !busy

  async function handleSubmit() {
    if (!canSubmit) return
    setBusy(true)
    setError(null)
    try {
      await onAssign({
        description: description.trim(),
        assigned_by: currentStaffId ?? assignedTo,
        assigned_to: assignedTo,
        event_id: eventId || null,
        deadline: deadline || null,
        priority,
        remarks: remarks.trim() || null,
      })
      setDescription('')
      setRemarks('')
      setDeadline('')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to assign task')
    } finally {
      setBusy(false)
    }
  }

  const selectedStaffMember = staff.find(s => s.id === assignedTo)
  const staffOptions = staff.map(s => {
    const staffCount = counts?.[s.id]
    const active = staffCount ? staffCount.in_progress + staffCount.not_started : 0
    let label = s.name
    if (counts) {
      if (active === 0) {
        label = `${s.name} — 🟢 Available (0 tasks)`
      } else if (active <= 3) {
        label = `${s.name} — 🟡 ${active} active`
      } else {
        label = `${s.name} — 🔴 ${active} active`
      }
    }
    return { id: s.id, label, active }
  }).sort((a, b) => a.active - b.active || a.label.localeCompare(b.label))
  const eventOptions = events.map(ev => ({ id: ev.id, label: ev.name }))

  return (
    <div
      style={{
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: '12px',
        padding: '16px 20px',
        marginBottom: '16px',
        boxShadow: 'var(--shadow-sm)',
      }}
      onKeyDown={e => {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
          handleSubmit()
        }
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ color: 'var(--teal-mid)', fontSize: '15px' }}>⚡</span>
          <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
            Assign a New Task
          </span>
        </div>
        <span style={{ fontSize: '11px', color: 'var(--ink4)' }}>
          Press <kbd style={{ background: 'var(--border-light)', padding: '2px 5px', borderRadius: '4px', border: '1px solid var(--border)', fontSize: '10px' }}>Ctrl + Enter</kbd> to assign
        </span>
      </div>

      {error && (
        <div style={{ background: 'var(--red-light)', color: 'var(--red)', border: '1px solid var(--red-border)', borderRadius: '6px', padding: '6px 10px', fontSize: '12px', marginBottom: '10px' }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {/* Row 1: Task Title Input */}
        <div style={{ display: 'flex', gap: '8px' }}>
          <input
            type="text"
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Task description (e.g. Design keynote presentation slides, update sponsor guidelines)..."
            disabled={busy}
            style={{
              flex: 1,
              height: '38px',
              padding: '0 14px',
              fontSize: '13px',
              fontWeight: 500,
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              color: 'var(--ink)',
              outline: 'none',
              transition: 'border-color 0.15s, box-shadow 0.15s',
            }}
          />
        </div>

        {/* Row 2: Assignee, Event, Deadline, Priority & Action */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {/* Assignee Searchable Dropdown */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '0 8px', height: '36px', minWidth: '180px' }}>
            {selectedStaffMember ? (
              <Avatar name={selectedStaffMember.name} size={20} />
            ) : (
              <span style={{ fontSize: '12px', color: 'var(--ink4)' }}>👤</span>
            )}
            <div style={{ flex: 1 }}>
              <SearchableSelect
                options={staffOptions}
                value={assignedTo}
                onChange={setAssignedTo}
                placeholder="Select Assignee…"
                compact
              />
            </div>
          </div>

          {/* Event Searchable Dropdown */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '0 8px', height: '36px', minWidth: '200px' }}>
            <span style={{ fontSize: '12px', color: 'var(--ink4)' }}>📁</span>
            <div style={{ flex: 1 }}>
              <SearchableSelect
                options={eventOptions}
                value={eventId}
                onChange={setEventId}
                placeholder="Select Event…"
                emptyOptionLabel="General (No Event)"
                compact
              />
            </div>
          </div>

          {/* Deadline Picker */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '0 10px', height: '36px' }}>
            <span style={{ fontSize: '12px', color: 'var(--ink4)' }}>📅</span>
            <input
              type="date"
              value={deadline}
              onChange={e => setDeadline(e.target.value)}
              disabled={busy}
              style={{
                background: 'transparent',
                border: 'none',
                color: deadline ? 'var(--ink)' : 'var(--ink4)',
                fontSize: '12px',
                fontWeight: 500,
                outline: 'none',
                cursor: 'pointer',
              }}
            />
          </div>

          {/* Priority Pill */}
          <div style={{ height: '36px', display: 'flex', alignItems: 'center' }}>
            <PillSelect
              pillColor={PRIORITY_COLOR[priority]}
              value={priority}
              onChange={e => setPriority(!busy ? e.target.value as TaskPriority : priority)}
              style={{ height: '36px', padding: '0 24px 0 12px' }}
            >
              {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
            </PillSelect>
          </div>

          {/* Optional Remarks input */}
          <input
            type="text"
            value={remarks}
            onChange={e => setRemarks(e.target.value)}
            placeholder="Remarks / Note (optional)…"
            disabled={busy}
            style={{
              flex: 1,
              minWidth: '150px',
              height: '36px',
              padding: '0 12px',
              fontSize: '12px',
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              color: 'var(--ink)',
              outline: 'none',
            }}
          />

          {/* Assign Button */}
          <Button
            variant="teal"
            onClick={handleSubmit}
            disabled={!canSubmit}
          >
            {busy ? 'Assigning…' : 'Assign Task ➔'}
          </Button>
        </div>
      </div>
    </div>
  )
}
