import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { CLASS_LABEL } from '@/app/lib/travel/travel'

/* The DET contact's live, read-only view of every speaker's arrival details for one event. Public; the private token in the link is the key.
   Only speakers who have submitted are listed (with a count of how many are still to respond). */

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  if (!/^[0-9a-f]{32,128}$/i.test(token)) return NextResponse.json({ error: 'This link is not valid.' }, { status: 404 })
  const { data: s } = await supabaseAdmin.from('event_travel_settings').select('event_id, enabled, det_name').eq('det_token', token).maybeSingle()
  if (!s || !s.enabled) return NextResponse.json({ error: 'This link is not valid, or the form is no longer open.' }, { status: 404 })
  const { data: ev } = await supabaseAdmin.from('events').select('name, public_name').eq('id', s.event_id).maybeSingle()
  const { data: rows } = await supabaseAdmin.from('speaker_travel').select('*, speaker:event_speakers!speaker_id(name, public_name, company, country)').eq('event_id', s.event_id)
  const all = rows ?? []
  const done = all.filter(r => r.submitted_at)
  const out = done.map(r => {
    const sp = (Array.isArray(r.speaker) ? r.speaker[0] : r.speaker) as { name: string; public_name: string | null; company: string | null; country: string | null } | null
    return {
      name: ((sp?.public_name || sp?.name) ?? '').trim(), company: sp?.company ?? null, country: sp?.country ?? null, no_reception: r.no_reception, phone: r.phone,
      arr_flight: r.arr_flight, arr_class: r.arr_class ? CLASS_LABEL[r.arr_class as keyof typeof CLASS_LABEL] : null, arr_date: r.arr_date, arr_time: r.arr_time,
      dep_flight: r.dep_flight, dep_class: r.dep_class ? CLASS_LABEL[r.dep_class as keyof typeof CLASS_LABEL] : null, dep_date: r.dep_date, dep_time: r.dep_time,
      submitted_by: r.submitted_by, updated_at: r.updated_at,
    }
  }).sort((a, b) => (a.arr_date ?? '9999').localeCompare(b.arr_date ?? '9999') || (a.arr_time ?? '').localeCompare(b.arr_time ?? '') || a.name.localeCompare(b.name))
  return NextResponse.json({ event_name: (ev?.public_name as string | null) || (ev?.name as string | null) || 'the event', contact: s.det_name, invited: all.filter(r => r.invited_at).length, rows: out, generated_at: new Date().toISOString() }, { headers: { 'Cache-Control': 'no-store' } })
}
