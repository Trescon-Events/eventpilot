'use client'

import { use, useCallback } from 'react'
import ShowcallSheet, { type SheetPayload } from '@/app/components/showcall/ShowcallSheet'
import { downloadShowcallXlsx } from '@/app/lib/showcall/xlsx'

/* Show Caller — the show caller's page (no login; the private link is the key). The whole screen is the sheet. */

export default function ShowcallPublic({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const load = useCallback(async (): Promise<SheetPayload> => {
    const r = await fetch(`/api/public/showcall/${token}`, { cache: 'no-store' })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(j.error ?? 'Could not load the sheet.')
    return j
  }, [token])
  const act = useCallback(async (body: Record<string, unknown>) => {
    const r = await fetch(`/api/public/showcall/${token}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const j = await r.json().catch(() => ({}))
    return r.ok ? null : (j.error ?? 'Could not save.') as string
  }, [token])
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--surface)' }}>
      <ShowcallSheet load={load} act={act} onExcel={(p, o) => downloadShowcallXlsx({ eventName: p.event_name, timezone: p.timezone, stages: p.stages, rows: p.rows, includeMc: o.mc })} />
    </div>
  )
}
