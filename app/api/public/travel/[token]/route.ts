import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { notifyStaff } from '@/app/lib/notify'
import { sendSystemMail } from '@/app/lib/email/system-mail'
import { siteUrl } from '@/app/lib/badges/client-approval'
import { loadSettings, validateTravel, type TravelRow } from '@/app/lib/travel/travel'

/* The speaker's (or their assistant's) side of Arrival & Travel — public (under /api/public), reachable only with the speaker's private token.
   GET   the speaker's name, the deadline, who can fill it in, and what is saved so far (anyone with the link sees and may edit it).
   POST  { by_name, no_reception, phone, arr_*, dep_* }   saves it; the person types who they are; every save is logged and the producer is told. */

async function load(token: string) {
  if (!/^[0-9a-f]{32,128}$/i.test(token)) return null
  const { data: row } = await supabaseAdmin.from('speaker_travel').select('*').eq('token', token).maybeSingle()
  if (!row) return null
  const settings = await loadSettings(row.event_id as string)
  if (!settings.enabled) return null
  const { data: sp } = await supabaseAdmin.from('event_speakers').select('id, name, public_name, producer_staff_id').eq('id', row.speaker_id).maybeSingle()
  const { data: ev } = await supabaseAdmin.from('events').select('name, public_name').eq('id', row.event_id).maybeSingle()
  if (!sp) return null
  return { row: row as TravelRow, settings, sp, eventName: ((ev?.public_name as string | null) || (ev?.name as string | null) || 'the event') }
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const ctx = await load(token)
  if (!ctx) return NextResponse.json({ error: 'This link is not valid, or the form is no longer open.' }, { status: 404 })
  const { row, settings, sp, eventName } = ctx
  const speakerName = ((sp.public_name as string) || (sp.name as string) || '').trim()
  const { data: contacts } = await supabaseAdmin.from('speaker_additional_contacts').select('first_name, last_name').eq('speaker_id', sp.id).order('created_at', { ascending: true })
  const people = [speakerName, ...(contacts ?? []).map(c => `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim()).filter(Boolean)].filter(Boolean)
  return NextResponse.json({
    event_name: eventName, speaker_name: speakerName, deadline: settings.deadline, people: [...new Set(people)],
    saved: row.submitted_at ? {
      no_reception: row.no_reception, phone: row.phone, arr_flight: row.arr_flight, arr_class: row.arr_class, arr_date: row.arr_date, arr_time: row.arr_time,
      dep_flight: row.dep_flight, dep_class: row.dep_class, dep_date: row.dep_date, dep_time: row.dep_time, submitted_by: row.submitted_by, submitted_at: row.submitted_at, updated_at: row.updated_at,
    } : null,
  }, { headers: { 'Cache-Control': 'no-store' } })
}

const FIELDS: [keyof TravelRow, string][] = [
  ['no_reception', 'airport reception'], ['phone', 'phone'], ['arr_flight', 'arrival flight'], ['arr_class', 'arrival class'], ['arr_date', 'arrival date'], ['arr_time', 'arrival time'],
  ['dep_flight', 'departure flight'], ['dep_class', 'departure class'], ['dep_date', 'departure date'], ['dep_time', 'departure time'],
]

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const ctx = await load(token)
  if (!ctx) return NextResponse.json({ error: 'This link is not valid, or the form is no longer open.' }, { status: 404 })
  const { row, sp, eventName } = ctx
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Details required.' }, { status: 400 })
  const v = validateTravel(body)
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 422 })

  const first = !row.submitted_at
  const changed = first ? [] : FIELDS.filter(([k]) => (row[k] ?? null) !== (v.values[k as keyof typeof v.values] ?? null)).map(([, label]) => label)
  const now = new Date().toISOString()
  const { error } = await supabaseAdmin.from('speaker_travel').update({ ...v.values, submitted_by: v.by, submitted_at: row.submitted_at ?? now, updated_at: now }).eq('id', row.id)
  if (error) return NextResponse.json({ error: 'Could not save. Please try again.' }, { status: 500 })
  const summary = first ? (v.values.no_reception ? 'Submitted: no airport reception needed' : 'Submitted their travel details') : changed.length ? `Updated ${changed.join(', ')}` : 'Saved without changes'
  await supabaseAdmin.from('speaker_travel_log').insert({ travel_id: row.id, by_name: v.by, summary })

  if (first || changed.length) {
    const name = ((sp.public_name as string) || (sp.name as string) || 'A speaker').trim()
    // The speaker's own producer plus everyone chosen by name in the module's setup (bell for all; email for the chosen people).
    const chosen = ctx.settings.notify_staff_ids ?? []
    const title = first ? `${name} shared travel details` : `${name} changed travel details`
    const text = `${v.by} — ${summary.toLowerCase()} (${eventName}).`
    const link = `/admin/events/${row.event_id}/stakeholders/logistics`
    await notifyStaff([...(sp.producer_staff_id ? [sp.producer_staff_id as string] : []), ...chosen], { type: 'travel_details', title, body: text, link, eventId: row.event_id })
    if (chosen.length) {
      const { data: people } = await supabaseAdmin.from('staff_members').select('email').in('id', chosen)
      const to = (people ?? []).map(p => p.email as string).filter(Boolean)
      // Email HTML needs literal colours (mail clients cannot read CSS variables).
      /* eslint-disable no-restricted-syntax */
      if (to.length) await sendSystemMail({ to, subject: title, html: `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#1A2530;max-width:560px"><p><strong>${title}</strong></p><p>${text}</p><p><a href="${siteUrl()}${link}" style="color:#00807E;font-weight:bold">Open Logistics</a></p></div>` }).catch(e => console.error('[travel] notify email failed:', e instanceof Error ? e.message : e))
      /* eslint-enable no-restricted-syntax */
    }
  }
  return NextResponse.json({ ok: true })
}
