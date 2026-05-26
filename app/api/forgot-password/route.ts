import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import nodemailer from 'nodemailer'
import crypto from 'crypto'

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

  const baseUrl   = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://taos-discovery.vercel.app'
  const resetLink = `${baseUrl}/reset-password?token=${token}`
  const firstName = staff.name?.split(' ')[0] ?? 'there'

  // Send email via Gmail
  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,
      },
    })

    await transporter.sendMail({
      from:    `"Trescademy" <${process.env.GMAIL_USER}>`,
      to:      staff.email,
      subject: 'Reset your Trescademy password',
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px;">
          <div style="margin-bottom: 28px;">
            <span style="font-size: 20px; font-weight: 800; color: #00A5A3;">Trescademy</span>
          </div>
          <h2 style="font-size: 22px; font-weight: 800; color: #080A0B; margin: 0 0 12px;">Reset your password</h2>
          <p style="color: #5B7080; font-size: 15px; line-height: 1.6; margin: 0 0 24px;">
            Hi ${firstName}, we received a request to reset your Trescademy password. Click the button below to set a new one.
          </p>
          <a href="${resetLink}"
            style="display: inline-block; background: #00A5A3; color: #ffffff; font-weight: 700; font-size: 15px; padding: 13px 28px; border-radius: 10px; text-decoration: none; margin-bottom: 24px;">
            Reset Password
          </a>
          <p style="color: #94A3B8; font-size: 13px; line-height: 1.5; margin: 0;">
            This link expires in <strong>1 hour</strong>. If you didn't request this, you can ignore this email — your password won't change.
          </p>
          <hr style="border: none; border-top: 1px solid #E8EEF4; margin: 28px 0;" />
          <p style="color: #94A3B8; font-size: 12px; margin: 0;">Trescon Global · Trescademy Platform</p>
        </div>
      `,
    })
  } catch (e) {
    console.error('forgot-password email error:', e)
    // Still return ok — don't block UX on email failure. Log the error server-side.
  }

  return NextResponse.json({ ok: true })
}
