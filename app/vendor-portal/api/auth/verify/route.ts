import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { supabaseAdmin } from '@/app/lib/supabase'
import { hashOtp } from '@/app/lib/ops/vendor-auth/crypto'
import { publicPreflight } from '@/app/lib/ops/vendor-auth/preflight'
import { recordAuthEvent } from '@/app/lib/ops/vendor-auth/throttle'
import { createVendorSession, setVendorCookie } from '@/app/lib/ops/vendor-auth/session'
import { vpError } from '@/app/lib/ops/vendor-auth/support'

/* POST /vendor-portal/api/auth/verify   Body: { challenge, code }
   Step 2 of 2: the emailed one-time code. Each code allows 5 attempts and
   expires after 10 minutes; a used or expired code is dead. No captcha
   here — the challenge only exists because password + captcha already
   passed — but the per-IP limit still applies. */

export const runtime = 'nodejs'
const MAX_ATTEMPTS = 5
const BAD_CODE = 'That code is not valid or has expired. Please sign in again.'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as { challenge?: unknown; code?: unknown } | null
  const pre = await publicPreflight(req, { requireCaptcha: false })
  if ('error' in pre) return pre.error
  const { ip } = pre

  const challenge = typeof body?.challenge === 'string' && /^[0-9a-f-]{36}$/i.test(body.challenge) ? body.challenge : null
  const code = typeof body?.code === 'string' && /^\d{6}$/.test(body.code.trim()) ? body.code.trim() : null
  if (!challenge || !code) return vpError(401, BAD_CODE)

  const { data: otp } = await supabaseAdmin.from('ops_vendor_otps')
    .select('id, user_id, code_hash, expires_at, attempts, used_at').eq('id', challenge).maybeSingle()
  if (!otp || otp.used_at || new Date(otp.expires_at).getTime() <= Date.now() || otp.attempts >= MAX_ATTEMPTS) {
    await recordAuthEvent({ email: null, ip, kind: 'otp', success: false, reason: 'invalid_challenge' })
    return vpError(401, BAD_CODE)
  }

  // Count this attempt first, conditional on the value we read, so parallel
  // guesses can't get more than MAX_ATTEMPTS tries.
  const { data: counted } = await supabaseAdmin.from('ops_vendor_otps')
    .update({ attempts: otp.attempts + 1 }).eq('id', otp.id).eq('attempts', otp.attempts).select('id')
  if (!counted?.length) return vpError(401, BAD_CODE)

  const expected = Buffer.from(otp.code_hash, 'hex')
  const provided = Buffer.from(hashOtp(otp.user_id, code), 'hex')
  const match = expected.length === provided.length && timingSafeEqual(expected, provided)

  const { data: user } = await supabaseAdmin.from('ops_vendor_users').select('id, email, status').eq('id', otp.user_id).maybeSingle()

  if (!match || !user || user.status !== 'active') {
    await recordAuthEvent({ email: user?.email ?? null, ip, kind: 'otp', success: false, reason: match ? 'inactive' : 'bad_code' })
    if (otp.attempts + 1 >= MAX_ATTEMPTS) await supabaseAdmin.from('ops_vendor_otps').update({ used_at: new Date().toISOString() }).eq('id', otp.id)
    return vpError(401, BAD_CODE)
  }

  // Single use: only the request that flips used_at from null proceeds.
  const { data: consumed } = await supabaseAdmin.from('ops_vendor_otps')
    .update({ used_at: new Date().toISOString() }).eq('id', otp.id).is('used_at', null).select('id')
  if (!consumed?.length) return vpError(401, BAD_CODE)

  const { token, maxAgeSeconds } = await createVendorSession(user.id, ip, req.headers.get('user-agent'))
  await supabaseAdmin.from('ops_vendor_users').update({ last_login_at: new Date().toISOString(), failed_attempts: 0, locked_until: null }).eq('id', user.id)
  await recordAuthEvent({ email: user.email, ip, kind: 'otp', success: true })

  const res = NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } })
  setVendorCookie(res, token, maxAgeSeconds)
  return res
}
