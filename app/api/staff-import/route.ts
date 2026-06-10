import { supabaseAdmin } from '@/app/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'

const ADMIN_CODE = process.env.NEXT_PUBLIC_ADMIN_CODE ?? 'eventpilot2026'

/* POST /api/staff-import
   Bulk upsert staff members from HR database export.
   Matches on email — updates existing records, inserts new ones.

   Expected body:
   {
     admin_code: string,
     staff: [
       {
         name: string,
         email: string,
         department: string,
         role: string,
         office_id: 'dubai' | 'bangalore' | 'mangalore' | 'manipal',
         job_level: 'staff' | 'team_lead' | 'dept_head' | 'office_head' | 'super_admin',
         team?: string,
         manager_email?: string   // resolved to manager_id after first pass
       }
     ]
   }

   Two-pass import:
   1. Upsert all staff (no manager_id yet) — ensures all IDs exist
   2. Resolve manager_email → manager_id and update
*/

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { admin_code, staff: incoming } = body

  if (admin_code !== ADMIN_CODE) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!Array.isArray(incoming) || incoming.length === 0) {
    return NextResponse.json({ error: 'No staff data provided.' }, { status: 400 })
  }

  // ── Fetch existing emails so we never overwrite profile_complete ──
  const { data: existingStaff } = await supabaseAdmin
    .from('staff_members')
    .select('email, profile_complete')

  const existingMap = Object.fromEntries(
    (existingStaff ?? []).map(s => [s.email.toLowerCase(), s.profile_complete])
  )

  // ── Pass 1: Upsert all staff without manager_id ──
  const upsertRows = incoming.map((s: {
    name: string; email: string; department: string; role: string
    office_id: string; job_level: string; team?: string
  }) => {
    const email = s.email?.trim().toLowerCase()
    const alreadyComplete = existingMap[email] ?? false
    return {
      name:             s.name?.trim(),
      email,
      department:       s.department?.trim() ?? null,
      role:             s.role?.trim() ?? null,
      office_id:        s.office_id?.trim().toLowerCase(),
      job_level:        s.job_level?.trim() ?? 'staff',
      team:             s.team?.trim() ?? null,
      // Only set false for brand-new rows — never regress existing completions
      profile_complete: alreadyComplete,
    }
  })

  const { error: upsertErr } = await supabaseAdmin
    .from('staff_members')
    .upsert(upsertRows, { onConflict: 'email', ignoreDuplicates: false })

  if (upsertErr) {
    return NextResponse.json({ error: `Pass 1 failed: ${upsertErr.message}` }, { status: 500 })
  }

  // ── Pass 2: Resolve manager_email → manager_id (single batch, no loop) ──
  const staffWithManagers = incoming.filter((s: { manager_email?: string }) => s.manager_email?.trim())

  if (staffWithManagers.length > 0) {
    // Fetch all email → id mappings in one query
    const { data: allStaff } = await supabaseAdmin
      .from('staff_members')
      .select('id, email')

    const emailToId = Object.fromEntries((allStaff ?? []).map(s => [s.email, s.id]))

    // Build all updates with resolved manager_ids
    const updates = staffWithManagers
      .map((s: { email: string; manager_email: string }) => ({
        email:      s.email.trim().toLowerCase(),
        manager_id: emailToId[s.manager_email.trim().toLowerCase()] ?? null,
      }))
      .filter((u: { manager_id: string | null }) => u.manager_id !== null)

    // Batch upsert by email — one round trip for all manager links
    if (updates.length > 0) {
      const { error: managerErr } = await supabaseAdmin
        .from('staff_members')
        .upsert(
          updates.map((u: { email: string; manager_id: string }) => ({ email: u.email, manager_id: u.manager_id })),
          { onConflict: 'email', ignoreDuplicates: false }
        )
      if (managerErr) {
        return NextResponse.json({ error: `Pass 2 failed: ${managerErr.message}` }, { status: 500 })
      }
    }
  }

  // Return summary
  const { count } = await supabaseAdmin
    .from('staff_members')
    .select('*', { count: 'exact', head: true })

  return NextResponse.json({
    success:    true,
    imported:   incoming.length,
    total_staff: count,
    message:    `${incoming.length} staff members imported. Manager links resolved.`,
  })
}
