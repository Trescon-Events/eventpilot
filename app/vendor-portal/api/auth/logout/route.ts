import { NextRequest, NextResponse } from 'next/server'
import { getVendorSession, revokeSession, clearVendorCookie } from '@/app/lib/ops/vendor-auth/session'
import { isSameOrigin, vpError } from '@/app/lib/ops/vendor-auth/support'

/* POST /vendor-portal/api/auth/logout — revokes the server-side session
   (not just the cookie) so a copied cookie stops working too. */
export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return vpError(403, 'This request could not be verified.')
  const session = await getVendorSession(req)
  if (session) await revokeSession(session.sessionId)
  const res = NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } })
  clearVendorCookie(res)
  return res
}
