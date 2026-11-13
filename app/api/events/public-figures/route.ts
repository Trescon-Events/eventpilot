import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'
import { supabaseAdmin } from '@/app/lib/supabase'
import { canManageRules } from '@/app/lib/content/rule-admin'
import {
  FigureError, acceptSuggestion, addCustom, addFromCatalogue, addGroup, approveInternally, eventOfFigure, listFigures, removeAfterReview, removeAllEmpty, removeItem, reopen, reviseAndResend,
  sendReview, startFromTemplate, updateItem,
} from '@/app/lib/content/public-figures'
import { FIGURE_CATALOGUE, FIGURE_CATEGORIES, GROUPABLE_CATEGORIES } from '@/app/lib/content/public-figures-catalogue'

/* Public figures API (docs/build_suggestions/public-figures.md). Public only: internal actuals and targets are not here.
   GET  ?event_id=…   the event's items, with checks, the last decision and "update available"
   POST { action, … } start_from_template | add_from_catalogue | add_custom | add_group | remove_all_empty | update | remove | approve | send_review | accept_suggestion | revise | remove_after_review | reopen
   Permission: sae.forms.manage on the event (the same as the rules screen and the Copy Library). Read needs view access. Every write is audited. */

/** Behind Railway and the Cloudflare worker `req.nextUrl.origin` is localhost, so links for outside people come from the configured site URL (same as every other review link). */
const siteOrigin = () => (process.env.NEXT_PUBLIC_SITE_URL || 'https://eventpilot.tresconglobal.com').replace(/\/$/, '')

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  const eventId = req.nextUrl.searchParams.get('event_id') ?? ''
  if (!UUID.test(eventId)) return NextResponse.json({ error: 'event_id required.' }, { status: 400 })
  const can = await canManageRules(req, { kind: 'event', id: eventId })
  if (!can.ok && !(await hasEventPermission(session.sid, eventId, 'sae.stakeholders.view'))) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  try {
    const [lib, ev, copy] = await Promise.all([
      listFigures(eventId),
      supabaseAdmin.from('events').select('name, public_name, content_phase').eq('id', eventId).maybeSingle(),
      supabaseAdmin.from('copy_library_items').select('id, asset_key, variant_length, variant_phase, status, approved_version').eq('event_id', eventId).eq('variant_phase', 'post').order('asset_key'),
    ])
    return NextResponse.json({
      ...lib, can_edit: can.ok, categories: FIGURE_CATEGORIES, catalogue: FIGURE_CATALOGUE.map(e => ({ key: e.key, category: e.category, kind: e.kind, label: e.label, help: e.help })), groupable: [...GROUPABLE_CATEGORIES],
      event_name: ev.data?.public_name || ev.data?.name || null, copy_post_items: copy.data ?? [],
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not load.' }, { status: 500 }) }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as Record<string, unknown> | null
  if (!body || typeof body.action !== 'string') return NextResponse.json({ error: 'action required.' }, { status: 400 })
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  const sid = session.sid
  try {
    const figureId = typeof body.figure_id === 'string' && UUID.test(body.figure_id) ? body.figure_id : null
    const eventId = figureId ? await eventOfFigure(figureId) : typeof body.event_id === 'string' && UUID.test(body.event_id) ? body.event_id : null
    if (!eventId) return NextResponse.json({ error: 'event_id (or figure_id) required.' }, { status: 400 })
    const auth = await canManageRules(req, { kind: 'event', id: eventId })
    if (!auth.ok) return NextResponse.json({ error: 'Not authorized to change public figures here.' }, { status: 403 })
    const need = () => { if (!figureId) throw new FigureError('figure_id required.', 400); return figureId }
    const str = (k: string) => (typeof body[k] === 'string' ? (body[k] as string) : '')

    switch (body.action) {
      case 'start_from_template': return NextResponse.json(await startFromTemplate(eventId, sid))
      case 'add_from_catalogue': return NextResponse.json({ item: await addFromCatalogue(eventId, str('key'), str('group_label') || null, sid) })
      case 'add_custom': return NextResponse.json({ item: await addCustom(eventId, { kind: str('kind') as 'figure', category: str('category'), label: str('label'), group_label: str('group_label') || null }, sid) })
      case 'add_group': return NextResponse.json(await addGroup(eventId, str('category'), str('group_label'), sid))
      case 'remove_all_empty': return NextResponse.json(await removeAllEmpty(eventId, sid))
      case 'update': return NextResponse.json({ item: await updateItem(need(), (body.patch ?? {}) as Record<string, never>, sid) })
      case 'remove': await removeItem(need(), sid); return NextResponse.json({ ok: true })
      case 'approve': return NextResponse.json(await approveInternally(eventId, Array.isArray(body.ids) ? (body.ids as string[]).filter(i => UUID.test(i)) : 'all', sid))
      case 'send_review': {
        if (body.audience !== 'internal' && body.audience !== 'client') return NextResponse.json({ error: 'audience internal|client required.' }, { status: 400 })
        const r = await sendReview(eventId, body.audience, Array.isArray(body.ids) ? (body.ids as string[]).filter(i => UUID.test(i)) : null, sid)
        return NextResponse.json({ ...r, url: `${siteOrigin()}/public/figures-review/${r.token}` })
      }
      case 'accept_suggestion': return NextResponse.json({ item: await acceptSuggestion(need(), sid) })
      case 'revise': return NextResponse.json({ item: await reviseAndResend(need(), { label: typeof body.label === 'string' ? body.label : undefined, payload: body.payload }, sid) })
      case 'remove_after_review': await removeAfterReview(need(), sid); return NextResponse.json({ ok: true })
      case 'reopen': return NextResponse.json({ item: await reopen(need(), str('reason'), sid) })
      default: return NextResponse.json({ error: 'Unknown action.' }, { status: 400 })
    }
  } catch (e) {
    if (e instanceof FigureError) return NextResponse.json({ error: e.message, ...(e.extra ?? {}) }, { status: e.status })
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed.' }, { status: 500 })
  }
}
