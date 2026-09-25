import { supabaseAdmin } from '@/app/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/app/lib/access/session'
import { checkProfileSubmitAccess } from '@/app/lib/access/task-profile-access'

/* GET /api/task-profiles — all staff task profiles, for the admin dashboard.
   ADMIN ONLY (2026-09-25). This route sits on the middleware's public list
   (the profile-setup POST below has to work before a session exists), so the
   route itself must enforce auth — until now GET returned every staff
   member's task profile to anyone on the internet with no login. */
export async function GET(req: NextRequest) {
  if (!getSession(req)?.adm) return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const { data, error } = await supabaseAdmin
    .from('staff_task_profiles')
    .select('*')
    .order('submitted_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

/* POST /api/task-profiles — submit staff assessment (replaces server action) */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { staff_id, tasks } = body

    if (!staff_id || !tasks) {
      return NextResponse.json({ error: 'Missing data. Please try again.' }, { status: 400 })
    }

    // Who may write THIS profile (2026-09-25). Staff can arrive here before a
    // session exists (first-time profile setup), so an anonymous caller is still
    // allowed — but only to submit a staff member's FIRST profile, never to
    // overwrite one already submitted. With a session, it must be the person's
    // own (or an admin's).
    const denied = await checkProfileSubmitAccess(req, staff_id)
    if (denied) return denied

    const validTasks = Array.isArray(tasks) ? tasks.filter((t: { task_name?: string }) => t.task_name?.trim()) : []
    if (!validTasks.length) {
      return NextResponse.json({ error: 'Add at least one task with a name.' }, { status: 400 })
    }

    const { error: insertError } = await supabaseAdmin
      .from('staff_task_profiles')
      .upsert({
        staff_id,
        responses:    validTasks,
        submitted_at: new Date().toISOString(),
        updated_at:   new Date().toISOString(),
      }, { onConflict: 'staff_id' })

    if (insertError) {
      console.error('task-profiles upsert error:', insertError)
      return NextResponse.json({ error: 'Could not save your profile. Please try again.' }, { status: 500 })
    }

    const { error: profileError } = await supabaseAdmin
      .from('staff_members')
      .update({ profile_complete: true })
      .eq('id', staff_id)

    if (profileError) {
      console.error('task-profiles profile_complete update error:', profileError)
      // Responses are saved — return success but flag the issue so the client knows
      return NextResponse.json({ success: true, profile_complete_failed: true })
    }

    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('POST /api/task-profiles error:', e)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}

