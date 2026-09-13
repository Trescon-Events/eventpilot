import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'

/* GET   /api/events/site-registry?event_id=X
   PATCH /api/events/site-registry?event_id=X

   Site Operations module, Phase 1 (Step 0 of the Commissioning Orchestrator
   — see docs/EventPilot-SiteOps-Build-Spec-v1.1.md section 4/5.1). Human
   enters live/repo/preview URL and hosting provider; everything else
   (Cloudflare account/zone, deploy status, registrable domain, launch
   scenario) is derived or fetched in later phases, not here.

   event_sites has no DB-level unique constraint on event_id (see
   supabase/site_operations_phase1_constraint.sql for the optional
   hardening), so "one row per event" is enforced here: PATCH updates the
   existing row if one exists, otherwise inserts. Same gate as the rest of
   the Integrations page (sae.integrations.manage). */

const EDITABLE_FIELDS = [
  'live_url', 'repo_url', 'preview_url', 'hosting_provider',
  // Phase 4 — written by the commissioning orchestrator's Classify step,
  // not hand-entered by a producer.
  'registrable_domain', 'launch_scenario', 'commissioning_state',
] as const

export async function GET(req: NextRequest) {
  const eventId = req.nextUrl.searchParams.get('event_id')
  if (!eventId) return NextResponse.json({ error: 'event_id required' }, { status: 400 })

  const session = getSession(req)
  if (!session?.adm && !(await hasEventPermission(session?.sid, eventId, 'sae.integrations.manage'))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  const { data, error } = await supabaseAdmin
    .from('event_sites')
    .select('*')
    .eq('event_id', eventId)
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ site: data ?? null })
}

export async function PATCH(req: NextRequest) {
  const eventId = req.nextUrl.searchParams.get('event_id')
  if (!eventId) return NextResponse.json({ error: 'event_id required' }, { status: 400 })

  const session = getSession(req)
  if (!session?.adm && !(await hasEventPermission(session?.sid, eventId, 'sae.integrations.manage'))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  const body = await req.json().catch(() => null) as Record<string, unknown> | null
  if (!body) return NextResponse.json({ error: 'body required' }, { status: 400 })

  const patch: Record<string, unknown> = {}
  for (const field of EDITABLE_FIELDS) {
    if (field in body) patch[field] = typeof body[field] === 'string' ? (body[field] as string).trim() || null : null
  }
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'No recognised site registry fields in body' }, { status: 400 })

  const { data: existing } = await supabaseAdmin
    .from('event_sites')
    .select('id')
    .eq('event_id', eventId)
    .maybeSingle()

  if (existing) {
    const { data, error } = await supabaseAdmin
      .from('event_sites')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', existing.id)
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ site: data })
  }

  const { data, error } = await supabaseAdmin
    .from('event_sites')
    .insert({ event_id: eventId, ...patch })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ site: data }, { status: 201 })
}
