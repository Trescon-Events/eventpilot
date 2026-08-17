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

Generate LinkedIn post copy — aim for 500-900 characters, hard max 1300 —
written as SEPARATE SHORT PARAGRAPHS (1-2 sentences each, each its own
paragraph separated by a blank line, a literal \n\n between paragraphs in
the "copy" string). This is exactly how real, high-performing LinkedIn
event-announcement posts are formatted — short scannable blocks of
whitespace-separated text, never one dense unbroken wall of text. Favor
shorter over longer; do not pad toward the character ceiling.

1. Opening hook — one punchy line grounded in the ${speaker ? "speaker's topic/expertise" : "partner's relevance"} (a bold claim, a sharp question, or a trend statement). Do NOT name the ${speaker ? 'speaker' : 'partner'} yet — save the name for paragraph 2.
2. A DIRECT, ENERGETIC announcement that names the ${speaker ? 'speaker' : 'partner'} (with ${speaker ? 'their title and company' : 'their category'}) and explicitly states they are speaking at / joining the event — e.g. "Excited to welcome [Name] ([Title], [Company]) to the stage at [Event]!", "We're thrilled to welcome [Name] to [Event]!", or "[Name] is the latest to join our speaker lineup for [Event]!". This sentence MUST unambiguously say they ARE speaking/joining — never leave that implied only through a bio. This is the single most important paragraph; do not bury or soften it.
3. Why this ${speaker ? 'speaker' : 'partner'} matters — one credibility line grounded in their real, given experience (years, scale, a notable achievement) tied to the event's themes.
4. Event dates and venue as a single compact line, not a full sentence — e.g. "9-10 Sept 2026 | DoubleTree by Hilton, KL" — if given above.
5. A short call to action with the registration link, if given above.

Tone: confident and genuinely excited — this should read like real
enthusiasm about a great ${speaker ? 'speaker' : 'partner'} joining, not a
formal press release. Short, punchy sentences beat long, descriptive ones.

Plain text only — no markdown syntax of any kind (no **bold**, no #
headings, no - or * bullet markers). LinkedIn and every other social
platform renders a caption as plain text; markdown characters would show
up literally instead of formatting anything.

Hashtags: the event hashtag (if given) plus 4-6 relevant topic hashtags,
returned separately in "hashtags" — not inside "copy".

Return JSON only, no markdown fences: { "copy": "...", "hashtags": ["#...", "..."] }`

  // 2026-08-17: responseMimeType 'application/json' makes Gemini itself
  // guarantee syntactically valid JSON (properly escaped newlines inside
  // string values, etc.) — without it, Gemini sometimes emits a literal
  // unescaped newline inside the "copy" string, which is invalid JSON;
  // JSON.parse below would then throw, and the code fell through to
  // returning the whole raw, unparsed JSON blob (braces, field labels and
  // all) as if it were the post copy. Confirmed live: roughly 1 in 3
  // generations hit this before adding the mode.
  const model  = getGemini().getGenerativeModel({ model: 'gemini-2.5-flash', generationConfig: { responseMimeType: 'application/json' } })
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
