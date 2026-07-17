'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import * as scanManager from '@/app/lib/scanManager'

function ScanBanner() {
  const pathname   = usePathname()
  const [show,     setShow]    = useState(false)
  const [running,  setRunning] = useState(false)
  const [done,     setDone]    = useState(0)
  const [total,    setTotal]   = useState(0)
  const [eventId,  setEventId] = useState<string | null>(null)

  // Don't show banner on the market-intel page itself
  const onMarketIntel = pathname?.includes('/market-intel')

  useEffect(() => {
    function update(s: scanManager.ManagerState) {
      const allUrlJobs = s.activeJobs.flatMap(j => j.urlJobs)
      const hasJobs    = s.activeJobs.length > 0
      const isRunning  = s.activeJobs.some(j => j.status === 'running')
      const done       = allUrlJobs.filter(u => u.status === 'done' || u.status === 'failed').length
      const total      = allUrlJobs.length
      const firstJob   = s.activeJobs[0]
      setRunning(isRunning)
      setDone(done)
      setTotal(total)
      setEventId(firstJob?.eventId ?? null)
      setShow(hasJobs && !onMarketIntel)
    }

    const current = scanManager.getState()
    update(current)

    return scanManager.subscribe(update)
  }, [onMarketIntel])

  if (!show || onMarketIntel) return null

  const pct = total > 0 ? Math.round((done / total) * 100) : 0

  return (
    <div style={{
      position:   'fixed', bottom: '24px', right: '24px', zIndex: 9999,
      background: 'var(--card-hi)', color: 'var(--ink)', borderRadius: '14px',
      padding:    '14px 18px', boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
      minWidth:   '280px', maxWidth: '340px', border: '1px solid rgba(129,140,248,0.4)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
        <div style={{
          width: '8px', height: '8px', borderRadius: '50%',
          background: running ? 'var(--indigo)' : 'var(--success)', flexShrink: 0,
          boxShadow: running ? '0 0 0 3px rgba(129,140,248,0.3)' : 'none',
        }} />
        <div style={{ flex: 1, fontSize: '13px', fontWeight: 800, color: 'var(--ink)' }}>
          {running ? 'Market Intelligence Scan Running' : 'Market Intel Scan Complete'}
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ height: '4px', background: 'rgba(255,255,255,0.12)', borderRadius: '2px', marginBottom: '8px', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: running ? 'var(--indigo)' : 'var(--success)', borderRadius: '2px', transition: 'width 0.4s ease' }} />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', fontWeight: 600 }}>
          {done}/{total} URLs · {pct}%
        </div>
        {eventId && (
          <Link href={`/admin/events/${eventId}/market-intel`}
            style={{ fontSize: '11px', fontWeight: 800, color: 'var(--indigo)', textDecoration: 'none', padding: '3px 8px', background: 'rgba(129,140,248,0.15)', borderRadius: '6px' }}>
            View progress →
          </Link>
        )}
      </div>
    </div>
  )
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <ScanBanner />
    </>
  )
}
