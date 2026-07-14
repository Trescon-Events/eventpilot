import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import bcrypt from 'bcryptjs'

const ADMIN_LEVELS = ['super_admin', 'office_head', 'dept_head', 'team_lead']

// Direct /admin password entry — local development only. Production admins
// authenticate via Microsoft SSO (see /api/auth/microsoft, /api/auth/callback).
export async function POST(req: NextRequest) {
  const { email, password } = await req.json()

  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password are required.' }, { status: 400 })
  }

  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Password sign-in is disabled. Please use Microsoft SSO.' }, { status: 403 })
  }

  const superAdminEmail    = process.env.SUPER_ADMIN_EMAIL
  const superAdminPassword = process.env.SUPER_ADMIN_PASSWORD

  const emailNorm = email.toLowerCase().trim()

  // Check super admin credentials first
  const isSuperAdmin = emailNorm === superAdminEmail?.toLowerCase() && password === superAdminPassword

  // Look up staff record
  const { data, error } = await supabaseAdmin
    .from('staff_members')
    .select('id, name, office_id, department, job_level, access_enabled, password_hash')
    .eq('email', emailNorm)
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'Staff record not found.' }, { status: 404 })
  }

  // Per-user password hash only — no shared/default password
  const isStaffPassword = !isSuperAdmin && data.password_hash
    ? await bcrypt.compare(password, data.password_hash)
    : false

  if (!isSuperAdmin && !isStaffPassword) {
    return NextResponse.json({ error: 'Incorrect password.' }, { status: 401 })
  }

  if (!data.access_enabled) {
    return NextResponse.json({ error: 'Your account is not yet active.' }, { status: 403 })
  }

  // Only allow admin levels in (super admin bypasses this check)
  if (!isSuperAdmin && !ADMIN_LEVELS.includes(data.job_level)) {
    return NextResponse.json({ error: 'You do not have admin access.' }, { status: 403 })
  }

  return NextResponse.json({ id: data.id, name: data.name })
}
