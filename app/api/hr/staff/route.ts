import { supabaseAdmin } from '@/app/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { sendCredentials } from '@/app/lib/email'

/* ── Temp password: FirstName@XXXX ────────────────────────────────────────── */
function makeTempPassword(name: string): string {
  const first = name.trim().split(' ')[0].replace(/[^a-zA-Z]/g, '')
  const pin   = String(Math.floor(1000 + Math.random() * 9000))
  return `${first.charAt(0).toUpperCase()}${first.slice(1).toLowerCase()}@${pin}`
}

const DEFAULT_ONBOARDING_TASKS = [
  { title: 'Welcome call with manager',                  owner: 'manager' },
  { title: 'ID and documents submitted to HR',           owner: 'staff'   },
  { title: 'Company email and system access set up',     owner: 'it'      },
  { title: 'Platform orientation completed',             owner: 'staff'   },
  { title: 'First week check-in with HR',                owner: 'hr'      },
  { title: 'Role briefing with department head',         owner: 'manager' },
  { title: 'Foundation course started on Event Pilot',   owner: 'staff'   },
  { title: '30-day review scheduled',                    owner: 'hr'      },
]

/*
  GET /api/hr/staff         — list all staff (id, name, email, department, role, job_level, office_id)
  GET /api/hr/staff?id=X    — single staff member
*/
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')

  if (id) {
    const { data, error } = await supabaseAdmin
      .from('staff_members')
      .select('id, name, email, department, role, job_level, office_id, phone, gender, date_of_birth, work_mode, employee_code, company, business_unit, skills, manager_id, access_enabled, joined_at')
      .eq('id', id)
      .maybeSingle()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  }

  const { data, error } = await supabaseAdmin
    .from('staff_members')
    .select('id, name, email, department, role, job_level, office_id')
    .eq('access_enabled', true)
    .order('name')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

