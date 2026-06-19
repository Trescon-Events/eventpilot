import { supabaseAdmin } from '@/app/lib/supabase'
import { NextResponse } from 'next/server'

/* POST /api/task-profiles/mark-complete
   Retry-only endpoint: sets profile_complete = true for a staff member.
   Called by the profile page if the main submit succeeded but the flag update failed. */
export async function POST(req: Request) {
  try {
    const { staff_id } = await req.json()
    if (!staff_id) return NextResponse.json({ error: 'staff_id required' }, { status: 400 })

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
