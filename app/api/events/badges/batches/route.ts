import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import type { Variant } from '@/app/lib/announcements/composite'
import { badgeVariants, knownStaffId, requireBadgePermission } from '@/app/lib/badges/service'
import { speakerBadgeStatus } from '@/app/lib/badges/status'
import { CONFIRMED_STATUSES } from '@/app/lib/badges/types'
import { parseQuantity } from '@/app/lib/badges/common'

/* GET  /api/events/badges/batches?event_id=            -> the event's batches with counts
   GET  /api/events/badges/batches?event_id=&candidates=1 -> badge templates + speakers to choose from
   GET  /api/events/badges/batches?event_id=&candidates=1&source=vips -> the same, but the people are the event's VIPs
   GET  /api/events/badges/batches?event_id=&candidates=1&source=common -> only the Common Badge templates (one artwork, no names)
   POST /api/events/badges/batches { event_id, variant_id, name, quantity } -> a Common Badges batch: a Common Badge template printed `quantity` times (one item = the design)
   POST /api/events/badges/batches { event_id, variant_id, name, speaker_ids[] | vip_ids[] } -> creates a batch (template + person
        fields frozen at this moment — see supabase/badge_batches_migration.sql). A photo is never required; a name is. */

const VIP_COLUMNS = 'id, name, job_title, company, country, photo_processed_url, photo_head_box'
const SPEAKER_COLUMNS = 'id, public_name, name, role, company, country, photo_processed_url, photo_head_box, confirmation_status'