/*
  POST /api/hr/staff
  Full staff onboarding creation — one call to:
    1. Create staff record with all fields + hashed password
    2. Set tool_grants
    3. Reassign any existing reports to this person
    4. Optionally start an onboarding checklist
    5. Return credentials

  Auth: session cookie (adm) or admin_code header
*/
export async function POST(req: NextRequest) {
  /* ── Auth ── */
  const adminCode = req.headers.get('x-admin-code')
  const expectedCode = process.env.NEXT_PUBLIC_ADMIN_CODE ?? 'eventpilot2026'

  // Allow session-based auth (admin or HR dept)
  const raw = req.cookies.get('tcs_session')?.value
  let sessionOk = false
  if (raw) {
    try {
      const s = JSON.parse(atob(raw))
      if (s.adm === true || s.dept === 'HR') sessionOk = true
    } catch { /* ignore */ }
  }
  if (!sessionOk && adminCode !== expectedCode) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const {
    name, email,
    salutation, phone, date_of_birth, gender, blood_group,
    department, role, job_level, office_id, work_mode,
    employee_code, company, business_unit, joined_at,
    manager_id,
    emergency_contact_name, emergency_contact_phone,
    access_enabled,
    tool_grants,
    reassign_report_ids,   // string[] — staff IDs whose manager should be set to this new person
    start_onboarding,
  } = body

  if (!name?.trim() || !email?.trim()) {
    return NextResponse.json({ error: 'name and email are required' }, { status: 400 })
  }

  /* ── Check duplicate email ── */
  const { data: existing } = await supabaseAdmin
    .from('staff_members')
    .select('id, email')
    .eq('email', email.trim().toLowerCase())
    .maybeSingle()

  if (existing) {
    return NextResponse.json({ error: 'A staff member with this email already exists.' }, { status: 409 })
  }

  /* ── Generate temp password ── */
  const tempPassword = makeTempPassword(name)
  const passwordHash = await bcrypt.hash(tempPassword, 10)

  /* ── Insert staff record ── */
  const insertPayload: Record<string, unknown> = {
    name:                   name.trim(),
    email:                  email.trim().toLowerCase(),
    password_hash:          passwordHash,
    must_change_password:   true,
    access_enabled:         access_enabled ?? false,
    profile_complete:       false,
    is_active:              true,
    data_source:            'manual',
  }

  // Optional fields — only set if provided
  if (salutation)               insertPayload.salutation               = salutation
  if (phone)                    insertPayload.phone                    = phone
  if (date_of_birth)            insertPayload.date_of_birth            = date_of_birth
  if (gender)                   insertPayload.gender                   = gender
  if (blood_group)              insertPayload.blood_group              = blood_group
  if (department)               insertPayload.department               = department
  if (role)                     insertPayload.role                     = role
  if (job_level)                insertPayload.job_level                = job_level
  if (office_id)                insertPayload.office_id                = office_id
  if (work_mode)                insertPayload.work_mode                = work_mode
  if (employee_code)            insertPayload.employee_code            = employee_code
  if (company)                  insertPayload.company                  = company
  if (business_unit)            insertPayload.business_unit            = business_unit
  if (joined_at)                insertPayload.joined_at                = joined_at
  if (manager_id)               insertPayload.manager_id               = manager_id
  if (emergency_contact_name)   insertPayload.emergency_contact_name   = emergency_contact_name
  if (emergency_contact_phone)  insertPayload.emergency_contact_phone  = emergency_contact_phone

  if (tool_grants && typeof tool_grants === 'object') {
    insertPayload.tool_grants    = tool_grants
    insertPayload.toolkit_access = (tool_grants as Record<string, boolean>).smart_data === true
  }

  const { data: newStaff, error: insertErr } = await supabaseAdmin
    .from('staff_members')
    .insert(insertPayload)
    .select('id, name, email')
    .single()

  if (insertErr || !newStaff) {
    return NextResponse.json({ error: insertErr?.message ?? 'Failed to create staff' }, { status: 500 })
  }

  /* ── Reassign direct reports ── */
  if (Array.isArray(reassign_report_ids) && reassign_report_ids.length > 0) {
    await supabaseAdmin
      .from('staff_members')
      .update({ manager_id: newStaff.id })
      .in('id', reassign_report_ids)
  }

  /* ── Auto-start onboarding checklist ── */
  let onboarding_id: string | null = null
  if (start_onboarding) {
    // Find best-matching template (dept + job_level match)
    const { data: templates } = await supabaseAdmin
      .from('onboarding_templates')
      .select('id, department, job_level')

    let templateId: string | null = null
    if (templates?.length) {
      const exact = templates.find(t => t.department === department && t.job_level === job_level)
      const deptOnly = templates.find(t => t.department === department && !t.job_level)
      const fallback = templates.find(t => !t.department && !t.job_level)
      templateId = (exact ?? deptOnly ?? fallback)?.id ?? null
    }

    // Build tasks — from template if found, else use defaults
    let tasks: Array<{ title: string; owner: string }> = DEFAULT_ONBOARDING_TASKS
    if (templateId) {
      const { data: tmplTasks } = await supabaseAdmin
        .from('onboarding_template_tasks')
        .select('title, owner')
        .eq('template_id', templateId)
      if (tmplTasks?.length) tasks = tmplTasks
    }

    const targetEnd = new Date()
    targetEnd.setDate(targetEnd.getDate() + 30)

    const { data: ob } = await supabaseAdmin
      .from('staff_onboarding')
      .insert({
        staff_id:    newStaff.id,
        template_id: templateId,
        status:      'in_progress',
        target_end:  targetEnd.toISOString().split('T')[0],
      })
      .select('id')
      .single()

    if (ob?.id) {
      onboarding_id = ob.id
      await supabaseAdmin
        .from('staff_onboarding_tasks')
        .insert(tasks.map(t => ({ title: t.title, owner: t.owner, onboarding_id: ob.id })))
    }
  }

  /* ── Send credentials email ── */
  if (access_enabled) {
    const loginUrl = `${process.env.NEXT_PUBLIC_SITE_URL ?? 'https://eventpilot.tresconglobal.com'}/login`
    try {
      await sendCredentials({ to: newStaff.email, name: newStaff.name, tempPassword, loginUrl })
    } catch (e) {
      console.error('sendCredentials error:', e)
      // Non-fatal — credentials shown on screen regardless
    }
  }

  /* ── Send welcome notification (in-app) ── */
  if (access_enabled) {
    await supabaseAdmin.from('notifications').insert({
      staff_id: newStaff.id,
      type:     'welcome',
      title:    `Welcome to Trescon, ${newStaff.name.split(' ')[0]}!`,
      body:     'Your profile has been created. Please log in and complete your profile setup.',
      read:     false,
    })
  }

  return NextResponse.json({
    success:       true,
    staff_id:      newStaff.id,
    name:          newStaff.name,
    email:         newStaff.email,
    temp_password: tempPassword,
    onboarding_id,
  })
}
