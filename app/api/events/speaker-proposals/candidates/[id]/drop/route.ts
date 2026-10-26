import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { supabaseAdmin } from '@/app/lib/supabase'
import { GEMINI_FLASH_MODEL } from '@/app/lib/ai/models'
import { uploadPublicAsset, deletePublicAssetByUrl } from '@/app/lib/events/storage'
import { authCandidate } from '@/app/lib/proposals/server'
import { DOC_EXT, IMAGE_TYPES, MAX_FILES, MAX_FILE_BYTES, MAX_FILE_TEXT, extractFileText, type ProposalFile } from '@/app/lib/proposals/files'
import { randomUUID } from 'node:crypto'

/* POST multipart { file } — one file from the "Files" box (up to 10 per speaker). Every file gets a line in the box saying what it gave:
     image → the AI decides: a headshot ("photo": it becomes the card's photo), a screenshot / scan of text ("text": read, kept for the research), or something else ("ignored", with the reason)
     PDF, Word (.docx), PowerPoint (.pptx), text → the words in it ("text")
   DELETE ?file_id= takes a file off the list (its text is no longer used; a photo it set stays until removed on the card).
   Links and LinkedIn text need no endpoint — they are saved with the card's info and read when the research runs. */
export const maxDuration = 60

const cap = (files: ProposalFile[]) => files.slice(-MAX_FILES)

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const a = await authCandidate(req, id, 'edit'); if ('error' in a) return a.error
  const form = await req.formData().catch(() => null); const file = form?.get('file')
  if (!(file instanceof File)) return NextResponse.json({ error: 'Choose a file.' }, { status: 400 })
  const isImage = !!IMAGE_TYPES[file.type]
  if (!isImage && !DOC_EXT.test(file.name)) return NextResponse.json({ error: 'Use an image, PDF, Word (.docx), PowerPoint (.pptx) or text file. Older .doc / .ppt files: save them as .docx / .pptx first.' }, { status: 400 })
  if (file.size > MAX_FILE_BYTES) return NextResponse.json({ error: `“${file.name}” is too large (12 MB max).` }, { status: 422 })
  const buf = Buffer.from(await file.arrayBuffer())
  const input = a.candidate.input as Record<string, unknown>
  const existing = (Array.isArray(input.files) ? input.files : []) as ProposalFile[]
  const name = (file.name || 'pasted image').slice(0, 120)
  const save = async (entry: ProposalFile) => {
    const next = cap([...existing, entry])
    await supabaseAdmin.from('speaker_proposal_candidates').update({ input: { ...input, files: next }, updated_at: new Date().toISOString() }).eq('id', id)
    return NextResponse.json({ ok: true, kind: entry.kind, name: entry.name, chars: entry.chars, note: entry.note, ...(entry.url ? { photo_url: entry.url } : {}) })
  }

  if (!isImage) {
    let text = ''
    try { text = await extractFileText(buf, name) } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not read that file.' }, { status: 422 }) }
    if (text.length < 20) return save({ id: randomUUID(), name, kind: 'ignored', chars: 0, note: 'No readable text in it (a scanned PDF? drop it as an image instead).' })
    return save({ id: randomUUID(), name, kind: 'text', chars: text.length, text })
  }

  const who = [input.name, input.designation, input.company].filter(Boolean).join(', ')
  let kind: 'portrait' | 'document' | 'other' = 'other', text = '', note = ''
  try {
    const model = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!).getGenerativeModel({ model: GEMINI_FLASH_MODEL, generationConfig: { responseMimeType: 'application/json' } })
    const r = await model.generateContent([
      { inlineData: { mimeType: file.type, data: buf.toString('base64') } },
      { text: `A producer dropped this image for a proposed conference speaker (${who}). Decide what it is and return JSON only:
{"kind":"portrait"|"document"|"other","text":"","note":""}
- "portrait": a clear photo of ONE person's face and shoulders that could serve as the speaker's headshot. Not a group photo, not a logo, not a screenshot of a web page or app.
- "document": a screenshot, scan or photo of TEXT (a LinkedIn profile, a website page, a bio, an article, a PDF page). Put ALL the readable text in "text", verbatim, in reading order; skip menus, buttons, ads and any other people listed on the page ("more profiles", "people also viewed").
- "other": anything else. Say in "note", in one plain sentence, what it looks like.` },
    ], { timeout: 45_000 })
    const j = JSON.parse(r.response.text()) as { kind?: string; text?: string; note?: string }
    kind = j.kind === 'portrait' || j.kind === 'document' ? j.kind : 'other'; text = (j.text ?? '').trim().slice(0, MAX_FILE_TEXT); note = (j.note ?? '').trim()
  } catch (e) {
    console.error('[proposals] drop classify failed:', e instanceof Error ? e.message : e)
    return NextResponse.json({ error: 'Could not read that image right now — try again.' }, { status: 502 })
  }

  if (kind === 'portrait') {
    const url = await uploadPublicAsset(`events/${a.candidate.event_id}/proposals/${id}/photo-${Date.now()}.${IMAGE_TYPES[file.type]}`, buf, file.type)
    const card = a.candidate.card as Record<string, unknown>
    if (typeof card.photo_url === 'string' && card.photo_url.includes(`/proposals/${id}/`)) await deletePublicAssetByUrl(card.photo_url).catch(() => {})
    await supabaseAdmin.from('speaker_proposal_candidates').update({ card: { ...card, photo_url: url } }).eq('id', id)
    return save({ id: randomUUID(), name, kind: 'photo', chars: 0, url })
  }
  if (kind === 'document') {
    if (!text) return save({ id: randomUUID(), name, kind: 'ignored', chars: 0, note: 'No readable text found in that image.' })
    return save({ id: randomUUID(), name, kind: 'text', chars: text.length, text })
  }
  return save({ id: randomUUID(), name, kind: 'ignored', chars: 0, note: note || 'Not a photo of the speaker and not a page of text.' })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const a = await authCandidate(req, id, 'edit'); if ('error' in a) return a.error
  const fileId = new URL(req.url).searchParams.get('file_id') ?? ''
  const input = a.candidate.input as Record<string, unknown>
  const files = ((Array.isArray(input.files) ? input.files : []) as ProposalFile[]).filter(f => f.id !== fileId)
  await supabaseAdmin.from('speaker_proposal_candidates').update({ input: { ...input, files }, updated_at: new Date().toISOString() }).eq('id', id)
  return NextResponse.json({ ok: true })
}
