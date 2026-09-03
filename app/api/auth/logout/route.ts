import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { sessionCookieOptions } from '@/app/lib/access/session-cookie'
import { decodeSession } from '@/app/lib/access/session'

export async function POST(req: NextRequest) {
  // Clear active session record so admin Live Now panel updates immediately
  const session = decodeSession(req.cookies.get('tcs_session')?.value)
  if (session?.sid && session.sid !== 'super-admin') {
    supabaseAdmin.from('active_sessions').delete().eq('staff_id', session.sid)
  }

  const res = NextResponse.json({ success: true })
  res.cookies.set('tcs_session', '', sessionCookieOptions(0))
  return res
}
