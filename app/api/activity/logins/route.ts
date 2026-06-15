import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

/*
  GET /api/activity/logins?staff_id=X&limit=30
  Returns login history for a specific staff member.
  Queries login_attempts by staff_id (with email fallback for older rows).

  GET /api/activity/logins?summary=1
  Returns per-staff login counts (for the People tab overview).
*/

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const staffId = searchParams.get('staff_id')
  const summary = searchParams.get('summary') === '1'
  const limit   = Math.min(parseInt(searchParams.get('limit') ?? '50'), 200)

  // ── Per-user history ───────────────────────────────────────────────────────
  if (staffId) {
    // First try staff_id column (new rows); fallback joins via email
    const { data: byId } = await supabaseAdmin
      .from('login_attempts')
      .select('id, ip, success, reason, attempted_at')
      .eq('staff_id', staffId)
      .order('attempted_at', { ascending: false })
      .limit(limit)

    // If we have rows by ID, return them
    if (byId && byId.length > 0) {
      return NextResponse.json(byId)
    }

    // Fallback: look up email and query by email (pre-migration rows)
    const { data: staff } = await supabaseAdmin
      .from('staff_members')
      .select('email')
      .eq('id', staffId)
      .single()

    if (!staff?.email) return NextResponse.json([])

    const { data: byEmail } = await supabaseAdmin
      .from('login_attempts')
      .select('id, ip, success, reason, attempted_at')
      .eq('email', staff.email)
      .order('attempted_at', { ascending: false })
      .limit(limit)

    return NextResponse.json(byEmail ?? [])
  }

  // ── Summary: login count per staff ──────────────────────────────────────────
  if (summary) {
    // Count successful logins per staff_id (new rows only — fast)
    const { data } = await supabaseAdmin
      .from('login_attempts')
      .select('staff_id, success')
      .not('staff_id', 'is', null)
      .eq('success', true)

    if (!data) return NextResponse.json({})

    const counts: Record<string, number> = {}
    for (const row of data) {
      if (row.staff_id) counts[row.staff_id] = (counts[row.staff_id] ?? 0) + 1
    }
    return NextResponse.json(counts)
  }

  return NextResponse.json({ error: 'Provide staff_id or summary=1' }, { status: 400 })
}
