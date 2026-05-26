import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import bcrypt from 'bcryptjs'

/* POST /api/reset-password
   Body: { token, new_password }
   Validates token, checks expiry, sets new hash, clears token + must_change_password.
*/
export async function POST(req: NextRequest) {
  const { token, new_password } = await req.json().catch(() => ({}))

  if (!token || !new_password) {
    return NextResponse.json({ error: 'Token and new password are required.' }, { status: 400 })
  }

  if (new_password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 })
  }

  const { data: staff, error } = await supabaseAdmin
    .from('staff_members')
    .select('id, reset_token, reset_token_expires')
    .eq('reset_token', token)
    .single()

  if (error || !staff) {
    return NextResponse.json({ error: 'This reset link is invalid or has already been used.' }, { status: 400 })
  }

  if (!staff.reset_token_expires || new Date(staff.reset_token_expires) < new Date()) {
    return NextResponse.json({ error: 'This reset link has expired. Request a new one.' }, { status: 400 })
  }

  const newHash = await bcrypt.hash(new_password, 10)

  const { error: updateErr } = await supabaseAdmin
    .from('staff_members')
    .update({
      password_hash:        newHash,
      must_change_password: false,
      reset_token:          null,
      reset_token_expires:  null,
    })
    .eq('id', staff.id)

  if (updateErr) {
    return NextResponse.json({ error: 'Failed to update password.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

/* GET /api/reset-password?token=... — validate token before showing the form */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
  if (!token) return NextResponse.json({ valid: false, error: 'No token provided.' })

  const { data: staff } = await supabaseAdmin
    .from('staff_members')
    .select('id, name, reset_token_expires')
    .eq('reset_token', token)
    .single()

  if (!staff) return NextResponse.json({ valid: false, error: 'Invalid or already used link.' })

  if (!staff.reset_token_expires || new Date(staff.reset_token_expires) < new Date()) {
    return NextResponse.json({ valid: false, error: 'This link has expired. Request a new one.' })
  }

  return NextResponse.json({ valid: true, name: staff.name?.split(' ')[0] ?? '' })
}
