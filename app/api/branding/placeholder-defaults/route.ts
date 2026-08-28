import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'

/* GET /api/branding/placeholder-defaults
   Returns { speaker, partner } — one row each (or null if never set) from
   template_placeholder_defaults. Both rows in one call since both the
   standalone management page and the per-event template editor's
   read-only summary need both.

   PUT — body: { stakeholder_type: 'speaker'|'partner', name?, job_title?,
   company_name?, country? }
   Upserts the TEXT fields only — the photo is a separate route (see
   ./photo/route.ts) since it's a file upload, not JSON.

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
  } | null
  if (body?.stakeholder_type !== 'speaker' && body?.stakeholder_type !== 'partner') {
    return NextResponse.json({ error: "stakeholder_type must be 'speaker' or 'partner'" }, { status: 400 })
  }

  const session = getSession(req)
  const { data, error } = await supabaseAdmin
    .from('template_placeholder_defaults')
    .upsert({
      stakeholder_type: body.stakeholder_type,
      name: body.name ?? null,
      job_title: body.job_title ?? null,
      company_name: body.company_name ?? null,
      country: body.country ?? null,
      updated_by: session?.sid && session.sid !== 'super-admin' ? session.sid : null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'stakeholder_type' })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
