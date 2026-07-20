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

const STRUCTURE_PROMPT = `You are extracting a structured summary from an event's topline messaging document, for use by an AI system that writes social media announcement copy.

From the document text below, extract a JSON object with this exact shape:
{
  "positioning_statement": "...",
  "narrative": "...",
  "themes": ["...", "..."],
  "target_audiences": ["...", "..."],
  "campaign_phases": ["...", "..."],
  "tone_of_voice": "..."
}

Only use information actually present in the document — never invent or infer facts not stated. If a field genuinely isn't covered, use an empty string or empty array. Return JSON only, no commentary, no markdown fences.

DOCUMENT TEXT:
`

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
    const result = await model.generateContent([{ text: STRUCTURE_PROMPT + rawText.slice(0, 30000) }])
    const text   = result.response.text().trim()
    const match  = text.match(/\{[\s\S]*\}/)
    structuredJson = match ? JSON.parse(match[0]) : null
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
