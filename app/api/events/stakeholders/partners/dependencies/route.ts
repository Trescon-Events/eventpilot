import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

/* GET /api/events/stakeholders/partners/dependencies?ids=a,b,c
   Partner-side mirror of .../speakers/dependencies/route.ts (2026-08-26).
   Only the announcement check applies — event_agenda has no sponsor/
   exhibitor relationship at all (no column references event_sponsors),
   unlike speakers, so there's no agenda-mention equivalent to check. */

export async function GET(req: NextRequest) {
  const idsParam = req.nextUrl.searchParams.get('ids')
  if (!idsParam) return NextResponse.json({ error: 'ids required' }, { status: 400 })
  const ids = idsParam.split(',').map(s => s.trim()).filter(Boolean)
  if (ids.length === 0) return NextResponse.json({})

  const { data: announcements } = await supabaseAdmin
    .from('stakeholder_announcements')
    .select('partner_id, status')
    .in('partner_id', ids)
    .neq('status', 'published')

  const result: Record<string, { pendingAnnouncements: number }> = {}
  for (const id of ids) result[id] = { pendingAnnouncements: 0 }
  for (const a of announcements ?? []) {
    if (!a.partner_id) continue
    result[a.partner_id].pendingAnnouncements += 1
  }
  return NextResponse.json(result)
}
