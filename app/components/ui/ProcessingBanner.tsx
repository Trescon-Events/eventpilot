'use client'

import { useEffect, useState } from 'react'

/* In-page "something is happening" panel for work that keeps running after the click (reading an uploaded document, generating, syncing).
   Deliberately loud: a spinning ring, a large title, an animated bar that never stops moving, and a running clock, so nobody has to look
   closely to know it is working. Unlike ProcessingOverlay it does not block the page: the caller places it where the result will appear.
   The bar is indeterminate on purpose; only a real progress value would justify a percentage. */
export default function ProcessingBanner({ title, detail, startedAt }: { title: string; detail?: string; startedAt?: string | number | null }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])
  const start = startedAt ? new Date(startedAt).getTime() : null
  const secs = start && Number.isFinite(start) ? Math.max(0, Math.floor((now - start) / 1000)) : null
  const clock = secs === null ? null : `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`

  return (
    <div role="status" aria-live="polite" aria-busy="true"
      style={{ position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'center', gap: '20px', padding: '26px 28px', borderRadius: '16px', border: '1.5px solid var(--teal-mid)', background: 'color-mix(in srgb, var(--teal-mid) 10%, var(--card))' }}>
      <style>{`
        @keyframes pb-spin { to { transform: rotate(360deg) } }
        @keyframes pb-slide { 0% { left: -40% } 100% { left: 100% } }
        @keyframes pb-pulse { 0%, 100% { opacity: 1 } 50% { opacity: .55 } }
      `}</style>
      <div aria-hidden="true" style={{ width: '56px', height: '56px', flexShrink: 0, borderRadius: '50%', border: '5px solid color-mix(in srgb, var(--teal-mid) 22%, transparent)', borderTopColor: 'var(--teal-mid)', animation: 'pb-spin .9s linear infinite' }} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px', flexWrap: 'wrap' }}>
          <div style={{ fontSize: '19px', fontWeight: 800, letterSpacing: '-0.2px', color: 'var(--ink)', animation: 'pb-pulse 1.8s ease-in-out infinite' }}>{title}</div>
          {clock && <div style={{ fontSize: '13px', fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: 'var(--teal-mid)' }}>{clock}</div>}
        </div>
        {detail && <div style={{ fontSize: '13.5px', color: 'var(--ink2)', lineHeight: 1.6, marginTop: '4px' }}>{detail}</div>}
      </div>
      <div aria-hidden="true" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '5px', background: 'color-mix(in srgb, var(--teal-mid) 18%, transparent)' }}>
        <div style={{ position: 'absolute', top: 0, bottom: 0, width: '40%', borderRadius: '3px', background: 'var(--teal-mid)', animation: 'pb-slide 1.3s ease-in-out infinite' }} />
      </div>
    </div>
  )
}
