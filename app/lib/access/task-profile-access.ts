import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'

/* Who may write a staff member's AI-readiness task profile (2026-09-25).

   The /api/task-profiles routes are on the middleware's public list because
   staff can arrive at /profile before a session exists (first-time setup), so
   the routes themselves must decide. Rules:
     - with a session: only the person's OWN profile (or an admin);
     - with NO session: only a FIRST submission — an anonymous caller can never
       overwrite a profile that already exists.
   Residual risk: anyone who knows a staff member's UUID could submit that
   person's first profile. UUIDs aren't guessable and the impact is a
   self-assessment form, but the real fix is to require a session here. */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const bad = () => NextResponse.json({ error: 'Missing data. Please try again.' }, { status: 400 })

/** Returns a 4xx response if the caller may not submit this staff member's profile, else null. */
export async function checkProfileSubmitAccess(req: NextRequest, staffId: unknown): Promise<NextResponse | null> {
  if (typeof staffId !== 'string' || !UUID.test(staffId)) return bad()
  const session = getSession(req)
  if (session) {
    return session.adm || session.sid === staffId ? null : NextResponse.json({ error: 'You can only update your own profile.' }, { status: 403 })
  }
  const { data: existing } = await supabaseAdmin.from('staff_task_profiles').select('staff_id').eq('staff_id', staffId).maybeSingle()
  return existing ? NextResponse.json({ error: 'Please sign in to update an existing profile.' }, { status: 403 }) : null
}

/** mark-complete is a retry of the final step, so a profile must already exist for that person. */
export async function checkMarkCompleteAccess(req: NextRequest, staffId: unknown): Promise<NextResponse | null> {
  if (typeof staffId !== 'string' || !UUID.test(staffId)) return bad()
  const session = getSession(req)
  if (session && !session.adm && session.sid !== staffId) {
    return NextResponse.json({ error: 'You can only update your own profile.' }, { status: 403 })
  }
  const { data: existing } = await supabaseAdmin.from('staff_task_profiles').select('staff_id').eq('staff_id', staffId).maybeSingle()
  return existing ? null : NextResponse.json({ error: 'No submitted profile found.' }, { status: 404 })
}
