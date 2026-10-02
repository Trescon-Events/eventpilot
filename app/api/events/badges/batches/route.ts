import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import type { CreativeTemplateConfig, Variant } from '@/app/lib/announcements/composite'
import { knownStaffId, requireBadgePermission } from '@/app/lib/badges/service'
import { CONFIRMED_STATUSES } from '@/app/lib/badges/types'

/* GET  /api/events/badges/batches?event_id=            -> the event's batches with counts
   GET  /api/events/badges/batches?event_id=&candidates=1 -> badge templates + speakers to choose from
   POST /api/events/badges/batches { event_id, variant_id, name, speaker_ids[] } -> creates a batch (template + speaker
        fields frozen at this moment — see supabase/badge_batches_migration.sql) */

const SPEAKER_COLUMNS = 'id, public_name, name, role, company, country, photo_processed_url, photo_head_box, confirmation_status'

async function badgeVariants(eventId: string): Promise<Variant[]> {
  const { data } = await supabaseAdmin.from('events').select('creative_template_config').eq('id', eventId).single()
  const config = data?.creative_template_config as CreativeTemplateConfig | null
  return (config?.speaker?.variants ?? []).filter(v => v.category === 'badge' && !!v.print)
}

/** Furthest badge state per speaker across this event's batches: created -> sent (to the printer) -> printed. */
async function speakerBadgeStatus(eventId: string): Promise<Map<string, 'created' | 'sent' | 'printed'>> {
  const { data: batches } = await supabaseAdmin.from('badge_batches').select('id').eq('event_id', eventId)
  const ids = (batches ?? []).map(b => b.id as string)
  const out = new Map<string, 'created' | 'sent' | 'printed'>()
  if (!ids.length) return out
  const [{ data: items }, { data: dispatches }] = await Promise.all([
    supabaseAdmin.from('badge_batch_items').select('batch_id, speaker_id').in('batch_id', ids).eq('removed', false).not('speaker_id', 'is', null),
    supabaseAdmin.from('badge_print_dispatches').select('batch_id, status').in('batch_id', ids).in('status', ['sent', 'downloaded', 'printed']),
  ])
  const rank = { created: 1, sent: 2, printed: 3 } as const
  const batchState = new Map<string, 'sent' | 'printed'>()
  for (const d of dispatches ?? []) {
    const st = d.status === 'printed' ? 'printed' : 'sent'
    const cur = batchState.get(d.batch_id as string)
    if (!cur || rank[st] > rank[cur]) batchState.set(d.batch_id as string, st)
  }
  for (const it of items ?? []) {
    const st = batchState.get(it.batch_id as string) ?? 'created'
    const cur = out.get(it.speaker_id as string)
    if (!cur || rank[st] > rank[cur]) out.set(it.speaker_id as string, st)
  }
  return out
}

export async function GET(req: NextRequest) {
  const eventId = req.nextUrl.searchParams.get('event_id')
  if (!eventId) return NextResponse.json({ error: 'event_id required' }, { status: 400 })
  const auth = await requireBadgePermission(req, eventId, 'sae.badges.view')
  if ('error' in auth) return auth.error

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
          // Name and photo are required to make a badge; the rest are flagged (they become review flags).
          blocked: !has.name || !has.photo,
          pending: (['title', 'company', 'country'] as const).filter(k => !has[k]),
          badge_status: badgeStatus.get(s.id as string) ?? null,
        }
      }),
    })
  }

  const { data: batches } = await supabaseAdmin.from('badge_batches')
    .select('id, name, status, variant_id, created_at, approved_at, pdf_versions, template_snapshot').eq('event_id', eventId).order('created_at', { ascending: false })
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
        template_name: snapshot?.name ?? '', badges: mine.length, approved: mine.filter(i => i.approved).length, flagged: mine.filter(i => (i.flags ?? []).length > 0).length,
      }
    }),
  })
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as { event_id?: string; variant_id?: string; name?: string; speaker_ids?: string[] } | null
  if (!body?.event_id || !body.variant_id || !body.name?.trim() || !Array.isArray(body.speaker_ids) || body.speaker_ids.length === 0) {
    return NextResponse.json({ error: 'event_id, variant_id, name and at least one speaker are required.' }, { status: 400 })
  }
  const auth = await requireBadgePermission(req, body.event_id, 'sae.badges.manage')
  if ('error' in auth) return auth.error

  const variant = (await badgeVariants(body.event_id)).find(v => v.id === body.variant_id)
  if (!variant) return NextResponse.json({ error: 'That badge template was not found (or has no print size).' }, { status: 404 })
  const { data: speakers, error: spErr } = await supabaseAdmin.from('event_speakers').select(SPEAKER_COLUMNS).eq('event_id', body.event_id).in('id', body.speaker_ids)
  if (spErr) return NextResponse.json({ error: spErr.message }, { status: 500 })
  if (!speakers?.length) return NextResponse.json({ error: 'None of the chosen speakers belong to this event.' }, { status: 400 })

  const unusable = speakers.filter(s => !((s.public_name as string | null) || (s.name as string | null) || '').trim() || !s.photo_processed_url)
  if (unusable.length) {
    return NextResponse.json({ error: `A badge needs at least a name and a cleaned photo. Missing for: ${unusable.map(s => ((s.public_name as string | null) || (s.name as string | null) || '(no name)')).join(', ')}.` }, { status: 400 })
  }
  const { data: batch, error } = await supabaseAdmin.from('badge_batches')
    .insert({ event_id: body.event_id, variant_id: variant.id, name: body.name.trim(), template_snapshot: variant, created_by: await knownStaffId(auth.session.sid) })
    .select('id').single()
  if (error || !batch) return NextResponse.json({ error: error?.message ?? 'Could not create the batch.' }, { status: 500 })

  const order = new Map(body.speaker_ids.map((id, i) => [id, i]))
  const rows = speakers.sort((a, b) => (order.get(a.id as string) ?? 0) - (order.get(b.id as string) ?? 0)).map((s, i) => ({
    batch_id: batch.id, speaker_id: s.id, position: i,
    name: ((s.public_name as string | null) || (s.name as string | null) || '').trim() || null,
    title: s.role, company: s.company, country: s.country,
    photo_url: s.photo_processed_url, photo_head_box: s.photo_head_box,
  }))
  const { error: itemsErr } = await supabaseAdmin.from('badge_batch_items').insert(rows)
  if (itemsErr) {
    await supabaseAdmin.from('badge_batches').delete().eq('id', batch.id)
    return NextResponse.json({ error: itemsErr.message }, { status: 500 })
  }
  return NextResponse.json({ id: batch.id, badges: rows.length })
}
