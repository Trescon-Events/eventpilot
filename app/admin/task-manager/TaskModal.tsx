'use client'
import { useEffect, useMemo, useState } from 'react'
import Button from '@/app/components/ui/Button'
import { Select, Textarea } from '@/app/components/ui/Field'
import { EventLite, PRIORITIES, StaffLite, Task, TaskPriority, TaskSaveValues, VendorContact, isBrandingStaff } from './types'
import { CUSTOM_SCROLLBAR_STYLE, SearchableSelect } from './ui'

interface Props {
  task: Task | null   // null = creating a new task
  staff: StaffLite[]
  events: EventLite[]
  counts?: Record<string, { total: number; not_started: number; in_progress: number; completed: number }>
  currentStaffId: string | null
  onClose: () => void
  onSave: (values: TaskSaveValues) => Promise<void> | void
}

export default function TaskModal({ task, staff, events, counts, currentStaffId, onClose, onSave }: Props) {
  const [eventId, setEventId] = useState(task?.event_id ?? '')
  const [description, setDescription] = useState(task?.description ?? '')
  const [assignedBy, setAssignedBy] = useState(task?.assigned_by ?? currentStaffId ?? '')
  // Defaults to self on create — most tasks people create are for themselves;
  // reassigning is one dropdown change away, not a blocker to a fast save.
  const [assignedTo, setAssignedTo] = useState(task?.assigned_to ?? currentStaffId ?? '')
  const [assignedContactId, setAssignedContactId] = useState(task?.assigned_contact_id ?? '')
  const [vendorContacts, setVendorContacts] = useState<VendorContact[]>([])
  const [deadline, setDeadline] = useState(task?.deadline ?? '')
  const [priority, setPriority] = useState<TaskPriority>(task?.priority ?? 'Medium')
  const [remarks, setRemarks] = useState(task?.remarks ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showAllStaff, setShowAllStaff] = useState(false)

  // Filter staff to Branding Department members only
  const brandingStaff = useMemo(() => {
    const b = staff.filter(isBrandingStaff)
    return b.length > 0 ? b : staff
  }, [staff])

  // If current assignedTo is not in brandingStaff, keep it in the list so historical edits don't break
  const assigneeCandidates = useMemo(() => {
    if (showAllStaff) return staff
    const set = new Set(brandingStaff.map((s: StaffLite) => s.id))
    if (assignedTo && !set.has(assignedTo)) {
      const extra = staff.find((s: StaffLite) => s.id === assignedTo)
      if (extra) return [extra, ...brandingStaff]
    }
    return brandingStaff
  }, [showAllStaff, staff, brandingStaff, assignedTo])

  const assigneeStaff = useMemo(() => staff.find(s => s.id === assignedTo) ?? null, [staff, assignedTo])
  const isVendorAssignee = assigneeStaff?.account_type === 'vendor'

  // Reassigning to someone else (vendor or not) always drops a previously-
  // picked contact — a stale tag from the old assignee shouldn't ride along.
  function chooseAssignee(id: string) {
    setAssignedTo(id)
    setAssignedContactId('')
  }

  // Loads the new vendor assignee's contact roster. Nothing to fetch (and
  // nothing to clear — the picker below only renders for a vendor assignee
  // in the first place) when the assignee isn't a vendor.
  useEffect(() => {
    if (!isVendorAssignee) return
    let cancelled = false
    fetch(`/api/task-manager/vendor-contacts?vendor_staff_id=${assignedTo}`)
      .then(r => r.json())
      .then((data: VendorContact[]) => { if (!cancelled) setVendorContacts(Array.isArray(data) ? data.filter(c => c.active) : []) })
      .catch(() => { if (!cancelled) setVendorContacts([]) })
    return () => { cancelled = true }
  }, [assignedTo, isVendorAssignee])

  const canSave = description.trim().length > 0 && assignedTo.length > 0

  async function save() {
    if (!canSave || busy) return
    setBusy(true)
    setError(null)
    try {
      await onSave({
        id: task?.id,
        event_id: eventId || null,
        description: description.trim(),
        assigned_by: assignedBy,
        assigned_to: assignedTo,
        assigned_contact_id: isVendorAssignee ? (assignedContactId || null) : null,
        deadline: deadline || null,
        priority,
        remarks: remarks.trim() || null,
      })
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save task')
      setBusy(false)
    }
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) save()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
    // No deps array — intentionally re-bound on every render so `save` closes over the latest field state.
  })

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'var(--overlay-scrim)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}
      onClick={onClose}
    >
      <div
        className="tm-scroll"
        style={{
          background: 'var(--card)',
          borderRadius: '16px',
          padding: '32px',
          width: '660px',
          maxWidth: '94vw',
          maxHeight: '88vh',
          overflowY: 'auto',
          boxShadow: 'var(--shadow-lg, var(--shadow-md))',
          border: '1px solid var(--border)',
          ...CUSTOM_SCROLLBAR_STYLE,
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '22px' }}>
          <h2 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--ink)', margin: 0 }}>
            {task ? 'Edit Task' : 'New Task'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--ink4)', fontSize: '18px', cursor: 'pointer', padding: '4px' }}
          >
            ✕
          </button>
        </div>

        {error && (
          <div style={{ background: 'var(--red-light)', color: 'var(--red)', border: '1px solid var(--red-border)', borderRadius: '8px', padding: '10px 14px', fontSize: '12px', marginBottom: '16px' }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <Field label="Task description *">
            <Textarea
              autoFocus
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
              style={{ fontSize: '14px', lineHeight: '1.5', padding: '10px 14px' }}
              placeholder="What needs to be done? (e.g. DFS Speaker Announcement Templates, 4 promo designs...)"
            />
          </Field>

          <Field label="Event">
            <SearchableSelect
              options={events.map(ev => ({ id: ev.id, label: ev.name }))}
              value={eventId}
              onChange={setEventId}
              placeholder="Search events…"
              emptyOptionLabel="No event — internal / general task"
            />
          </Field>

          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px' }}>
            <Field label="Assigned by">
              <SearchableSelect
                options={staff.map(s => ({ id: s.id, label: s.name }))}
                value={assignedBy}
                onChange={setAssignedBy}
                placeholder="Search staff…"
                emptyOptionLabel="—"
              />
            </Field>

            <button
              type="button"
              onClick={() => {
                const prevBy = assignedBy
                setAssignedBy(assignedTo)
                chooseAssignee(prevBy)
              }}
              style={{
                height: '40px',
                width: '40px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '8px',
                border: '1px solid var(--border)',
                background: 'var(--surface)',
                color: 'var(--teal-mid)',
                fontSize: '16px',
                fontWeight: 700,
                cursor: 'pointer',
                flexShrink: 0,
                marginBottom: '1px',
                transition: 'all 0.15s ease',
              }}
              title="Swap Assigned By and Assigned To"
            >
              ⇄
            </button>

            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                  Assigned to (Branding Team) *
                </span>
                <button
                  type="button"
                  onClick={() => setShowAllStaff(!showAllStaff)}
                  style={{ background: 'none', border: 'none', color: 'var(--teal)', fontSize: '10px', fontWeight: 600, cursor: 'pointer', padding: 0 }}
                >
                  {showAllStaff ? 'Show Branding only' : 'Show all staff'}
                </button>
              </div>
              <SearchableSelect
                options={assigneeCandidates.map((s: StaffLite) => {
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
                }).sort((a: { active: number; label: string }, b: { active: number; label: string }) => a.active - b.active || a.label.localeCompare(b.label))}
                value={assignedTo}
                onChange={chooseAssignee}
                placeholder="Search branding staff…"
              />
            </div>
          </div>

          {isVendorAssignee && (
            <Field label={`Assign to specific person at ${assigneeStaff?.vendor_label ?? assigneeStaff?.name ?? 'this agency'} (optional)`}>
              <SearchableSelect
                options={vendorContacts.map(c => ({ id: c.id, label: c.name }))}
                value={assignedContactId}
                onChange={setAssignedContactId}
                placeholder="Search contacts…"
                emptyOptionLabel="No specific person"
              />
            </Field>
          )}

          <div style={{ display: 'flex', gap: '14px' }}>
            <Field label="Deadline">
              <input
                type="date"
                value={deadline ?? ''}
                onChange={e => setDeadline(e.target.value)}
                onClick={e => {
                  try {
                    e.currentTarget.showPicker?.()
                  } catch {}
                }}
                style={{
                  width: '100%',
                  height: '40px',
                  padding: '0 12px',
                  fontSize: '13px',
                  fontWeight: 500,
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  color: 'var(--ink)',
                  outline: 'none',
                  cursor: 'pointer',
                }}
              />
            </Field>
            <Field label="Priority">
              <Select
                value={priority}
                onChange={e => setPriority(e.target.value as TaskPriority)}
                style={{ height: '40px' }}
              >
                {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
              </Select>
            </Field>
          </div>

          <Field label="Remarks / Note">
            <Textarea
              value={remarks ?? ''}
              onChange={e => setRemarks(e.target.value)}
              rows={2}
              style={{ fontSize: '13px', padding: '10px 14px' }}
              placeholder="Add any extra notes, assets links, or instructions..."
            />
          </Field>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '26px', paddingTop: '16px', borderTop: '1px solid var(--border-light)' }}>
          <span style={{ fontSize: '11px', color: 'var(--ink4)' }}>⌘/Ctrl + Enter to save · Esc to cancel</span>
          <div style={{ display: 'flex', gap: '10px' }}>
            <Button variant="ghost" disabled={busy} onClick={onClose}>Cancel</Button>
            <Button variant="teal" disabled={!canSave || busy} onClick={save}>
              {busy ? 'Saving…' : task ? 'Save Changes' : 'Create Task'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
      <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.3px' }}>{label}</span>
      {children}
    </label>
  )
}
