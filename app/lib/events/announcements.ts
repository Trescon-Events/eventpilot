// Shared generation logic for the Stakeholder Announcement Engine — used by
// announcements/generate and both regenerate-* routes, so the copy/creative
// pipeline is defined once rather than duplicated across three route files.
import { GoogleGenerativeAI } from '@google/generative-ai'
import type { Variant, PhotoSlotLayer, CreativeTemplateConfig } from '@/app/lib/announcements/composite'
import type { HeadBox } from '@/app/lib/media/face-alignment'

let _gemini: GoogleGenerativeAI | null = null
function getGemini() {
  if (!_gemini) _gemini = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
  return _gemini
}

export type EventContext = {
  name: string
  venue: string | null; city: string | null
  event_hashtag: string | null; registration_url: string | null
  // Public-facing overrides (Event Details page) — preferred over the raw
  // fields above when set, since announcement copy is external content.
  // public_dates_display has NO fallback to event_date/end_date — those
  // are the Staff Portal project's staff-allocation window, not the
  // event's actual dates (Madhu, 2026-08-13), and would be actively wrong
  // if surfaced as "the event's dates" in generated copy.
  public_name?: string | null; public_dates_display?: string | null; public_venue_display?: string | null
}

export async function generatePostCopy(
  event: EventContext,
  speaker: Record<string, unknown> | null,
  partner: Record<string, unknown> | null,
  messagingJson: Record<string, unknown> | null
): Promise<string> {
  const dates = event.public_dates_display ?? ''
  const venueLine = event.public_venue_display || (event.venue ? `${event.venue}${event.city ? `, ${event.city}` : ''}` : null)
  const eventContext = [
    `Event: ${event.public_name || event.name}`,
    dates && `Dates: ${dates}`,
    venueLine && `Venue: ${venueLine}`,
    event.event_hashtag && `Hashtag: ${event.event_hashtag}`,
    event.registration_url && `Registration: ${event.registration_url}`,
  ].filter(Boolean).join('\n')

  const messagingContext = messagingJson
    ? `Messaging doc context (use for positioning/tone/themes — do not invent facts beyond this). Any section with "kind":"rules" is a hard constraint (naming/style rules, verbatim lines, things that must never appear) — never violate it, even if it conflicts with your default instincts:\n${JSON.stringify(messagingJson)}`
    : 'No topline messaging doc uploaded for this event yet — write in a neutral, professional Trescon voice.'

  const stakeholderContext = speaker
    ? `Speaker: ${speaker.name}, ${speaker.role} at ${speaker.company}${speaker.country ? `, ${speaker.country}` : ''}.\nBio: ${speaker.bio ?? '(not provided)'}`
    : `Partner: ${partner!.name}, category: ${String(partner!.partner_type).replace(/_/g, ' ')}.\nDescription: ${partner!.company_description ?? '(not provided)'}`

  const prompt = `You are writing social media announcement posts for Trescon events.
You write in the established Trescon voice: confident, data-driven, forward-looking.
Grounded only in the provided data — never fabricate credentials, statistics, or event details not given below.

${eventContext}

${messagingContext}

${stakeholderContext}

Generate LinkedIn post copy (max 1300 characters), written as four SEPARATE
SHORT PARAGRAPHS — one for each of the sections below, each 1-3 sentences,
each its own paragraph separated by a blank line (a literal \n\n between
paragraphs in the "copy" string). This is exactly how real, readable
LinkedIn posts are actually formatted — short scannable blocks of
whitespace-separated text, never one dense unbroken wall of text:
1. Opening hook, grounded in the ${speaker ? "speaker's expertise" : "company's relevance"}
2. Why this ${speaker ? 'speaker' : 'partner'} matters to the event audience
3. Event dates and venue, if given above
4. A call to action, including the registration link if given above

Plain text only — no markdown syntax of any kind (no **bold**, no #
headings, no - or * bullet markers). LinkedIn and every other social
platform renders a caption as plain text; markdown characters would show
up literally instead of formatting anything.

Hashtags: the event hashtag (if given) plus 4-6 relevant topic hashtags,
returned separately in "hashtags" — not inside "copy".

Return JSON only, no markdown fences: { "copy": "...", "hashtags": ["#...", "..."] }`

  const model  = getGemini().getGenerativeModel({ model: 'gemini-2.5-flash' })
  const result = await model.generateContent([{ text: prompt }])
  const text   = result.response.text().trim()

  try {
    const match = text.match(/\{[\s\S]*\}/)
    if (match) {
      const parsed = JSON.parse(match[0]) as { copy?: string; hashtags?: string[] }
      if (parsed.copy) return [parsed.copy, ...(parsed.hashtags ?? [])].join('\n\n')
    }
  } catch {
    // fall through to raw text
  }
  return text
}

