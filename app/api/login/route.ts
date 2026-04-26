import { supabaseAdmin } from '@/app/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'

/* POST /api/login — unified login for all Trescademy users
   Dev stage behaviour:
   - Super admin: verified against SUPER_ADMIN_EMAIL + SUPER_ADMIN_PASSWORD env vars
   - Regular staff: email must exist in staff_members; password checked against
     STAFF_DEFAULT_PASSWORD env var (temp org-wide password until Supabase Auth is wired)
   Production (post HR import): replace staff check with Supabase Auth per-user passwords
*/

export async function POST(req: NextRequest) {
  const { email, password } = await req.json()

  if (!email?.trim() || !password?.trim()) {
    return NextResponse.json({ error: 'Email and password are required.' }, { status: 400 })
  }

  const cleanEmail      = email.trim().toLowerCase()
  const superAdminEmail = process.env.SUPER_ADMIN_EMAIL?.toLowerCase()
  const superAdminPass  = process.env.SUPER_ADMIN_PASSWORD
  const staffDefaultPass = process.env.STAFF_DEFAULT_PASSWORD ?? 'trescon@2026'

  // ── Super admin path ──
  if (cleanEmail === superAdminEmail) {
    if (password !== superAdminPass) {
      return NextResponse.json({ error: 'Incorrect password.' }, { status: 401 })
    }
    const { data: staff } = await supabaseAdmin
      .from('staff_members')
      .select('id, name, department, role, office_id, job_level')
      .eq('email', cleanEmail)
      .single()

    if (!staff) {
      // No staff record yet (pre-HR import) — synthetic super admin, skip questionnaire
      return NextResponse.json({
        id:          'super-admin',
        name:        'Super Admin',
        department:  null,
        role:        'Super Admin',
        office_id:   null,
        job_level:   'super_admin',
        is_admin:    true,
        has_reports: true,
        has_profile: true,
      })
    }
    return NextResponse.json({
      id:          staff.id,
      name:        staff.name,
      department:  staff.department,
      role:        staff.role,
      office_id:   staff.office_id,
      job_level:   staff.job_level ?? 'super_admin',
      is_admin:    true,
      has_reports: true,
      has_profile: true, // super admin never goes through the questionnaire
    })
  }

  // ── Regular staff path ──
  const { data: staff, error } = await supabaseAdmin
    .from('staff_members')
    .select('id, name, department, role, office_id, job_level, manager_id, password_hash, access_enabled')
    .eq('email', cleanEmail)
    .single()

  if (error || !staff) {
    return NextResponse.json({ error: 'No account found for this email. Contact your admin.' }, { status: 404 })
  }

  // Check access flag — Phase 1 restricts to managers only
  if (staff.access_enabled === false) {
    return NextResponse.json({ error: 'Your account is not yet active. You will receive an email when access opens.' }, { status: 403 })
  }

  // Verify password — use per-user hash if set, fall back to org-wide default
  let passwordValid = false
  if (staff.password_hash) {
    passwordValid = await bcrypt.compare(password, staff.password_hash)
  } else {
    passwordValid = password === staffDefaultPass
  }

  if (!passwordValid) {
    return NextResponse.json({ error: 'Incorrect password. Use your temporary password from your welcome email.' }, { status: 401 })
  }

  // Check if anyone reports to this person + whether they've completed the questionnaire
  const [{ count: reportCount }, { count: profileCount }] = await Promise.all([
    supabaseAdmin.from('staff_members').select('*', { count: 'exact', head: true }).eq('manager_id', staff.id),
    supabaseAdmin.from('staff_task_profiles').select('*', { count: 'exact', head: true }).eq('staff_id', staff.id),
  ])

  const jobLevel  = staff.job_level ?? 'staff'
  const isAdmin   = jobLevel === 'super_admin' || jobLevel === 'office_head'
  const hasProfile = (profileCount ?? 0) > 0

  return NextResponse.json({
    id:          staff.id,
    name:        staff.name,
    department:  staff.department,
    role:        staff.role,
    office_id:   staff.office_id,
    job_level:   jobLevel,
    is_admin:    isAdmin,
    has_reports: (reportCount ?? 0) > 0,
    has_profile: hasProfile,
  })
}
