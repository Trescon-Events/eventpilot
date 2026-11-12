import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { requireGuestInviteAccess } from '@/app/lib/guest-invites/access'

/* POST /api/events/stakeholders/email-campaigns/[id]/follow-up — "Email the people who haven't replied": makes a STATIC list of the people this email reached (sent, no reply, not
   bounced, nobody asking to stop) and a DRAFT follow-up addressed to that list, starting from the original text. Nothing is sent; the producer edits and sends it from Compose. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = getSession(req)
  if (!session || !UUID.test(id)) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const { data: c } = await supabaseAdmin.from('email_campaigns').select('*').eq('id', id).maybeSingle()
  if (!c) return NextResponse.json({ error: 'Email not found.' }, { status: 404 })
  const denied = await requireGuestInviteAccess(req, c.event_id as string, 'edit'); if (denied) return denied
  if (c.status !== 'sent' && c.status !== 'sending') return NextResponse.json({ error: 'A follow-up can be made once the email has been sent.' }, { status: 409 })

  const { data: rows } = await supabaseAdmin.from('email_campaign_recipients').select('contact_id, speaker_id, status, reply_type, stop_requested').eq('campaign_id', id).limit(5000)
  const quiet = (rows ?? []).filter(r => r.status === 'sent' && r.reply_type === 'none' && !r.stop_requested)
  const members = [...new Set(quiet.map(r => (r.contact_id ? `c:${r.contact_id}` : r.speaker_id ? `s:${r.speaker_id}` : null)).filter((x): x is string => !!x))]
  if (!members.length) return NextResponse.json({ error: 'Everyone who received it has replied, bounced or asked to stop, so there is nobody to follow up.' }, { status: 409 })

  const sid = session.sid && session.sid !== 'super-admin' ? session.sid : null
  const { data: list, error: le } = await supabaseAdmin.from('email_lists').insert({
    name: `No reply to “${c.name}”`.slice(0, 200), description: 'Made automatically: the people who received the email and have not replied.', audience_type: 'speaker', list_type: 'static', members, event_id: c.event_id, created_by: session.sid ?? null,
  }).select('id').single()
  if (le || !list) return NextResponse.json({ error: le?.message ?? 'Could not make the list.' }, { status: 500 })
  const subject = String(c.subject).toLowerCase().startsWith('following up') ? String(c.subject) : `Following up: ${c.subject}`
  const { data: draft, error } = await supabaseAdmin.from('email_campaigns').insert({
    name: `Follow-up: ${c.name}`.slice(0, 200), event_id: c.event_id, audience_type: 'speaker', template_id: null, field_values: {}, subject: subject.slice(0, 200), body_html: c.body_html, attachments: c.attachments,
    list_id: list.id, sender_mode: c.sender_mode, status: 'draft', recipient_count: 0, created_by: session.sid ?? null, owner_staff_id: sid,
  }).select('id').single()
  if (error || !draft) return NextResponse.json({ error: error?.message ?? 'Could not make the draft.' }, { status: 500 })
  return NextResponse.json({ draft_id: draft.id, list_id: list.id, people: members.length })
}
