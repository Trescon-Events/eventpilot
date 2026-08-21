'use client'
import { useEffect, useRef, useState } from 'react'
import Button from '@/app/components/ui/Button'
import { Input, Select, Textarea } from '@/app/components/ui/Field'
import { EventLite, PRIORITIES, StaffLite, Task, TaskPriority, TaskSaveValues } from './types'
import { SearchableSelect } from './ui'

interface Props {
  task: Task | null   // null = creating a new task
  staff: StaffLite[]
  events: EventLite[]
  currentStaffId: string | null
  onClose: () => void
  onSave: (values: TaskSaveValues) => void
}

export default function TaskModal({ task, staff, events, currentStaffId, onClose, onSave }: Props) {
  const [eventId, setEventId] = useState(task?.event_id ?? '')
  const [description, setDescription] = useState(task?.description ?? '')
  const [assignedBy, setAssignedBy] = useState(task?.assigned_by ?? currentStaffId ?? '')
  // Defaults to self on create — most tasks people create are for themselves;
  // reassigning is one dropdown change away, not a blocker to a fast save.
  const [assignedTo, setAssignedTo] = useState(task?.assigned_to ?? currentStaffId ?? '')
  const [deadline, setDeadline] = useState(task?.deadline ?? '')
  const [priority, setPriority] = useState<TaskPriority>(task?.priority ?? 'Medium')
  const [remarks, setRemarks] = useState(task?.remarks ?? '')
  const [attachmentUrl, setAttachmentUrl] = useState<string | null>(task?.attachment_url ?? null)
  const [attachmentName, setAttachmentName] = useState<string | null>(task?.attachment_name ?? null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const canSave = description.trim().length > 0 && assignedTo.length > 0 && !uploading

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setUploadError(null)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch('/api/task-manager/upload', {
        method: 'POST',
        body: formData,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Upload failed')
      setAttachmentUrl(data.url)
      setAttachmentName(data.name || file.name)
    } catch (err: unknown) {
      setUploadError(err instanceof Error ? err.message : 'File upload failed')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  function save() {
    if (!canSave) return
    onSave({
      id: task?.id,
      event_id: eventId || null,
      description: description.trim(),
      assigned_by: assignedBy,
      assigned_to: assignedTo,
      deadline: deadline || null,
      priority,
      remarks: remarks.trim() || null,
      attachment_url: attachmentUrl || null,
      attachment_name: attachmentName || null,
    })
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
        style={{ background: 'var(--card)', borderRadius: '14px', padding: '28px', width: '520px', maxWidth: '90vw', maxHeight: '85vh', overflowY: 'auto', boxShadow: 'var(--shadow-md)' }}
        onClick={e => e.stopPropagation()}
      >
        <h2 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--ink)', margin: '0 0 18px' }}>
          {task ? 'Edit Task' : 'New Task'}
        </h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <Field label="Task description *">
            <Textarea autoFocus value={description} onChange={e => setDescription(e.target.value)} rows={2} style={{ fontSize: '14px' }} />
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

          <div style={{ display: 'flex', gap: '12px' }}>
            <Field label="Assigned by">
              <SearchableSelect
                options={staff.map(s => ({ id: s.id, label: s.name }))}
                value={assignedBy}
                onChange={setAssignedBy}
                placeholder="Search staff…"
                emptyOptionLabel="—"
              />
            </Field>

            <Field label="Assigned to *">
              <SearchableSelect
                options={staff.map(s => ({ id: s.id, label: s.name }))}
                value={assignedTo}
                onChange={setAssignedTo}
                placeholder="Search staff…"
              />
            </Field>
          </div>

          <div style={{ display: 'flex', gap: '12px' }}>
            <Field label="Deadline">
              <Input type="date" value={deadline ?? ''} onChange={e => setDeadline(e.target.value)} />
            </Field>
            <Field label="Priority">
              <Select value={priority} onChange={e => setPriority(e.target.value as TaskPriority)}>
                {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
              </Select>
            </Field>
          </div>

          <Field label="Remarks">
            <Textarea value={remarks ?? ''} onChange={e => setRemarks(e.target.value)} rows={2} />
          </Field>

          {/* Attachment upload */}
          <Field label="Attachment / Files">
            <input ref={fileInputRef} type="file" onChange={handleFileUpload} style={{ display: 'none' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '7px 12px',
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  color: 'var(--ink)',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                <span>📎</span>
                {uploading ? 'Uploading…' : 'Upload File / Document'}
              </button>

              {attachmentUrl && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 10px', background: 'var(--teal-light)', border: '1px solid var(--teal)', borderRadius: '6px' }}>
                  <span style={{ fontSize: '12px', color: 'var(--teal)', fontWeight: 600 }}>
                    📎 {attachmentName || 'Attached File'}
                  </span>
                  <a href={attachmentUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: '11px', color: 'var(--teal-mid)', textDecoration: 'underline' }}>
                    View
                  </a>
                  <button
                    type="button"
                    onClick={() => { setAttachmentUrl(null); setAttachmentName(null) }}
                    style={{ background: 'none', border: 'none', color: 'var(--ink3)', cursor: 'pointer', fontSize: '12px' }}
                    title="Remove attachment"
                  >
                    ✕
                  </button>
                </div>
              )}
            </div>
            {uploadError && <span style={{ color: 'var(--red)', fontSize: '11px' }}>{uploadError}</span>}
          </Field>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '22px' }}>
          <span style={{ fontSize: '11px', color: 'var(--ink4)' }}>⌘/Ctrl + Enter to save · Esc to cancel</span>
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button variant="teal" disabled={!canSave} onClick={save}>
              {task ? 'Save Changes' : 'Create Task'}
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
