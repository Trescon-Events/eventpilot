import { NextRequest, NextResponse } from 'next/server'
import { requireScreens } from '@/app/lib/screens/service'
import { isUuid } from '@/app/lib/screens/tables-service'
import { getLive, runCommand, type LiveCommand } from '@/app/lib/screens/table-live'

/* Table Screens, live control (producers) — GET ?event_id = what each table shows now + the laptop program's status; POST { event_id, action, … } = send to the tables / standby / blank / identify. */
const NO_STORE = { 'Cache-Control': 'no-store' }
const fail = (e: unknown) => NextResponse.json({ error: e instanceof Error ? e.message : 'Failed.' }, { status: 500 })

export async function GET(req: NextRequest) {
  const eventId = req.nextUrl.searchParams.get('event_id')
  if (!isUuid(eventId)) return NextResponse.json({ error: 'event_id required' }, { status: 400 })
  const a = await requireScreens(req, eventId, 'view'); if ('error' in a) return a.error
  try { return NextResponse.json(await getLive(eventId), { headers: NO_STORE }) } catch (e) { return fail(e) }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as ({ event_id?: string } & Record<string, unknown>) | null
  if (!body || !isUuid(body.event_id ?? null)) return NextResponse.json({ error: 'event_id required' }, { status: 400 })
  const a = await requireScreens(req, body.event_id!, 'edit'); if ('error' in a) return a.error
  try {
    const r = await runCommand(body.event_id!, body as unknown as LiveCommand)
    if ('error' in r) return NextResponse.json({ error: r.error }, { status: 400 })
    return NextResponse.json(r.view, { headers: NO_STORE })
  } catch (e) { return fail(e) }
}
