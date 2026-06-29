import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { supabaseAdmin } from '@/app/lib/supabase'

/**
 * GET /api/cron/attendance-live?secret=X
 * Near-real-time attendance sync — pulls today's records from HRMS.
 * Designed to be called every 5 minutes by an external scheduler or client-side polling.
 * Only syncs today + yesterday (2 days) for speed.
 */

const STATUS_MAP: Record<string, string> = {
  present: 'present', late: 'present', half_day: 'half_day',
  on_leave: 'on_leave', holiday: 'holiday', weekend: 'weekend',
  comp_off: 'on_leave', wfh: 'wfh',
}

function toTime(ts: string | null): string | null {
  if (!ts) return null
  const d = new Date(ts)
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
}

function normalizeName(n: string) {
  return n.toLowerCase().replace(/\s+/g, ' ').trim()
}

// In-memory rate limit — max 1 sync per 2 minutes
let lastSyncAt = 0

export async function GET(req: NextRequest) {
  const secret = new URL(req.url).searchParams.get('secret')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Rate limit
  const now = Date.now()
  if (now - lastSyncAt < 120000) {
    return NextResponse.json({ skipped: true, reason: 'Rate limited — last sync was less than 2 minutes ago' })
  }
  lastSyncAt = now

  const fromDate = new Date()
  fromDate.setDate(fromDate.getDate() - 1) // yesterday + today
  const from = fromDate.toISOString().slice(0, 10)

  try {
    const hrmsClient = createClient(
      process.env.HRMS_SUPABASE_URL!,
      process.env.HRMS_SUPABASE_ANON_KEY!
    )
    const { error: signInError } = await hrmsClient.auth.signInWithPassword({
      email: process.env.HRMS_ADMIN_EMAIL!,
      password: process.env.HRMS_ADMIN_PASSWORD!,
    })
    if (signInError) return NextResponse.json({ error: `HRMS auth: ${signInError.message}` }, { status: 500 })

    const { data: hrmsRecords } = await hrmsClient
      .from('attendance_records')
      .select('staff_id, date, login_time, logout_time, status, is_late, notes')
      .gte('date', from)

    const uniqueStaffIds = [...new Set((hrmsRecords ?? []).map((r: { staff_id: string }) => r.staff_id))]
    const { data: hrmsProfiles } = await hrmsClient
      .from('profiles')
      .select('id, email, full_name')
      .in('id', uniqueStaffIds.length > 0 ? uniqueStaffIds : ['__none__'])

    await hrmsClient.auth.signOut()

    if (!hrmsRecords?.length) return NextResponse.json({ synced: 0, from, message: 'No records' })

    const profileMap: Record<string, { email: string; name: string }> = {}
    for (const p of hrmsProfiles ?? []) {
      profileMap[p.id] = { email: p.email ?? '', name: p.full_name ?? '' }
    }

    const { data: staffMembers } = await supabaseAdmin.from('staff_members').select('id, name, email')
    const byEmail: Record<string, string> = {}
    const byName: Record<string, string> = {}
    for (const s of staffMembers ?? []) {
      if (s.email) byEmail[s.email.toLowerCase().trim()] = s.id
      if (s.name) byName[normalizeName(s.name)] = s.id
    }

    let synced = 0, skipped = 0
    const batch: object[] = []

    for (const r of hrmsRecords) {
      const profile = profileMap[r.staff_id]
      const email = profile?.email?.toLowerCase().trim()
      const name = profile?.name
      const newStaffId = (email ? byEmail[email] : undefined) ?? (name ? byName[normalizeName(name)] : undefined)
      if (!newStaffId) { skipped++; continue }

      const mappedStatus = STATUS_MAP[r.status] ?? 'present'
      batch.push({
        staff_id: newStaffId,
        date: r.date,
        status: mappedStatus,
        clock_in: toTime(r.login_time),
        clock_out: toTime(r.logout_time),
        location: mappedStatus === 'wfh' ? 'wfh' : 'office',
        late_arrival: r.is_late ?? r.status === 'late',
        early_leave: false,
        notes: r.notes ?? null,
        updated_at: new Date().toISOString(),
      })
    }

    if (batch.length > 0) {
      const { data: upserted, error } = await supabaseAdmin
        .from('staff_attendance')
        .upsert(batch, { onConflict: 'staff_id,date' })
        .select('id')
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      synced = upserted?.length ?? batch.length
    }

    return NextResponse.json({ synced, skipped, from, ts: new Date().toISOString() })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unknown' }, { status: 500 })
  }
}