export async function GET(req: NextRequest) {
  const eventId = req.nextUrl.searchParams.get('event_id')
  if (!eventId) return NextResponse.json({ error: 'event_id required' }, { status: 400 })
  const auth = await requireBadgePermission(req, eventId, 'sae.badges.view')
  if ('error' in auth) return auth.error

  if (req.nextUrl.searchParams.get('candidates') && req.nextUrl.searchParams.get('source') === 'common') {
    const variants = await badgeVariants(eventId, true)
    return NextResponse.json({ variants: variants.map(v => ({ id: v.id, name: v.name, print: v.print })) })
  }

  if (req.nextUrl.searchParams.get('candidates') && req.nextUrl.searchParams.get('source') === 'vips') {
    const [variants, { data: vips }, badgeStatus] = await Promise.all([
      badgeVariants(eventId),
      supabaseAdmin.from('event_vips').select(VIP_COLUMNS).eq('event_id', eventId).order('name', { ascending: true }),
      speakerBadgeStatus(eventId, 'vip_id'),
    ])
    return NextResponse.json({
      variants: variants.map(v => ({ id: v.id, name: v.name, print: v.print })),
      confirmed_statuses: [],
      speakers: (vips ?? []).map(v => {
        const name = ((v.name as string | null) ?? '').trim()
        const has = { name: !!name, title: !!(v.job_title as string | null)?.trim(), company: !!(v.company as string | null)?.trim(), country: !!(v.country as string | null)?.trim(), photo: !!v.photo_processed_url }
        return {
          id: v.id, name, title: v.job_title, company: v.company, country: v.country, has, confirmation_status: null,
          blocked: !has.name,
          pending: (['title', 'company', 'country'] as const).filter(k => !has[k]),
          badge_status: badgeStatus.get(v.id as string) ?? null,
        }
      }),
    })
  }

  if (req.nextUrl.searchParams.get('candidates')) {
    const [variants, { data: speakers }, badgeStatus] = await Promise.all([
      badgeVariants(eventId),
      supabaseAdmin.from('event_speakers').select(SPEAKER_COLUMNS).eq('event_id', eventId).order('public_name', { ascending: true }),
      speakerBadgeStatus(eventId),
    ])
    return NextResponse.json({
      variants: variants.map(v => ({ id: v.id, name: v.name, print: v.print })),
      confirmed_statuses: CONFIRMED_STATUSES,
      speakers: (speakers ?? []).map(s => {
        const name = ((s.public_name as string | null) || (s.name as string | null) || '').trim()
        const has = { name: !!name, title: !!(s.role as string | null)?.trim(), company: !!(s.company as string | null)?.trim(), country: !!(s.country as string | null)?.trim(), photo: !!s.photo_processed_url }
        return {
          id: s.id, name, title: s.role, company: s.company, country: s.country, has, confirmation_status: s.confirmation_status,
          // Only a name is required to make a badge; a missing photo or other detail becomes a review flag (a template without a photo layer needs none).
          blocked: !has.name,
          pending: (['title', 'company', 'country'] as const).filter(k => !has[k]),
          badge_status: badgeStatus.get(s.id as string) ?? null,
        }
      }),
    })
  }

  const { data: batches } = await supabaseAdmin.from('badge_batches')
    .select('id, name, status, variant_id, created_at, approved_at, pdf_versions, template_snapshot, quantity').eq('event_id', eventId).order('created_at', { ascending: false })
  const ids = (batches ?? []).map(b => b.id as string)
  const { data: items } = ids.length
    ? await supabaseAdmin.from('badge_batch_items').select('batch_id, approved, removed, flags').in('batch_id', ids)
    : { data: [] as Array<{ batch_id: string; approved: boolean; removed: boolean; flags: unknown[] }> }
  return NextResponse.json({
    batches: (batches ?? []).map(b => {
      const mine = (items ?? []).filter(i => i.batch_id === b.id && !i.removed)
      const snapshot = b.template_snapshot as Variant
      return {
        id: b.id, name: b.name, status: b.status, created_at: b.created_at, approved_at: b.approved_at, pdf_count: (b.pdf_versions as unknown[] | null)?.length ?? 0,
        template_name: snapshot?.name ?? '', quantity: (b.quantity as number | null) ?? null, badges: (b.quantity as number | null) ?? mine.length, approved: mine.filter(i => i.approved).length, flagged: mine.filter(i => (i.flags ?? []).length > 0).length,
      }
    }),
  })
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as { event_id?: string; variant_id?: string; name?: string; speaker_ids?: string[]; vip_ids?: string[]; quantity?: unknown } | null
  if (body && body.quantity !== undefined) return createCommonBatch(req, body)
  const fromVips = Array.isArray(body?.vip_ids)
  const personIds = (fromVips ? body?.vip_ids : body?.speaker_ids) ?? []
  if (!body?.event_id || !body.variant_id || !body.name?.trim() || !Array.isArray(personIds) || personIds.length === 0) {
    return NextResponse.json({ error: `event_id, variant_id, name and at least one ${fromVips ? 'VIP' : 'speaker'} are required.` }, { status: 400 })
  }
  const auth = await requireBadgePermission(req, body.event_id, 'sae.badges.manage')
  if ('error' in auth) return auth.error

  const variant = (await badgeVariants(body.event_id)).find(v => v.id === body.variant_id)
  if (!variant) return NextResponse.json({ error: 'That badge template was not found (or has no print size).' }, { status: 404 })

  // Normalise both sources to the same frozen shape.
  type Person = { id: string; name: string; title: string | null; company: string | null; country: string | null; photo_url: string | null; photo_head_box: unknown }
  let people: Person[]
  if (fromVips) {
    const { data, error: vErr } = await supabaseAdmin.from('event_vips').select(VIP_COLUMNS).eq('event_id', body.event_id).in('id', personIds)
    if (vErr) return NextResponse.json({ error: vErr.message }, { status: 500 })
    people = (data ?? []).map(v => ({ id: v.id as string, name: ((v.name as string | null) ?? '').trim(), title: v.job_title as string | null, company: v.company as string | null, country: v.country as string | null, photo_url: v.photo_processed_url as string | null, photo_head_box: v.photo_head_box }))
  } else {
    const { data, error: spErr } = await supabaseAdmin.from('event_speakers').select(SPEAKER_COLUMNS).eq('event_id', body.event_id).in('id', personIds)
    if (spErr) return NextResponse.json({ error: spErr.message }, { status: 500 })
    people = (data ?? []).map(s => ({ id: s.id as string, name: ((s.public_name as string | null) || (s.name as string | null) || '').trim(), title: s.role as string | null, company: s.company as string | null, country: s.country as string | null, photo_url: s.photo_processed_url as string | null, photo_head_box: s.photo_head_box }))
  }
  if (!people.length) return NextResponse.json({ error: `None of the chosen ${fromVips ? 'VIPs' : 'speakers'} belong to this event.` }, { status: 400 })

  const unusable = people.filter(p => !p.name)
  if (unusable.length) return NextResponse.json({ error: `A badge needs a name. ${unusable.length} chosen ${fromVips ? 'VIP has' : 'speaker has'} none.` }, { status: 400 })

  const { data: batch, error } = await supabaseAdmin.from('badge_batches')
    .insert({ event_id: body.event_id, variant_id: variant.id, name: body.name.trim(), template_snapshot: variant, created_by: await knownStaffId(auth.session.sid) })
    .select('id').single()
  if (error || !batch) return NextResponse.json({ error: error?.message ?? 'Could not create the batch.' }, { status: 500 })

  const order = new Map(personIds.map((id, i) => [id, i]))
  const rows = people.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0)).map((p, i) => ({
    batch_id: batch.id, position: i, ...(fromVips ? { vip_id: p.id } : { speaker_id: p.id }),
    name: p.name, title: p.title, company: p.company, country: p.country, photo_url: p.photo_url, photo_head_box: p.photo_head_box,
  }))
  const { error: itemsErr } = await supabaseAdmin.from('badge_batch_items').insert(rows)
  if (itemsErr) {
    await supabaseAdmin.from('badge_batches').delete().eq('id', batch.id)
    return NextResponse.json({ error: itemsErr.message }, { status: 500 })
  }
  return NextResponse.json({ id: batch.id, badges: rows.length })
}

