import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

/*
  POST /api/activity/heartbeat
  Called every 60s by any authenticated page.
  Upserts active_sessions so admins can see who is currently on the platform.
  "Online" = last_seen_at within the last 5 minutes.
*/

export async function POST(req: NextRequest) {
  const raw = req.cookies.get('tcs_session')?.value
  if (!raw) return NextResponse.json({ ok: false }, { status: 401 })

  let staffId: string | null = null
  try {
    const session = JSON.parse(Buffer.from(raw, 'base64').toString('utf-8'))
    staffId = session?.sid ?? null
  } catch {
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  if (!staffId || staffId === 'super-admin') {
    return NextResponse.json({ ok: true }) // super-admin synthetic session — skip
  }

  const ip        = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? req.headers.get('x-real-ip') ?? null
  const userAgent = req.headers.get('user-agent') ?? null

  await supabaseAdmin
    .from('active_sessions')
    .upsert(
      { staff_id: staffId, ip, user_agent: userAgent, last_seen_at: new Date().toISOString() },
      { onConflict: 'staff_id' }
    )

  return NextResponse.json({ ok: true })
}
