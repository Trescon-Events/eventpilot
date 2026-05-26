import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import bcrypt from 'bcryptjs'

/* POST /api/change-password
   Body: { staff_id, current_password, new_password }
   Verifies current password, sets new bcrypt hash, clears must_change_password flag.
*/
export async function POST(req: NextRequest) {
  const { staff_id, current_password, new_password } = await req.json().catch(() => ({}))

  if (!staff_id || !current_password || !new_password) {
    return NextResponse.json({ error: 'All fields are required.' }, { status: 400 })
  }

  if (new_password.length < 8) {
    return NextResponse.json({ error: 'New password must be at least 8 characters.' }, { status: 400 })
  }

  const { data: staff, error } = await supabaseAdmin
    .from('staff_members')
    .select('id, password_hash')
    .eq('id', staff_id)
    .single()

  if (error || !staff) {
    return NextResponse.json({ error: 'Staff member not found.' }, { status: 404 })
  }

  // Verify current password
  const staffDefaultPass = process.env.STAFF_DEFAULT_PASSWORD ?? 'trescon@2026'
  let valid = false
  if (staff.password_hash) {
    valid = await bcrypt.compare(current_password, staff.password_hash)
  } else {
    valid = current_password === staffDefaultPass
  }

  if (!valid) {
    return NextResponse.json({ error: 'Current password is incorrect.' }, { status: 401 })
  }

  const newHash = await bcrypt.hash(new_password, 10)

  const { error: updateErr } = await supabaseAdmin
    .from('staff_members')
    .update({ password_hash: newHash, must_change_password: false })
    .eq('id', staff_id)

  if (updateErr) {
    return NextResponse.json({ error: 'Failed to update password.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
