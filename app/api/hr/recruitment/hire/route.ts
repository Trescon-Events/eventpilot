import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

/* POST /api/hr/recruitment/hire
   Body: { application_id, department?, role?, office_id?, joined_at? }
   - Marks application as hired
   - Creates staff_members row (or returns existing if email already exists)
   - Creates starter onboarding record with tasks from templates
   - Closes requisition if headcount is met */

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body?.application_id) {
    return NextResponse.json({ error: 'application_id required' }, { status: 400 })
  }

  // Fetch application with candidate and requisition
  const { data: app, error: appErr } = await supabaseAdmin
    .from('candidate_applications')
    .select(`
      id, candidate_id, requisition_id,
      candidate:candidate_id(full_name, email, phone),
      requisition:requisition_id(id, title, department, headcount, status)
    `)
    .eq('id', body.application_id)
    .single()

  if (appErr || !app) return NextResponse.json({ error: 'Application not found' }, { status: 404 })

  const candidate   = app.candidate   as unknown as { full_name: string; email: string; phone: string | null }
  const requisition = app.requisition as unknown as { id: string; title: string; department: string | null; headcount: number; status: string }

  const email = candidate.email.trim().toLowerCase()

  // ── Create or retrieve staff member ─────────────────────────────────────
  const { data: existing } = await supabaseAdmin
    .from('staff_members')
    .select('id')
    .ilike('email', email)
    .maybeSingle()

  let staffId = existing?.id
  if (!staffId) {
    const { data: newStaff, error: staffErr } = await supabaseAdmin
      .from('staff_members')
      .insert({
        name:             candidate.full_name.trim(),
        email,
        phone:            candidate.phone ?? null,
        department:       body.department ?? requisition.department ?? null,
        role:             body.role ?? requisition.title,
        office_id:        body.office_id ?? 'dubai',
        job_level:        'staff',
        joined_at:        body.joined_at ?? new Date().toISOString().slice(0, 10),
        access_enabled:   false,  // enable manually once accounts are set up
        profile_complete: false,
        data_source:      'recruitment',
        is_active:        true,
      })
      .select('id')
      .single()

    if (staffErr) return NextResponse.json({ error: staffErr.message }, { status: 500 })
    staffId = newStaff.id
  }

  // ── Move application to hired ────────────────────────────────────────────
  await supabaseAdmin
    .from('candidate_applications')
    .update({ stage: 'hired', stage_updated_at: new Date().toISOString() })
    .eq('id', body.application_id)

  // ── Log hire email ───────────────────────────────────────────────────────
  await supabaseAdmin.from('candidate_emails').insert({
    application_id: body.application_id,
    template:       'hired',
    subject:        `Welcome to Trescon — ${requisition.title}`,
    body:           `Dear ${candidate.full_name},\n\nWe are delighted to welcome you to Trescon!\n\nYour onboarding process will begin shortly. Please expect further communication from our HR team.\n\nBest regards,\nTrescon HR Team`,
  })

  // ── Seed onboarding from templates ──────────────────────────────────────
  let onboardingId: string | null = null
  try {
    const { data: ob } = await supabaseAdmin
      .from('staff_onboarding')
      .select('id')
      .eq('staff_id', staffId)
      .maybeSingle()

    if (!ob) {
      const { data: newOb } = await supabaseAdmin
        .from('staff_onboarding')
        .insert({
          staff_id:   staffId,
          status:     'in_progress',
          started_at: new Date().toISOString().slice(0, 10),
        })
        .select('id')
        .single()

      onboardingId = newOb?.id ?? null

      if (onboardingId) {
        const { data: templates } = await supabaseAdmin
          .from('onboarding_task_templates')
          .select('title, owner, due_days_after_start, course_id')
          .eq('is_active', true)
          .order('sort_order')

        if (templates && templates.length > 0) {
          const joinDate = new Date(body.joined_at ?? Date.now())
          const tasks = templates.map(t => ({
            onboarding_id: onboardingId,
            title:         t.title,
            owner:         t.owner ?? 'HR',
            due_date:      t.due_days_after_start
              ? new Date(joinDate.getTime() + t.due_days_after_start * 86400000).toISOString().slice(0, 10)
              : null,
            course_id:     t.course_id ?? null,
            status:        'pending',
          }))
          await supabaseAdmin.from('staff_onboarding_tasks').insert(tasks)
        }
      }
    }
  } catch {
    // Best-effort — don't fail the hire if onboarding seeding fails
  }

  // ── Check if requisition is now filled ──────────────────────────────────
  try {
    const { count } = await supabaseAdmin
      .from('candidate_applications')
      .select('id', { count: 'exact', head: true })
      .eq('requisition_id', app.requisition_id)
      .eq('stage', 'hired')

    if ((count ?? 0) >= requisition.headcount) {
      await supabaseAdmin
        .from('job_requisitions')
        .update({ status: 'filled', closed_at: new Date().toISOString().slice(0, 10) })
        .eq('id', app.requisition_id)
    }
  } catch {
    // Best-effort
  }

  return NextResponse.json({
    success:        true,
    staff_id:       staffId,
    onboarding_id:  onboardingId,
    was_existing:   !!existing,
  })
}
