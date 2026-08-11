/**
 * GET /api/me — current session identity for client-side authorisation
 * decisions (e.g. creator-only affordances on Tasks tab).
 *
 * Returns { sid, adm } from the httpOnly tcs_session cookie, or 401 if
 * not signed in. Nothing sensitive — sid is the staff_members.id UUID,
 * adm is the super-admin boolean. Called from the Bespoke [id] page to
 * decide whether to render Edit/Delete icons on task rows (Nic e606f19c).
 */
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/app/lib/access/session'

export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'not signed in' }, { status: 401 })
  return NextResponse.json({ sid: session.sid, adm: !!session.adm })
}