/** Common Badges: a Common Badge template + a quantity. One item (the design) is made; the print file repeats it `quantity` times. */
async function createCommonBatch(req: NextRequest, body: { event_id?: string; variant_id?: string; name?: string; quantity?: unknown }) {
  const quantity = parseQuantity(body.quantity)
  if (!body.event_id || !body.variant_id || !body.name?.trim()) return NextResponse.json({ error: 'event_id, variant_id, name and quantity are required.' }, { status: 400 })
  if (!quantity) return NextResponse.json({ error: 'Quantity must be a whole number from 1 to 5000.' }, { status: 400 })
  const auth = await requireBadgePermission(req, body.event_id, 'sae.badges.manage')
  if ('error' in auth) return auth.error
  const variant = (await badgeVariants(body.event_id, true)).find(v => v.id === body.variant_id)
  if (!variant) return NextResponse.json({ error: 'That Common Badge template was not found (or has no print size).' }, { status: 404 })
  const { data: batch, error } = await supabaseAdmin.from('badge_batches')
    .insert({ event_id: body.event_id, variant_id: variant.id, name: body.name.trim(), template_snapshot: variant, quantity, created_by: await knownStaffId(auth.session.sid) })
    .select('id').single()
  if (error || !batch) return NextResponse.json({ error: error?.message ?? 'Could not create the batch.' }, { status: 500 })
  const { error: itemErr } = await supabaseAdmin.from('badge_batch_items').insert({ batch_id: batch.id, position: 0, name: variant.name || 'Common badge' })
  if (itemErr) { await supabaseAdmin.from('badge_batches').delete().eq('id', batch.id); return NextResponse.json({ error: itemErr.message }, { status: 500 }) }
  return NextResponse.json({ id: batch.id, quantity })
}
