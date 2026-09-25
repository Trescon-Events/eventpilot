import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { newToken, sha256Hex } from './crypto'
import { VENDOR_TERMS_VERSION } from './terms'

/* Vendor-portal sessions — completely separate from staff auth.

   - Cookie `vp_session` is scoped to Path=/vendor-portal, so the BROWSER
     never sends it to /admin or /api/* at all (the vendor portal's own API
     lives under /vendor-portal/api for exactly this reason).
   - The cookie value is a random opaque token; only its SHA-256 is stored
     server-side, so sessions can be revoked instantly (password reset,
     account disabled) and a database read yields no usable token.
   - 30-minute idle timeout, 8-hour absolute cap, no "remember me". */

export const VP_COOKIE = 'vp_session'
export const VP_COOKIE_PATH = '/vendor-portal'
const IDLE_MS = 30 * 60 * 1000
const ABSOLUTE_MS = 8 * 60 * 60 * 1000
const TOUCH_INTERVAL_MS = 60 * 1000

export type VendorSession = {
  sessionId: string
  userId: string
  name: string
  email: string
  vendorId: string
  vendorName: string
  /** Has this user accepted the CURRENT data-handling terms? (guard.ts blocks everything else until they have) */
  termsAccepted: boolean
}

export async function createVendorSession(userId: string, ip: string, userAgent: string | null): Promise<{ token: string; maxAgeSeconds: number }> {
  const token = newToken()
  const { error } = await supabaseAdmin.from('ops_vendor_sessions').insert({
    user_id: userId, token_hash: sha256Hex(token), ip, user_agent: userAgent?.slice(0, 300) ?? null,
    expires_at: new Date(Date.now() + ABSOLUTE_MS).toISOString(),
  })
  if (error) throw new Error(`Could not create session: ${error.message}`)
  return { token, maxAgeSeconds: ABSOLUTE_MS / 1000 }
}

export function setVendorCookie(res: NextResponse, token: string, maxAgeSeconds: number): void {
  res.cookies.set({
    name: VP_COOKIE, value: token, httpOnly: true, sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production', path: VP_COOKIE_PATH, maxAge: maxAgeSeconds,
  })
}

export function clearVendorCookie(res: NextResponse): void {
  res.cookies.set({ name: VP_COOKIE, value: '', httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production', path: VP_COOKIE_PATH, maxAge: 0 })
}

/** The vendor session for this request, or null. Never throws for a bad/missing cookie. */
export async function getVendorSession(req: NextRequest): Promise<VendorSession | null> {
  const token = req.cookies.get(VP_COOKIE)?.value
  if (!token || token.length > 200) return null

  const { data: row } = await supabaseAdmin
    .from('ops_vendor_sessions')
    .select('id, user_id, last_seen_at, expires_at, revoked_at, ops_vendor_users(name, email, status, vendor_id, ops_vendors(name, active))')
    .eq('token_hash', sha256Hex(token))
    .maybeSingle()
  if (!row || row.revoked_at) return null

  const now = Date.now()
  if (new Date(row.expires_at).getTime() <= now || new Date(row.last_seen_at).getTime() + IDLE_MS <= now) {
    await supabaseAdmin.from('ops_vendor_sessions').update({ revoked_at: new Date().toISOString() }).eq('id', row.id)
    return null
  }

  const user = Array.isArray(row.ops_vendor_users) ? row.ops_vendor_users[0] : row.ops_vendor_users
  const vendor = user && (Array.isArray(user.ops_vendors) ? user.ops_vendors[0] : user.ops_vendors)
  // A disabled account or deactivated vendor loses access immediately, even
  // with an otherwise-valid session.
  if (!user || user.status !== 'active' || !vendor?.active) return null

  if (new Date(row.last_seen_at).getTime() + TOUCH_INTERVAL_MS <= now) {
    await supabaseAdmin.from('ops_vendor_sessions').update({ last_seen_at: new Date().toISOString() }).eq('id', row.id)
  }
  const { data: accepted } = await supabaseAdmin.from('ops_vendor_terms_acceptances').select('id')
    .eq('vendor_user_id', row.user_id).eq('terms_version', VENDOR_TERMS_VERSION).maybeSingle()
  return { sessionId: row.id, userId: row.user_id, name: user.name, email: user.email, vendorId: user.vendor_id, vendorName: vendor.name, termsAccepted: !!accepted }
}

export async function revokeSession(sessionId: string): Promise<void> {
  await supabaseAdmin.from('ops_vendor_sessions').update({ revoked_at: new Date().toISOString() }).eq('id', sessionId)
}

/** Kill every live session for a user (password reset, disable, unassign). */
export async function revokeAllSessionsForUser(userId: string): Promise<void> {
  await supabaseAdmin.from('ops_vendor_sessions').update({ revoked_at: new Date().toISOString() }).eq('user_id', userId).is('revoked_at', null)
}
