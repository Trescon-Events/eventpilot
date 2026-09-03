import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'
import { deleteSensitiveDocument } from '@/app/lib/events/sensitive-storage'

/* DELETE /api/events/stakeholders/speakers/[id]/sensitive-documents/[docId]
   Manual correction-delete (e.g. wrong file uploaded) — distinct from the
   retention-cron purge: stamps deleted_by with the acting staff id (not
   'system_auto_purge') and deliberately does NOT email the speaker, since
   this is an internal fix, not the data-retention event the "your document
   was deleted" notification exists to explain. */

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; docId: string }> }) {
  const { id: speakerId, docId } = await params

  const { data: doc } = await supabaseAdmin
    .from('speaker_sensitive_documents')
    .select('id, event_id, storage_path, speaker_id, deleted_at')
    .eq('id', docId)
    .single()
  if (!doc || doc.speaker_id !== speakerId) return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  if (doc.deleted_at) return NextResponse.json({ error: 'Already deleted' }, { status: 409 })

  const session = getSession(req)
  if (!session?.adm && !(await hasEventPermission(session?.sid, doc.event_id, 'sae.sensitive_documents.manage'))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  if (doc.storage_path) await deleteSensitiveDocument(doc.storage_path)

  const staffId = session?.sid && session.sid !== 'super-admin' ? session.sid : 'unknown'
  const { error } = await supabaseAdmin
    .from('speaker_sensitive_documents')
    .update({ storage_path: null, deleted_at: new Date().toISOString(), deleted_by: staffId })
    .eq('id', docId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
