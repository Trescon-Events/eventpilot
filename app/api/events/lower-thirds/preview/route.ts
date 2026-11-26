import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { mergeLowerThirdConfig } from '@/app/lib/lower-thirds/config'
import { buildLowerThirdVariant, loadLtFonts, lowerThirdFontIds } from '@/app/lib/lower-thirds/data'
import { drawLowerThirdStill } from '@/app/lib/lower-thirds/render'
import { requireLowerThirdAccess, UUID_RE } from '@/app/lib/lower-thirds/access'

/* POST { event_id, config, speaker_id? } → PNG of the lower-third card (1920×1080, transparent). Nothing is stored.
   The page lays it over a sample frame and animates it in the browser with the same maths the worker uses. */

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({})) as Record<string, unknown>
  const eventId = typeof b.event_id === 'string' ? b.event_id : ''
  if (!UUID_RE.test(eventId)) return NextResponse.json({ error: 'event_id required' }, { status: 400 })
  const a = await requireLowerThirdAccess(eventId); if ('error' in a) return a.error

  const config = mergeLowerThirdConfig(b.config)
  if (!config.background_url) return NextResponse.json({ error: 'Upload the lower-third graphic first.' }, { status: 400 })

  let name = 'Jane Doe', title = 'Chief Executive Officer', company = 'Acme Corporation'
  if (typeof b.speaker_id === 'string' && UUID_RE.test(b.speaker_id)) {
    const { data: p } = await supabaseAdmin.from('event_speakers').select('name, public_name, role, company').eq('id', b.speaker_id).eq('event_id', eventId).maybeSingle()
    if (p) {
      name = ((p.public_name as string | null)?.trim() || (p.name as string | null)?.trim() || name)
      title = ((p.role as string | null) ?? '').trim(); company = ((p.company as string | null) ?? '').trim()
    }
  }
  const fonts = await loadLtFonts(lowerThirdFontIds(config))
  const png = await drawLowerThirdStill(buildLowerThirdVariant(config, fonts), { speakerId: 'preview', name, title, company, photoUrl: null, headBox: null, stillUrl: null, movUrl: null, previewUrl: null, status: 'draft', fingerprint: null })
  return new NextResponse(new Uint8Array(png), { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' } })
}
