import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import type { Variant } from '@/app/lib/announcements/composite'
import { resolvePreviewInputs } from '@/app/lib/announcements/preview-inputs'
import { buildBadgePrintPdf } from '@/app/lib/badges/print-pdf'

/* POST /api/events/templates/print-preview
   Body: { event_id, stakeholder_type, variant (draft, unsaved) }
   Builds a REAL sample print file for a speaker-badge template from the same placeholder photo/text the editor's
   preview uses: instruction page, the badge, then the common back. Returned as a PDF download — nothing is stored.
   Branding opens it in Illustrator/Acrobat to verify size, bleed, vector layers and outlined text before any real batch. */

export const maxDuration = 90

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as { event_id?: string; stakeholder_type?: 'speaker' | 'partner'; variant?: Variant } | null
  if (!body?.event_id || !body.variant || (body.stakeholder_type !== 'speaker' && body.stakeholder_type !== 'partner')) {
    return NextResponse.json({ error: 'event_id, stakeholder_type, variant required' }, { status: 400 })
  }
  if (body.variant.category !== 'badge' || !body.variant.print) {
    return NextResponse.json({ error: 'Only Speaker Badge templates can produce a print file.' }, { status: 422 })
  }
  try {
    const [{ data: event }, inputs] = await Promise.all([
      supabaseAdmin.from('events').select('name').eq('id', body.event_id).single(),
      resolvePreviewInputs({ stakeholder_type: body.stakeholder_type, variant: body.variant, event_id: body.event_id }),
    ])
    const eventName = (event?.name as string | undefined) ?? 'Event'
    const pdf = await buildBadgePrintPdf({ variant: body.variant, assets: inputs.assets, texts: inputs.texts, eventName, sample: true })
    const safe = `${eventName}-${body.variant.name || 'badge'}`.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '')
    return new NextResponse(new Uint8Array(pdf), {
      headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${safe}-sample-print.pdf"`, 'Cache-Control': 'no-store' },
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not build the print file.' }, { status: 500 })
  }
}
