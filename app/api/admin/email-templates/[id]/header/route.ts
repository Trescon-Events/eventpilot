import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { uploadPublicAsset } from '@/app/lib/events/storage'
import { getStakeholderHeaderUrl } from '@/app/lib/branding/email-header'
import { compositeHeaderText } from '@/app/lib/email/header-composite'

/* POST /api/admin/email-templates/[id]/header
   - multipart/form-data with a `file` field — replaces the BASE header
     image (header_base_image_url), independent of the corporate default.
   - application/json { action: 'reset' } — re-copies the CURRENT
     corporate default onto header_base_image_url.
   - application/json { action: 'set_overlay_text', text } — sets/clears
     header_overlay_text (text: '' or omitted clears it).

   All three funnel through recomputeHeaderImage(), which is the ONLY
   place header_image_url is ever written — it's a computed field (base
   image as-is, or a server-composited version with the overlay text
   baked in via Sharp, see app/lib/email/header-composite.ts) — never
   directly PATCHable, so it can't drift out of sync with its inputs.
   Platform admin only. */

async function recomputeHeaderImage(id: string, sessionSid: string, baseUrl: string | null, overlayText: string | null) {
  const finalUrl = baseUrl && overlayText?.trim()
    ? await uploadPublicAsset(`email-templates/${id}/header-${Date.now()}.png`, await compositeHeaderText(baseUrl, overlayText.trim()), 'image/png')
    : baseUrl

  return supabaseAdmin
    .from('email_templates')
    .update({
      header_base_image_url: baseUrl,
      header_overlay_text: overlayText?.trim() || null,
      header_image_url: finalUrl,
      updated_at: new Date().toISOString(),
      updated_by: sessionSid,
    })
    .eq('id', id)
    .select()
    .single()
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSession(req)
  if (!session?.adm) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  const { id } = await params

  const { data: existing, error: existingErr } = await supabaseAdmin
    .from('email_templates')
    .select('header_base_image_url, header_overlay_text')
    .eq('id', id)
    .single()
  if (existingErr || !existing) return NextResponse.json({ error: 'Template not found' }, { status: 404 })

  const contentType = req.headers.get('content-type') ?? ''
  let result

  try {
    if (contentType.includes('multipart/form-data')) {
      const form = await req.formData()
      const file = form.get('file') as File | null
      if (!file) return NextResponse.json({ error: 'file required' }, { status: 400 })

      const buffer = Buffer.from(await file.arrayBuffer())
      const ext = file.name.split('.').pop()?.toLowerCase() || 'png'
      const newBaseUrl = await uploadPublicAsset(`email-templates/${id}/header-base-${Date.now()}.${ext}`, buffer, file.type)
      result = await recomputeHeaderImage(id, session.sid, newBaseUrl, existing.header_overlay_text)
    } else {
      const body = await req.json().catch(() => null) as { action?: string; text?: string } | null
      if (body?.action === 'reset') {
        const corpDefault = await getStakeholderHeaderUrl()
        result = await recomputeHeaderImage(id, session.sid, corpDefault, existing.header_overlay_text)
      } else if (body?.action === 'set_overlay_text') {
        result = await recomputeHeaderImage(id, session.sid, existing.header_base_image_url, body.text ?? null)
      } else {
        return NextResponse.json({ error: "expected multipart file upload, { action: 'reset' }, or { action: 'set_overlay_text', text }" }, { status: 400 })
      }
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Header update failed' }, { status: 500 })
  }

  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 500 })
  return NextResponse.json(result.data)
}
