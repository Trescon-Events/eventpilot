import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { generateAnnouncementCopy, describeGeminiError } from '@/app/lib/events/announcements'
import { resolveEffectiveRules } from '@/app/lib/content/resolve-validation-rules'

/* POST /api/events/stakeholders/announcements/[id]/regenerate-copy
   Regenerates only the post copy for an existing announcement — used when
   the MM wants a different version (PRD SS6.8).

   deterministic-copy-spec (2026-09-28) — routed through the same
   generateAnnouncementCopy() shared entry point as the main generate
   route, so a regenerate gets the identical kind (org_promo/self_promo) ×
   mode (legacy/assembled) behaviour: a 'legacy' event's regenerate is the
   exact original single-call generatePostCopy()/generateSelfPromoPostCopy(),
   no validate-and-retry; an 'assembled' event's regenerate gets Stage 1-5
   in full, same as a fresh generate. validation_findings/validation_attempts
   are now stored here too (previously this route never wrote them at all). */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const { data: announcement, error: annErr } = await supabaseAdmin
    .from('stakeholder_announcements')
    .select('*')
    .eq('id', id)
    .single()
  if (annErr || !announcement) return NextResponse.json({ error: 'Announcement not found' }, { status: 404 })

  const { data: event, error: eventErr } = await supabaseAdmin
    .from('events')
    .select('name, venue, city, country, event_hashtag, registration_url, public_name, public_dates_display, public_venue_display, sae_copy_mode, announcement_line_emojis, announcement_cta_label')
    .eq('id', announcement.event_id)
    .single()
  if (eventErr || !event) return NextResponse.json({ error: 'Event not found' }, { status: 404 })

  const speaker = announcement.speaker_id
    ? (await supabaseAdmin.from('event_speakers').select('*').eq('id', announcement.speaker_id).single()).data
    : null
  const partner = announcement.partner_id
    ? (await supabaseAdmin.from('event_sponsors').select('*').eq('id', announcement.partner_id).single()).data
    : null

  const [{ data: messagingDoc }, effectiveRules] = await Promise.all([
    supabaseAdmin
      .from('event_messaging_docs')
      .select('structured_json')
      .eq('event_id', announcement.event_id)
      .eq('status', 'live')
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle(),
    resolveEffectiveRules(announcement.event_id).catch(() => []),
  ])

  // 2026-08-18: without kind-awareness, "Regenerate" on a self-promo row
  // would silently overwrite its first-person speaker-voice copy with
  // third-person org-voice copy — a real gap caught during Self Promo
  // planning, not a hypothetical. generateAnnouncementCopy() branches on
  // announcement_kind the same way the main generate route does.
  const kind: 'org_promo' | 'self_promo' = announcement.announcement_kind === 'self_promo' ? 'self_promo' : 'org_promo'
  let copy: string, xCopy: string, validationFindings: unknown, attempts: 1 | 2
  try {
    ;({ copy, xCopy, validationFindings, attempts } = await generateAnnouncementCopy(event, speaker, partner, messagingDoc?.structured_json ?? null, effectiveRules, kind))
  } catch (e) {
    console.error('Post copy regeneration failed:', e)
    return NextResponse.json({ error: describeGeminiError(e) }, { status: 502 })
  }

  const { data, error } = await supabaseAdmin
    .from('stakeholder_announcements')
    .update({ post_copy: copy, post_copy_x: xCopy, validation_findings: validationFindings, validation_attempts: attempts, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('id, post_copy, post_copy_x, validation_findings, validation_attempts')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
