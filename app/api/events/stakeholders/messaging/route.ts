import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { supabaseAdmin } from '@/app/lib/supabase'
import { extractKbText } from '@/app/lib/kb/extract'
import { uploadPublicAsset } from '@/app/lib/events/storage'

/* GET /api/events/stakeholders/messaging?event_id=X          — the live doc
   GET /api/events/stakeholders/messaging?event_id=X&all=true — all versions

   POST /api/events/stakeholders/messaging (multipart/form-data)
   Body: event_id, file (PDF), title?, uploaded_by?
   Uploads a new messaging doc, extracts text + structured JSON via Gemini,
   supersedes the previous live doc, stores the new one as live. */

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
      "content": ...                     // shape depends on "kind", see below
    }
  ]
}

Derive the sections from the document's OWN headings and structure — do not force it into a fixed list. Use judgement on granularity: a numbered heading in the source is usually one section; don't split a single heading's content into several sections or merge multiple headings into one.

Choose "kind" per section based on its actual content:
- "text" — narrative prose, bullet lists, or callout boxes. "content" is a markdown-lite string using ONLY **bold** and "- " bullet lines, with blank lines between paragraphs. Never emit a markdown table (pipe/dash syntax) inside "text" or "rules" content — if the source has a genuine two-column or wider table anywhere, even inside a section that's mostly prose or rules, either give it its own "table"-kind section, or, for a short "use this / not this" style pairing, flatten each row into one bullet line instead, e.g.: - Use "AI Malaysia (National AI Office)" — not "NAIO on its own".
- "table" — a genuine table in the source (columns + rows). "content" is { "columns": ["..."], "rows": [["...", "..."], ...] }.
- "facts" — a sourced reference/fact bank (a fact, its detail, and where it's sourced from). "content" is [{ "fact": "...", "detail": "...", "source": "..." }, ...]. If the source doesn't cite a source per fact, omit "source" per item.
- "rules" — naming/style/language guidelines, verbatim lines that must be used as-is, and anything the document says must NOT appear or must NOT be implied (embargo lists, forbidden claims, compliance constraints). This is the most important tag to get right — anything phrased as a hard requirement, a "do not"/"never", or "use this / not this" belongs here, even if it's mixed in with a section that also has plain text. Prefer splitting a "rules" subsection out on its own rather than folding it into a "text" section, since downstream consumers treat "rules" sections as non-negotiable constraints. "content" for "rules" follows the same markdown-lite bullet format as "text" — same no-markdown-table restriction applies.

A worked example of the kind of document you'll typically see (World AI Show Malaysia's topline messaging doc) has sections like: Introduction (text), Positioning (text), Event details (table), Key objectives (text), Value propositions (text), "by the numbers" stats (table or facts, whichever fits the source better), Structure of the Summit incl. strategic themes (text, or table for the themes grid), Key highlights (text), What's new this edition (text), Who the Summit serves (table), Sponsor value incl. tier comparison and approved positioning lines (table + rules — the "use these lines verbatim" content is rules), Outcomes expected (text), Messaging and style guidelines incl. naming/language/institutional-name pairs and "what must not appear" (rules), a verified reference/fact bank (facts), Trescon role and value (text), and a closing argument section (text). Treat this as an illustration of the kind of segmentation to aim for, not a schema every document must match — a different messaging doc may have entirely different sections.

Only use information actually present in the document — never invent, infer, or embellish facts not stated. Return JSON only, no commentary, no markdown fences.

DOCUMENT TEXT:
`

// Stamps freshly-extracted sections with updated_at (now)/updated_by/change_note
// (both null — these only get set by a conversational edit, see apply-edit/route.ts)
// so every section has a consistent shape from the moment it's created.
function normalizeSections(parsed: unknown): Record<string, unknown> | null {
  if (!parsed || typeof parsed !== 'object' || !Array.isArray((parsed as any).sections)) return null
  const now = new Date().toISOString()
  const sections = (parsed as any).sections.map((s: Record<string, unknown>) => ({
    ...s,
    updated_at: now,
    updated_by: null,
    change_note: null,
  }))
  return { sections }
}

export async function GET(req: NextRequest) {
  const eventId = req.nextUrl.searchParams.get('event_id')
  const all     = req.nextUrl.searchParams.get('all') === 'true'
  if (!eventId) return NextResponse.json({ error: 'event_id required' }, { status: 400 })

  if (all) {
    const { data, error } = await supabaseAdmin
      .from('event_messaging_docs')
      .select('*')
      .eq('event_id', eventId)
      .order('version', { ascending: false })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data ?? [])
  }

  const { data, error } = await supabaseAdmin
    .from('event_messaging_docs')
    .select('*')
    .eq('event_id', eventId)
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

  if (!eventId || !file) {
    return NextResponse.json({ error: 'event_id and file required' }, { status: 400 })
  }
  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
    return NextResponse.json({ error: 'Only PDF files are accepted' }, { status: 400 })
  }
  if (file.size > 20 * 1024 * 1024) {
    return NextResponse.json({ error: 'File too large (max 20 MB)' }, { status: 413 })
  }

  const buffer = Buffer.from(await file.arrayBuffer())

  // Determine next version number for this event
  const { data: existing } = await supabaseAdmin
    .from('event_messaging_docs')
    .select('id, version, status')
    .eq('event_id', eventId)
    .order('version', { ascending: false })

  const nextVersion = existing && existing.length > 0 ? Math.max(...existing.map(d => d.version)) + 1 : 1
  const liveDoc = existing?.find(d => d.status === 'live')

  // Upload PDF
  const sourceUrl = await uploadPublicAsset(
    `events/${eventId}/messaging/v${nextVersion}-${Date.now()}.pdf`,
    buffer,
    'application/pdf'
  )

  // Extract + structure via Gemini
  let rawText = ''
  let structuredJson: Record<string, unknown> | null = null
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
  } catch (e) {
    console.error('Messaging doc extraction failed:', e)
    // Still save the doc with the PDF stored — extraction can be retried via PATCH later.
  }

  // Supersede the previous live doc, if any
  if (liveDoc) {
    await supabaseAdmin
      .from('event_messaging_docs')
      .update({ status: 'superseded' })
      .eq('id', liveDoc.id)
  }

  const { data, error } = await supabaseAdmin
    .from('event_messaging_docs')
    .insert({
      event_id:        eventId,
      version:         nextVersion,
      title:           title ?? `Topline Messaging v${nextVersion}`,
      raw_text:        rawText || null,
      structured_json: structuredJson,
      source_url:      sourceUrl,
      status:          'live',
      uploaded_by:     uploadedBy,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (liveDoc) {
    await supabaseAdmin.from('event_messaging_docs').update({ superseded_by: data.id }).eq('id', liveDoc.id)
  }

  return NextResponse.json(data, { status: 201 })
}
