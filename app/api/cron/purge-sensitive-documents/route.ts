import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { deleteSensitiveDocument } from '@/app/lib/events/sensitive-storage'
import { sendSensitiveDocumentPurged } from '@/app/lib/email'

/*
  GET /api/cron/purge-sensitive-documents
  Auth: Authorization: Bearer <CRON_SECRET>
  Schedule on cron-job.org: daily, e.g. 0 3 * * * (03:00 UTC) — register by
  hand, same as every other cron route (see app/api/cron/hrms-sync's doc
  comment for the general pattern; nothing in-repo auto-registers a job).

  Hard-deletes the storage object for any speaker_sensitive_documents row
  past its retention_expires_at, stamps the row (storage_path = null,
  deleted_at, deleted_by = 'system_auto_purge') rather than removing it —
  the row itself is the permanent audit trail — and emails the speaker once
  per sweep even if multiple of their documents were purged together.
*/
export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const nowIso = new Date().toISOString()
  const { data: due, error: findErr } = await supabaseAdmin
    .from('speaker_sensitive_documents')
    .select('id, speaker_id, event_id, document_type, storage_path')
    .is('deleted_at', null)
    .lte('retention_expires_at', nowIso)

  if (findErr) return NextResponse.json({ error: findErr.message }, { status: 500 })
  if (!due || due.length === 0) return NextResponse.json({ ok: true, purged: 0, notified: 0, failed: 0 })

  const failures: { id: string; error: string }[] = []
  let purged = 0

  // Group by speaker so one email covers every document purged for them in
  // this sweep, rather than one email per document.
  const bySpeaker = new Map<string, typeof due>()
  for (const row of due) {
    if (!bySpeaker.has(row.speaker_id)) bySpeaker.set(row.speaker_id, [])
    bySpeaker.get(row.speaker_id)!.push(row)
  }

  const DOC_LABELS: Record<string, string> = { passport: 'Passport', national_id: 'National ID' }
  let notified = 0

  for (const [speakerId, rows] of bySpeaker) {
    const purgedIds: string[] = []
    for (const row of rows) {
      try {
        if (row.storage_path) await deleteSensitiveDocument(row.storage_path)
        purgedIds.push(row.id)
        purged++
      } catch (e) {
        failures.push({ id: row.id, error: e instanceof Error ? e.message : 'unknown error' })
      }
    }
    if (purgedIds.length === 0) continue

    const purgedAt = new Date().toISOString()
    const { data: speaker } = await supabaseAdmin
      .from('event_speakers')
      .select('email, name, public_name, event_id')
      .eq('id', speakerId)
      .single()

    let notifiedAt: string | null = null
    if (speaker?.email) {
      const { data: event } = await supabaseAdmin.from('events').select('public_name, name').eq('id', speaker.event_id).single()
      try {
        await sendSensitiveDocumentPurged({
          to: speaker.email,
          name: speaker.public_name || speaker.name || 'there',
          eventName: event?.public_name || event?.name || 'the event',
          documentLabels: rows.filter(r => purgedIds.includes(r.id)).map(r => DOC_LABELS[r.document_type] ?? r.document_type),
        })
        notifiedAt = purgedAt
        notified++
      } catch (e) {
        failures.push({ id: speakerId, error: `notify failed: ${e instanceof Error ? e.message : 'unknown error'}` })
      }
    }

    await supabaseAdmin
      .from('speaker_sensitive_documents')
      .update({ storage_path: null, deleted_at: purgedAt, deleted_by: 'system_auto_purge', notified_at: notifiedAt })
      .in('id', purgedIds)
  }

  return NextResponse.json({ ok: true, purged, notified, failed: failures.length, failures })
}
