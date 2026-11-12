import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'
import { cleanBodyHtml } from '@/app/lib/speaker-emails/render'

/* POST /api/events/stakeholders/email-campaigns/draft — saves an email that is still being written (autosave). Body: { id?, event_id, name?, subject?, body_html?, list_id?, template_id?,
   field_values?, attachments?, sender_mode?, polished?, original_html?, draft_state? }. Creates the draft, or updates the one given by id. A draft sends nothing and has no recipients;
   it becomes a real email only when it is sent or scheduled from Compose (the draft is then removed). Returns { id }. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  const b = await req.json().catch(() => null) as Record<string, unknown> | null
  const eventId = typeof b?.event_id === 'string' ? b.event_id : ''
  if (!UUID.test(eventId)) return NextResponse.json({ error: 'event_id required' }, { status: 400 })
  if (!session.adm && !(await hasEventPermission(session.sid, eventId, 'sae.stakeholders.edit'))) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '')
  const row = {
    event_id: eventId, name: str(b?.name, 200).trim() || 'Untitled email', subject: str(b?.subject, 200).replace(/[\r\n]+/g, ' '), body_html: cleanBodyHtml(str(b?.body_html, 80_000)),
    list_id: typeof b?.list_id === 'string' && UUID.test(b.list_id) ? b.list_id : null, template_id: typeof b?.template_id === 'string' && UUID.test(b.template_id) ? b.template_id : null,
    field_values: b?.field_values && typeof b.field_values === 'object' ? b.field_values : {}, attachments: Array.isArray(b?.attachments) ? b.attachments : [],
    sender_mode: b?.sender_mode === 'speaker_producer' ? 'speaker_producer' : 'me', polished: !!b?.polished, original_html: typeof b?.original_html === 'string' ? b.original_html : null,
    draft_state: b?.draft_state && typeof b.draft_state === 'object' ? b.draft_state : {}, status: 'draft', recipient_count: 0,
  }
  const id = typeof b?.id === 'string' && UUID.test(b.id) ? b.id : null
  if (id) {
    const { data: cur } = await supabaseAdmin.from('email_campaigns').select('status, event_id').eq('id', id).maybeSingle()
    if (!cur || cur.status !== 'draft') return NextResponse.json({ error: 'That draft no longer exists.' }, { status: 404 })
    const { error } = await supabaseAdmin.from('email_campaigns').update(row).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ id })
  }
  const { data, error } = await supabaseAdmin.from('email_campaigns').insert({ ...row, audience_type: 'speaker', created_by: session.sid ?? null, owner_staff_id: session.sid && session.sid !== 'super-admin' ? session.sid : null }).select('id').single()
  if (error || !data) return NextResponse.json({ error: error?.message ?? 'Could not save the draft.' }, { status: 500 })
  return NextResponse.json({ id: data.id })
}
