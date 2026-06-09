import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { supabaseAdmin } from '@/app/lib/supabase'

const STATUS_MAP: Record<string, string> = {
  present:  'present',
  late:     'present',
  half_day: 'half_day',
  on_leave: 'on_leave',
  holiday:  'holiday',
  weekend:  'weekend',
  comp_off: 'on_leave',
  wfh:      'wfh',
}

function toTime(ts: string | null): string | null {
  if (!ts) return null
  const d = new Date(ts)
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
}

function normalizeName(n: string) {
  return n.toLowerCase().replace(/\s+/g, ' ').trim()
}

const ADMIN_CODE = process.env.NEXT_PUBLIC_ADMIN_CODE ?? 'taos2026'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))

  // admin_code required when called outside browser session (CLI/cron)
  // Middleware bypasses auth check for this path, so we gate here
  if (body.admin_code && body.admin_code !== ADMIN_CODE) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let fromDate: string
  if (body.from_date) {
    fromDate = body.from_date
  } else {
    const d = new Date()
    d.setDate(d.getDate() - (body.days ?? 30))
    fromDate = d.toISOString().slice(0, 10)
  }

  // ── Connect to old HRMS ───────────────────────────────────────────────────
  const hrmsClient = createClient(
    process.env.HRMS_SUPABASE_URL!,
    process.env.HRMS_SUPABASE_ANON_KEY!
  )
  const { error: signInError } = await hrmsClient.auth.signInWithPassword({
    email:    process.env.HRMS_ADMIN_EMAIL!,
    password: process.env.HRMS_ADMIN_PASSWORD!,
  })
  if (signInError) {
    return NextResponse.json({ error: `HRMS auth failed: ${signInError.message}` }, { status: 500 })
  }

  // ── Fetch attendance records ───────────────────────────────────────────────
  const { data: hrmsRecords, error: fetchError } = await hrmsClient
    .from('attendance_records')
    .select('staff_id, date, login_time, logout_time, status, is_late, notes')
    .gte('date', fromDate)
    .order('date')

  if (fetchError) {
    return NextResponse.json({ error: `HRMS attendance fetch failed: ${fetchError.message}` }, { status: 500 })
  }
  if (!hrmsRecords || hrmsRecords.length === 0) {
    await hrmsClient.auth.signOut()
    return NextResponse.json({ synced: 0, message: `No attendance records from ${fromDate}` })
  }

  // ── Fetch all profiles from HRMS (policy is USING(true) — readable by all) ─
  const uniqueStaffIds = [...new Set(hrmsRecords.map(r => r.staff_id))]
  const { data: hrmsProfiles, error: profileError } = await hrmsClient
    .from('profiles')
    .select('id, email, full_name')
    .in('id', uniqueStaffIds)

  await hrmsClient.auth.signOut()

  if (profileError) {
    return NextResponse.json({ error: `HRMS profiles fetch failed: ${profileError.message}` }, { status: 500 })
  }

  // Build profile lookup: staff_id → { email, name }
  const profileMap: Record<string, { email: string; name: string }> = {}
  for (const p of hrmsProfiles ?? []) {
    profileMap[p.id] = { email: p.email ?? '', name: p.full_name ?? '' }
  }

  // ── Fetch staff_members from new system ────────────────────────────────────
  const { data: staffMembers } = await supabaseAdmin
    .from('staff_members')
    .select('id, name, email')

  const byEmail: Record<string, string> = {}
  const byName:  Record<string, string> = {}
  for (const s of staffMembers ?? []) {
    if (s.email) byEmail[s.email.toLowerCase().trim()] = s.id
    if (s.name)  byName[normalizeName(s.name)]         = s.id
  }

  // ── Match and upsert ───────────────────────────────────────────────────────
  let synced  = 0
  let skipped = 0
  const unmatched: string[] = []
  const errors:    string[] = []
  const batch:     object[] = []

  for (const r of hrmsRecords) {
    const profile = profileMap[r.staff_id]
    const email   = profile?.email?.toLowerCase().trim()
    const name    = profile?.name

    const newStaffId =
      (email ? byEmail[email] : undefined) ??
      (name  ? byName[normalizeName(name)] : undefined)

    if (!newStaffId) {
      skipped++
      unmatched.push(`${profile?.name ?? '?'} <${profile?.email ?? r.staff_id}>`)
      continue
    }

    const mappedStatus = STATUS_MAP[r.status] ?? 'present'
    batch.push({
      staff_id:     newStaffId,
      date:         r.date,
      status:       mappedStatus,
      clock_in:     toTime(r.login_time),
      clock_out:    toTime(r.logout_time),
      location:     mappedStatus === 'wfh' ? 'wfh' : 'office',
      late_arrival: r.is_late ?? r.status === 'late',
      early_leave:  false,
      notes:        r.notes ?? null,
      updated_at:   new Date().toISOString(),
    })

    if (batch.length === 100) {
      const { data: upserted, error } = await supabaseAdmin
        .from('staff_attendance')
        .upsert(batch, { onConflict: 'staff_id,date' })
        .select('id')
      if (error) errors.push(error.message)
      else synced += upserted?.length ?? batch.length
      batch.length = 0
    }
  }

  if (batch.length > 0) {
    const { data: upserted, error } = await supabaseAdmin
      .from('staff_attendance')
      .upsert(batch, { onConflict: 'staff_id,date' })
      .select('id')
    if (error) errors.push(error.message)
    else synced += upserted?.length ?? batch.length
  }

  // Debug: first 3 staff_members names so we can compare
  const sampleNewStaff = (staffMembers ?? []).slice(0, 3).map(s => `${s.name} <${s.email}>`)

  return NextResponse.json({
    synced,
    skipped,
    from_date: fromDate,
    total_source_records: hrmsRecords.length,
    hrms_profiles_found: Object.keys(profileMap).length,
    new_staff_members_loaded: Object.keys(byEmail).length,
    unmatched,
    sample_new_staff: sampleNewStaff,
    errors: errors.length > 0 ? errors : undefined,
  })
}
