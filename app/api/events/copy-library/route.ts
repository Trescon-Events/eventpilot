import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/app/lib/access/session'
import { supabaseAdmin } from '@/app/lib/supabase'
import { canManageRules, parseOwner } from '@/app/lib/content/rule-admin'
import {
  CopyError, applyReviewChange, approveInternally, editItem, findingsFor, generateStarterSet, loadLibrary, markNotUsed, ownerOfItem, regenerateItem, restoreUse, sendBundle, setContentPhase, usageCounts, logCopyChange,
} from '@/app/lib/content/copy-library'
import { getApprovedText } from '@/app/lib/content/trescon-profile'
import { COPY_CATALOGUE } from '@/app/lib/content/copy-catalogue'
import { clientApprovalRequired, datesLookPast } from '@/app/lib/content/copy-model'

/* Copy Library API (docs/build_suggestions/copy-library.md).
   GET  ?owner_type=event|umbrella|org&owner_id=…   — the catalogue, the items (own + inherited), findings, usage, phase.
   POST { action, … }  generate | edit | approve | send_bundle | apply_change | dismiss_change | regenerate | mark_not_used | use_again | set_phase | set_client_approval
   Permissions are the rules screen's: sae.forms.manage on the event, sae.messaging.umbrella_manage on an umbrella. Every write is audited. */

/** Behind Railway and the Cloudflare worker `req.nextUrl.origin` is localhost, so links for outside people come from the configured site URL (same as every other review link). */
const siteOrigin = () => (process.env.NEXT_PUBLIC_SITE_URL || 'https://eventpilot.tresconglobal.com').replace(/\/$/, '')

export const maxDuration = 120

export async function GET(req: NextRequest) {
  if (!getSession(req)) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  const owner = parseOwner(req.nextUrl.searchParams.get('owner_type'), req.nextUrl.searchParams.get('owner_id'))
  if (!owner) return NextResponse.json({ error: 'owner_type and owner_id required.' }, { status: 400 })
  const trescon_about = await getApprovedText('about_standard')
  if (owner.kind === 'org') return NextResponse.json({ catalogue: [], items: [], can_edit: false, phase: null, trescon_about, requires_client_approval: false })
  try {
    const lib = await loadLibrary(owner)
    const [findings, usage, can] = await Promise.all([
      findingsFor(owner, lib.items.map(i => i.working_text)), usageCounts(lib.items.map(i => i.id)), canManageRules(req, owner),
    ])
    let suggest_post = false, dates: string | null = null, requires_override: boolean | null = null
    if (owner.kind === 'event') {
      const { data: e } = await supabaseAdmin.from('events').select('public_dates_display, content_phase, copy_requires_client_approval').eq('id', owner.id).maybeSingle()
      dates = e?.public_dates_display ?? null
      requires_override = e?.copy_requires_client_approval ?? null
      suggest_post = e?.content_phase === 'pre' && datesLookPast(dates)
    }
    return NextResponse.json({
      catalogue: COPY_CATALOGUE, can_edit: can.ok, phase: lib.phase, requires_client_approval: lib.requires_client_approval, requires_override, suggest_post, dates, trescon_about,
      items: lib.items.map((it, i) => ({ ...it, findings: findings[i], usage: usage[it.id] ?? {} })),
      needs_review: lib.items.filter(i => i.status === 'needs_review' && !i.inherited).length,
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not load the Copy Library.' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as Record<string, unknown> | null
  if (!body || typeof body.action !== 'string') return NextResponse.json({ error: 'action required.' }, { status: 400 })
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  const sid = session.sid
  try {
    const itemId = typeof body.item_id === 'string' ? body.item_id : null
    const owner = itemId ? await ownerOfItem(itemId) : parseOwner(String(body.owner_type ?? ''), String(body.owner_id ?? ''))
    if (!owner) return NextResponse.json({ error: 'owner_type and owner_id (or item_id) required.' }, { status: 400 })
    const auth = await canManageRules(req, owner)
    if (!auth.ok) return NextResponse.json({ error: 'Not authorized to change the Copy Library here.' }, { status: 403 })

    switch (body.action) {
      case 'generate': return NextResponse.json(await generateStarterSet(owner, sid))
      case 'edit': {
        if (!itemId || typeof body.text !== 'string') return NextResponse.json({ error: 'item_id and text required.' }, { status: 400 })
        return NextResponse.json({ item: await editItem(itemId, body.text, sid) })
      }
      case 'approve': return NextResponse.json({ item: await approveInternally(need(itemId), sid) })
      case 'send_bundle': {
        const r = await sendBundle(owner, sid)
        return NextResponse.json({ ...r, url: `${siteOrigin()}/public/copy-review/${r.token}` })
      }
      case 'apply_change': return NextResponse.json({ item: await applyReviewChange(need(itemId), 'apply', sid) })
      case 'dismiss_change': return NextResponse.json({ item: await applyReviewChange(need(itemId), 'dismiss', sid) })
      case 'regenerate': return NextResponse.json({ item: await regenerateItem(need(itemId), sid) })
      case 'mark_not_used': return NextResponse.json({ item: await markNotUsed(need(itemId), sid) })
      case 'use_again': return NextResponse.json({ item: await restoreUse(need(itemId), sid) })
      case 'set_phase': {
        if (owner.kind !== 'event' || (body.phase !== 'pre' && body.phase !== 'post')) return NextResponse.json({ error: 'An event and phase pre|post required.' }, { status: 400 })
        await setContentPhase(owner.id, body.phase, sid); return NextResponse.json({ ok: true })
      }
      case 'set_client_approval': {
        if (owner.kind !== 'event' || typeof body.required !== 'boolean') return NextResponse.json({ error: 'An event and required true|false needed.' }, { status: 400 })
        const { data: ev } = await supabaseAdmin.from('events').select('copy_requires_client_approval, type').eq('id', owner.id).maybeSingle()
        await supabaseAdmin.from('events').update({ copy_requires_client_approval: body.required }).eq('id', owner.id)
        await logCopyChange({ item_id: null, owner, asset_key: null, action: 'set_client_approval', before: { required: clientApprovalRequired(ev?.copy_requires_client_approval, ev?.type) }, after: { required: body.required }, by: sid })
        return NextResponse.json({ ok: true })
      }
      default: return NextResponse.json({ error: 'Unknown action.' }, { status: 400 })
    }
  } catch (e) {
    if (e instanceof CopyError) return NextResponse.json({ error: e.message, ...(e.extra ?? {}) }, { status: e.status })
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed.' }, { status: 500 })
  }
}
function need(id: string | null): string { if (!id) throw new CopyError('item_id required.', 400); return id }
