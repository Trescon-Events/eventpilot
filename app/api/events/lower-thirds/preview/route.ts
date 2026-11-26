import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { mergeLowerThirdConfig } from '@/app/lib/lower-thirds/config'
import { fitLowerThirdVariant, loadLtFonts, lowerThirdFontIds } from '@/app/lib/lower-thirds/data'
import { drawLowerThirdStill } from '@/app/lib/lower-thirds/render'
import { requireLowerThirdAccess, UUID_RE } from '@/app/lib/lower-thirds/access'

/* POST { event_id, config, speaker_id? } → PNG of the lower-third card (1920×1080, transparent) from a DRAFT config (template editor).
   GET  ?event_id&speaker_id             → the same, from the SAVED template (Video Kit review list).
   Nothing is stored. The page lays it over a dark frame and animates it in the browser with the same maths the worker uses. */

export async function GET(req: NextRequest) {
  const eventId = req.nextUrl.searchParams.get('event_id') ?? ''
  if (!UUID_RE.test(eventId)) return NextResponse.json({ error: 'event_id required' }, { status: 400 })
  const a = await requireLowerThirdAccess(eventId); if ('error' in a) return a.error
  const { data: s } = await supabaseAdmin.from('event_thumbnail_settings').select('lower_third_config').eq('event_id', eventId).maybeSingle()
  return render(eventId, (s as Record<string, unknown> | null)?.lower_third_config, req.nextUrl.searchParams.get('speaker_id'), 'private, max-age=120')
}

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({})) as Record<string, unknown>
  const eventId = typeof b.event_id === 'string' ? b.event_id : ''
  if (!UUID_RE.test(eventId)) return NextResponse.json({ error: 'event_id required' }, { status: 400 })
  const a = await requireLowerThirdAccess(eventId); if ('error' in a) return a.error
  return render(eventId, b.config, typeof b.speaker_id === 'string' ? b.speaker_id : null, 'no-store')
}

async function render(eventId: string, rawConfig: unknown, speakerId: string | null, cache: string) {
  const config = mergeLowerThirdConfig(rawConfig)
  if (!config.background_url) return NextResponse.json({ error: 'Upload the lower-third graphic first.' }, { status: 400 })

  let name = 'Jane Doe', title = 'Chief Executive Officer', company = 'Acme Corporation'
  if (speakerId && UUID_RE.test(speakerId)) {
    const { data: p } = await supabaseAdmin.from('event_speakers').select('name, public_name, role, company').eq('id', speakerId).eq('event_id', eventId).maybeSingle()
    if (p) {
      name = ((p.public_name as string | null)?.trim() || (p.name as string | null)?.trim() || name)
      title = ((p.role as string | null) ?? '').trim(); company = ((p.company as string | null) ?? '').trim()
    }
  }
  const fonts = await loadLtFonts(lowerThirdFontIds(config))
  const variant = await fitLowerThirdVariant(config, fonts, { name, title, company })
  const png = await drawLowerThirdStill(variant, { speakerId: 'preview', name, title, company, photoUrl: null, headBox: null, stillUrl: null, movUrl: null, previewUrl: null, status: 'draft', fingerprint: null })
  return new NextResponse(new Uint8Array(png), { headers: { 'Content-Type': 'image/png', 'Cache-Control': cache } })
}
