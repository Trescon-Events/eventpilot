import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'
import { uploadSensitiveDocument, getSensitiveDocumentSignedUrl, deleteSensitiveDocument } from '@/app/lib/events/sensitive-storage'

/* GET  /api/events/stakeholders/speakers/[id]/sensitive-documents
   POST /api/events/stakeholders/speakers/[id]/sensitive-documents  (multipart: file, document_type)

   Passport/National ID storage — isolated from the general speaker record
   (see app/lib/events/sensitive-storage.ts's doc comment for the full
   design: private bucket, signed URLs, retention + permanent audit trail).
   Gated by the sae.sensitive_documents.* RBAC keys, granted the same way
   as every other Event Workspace Access Role (Roles + Assign People). */

const ALLOWED_TYPES: Record<string, string> = {
  'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
}
const MAX_SIZE = 20 * 1024 * 1024
const DOCUMENT_TYPES = new Set(['passport', 'national_id'])

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: speakerId } = await params

  const { data: speaker } = await supabaseAdmin.from('event_speakers').select('event_id').eq('id', speakerId).single()
  if (!speaker) return NextResponse.json({ error: 'Speaker not found' }, { status: 404 })

  const session = getSession(req)
  if (!session?.adm && !(await hasEventPermission(session?.sid, speaker.event_id, 'sae.sensitive_documents.view'))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  const { data: rows, error } = await supabaseAdmin
    .from('speaker_sensitive_documents')
    .select('*')
    .eq('speaker_id', speakerId)
    .order('uploaded_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const active = (rows ?? []).filter(r => !r.deleted_at)
  const history = (rows ?? []).filter(r => r.deleted_at)

  const documents = await Promise.all(active.map(async r => ({
    id: r.id,
    document_type: r.document_type,
    file_name: r.file_name,
    file_size: r.file_size,
    uploaded_at: r.uploaded_at,
    retention_expires_at: r.retention_expires_at,
    signed_url: r.storage_path ? await getSensitiveDocumentSignedUrl(r.storage_path) : null,
  })))

  return NextResponse.json({
    documents,
    history: history.map(r => ({
      id: r.id, document_type: r.document_type, file_name: r.file_name,
      uploaded_at: r.uploaded_at, deleted_at: r.deleted_at, deleted_by: r.deleted_by, notified_at: r.notified_at,
    })),
  })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: speakerId } = await params

  const { data: speaker } = await supabaseAdmin.from('event_speakers').select('event_id').eq('id', speakerId).single()
  if (!speaker) return NextResponse.json({ error: 'Speaker not found' }, { status: 404 })

  const session = getSession(req)
  if (!session?.adm && !(await hasEventPermission(session?.sid, speaker.event_id, 'sae.sensitive_documents.manage'))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  const form = await req.formData()
  const file = form.get('file') as File | null
  const documentType = form.get('document_type') as string | null

  if (!file || !documentType || !DOCUMENT_TYPES.has(documentType)) {
    return NextResponse.json({ error: 'file and document_type (passport|national_id) required' }, { status: 400 })
  }
  const ext = ALLOWED_TYPES[file.type]
  if (!ext) return NextResponse.json({ error: `Unsupported file type ${file.type}` }, { status: 400 })
  if (file.size > MAX_SIZE) return NextResponse.json({ error: `File too large (max ${MAX_SIZE / (1024 * 1024)} MB)` }, { status: 413 })

  const { data: event } = await supabaseAdmin
    .from('events')
    .select('end_date, sensitive_document_retention_days')
    .eq('id', speaker.event_id)
    .single()
  const retentionDays = event?.sensitive_document_retention_days ?? 30
  const baseDate = event?.end_date ? new Date(event.end_date) : new Date()
  const retentionExpiresAt = new Date(baseDate.getTime() + retentionDays * 24 * 60 * 60 * 1000).toISOString()

  const staffId = session?.sid && session.sid !== 'super-admin' ? session.sid : null

  // One active doc per (speaker, type) — replacing a passport soft-deletes
  // the previous row rather than accumulating versions (see migration's
  // doc comment).
  const { data: prior } = await supabaseAdmin
    .from('speaker_sensitive_documents')
    .select('id, storage_path')
    .eq('speaker_id', speakerId)
    .eq('document_type', documentType)
    .is('deleted_at', null)
    .maybeSingle()

  if (prior) {
    if (prior.storage_path) await deleteSensitiveDocument(prior.storage_path)
    await supabaseAdmin
      .from('speaker_sensitive_documents')
      .update({ storage_path: null, deleted_at: new Date().toISOString(), deleted_by: staffId ?? 'unknown' })
      .eq('id', prior.id)
  }

  const storagePath = `${speaker.event_id}/${speakerId}/${documentType}-${Date.now()}.${ext}`
  const buffer = Buffer.from(await file.arrayBuffer())
  await uploadSensitiveDocument(storagePath, buffer, file.type)

  const { data: row, error } = await supabaseAdmin
    .from('speaker_sensitive_documents')
    .insert({
      speaker_id: speakerId,
      event_id: speaker.event_id,
      document_type: documentType,
      storage_path: storagePath,
      file_name: file.name,
      mime_type: file.type,
      file_size: file.size,
      uploaded_by: staffId,
      retention_expires_at: retentionExpiresAt,
    })
    .select('*')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const signedUrl = await getSensitiveDocumentSignedUrl(storagePath)
  return NextResponse.json({
    document: {
      id: row.id, document_type: row.document_type, file_name: row.file_name, file_size: row.file_size,
      uploaded_at: row.uploaded_at, retention_expires_at: row.retention_expires_at, signed_url: signedUrl,
    },
  })
}
