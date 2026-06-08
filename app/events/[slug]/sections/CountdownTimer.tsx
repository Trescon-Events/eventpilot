'use client'

import { useState, useEffect } from 'react'

function pad(n: number) { return String(n).padStart(2, '0') }

function getTimeLeft(target: string) {
  const diff = new Date(target).getTime() - Date.now()
  if (diff <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0, over: true }
  const days    = Math.floor(diff / 86400000)
  const hours   = Math.floor((diff % 86400000) / 3600000)
  const minutes = Math.floor((diff % 3600000) / 60000)
  const seconds = Math.floor((diff % 60000) / 1000)
  return { days, hours, minutes, seconds, over: false }
}

export default function CountdownTimer({
  targetDate, layout = 'boxed', accent, teal,
}: {
  targetDate: string   // ISO date string
  layout?: string
  accent: string
  teal: string
}) {
  const [t, setT] = useState(getTimeLeft(targetDate))

  useEffect(() => {
    const id = setInterval(() => setT(getTimeLeft(targetDate)), 1000)
    return () => clearInterval(id)
  }, [targetDate])

  if (t.over) return (
    <div style={{ textAlign: 'center', fontSize: '20px', fontWeight: 800, color: accent }}>
      The event has started!
    </div>
  )

  const units = [
    { label: 'Days',    value: t.days    },
    { label: 'Hours',   value: t.hours   },
    { label: 'Minutes', value: t.minutes },
    { label: 'Seconds', value: t.seconds },
  ]

  if (layout === 'minimal') return (
    <div style={{ display: 'flex', gap: '32px', justifyContent: 'center', alignItems: 'baseline', flexWrap: 'wrap' }}>
      {units.map(u => (
        <div key={u.label} style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 'clamp(40px,6vw,80px)', fontWeight: 900, letterSpacing: '-0.04em', color: 'rgba(240,237,232,1)', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
            {pad(u.value)}
          </div>
          <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'rgba(240,237,232,0.4)', marginTop: '8px' }}>
            {u.label}
          </div>
        </div>
      ))}
    </div>
  )

  // boxed layout
  return (
    <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', flexWrap: 'wrap' }}>
      {units.map((u, i) => (
        <div key={u.label}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${accent}22`, borderRadius: '16px', padding: '24px 32px', textAlign: 'center', minWidth: '110px' }}>
              <div style={{ fontSize: 'clamp(36px,5vw,64px)', fontWeight: 900, letterSpacing: '-0.04em', color: accent, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                {pad(u.value)}
              </div>
              <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'rgba(240,237,232,0.4)', marginTop: '8px' }}>
                {u.label}
              </div>
            </div>
            {i < units.length - 1 && (
              <div style={{ fontSize: '32px', fontWeight: 900, color: 'rgba(240,237,232,0.2)', lineHeight: 1, marginBottom: '20px' }}>:</div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
