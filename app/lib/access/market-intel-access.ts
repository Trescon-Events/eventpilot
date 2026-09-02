import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getServerSession } from '@/app/lib/registry/access'
import { hasEventPermission } from '@/app/lib/access/event-access'

/*
  Mirrors app/admin/events/[id]/market-intel/layout.tsx's own gate (platform
  admin OR the event-scoped 'market-intel.view' permission) for the
  app/api/market-intel/** and app/api/market-intel-jobs/** routes — these
  are queryable by scan_id or job_id with no event_id in the request itself
  (market_intel_scans and market_intel_jobs both carry their own event_id
  column, per supabase/market_intel.sql / market_intel_v2.sql), so this
  resolves the owning event first when the caller didn't already supply one.
  app/lib/scanManager.ts (the only real caller of these routes) always
  passes event_id directly when it has one; the lookup paths below exist
  for the poll/status routes it calls with just a scan_id or job_id.
*/
export async function requireMarketIntelAccess(ids: { eventId?: string | null; scanId?: string | null; jobId?: string | null }): Promise<NextResponse | null> {
  const session = await getServerSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (session.adm) return null

  let eventId = ids.eventId || null

  if (!eventId && ids.scanId) {
    const { data } = await supabaseAdmin.from('market_intel_scans').select('event_id').eq('id', ids.scanId).maybeSingle()
    eventId = data?.event_id ?? null
  }
  if (!eventId && ids.jobId) {
    const { data } = await supabaseAdmin.from('market_intel_jobs').select('event_id').eq('id', ids.jobId).maybeSingle()
    eventId = data?.event_id ?? null
  }

  // No event to check permission against (a scan/job with no event
  // association, or none of eventId/scanId/jobId supplied) — non-admins
  // can't be granted this per-event permission for "no event", so deny.
  if (!eventId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const ok = await hasEventPermission(session.sid, eventId, 'market-intel.view')
  if (!ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  return null
}
