import { NextRequest, NextResponse } from 'next/server'
import sharp from 'sharp'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getServerSession } from '@/app/lib/registry/access'
import { hasEventPermission } from '@/app/lib/access/event-access'
import { mergeTitleCardConfig } from '@/app/lib/title-cards/data'
import { drawTitleCard, type TitleCardPerson } from '@/app/lib/title-cards/render'
import { fetchAssetBuffer } from '@/app/lib/announcements/asset-buffer-cache'
import { getEventRoles, resolvePrimaryRole } from '@/app/lib/konfhub/roles'
import { isModeratorRole } from '@/app/lib/screens/geometry'
import type { HeadBox } from '@/app/lib/media/face-alignment'

/* Title card preview (v2)
   POST { event_id, config, session_id? }
   Returns PNG blob (1600px wide). Nothing is stored. */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const PLACEHOLDER_NAMES = ['Jane Doe', 'John Smith', 'Alex Lee', 'Maria Garcia', 'Sam Park', 'Chris Johnson']
const PLACEHOLDER_TITLE = 'Chief Executive Officer'
const PLACEHOLDER_COMPANY = 'Acme Corporation'
const PLACEHOLDER_GREY = { r: 140, g: 140, b: 150, alpha: 1 }

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({})) as Record<string, unknown>
  const eventId = typeof b.event_id === 'string' ? b.event_id : ''
  if (!UUID.test(eventId)) return NextResponse.json({ error: 'event_id required' }, { status: 400 })

  const session = await getServerSession()
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  const ok = !!session.adm || (await hasEventPermission(session.sid, eventId, 'sae.videos.manage')) || (await hasEventPermission(session.sid, eventId, 'sae.admin.access'))
  if (!ok) return NextResponse.json({ error: 'No access.' }, { status: 403 })

  const config = mergeTitleCardConfig(b.config)
  const sessionId = typeof b.session_id === 'string' && UUID.test(b.session_id) ? b.session_id : null

  let people: TitleCardPerson[]

  if (sessionId) {
    // Real session: load actual speakers
    const [{ data: sessionRow }, { data: links }, roles] = await Promise.all([
      supabaseAdmin.from('event_agenda_sessions').select('title, content_type, track_id').eq('id', sessionId).maybeSingle(),
      supabaseAdmin.from('event_agenda_session_speakers').select('speaker_id, role_tag_id, order_index').eq('session_id', sessionId).order('order_index'),
      getEventRoles(eventId),
    ])
    if (!sessionRow) return NextResponse.json({ error: 'Session not found.' }, { status: 404 })

    const speakerIds = [...new Set((links ?? []).map(l => l.speaker_id as string))]
    if (!speakerIds.length) return NextResponse.json({ error: 'No speakers on this session.' }, { status: 400 })

    const { data: speakers } = await supabaseAdmin.from('event_speakers')
      .select('id, name, public_name, job_title, company, website_card_url, photo_processed_url, photo_head_box, konfhub_primary_role_tag_id')
      .eq('event_id', eventId).eq('active', true).in('id', speakerIds)

    const person = new Map((speakers ?? []).map(p => [p.id as string, p]))
    const roleLabel = new Map(roles.map(r => [r.tag_id, r.label]))
    const useWebsite = config.card_design !== 'template'

    const byPerson = new Map<string, { moderator: boolean; order: number }>()
    for (const l of links ?? []) {
      const tag = l.role_tag_id || resolvePrimaryRole(person.get(l.speaker_id as string)?.konfhub_primary_role_tag_id as string | null | undefined, roles)?.tag_id
      const mod = isModeratorRole(tag ? roleLabel.get(tag as string) : null)
      const prev = byPerson.get(l.speaker_id as string)
      byPerson.set(l.speaker_id as string, { moderator: (prev?.moderator ?? false) || mod, order: Math.min(prev?.order ?? 1e9, (l.order_index as number | null) ?? 0) })
    }

    const placeholderGrey = await sharp({ create: { width: 300, height: 300, channels: 4, background: PLACEHOLDER_GREY } }).png().toBuffer()
    const clean = (v: unknown) => typeof v === 'string' ? v.trim() : ''

    people = await Promise.all([...byPerson.entries()]
      .filter(([id]) => person.has(id))
      .sort((a, b) => Number(b[1].moderator) - Number(a[1].moderator) || a[1].order - b[1].order)
      .map(async ([id, m]) => {
        const p = person.get(id)!
        const websiteUrl = (p.website_card_url as string | null) ?? null
        const cleanedUrl = (p.photo_processed_url as string | null) ?? null
        const photoUrl = useWebsite ? (websiteUrl ?? cleanedUrl) : (cleanedUrl ?? websiteUrl)
        const headBox = (useWebsite && websiteUrl) ? null : ((p.photo_head_box as HeadBox | null) ?? null)
        const buffer = photoUrl ? (await fetchAssetBuffer(photoUrl)) ?? placeholderGrey : placeholderGrey
        return {
          name: clean(p.public_name) || clean(p.name) || `Speaker ${id.slice(0, 4)}`,
          title: clean(p.job_title),
          company: clean(p.company),
          moderator: m.moderator,
          buffer,
          url: photoUrl ?? 'placeholder',
          headBox,
        }
      }))
  } else {
    // Placeholder preview
    const placeholderGrey = await sharp({ create: { width: 300, height: 300, channels: 4, background: PLACEHOLDER_GREY } }).png().toBuffer()
    const count = typeof b.speaker_count === 'number' ? Math.max(1, Math.min(6, Math.round(b.speaker_count))) : 3
    const hasModerator = b.has_moderator === true
    people = Array.from({ length: count }, (_, i) => ({
      name: PLACEHOLDER_NAMES[i] ?? `Speaker ${i + 1}`,
      title: PLACEHOLDER_TITLE,
      company: PLACEHOLDER_COMPANY,
      moderator: hasModerator && i === 0,
      buffer: placeholderGrey,
      url: 'placeholder',
      headBox: null,
    }))
  }

  const tagStr = typeof b.session_tag === 'string' ? b.session_tag.trim() : 'KEYNOTE'
  const stageStr = typeof b.session_stage === 'string' ? b.session_stage.trim() : 'Plenary - 1'
  const titleStr = typeof b.session_title === 'string' ? b.session_title.trim() : 'The Future of Finance: Innovation at Scale'

  try {
    const png = await drawTitleCard(config, { tag: tagStr || undefined, stage: stageStr || undefined, title: titleStr }, people)
    const small = await sharp(png).resize({ width: 1600, withoutEnlargement: true }).png().toBuffer()
    return new NextResponse(new Uint8Array(small), { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' } })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Render failed.' }, { status: 500 })
  }
}
