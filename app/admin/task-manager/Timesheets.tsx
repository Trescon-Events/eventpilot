'use client'
import { useState } from 'react'
import { Avatar, PillSelect } from './ui'
import { CATEGORIES, CATEGORY_COLOR, LogCategory, TimeLog, formatDuration } from './types'

interface Props {
  logs: TimeLog[]
  onEdit: (logId: string, updates: { category?: LogCategory | ''; description?: string }) => void
  onDelete: (logId: string) => void
}

export default function Timesheets({ logs, onEdit, onDelete }: Props) {
  if (logs.length === 0) {
    return (
      <div style={{ padding: '48px', textAlign: 'center', color: 'var(--ink4)', fontSize: '13px' }}>
        No time logged yet. Start a timer on a task, or use &ldquo;Log Time&rdquo; to add a past session.
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {logs.map(log => <LogRow key={log.id} log={log} onEdit={onEdit} onDelete={onDelete} />)}
    </div>
  )
}

function LogRow({ log, onEdit, onDelete }: { log: TimeLog; onEdit: Props['onEdit']; onDelete: Props['onDelete'] }) {
  const [editingDesc, setEditingDesc] = useState(false)
  const [descDraft, setDescDraft] = useState(log.description ?? '')

  function saveDesc() {
    setEditingDesc(false)
    if (descDraft.trim() !== (log.description ?? '')) onEdit(log.id, { description: descDraft.trim() })
  }

  const start = new Date(log.start_time)
  const end = log.end_time ? new Date(log.end_time) : null
  const timeRange = end
    ? `${start.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} – ${end.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`
    : 'In progress'

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px', padding: '12px 14px', background: 'var(--card)', border: '1px solid var(--border-light)', borderRadius: '10px' }}>
      <div style={{ width: '72px', flexShrink: 0, fontSize: '12px', color: 'var(--ink3)', paddingTop: '2px' }}>
        {new Date(log.log_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink)' }}>{log.task?.description ?? 'Untitled task'}</span>
          {log.manual_entry && (
            <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--ink4)', background: 'var(--border-light)', padding: '1px 6px', borderRadius: '5px' }}>MANUAL</span>
          )}
        </div>

        {editingDesc ? (
          <input
            autoFocus
            value={descDraft}
            onChange={e => setDescDraft(e.target.value)}
            onBlur={saveDesc}
            onKeyDown={e => { if (e.key === 'Enter') saveDesc(); if (e.key === 'Escape') { setDescDraft(log.description ?? ''); setEditingDesc(false) } }}
            placeholder="What did you work on?"
            style={{ width: '100%', boxSizing: 'border-box', background: 'var(--border-light)', border: '1px solid var(--border)', borderRadius: '6px', padding: '4px 8px', fontSize: '12px', color: 'var(--ink)', outline: 'none' }}
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditingDesc(true)}
            style={{ background: 'none', border: 'none', padding: 0, textAlign: 'left', cursor: 'pointer', fontSize: '12px', color: log.description ? 'var(--ink3)' : 'var(--ink4)', fontStyle: log.description ? 'normal' : 'italic' }}
          >
            {log.description || 'Add a note…'}
          </button>
        )}
      </div>

      <div onClick={e => e.stopPropagation()} style={{ flexShrink: 0 }}>
        <PillSelect
          pillColor={log.category ? CATEGORY_COLOR[log.category] : 'grey'}
          value={log.category ?? ''}
          onChange={e => onEdit(log.id, { category: e.target.value as LogCategory | '' })}
        >
          <option value="">No category</option>
          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </PillSelect>
      </div>

      {log.staff && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0, width: '120px' }}>
          <Avatar name={log.staff.name} size={20} />
          <span style={{ fontSize: '12px', color: 'var(--ink3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{log.staff.name}</span>
        </div>
      )}

      <div style={{ flexShrink: 0, width: '120px', fontSize: '12px', color: 'var(--ink3)' }}>{timeRange}</div>
      <div style={{ flexShrink: 0, width: '56px', textAlign: 'right', fontSize: '12px', fontWeight: 700, color: 'var(--ink)' }}>
        {formatDuration(log.duration_seconds ?? 0)}
      </div>

      <button type="button" onClick={() => onDelete(log.id)} title="Delete entry" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink4)', fontSize: '13px', flexShrink: 0 }}>
        ✕
      </button>
    </div>
  )
}
