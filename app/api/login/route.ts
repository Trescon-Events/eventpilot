import { supabaseAdmin } from '@/app/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { sessionCookieOptions } from '@/app/lib/access/session-cookie'

/* POST /api/login — unified login for all Event Pilot users
   Security layers applied in order:
   1. Password auth is local-dev only — production requires Microsoft SSO for everyone
   2. Brute force — 5 failed attempts in 15 min → 15-min lockout
   3. IP allowlist — if OFFICE_IPS env var is set, non-admin staff must be on office network
   4. Password check — bcrypt against a per-user hash only (no shared/default password)
   5. Audit log — every attempt (success + failure) written to login_attempts
*/

const LOCKOUT_WINDOW_MS  = 15 * 60 * 1000  // 15 minutes
const MAX_FAILED_ATTEMPTS = 5

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'unknown'
  )
}

async function logAttempt(email: string, ip: string, success: boolean, reason: string) {
  await supabaseAdmin.from('login_attempts').insert({ email, ip, success, reason })
}

export async function POST(req: NextRequest) {
  const { email, password, rememberMe } = await req.json()
  const ip = getClientIp(req)
  const SESSION_MAX_AGE = rememberMe ? 60 * 60 * 24 * 30 : 60 * 60 * 8

  if (!email?.trim() || !password?.trim()) {
    return NextResponse.json({ error: 'Email and password are required.' }, { status: 400 })
  }

  // Password login only exists for local development. Production is Microsoft SSO only.
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Password sign-in is disabled. Please use Microsoft SSO.' }, { status: 403 })
  }

  const cleanEmail       = email.trim().toLowerCase()
  const superAdminEmail  = process.env.SUPER_ADMIN_EMAIL?.toLowerCase()
  const superAdminPass   = process.env.SUPER_ADMIN_PASSWORD

  // ── Layer 1: Brute force check (all users except super admin) ──────────
  if (cleanEmail !== superAdminEmail) {
    const windowStart = new Date(Date.now() - LOCKOUT_WINDOW_MS).toISOString()
    const { count: failCount } = await supabaseAdmin
      .from('login_attempts')
      .select('*', { count: 'exact', head: true })
      .eq('email', cleanEmail)
      .eq('success', false)
      .gte('attempted_at', windowStart)

    if ((failCount ?? 0) >= MAX_FAILED_ATTEMPTS) {
      await logAttempt(cleanEmail, ip, false, 'rate_limited')
      return NextResponse.json({
        error: 'Too many failed attempts. Your account is locked for 15 minutes. Contact your admin if you need immediate access.',
      }, { status: 429 })
    }
  }

  // ── Super admin path ───────────────────────────────────────────────────
  if (cleanEmail === superAdminEmail) {
    if (password !== superAdminPass) {
      await logAttempt(cleanEmail, ip, false, 'wrong_password')
      return NextResponse.json({ error: 'Incorrect password.' }, { status: 401 })
    }
    const { data: staff } = await supabaseAdmin
      .from('staff_members')
      .select('id, name, department, role, office_id, job_level')
      .eq('email', cleanEmail)
      .single()

    await logAttempt(cleanEmail, ip, true, 'super_admin_ok')

    if (!staff) {
      const syntheticSession = Buffer.from(JSON.stringify({ sid: 'super-admin', jl: 'super_admin', adm: true, dept: '' })).toString('base64')
      const r = NextResponse.json({ id: 'super-admin', name: 'Super Admin', department: null, role: 'Super Admin', office_id: null, job_level: 'super_admin', is_admin: true, has_reports: true, has_profile: true })
      r.cookies.set('tcs_session', syntheticSession, sessionCookieOptions(SESSION_MAX_AGE))
      return r
    }
    const adminSession = Buffer.from(JSON.stringify({ sid: staff.id, jl: staff.job_level ?? 'super_admin', adm: true, dept: staff.department ?? '' })).toString('base64')
    const r = NextResponse.json({ id: staff.id, name: staff.name, department: staff.department, role: staff.role, office_id: staff.office_id, job_level: staff.job_level ?? 'super_admin', is_admin: true, has_reports: true, has_profile: true })
    r.cookies.set('tcs_session', adminSession, sessionCookieOptions(SESSION_MAX_AGE))
    return r
  }

  // ── Regular staff path ─────────────────────────────────────────────────
  const { data: staff, error } = await supabaseAdmin
    .from('staff_members')
    .select('id, name, department, role, office_id, job_level, manager_id, password_hash, access_enabled, must_change_password, access_roles')
    .eq('email', cleanEmail)
    .single()

  if (error || !staff) {
    await logAttempt(cleanEmail, ip, false, 'not_found')
    return NextResponse.json({ error: 'No account found for this email. Contact your admin.' }, { status: 404 })
  }

  if (staff.access_enabled === false) {
    await logAttempt(cleanEmail, ip, false, 'account_disabled')
    return NextResponse.json({ error: 'Your account is not yet active. You will receive an email when access opens.' }, { status: 403 })
  }

  // ── Layer 2: IP allowlist (skip for admins — they can login from anywhere) ──
  const jobLevel    = staff.job_level ?? 'staff'
  const accessRoles = (staff.access_roles ?? ['standard']) as string[]
  const isAdmin     = accessRoles.includes('admin') || accessRoles.includes('super_admin')
  const officeIps = (process.env.OFFICE_IPS ?? '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)

  if (officeIps.length > 0 && !isAdmin) {
    if (!officeIps.includes(ip)) {
      await logAttempt(cleanEmail, ip, false, 'ip_blocked')
      return NextResponse.json({
        error: 'Access is restricted to the office network. Please connect to the Trescon office Wi-Fi and try again.',
      }, { status: 403 })
    }
  }

  // ── Layer 3: Password check — per-user hash only, no shared default ────
  const passwordValid = staff.password_hash
    ? await bcrypt.compare(password, staff.password_hash)
    : false

  if (!passwordValid) {
    await logAttempt(cleanEmail, ip, false, 'wrong_password')
    return NextResponse.json({ error: 'Incorrect password, or this account is not enabled for password sign-in. Use Microsoft SSO.' }, { status: 401 })
  }

  // ── Successful login ───────────────────────────────────────────────────
  await logAttempt(cleanEmail, ip, true, 'ok')

  const now = new Date().toISOString()
  supabaseAdmin.from('staff_members').update({ last_login_at: now }).eq('id', staff.id)

  // Link this login_attempt row to the staff record + start active session
  supabaseAdmin
    .from('login_attempts')
    .update({ staff_id: staff.id })
    .eq('email', cleanEmail)
    .eq('success', true)
    .order('attempted_at', { ascending: false })
    .limit(1)

  supabaseAdmin
    .from('active_sessions')
    .upsert(
      { staff_id: staff.id, ip, last_seen_at: now },
      { onConflict: 'staff_id' }
    )

  const [{ count: reportCount }, { count: profileCount }] = await Promise.all([
    supabaseAdmin.from('staff_members').select('*', { count: 'exact', head: true }).eq('manager_id', staff.id),
    supabaseAdmin.from('staff_task_profiles').select('*', { count: 'exact', head: true }).eq('staff_id', staff.id),
  ])

  const fullIsAdmin = accessRoles.includes('admin') || accessRoles.includes('super_admin')
  const hasProfile  = (profileCount ?? 0) > 0

  const responseBody = {
    id:                   staff.id,
    name:                 staff.name,
    department:           staff.department,
    role:                 staff.role,
    office_id:            staff.office_id,
    job_level:            jobLevel,
    is_admin:             fullIsAdmin,
    has_reports:          (reportCount ?? 0) > 0,
    has_profile:          hasProfile,
    must_change_password: staff.must_change_password ?? false,
  }

  const sessionPayload = Buffer.from(JSON.stringify({
    sid:   staff.id,
    jl:    jobLevel,
    adm:   fullIsAdmin,
    dept:  staff.department ?? '',
    roles: accessRoles,
  })).toString('base64')

  const res = NextResponse.json(responseBody)
  res.cookies.set('tcs_session', sessionPayload, sessionCookieOptions(SESSION_MAX_AGE))
  return res
}
