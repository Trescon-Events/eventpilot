import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'
import { loadLicenseCandidates } from '@/app/lib/ops/license-readiness'
import { loadBatches } from '@/app/lib/ops/batches'
import { expireDueBatches } from '@/app/lib/ops/batch-lifecycle'

/* GET /api/events/operations/licenses?event_id=X
   Everything the Speaker Licences page needs in one round trip:
   ready speakers, speakers already in a batch, how many aren't ready yet,
   this event's assigned licence vendors, and the batches. Gated by
   ops.licenses.view. */
export async function GET(req: NextRequest) {
  const eventId = req.nextUrl.searchParams.get('event_id')
  if (!eventId) return NextResponse.json({ error: 'event_id required' }, { status: 400 })

  const session = getSession(req)
  if (!session?.adm && !(await hasEventPermission(session?.sid, eventId, 'ops.licenses.view'))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  try {
    await expireDueBatches({ eventId })
    const [candidates, batches, { data: assigned }] = await Promise.all([
      loadLicenseCandidates(eventId),
      loadBatches(eventId),
      supabaseAdmin
        .from('ops_event_vendors')
        .select('ops_vendors(id, name, active)')
        .eq('event_id', eventId)
        .eq('purpose', 'speaker_license'),
    ])
    const vendors = (assigned ?? [])
      .map(a => Array.isArray(a.ops_vendors) ? a.ops_vendors[0] : a.ops_vendors)
      .filter((v): v is { id: string; name: string; active: boolean } => !!v && v.active)
      .sort((a, b) => a.name.localeCompare(b.name))
    return NextResponse.json({ ...candidates, batches, vendors })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed to load licences' }, { status: 500 })
  }
}
