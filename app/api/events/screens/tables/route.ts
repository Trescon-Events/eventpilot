import { NextRequest, NextResponse } from 'next/server'
import { requireScreens } from '@/app/lib/screens/service'
import { activeTablesLink, isUuid, tablesPayload } from '@/app/lib/screens/tables-service'

/* Table Screens (producers) — GET ?event_id  → the Table Screen templates and every session with its speakers in seat order. See app/lib/screens/tables-service.ts. */
export async function GET(req: NextRequest) {
  const eventId = req.nextUrl.searchParams.get('event_id')
  if (!isUuid(eventId)) return NextResponse.json({ error: 'event_id required' }, { status: 400 })
  const a = await requireScreens(req, eventId, 'view'); if ('error' in a) return a.error
  const stage = req.nextUrl.searchParams.get('track_id')
  const link = await activeTablesLink(eventId)   // the producers see what the technician's link has (not) downloaded
  return NextResponse.json({ ...(await tablesPayload(eventId, isUuid(stage) ? stage : null, link?.id ?? null)), link_label: link?.label ?? null })
}
