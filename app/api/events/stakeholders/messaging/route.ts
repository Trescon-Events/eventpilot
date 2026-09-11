import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { supabaseAdmin } from '@/app/lib/supabase'
import { extractKbText } from '@/app/lib/kb/extract'
import { uploadPublicAsset } from '@/app/lib/events/storage'
import { TRACKED_EVENT_FIELDS } from '@/app/lib/events/detail-field-log'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'
import { insertClarificationRound } from '@/app/lib/content/clarifications'

type DocRole = 'style_guide' | 'messaging' | 'production_pack'
const DOC_ROLES: DocRole[] = ['style_guide', 'messaging', 'production_pack']

// Provenance default rule (Reference Documents spec, Stage 1, 2026-09-10):
//   role = 'production_pack' -> always trescon_authored
//   events.type = 'managed'  -> client_approved (has a real external client)
//   otherwise (signature/bespoke, or an umbrella's own type) -> trescon_authored
// Mirrors the backfill in supabase/reference_documents_migration.sql exactly.
function defaultProvenance(role: DocRole, eventType: string | null): 'client_approved' | 'trescon_authored' {
  if (role === 'production_pack') return 'trescon_authored'
  if (eventType === 'managed') return 'client_approved'
  return 'trescon_authored'
}

/* GET /api/events/stakeholders/messaging?event_id=X          — the live doc
   GET /api/events/stakeholders/messaging?event_id=X&all=true — all versions

   POST /api/events/stakeholders/messaging (multipart/form-data)
   Body: event_id, file (PDF), title?, uploaded_by?
   Uploads a new messaging doc, extracts text + structured JSON (sections[]
   AND default_fields, see STRUCTURE_PROMPT) via Gemini, and stores it as a
   DRAFT — it does NOT touch the current live doc yet. A producer reviews/
   chats through the draft (propose-edit/apply-edit, extended to also cover
   default_fields.<key>) on the Event Details page, then explicitly hits
   Approve (see .../[id]/approve/route.ts), which is the only thing that
   supersedes the prior live doc and writes default_fields into
   events/event_hubspot_forms. This is the 2026-08-11 Event Details Page
   change — uploads used to go straight to live with no review gate. */

let _gemini: GoogleGenerativeAI | null = null
function getGemini() {
  if (!_gemini) _gemini = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
  return _gemini
}

