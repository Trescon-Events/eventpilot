import { NextRequest, NextResponse } from 'next/server'
import { uploadPublicAsset } from '@/app/lib/events/storage'
import { inspectPdf, renderPdfPagePng } from '@/app/lib/media/pdf-render'

/* POST /api/events/templates/upload-pdf
   multipart/form-data: file (single-page PDF), event_id, template_type ('speaker'|'partner'),
   expect_width_mm?, expect_height_mm? (the badge page size incl. bleed — checked within 1 mm).
   Badge layers (2026-10-02): branding exports each layer — logo block, panel, common back — as a vector PDF
   from Illustrator at the full bleed page size. This stores the PDF (used as true vector in the print file)
   and renders a PNG preview from it (what the editor and review grid composite). Returns
   { pdf_url, preview_url, width_mm, height_mm }. If the preview can't be rendered the PDF is still stored
   and `preview_error` explains, so the caller can fall back to uploading a PNG preview by hand. Like the
   sibling /upload route, it never touches events.creative_template_config — the editor assigns the URLs to a
   layer and saves via PUT /api/events/templates/variants. */

const MAX_SIZE = 25 * 1024 * 1024
const SIZE_TOLERANCE_MM = 1
const PREVIEW_WIDTH_PX = 1420 // ~600 ppi at 60 mm — crisp enough to review text fit

export async function POST(req: NextRequest) {
  const form = await req.formData()
  const file = form.get('file') as File | null
  const eventId = form.get('event_id') as string | null
  const templateType = form.get('template_type') as string | null
  const expectW = Number(form.get('expect_width_mm')) || null
  const expectH = Number(form.get('expect_height_mm')) || null

  if (!file || !eventId || !templateType) return NextResponse.json({ error: 'file, event_id, template_type required' }, { status: 400 })
  if (templateType !== 'speaker' && templateType !== 'partner') return NextResponse.json({ error: "template_type must be 'speaker' or 'partner'" }, { status: 400 })
  if (file.size > MAX_SIZE) return NextResponse.json({ error: 'File too large (max 25 MB)' }, { status: 413 })

  const buffer = Buffer.from(await file.arrayBuffer())
  let info
  try { info = await inspectPdf(buffer) } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not read that PDF.' }, { status: 400 }) }
  if (info.pages !== 1) return NextResponse.json({ error: `This PDF has ${info.pages} pages — export just this one layer as a single-page PDF.` }, { status: 400 })
  if (expectW && expectH && (Math.abs(info.widthMm - expectW) > SIZE_TOLERANCE_MM || Math.abs(info.heightMm - expectH) > SIZE_TOLERANCE_MM)) {
    return NextResponse.json({
      error: `Wrong size: this page is ${info.widthMm.toFixed(1)} × ${info.heightMm.toFixed(1)} mm but the badge page is ${expectW} × ${expectH} mm (trim plus bleed). Export the layer at the full bleed size.`,
    }, { status: 422 })
  }

  const stamp = Date.now()
  const base = `events/${eventId}/templates/badge-${templateType}-${stamp}`
  const pdf_url = await uploadPublicAsset(`${base}.pdf`, buffer, 'application/pdf')

  let preview_url: string | null = null
  let preview_error: string | null = null
  try {
    preview_url = await uploadPublicAsset(`${base}-preview.png`, await renderPdfPagePng(buffer, PREVIEW_WIDTH_PX), 'image/png')
  } catch (e) {
    console.error('[upload-pdf] preview render failed (PDF still stored):', e)
    preview_error = 'The PDF was saved but a preview could not be generated automatically — upload a PNG of the same layer as the preview.'
  }
  return NextResponse.json({ pdf_url, preview_url, preview_error, width_mm: info.widthMm, height_mm: info.heightMm })
}
