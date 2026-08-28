'use client'

import { useEffect, useRef } from 'react'

/* Shared success/error toast (2026-08-29, per Madhu — a real, widespread
   problem: pages across the app reused one plain "error banner" style for
   EVERY message, including success confirmations, so a save succeeding
   read as if it had failed (red background, no distinction at all). This
   is the standard replacement going forward — a small corner bubble,
   auto-dismisses after 5s, has its own × to close early, and actually
   looks different for success (teal) vs error (red).

   Positioned top-right (2026-08-29, moved off bottom-center same day —
   Madhu caught it live overlapping a page's own action buttons, asked
   what professional apps typically do). Matches the common admin-tool
   convention (GitHub, Linear, Stripe, Vercel) rather than Material
   Design's classic bottom-center snackbar, specifically because this
   app's pages routinely have real content/buttons anchored at the
   bottom — a corner toast never competes with them. Pauses its own
   dismiss timer on hover, same as Gmail/Slack, so reading a longer
   message doesn't get cut off mid-read; resumes a fresh full-length
   timer on mouse-leave rather than continuing a partially-elapsed one,
   simpler to reason about than tracking remaining time across pauses.

   Deliberately a dumb, controlled component — the caller still owns its
   own `msg`/`msgType` state and passes it straight through, same shape as
   the old inline banner these pages already had, so swapping one banner
   for this is a small diff per page, not a rewrite. There is no global
   toast queue/context here on purpose: nothing in this app fires two
   independent notifications from unrelated parts of the same page at
   once today, so a per-page single-slot toast is the simplest thing that
   actually matches how it's used — add a real queue if that ever stops
   being true. */

export type ToastType = 'success' | 'error'

type Props = {
  message: string | null
  type?: ToastType
  onClose: () => void
  durationMs?: number
}

export default function Toast({ message, type = 'success', onClose, durationMs = 5000 }: Props) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function armTimer() {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(onClose, durationMs)
  }

  useEffect(() => {
    if (!message) return
    armTimer()
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-arms on message/durationMs/onClose change only; armTimer itself is stable in shape (reads only refs + the same closure vars already in this effect's own deps)
  }, [message, durationMs, onClose])

  if (!message) return null

  const isError = type === 'error'
  return (
    <div
      onMouseEnter={() => { if (timerRef.current) clearTimeout(timerRef.current) }}
      onMouseLeave={armTimer}
      style={{ position: 'fixed', top: '20px', right: '20px', zIndex: 400, animation: 'eventpilot-toast-in 0.2s ease-out' }}
    >
      <div style={{
        display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 16px', borderRadius: '10px',
        background: isError ? 'var(--red-light)' : 'var(--teal-light)',
        border: `1px solid ${isError ? 'var(--red-border)' : 'var(--teal-mid)'}`,
        color: isError ? 'var(--red)' : 'var(--teal-mid)',
        boxShadow: 'var(--shadow-md)', fontSize: '13px', fontWeight: 700,
        minWidth: '240px', maxWidth: '440px',
      }}>
        <span aria-hidden="true" style={{ fontSize: '15px', flexShrink: 0 }}>{isError ? '⚠' : '✓'}</span>
        <span style={{ flex: 1 }}>{message}</span>
        <button onClick={onClose} aria-label="Dismiss"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: '15px', fontWeight: 800, lineHeight: 1, padding: '2px', flexShrink: 0 }}>
          ×
        </button>
      </div>
      <style>{'@keyframes eventpilot-toast-in { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }'}</style>
    </div>
  )
}