const STRUCTURE_PROMPT = `You are structuring an event's topline messaging document into sections, for use both by producers reading it in EventPilot and by AI systems (post-copy generation, chat-based editing) that need to search and rely on it.

Segment the document into a JSON object of this shape:
{
  "sections": [
    {
      "id": "kebab-case-slug",          // short, stable, derived from the section's heading
      "order": 1,                        // matches the document's own order
      "title": "Section title as written in the document",
      "kind": "text" | "table" | "facts" | "rules",
      "topic": "kebab-case-slug",         // what this section is ABOUT, not its kind — e.g. "currency-formatting", "protocol-titles", "banned-terms", "positioning", "audience-recommendations". Free text, derived from the actual content — different documents will need entirely different topics. This is what lets one event's document differ in subject matter from another's while both still use the same four "kind" values.
      "confidence": "high" | "medium" | "low", // how confident you are that "kind" and "topic" correctly categorize this section's content. "low" means genuinely unsure, not just "this was hard to read."
      "content": ...                     // shape depends on "kind", see below
    }
  ],
  "clarifications": [
    {
      "question_key": "kebab-case-slug",     // stable, unique within this doc
      "question_text": "A specific, answerable question for the person who uploaded this document.",
      "context": "What in the document prompted this — quote or closely paraphrase the relevant passage.",
      "section_id": "...",                    // the section this concerns, if any — omit if document-wide
      "options": [
        { "value": "kebab-case-slug", "label": "Short label", "description": "One sentence of explanation for this option." }
        // 2-4 concrete, mutually exclusive, genuinely plausible options — never a single option, never vague placeholders. Think of this exactly like a multiple-choice question a colleague could answer in one click, not an open essay prompt.
      ],
      "allows_other": true  // whether a free-text answer outside the listed options makes sense here
    }
  ],
  "default_fields": {
    // A small, FIXED set of atomic facts — every key below must be present,
    // set to a plain string if the document states it, or null if it
    // doesn't. These are separate from "sections" — they feed typed,
    // directly-consumed fields elsewhere in EventPilot (invite emails,
    // announcement copy, the public onboarding form), not freeform content.
    "public_name": ...,             // the event's PUBLIC-FACING name, as it should appear externally — may differ from an internal/reference name like "WAIS26" or a code the document uses only for internal tracking
    "public_dates_display": ...,    // the event dates exactly as they should read publicly, e.g. "12–14 March 2026" — a formatted string, not raw ISO dates
    "public_venue_display": ...,    // the venue exactly as it should read publicly, e.g. "Dubai World Trade Centre, Dubai, UAE"
    "website_url": ...,             // the official event website URL, if stated
    "registration_url": ...,        // the registration/ticketing page URL, if stated and different from website_url
    "event_hashtag": ...,           // the official event hashtag, if stated (include the #)
    "social_linkedin": ...,         // official LinkedIn page/post URL, if stated
    "social_x": ...,                // official X/Twitter URL, if stated
    "social_instagram": ...,        // official Instagram URL, if stated
    "social_facebook": ...,         // official Facebook URL, if stated
    "social_youtube": ...,          // official YouTube URL, if stated
    "venue_map_url": ...            // a Google Maps (or similar) link to the venue, if stated
  }
}

Derive the sections from the document's OWN headings and structure — do not force it into a fixed list. Use judgement on granularity: a numbered heading in the source is usually one section; don't split a single heading's content into several sections or merge multiple headings into one.

Choose "kind" per section based on its actual content:
- "text" — narrative prose, bullet lists, or callout boxes. "content" is a markdown-lite string using ONLY **bold** and "- " bullet lines, with blank lines between paragraphs. Never emit a markdown table (pipe/dash syntax) inside "text" or "rules" content — if the source has a genuine two-column or wider table anywhere, even inside a section that's mostly prose or rules, either give it its own "table"-kind section, or, for a short "use this / not this" style pairing, flatten each row into one bullet line instead, e.g.: - Use "AI Malaysia (National AI Office)" — not "NAIO on its own".
- "table" — a genuine table in the source (columns + rows). "content" is { "columns": ["..."], "rows": [["...", "..."], ...] }.
- "facts" — a sourced reference/fact bank (a fact, its detail, and where it's sourced from). "content" is [{ "fact": "...", "detail": "...", "source": "..." }, ...]. If the source doesn't cite a source per fact, omit "source" per item.
- "rules" — naming/style/language guidelines, verbatim lines that must be used as-is, and anything the document says must NOT appear or must NOT be implied (embargo lists, forbidden claims, compliance constraints). This is the most important tag to get right — anything phrased as a hard requirement, a "do not"/"never", or "use this / not this" belongs here, even if it's mixed in with a section that also has plain text. Prefer splitting a "rules" subsection out on its own rather than folding it into a "text" section, since downstream consumers treat "rules" sections as non-negotiable constraints. "content" for "rules" follows the same markdown-lite bullet format as "text" — same no-markdown-table restriction applies.

A worked example of the kind of document you'll typically see (World AI Show Malaysia's topline messaging doc) has sections like: Introduction (text), Positioning (text), Event details (table), Key objectives (text), Value propositions (text), "by the numbers" stats (table or facts, whichever fits the source better), Structure of the Summit incl. strategic themes (text, or table for the themes grid), Key highlights (text), What's new this edition (text), Who the Summit serves (table), Sponsor value incl. tier comparison and approved positioning lines (table + rules — the "use these lines verbatim" content is rules), Outcomes expected (text), Messaging and style guidelines incl. naming/language/institutional-name pairs and "what must not appear" (rules), a verified reference/fact bank (facts), Trescon role and value (text), and a closing argument section (text). Treat this as an illustration of the kind of segmentation to aim for, not a schema every document must match — a different messaging doc may have entirely different sections.

When to raise a clarification — be selective, not exhaustive. Every clarification costs the uploader a real answer, so only raise one for something that actually matters if answered wrong:
- A named person, title, or entity is referenced (e.g. a royal/protocol title, an official partner name) without the exact required wording being stated anywhere in the document — never guess at or invent the correct form yourself.
- A cross-reference points at content that isn't actually present in the document (a "see below" / "as noted above" with nothing matching).
- A section's content genuinely straddles two "kind" or "topic" categories and the choice materially changes how it gets used downstream (e.g. content that could be either a hard "rules" constraint or just descriptive "text").
- A term or figure appears with two different values in the same document with no indication which supersedes.
Do NOT raise a clarification for stylistic ambiguity, minor phrasing questions, or anything you can resolve confidently from context — those aren't worth an uploader's time. If nothing meets this bar, return an empty "clarifications" array.

Only use information actually present in the document — never invent, infer, or embellish facts not stated. Return JSON only, no commentary, no markdown fences.

DOCUMENT TEXT:
`

