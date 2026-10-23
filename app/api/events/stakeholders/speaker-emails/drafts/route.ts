import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { requireGuestInviteAccess } from '@/app/lib/guest-invites/access'

/* A producer's unsent work — private to its author. GET ?event_id= lists yours; POST saves (creates or updates by id); DELETE ?event_id=&id= removes one. */
const owner = (req: NextRequest) => getSession(req)?.sid ?? null

export async function GET(req: NextRequest) {
  const eventId = req.nextUrl.searchParams.get('event_id'), me = owner(req)
  if (!eventId || !me) return NextResponse.json({ error: 'event_id is required' }, { status: 400 })
  const denied = await requireGuestInviteAccess(req, eventId, 'edit'); if (denied) return denied
  const { data } = await supabaseAdmin.from('speaker_email_drafts').select('id, title, recipient_speaker_ids, body_html, attachments, updated_at').eq('event_id', eventId).eq('owner', me).order('updated_at', { ascending: false })
  return NextResponse.json({ drafts: data ?? [] })
}

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => null) as { event_id?: string; id?: string; title?: string; recipient_speaker_ids?: string[]; body_html?: string; attachments?: unknown[] } | null
  const me = owner(req)
  if (!b?.event_id || !me) return NextResponse.json({ error: 'event_id is required' }, { status: 400 })
  const denied = await requireGuestInviteAccess(req, b.event_id, 'edit'); if (denied) return denied
  const row = { title: (b.title ?? '').slice(0, 120), recipient_speaker_ids: Array.isArray(b.recipient_speaker_ids) ? b.recipient_speaker_ids.slice(0, 500) : [], body_html: (b.body_html ?? '').slice(0, 60_000), attachments: Array.isArray(b.attachments) ? b.attachments.slice(0, 10) : [], updated_at: new Date().toISOString() }
  if (b.id) {
    const { data, error } = await supabaseAdmin.from('speaker_email_drafts').update(row).eq('id', b.id).eq('event_id', b.event_id).eq('owner', me).select('id').maybeSingle()
    if (error || !data) return NextResponse.json({ error: 'Could not save the draft.' }, { status: 404 })
    return NextResponse.json({ id: data.id })
  }
  const { data, error } = await supabaseAdmin.from('speaker_email_drafts').insert({ ...row, event_id: b.event_id, owner: me }).select('id').single()
  if (error || !data) return NextResponse.json({ error: 'Could not save the draft.' }, { status: 500 })
  return NextResponse.json({ id: data.id })
}

export async function DELETE(req: NextRequest) {
  const eventId = req.nextUrl.searchParams.get('event_id'), id = req.nextUrl.searchParams.get('id'), me = owner(req)
  if (!eventId || !id || !me) return NextResponse.json({ error: 'event_id and id are required' }, { status: 400 })
  const denied = await requireGuestInviteAccess(req, eventId, 'edit'); if (denied) return denied
  await supabaseAdmin.from('speaker_email_drafts').delete().eq('id', id).eq('event_id', eventId).eq('owner', me)
  return NextResponse.json({ ok: true })
}
