import { supabaseAdmin } from '@/app/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

/* POST /api/hrms-sync
   Pulls active staff from the HRMS Supabase (trescon-resource-planner)
   and upserts them into taos-discovery's staff_members table.

   Matches on email — updates existing records, inserts new ones.
   Never overwrites profile_complete for existing staff.
   Resolves reporting_manager_id (HRMS UUID) → manager_id (taos UUID) via email.
*/

const ADMIN_CODE = process.env.NEXT_PUBLIC_ADMIN_CODE ?? 'taos2026'

// HRMS staff_location → taos office_id
const LOCATION_MAP: Record<string, string> = {
  bengaluru: 'bangalore',
  manipal:   'manipal',
  mangaluru: 'mangalore',
  dubai:     'dubai',
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  if (body.admin_code !== ADMIN_CODE) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const hrmsUrl  = process.env.HRMS_SUPABASE_URL
  const hrmsKey  = process.env.HRMS_SUPABASE_ANON_KEY
  if (!hrmsUrl || !hrmsKey) {
    return NextResponse.json({ error: 'HRMS credentials not configured' }, { status: 500 })
  }

  // Connect to HRMS Supabase (read-only, anon key)
  const hrms = createClient(hrmsUrl, hrmsKey)

  // Fetch all active profiles
  const { data: profiles, error: profilesErr } = await hrms
    .from('profiles')
    .select('id, full_name, email, department, designation, location, reporting_manager_id, hire_date')
    .eq('is_active', true)
    .order('full_name')

  if (profilesErr || !profiles) {
    return NextResponse.json({ error: profilesErr?.message ?? 'Failed to fetch HRMS profiles' }, { status: 500 })
  }

  if (profiles.length === 0) {
    return NextResponse.json({ success: true, synced: 0, message: 'No active staff found in HRMS.' })
  }

  // Resolve reporting_manager_id (UUID) → manager email for second pass
  const managerIds = [...new Set(profiles.map(p => p.reporting_manager_id).filter(Boolean))] as string[]
  let managerEmailMap: Record<string, string> = {}

  if (managerIds.length > 0) {
    const { data: managers } = await hrms
      .from('profiles')
      .select('id, email')
      .in('id', managerIds)

    if (managers) {
      managerEmailMap = Object.fromEntries(managers.map(m => [m.id, m.email?.toLowerCase()]))
    }
  }

  // Check existing staff to preserve profile_complete
  const { data: existingStaff } = await supabaseAdmin
    .from('staff_members')
    .select('email, profile_complete')

  const existingMap = Object.fromEntries(
    (existingStaff ?? []).map(s => [s.email.toLowerCase(), s.profile_complete])
  )

  // ── Pass 1: upsert all staff (no manager_id yet) ──
  const upsertRows = profiles.map(p => {
    const email = p.email?.trim().toLowerCase()
    return {
      name:             p.full_name?.trim() ?? email,
      email,
      department:       p.department ?? null,
      role:             p.designation ?? null,
      office_id:        LOCATION_MAP[p.location ?? ''] ?? 'dubai',
      job_level:        'staff',
      profile_complete: existingMap[email] ?? false,
      joined_at:        p.hire_date ?? null,
    }
  })

  const { error: upsertErr } = await supabaseAdmin
    .from('staff_members')
    .upsert(upsertRows, { onConflict: 'email', ignoreDuplicates: false })

  if (upsertErr) {
    return NextResponse.json({ error: `Upsert failed: ${upsertErr.message}` }, { status: 500 })
  }

  // ── Pass 2: resolve manager links ──
  const staffWithManagers = profiles.filter(
    p => p.reporting_manager_id && managerEmailMap[p.reporting_manager_id]
  )

  let managersLinked = 0
  if (staffWithManagers.length > 0) {
    const { data: allTaosStaff } = await supabaseAdmin
      .from('staff_members')
      .select('id, email')

    const emailToId = Object.fromEntries((allTaosStaff ?? []).map(s => [s.email.toLowerCase(), s.id]))

    const managerUpdates = staffWithManagers
      .map(p => ({
        email:      p.email.trim().toLowerCase(),
        manager_id: emailToId[managerEmailMap[p.reporting_manager_id!]] ?? null,
      }))
      .filter(u => u.manager_id !== null)

    if (managerUpdates.length > 0) {
      await supabaseAdmin
        .from('staff_members')
        .upsert(managerUpdates, { onConflict: 'email', ignoreDuplicates: false })
      managersLinked = managerUpdates.length
    }
  }

  return NextResponse.json({
    success:         true,
    synced:          profiles.length,
    managers_linked: managersLinked,
    message:         `${profiles.length} staff synced from HRMS. ${managersLinked} manager links resolved.`,
  })
}