// Stamps freshly-extracted sections with updated_at (now)/updated_by/change_note
// (both null — these only get set by a conversational edit, see apply-edit/route.ts)
// so every section has a consistent shape from the moment it's created.
// default_fields is normalized to exactly TRACKED_EVENT_FIELDS' keys —
// missing/unrecognized keys from the model's output become null/dropped,
// so the approve endpoint can trust the shape without re-validating it.
type ParsedExtraction = { sections?: unknown; default_fields?: Record<string, unknown>; clarifications?: unknown }

function normalizeSections(parsed: unknown): Record<string, unknown> | null {
  const p = parsed as ParsedExtraction | null
  if (!p || typeof p !== 'object' || !Array.isArray(p.sections)) return null
  const now = new Date().toISOString()
  const sections = p.sections.map((s: Record<string, unknown>) => ({
    ...s,
    updated_at: now,
    updated_by: null,
    change_note: null,
    diverged_from_source: false,
  }))
  const rawDefaults = p.default_fields ?? {}
  const default_fields = Object.fromEntries(
    TRACKED_EVENT_FIELDS.map(key => {
      const v = rawDefaults[key]
      return [key, typeof v === 'string' && v.trim() ? v.trim() : null]
    })
  )
  return { sections, default_fields }
}

export async function GET(req: NextRequest) {
  const eventId = req.nextUrl.searchParams.get('event_id')
  const all     = req.nextUrl.searchParams.get('all') === 'true'
  // Umbrella/event separation (2026-09-11) — defaults to 'event' so every
  // caller that predates this migration keeps working unchanged; only the
  // umbrella workspace page passes owner_type=umbrella.
  const ownerType = req.nextUrl.searchParams.get('owner_type') === 'umbrella' ? 'umbrella' : 'event'
  const ownerColumn = ownerType === 'umbrella' ? 'umbrella_id' : 'event_id'
  // Defaults to 'messaging' — every caller that predates Stage 1 (the SAE
  // generate route included) keeps getting exactly the doc it always got.
  const role     = (req.nextUrl.searchParams.get('role') as DocRole | null) ?? 'messaging'
  if (!eventId) return NextResponse.json({ error: 'event_id required' }, { status: 400 })

  if (all) {
    const { data, error } = await supabaseAdmin
      .from('event_messaging_docs')
      .select('*')
      .eq(ownerColumn, eventId)
      .order('version', { ascending: false })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data ?? [])
  }

  const { data, error } = await supabaseAdmin
    .from('event_messaging_docs')
    .select('*')
    .eq(ownerColumn, eventId)
    .eq('role', role)
    .eq('status', 'live')
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? null)
}

