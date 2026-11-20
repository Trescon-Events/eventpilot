import { NextRequest, NextResponse } from 'next/server'
import { requireScreens } from '@/app/lib/screens/service'
import { loadThumbnailSessions, type ThumbSession } from '@/app/lib/thumbnails/data'
import { MAX_PER_CALL, MAX_SPEAKERS } from '@/app/lib/thumbnails/geometry'
import { ThumbError, approveThumbnail, generateThumbnails, generateTitleCards, approveAll, unapproveAll, saveOverrides, saveSettings, saveTitleCardSettings, unapproveThumbnail } from '@/app/lib/thumbnails/service'
import { loadTitleCardSessions } from '@/app/lib/title-cards/data'
import { loadLowerThirdSessions } from '@/app/lib/lower-thirds/data'
import { generateLowerThirdStill, enqueueLowerThirdJob } from '@/app/lib/lower-thirds/service'

/* Session thumbnails + title cards + lower thirds (Session Videos → Thumbnails tab)
   GET   ?event_id=…
   POST  actions: save_settings | save_title_card_settings | generate | generate_title_cards | generate_lower_third_still | enqueue_lower_third_mov
                  save_overrides | approve | approve_all | unapprove | unapprove_all */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const brief = (s: ThumbSession) => ({
  id: s.id, position: s.position, title: s.title, session_title: s.sessionTitle, format: s.format, date: s.date, start: s.startHM, stage: s.stage, layout: s.layout, tag: s.tag,
  cards: s.cards.map(c => ({ speaker_id: c.speakerId, moderator: c.moderator, name: c.name, company: c.company, base_name: c.baseName, base_company: c.baseCompany, ready: c.ready })),
  candidates: s.candidates.map(c => ({ speaker_id: c.speakerId, name: c.name, moderator: c.moderator, excluded: c.excluded })),
  overrides: s.overrides, issues: s.issues, state: s.state, png_url: s.pngUrl, jpg_url: s.jpgUrl, generated_at: s.generatedAt, approved_at: s.approvedAt, file_base: s.fileBase,
})

export async function GET(req: NextRequest) {
  const eventId = req.nextUrl.searchParams.get('event_id') ?? ''
  if (!UUID.test(eventId)) return NextResponse.json({ error: 'event_id required' }, { status: 400 })
  const a = await requireScreens(req, eventId, 'view'); if ('error' in a) return a.error
  try {
    const [{ setup, sessions, timezone }, tcData, ltData] = await Promise.all([
      loadThumbnailSessions(eventId),
      loadTitleCardSessions(eventId),
      loadLowerThirdSessions(eventId),
    ])
    const edit = await requireScreens(req, eventId, 'edit')
    return NextResponse.json({
      timezone, max_speakers: MAX_SPEAKERS, can_edit: !('error' in edit),
      settings: { card_variant_id: setup.settings.cardVariantId, layout_variant_ids: setup.settings.layoutVariantIds, card_text: setup.settings.cardText },
      missing: setup.missing, variants: setup.variants,
      sessions: sessions.map(brief),
      title_cards: {
        setup: { missing: tcData.setup.missing, layout_variant_id: tcData.setup.settings.layoutVariantId, card_variant_id: tcData.setup.settings.cardVariantId },
        sessions: tcData.sessions.map(s => ({ id: s.id, state: s.state, png_url: s.pngUrl, fingerprint: s.fingerprint })),
      },
      lower_thirds: {
        setup: { missing: ltData.setup.missing, variant_id: ltData.setup.variantId },
        sessions: ltData.sessions.map(s => ({
          id: s.id,
          speakers: s.speakers.map(sp => ({ speaker_id: sp.speakerId, name: sp.name, status: sp.status, still_url: sp.stillUrl, preview_url: sp.previewUrl, fingerprint: sp.fingerprint })),
        })),
      },
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not load.' }, { status: 500 }) }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as Record<string, unknown> | null
  const eventId = typeof body?.event_id === 'string' ? body.event_id : ''
  if (!body || typeof body.action !== 'string' || !UUID.test(eventId)) return NextResponse.json({ error: 'action and event_id required' }, { status: 400 })
  const a = await requireScreens(req, eventId, 'edit'); if ('error' in a) return a.error
  const by = a.session.sid
  const sid = typeof body.session_id === 'string' && UUID.test(body.session_id) ? body.session_id : null
  const spid = typeof body.speaker_id === 'string' && UUID.test(body.speaker_id) ? body.speaker_id : null
  try {
    switch (body.action) {
      case 'save_settings': await saveSettings(eventId, body, by); return NextResponse.json({ ok: true })
      case 'save_title_card_settings': await saveTitleCardSettings(eventId, body, by); return NextResponse.json({ ok: true })
      case 'generate': {
        const ids = (Array.isArray(body.session_ids) ? body.session_ids : []).filter((x): x is string => typeof x === 'string' && UUID.test(x)).slice(0, MAX_PER_CALL)
        if (!ids.length) return NextResponse.json({ error: 'session_ids required' }, { status: 400 })
        return NextResponse.json(await generateThumbnails(eventId, ids, by))
      }
      case 'generate_title_cards': {
        const ids = (Array.isArray(body.session_ids) ? body.session_ids : []).filter((x): x is string => typeof x === 'string' && UUID.test(x)).slice(0, MAX_PER_CALL)
        if (!ids.length) return NextResponse.json({ error: 'session_ids required' }, { status: 400 })
        return NextResponse.json(await generateTitleCards(eventId, ids, by))
      }
      case 'generate_lower_third_still':
        if (!sid || !spid) return NextResponse.json({ error: 'session_id and speaker_id required' }, { status: 400 })
        return NextResponse.json(await generateLowerThirdStill(eventId, sid, spid, by))
      case 'enqueue_lower_third_mov':
        if (!sid || !spid) return NextResponse.json({ error: 'session_id and speaker_id required' }, { status: 400 })
        await enqueueLowerThirdJob(eventId, sid, spid, by); return NextResponse.json({ ok: true })
      case 'save_overrides': if (!sid) return NextResponse.json({ error: 'session_id required' }, { status: 400 }); return NextResponse.json({ overrides: await saveOverrides(eventId, sid, body.overrides, by) })
      case 'approve': if (!sid) return NextResponse.json({ error: 'session_id required' }, { status: 400 }); await approveThumbnail(eventId, sid, by); return NextResponse.json({ ok: true })
      case 'approve_all': if (!sid) return NextResponse.json({ error: 'session_id required' }, { status: 400 }); await approveAll(eventId, sid, by); return NextResponse.json({ ok: true })
      case 'unapprove': if (!sid) return NextResponse.json({ error: 'session_id required' }, { status: 400 }); await unapproveThumbnail(eventId, sid, by); return NextResponse.json({ ok: true })
      case 'unapprove_all': if (!sid) return NextResponse.json({ error: 'session_id required' }, { status: 400 }); await unapproveAll(eventId, sid, by); return NextResponse.json({ ok: true })
      default: return NextResponse.json({ error: 'Unknown action.' }, { status: 400 })
    }
  } catch (e) {
    if (e instanceof ThumbError) return NextResponse.json({ error: e.message }, { status: e.status })
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed.' }, { status: 500 })
  }
}
