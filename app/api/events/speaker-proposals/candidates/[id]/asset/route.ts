import { NextRequest, NextResponse } from 'next/server'
import sharp from 'sharp'
import { supabaseAdmin } from '@/app/lib/supabase'
import { uploadPublicAsset } from '@/app/lib/events/storage'
import { authCandidate, rehostPhoto, storeLogo } from '@/app/lib/proposals/server'
import { cleanLogoFromUrl } from '@/app/lib/proposals/research'
import { processLogo } from '@/app/lib/media/logo-engine'

/* POST — sets the card's photo or logo.
     JSON      { kind: 'photo' | 'logo', url }   pick one of the findings (or paste a link): photo is copied to our storage, logo is cleaned by the logo engine
     multipart { kind, file }                     upload your own: logos are cleaned the same way; photos are stored as given (JPG/PNG/WebP) */
export const maxDuration = 60
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const a = await authCandidate(req, id, 'edit'); if ('error' in a) return a.error
  const eventId = a.candidate.event_id as string
  let kind = '', url: string | null = null
  const ct = req.headers.get('content-type') ?? ''
  if (ct.includes('multipart/form-data')) {
    const form = await req.formData().catch(() => null); const file = form?.get('file'); kind = String(form?.get('kind') ?? '')
    if (!(file instanceof File) || !['photo', 'logo'].includes(kind)) return NextResponse.json({ error: 'kind and a file are required' }, { status: 400 })
    if (file.size > 12 * 1024 * 1024) return NextResponse.json({ error: 'That file is too large.' }, { status: 422 })
    const buf = Buffer.from(await file.arrayBuffer())
    try {
      if (kind === 'logo') url = await storeLogo(eventId, id, (await processLogo(buf, file.name, file.type)).buffer)
      else { const png = file.type === 'image/png'; const out = png ? buf : await sharp(buf).rotate().jpeg({ quality: 90 }).toBuffer(); url = await uploadPublicAsset(`events/${eventId}/proposals/${id}/photo-${Date.now()}.${png ? 'png' : 'jpg'}`, out, png ? 'image/png' : 'image/jpeg') }
    } catch { return NextResponse.json({ error: 'Could not read that image.' }, { status: 422 }) }
  } else {
    const b = await req.json().catch(() => null) as { kind?: string; url?: string } | null
    kind = b?.kind ?? ''
    if (!b?.url || !/^https?:\/\//i.test(b.url) || !['photo', 'logo'].includes(kind)) return NextResponse.json({ error: 'kind and an http(s) url are required' }, { status: 400 })
    if (kind === 'logo') { const png = await cleanLogoFromUrl(b.url); url = png ? await storeLogo(eventId, id, png) : null }
    else url = await rehostPhoto(eventId, id, b.url)
    if (!url) return NextResponse.json({ error: kind === 'logo' ? 'That logo could not be fetched or cleaned — try another, or upload it.' : 'That photo could not be fetched — try another, or upload it.' }, { status: 422 })
  }
  const card = { ...(a.candidate.card as Record<string, unknown>), [kind === 'logo' ? 'logo_url' : 'photo_url']: url }
  await supabaseAdmin.from('speaker_proposal_candidates').update({ card, updated_at: new Date().toISOString() }).eq('id', id)
  return NextResponse.json({ url })
}