export async function POST(req: NextRequest) {
  const form = await req.formData()
  const eventId    = form.get('event_id') as string | null
  const file        = form.get('file') as File | null
  const title        = (form.get('title') as string | null) ?? null
  const uploadedBy = (form.get('uploaded_by') as string | null) ?? null
  const roleRaw      = form.get('role') as string | null
  const role: DocRole = DOC_ROLES.includes(roleRaw as DocRole) ? (roleRaw as DocRole) : 'messaging'
  const authorityRankRaw = form.get('authority_rank') as string | null
  const authorityRank = authorityRankRaw ? Number(authorityRankRaw) : 1
  // Umbrella/event separation (2026-09-11) — defaults to 'event' so the
  // existing event-details upload UI needs no changes; only the umbrella
  // workspace page passes owner_type=umbrella.
  const ownerType: 'event' | 'umbrella' = form.get('owner_type') === 'umbrella' ? 'umbrella' : 'event'
  const ownerColumn = ownerType === 'umbrella' ? 'umbrella_id' : 'event_id'

  if (!eventId || !file) {
    return NextResponse.json({ error: 'event_id and file required' }, { status: 400 })
  }
  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
    return NextResponse.json({ error: 'Only PDF files are accepted' }, { status: 400 })
  }
  if (file.size > 20 * 1024 * 1024) {
    return NextResponse.json({ error: 'File too large (max 20 MB)' }, { status: 413 })
  }
  if (!Number.isFinite(authorityRank) || authorityRank < 1) {
    return NextResponse.json({ error: 'authority_rank must be a positive number' }, { status: 400 })
  }

  let ownerTypeColumnValue: string | null // events.type or event_umbrellas.type, for the provenance default rule
  if (ownerType === 'umbrella') {
    const { data: umbrellaRow, error: umbrellaErr } = await supabaseAdmin
      .from('event_umbrellas').select('type').eq('id', eventId).single()
    if (umbrellaErr || !umbrellaRow) return NextResponse.json({ error: 'Umbrella event not found' }, { status: 404 })
    ownerTypeColumnValue = umbrellaRow.type

    // Umbrella documents change every child event's effective document set
    // at once — gated behind a higher permission than the regular
    // sae.forms.manage a producer holds for their own event's documents.
    // KNOWN LIMITATION (2026-09-11): event_access_assignments.event_id has
    // a real FK to events(id), which an umbrella's id no longer satisfies
    // post-separation — so sae.messaging.umbrella_manage can currently
    // only be granted GLOBALLY (event_id IS NULL), never scoped to one
    // specific umbrella. Fine while DFFW is the only umbrella; revisit
    // (give event_access_assignments the same event_id/umbrella_id dual
    // ownership as the content tables) if a second umbrella needs a
    // different, narrower set of people managing its documents.
    const session = getSession(req)
    const canManageUmbrella = session?.adm || await hasEventPermission(session?.sid, eventId, 'sae.messaging.umbrella_manage')
    if (!canManageUmbrella) {
      return NextResponse.json({ error: 'Uploading a document to an umbrella event requires umbrella-level access — it changes every child event at once.' }, { status: 403 })
    }
  } else {
    const { data: eventRow, error: eventErr } = await supabaseAdmin
      .from('events').select('type').eq('id', eventId).single()
    if (eventErr || !eventRow) return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    ownerTypeColumnValue = eventRow.type
  }

  const provenance = defaultProvenance(role, ownerTypeColumnValue)

  const buffer = Buffer.from(await file.arrayBuffer())

  // Determine next version number for this owner+role — each role is its
  // own independent document lineage (a style guide's v1/v2/v3 is separate
  // from the messaging doc's), matching the one-live-per-role model.
  const { data: existing } = await supabaseAdmin
    .from('event_messaging_docs')
    .select('id, version, status')
    .eq(ownerColumn, eventId)
    .eq('role', role)
    .order('version', { ascending: false })

  const nextVersion = existing && existing.length > 0 ? Math.max(...existing.map(d => d.version)) + 1 : 1

  // Upload PDF
  const sourceUrl = await uploadPublicAsset(
    `${ownerType === 'umbrella' ? 'umbrellas' : 'events'}/${eventId}/messaging/v${nextVersion}-${Date.now()}.pdf`,
    buffer,
    'application/pdf'
  )

  // Extract + structure via Gemini
  let rawText = ''
  let structuredJson: Record<string, unknown> | null = null
  let rawClarifications: unknown = []
  try {
    rawText = await extractKbText(buffer, file.name)
    const model  = getGemini().getGenerativeModel({ model: 'gemini-2.5-flash' })
    // 200k chars is comfortably within gemini-2.5-flash's context window and
    // far beyond any realistic messaging doc — the old 30k cap silently
    // dropped exactly the kind of reference material (fact banks, "must
    // not appear" lists) a messaging doc exists to protect.
    const result = await model.generateContent([{ text: STRUCTURE_PROMPT + rawText.slice(0, 200000) }])
    const text   = result.response.text().trim()
    const match  = text.match(/\{[\s\S]*\}/)
    const parsed = match ? JSON.parse(match[0]) : null
    structuredJson = normalizeSections(parsed)
    rawClarifications = (parsed as ParsedExtraction | null)?.clarifications ?? []
  } catch (e) {
    console.error('Messaging doc extraction failed:', e)
    // Still save the doc with the PDF stored — extraction can be retried via PATCH later.
  }

  // Round 1 of the clarification Q&A (2026-09-10) — see
  // app/lib/content/clarifications.ts. clarification_rounds_used only
  // counts up once a round actually has questions in it; a clean
  // extraction with nothing to ask stays at 0.
  const clarificationRoundsUsed = rawClarifications && (rawClarifications as unknown[]).length > 0 ? 1 : 0

  // Lands as a draft, not live — a producer reviews/chats through it and
  // explicitly Approves (see .../[id]/approve/route.ts) before it supersedes
  // the current live doc or writes default_fields anywhere.
  const { data, error } = await supabaseAdmin
    .from('event_messaging_docs')
    .insert({
      event_id:        ownerType === 'event' ? eventId : null,
      umbrella_id:     ownerType === 'umbrella' ? eventId : null,
      version:         nextVersion,
      title:           title ?? `Topline Messaging v${nextVersion}`,
      raw_text:        rawText || null,
      structured_json: structuredJson,
      source_url:      sourceUrl,
      status:          'draft',
      uploaded_by:     uploadedBy,
      role,
      authority_rank:  authorityRank,
      provenance,
      clarification_rounds_used: clarificationRoundsUsed,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (clarificationRoundsUsed > 0) {
    await insertClarificationRound(data.id, 1, rawClarifications)
  }

  return NextResponse.json(data, { status: 201 })
}
