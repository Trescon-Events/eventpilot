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

// Third-person reference guidance for org-promo copy — matches
// event_speakers.pronoun_style's CHECK constraint exactly (see
// supabase/sae_migration.sql). Self-promo copy is first-person and never
// needs this.
const PRONOUN_GUIDANCE: Record<string, string> = {
  he_him: 'he/him',
  she_her: 'she/her',
  his_excellency: '"His Excellency" (not "he/him")',
  her_excellency: '"Her Excellency" (not "she/her")',
  his_highness: '"His Highness" (not "he/him")',
  her_highness: '"Her Highness" (not "she/her")',
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

  // 2026-08-18: public_name overrides the raw `name` for anything
  // public-facing (creatives, both copy generators, future website) — same
  // fallback pattern as event.public_name above. pronoun_style/
  // key_talking_points are producer-editable fields that ground the copy;
  // both degrade silently to nothing when unset, never injecting a literal
  // "undefined"/"null" into the prompt.
  const speakerName = speaker ? (speaker.public_name || speaker.name) : null
  const pronounGuidance = speaker?.pronoun_style ? `\nRefer to this speaker as: ${PRONOUN_GUIDANCE[speaker.pronoun_style as string] ?? ''}` : ''
  const talkingPoints = speaker?.key_talking_points
    ? `\nKey talking points (ground the copy in these specifically when relevant, don't just restate them verbatim): ${speaker.key_talking_points}`
    : ''

  const stakeholderContext = speaker
    ? `Speaker: ${speakerName}, ${speaker.role} at ${speaker.company}${speaker.country ? `, ${speaker.country}` : ''}.\nBio: ${speaker.bio ?? '(not provided)'}${talkingPoints}${pronounGuidance}`
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
  return parseGeminiCopyResponse(result.response.text().trim())
}

// 2026-08-18: responseMimeType 'application/json' cuts the failure rate but
// does NOT guarantee it — confirmed live, Gemini still occasionally emits a
// literal unescaped newline inside the "copy" string (invalid JSON; a raw
// newline is a bare control character, only \n the two-char escape is
// legal inside a JSON string). JSON.parse has zero tolerance for that, so
// without this the whole raw {"copy":...,"hashtags":[...]} blob leaks
// through the old catch-and-fallback. Walk the matched text as a tiny state
// machine and escape control chars only while inside a string literal
// (never inside object/array structural whitespace, which would corrupt
// the JSON the other way) before parsing.
function sanitizeJsonControlChars(s: string): string {
  let out = ''
  let inString = false
  let escaped = false
  for (const ch of s) {
    if (escaped) { out += ch; escaped = false; continue }
    if (ch === '\\') { out += ch; escaped = true; continue }
    if (ch === '"') { inString = !inString; out += ch; continue }
    if (inString && (ch === '\n' || ch === '\r' || ch === '\t')) {
      out += ch === '\n' ? '\\n' : ch === '\r' ? '\\r' : '\\t'
      continue
    }
    out += ch
  }
  return out
}

// Shared by generatePostCopy and generateSelfPromoPostCopy — both call
// Gemini in JSON mode and want the same { copy, hashtags } → joined-string
// extraction, with the same raw-text fallback if parsing ever fails.
function parseGeminiCopyResponse(text: string): string {
  try {
    const match = text.match(/\{[\s\S]*\}/)
    if (match) {
      const parsed = JSON.parse(sanitizeJsonControlChars(match[0])) as { copy?: string; hashtags?: string[] }
      if (parsed.copy) return [parsed.copy, ...(parsed.hashtags ?? [])].join('\n\n')
    }
  } catch {
    // fall through to raw text
  }
  return text
}

