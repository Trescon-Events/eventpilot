// Shared generation logic for the Stakeholder Announcement Engine — used by
// announcements/generate and both regenerate-* routes, so the copy/creative
// pipeline is defined once rather than duplicated across three route files.
import { GoogleGenerativeAI } from '@google/generative-ai'
import type { Variant, PhotoSlotLayer, CreativeTemplateConfig, ResolvedTexts } from '@/app/lib/announcements/composite'
import type { HeadBox } from '@/app/lib/media/face-alignment'
import { FLASH_MODEL } from '@/app/lib/content/press-release-access'
import { enforceMaxChars } from '@/app/lib/content/text-limits'
import type { ValidationFinding } from '@/app/lib/content/validate'

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

// 2026-09-11: event_speakers.role often carries a dual title straight from
// Staff Portal/HR data (e.g. "Chief Executive Officer & Co-Founder") — an
// "&" flowing into generated copy trips the DIFC style guide's
// difc-ampersand validation rule on every single generation for that
// speaker. Normalizing at the point a title enters prompt context is
// cheaper and more reliable than asking the model to catch it itself.
function normalizeTitle(title: unknown): string {
  return String(title ?? '').replace(/&/g, 'and')
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
): Promise<GeneratedCopy> {
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
    ? `Messaging doc context (use for positioning/tone/themes — do not invent facts beyond this). Any section with "kind":"rules" is a hard constraint (naming/style rules, verbatim lines, things that must never appear) — never violate it, even if it conflicts with your default instincts. If multiple sections carry an "authority_rank", lower always outranks higher on any conflict. Any section with "kind":"facts" is the ONLY permitted source for a statistic, figure, attendance number, or scale claim — never state a number that isn't grounded in a "facts" section, even one that sounds plausible or was true for a past edition:\n${JSON.stringify(messagingJson)}`
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
    ? `Speaker: ${speakerName}, ${normalizeTitle(speaker.role)} at ${speaker.company}${speaker.country ? `, ${speaker.country}` : ''}.\nBio: ${speaker.bio ?? '(not provided)'}${talkingPoints}${pronounGuidance}`
    : `Partner: ${partner!.name}${partner!.country ? `, ${partner!.country}` : ''}, category: ${String(partner!.partner_type).replace(/_/g, ' ')}.\nDescription: ${partner!.company_description ?? '(not provided)'}`

  const prompt = `You are writing social media announcement posts for Trescon events.
You write in the established Trescon voice: confident, data-driven, forward-looking.
Grounded only in the provided data — never fabricate credentials, statistics, or event details not given below.

${eventContext}

${stakeholderContext}

Generate LinkedIn post copy — aim for 500-900 characters, hard max 1300 —
written as SEPARATE SHORT PARAGRAPHS (1-2 sentences each, each its own
paragraph separated by a blank line, a literal \n\n between paragraphs in
the "copy" string). This is exactly how real, high-performing LinkedIn
event-announcement posts are formatted — short scannable blocks of
whitespace-separated text, never one dense unbroken wall of text. Favor
shorter over longer; do not pad toward the character ceiling.

1. Opening hook — one punchy line grounded in the ${speaker ? "speaker's topic/expertise" : "partner's relevance"} (a bold claim, a sharp question, or a trend statement). Do NOT name the ${speaker ? 'speaker' : 'partner'} yet — save the name for paragraph 2.
2. A paragraph that names the ${speaker ? 'speaker' : 'partner'} (with ${speaker ? 'their title and company' : 'their category'}) and explicitly, unambiguously states they ARE speaking at / joining the event — this must be stated outright as fact, never left implied only through a bio. This is the single most important paragraph; do not bury or soften it. Use whatever register the rules below establish for this event — do not default to generic announcement-boilerplate phrasing unless the rules explicitly allow it.
3. Why this ${speaker ? 'speaker' : 'partner'} matters — one credibility line grounded in their real, given experience (years, scale, a notable achievement) tied to the event's themes.
4. Event dates and venue as a single compact line, not a full sentence — reuse the exact Dates/Venue values given above verbatim (e.g. "<Dates> | <Venue>"), never an invented or reformatted date — if given above.
5. A short call to action with the registration link, if given above.

Tone: confident by default — genuine enthusiasm about a great
${speaker ? 'speaker' : 'partner'} joining, not a formal press release —
but this is the DEFAULT register only; the rules below may call for
something more formal or restrained for this event, and when they do,
follow them instead. Short, punchy sentences beat long, descriptive ones
regardless of register.

Plain text only — no markdown syntax of any kind (no **bold**, no #
headings, no - or * bullet markers). LinkedIn and every other social
platform renders a caption as plain text; markdown characters would show
up literally instead of formatting anything.

Hashtags: the event hashtag (if given) plus 4-6 relevant topic hashtags,
returned separately in "hashtags" — not inside "copy".

Also write a SEPARATE, SHORT version for X (Twitter) in "x_copy" — the
same announcement, own voice, but a completely different shape: ONE
tight paragraph (no \n\n blank-line breaks), hard max 280 characters
INCLUDING 1-2 hashtags inlined at the end (do not return x_copy over 280
characters under any circumstances — trim content, not just hashtags, if
it doesn't fit). Keep the ${speaker ? 'speaker' : 'partner'} name and the
single most important fact (who + what + event name); drop the venue/date
line and registration link if there's no room. Punchy and complete on its
own — never a truncated fragment of the LinkedIn copy.

${messagingContext}

Where the messaging-doc rules above conflict with any generic structural
or tone guidance given earlier in this prompt, the rules always win —
adapt the structure and tone to comply with them, do not follow the
earlier guidance literally.

Return JSON only, no markdown fences: { "copy": "...", "hashtags": ["#...", "..."], "x_copy": "..." }`

  // 2026-08-17: responseMimeType 'application/json' makes Gemini itself
  // guarantee syntactically valid JSON (properly escaped newlines inside
  // string values, etc.) — without it, Gemini sometimes emits a literal
  // unescaped newline inside the "copy" string, which is invalid JSON;
  // JSON.parse below would then throw, and the code fell through to
  // returning the whole raw, unparsed JSON blob (braces, field labels and
  // all) as if it were the post copy. Confirmed live: roughly 1 in 3
  // generations hit this before adding the mode.
  const model  = getGemini().getGenerativeModel({ model: 'gemini-2.5-flash', generationConfig: { responseMimeType: 'application/json' } })
  // Bounded (2026-08-24) — this and the asset fetch it runs alongside via
  // Promise.all in announcements/generate/route.ts are the only two things
  // standing between a normal ~few-second generate and the ~100s Cloudflare
  // proxy timeout in front of production; an unbounded hung Gemini call
  // (rare, but a real API-outage mode) could otherwise run past it same as
  // an unbounded fetch could. Matches the GEMINI_TIMEOUT_MS convention
  // already used in app/api/kb/intel/run/route.ts.
  const result = await model.generateContent([{ text: prompt }], { timeout: 60_000 })
  return parseGeminiCopyResponse(result.response.text().trim())
}

