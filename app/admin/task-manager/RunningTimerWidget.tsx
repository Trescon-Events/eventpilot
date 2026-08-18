'use client'
import { useEffect, useState } from 'react'
import { ActiveTimer, formatClock } from './types'

/**
 * Always-visible "you're currently tracking time" indicator — fixes a real
 * gap vs. the original TaskSphere, which had a persistent header timer
 * widget. Without this, starting a timer on a task and then filtering it
 * out of view (or navigating to Kanban/Timesheets/Admin Console) left no
 * indication anywhere that a timer was still running.
 *
 * `active` is owned by the parent page (fetched from
 * GET /api/task-manager/timer/active, the server-side source of truth) and
 * passed in — kept as one fetch per page, not duplicated here.
 */
export default function RunningTimerWidget({ active, onStopped }: { active: ActiveTimer; onStopped: () => void }) {
  const [elapsed, setElapsed] = useState(0)
  const [stopping, setStopping] = useState(false)

  useEffect(() => {
    if (!active) return
    function tick() {
      setElapsed(Math.floor((Date.now() - new Date(active!.start_time).getTime()) / 1000))
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [active])

  if (!active) return null
  const taskId = active.task_id // narrowed local — TS loses the `active` null-check inside the nested `stop` closure otherwise

  async function stop() {
    setStopping(true)
    const res = await fetch(`/api/task-manager/${taskId}/timer`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'stop' }),
    })
    setStopping(false)
    if (res.ok) onStopped()
  }

  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: '12px', background: 'var(--teal-light)',
        border: '1px solid var(--teal-border)', borderRadius: '10px', padding: '8px 14px', marginBottom: '16px',
      }}
    >
      <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--teal-mid)', flexShrink: 0, animation: 'tm-pulse 1.6s ease-in-out infinite' }} />
      <span style={{ fontSize: '13px', color: 'var(--teal)', fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        Tracking <strong>{active.task_description}</strong>
      </span>
      <span style={{ fontSize: '14px', fontFamily: 'ui-monospace, monospace', fontWeight: 800, color: 'var(--teal)', flexShrink: 0 }}>
        {formatClock(elapsed)}
      </span>
      <button
        type="button"
        onClick={stop}
        disabled={stopping}
        style={{
          fontSize: '12px', fontWeight: 700, padding: '4px 12px', borderRadius: '6px', border: 'none', cursor: 'pointer',
          background: 'var(--danger)', color: 'var(--surface)', flexShrink: 0, opacity: stopping ? 0.6 : 1,
        }}
      >
        ■ Stop
      </button>
      <style>{`@keyframes tm-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }`}</style>
    </div>
  )
}
