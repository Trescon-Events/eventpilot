'use client'
import { useRef, useState } from 'react'
import Button from '@/app/components/ui/Button'
import { EventLite, PRIORITIES, PRIORITY_COLOR, StaffLite, TaskPriority, TaskSaveValues } from './types'
import { Avatar, PillSelect } from './ui'

interface Props {
  staff: StaffLite[]
  events: EventLite[]
  currentStaffId: string | null
  onAssign: (values: TaskSaveValues) => Promise<void>
}

export default function QuickAssignCard({ staff, events, currentStaffId, onAssign }: Props) {
  const [description, setDescription] = useState('')
  const [assignedTo, setAssignedTo] = useState('')
  const [eventId, setEventId] = useState('')
  const [deadline, setDeadline] = useState('')
  const [priority, setPriority] = useState<TaskPriority>('Medium')
  const [remarks, setRemarks] = useState('')
  const [attachmentUrl, setAttachmentUrl] = useState<string | null>(null)
  const [attachmentName, setAttachmentName] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const canSubmit = description.trim().length > 0 && assignedTo.length > 0 && !busy && !uploading

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setError(null)
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
      setError(err instanceof Error ? err.message : 'File upload failed')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

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
        attachment_url: attachmentUrl || null,
        attachment_name: attachmentName || null,
      })
      setDescription('')
      setRemarks('')
      setDeadline('')
      setAttachmentUrl(null)
      setAttachmentName(null)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to assign task')
    } finally {
      setBusy(false)
    }
  }

  const selectedStaffMember = staff.find(s => s.id === assignedTo)

  return (
    <div
      style={{
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: '12px',
        padding: '16px 20px',
        marginBottom: '18px',
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
              padding: '10px 14px',
              fontSize: '13px',
              fontWeight: 500,
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              color: 'var(--ink)',
              outline: 'none',
            }}
          />
        </div>

        {/* Row 2: Assignee, Event, Deadline, Priority & Action */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          {/* Assignee Dropdown */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '4px 8px' }}>
            {selectedStaffMember ? (
              <Avatar name={selectedStaffMember.name} size={20} />
            ) : (
              <span style={{ fontSize: '12px', color: 'var(--ink4)' }}>👤</span>
            )}
            <select
              value={assignedTo}
              onChange={e => setAssignedTo(e.target.value)}
              disabled={busy}
              style={{
                background: 'transparent',
                border: 'none',
                color: assignedTo ? 'var(--ink)' : 'var(--ink4)',
                fontSize: '12px',
                fontWeight: 600,
                outline: 'none',
                cursor: 'pointer',
                minWidth: '130px',
              }}
            >
              <option value="" disabled style={{ color: 'var(--ink4)', background: 'var(--surface)' }}>Select Assignee…</option>
              {staff.map(s => (
                <option key={s.id} value={s.id} style={{ color: 'var(--ink)', background: 'var(--surface)' }}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          {/* Event Dropdown */}
          <select
            value={eventId}
            onChange={e => setEventId(e.target.value)}
            disabled={busy}
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              padding: '7px 10px',
              color: eventId ? 'var(--ink)' : 'var(--ink4)',
              fontSize: '12px',
              fontWeight: 600,
              outline: 'none',
              cursor: 'pointer',
              minWidth: '140px',
            }}
          >
            <option value="" style={{ color: 'var(--ink4)', background: 'var(--surface)' }}>General (No Event)</option>
            {events.map(ev => (
              <option key={ev.id} value={ev.id} style={{ color: 'var(--ink)', background: 'var(--surface)' }}>
                {ev.name}
              </option>
            ))}
          </select>

          {/* Deadline Picker */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '4px 8px' }}>
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
                outline: 'none',
                cursor: 'pointer',
              }}
            />
          </div>

          {/* Priority Pill */}
          <PillSelect
            pillColor={PRIORITY_COLOR[priority]}
            value={priority}
            onChange={e => setPriority(!busy ? e.target.value as TaskPriority : priority)}
          >
            {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
          </PillSelect>

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
              padding: '7px 10px',
              fontSize: '12px',
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              color: 'var(--ink)',
              outline: 'none',
            }}
          />

          {/* Hidden File Input */}
          <input
            ref={fileInputRef}
            type="file"
            onChange={handleFileUpload}
            style={{ display: 'none' }}
          />

          {/* Attach File Button */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={busy || uploading}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              padding: '6px 10px',
              background: attachmentUrl ? 'var(--teal-light)' : 'var(--surface)',
              border: `1px solid ${attachmentUrl ? 'var(--teal)' : 'var(--border)'}`,
              borderRadius: '8px',
              color: attachmentUrl ? 'var(--teal)' : 'var(--ink3)',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              transition: 'all 0.15s ease',
            }}
          >
            <span>📎</span>
            {uploading ? 'Uploading…' : attachmentUrl ? 'File Attached' : 'Attach File'}
          </button>

          {/* Assign Button */}
          <Button
            variant="teal"
            onClick={handleSubmit}
            disabled={!canSubmit}
          >
            {busy ? 'Assigning…' : 'Assign Task ➔'}
          </Button>
        </div>

        {/* Attachment preview / remove chip */}
        {attachmentUrl && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 10px', background: 'var(--surface)', border: '1px solid var(--teal)', borderRadius: '6px', width: 'fit-content' }}>
            <span style={{ fontSize: '11px', color: 'var(--teal)', fontWeight: 600 }}>
              📎 {attachmentName || 'Attached Document'}
            </span>
            <a
              href={attachmentUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontSize: '10px', color: 'var(--teal-mid)', textDecoration: 'underline' }}
            >
              View
            </a>
            <button
              type="button"
              onClick={() => { setAttachmentUrl(null); setAttachmentName(null) }}
              style={{ background: 'none', border: 'none', color: 'var(--ink4)', cursor: 'pointer', fontSize: '11px', padding: '0 2px' }}
              title="Remove attachment"
            >
              ✕
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