// 2026-09-06: neither call site caught a thrown Gemini error (rate limit,
// depleted billing, timeout) — it crashed the whole request unhandled,
// producing a non-JSON 500 that the frontend can only show as a generic
// "generation failed" (confirmed live: prepaid Gemini credits ran out,
// every generate/regenerate-copy request 500'd this way). Callers should
// wrap generatePostCopy/generateSelfPromoPostCopy in try/catch and use this
// to turn the caught error into a message worth showing a user.
export function describeGeminiError(e: unknown): string {
  const err = e as { status?: number; message?: string } | null | undefined
  if (err?.status === 429 || /prepayment credits are depleted|quota/i.test(err?.message ?? '')) {
    return 'AI copy generation is temporarily unavailable — the Gemini API quota/billing needs attention. Try again once that is resolved.'
  }
  return 'AI copy generation failed — please try again.'
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
export function sanitizeJsonControlChars(s: string): string {
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

export type GeneratedCopy = { copy: string; xCopy: string }

// Shared by generatePostCopy and generateSelfPromoPostCopy — both call
// Gemini in JSON mode and want the same { copy, hashtags, x_copy } →
// { copy, xCopy } extraction, with the same raw-text fallback if parsing
// ever fails. xCopy falls back to a hard-truncated slice of the main copy
// (2026-08-27) rather than an empty string — better than a blank X post if
// Gemini ever omits the field, though the prompt asks for it every time.
//
// Fixed 2026-08-29 (real bug, caught live) — two things:
// 1. hashtags used to be spread into the copy array and joined with the
//    SAME '\n\n' separator as every other paragraph, so each hashtag
//    landed on its own line with a blank line before it. Per Madhu, they
//    should read as one normal hashtag line — joined with spaces into a
//    single string, then that single string appended as the copy's last
//    paragraph.
// 2. x_copy is now hard-clamped to 280 chars UNCONDITIONALLY, not just
//    when Gemini omits the field — the prompt already asks for "hard max
//    280," but a live case proved the model doesn't always comply, and
//    Postiz silently rejects the whole publish with no visible error when
//    that happens (see AnnouncementDetailPanel.tsx's client-side
//    pre-flight check, which is the other half of this fix — this
//    server-side clamp is the guarantee of last resort).
function clampToX(s: string): string {
  return s.length <= 280 ? s : s.slice(0, 279) + '…'
}
function parseGeminiCopyResponse(text: string): GeneratedCopy {
  try {
    const match = text.match(/\{[\s\S]*\}/)
    if (match) {
      const parsed = JSON.parse(sanitizeJsonControlChars(match[0])) as { copy?: string; hashtags?: string[]; x_copy?: string }
      if (parsed.copy) {
        const hashtagLine = (parsed.hashtags ?? []).join(' ')
        const copy = [parsed.copy, hashtagLine].filter(Boolean).join('\n\n')
        const xCopy = clampToX(parsed.x_copy?.trim() || copy)
        return { copy, xCopy }
      }
    }
  } catch {
    // fall through to raw text
  }
  return { copy: text, xCopy: clampToX(text) }
}

// Self Promo module (2026-08-18): a creative + post copy emailed TO the
// speaker so THEY can post it themselves, rather than the org posting on
// its own channels. The copy must therefore read as genuinely theirs —
// first person, reflective, no third-person references and no hard-sell
// CTA energy (that belongs to generatePostCopy's org voice, not this one).
// Speaker-only signature, deliberately no partner branch — self-promo is
// speaker-only per product decision, so a narrower type here is more
// honest than mirroring generatePostCopy's dual-stakeholder shape.
//
// 2026-08-28 fix, per Madhu, live: the generated copy read well but gave a
// reader no way to actually act on it — registration_url was already on
// EventContext and already passed in by every caller (same as
// generatePostCopy gets it), just never included in THIS function's own
// eventContext, so the model had no way to reference it even softly. Fixed
// by adding it below and letting the closing line work it in naturally as
// a practical detail (never a command) — still no "Register now!" energy,
// just giving the reader an actual next step, which is the whole point of
// routing this copy through a speaker's own network in the first place.
export async function generateSelfPromoPostCopy(
  event: EventContext,
  speaker: Record<string, unknown>,
  messagingJson: Record<string, unknown> | null
): Promise<GeneratedCopy> {
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
    ? `Messaging doc context (use for positioning/tone/themes only — do not invent facts beyond this). Any "kind":"rules" section is a hard constraint, never violate it — lower "authority_rank" outranks higher on any conflict. Any "kind":"facts" section is the ONLY permitted source for a statistic, figure, or scale claim:\n${JSON.stringify(messagingJson)}`
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

Speaker: ${publicName}, ${normalizeTitle(speaker.role)} at ${speaker.company}.
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
   note of anticipation, not a hard call to action. If a Registration link
   is given above, work it in here as a practical, low-key detail for
   anyone who wants to join (e.g. "if you'd like to be there, you can
   register here: <link>") — a courtesy for the reader, never a command,
   and never invented if no link is given.

Tone: warm, reflective, first-person, understated confidence — reads like
something a real speaker would actually post themselves, not something
written about them.

Plain text only — no markdown syntax of any kind.

Hashtags: exactly 5-6 curated, relevant hashtags (topic/industry — NOT a
broad generic block), returned separately in "hashtags", not inside "copy".

Also write a SEPARATE, SHORT first-person version for X (Twitter) in
"x_copy" — same voice, but ONE tight paragraph (no \n\n breaks), hard max
280 characters INCLUDING 1-2 hashtags inlined at the end (never return
x_copy over 280 characters — trim content, not just hashtags, if it
doesn't fit). Keep the single most important thought/fact; this must read
as complete on its own, never a truncated fragment of the LinkedIn copy.

${messagingContext}

Where the messaging-doc rules above conflict with any generic structural
or tone guidance given earlier in this prompt, the rules always win —
adapt the structure and tone to comply with them, do not follow the
earlier guidance literally.

Return JSON only, no markdown fences: { "copy": "...", "hashtags": ["#...", "..."], "x_copy": "..." }`

  const model  = getGemini().getGenerativeModel({ model: 'gemini-2.5-flash', generationConfig: { responseMimeType: 'application/json' } })
  // Bounded (2026-08-24) — see generatePostCopy's identical timeout above
  // for why.
  const result = await model.generateContent([{ text: prompt }], { timeout: 60_000 })
  return parseGeminiCopyResponse(result.response.text().trim())
}

// Speaker announcement HEADLINE (2026-09-22) — the bold on-image phrase
// shown on a creative (e.g. "THE TECHNOLOGY BEHIND MODERN BANKING"),
// distinct from post_copy/post_copy_x. Fixed 3-role shape, matching every
// real reference sample studied: an optional white "lead" clause, a
// required accent-color "emphasis" clause (the core claim), and an
// optional white "trail" clause. Maps directly onto the composite.ts
// TextLayer.field values 'headline_lead'/'headline_emphasis'/
// 'headline_trail' — see buildCompositeInputs' callers for how a selected
// variant's segments get merged into a composite's `texts`.
export type HeadlineSegments = {
  lead?: string
  emphasis: string
  trail?: string
}

// A stored, pickable option — the route wraps each of generateHeadlines()'s
// raw segments into one of these with a fresh id, edited:false, and
// deterministic compliance findings (see generate-headlines/route.ts).
export type HeadlineVariant = {
  id: string
  segments: HeadlineSegments
  edited: boolean
  compliance: ValidationFinding[]
}

// Per-segment character ceiling — server-side safety net (enforceMaxChars),
// same philosophy as SHORT_BIO_MAX_CHARS: a prompt instruction is a strong
// steer, not a guarantee. Tuned loosely against the real DFS samples
// (30-60 characters total across all clauses) rather than any one
// template's exact box metrics — a specific Variant's own box width/
// max_lines is what actually bounds wrapping at render time (see
// composite.ts's allow_shrink); this ceiling only guards against a wildly
// oversized Gemini response before it ever reaches the compositor.
const HEADLINE_LEAD_TRAIL_MAX_CHARS = 25
const HEADLINE_EMPHASIS_MAX_CHARS = 40

// Style reference only — from 3 real Dubai FinTech Summit speaker
// creatives studied directly (not this codebase's own output). Given to
// the model as few-shot STYLE examples, explicitly instructed never to
// reuse their words/topics, so this generalizes to any event/industry.
const HEADLINE_EXAMPLES = [
  { lead: 'THE', emphasis: 'TECHNOLOGY BEHIND', trail: 'MODERN BANKING' },
  { lead: 'FOUR DECADES AT', emphasis: 'THE HIGHEST LEVEL OF GLOBAL BANKING', trail: '' },
  { lead: 'TURNING', emphasis: 'A GLOBAL BANK INTO', trail: 'A VENTURE BUILDER' },
]

function parseHeadlineResponse(text: string): HeadlineSegments[] {
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) return []
  let parsed: { headlines?: { lead?: string; emphasis?: string; trail?: string }[] }
  try {
    parsed = JSON.parse(sanitizeJsonControlChars(match[0]))
  } catch {
    return []
  }
  return (parsed.headlines ?? [])
    .filter(h => h && typeof h.emphasis === 'string' && h.emphasis.trim())
    .map(h => ({
      lead: h.lead?.trim() ? enforceMaxChars(h.lead.trim(), HEADLINE_LEAD_TRAIL_MAX_CHARS) : undefined,
      emphasis: enforceMaxChars(h.emphasis!.trim(), HEADLINE_EMPHASIS_MAX_CHARS),
      trail: h.trail?.trim() ? enforceMaxChars(h.trail.trim(), HEADLINE_LEAD_TRAIL_MAX_CHARS) : undefined,
    }))
}

// Propose-only — returns raw segment candidates (expect 5, tolerates fewer
// if Gemini under-delivers rather than hard-failing). The caller
// (generate-headlines/route.ts) wraps each into a full HeadlineVariant
// (id, edited, compliance) — this function stays pure generation logic,
// same division of responsibility as generatePostCopy/parseGeminiCopyResponse
// above (compliance validation lives in the route, not here).
export async function generateHeadlines(
  event: EventContext,
  speaker: Record<string, unknown>,
  messagingJson: Record<string, unknown> | null
): Promise<HeadlineSegments[]> {
  const dates = event.public_dates_display ?? ''
  const venueLine = event.public_venue_display || (event.venue ? `${event.venue}${event.city ? `, ${event.city}` : ''}` : null)
  const eventContext = [
    `Event: ${event.public_name || event.name}`,
    dates && `Dates: ${dates}`,
    venueLine && `Venue: ${venueLine}`,
  ].filter(Boolean).join('\n')

  const speakerName = speaker.public_name || speaker.name
  const talkingPoints = speaker.key_talking_points
    ? `\nKey talking points (ground the headline in these specifically when relevant): ${speaker.key_talking_points}`
    : ''
  // Full Bio text (2026-09-22) — precomputed at upload time (see
  // toStoredBioPdf, full-bio-upload.ts), so this is a cheap column read,
  // not a PDF download/parse. Included alongside Short Bio, not instead
  // of it: Short Bio is often the more carefully producer-edited text,
  // Full Bio has more raw material (career history, past talks, specific
  // achievements) to actually ground a punchy, specific headline in when
  // Short Bio alone is thin or generic.
  const fullBioText = (speaker.bio_full_text as string | null | undefined)?.trim()
  const fullBioContext = fullBioText ? `\nFull bio (richer source material — mine this for specific, concrete details a punchy headline can use):\n${fullBioText.slice(0, 20000)}` : ''
  const stakeholderContext = `Speaker: ${speakerName}, ${normalizeTitle(speaker.role)} at ${speaker.company}${speaker.country ? `, ${speaker.country}` : ''}.\nBio: ${speaker.bio ?? '(not provided)'}${talkingPoints}${fullBioContext}`

  const messagingContext = messagingJson
    ? `Messaging doc context (use for positioning/tone/themes — do not invent facts beyond this). Any section with "kind":"rules" is a hard constraint, never violate it. Any section with "kind":"facts" is the ONLY permitted source for a statistic, figure, or scale claim — never state a number that isn't grounded there:\n${JSON.stringify(messagingJson)}`
    : 'No topline messaging doc uploaded for this event yet — write in a neutral, professional Trescon voice.'

  const examplesText = HEADLINE_EXAMPLES
    .map((e, i) => `  ${i + 1}. lead: "${e.lead}"; emphasis: "${e.emphasis}"; trail: "${e.trail}"`)
    .join('\n')

  const prompt = `You are writing a short, bold on-image HEADLINE for a speaker
announcement social media creative — the large graphic phrase overlaid on
the image itself (completely separate from any caption/post text). It
must read like a punchy editorial pull-quote, not a sentence.

Structure: 2 or 3 short clauses:
- "lead" (optional, rendered in white) — a short lead-in, 1-4 words. May
  be omitted (empty string) — some headlines correctly open straight with
  "emphasis" instead.
- "emphasis" (REQUIRED, rendered in the brand accent color) — the core
  claim, the phrase doing the actual work. Never empty.
- "trail" (optional, rendered in white) — a closing clause continuing the
  thought. May be omitted (empty string) — some headlines correctly END on
  "emphasis" instead.

Study these 3 real examples for STYLE ONLY — do not reuse their words,
topics, or facts, and do not assume they relate to this event:
${examplesText}

Total length across all clauses: roughly 30-60 characters (aim for the
low-to-mid end — a shorter phrase reads bolder on a creative than a longer
one). Write every clause in natural sentence case — a separate render step
uppercases it later; do not write in all caps yourself.

Grounded only in the data below — never invent a statistic, achievement,
or scale claim not present in it.

${eventContext}

${stakeholderContext}

${messagingContext}

Generate 5 DISTINCT options — vary the structure (mix 2-segment and
3-segment, vary which clause carries the core claim) and vary the angle
(don't make all 5 restate the same fact).

Return JSON only, no markdown fences:
{ "headlines": [ { "lead": "...", "emphasis": "...", "trail": "..." }, ... exactly 5 items ] }
Use an empty string "" for lead/trail when a given option omits it.`

  const model = getGemini().getGenerativeModel({ model: FLASH_MODEL, generationConfig: { responseMimeType: 'application/json' } })
  const result = await model.generateContent([{ text: prompt }], { timeout: 60_000 })
  return parseHeadlineResponse(result.response.text().trim())
}

export type { CreativeTemplateConfig }

export type NeededAsset = { source: PhotoSlotLayer['source']; url: string; isSvg: boolean; headBox?: HeadBox | null }

export type CompositeInputs = {
  variant: Variant
  assetsNeeded: NeededAsset[]
  texts: ResolvedTexts
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

  // Creative Headline (2026-09-22, speaker record, not per-announcement) —
  // generated once on the speaker's own page and reused by every
  // announcement for them, same as name/title/company already are. A
  // variant with a headline_emphasis layer is unusable for a speaker who
  // hasn't generated/selected one yet — same "requires X" gate as the
  // missing-photo/logo checks above, not a silent blank render.
  const usesHeadline = stakeholderType === 'speaker' && variant.layers.some(l => l.type === 'text' && l.field === 'headline_emphasis')
  const selectedHeadline = usesHeadline
    ? (speaker?.headline_variants as HeadlineVariant[] | null)?.find(v => v.id === speaker?.selected_headline_variant_id)
    : undefined
  if (usesHeadline && !selectedHeadline) {
    return { templateError: `This speaker needs a Creative Headline generated first (on their record page) — required by variant "${variant.name}"` }
  }

  const texts: ResolvedTexts = stakeholderType === 'speaker'
    ? {
        name: String(speaker?.public_name || speaker?.name || ''), title: String(speaker?.role ?? ''), company: String(speaker?.company ?? ''), country: String(speaker?.country ?? ''),
        ...(selectedHeadline ? {
          headline_lead: selectedHeadline.segments.lead || undefined,
          headline_emphasis: selectedHeadline.segments.emphasis || undefined,
          headline_trail: selectedHeadline.segments.trail || undefined,
        } : {}),
      }
    : {}

  return { variant, assetsNeeded, texts }
}