export type { CreativeTemplateConfig }

export type NeededAsset = { source: PhotoSlotLayer['source']; url: string; isSvg: boolean; headBox?: HeadBox | null }

export type CompositeInputs = {
  variant: Variant
  assetsNeeded: NeededAsset[]
  texts: { name?: string; title?: string; company?: string; tier?: string }
}

// Resolves a real asset URL for a photo_slot layer's `source` from the
// stakeholder row — the one place that knows what each source name means.
function resolveAssetUrl(
  source: PhotoSlotLayer['source'],
  speaker: Record<string, unknown> | null,
  partner: Record<string, unknown> | null
): string | null {
  if (source === 'speaker_photo') return (speaker?.photo_processed_url as string | null) ?? (speaker?.photo_url as string | null)
  if (source === 'speaker_logo') return speaker?.company_logo_url as string | null
  return partner?.logo_url as string | null // partner_logo
}

export function buildCompositeInputs(
  stakeholderType: 'speaker' | 'partner',
  speaker: Record<string, unknown> | null,
  partner: Record<string, unknown> | null,
  templateConfig: CreativeTemplateConfig | null,
  useCompanyLogo: boolean,
  variantId?: string
): CompositeInputs | { templateError: string } {
  const variants = templateConfig?.[stakeholderType]?.variants ?? []
  const variant = (variantId ? variants.find(v => v.id === variantId) : null) ?? variants[0]
  if (!variant) {
    return { templateError: `No creative template configured for this event's ${stakeholderType}s (events.creative_template_config.${stakeholderType}.variants)` }
  }

  // Only require assets for sources the chosen variant's layers actually reference.
  const sourcesNeeded = new Set(
    variant.layers.filter((l): l is PhotoSlotLayer => l.type === 'photo_slot').map(l => l.source)
  )
  // A speaker variant using useCompanyLogo swaps its photo source for the company logo.
  const effectiveSources = new Set(sourcesNeeded)
  if (stakeholderType === 'speaker' && useCompanyLogo && effectiveSources.has('speaker_photo')) {
    effectiveSources.delete('speaker_photo')
    effectiveSources.add('speaker_logo')
  }

  const assetsNeeded: NeededAsset[] = []
  for (const source of effectiveSources) {
    const url = resolveAssetUrl(source, speaker, partner)
    if (!url) {
      const label = source === 'speaker_photo' ? 'photo' : source === 'speaker_logo' ? 'company logo' : 'logo'
      return { templateError: `This ${stakeholderType} has no ${label} uploaded (required by variant "${variant.name}")` }
    }
    const headBox = source === 'speaker_photo' ? (speaker?.photo_head_box as HeadBox | null | undefined) : undefined
    assetsNeeded.push({ source, url, isSvg: url.toLowerCase().endsWith('.svg'), headBox })
  }

  const texts = stakeholderType === 'speaker'
    ? { name: String(speaker?.name ?? ''), title: String(speaker?.role ?? ''), company: String(speaker?.company ?? '') }
    : {}

  return { variant, assetsNeeded, texts }
}
