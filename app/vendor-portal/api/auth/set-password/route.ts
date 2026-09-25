import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { sha256Hex } from '@/app/lib/ops/vendor-auth/crypto'
import { hashPassword, validateNewPassword } from '@/app/lib/ops/vendor-auth/password'
import { publicPreflight } from '@/app/lib/ops/vendor-auth/preflight'
import { recordAuthEvent } from '@/app/lib/ops/vendor-auth/throttle'
import { revokeAllSessionsForUser } from '@/app/lib/ops/vendor-auth/session'
import { vpError } from '@/app/lib/ops/vendor-auth/support'

/* GET  /vendor-portal/api/auth/set-password?token=…   → { valid, email?, purpose? }
   POST /vendor-portal/api/auth/set-password            Body: { token, password, captcha }

   The invite link (first login) and the reset link both land here. The
   vendor chooses their own password — ops never sees or sets it. A link is
   single-use and expires; using it activates an invited account, clears any
   lockout, and REVOKES every existing session for that user. It does not
   sign the user in: they still go through login + the emailed code. */

export const runtime = 'nodejs'
const BAD_LINK = 'This link is not valid or has expired. Please ask the Trescon Ops team for a new one.'

async function findUsableToken(raw: unknown) {
  if (typeof raw !== 'string' || raw.length < 20 || raw.length > 200) return null
  const { data } = await supabaseAdmin.from('ops_vendor_tokens')
    .select('id, user_id, purpose, expires_at, used_at, ops_vendor_users(id, email, status)')
    .eq('token_hash', sha256Hex(raw)).maybeSingle()
  if (!data || data.used_at || new Date(data.expires_at).getTime() <= Date.now()) return null
  const user = Array.isArray(data.ops_vendor_users) ? data.ops_vendor_users[0] : data.ops_vendor_users
  if (!user || user.status === 'disabled') return null
  return { tokenId: data.id, purpose: data.purpose as 'invite' | 'reset', user }
}

export async function GET(req: NextRequest) {
  const found = await findUsableToken(req.nextUrl.searchParams.get('token'))
  return NextResponse.json(found ? { valid: true, email: found.user.email, purpose: found.purpose } : { valid: false }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as { token?: unknown; password?: unknown; captcha?: unknown } | null
  const pre = await publicPreflight(req, { captchaToken: body?.captcha, requireCaptcha: true })
  if ('error' in pre) return pre.error
  const { ip } = pre

  const found = await findUsableToken(body?.token)
  if (!found) {
    await recordAuthEvent({ email: null, ip, kind: 'set_password', success: false, reason: 'bad_token' })
    return vpError(400, BAD_LINK)
  }

  const password = typeof body?.password === 'string' ? body.password : ''
  const problem = validateNewPassword(password, found.user.email)
  if (problem) return vpError(400, problem)

  // Single use: only the request that flips used_at from null proceeds.
  const { data: consumed } = await supabaseAdmin.from('ops_vendor_tokens')
    .update({ used_at: new Date().toISOString() }).eq('id', found.tokenId).is('used_at', null).select('id')
  if (!consumed?.length) return vpError(400, BAD_LINK)

  const { error } = await supabaseAdmin.from('ops_vendor_users').update({
    password_hash: await hashPassword(password), status: 'active', failed_attempts: 0, locked_until: null, updated_at: new Date().toISOString(),
  }).eq('id', found.user.id)
  if (error) return vpError(500, 'We could not save your password.')

  await supabaseAdmin.from('ops_vendor_tokens').update({ used_at: new Date().toISOString() }).eq('user_id', found.user.id).is('used_at', null)
  await revokeAllSessionsForUser(found.user.id)
  await recordAuthEvent({ email: found.user.email, ip, kind: 'set_password', success: true })
  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } })
}
