import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'

/* GET /api/branding/placeholder-defaults
   Returns { speaker, partner } — one row each (or null if never set) from
   template_placeholder_defaults. Both rows in one call since both the
   standalone management page and the per-event template editor's
   read-only summary need both.

   PUT — body: { stakeholder_type: 'speaker'|'partner', name?, job_title?,
   company_name?, country?, photo_head_box? }
   A genuine PARTIAL update — every field is only written when the key is
   actually PRESENT in the body (checked with `in`, not `??`), so e.g. the
   PhotoPanel's "Save Head Position" action (which sends only
   stakeholder_type + photo_head_box) can never wipe out a previously
   saved name/company, and a plain text-field save can never clobber an
   existing head-box correction. Real bug caught in review before it ever
   shipped — the original version of this route always wrote every text
   field with a `?? null` fallback, which was harmless while the only
   caller (FieldsForm) always sent the complete profile together, but
   would have silently nulled out name/job_title/company_name/country the
   moment a second, narrower caller (the head-box save) was added.

   photo_head_box (2026-08-29, per Madhu — auto-detection isn't reliable
   enough to trust blindly, same reasoning a per-layer reference upload's
   draggable head marker already has) is a manual correction on top of
   whatever the photo upload route's own auto-detection produced — see
   ./photo/route.ts, which still runs detection on every fresh upload;
   this route's photo_head_box just lets the branding team override it
   afterward via the same draggable/resizable marker as the per-layer
   tool (PhotoPanel/HeadMarkerEditor below).

   2026-08-29, per Madhu: a genuinely global (not per-event) placeholder
   default — see composite.ts's GlobalPlaceholderDefault comment for the
   full rationale. Lives under /api/branding (not /api/events/templates)
   because it isn't event-scoped at all — matches the sibling
   /api/branding/fonts and /api/branding/corporate routes, which back the
   org-wide Branding admin section this is managed from
   (/admin/branding/placeholder-defaults), not any single event's
   workspace (moved there 2026-08-29 after initially — wrongly — living
   inside the per-event Creative Templates admin console). */
export async function GET() {
  const { data, error } = await supabaseAdmin.from('template_placeholder_defaults').select('*')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const speaker = (data ?? []).find(r => r.stakeholder_type === 'speaker') ?? null
  const partner = (data ?? []).find(r => r.stakeholder_type === 'partner') ?? null
  return NextResponse.json({ speaker, partner })
}

export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => null) as {
    stakeholder_type?: 'speaker' | 'partner'; name?: string; job_title?: string; company_name?: string; country?: string
    photo_head_box?: { centerXRatio: number; centerYRatio: number; heightRatio: number }
  } | null
  if (body?.stakeholder_type !== 'speaker' && body?.stakeholder_type !== 'partner') {
    return NextResponse.json({ error: "stakeholder_type must be 'speaker' or 'partner'" }, { status: 400 })
  }

  const session = getSession(req)
  // Genuine partial update — see this route's own doc comment for why `in`
  // (not `??`) is required here: a field ABSENT from the body must leave
  // the existing column untouched, not get reset to null.
  const fields: Record<string, unknown> = {}
  if ('name' in body) fields.name = body.name ?? null
  if ('job_title' in body) fields.job_title = body.job_title ?? null
  if ('company_name' in body) fields.company_name = body.company_name ?? null
  if ('country' in body) fields.country = body.country ?? null
  if ('photo_head_box' in body) fields.photo_head_box = body.photo_head_box ?? null

  const { data, error } = await supabaseAdmin
    .from('template_placeholder_defaults')
    .upsert({
      stakeholder_type: body.stakeholder_type,
      ...fields,
      updated_by: session?.sid && session.sid !== 'super-admin' ? session.sid : null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'stakeholder_type' })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
