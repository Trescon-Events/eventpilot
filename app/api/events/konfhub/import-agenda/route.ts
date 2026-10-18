import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'
import { importAgendaFromKonfhub } from '@/app/lib/agenda/konfhub-import'
import { KonfhubApiError } from '@/app/lib/konfhub-agenda'

export const maxDuration = 120

/* POST /api/events/konfhub/import-agenda   Body: { event_id, dry_run?: boolean }
   Imports the event's existing KonfHub sessions into the Agenda Builder, linked by their KonfHub session id (nothing is changed or recreated on
   KonfHub). dry_run returns the preview only. Re-running skips sessions that are already linked. Gated on sae.integrations.manage. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as { event_id?: string; dry_run?: boolean } | null
  if (!body?.event_id) return NextResponse.json({ error: 'event_id required' }, { status: 400 })
  const session = getSession(req)
  if (!session?.adm && !(await hasEventPermission(session?.sid, body.event_id, 'sae.integrations.manage'))) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  try {
    return NextResponse.json(await importAgendaFromKonfhub(body.event_id, { dryRun: body.dry_run !== false }))   // dry run unless dry_run is explicitly false
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Import failed' }, { status: e instanceof KonfhubApiError ? 502 : 400 })
  }
}
