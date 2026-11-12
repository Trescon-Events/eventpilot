import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'
import { supabaseAdmin } from '@/app/lib/supabase'
import { polishEmail } from '@/app/lib/speaker-emails/polish'

/* Emails → Templates → "Suggest updates from the messaging doc". POST { event_id, template_id }. Returns a suggested body only; nothing is saved. The {{tokens}} must survive. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const maxDuration = 60

export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  const b = await req.json().catch(() => null) as { event_id?: string; template_id?: string } | null
  if (!b?.event_id || !UUID.test(b.event_id) || !b.template_id || !UUID.test(b.template_id)) return NextResponse.json({ error: 'event_id and template_id required' }, { status: 400 })
  if (!session.adm && !(await hasEventPermission(session.sid, b.event_id, 'sae.stakeholders.edit'))) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  const [{ data: t }, { data: ev }] = await Promise.all([
    supabaseAdmin.from('email_templates').select('body_html, audience_type, event_id').eq('id', b.template_id).maybeSingle(),
    supabaseAdmin.from('events').select('name').eq('id', b.event_id).maybeSingle(),
  ])
  if (!t || t.audience_type !== 'speaker' || (t.event_id && t.event_id !== b.event_id)) return NextResponse.json({ error: 'That template is not available for this event.' }, { status: 404 })
  const r = await polishEmail({ eventId: b.event_id, eventName: (ev?.name as string) ?? 'the event', bodyHtml: t.body_html as string, pronounStyles: [], extraRules: 'This is a reusable template. Keep every {{token}} exactly as written, in place. Update only wording that disagrees with the event reference above.' })
  if ('error' in r) return NextResponse.json({ error: r.error }, { status: 502 })
  const before = [...String(t.body_html).matchAll(/\{\{\s*\w+\s*\}\}/g)].map(m => m[0]).sort().join()
  const after = [...JSON.stringify(r).matchAll(/\{\{\s*\w+\s*\}\}/g)].map(m => m[0]).sort().join()
  return NextResponse.json({ suggestion: r, tokens_kept: before === after })
}
