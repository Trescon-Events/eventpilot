import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'

export async function POST(req: NextRequest) {
  const { email } = await req.json()

  if (!email) {
    return NextResponse.json({ error: 'Email is required.' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('staff_members')
    .select('id, name, office_id, department, profile_complete')
    .eq('email', email.toLowerCase().trim())
    .single()

  if (error || !data) {
    return NextResponse.json({ error: "We couldn't find your email. Have you joined at /join yet?" }, { status: 404 })
  }

  return NextResponse.json({ id: data.id, name: data.name, office_id: data.office_id, department: data.department, profile_complete: data.profile_complete })
}

/* PATCH — update department for a staff member (used during questionnaire onboarding).

   Hardened 2026-09-25: this route is on the middleware's public list (staff can reach the
   profile page before a session exists), and it used to let ANYONE change ANY staff
   member's department with no login — and department drives access (HR / Finance / Marketing
   areas). Now:
     - with a session: only your OWN record (or an admin);
     - with no session: only for someone who hasn't finished onboarding yet (profile_complete
       is false) — a completed profile can never be changed anonymously.
   Residual: an anonymous caller who knows a not-yet-onboarded colleague's staff id could
   still set that person's department once. Requiring a session on the profile flow closes it. */
export async function PATCH(req: NextRequest) {
  const { staff_id, department } = await req.json().catch(() => ({}))
  if (!staff_id || typeof department !== 'string' || !department.trim()) return NextResponse.json({ error: 'staff_id and department required' }, { status: 400 })

  const { data: target } = await supabaseAdmin.from('staff_members').select('id, profile_complete').eq('id', staff_id).maybeSingle()
  if (!target) return NextResponse.json({ error: 'Staff member not found' }, { status: 404 })

  const session = getSession(req)
  const allowed = session ? (!!session.adm || session.sid === target.id) : target.profile_complete === false
  if (!allowed) return NextResponse.json({ error: 'You can only update your own details.' }, { status: 403 })

  const { error } = await supabaseAdmin
    .from('staff_members')
    .update({ department: department.trim() })
    .eq('id', staff_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
