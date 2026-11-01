import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { linkByToken } from '@/app/lib/screens/service'

/* The AV team's "I have deleted it": POST {session_id} forgets this link's download of a session that is no longer on it (moved to another stage, or without speakers), which clears its
   REMOVED notice. Only this link's own record is touched, and only for a session that is really gone from its list. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const link = await linkByToken((await params).token)
  if (!link) return NextResponse.json({ error: 'Not found.' }, { status: 404 })
  const b = await req.json().catch(() => ({})) as { session_id?: string }
  if (!UUID.test(b.session_id ?? '')) return NextResponse.json({ error: 'session_id required' }, { status: 400 })
  const { avView } = await import('@/app/lib/screens/av')
  const view = await avView(link)
  if (!view.removed.some(r => r.id === b.session_id)) return NextResponse.json({ error: 'That session is still on this link.' }, { status: 409 })
  await supabaseAdmin.from('event_screen_link_downloads').delete().eq('link_id', link.id).eq('session_id', b.session_id!)
  return NextResponse.json({ ok: true })
}
