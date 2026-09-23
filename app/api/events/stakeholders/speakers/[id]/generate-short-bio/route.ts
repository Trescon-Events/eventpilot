import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'
import { extractPdfText } from '@/app/lib/pdf-text'
import { isQuotaError, QUOTA_ERROR_MESSAGE } from '@/app/lib/gemini-error'
import { getLatestCompiledReference } from '@/app/lib/content/compile-reference'
import { enforceMaxChars } from '@/app/lib/content/text-limits'

/* POST /api/events/stakeholders/speakers/[id]/generate-short-bio

   Reads the speaker's Full Bio text (bio_full_text — extracted once at
   upload time by toStoredBioPdf(), see app/lib/events/full-bio-upload.ts)
   and asks Gemini to condense it into a short bio under
   SHORT_BIO_MAX_CHARS characters (2026-09-21, Madhu — was "150-300 words"
   until now, a length no longer used anywhere else; see the
   default-schemas.ts / form_schema_defaults update in the same change for
   the matching field-hint text). Falls back to downloading+extracting the
   PDF live (2026-09-22) only for a speaker whose Full Bio predates
   bio_full_text existing — every new upload has it precomputed, so this
   route no longer needs to download and re-parse the PDF on every call.

   Grounded in the event's messaging doc (2026-09-21) — same
   getLatestCompiledReference()-then-raw-doc-fallback pattern and the same
   rules/facts authority model announcements/generate/route.ts already
   uses for social post copy, so a bio and a LinkedIn post for the same
   event never drift into two different voices. Falls back to a neutral
   professional Trescon voice when no doc has been uploaded/approved yet,
   same as that route.

   Propose-only, same as every other AI-assist route in this app — never
   writes to the DB itself. The Details page applies the returned text to
   the live Short Bio field (with an Undo snapshot), which only persists
   through that page's normal autosave, same as any other manual edit. */

const SHORT_BIO_MAX_CHARS = 500

let _gemini: GoogleGenerativeAI | null = null
function getGemini() {
  if (!_gemini) _gemini = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
  return _gemini
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: speakerId } = await params

  const { data: speaker } = await supabaseAdmin
    .from('event_speakers')
    .select('event_id, name, bio_full_url, bio_full_text')
    .eq('id', speakerId)
    .single()
  if (!speaker) return NextResponse.json({ error: 'Speaker not found' }, { status: 404 })
  if (!speaker.bio_full_url) return NextResponse.json({ error: 'No Full Bio on file for this speaker yet.' }, { status: 400 })

  const session = getSession(req)
  if (!session?.adm && !(await hasEventPermission(session?.sid, speaker.event_id, 'sae.stakeholders.edit'))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({ error: 'Gemini API key not configured' }, { status: 500 })
  }

  let fullBioText = speaker.bio_full_text ?? ''
  if (!fullBioText.trim()) {
    // Pre-dates bio_full_text (uploaded before 2026-09-22) — fall back to
    // the old live download+extract path rather than failing outright.
    try {
      const fileRes = await fetch(speaker.bio_full_url)
      if (!fileRes.ok) throw new Error(`Failed to download Full Bio PDF: ${fileRes.status}`)
      const buffer = Buffer.from(await fileRes.arrayBuffer())
      fullBioText = await extractPdfText(buffer)
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not read the Full Bio PDF' }, { status: 500 })
    }
  }
  if (!fullBioText.trim()) {
    return NextResponse.json({ error: 'The Full Bio PDF has no extractable text (it may be a scanned image) — write the Short Bio by hand instead.' }, { status: 422 })
  }

  // Same compiled-reference-then-raw-doc-fallback as announcements/
  // generate/route.ts — see this route's own top comment for why.
  const compiledRef = await getLatestCompiledReference(speaker.event_id)
  let messagingSections = compiledRef?.sections ?? null
  if (!messagingSections) {
    const { data: rawDoc } = await supabaseAdmin
      .from('event_messaging_docs').select('structured_json')
      .eq('event_id', speaker.event_id).eq('status', 'live')
      .order('version', { ascending: false }).limit(1).maybeSingle()
    messagingSections = (rawDoc?.structured_json as { sections?: unknown } | null)?.sections as typeof messagingSections ?? null
  }
  const messagingContext = messagingSections
    ? `Messaging doc context (use for voice/tone/style — do not invent facts beyond this). Any section with "kind":"rules" is a hard constraint (naming/style rules, verbatim lines, things that must never appear) — never violate it. Any section with "kind":"facts" is the ONLY permitted source for a statistic, figure, or scale claim — never state a number that isn't grounded there:\n${JSON.stringify(messagingSections)}`
    : 'No topline messaging doc uploaded for this event yet — write in a neutral, professional Trescon voice.'

  const prompt = `You are writing a short professional speaker bio for an event website and speaker listing, based on a longer source bio below.

${messagingContext}

Rules:
- HARD LIMIT: under ${SHORT_BIO_MAX_CHARS} characters total, including spaces. This is a strict ceiling, not a target — stay comfortably under it rather than writing right up to the edge.
- Third person, professional tone (the messaging doc's own voice/style rules above always win over this default if the two conflict).
- Cover current role, organisation, and the single most relevant career highlight/achievement for a conference audience — drop anything not relevant to why they're speaking. At this length, one sharp detail beats a list.
- No markdown, no bullet points, no headings — plain prose paragraphs only.
- Output ONLY the short bio text, nothing else (no preamble, no "Here is the bio:", no quotes around it).

Speaker name (for reference, don't necessarily repeat it verbatim if the source bio already reads naturally): ${speaker.name ?? 'Unknown'}

Source (full) bio:
"""
${fullBioText.slice(0, 20000)}
"""`

  try {
    const model = getGemini().getGenerativeModel({ model: 'gemini-2.5-flash' })
    const result = await model.generateContent([{ text: prompt }])
    const shortBio = result.response.text().trim()
    if (!shortBio) throw new Error('Empty response from Gemini')
    return NextResponse.json({ short_bio: enforceMaxChars(shortBio, SHORT_BIO_MAX_CHARS) })
  } catch (e) {
    if (isQuotaError(e)) return NextResponse.json({ error: QUOTA_ERROR_MESSAGE }, { status: 429 })
    console.error('generate-short-bio failed:', e)
    return NextResponse.json({ error: 'Could not generate a short bio. Please try again or write it by hand.' }, { status: 500 })
  }
}
