/**
 * Bespoke Assets Upload API — Nic build_request 517e232e
 *
 * POST — accepts multipart/form-data with:
 *   file:         binary (image or PDF)
 *   project_id:   UUID (required)
 *   kind:         'client_logo' | 'brand_guidelines' | 'speaker_headshot' (required)
 *   speaker_idx:  number (required only when kind='speaker_headshot' — index into
 *                 the project's speakers[] JSONB array whose headshot_url will be
 *                 patched in-place)
 *
 * Uploads to the `event-stakeholder-assets` public bucket under
 *   bespoke/{project_id}/{kind}/{ts}-{filename}
 * then updates the appropriate column / JSONB path on the project row.
 *
 * Returns { url, storage_path }.
 *
 * Kept generic (single endpoint, three kinds) so the Assets tab has one code
 * path per upload UX, not three separate routes. Public bucket = we can
 * return a plain public URL rather than a signed URL; simpler for the client
 * to render.
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

export const runtime = 'nodejs'
export const maxDuration = 60

const BUCKET = 'event-stakeholder-assets'
const MAX_BYTES = 20 * 1024 * 1024 // 20 MB
const ALLOWED_KINDS = ['client_logo', 'brand_guidelines', 'speaker_headshot'] as const
type Kind = typeof ALLOWED_KINDS[number]

function safeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 128)
}

export async function POST(req: NextRequest) {
  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Expected multipart/form-data' }, { status: 400 })
  }

  const file       = form.get('file')       as File | null
  const projectId  = String(form.get('project_id') ?? '').trim()
  const kind       = String(form.get('kind')       ?? '').trim() as Kind
  const speakerIdxRaw = form.get('speaker_idx')

  if (!file)                        return NextResponse.json({ error: 'file required' }, { status: 400 })
  if (!projectId)                   return NextResponse.json({ error: 'project_id required' }, { status: 400 })
  if (!ALLOWED_KINDS.includes(kind)) return NextResponse.json({ error: `kind must be one of ${ALLOWED_KINDS.join(', ')}` }, { status: 400 })
  if (file.size > MAX_BYTES)        return NextResponse.json({ error: `File exceeds ${MAX_BYTES / 1024 / 1024} MB limit` }, { status: 413 })

  let speakerIdx: number | null = null
  if (kind === 'speaker_headshot') {
    speakerIdx = Number(speakerIdxRaw)
    if (!Number.isInteger(speakerIdx) || speakerIdx < 0) {
      return NextResponse.json({ error: 'speaker_idx required (non-negative integer) when kind=speaker_headshot' }, { status: 400 })
    }
  }

  // Upload to storage
  const ts = Date.now()
  const path = `bespoke/${projectId}/${kind}/${ts}-${safeFileName(file.name)}`
  const bytes = Buffer.from(await file.arrayBuffer())

  const { error: upErr } = await supabaseAdmin.storage.from(BUCKET).upload(path, bytes, {
    contentType: file.type || 'application/octet-stream',
    upsert: false,
    cacheControl: '3600',
  })
  if (upErr) return NextResponse.json({ error: 'Storage upload failed: ' + upErr.message }, { status: 500 })

  const { data: pub } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path)
  const publicUrl = pub.publicUrl

  // Persist on the project row
  if (kind === 'client_logo') {
    const { error } = await supabaseAdmin.from('bespoke_projects').update({ client_logo_url: publicUrl }).eq('id', projectId)
    if (error) return NextResponse.json({ error: 'DB update failed: ' + error.message, url: publicUrl }, { status: 500 })
  } else if (kind === 'brand_guidelines') {
    const { error } = await supabaseAdmin.from('bespoke_projects').update({ brand_guidelines_url: publicUrl }).eq('id', projectId)
    if (error) return NextResponse.json({ error: 'DB update failed: ' + error.message, url: publicUrl }, { status: 500 })
  } else if (kind === 'speaker_headshot') {
    // Patch speakers[speakerIdx].headshot_url in-place.
    const { data: proj, error: readErr } = await supabaseAdmin.from('bespoke_projects').select('speakers').eq('id', projectId).single()
    if (readErr || !proj) return NextResponse.json({ error: 'Could not read project speakers: ' + (readErr?.message ?? 'not found'), url: publicUrl }, { status: 500 })
    const speakers: Array<Record<string, unknown>> = Array.isArray(proj.speakers) ? [...(proj.speakers as Array<Record<string, unknown>>)] : []
    if (speakerIdx! >= speakers.length) return NextResponse.json({ error: `speaker_idx ${speakerIdx} out of range (${speakers.length} speakers)`, url: publicUrl }, { status: 400 })
    speakers[speakerIdx!] = { ...speakers[speakerIdx!], headshot_url: publicUrl }
    const { error } = await supabaseAdmin.from('bespoke_projects').update({ speakers }).eq('id', projectId)
    if (error) return NextResponse.json({ error: 'DB update failed: ' + error.message, url: publicUrl }, { status: 500 })
  }

  return NextResponse.json({ url: publicUrl, storage_path: path }, { status: 201 })
}
