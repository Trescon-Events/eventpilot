'use client'

import { useEffect, useRef, useState } from 'react'

/* Shared blocking overlay for any async action with a perceptible lag
   (uploads, logo/photo processing, generation, etc.) — 2026-08-15, per
   Madhu: users had no way to tell "something real is happening in the
   backend" during e.g. a logo upload, so nothing stopped them clicking
   around mid-request. Full-screen, un-dismissable (no backdrop click, no
   Escape) for as long as `active` is true — the caller is the only thing
   that can turn it off, by flipping the same state it already uses to
   guard the request (e.g. `uploading`).

   The ring is a genuine estimate, not a fake indeterminate spinner —
   Madhu's follow-up: "the system has a fair idea how long a particular
   process might take... it can show an approximately calculated progress
   bar." Each call site passes `estimatedMs` (how long THIS kind of request
   usually takes, from real observed timings — see call sites for the
   numbers). The ring eases from 0 up to 94% over that duration so it never
   visually claims "done" before the real response lands, then — if the
   request is still running once the estimate elapses — loops back to 0 and
   sweeps again rather than sitting stalled at 94%, which is what actually
   answers "is this stuck?" Swap `label`/`sublabel` per call site; don't
   fork this component per feature. */

type Props = {
  active: boolean
  label?: string
  sublabel?: string
  estimatedMs?: number
}

const SIZE = 88
const STROKE = 6
const RADIUS = (SIZE - STROKE) / 2
const CIRCUMFERENCE = 2 * Math.PI * RADIUS
const TARGET_FRACTION = 0.94 // holds just short of a full ring — "almost there," never a false "done"

export default function ProcessingOverlay({ active, label = 'Processing…', sublabel, estimatedMs = 4000 }: Props) {
  const [progress, setProgress] = useState(0) // 0..TARGET_FRACTION
  const [lap, setLap] = useState(0) // increments each time the estimate elapses and we loop back
  const startRef = useRef<number>(0)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    // No need to reset progress/lap to 0 here when active flips false — the
    // overlay renders nothing while inactive, and the very first rAF tick
    // the next time it activates recomputes both from elapsed=0 anyway.
    if (!active) return
    startRef.current = performance.now()

    const tick = (now: number) => {
      const elapsed = now - startRef.current
      const currentLap = Math.floor(elapsed / estimatedMs)
      const t = Math.min((elapsed % estimatedMs) / estimatedMs, 1)
      const eased = 1 - Math.pow(1 - t, 3) // ease-out — quick start, settles near the target
      setProgress(eased * TARGET_FRACTION)
      setLap(currentLap)
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [active, estimatedMs])

  useEffect(() => {
    if (!active) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prevOverflow }
  }, [active])

  if (!active) return null

  const dashOffset = CIRCUMFERENCE * (1 - progress)
  const slow = lap > 0

  return (
    <div
      role="alert"
      aria-live="assertive"
      aria-busy="true"
      style={{
        position: 'fixed', inset: 0, zIndex: 300,
        background: 'color-mix(in srgb, var(--surface) 82%, transparent)',
        backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'progress',
      }}
    >
      <div style={{
        background: 'var(--card)', border: '1px solid var(--border-light)', borderRadius: '18px',
        padding: '38px 46px', display: 'flex', flexDirection: 'column', alignItems: 'center',
        boxShadow: 'var(--shadow-md)', minWidth: '280px', maxWidth: '360px', textAlign: 'center',
      }}>
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} style={{ transform: 'rotate(-90deg)' }} aria-hidden="true">
          <circle cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} fill="none" stroke="var(--border-light)" strokeWidth={STROKE} />
          <circle
            cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} fill="none"
            stroke={slow ? 'var(--amber)' : 'var(--teal-mid)'} strokeWidth={STROKE} strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE} strokeDashoffset={dashOffset}
            style={{ transition: 'stroke 0.4s ease' }}
          />
        </svg>
        <div style={{ fontSize: '15.5px', fontWeight: 800, color: 'var(--ink)', marginTop: '18px' }}>{label}</div>
        <div style={{ fontSize: '13px', color: slow ? 'var(--amber)' : 'var(--ink3)', marginTop: '5px', lineHeight: 1.5 }}>
          {slow ? "Still working — this one's taking a bit longer than usual, hang tight…" : (sublabel ?? 'This usually takes a few seconds.')}
        </div>
      </div>
    </div>
  )
}
