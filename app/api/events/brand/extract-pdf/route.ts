import { NextRequest, NextResponse } from 'next/server'
import { extractBrandGuidelinesFromPdfUrl, ExtractionError } from '@/app/lib/branding/extract-guidelines'
import { supabaseAdmin } from '@/app/lib/supabase'

export const maxDuration = 300

/* POST /api/events/brand/extract-pdf
   { pdf_url: string, event_id?: string }
   1-4: extractBrandGuidelinesFromPdfUrl() (app/lib/branding/extract-guidelines.ts)
        fetches the PDF, uploads to Gemini Files API, extracts all brand
        elements across 9 sections, returns full structured brand JSON.
        Shared with the corporate (non-event-scoped) brand guidelines
        section — 2026-08-06.
   5. If event_id provided, upserts to event_brand_guidelines
*/

export async function POST(req: NextRequest) {
  try {
    const { pdf_url, event_id } = await req.json()
    if (!pdf_url) return NextResponse.json({ error: 'pdf_url is required' }, { status: 400 })

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
