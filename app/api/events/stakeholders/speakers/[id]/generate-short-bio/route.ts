import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'
import { extractPdfText } from '@/app/lib/pdf-text'
import { isQuotaError, QUOTA_ERROR_MESSAGE } from '@/app/lib/gemini-error'

/* POST /api/events/stakeholders/speakers/[id]/generate-short-bio

   Downloads the speaker's stored Full Bio PDF (bio_full_url — always a
   PDF by the time it's stored, see app/lib/events/full-bio-upload.ts),
   extracts its text, and asks Gemini to condense it into a ~150-300 word
   short bio matching the onboarding form's own Short Bio guidance.

   Propose-only, same as every other AI-assist route in this app — never
   writes to the DB itself. The Details page applies the returned text to
   the live Short Bio field (with an Undo snapshot), which only persists
   through that page's normal autosave, same as any other manual edit. */

let _gemini: GoogleGenerativeAI | null = null
function getGemini() {
  if (!_gemini) _gemini = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
  return _gemini
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: speakerId } = await params

  const { data: speaker } = await supabaseAdmin
    .from('event_speakers')
    .select('event_id, name, bio_full_url')
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

  let fullBioText: string
  try {
    const fileRes = await fetch(speaker.bio_full_url)
    if (!fileRes.ok) throw new Error(`Failed to download Full Bio PDF: ${fileRes.status}`)
    const buffer = Buffer.from(await fileRes.arrayBuffer())
    fullBioText = await extractPdfText(buffer)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not read the Full Bio PDF' }, { status: 500 })
  }
  if (!fullBioText.trim()) {
    return NextResponse.json({ error: 'The Full Bio PDF has no extractable text (it may be a scanned image) — write the Short Bio by hand instead.' }, { status: 422 })
  }

  const prompt = `You are writing a short professional speaker bio for an event website and speaker listing, based on a longer source bio below.

Rules:
- 150-300 words, third person, professional tone.
- Cover current role, organisation, and the most relevant career highlights/achievements for a conference audience — drop anything not relevant to why they're speaking.
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
    return NextResponse.json({ short_bio: shortBio })
  } catch (e) {
    if (isQuotaError(e)) return NextResponse.json({ error: QUOTA_ERROR_MESSAGE }, { status: 429 })
    console.error('generate-short-bio failed:', e)
    return NextResponse.json({ error: 'Could not generate a short bio. Please try again or write it by hand.' }, { status: 500 })
  }
}
