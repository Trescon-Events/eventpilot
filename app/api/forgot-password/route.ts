import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import crypto from 'crypto'
import { sendPasswordReset } from '@/app/lib/email'

/* POST /api/forgot-password
   Body: { email }
   Generates a reset token, stores it (expires in 1 hour), sends email with reset link.
   Always returns 200 — never reveals whether email exists.
*/
export async function POST(req: NextRequest) {
  const { email } = await req.json().catch(() => ({}))
  if (!email?.trim()) {
    return NextResponse.json({ error: 'Email is required.' }, { status: 400 })
  }

  const cleanEmail = email.trim().toLowerCase()

  const { data: staff } = await supabaseAdmin
    .from('staff_members')
    .select('id, name, email, access_enabled')
    .eq('email', cleanEmail)
    .single()

  // Always return success — don't reveal whether email exists
  if (!staff || staff.access_enabled === false) {
    return NextResponse.json({ ok: true })
  }

  // Generate a secure token
  const token   = crypto.randomBytes(32).toString('hex')
  const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString() // 1 hour

  await supabaseAdmin
    .from('staff_members')
    .update({ reset_token: token, reset_token_expires: expires })
    .eq('id', staff.id)

  const baseUrl   = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://eventpilot-trescons-projects.vercel.app'
  const resetLink = `${baseUrl}/reset-password?token=${token}`
  const firstName = staff.name?.split(' ')[0] ?? 'there'

  try {
    await sendPasswordReset({ to: staff.email, firstName, resetLink })
  } catch (e) {
    console.error('forgot-password email error:', e)
    // Still return ok — don't block UX on email failure.
  }

  return NextResponse.json({ ok: true })
}
