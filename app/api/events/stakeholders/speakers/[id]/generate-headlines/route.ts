import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'
import { generateHeadlines, describeGeminiError, type HeadlineVariant } from '@/app/lib/events/announcements'
import { getLatestCompiledReference } from '@/app/lib/content/compile-reference'
import { resolveEffectiveRules } from '@/app/lib/content/resolve-validation-rules'
import { validateText } from '@/app/lib/content/validate'

/* POST /api/events/stakeholders/speakers/[id]/generate-headlines

   Proposes a fresh batch of 5 creative-headline options (the bold on-image
   phrase, distinct from post_copy) for this SPEAKER — generated once here
   and reused by every announcement/creative made for them afterward (see
   buildCompositeInputs in announcements.ts), not a per-announcement thing.
   Propose-only, same contract as generate-short-bio: never writes to the
   DB itself — the record page applies the returned batch via the existing
   PATCH .../speakers/[id] route (which also recomputes compliance
   server-side on every subsequent inline edit). */

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const { data: speaker, error: speakerErr } = await supabaseAdmin
    .from('event_speakers')
    .select('*')
    .eq('id', id)
    .single()
  if (speakerErr || !speaker) return NextResponse.json({ error: 'Speaker not found' }, { status: 404 })

  const session = getSession(req)
  if (!session?.adm && !(await hasEventPermission(session?.sid, speaker.event_id, 'sae.stakeholders.edit'))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  const [eventRes, compiledRef, effectiveRules] = await Promise.all([
    supabaseAdmin
      .from('events')
      .select('name, venue, city, event_hashtag, registration_url, public_name, public_dates_display, public_venue_display')
      .eq('id', speaker.event_id)
      .single(),
    getLatestCompiledReference(speaker.event_id),
    resolveEffectiveRules(speaker.event_id).catch(() => []),
  ])

  const event = eventRes.data
  if (eventRes.error || !event) return NextResponse.json({ error: 'Event not found' }, { status: 404 })

  // Same compiled-reference-then-raw-doc-fallback as announcements/generate
  // and generate-short-bio — grounding never silently drops just because a
  // compile hasn't run yet for this event.
  let messagingSections = compiledRef?.sections ?? null
  if (!messagingSections) {
    const { data: rawDoc } = await supabaseAdmin
      .from('event_messaging_docs').select('structured_json')
      .eq('event_id', speaker.event_id).eq('status', 'live')
      .order('version', { ascending: false }).limit(1).maybeSingle()
    messagingSections = (rawDoc?.structured_json as { sections?: unknown } | null)?.sections as typeof messagingSections ?? null
  }
  const messagingJson = messagingSections ? { sections: messagingSections } : null

  let segments: Awaited<ReturnType<typeof generateHeadlines>>
  try {
    segments = await generateHeadlines(event, speaker, messagingJson)
  } catch (e) {
    console.error('Headline generation failed:', e)
    return NextResponse.json({ error: describeGeminiError(e) }, { status: 502 })
  }
  if (segments.length === 0) {
    return NextResponse.json({ error: 'Could not generate headlines — please try again.' }, { status: 502 })
  }

  // Validated against the natural-case draft, before any uppercase render
  // transform — see composite.ts's resolveTextValue()/TextLayer.uppercase,
  // which only ever applies at final render time, never to stored text.
  const headline_variants: HeadlineVariant[] = segments.map(s => ({
    id: crypto.randomUUID(),
    segments: s,
    edited: false,
    compliance: validateText([s.lead, s.emphasis, s.trail].filter(Boolean).join(' '), effectiveRules),
  }))

  return NextResponse.json({ headline_variants })
}
