import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { auditOwner, hasScopePermission, resolveScope, scopeFromParams } from '@/app/lib/ops/scope'
import { staffForSection } from '@/app/lib/ops/section-access'
import { logOpsAccess, clientIp } from '@/app/lib/ops/audit'
import { knownStaffId } from '@/app/lib/badges/service'
import { buildReminder, loadSpeakerDocRows, outstandingDocs, REMIND_COOLDOWN_HOURS, resolveReminderSender, sendReminder, type ReminderItem } from '@/app/lib/ops/speaker-documents'

/* POST /api/events/operations/speakers/remind { event_id | umbrella_id, speaker_ids: string[] }
   One email per PRODUCER listing their outstanding speakers (never one per speaker), sent from the Ops person assigned to
   Speaker Doc Request for that event (shared noreply if nobody is assigned). Speakers reminded in the last 24h are skipped.
   { preview: true } returns exactly what would go to each producer (from, to, subject, body) without sending anything.
   Gate: admin, ops.speakers.manage, or assigned to the section. The speakers themselves are never emailed. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as { event_id?: string; umbrella_id?: string; speaker_ids?: string[]; preview?: boolean } | null
  const scope = await resolveScope(scopeFromParams(body))
  if (!scope || !Array.isArray(body?.speaker_ids) || !body.speaker_ids.length) return NextResponse.json({ error: 'event_id (or umbrella_id) and speaker_ids are required.' }, { status: 400 })
  const session = getSession(req)
  const sid = session?.sid
  let allowed = !!session?.adm || (await hasScopePermission(session, scope, 'ops.speakers.manage'))
  if (!allowed && sid) for (const id of scope.eventIds) { const s = await staffForSection(id, 'speakers'); if (s.assigned && s.staff.some(x => x.id === sid)) { allowed = true; break } }
  if (!allowed) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })

  const wanted = new Set(body.speaker_ids)
  const rows = (await loadSpeakerDocRows(scope.eventIds)).filter(r => wanted.has(r.id))
  const skipped: { name: string; reason: string }[] = []
  const byProducer = new Map<string, typeof rows>()
  const cutoff = Date.now() - REMIND_COOLDOWN_HOURS * 3_600_000
  for (const r of rows) {
    if (!outstandingDocs(r).length) { skipped.push({ name: r.name, reason: 'nothing outstanding' }); continue }
    if (!r.producer_id) { skipped.push({ name: r.name, reason: 'no producer assigned' }); continue }
    if (r.last_reminded_at && new Date(r.last_reminded_at).getTime() > cutoff) { skipped.push({ name: r.name, reason: `reminded in the last ${REMIND_COOLDOWN_HOURS}h` }); continue }
    byProducer.set(r.producer_id, [...(byProducer.get(r.producer_id) ?? []), r])
  }

  const by = await knownStaffId(sid)
  const sent: { producer: string; speakers: number; from: string }[] = []
  const previews: { producer: string; to: string; from: string; from_fallback: boolean; subject: string; html: string; speakers: string[] }[] = []
  for (const [producerId, list] of byProducer) {
    const { data: producer } = await supabaseAdmin.from('staff_members').select('name, email').eq('id', producerId).maybeSingle()
    if (!producer?.email) { list.forEach(r => skipped.push({ name: r.name, reason: 'producer has no email' })); continue }
    const sender = await resolveReminderSender(list[0].event_id, sid)
    const items: ReminderItem[] = []
    for (const r of list) {
      let item = items.find(i => i.event_id === r.event_id)
      if (!item) items.push(item = { event_id: r.event_id, event_name: r.event_name, speakers: [] })
      item.speakers.push({ name: r.name, docs: outstandingDocs(r).map(type => ({ type, status: r[type] })) })
    }
    const mail = buildReminder({ producerName: producer.name ?? 'there', senderName: sender?.name ?? 'The Operations team', producerId, items })
    if (body.preview) {
      previews.push({ producer: producer.name ?? producer.email, to: producer.email, from: sender ? `${sender.name} <${sender.email}>` : 'Event Pilot <noreply>', from_fallback: !sender, subject: mail.subject, html: mail.html, speakers: list.map(r => r.name) })
      continue
    }
    try {
      const from = await sendReminder({ to: producer.email, sender, subject: mail.subject, html: mail.html })
      await supabaseAdmin.from('ops_document_reminders').insert(list.map(r => ({ event_id: r.event_id, speaker_id: r.id, producer_staff_id: producerId, sent_by_staff_id: by, sent_from: from, missing: outstandingDocs(r) })))
      sent.push({ producer: producer.name, speakers: list.length, from })
    } catch (e) {
      list.forEach(r => skipped.push({ name: r.name, reason: `email failed: ${e instanceof Error ? e.message : 'unknown'}` }))
    }
  }
  if (body.preview) return NextResponse.json({ ok: true, previews, skipped })
  await logOpsAccess({ ...auditOwner(scope), actorType: 'staff', actorId: by, action: 'ops_speaker_docs_reminder', targetType: 'ops_section', meta: { sent, skipped: skipped.length }, ip: clientIp(req) })
  return NextResponse.json({ ok: true, sent, skipped })
}
