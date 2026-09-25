import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { verifyPassword } from '@/app/lib/ops/vendor-auth/password'
import { newOtpCode, hashOtp } from '@/app/lib/ops/vendor-auth/crypto'
import { publicPreflight, normalizeEmail } from '@/app/lib/ops/vendor-auth/preflight'
import { recordAuthEvent, recentFailuresForEmail, LOCKOUT_WINDOW_MS, MAX_FAILED_PER_EMAIL } from '@/app/lib/ops/vendor-auth/throttle'
import { vpError } from '@/app/lib/ops/vendor-auth/support'
import { sendVendorOtp } from '@/app/lib/ops/vendor-auth/mail'

/* POST /vendor-portal/api/auth/login   Body: { email, password, captcha }
   Step 1 of 2: password + captcha. On success an emailed one-time code is
   created and a `challenge` id returned; /verify completes the sign-in.

   Every failure — unknown email, wrong password, disabled or locked
   account, account still awaiting its invite — returns the SAME message
   and status, and a password comparison always runs, so neither the
   response nor its timing reveals whether an email has an account. */

export const runtime = 'nodejs'
const OTP_TTL_MS = 10 * 60 * 1000
const MAX_OTPS_PER_HOUR = 5
const GENERIC_FAIL = 'Sign-in failed. Please check your email and password and try again.'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as { email?: unknown; password?: unknown; captcha?: unknown } | null
  const pre = await publicPreflight(req, { captchaToken: body?.captcha, requireCaptcha: true })
  if ('error' in pre) return pre.error
  const { ip } = pre

  const email = normalizeEmail(body?.email)
  const password = typeof body?.password === 'string' && body.password.length <= 128 ? body.password : ''
  if (!email || !password) return vpError(401, GENERIC_FAIL)

  const { data: user } = await supabaseAdmin
    .from('ops_vendor_users')
    .select('id, name, email, password_hash, status, failed_attempts, locked_until')
    .eq('email', email)
    .maybeSingle()

  // Always run the comparison (against a dummy hash when there's no account).
  const passwordOk = await verifyPassword(user?.password_hash ?? null, password)
  const locked = !!user?.locked_until && new Date(user.locked_until).getTime() > Date.now()
  const success = !!user && passwordOk && user.status === 'active' && !locked

  if (!success) {
    await recordAuthEvent({ email, ip, kind: 'login', success: false, reason: !user ? 'unknown' : locked ? 'locked' : user.status !== 'active' ? user.status : 'bad_password' })
    if (user && !locked && (await recentFailuresForEmail(email)) >= MAX_FAILED_PER_EMAIL) {
      await supabaseAdmin.from('ops_vendor_users')
        .update({ locked_until: new Date(Date.now() + LOCKOUT_WINDOW_MS).toISOString(), failed_attempts: 0 }).eq('id', user.id)
    } else if (user && passwordOk === false) {
      await supabaseAdmin.from('ops_vendor_users').update({ failed_attempts: user.failed_attempts + 1 }).eq('id', user.id)
    }
    return vpError(401, GENERIC_FAIL)
  }

  // Too many codes requested recently → stop emailing (protects the inbox and the mail quota).
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const { count: recentOtps } = await supabaseAdmin.from('ops_vendor_otps').select('*', { count: 'exact', head: true }).eq('user_id', user.id).gte('created_at', hourAgo)
  if ((recentOtps ?? 0) >= MAX_OTPS_PER_HOUR) {
    await recordAuthEvent({ email, ip, kind: 'login', success: false, reason: 'otp_rate' })
    return vpError(429, 'Too many sign-in codes were requested. Please wait a while and try again.')
  }

  // Only the newest code is ever valid.
  await supabaseAdmin.from('ops_vendor_otps').update({ used_at: new Date().toISOString() }).eq('user_id', user.id).is('used_at', null)

  const code = newOtpCode()
  const { data: otp, error } = await supabaseAdmin.from('ops_vendor_otps')
    .insert({ user_id: user.id, code_hash: hashOtp(user.id, code), expires_at: new Date(Date.now() + OTP_TTL_MS).toISOString(), ip })
    .select('id').single()
  if (error || !otp) return vpError(500, 'Something went wrong while signing you in.')

  try {
    await sendVendorOtp({ to: user.email, name: user.name, code })
  } catch (e) {
    console.error('[vendor-auth] OTP email failed:', e instanceof Error ? e.message : e)
    return vpError(500, 'We could not send your sign-in code.')
  }

  await recordAuthEvent({ email, ip, kind: 'login', success: true, reason: 'password_ok' })
  return NextResponse.json({ challenge: otp.id }, { headers: { 'Cache-Control': 'no-store' } })
}
