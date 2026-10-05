import { NextRequest, NextResponse } from 'next/server'
import { requireAgendaAccess } from '@/app/lib/agenda/access'
import { pushAgendaToKonfhub } from '@/app/lib/agenda/konfhub-push'

/* POST /api/events/agenda-v2/konfhub-push
   Body: { event_id, dry_run?: boolean }
   Pushes the event's PUBLISHED agenda to KonfHub (see app/lib/agenda/konfhub-push.ts
   for the field mapping and safety rules). dry_run returns what WOULD happen
   without writing anything. Manual only. Requires sae.agenda.manage. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as { event_id?: string; dry_run?: boolean } | null
  if (!body?.event_id) return NextResponse.json({ error: 'event_id is required' }, { status: 400 })
  const denied = await requireAgendaAccess(req, body.event_id)
  if (denied) return denied
  try {
    return NextResponse.json(await pushAgendaToKonfhub(body.event_id, { dryRun: !!body.dry_run }))
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Push failed'
    const prerequisite = /isn’t configured|timezone/i.test(message)
    return NextResponse.json({ error: message }, { status: prerequisite ? 422 : 502 })
  }
}
