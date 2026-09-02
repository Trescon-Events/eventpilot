import { NextRequest, NextResponse } from 'next/server'
import { extractBrandGuidelinesFromPdfUrl, ExtractionError } from '@/app/lib/branding/extract-guidelines'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getServerSession } from '@/app/lib/registry/access'
import { hasEventPermission } from '@/app/lib/access/event-access'

export const maxDuration = 300

/* POST /api/events/brand/extract-pdf
   { pdf_url: string, event_id?: string }
   1-4: extractBrandGuidelinesFromPdfUrl() (app/lib/branding/extract-guidelines.ts)
        fetches the PDF, uploads to Gemini Files API, extracts all brand
        elements across 9 sections, returns full structured brand JSON.
        The LIB FUNCTION is also called directly (server-side, not via this
        HTTP route) by app/api/branding/corporate/route.ts for the
        non-event-scoped corporate branding page — 2026-08-06. This HTTP
        route itself, though, only ever has two real callers, both
        event-scoped and both always passing event_id: the per-event
        Website Builder (app/admin/events/[id]/website/page.tsx) and Brand
        Studio (app/admin/events/[id]/brand/page.tsx) pages — confirmed via
        grep, no other caller exists. So the gate here only needs to accept
        either of those two tools' event permissions, not the corporate
        page's own (separate) gate.
   5. If event_id provided, upserts to event_brand_guidelines
*/

export async function POST(req: NextRequest) {
  try {
    const { pdf_url, event_id } = await req.json()
    if (!pdf_url) return NextResponse.json({ error: 'pdf_url is required' }, { status: 400 })

    const session = await getServerSession()
    if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    if (!session.adm) {
      if (!event_id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      const ok =
        (await hasEventPermission(session.sid, event_id, 'brand-studio.view')) ||
        (await hasEventPermission(session.sid, event_id, 'website-builder.view'))
      if (!ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const result = await extractBrandGuidelinesFromPdfUrl(pdf_url)

    if (event_id) {
      const { error: dbErr } = await supabaseAdmin
        .from('event_brand_guidelines')
        .upsert({ event_id, ...result }, { onConflict: 'event_id' })
      if (dbErr) {
        console.error('DB upsert error (returning data anyway):', dbErr.message)
      }
    }

    return NextResponse.json(result)

  } catch (e) {
    const status = e instanceof ExtractionError ? e.status : 500
    const msg = e instanceof Error ? e.message : String(e)
    console.error('extract-pdf error:', msg)
    return NextResponse.json({ error: msg }, { status })
  }
}
