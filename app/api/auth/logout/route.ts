import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { sessionCookieOptions } from '@/app/lib/access/session-cookie'

export async function POST(req: NextRequest) {
  // Clear active session record so admin Live Now panel updates immediately
  const raw = req.cookies.get('tcs_session')?.value
  if (raw) {
    try {
      const session = JSON.parse(Buffer.from(raw, 'base64').toString('utf-8'))
      if (session?.sid && session.sid !== 'super-admin') {
        supabaseAdmin.from('active_sessions').delete().eq('staff_id', session.sid)
      }
    } catch { /* ignore */ }
  }

  const res = NextResponse.json({ success: true })
  res.cookies.set('tcs_session', '', sessionCookieOptions(0))
  return res
}
