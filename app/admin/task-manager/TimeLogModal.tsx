'use client'
import { useEffect, useState } from 'react'
import Button from '@/app/components/ui/Button'
import { Input, Select, Textarea } from '@/app/components/ui/Field'
import { CATEGORIES, LogCategory, Task } from './types'
import { CUSTOM_SCROLLBAR_STYLE, SearchableSelect } from './ui'

interface Props {
  tasks: Task[]
  defaultTaskId?: string
  onClose: () => void
  /** start_time/end_time are full ISO instants (converted from the typed local time using this browser's own timezone), not "HH:MM" strings. */
  onSave: (values: { task_id: string; category: LogCategory | ''; description: string; log_date: string; start_time: string; end_time: string }) => void
}

const todayISO = () => new Date().toISOString().slice(0, 10)

export default function TimeLogModal({ tasks, defaultTaskId, onClose, onSave }: Props) {
  const [taskId, setTaskId] = useState(defaultTaskId ?? '')
  const [category, setCategory] = useState<LogCategory | ''>('')
  const [description, setDescription] = useState('')
  const [logDate, setLogDate] = useState(todayISO())
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [error, setError] = useState<string | null>(null)

  const canSave = !!taskId && !!logDate && !!startTime && !!endTime

  function save() {
    if (!canSave) return
    if (startTime === endTime) { setError('Start and end time cannot be the same.'); return }

    // Converted using THIS browser's own local timezone — correct for
    // whichever office the person logging time is in (Dubai, Bangalore,
    // ...), rather than guessing a server-side timezone. `end < start`
    // means the session crossed midnight (e.g. 23:00–00:30), so roll the
    // end instant to the next day.
    const startInstant = new Date(`${logDate}T${startTime}:00`)
    let endInstant = new Date(`${logDate}T${endTime}:00`)
    if (endInstant <= startInstant) endInstant = new Date(endInstant.getTime() + 24 * 60 * 60 * 1000)

    onSave({
      task_id: taskId,
      category,
      description: description.trim(),
      log_date: logDate,
      start_time: startInstant.toISOString(),
      end_time: endInstant.toISOString(),
    })
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) save()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
    // No deps array — intentionally re-bound every render so `save` sees latest field state.
  })

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--overlay-scrim)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }} onClick={onClose}>
      <div
        className="tm-scroll"
        style={{ background: 'var(--card)', borderRadius: '14px', padding: '28px', width: '480px', maxWidth: '90vw', maxHeight: '85vh', overflowY: 'auto', boxShadow: 'var(--shadow-md)', ...CUSTOM_SCROLLBAR_STYLE }}
        onClick={e => e.stopPropagation()}
      >
        <h2 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--ink)', margin: '0 0 6px' }}>Log time</h2>
        <p style={{ fontSize: '12px', color: 'var(--ink4)', margin: '0 0 18px' }}>For time you tracked but forgot to start the timer for.</p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <Field label="Task *">
            <SearchableSelect
              options={tasks.map(t => ({ id: t.id, label: t.description, sublabel: t.event?.name }))}
              value={taskId}
              onChange={setTaskId}
              placeholder="Search tasks…"
            />
          </Field>

          <div style={{ display: 'flex', gap: '12px' }}>
            <Field label="Date *">
              <Input type="date" value={logDate} onChange={e => setLogDate(e.target.value)} />
            </Field>
            <Field label="Category">
              <Select value={category} onChange={e => setCategory(e.target.value as LogCategory | '')}>
                <option value="">—</option>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </Select>
            </Field>
          </div>

          <div style={{ display: 'flex', gap: '12px' }}>
            <Field label="Start time *">
              <Input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} />
            </Field>
            <Field label="End time *">
              <Input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} />
            </Field>
          </div>

          <Field label="What did you work on?">
            <Textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} placeholder="Optional note about this session" />
          </Field>

          {error && <div style={{ fontSize: '12px', color: 'var(--red)' }}>{error}</div>}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '22px' }}>
          <span style={{ fontSize: '11px', color: 'var(--ink4)' }}>⌘/Ctrl + Enter to save · Esc to cancel</span>
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button variant="teal" disabled={!canSave} onClick={save}>Log Time</Button>
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
