import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import bcrypt from 'bcryptjs'

const ADMIN_CODE = process.env.NEXT_PUBLIC_ADMIN_CODE ?? 'taos2026'

/* POST /api/admin/set-password
   Body: { admin_code, email, password }
   Admin-only: set or reset a staff member's password directly by email.
*/
export async function POST(req: NextRequest) {
  const { admin_code, email, password } = await req.json().catch(() => ({}))

  if (admin_code !== ADMIN_CODE) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!email || !password) {
    return NextResponse.json({ error: 'email and password required' }, { status: 400 })
  }

  if (password.length < 6) {
    return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 })
  }

  const { data: staff, error } = await supabaseAdmin
    .from('staff_members')
    .select('id, name, email')
    .eq('email', email.trim().toLowerCase())
    .single()

  if (error || !staff) {
    return NextResponse.json({ error: `No staff found for ${email}` }, { status: 404 })
  }

  const hash = await bcrypt.hash(password, 10)

  const { error: updateErr } = await supabaseAdmin
    .from('staff_members')
    .update({ password_hash: hash, must_change_password: false })
    .eq('id', staff.id)

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, name: staff.name, email: staff.email })
}
