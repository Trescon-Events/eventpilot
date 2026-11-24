import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { requireAdmin } from '@/app/lib/access/require-admin'
import { decryptToken } from '@/app/lib/security/token-crypto'

/* GET    /api/admin/youtube/connections — connected channels + which events use each (no tokens).
   DELETE /api/admin/youtube/connections?id=X — revoke at Google and remove; events using it lose their upload channel. */

export async function GET(req: NextRequest) {
  const denied = requireAdmin(req); if (denied) return denied
  const { data: conns, error } = await supabaseAdmin
    .from('youtube_connections')
    .select('id, channel_id, channel_title, channel_handle, channel_thumbnail_url, google_email, status, connected_at')
    .order('channel_title')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const { data: links } = await supabaseAdmin.from('event_youtube_channel').select('connection_id, events(id, name)')
  const byConn = new Map<string, { id: string; name: string }[]>()
  for (const l of links ?? []) {
    const ev = Array.isArray(l.events) ? l.events[0] : l.events
    if (!ev) continue
    byConn.set(l.connection_id, [...(byConn.get(l.connection_id) ?? []), ev as { id: string; name: string }])
  }
  return NextResponse.json({ connections: (conns ?? []).map(c => ({ ...c, events: byConn.get(c.id) ?? [] })) })
}

export async function DELETE(req: NextRequest) {
  const denied = requireAdmin(req); if (denied) return denied
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const { data } = await supabaseAdmin.from('youtube_connections').select('encrypted_refresh_token').eq('id', id).maybeSingle()
  if (data?.encrypted_refresh_token) {
    try { await fetch('https://oauth2.googleapis.com/revoke', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token: decryptToken(data.encrypted_refresh_token) }) }) } catch { /* best effort */ }
  }
  const { error } = await supabaseAdmin.from('youtube_connections').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
