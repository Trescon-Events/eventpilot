import { supabaseAdmin } from '@/app/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'
import { checkMarkCompleteAccess } from '@/app/lib/access/task-profile-access'

/* POST /api/task-profiles/mark-complete
   Retry-only endpoint: sets profile_complete = true for a staff member.
   Called by the profile page if the main submit succeeded but the flag update failed. */
export async function POST(req: NextRequest) {
  try {
    const { staff_id } = await req.json()
    if (!staff_id) return NextResponse.json({ error: 'staff_id required' }, { status: 400 })
    // 2026-09-25: this route is publicly reachable (pre-session profile setup), so it
    // checks for itself — see app/lib/access/task-profile-access.ts.
    const denied = await checkMarkCompleteAccess(req, staff_id)
    if (denied) return denied

    const { error } = await supabaseAdmin
      .from('staff_members')
      .update({ profile_complete: true })
      .eq('id', staff_id)

    if (error) {
      console.error('mark-complete error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('POST /api/task-profiles/mark-complete error:', e)
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 })
  }
}
