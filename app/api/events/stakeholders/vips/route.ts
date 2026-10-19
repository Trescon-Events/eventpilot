import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { deletePublicAsset } from '@/app/lib/events/storage'
import { knownStaffId, requireBadgePermission } from '@/app/lib/badges/service'
import { speakerBadgeStatus } from '@/app/lib/badges/status'

/* VIP list for an event (2026-10-19) — people a client sends us only so we can print a badge: name, job title, company, country, and an
   optional photo (same upload + Clean Photo cycle as speakers, via the speaker photo routes with ?kind=vip).
   GET    ?event_id=[&id=]                    -> the list (or one VIP), each with its badge status
   POST   { event_id, name, job_title?, company?, country? }
   PATCH  { event_id, id, ...fields } | { event_id, id, clear_photo: true }
   DELETE { event_id, ids[] }                 -> removes VIPs (badges already made keep their frozen copy)
   Reads need sae.badges.view, writes sae.badges.manage. Upload is /vips/import. */

const COLUMNS = 'id, name, job_title, company, country, photo_url, photo_processed_url, photo_head_box, photo_low_resolution, photo_cleaning_cycle_done, created_at'
const clean = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)
const BUCKET_MARKER = '/event-stakeholder-assets/'

async function removeStored(url: string | null | undefined) {
  if (!url || !url.includes(BUCKET_MARKER)) return
  await deletePublicAsset(decodeURIComponent(url.split(BUCKET_MARKER)[1].split('?')[0]))
}

export async function GET(req: NextRequest) {
  const eventId = req.nextUrl.searchParams.get('event_id')
  if (!eventId) return NextResponse.json({ error: 'event_id required' }, { status: 400 })
  const auth = await requireBadgePermission(req, eventId, 'sae.badges.view')
  if ('error' in auth) return auth.error
  const id = req.nextUrl.searchParams.get('id')
  let q = supabaseAdmin.from('event_vips').select(COLUMNS).eq('event_id', eventId).order('name', { ascending: true })
  if (id) q = q.eq('id', id)
  const [{ data, error }, status] = await Promise.all([q, speakerBadgeStatus(eventId, 'vip_id')])
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ vips: (data ?? []).map(v => ({ ...v, badge_status: status.get(v.id as string) ?? null })) })
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as { event_id?: string; name?: string; job_title?: string; company?: string; country?: string } | null
  if (!body?.event_id || !clean(body.name)) return NextResponse.json({ error: 'event_id and a name are required.' }, { status: 400 })
  const auth = await requireBadgePermission(req, body.event_id, 'sae.badges.manage')
  if ('error' in auth) return auth.error
  const { data, error } = await supabaseAdmin.from('event_vips')
    .insert({ event_id: body.event_id, name: clean(body.name), job_title: clean(body.job_title), company: clean(body.company), country: clean(body.country), created_by: await knownStaffId(auth.session.sid) })
    .select(COLUMNS).single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ vip: data })
}

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => null) as { event_id?: string; id?: string; name?: string; job_title?: string; company?: string; country?: string; clear_photo?: boolean } | null
  if (!body?.event_id || !body.id) return NextResponse.json({ error: 'event_id and id are required.' }, { status: 400 })
  const auth = await requireBadgePermission(req, body.event_id, 'sae.badges.manage')
  if ('error' in auth) return auth.error
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (body.clear_photo) {
    // Like the speaker "Delete Photo": removes the raw + cleaned files, the head box and the cleaning state.
    const { data: cur } = await supabaseAdmin.from('event_vips').select('photo_url, photo_processed_url').eq('id', body.id).eq('event_id', body.event_id).maybeSingle()
    await Promise.all([removeStored(cur?.photo_url as string | null), removeStored(cur?.photo_processed_url as string | null)]).catch(() => {})
    Object.assign(patch, { photo_url: null, photo_processed_url: null, photo_head_box: null, photo_low_resolution: false, photo_cleaning_cycle_done: false })
  }
  if ('name' in body) { const n = clean(body.name); if (!n) return NextResponse.json({ error: 'A VIP needs a name.' }, { status: 400 }); patch.name = n }
  for (const k of ['job_title', 'company', 'country'] as const) if (k in body) patch[k] = clean(body[k])
  const { data, error } = await supabaseAdmin.from('event_vips').update(patch).eq('id', body.id).eq('event_id', body.event_id).select(COLUMNS).maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'VIP not found.' }, { status: 404 })
  return NextResponse.json({ vip: data })
}

export async function DELETE(req: NextRequest) {
  const body = await req.json().catch(() => null) as { event_id?: string; id?: string; ids?: string[] } | null
  const ids = body?.ids?.length ? body.ids : body?.id ? [body.id] : []
  if (!body?.event_id || ids.length === 0) return NextResponse.json({ error: 'event_id and ids are required.' }, { status: 400 })
  const auth = await requireBadgePermission(req, body.event_id, 'sae.badges.manage')
  if ('error' in auth) return auth.error
  const { data: rows } = await supabaseAdmin.from('event_vips').select('photo_url, photo_processed_url').eq('event_id', body.event_id).in('id', ids)
  // Badge items keep their frozen copy (vip_id is set to null by the FK), so removing a VIP never changes a batch.
  const { error } = await supabaseAdmin.from('event_vips').delete().eq('event_id', body.event_id).in('id', ids)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  await Promise.all((rows ?? []).flatMap(r => [removeStored(r.photo_url as string | null), removeStored(r.photo_processed_url as string | null)])).catch(() => {})
  return NextResponse.json({ ok: true, deleted: ids.length })
}
