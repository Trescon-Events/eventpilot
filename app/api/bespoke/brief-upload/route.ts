/**
 * Bespoke Brief Upload API
 * POST — accepts a PDF or DOCX brief file, uploads it to the `bespoke-briefs`
 * private Supabase Storage bucket, updates `bespoke_projects.brief_file_url`
 * with the storage path, and returns { storage_path, signed_url }.
 *
 * Called by the Brief tab drag-and-drop uploader. Companion route
 * `/api/bespoke/parse-brief` then downloads the file and runs Gemini
 * extraction on it — kept separate so the client can show a "Parsing..."
 * state independently of the upload progress.
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

export const runtime = 'nodejs'
export const maxDuration = 60

const BUCKET = 'bespoke-briefs'
const MAX_BYTES = 20 * 1024 * 1024 // 20 MB per PRD
const ALLOWED_TYPES = new Set<string>([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
])

export async function POST(req: NextRequest) {
  let form: FormData
  try { form = await req.formData() }
  catch { return NextResponse.json({ error: 'Invalid form data' }, { status: 400 }) }

  const projectId = String(form.get('project_id') ?? '').trim()
  const file = form.get('file')

  if (!projectId) return NextResponse.json({ error: 'project_id required' }, { status: 400 })
  if (!(file instanceof File)) return NextResponse.json({ error: 'file required' }, { status: 400 })
  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json({ error: 'Only PDF or DOCX files are allowed' }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'File exceeds 20 MB' }, { status: 400 })
  }

  const safeName = file.name.replace(/[^a-z0-9._-]/gi, '_')
  const storagePath = `${projectId}/${Date.now()}-${safeName}`
  const buffer = Buffer.from(await file.arrayBuffer())

  const { error: upErr } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(storagePath, buffer, { contentType: file.type, upsert: false })

  if (upErr) {
    return NextResponse.json({ error: `Upload failed: ${upErr.message}` }, { status: 500 })
  }

  // Update the project so the file survives across sessions and appears in the UI
  const { error: patchErr } = await supabaseAdmin
    .from('bespoke_projects')
    .update({ brief_file_url: storagePath, updated_at: new Date().toISOString() })
    .eq('id', projectId)

  if (patchErr) {
    // Best-effort cleanup so we don't leave orphaned files
    await supabaseAdmin.storage.from(BUCKET).remove([storagePath]).catch(() => {})
    return NextResponse.json({ error: `Project update failed: ${patchErr.message}` }, { status: 500 })
  }

  const { data: signed } = await supabaseAdmin.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, 3600)

  return NextResponse.json({
    storage_path: storagePath,
    signed_url:   signed?.signedUrl ?? null,
  })
}
