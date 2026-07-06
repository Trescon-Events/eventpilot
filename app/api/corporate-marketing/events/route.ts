/**
 * Live view of events for the corporate deck.
 *
 * GET /api/corporate-marketing/events
 *   → {
 *       upcoming: [{ id, name, event_date, city, venue, type, status }],
 *       past:     [...]
 *     }
 *
 * No writes — events are managed in the Events module. This endpoint
 * reuses the existing `events` table so the deck always reflects the
 * current source of truth without duplication.
 *
 * Rules:
 *   - upcoming = event_date >= today AND status IN ('planning','active')
 *   - past     = status = 'completed' OR event_date < today (limited to
 *                the most recent 24 to keep the deck focused)
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { requireCorporateMarketingAccess } from '@/app/lib/corporate-marketing/auth'

export async function GET(req: NextRequest) {
  const auth = await requireCorporateMarketingAccess(req)
  if (!auth.ok) return auth.res

  const today = new Date().toISOString().slice(0, 10)

  const [{ data: upcoming }, { data: past }] = await Promise.all([
    supabaseAdmin
      .from('events')
      .select('id, name, event_date, city, venue, type, status')
      .in('status', ['planning', 'active'])
      .gte('event_date', today)
      .order('event_date', { ascending: true })
      .limit(48),
    supabaseAdmin
      .from('events')
      .select('id, name, event_date, city, venue, type, status')
      .or(`status.eq.completed,and(event_date.lt.${today})`)
      .order('event_date', { ascending: false })
      .limit(24),
  ])

  return NextResponse.json({
    upcoming: upcoming ?? [],
    past:     past ?? [],
  })
}
