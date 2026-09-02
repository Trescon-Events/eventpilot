'use client'
import { useEffect, useRef, useState } from 'react'

/*
  Desktop notification when a task is newly assigned to the current staff
  member — polling, not Supabase Realtime. This app authenticates via its
  own tcs_session cookie (see app/lib/access/session.ts), not Supabase
  Auth, so there's no auth.uid() for RLS to filter a Realtime subscription
  by; bridging a custom JWT into supabase.realtime.setAuth() just to avoid
  a ~20s poll isn't worth the extra infrastructure and the risk of an
  unscoped subscription leaking other people's tasks to any anon-key
  holder. GET /api/task-manager/notifications reuses the same
  session-cookie auth every other route here already trusts.

  Mounted once in app/admin/task-manager/layout.tsx, so it keeps polling
  across every page in the module (Task Manager itself, the Admin
  Console, Vendor Contacts, Task Types) — not just the main board.
*/

const POLL_MS = 22_000
const SINCE_KEY = 'tm_notif_since'
const BANNER_DISMISSED_KEY = 'tm_notif_banner_dismissed'

type NotifTask = { id: string; description: string; event_name: string | null }

function playChime() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    const now = ctx.currentTime
    ;[880, 1318.51].forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      const start = now + i * 0.11
      gain.gain.setValueAtTime(0, start)
      gain.gain.linearRampToValueAtTime(0.18, start + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.32)
      osc.connect(gain).connect(ctx.destination)
      osc.start(start)
      osc.stop(start + 0.34)
    })
    setTimeout(() => ctx.close().catch(() => {}), 800)
  } catch { /* Web Audio unsupported/blocked — silent notification is still fine */ }
}

function notifyNewTask(task: NotifTask) {
  const n = new Notification('New task assigned to you', {
    body: task.event_name ? `[${task.event_name}] ${task.description}` : task.description,
    tag: `task-${task.id}`,
  })
  n.onclick = () => {
    window.focus()
    window.location.href = `/admin/task-manager?openTask=${task.id}`
  }
  playChime()
}

export default function NotificationManager() {
  const [showBanner, setShowBanner] = useState(false)
  const sinceRef = useRef<string | null>(null)

  useEffect(() => {
    if (typeof Notification === 'undefined') return

    if (!sinceRef.current) {
      const stored = localStorage.getItem(SINCE_KEY)
      // First-ever visit: start from "now", not some far-past default —
      // don't replay a backlog of everything ever assigned.
      sinceRef.current = stored ?? new Date().toISOString()
      if (!stored) localStorage.setItem(SINCE_KEY, sinceRef.current)
    }

    // Deferred rather than a direct setState call here — this effect body
    // otherwise has no async work, which is exactly what
    // react-hooks/set-state-in-effect flags ("you might not need an
    // effect"); it's still needed here purely to keep SSR/hydration safe
    // (Notification/localStorage don't exist server-side).
    queueMicrotask(() => {
      setShowBanner(Notification.permission === 'default' && localStorage.getItem(BANNER_DISMISSED_KEY) !== '1')
    })

    async function poll() {
      try {
        const res = await fetch(`/api/task-manager/notifications?since=${encodeURIComponent(sinceRef.current!)}`)
        if (!res.ok) return
        const data = await res.json() as { tasks: NotifTask[]; polled_at: string }
        if (Notification.permission === 'granted') {
          for (const task of data.tasks) notifyNewTask(task)
        }
        sinceRef.current = data.polled_at
        localStorage.setItem(SINCE_KEY, data.polled_at)
      } catch { /* network hiccup — next interval retries */ }
    }

    poll()
    const interval = setInterval(poll, POLL_MS)
    return () => clearInterval(interval)
  }, [])

  async function handleEnable() {
    const permission = await Notification.requestPermission()
    setShowBanner(permission === 'default')
  }

  function handleDismiss() {
    localStorage.setItem(BANNER_DISMISSED_KEY, '1')
    setShowBanner(false)
  }

  if (!showBanner) return null

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '28px',
        right: '28px',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        gap: '14px',
        padding: '14px 18px',
        background: 'var(--card)',
        border: '1px solid var(--teal)',
        borderRadius: '12px',
        boxShadow: 'var(--shadow-md)',
        maxWidth: '360px',
      }}
    >
      <span style={{ fontSize: '20px' }}>🔔</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--ink)' }}>Enable desktop alerts</div>
        <div style={{ fontSize: '12px', color: 'var(--ink3)', marginTop: '2px' }}>
          Get notified the moment a task is assigned to you.
        </div>
      </div>
      <button
        type="button"
        onClick={handleEnable}
        style={{ fontSize: '12px', fontWeight: 700, color: 'var(--surface)', background: 'var(--teal-mid)', border: 'none', borderRadius: '8px', padding: '8px 14px', cursor: 'pointer', flexShrink: 0 }}
      >
        Enable
      </button>
      <button
        type="button"
        onClick={handleDismiss}
        title="Dismiss"
        style={{ background: 'none', border: 'none', color: 'var(--ink4)', fontSize: '14px', cursor: 'pointer', padding: '2px', flexShrink: 0 }}
      >
        ✕
      </button>
    </div>
  )
}
