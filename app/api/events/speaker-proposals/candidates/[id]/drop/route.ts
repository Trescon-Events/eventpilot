import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { supabaseAdmin } from '@/app/lib/supabase'
import { GEMINI_FLASH_MODEL } from '@/app/lib/ai/models'
import { uploadPublicAsset, deletePublicAssetByUrl } from '@/app/lib/events/storage'
import { authCandidate } from '@/app/lib/proposals/server'

/* POST multipart { file } — an image a producer pasted or dropped into the "Drop more info" box. The AI decides what it is:
     portrait  → a photo of the speaker: it becomes the card's photo
     document  → a screenshot / scan of text (a LinkedIn page, a bio, an article): the text is read and added to the info the research will use
     other     → refused, with a plain reason
   Text and links need no endpoint — they are saved with the card's info and read when the research runs. */
export const maxDuration = 60
const TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }
const MAX_EXTRA = 12000

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const a = await authCandidate(req, id, 'edit'); if ('error' in a) return a.error
  const form = await req.formData().catch(() => null); const file = form?.get('file')
  if (!(file instanceof File) || !TYPES[file.type]) return NextResponse.json({ error: 'Drop a JPG, PNG or WebP image.' }, { status: 400 })
  if (file.size > 8 * 1024 * 1024) return NextResponse.json({ error: 'That image is too large (8 MB max).' }, { status: 422 })
  const buf = Buffer.from(await file.arrayBuffer())
  const input = a.candidate.input as Record<string, unknown>
  const who = [input.name, input.designation, input.company].filter(Boolean).join(', ')

  let kind: 'portrait' | 'document' | 'other' = 'other', text = '', note = ''
  try {
    const model = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!).getGenerativeModel({ model: GEMINI_FLASH_MODEL, generationConfig: { responseMimeType: 'application/json' } })
    const r = await model.generateContent([
      { inlineData: { mimeType: file.type, data: buf.toString('base64') } },
      { text: `A producer dropped this image for a proposed conference speaker (${who}). Decide what it is and return JSON only:
{"kind":"portrait"|"document"|"other","text":"","note":""}
- "portrait": a clear photo of ONE person's face and shoulders that could serve as the speaker's headshot. Not a group photo, not a logo, not a screenshot of a web page or app.
- "document": a screenshot, scan or photo of TEXT (a LinkedIn profile, a website page, a bio, an article, a PDF page). Put ALL the readable text in "text", verbatim, in reading order; skip menus, buttons and ads where you can tell them apart.
- "other": anything else. Say in "note", in one plain sentence, what it looks like.` },
    ], { timeout: 45_000 })
    const j = JSON.parse(r.response.text()) as { kind?: string; text?: string; note?: string }
    kind = j.kind === 'portrait' || j.kind === 'document' ? j.kind : 'other'; text = (j.text ?? '').trim(); note = (j.note ?? '').trim()
  } catch (e) {
    console.error('[proposals] drop classify failed:', e instanceof Error ? e.message : e)
    return NextResponse.json({ error: 'Could not read that image right now — try again, or paste the text instead.' }, { status: 502 })
  }

  if (kind === 'portrait') {
    const url = await uploadPublicAsset(`events/${a.candidate.event_id}/proposals/${id}/photo-${Date.now()}.${TYPES[file.type]}`, buf, file.type)
    const card = a.candidate.card as Record<string, unknown>
    if (typeof card.photo_url === 'string' && card.photo_url.includes(`/proposals/${id}/`)) await deletePublicAssetByUrl(card.photo_url).catch(() => {})
    await supabaseAdmin.from('speaker_proposal_candidates').update({ card: { ...card, photo_url: url }, updated_at: new Date().toISOString() }).eq('id', id)
    return NextResponse.json({ kind, photo_url: url })
  }
  if (kind === 'document') {
    if (!text) return NextResponse.json({ error: 'I could not find any readable text in that image.' }, { status: 422 })
    const extra = [String(input.extra ?? '').trim(), `[Text read from a pasted screenshot]\n${text}`].filter(Boolean).join('\n\n').slice(0, MAX_EXTRA)
    await supabaseAdmin.from('speaker_proposal_candidates').update({ input: { ...input, extra }, updated_at: new Date().toISOString() }).eq('id', id)
    return NextResponse.json({ kind, extra })
  }
  return NextResponse.json({ kind, note: note || 'That image does not look like a photo of the speaker or a page of text.' })
}