// Self Promo module (2026-08-18): a creative + post copy emailed TO the
// speaker so THEY can post it themselves, rather than the org posting on
// its own channels. The copy must therefore read as genuinely theirs —
// first person, reflective, no third-person references and no hard-sell
// CTA energy (that belongs to generatePostCopy's org voice, not this one).
// Speaker-only signature, deliberately no partner branch — self-promo is
// speaker-only per product decision, so a narrower type here is more
// honest than mirroring generatePostCopy's dual-stakeholder shape.
export async function generateSelfPromoPostCopy(
  event: EventContext,
  speaker: Record<string, unknown>,
  messagingJson: Record<string, unknown> | null
): Promise<string> {
  const dates = event.public_dates_display ?? ''
  const venueLine = event.public_venue_display || (event.venue ? `${event.venue}${event.city ? `, ${event.city}` : ''}` : null)
  const eventContext = [
    `Event: ${event.public_name || event.name}`,
    dates && `Dates: ${dates}`,
    venueLine && `Venue: ${venueLine}`,
    event.event_hashtag && `Hashtag: ${event.event_hashtag}`,
  ].filter(Boolean).join('\n')

  const messagingContext = messagingJson
    ? `Messaging doc context (use for positioning/tone/themes only — do not invent facts beyond this). Any "kind":"rules" section is a hard constraint, never violate it:\n${JSON.stringify(messagingJson)}`
    : 'No topline messaging doc uploaded for this event yet.'

  const publicName = speaker.public_name || speaker.name
  const talkingPoints = speaker.key_talking_points
    ? `Talking points to ground the post in (use these as the actual substance of what "I" am excited to talk about — do not just restate them, reflect on them in first person):\n${speaker.key_talking_points}`
    : ''

  const prompt = `You are ${publicName}, writing a short, personal LinkedIn post in your
OWN voice, first person ("I"/"my"), about speaking at an upcoming event.
This is NOT a marketing announcement — it is a speaker's own reflective,
thought-leadership post. Never refer to yourself in the third person.
Never write promotional CTA language like "Don't miss out" or "Register
now" — that energy belongs to the event's own announcement, not yours.

Grounded only in the data below — never fabricate credentials, statistics,
or claims not given.

${eventContext}

${messagingContext}

Speaker: ${publicName}, ${speaker.role} at ${speaker.company}.
Bio: ${speaker.bio ?? '(not provided)'}
Session: ${speaker.session_title ?? '(not provided)'}
${talkingPoints}

Write a LinkedIn post, 500-700 characters, as SEPARATE SHORT PARAGRAPHS
(1-2 sentences each, separated by a literal \n\n in the "copy" string) —
short, scannable, whitespace-separated blocks, never one dense paragraph.

Structure:
1. Open with a genuine, specific thought or question related to your
   talking points/expertise — the kind of reflection you'd actually post
   independent of any event (a real opinion, an observation, a lesson).
2. Connect that thought to why you're looking forward to this
   conversation at ${event.public_name || event.name}${venueLine ? `, ${venueLine}` : ''}${dates ? ` (${dates})` : ''} —
   mention the session/topic naturally, not as a formal announcement line.
3. A soft, personal closing line — an invitation to connect or an honest
   note of anticipation, not a hard call to action.

Tone: warm, reflective, first-person, understated confidence — reads like
something a real speaker would actually post themselves, not something
written about them.

Plain text only — no markdown syntax of any kind.

Hashtags: exactly 5-6 curated, relevant hashtags (topic/industry — NOT a
broad generic block), returned separately in "hashtags", not inside "copy".

Return JSON only, no markdown fences: { "copy": "...", "hashtags": ["#...", "..."] }`

  const model  = getGemini().getGenerativeModel({ model: 'gemini-2.5-flash', generationConfig: { responseMimeType: 'application/json' } })
  const result = await model.generateContent([{ text: prompt }])
  return parseGeminiCopyResponse(result.response.text().trim())
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
  variantId?: string,
  // 2026-08-18: Self Promo (org_promo default preserves every existing
  // caller's behavior exactly). A variant with no `category` at all is
  // treated as 'promo' (pure-additive JSONB shape, see composite.ts) —
  // every variant that predates this field must keep resolving under
  // 'org_promo' unchanged.
  kind: 'org_promo' | 'self_promo' = 'org_promo'
): CompositeInputs | { templateError: string } {
  const wantCategory = kind === 'self_promo' ? 'self_promo' : 'promo'
  const variants = (templateConfig?.[stakeholderType]?.variants ?? []).filter(v => (v.category ?? 'promo') === wantCategory)
  const variant = (variantId ? variants.find(v => v.id === variantId) : null) ?? variants[0]
  if (!variant) {
    const kindLabel = kind === 'self_promo' ? 'self-promo ' : ''
    return { templateError: `No ${kindLabel}creative template configured for this event's ${stakeholderType}s (events.creative_template_config.${stakeholderType}.variants)` }
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
    ? { name: String(speaker?.public_name || speaker?.name || ''), title: String(speaker?.role ?? ''), company: String(speaker?.company ?? '') }
    : {}

  return { variant, assetsNeeded, texts }
}
