import { NextRequest, NextResponse } from 'next/server'
import { linkByToken } from '@/app/lib/screens/service'
import { getLive, recordHeartbeat, runCommand, type LiveCommand } from '@/app/lib/screens/table-live'

/* Table Screens, live control — the technician's private link. GET = what every table should show now + the program's status (read by both the console and the laptop program).
   POST { kind: 'heartbeat', … } = the program reporting in; any other body is a console command (show / all / identify). See app/lib/screens/table-live.ts. */
const NO_STORE = { 'Cache-Control': 'no-store' }
const fail = (e: unknown) => NextResponse.json({ error: e instanceof Error ? e.message : 'Failed.' }, { status: 500 })

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const link = await linkByToken((await params).token, 'tables')
  if (!link) return NextResponse.json({ error: 'Not found.' }, { status: 404 })
  try { return NextResponse.json(await getLive(link.event_id), { headers: NO_STORE }) } catch (e) { return fail(e) }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const link = await linkByToken((await params).token, 'tables')
  if (!link) return NextResponse.json({ error: 'Not found.' }, { status: 404 })
  const body = await req.json().catch(() => null) as ({ kind?: string } & Record<string, unknown>) | null
  if (!body) return NextResponse.json({ error: 'Bad request.' }, { status: 400 })
  try {
    if (body.kind === 'heartbeat') { await recordHeartbeat(link.event_id, body); return NextResponse.json({ ok: true }, { headers: NO_STORE }) }
    const r = await runCommand(link.event_id, body as unknown as LiveCommand)
    if ('error' in r) return NextResponse.json({ error: r.error }, { status: 400 })
    return NextResponse.json(r.view, { headers: NO_STORE })
  } catch (e) { return fail(e) }
}
