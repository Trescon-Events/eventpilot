import { NextRequest, NextResponse, after } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { newToken, sha256Hex } from '@/app/lib/ops/vendor-auth/crypto'
import { publicPreflight, normalizeEmail } from '@/app/lib/ops/vendor-auth/preflight'
import { recordAuthEvent, recentForgotCount } from '@/app/lib/ops/vendor-auth/throttle'
import { sendVendorReset, PORTAL_URL } from '@/app/lib/ops/vendor-auth/mail'

/* POST /vendor-portal/api/auth/forgot   Body: { email, captcha }
   Self-service password reset. ALWAYS answers the same way — and at the
   same speed — whether or not the email has an account (no enumeration):
   all the real work happens in after(), once the response is already on its
   way. When an account exists, a single-use 1-hour link goes to that
   address only. Max 3 requests per email per hour. */

export const runtime = 'nodejs'
const RESET_HOURS = 1
const SAME_ANSWER = { ok: true, message: 'If that email has a Vendor Portal account, a reset link is on its way.' }

async function processRequest(email: string, ip: string): Promise<void> {
  await recordAuthEvent({ email, ip, kind: 'forgot', success: true })
  if ((await recentForgotCount(email)) > 3) return

  const { data: user } = await supabaseAdmin.from('ops_vendor_users').select('id, name, email, status').eq('email', email).maybeSingle()
  if (!user || user.status === 'disabled') return

  // Only the newest link works.
  await supabaseAdmin.from('ops_vendor_tokens').update({ used_at: new Date().toISOString() }).eq('user_id', user.id).is('used_at', null)
  const token = newToken()
  const { error } = await supabaseAdmin.from('ops_vendor_tokens').insert({
    user_id: user.id, purpose: user.status === 'invited' ? 'invite' : 'reset', token_hash: sha256Hex(token),
    expires_at: new Date(Date.now() + RESET_HOURS * 3600_000).toISOString(),
  })
  if (error) return
  try { await sendVendorReset({ to: user.email, name: user.name, link: `${PORTAL_URL}/set-password?token=${token}`, hours: RESET_HOURS }) }
  catch (e) { console.error('[vendor-auth] reset email failed:', e instanceof Error ? e.message : e) }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as { email?: unknown; captcha?: unknown } | null
  const pre = await publicPreflight(req, { captchaToken: body?.captcha, requireCaptcha: true })
  if ('error' in pre) return pre.error

  const email = normalizeEmail(body?.email)
  if (email) after(() => processRequest(email, pre.ip))
  return NextResponse.json(SAME_ANSWER, { headers: { 'Cache-Control': 'no-store' } })
}
