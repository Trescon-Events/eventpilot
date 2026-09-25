import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { loadLicenseCandidates } from '@/app/lib/ops/license-readiness'
import { loadBatches } from '@/app/lib/ops/batches'
import { expireDueBatches } from '@/app/lib/ops/batch-lifecycle'
import { resolveScope, scopeFromParams, hasScopePermission, ownerColumn } from '@/app/lib/ops/scope'

/* GET /api/events/operations/licenses?event_id=X | umbrella_id=X
   Everything the Speaker Licences page needs in one round trip: ready speakers
   (across every event in scope), speakers already in a batch, how many aren't
   ready yet, the scope's assigned licence vendors, and the batches. For an
   umbrella that is ALL its child events at once. Gated by ops.licenses.view
   (on any child event, for an umbrella). */
export async function GET(req: NextRequest) {
  const scope = await resolveScope(scopeFromParams(req.nextUrl.searchParams))
  if (!scope) return NextResponse.json({ error: 'event_id or umbrella_id required' }, { status: 400 })

  if (!(await hasScopePermission(getSession(req), scope, 'ops.licenses.view'))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  try {
    await expireDueBatches({ owner: scope })
    const [candidates, batches, { data: assigned }] = await Promise.all([
      loadLicenseCandidates(scope.eventIds),
      loadBatches(scope),
      supabaseAdmin
        .from('ops_event_vendors')
        .select('ops_vendors(id, name, active)')
        .eq(ownerColumn(scope), scope.id)
        .eq('purpose', 'speaker_license'),
    ])
    const vendors = (assigned ?? [])
      .map(a => Array.isArray(a.ops_vendors) ? a.ops_vendors[0] : a.ops_vendors)
      .filter((v): v is { id: string; name: string; active: boolean } => !!v && v.active)
      .sort((a, b) => a.name.localeCompare(b.name))
    return NextResponse.json({ scope: { kind: scope.kind, id: scope.id, name: scope.name, events: scope.eventIds.length }, ...candidates, batches, vendors })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed to load licences' }, { status: 500 })
  }
}
