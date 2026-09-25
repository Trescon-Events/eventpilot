import { Zip, ZipPassThrough } from 'fflate'
import { supabaseAdmin } from '@/app/lib/supabase'
import { downloadSensitiveDocument } from '@/app/lib/events/sensitive-storage'
import { sensitiveDocumentFileName } from '@/app/lib/events/sensitive-doc-name'

/* Builds the vendor's download for one batch: a ZIP with a folder per
   speaker (passport, and National ID for UAE residents) plus a manifest.csv.
   The file list comes ONLY from the frozen batch items in our database —
   nothing about which files to include is taken from the request. The ZIP
   is streamed one file at a time so a large batch never sits fully in memory. */

export type ZipFile = { name: string; load: () => Promise<Uint8Array | null> }
export type PreparedZip = { ok: true; batchNumber: number; files: ZipFile[]; speakerCount: number } | { ok: false; message: string }

const EXT_BY_MIME: Record<string, string> = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }

// Keep names readable (incl. non-Latin scripts) but strip anything that could
// act as a path or control character inside the archive.
function safeSegment(s: string): string {
  return s.replace(/[^\p{L}\p{N} ._-]/gu, '_').replace(/\.{2,}/g, '.').replace(/^[. ]+|[. ]+$/g, '').slice(0, 80) || 'speaker'
}

// CSV cell with quote-escaping and a guard against spreadsheet formula injection.
function csvCell(v: string | null | undefined): string {
  let s = (v ?? '').replace(/\r?\n/g, ' ')
  if (/^[=+\-@\t]/.test(s)) s = `'${s}`
  return `"${s.replace(/"/g, '""')}"`
}

export async function prepareBatchZip(batchId: string): Promise<PreparedZip> {
  const { data: batch } = await supabaseAdmin.from('ops_license_batches').select('batch_number').eq('id', batchId).maybeSingle()
  if (!batch) return { ok: false, message: 'Batch not found.' }

  const { data: items } = await supabaseAdmin.from('ops_license_batch_items')
    .select('speaker_name, job_title, company, country, is_uae_resident, passport_doc_id, national_id_doc_id')
    .eq('batch_id', batchId).eq('active', true).order('speaker_name')
  if (!items?.length) return { ok: false, message: 'This batch has no speakers.' }

  const docIds = items.flatMap(i => [i.passport_doc_id, i.national_id_doc_id]).filter((d): d is string => !!d)
  const { data: docs } = await supabaseAdmin.from('speaker_sensitive_documents')
    .select('id, storage_path, mime_type, file_name, deleted_at').in('id', docIds)
  const docById = new Map((docs ?? []).map(d => [d.id, d]))

  const files: ZipFile[] = []
  const rows: string[] = ['Speaker,Job title,Company,Country,UAE resident,Passport file,National ID file']
  for (const [idx, it] of items.entries()) {
    const folder = `${String(idx + 1).padStart(2, '0')} - ${safeSegment(it.speaker_name)}`
    const cells: Record<string, string> = {}
    for (const [label, docId] of [['passport', it.passport_doc_id], ['national-id', it.national_id_doc_id]] as const) {
      const docType = label === 'passport' ? 'passport' : 'national_id'
      if (!docId) continue
      const d = docById.get(docId)
      // A replaced/deleted/purged document can't be sent — better to say so
      // than to hand the vendor an incomplete or wrong batch.
      if (!d || d.deleted_at || !d.storage_path) return { ok: false, message: 'A document in this batch is no longer available.' }
      const ext = EXT_BY_MIME[d.mime_type] ?? (d.file_name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin')
      // Same standard as at intake: <Public Name>-passport.<ext> / <Public Name>-EID.<ext>
      // (speaker_name is the frozen Public Name from when the batch was created).
      const name = `${folder}/${sensitiveDocumentFileName(it.speaker_name, docType, ext)}`
      cells[label] = name
      const storagePath = d.storage_path
      files.push({ name, load: () => downloadSensitiveDocument(storagePath) })
    }
    rows.push([it.speaker_name, it.job_title, it.company, it.country, it.is_uae_resident ? 'Yes' : 'No', cells.passport, cells['national-id']].map(csvCell).join(','))
  }

  const manifest = new TextEncoder().encode('﻿' + rows.join('\r\n') + '\r\n')
  return { ok: true, batchNumber: batch.batch_number, speakerCount: items.length, files: [{ name: 'manifest.csv', load: async () => manifest }, ...files] }
}

/** Streams the archive. `onComplete` runs only after every file was read successfully (never on abort/failure). */
export function streamZip(files: ZipFile[], onComplete: () => Promise<void>): ReadableStream<Uint8Array> {
  let next = 0
  let finished = false
  let zip: Zip
  return new ReadableStream<Uint8Array>({
    start(controller) {
      zip = new Zip((err, chunk, final) => {
        if (err) { controller.error(err); return }
        controller.enqueue(chunk)
        if (final) controller.close()
      })
    },
    async pull(controller) {
      if (next < files.length) {
        const file = files[next++]
        const bytes = await file.load()
        if (!bytes) { controller.error(new Error(`Could not read ${file.name}`)); return }
        const entry = new ZipPassThrough(file.name)   // JPG/PDF/PNG are already compressed
        zip.add(entry)
        entry.push(bytes, true)
      } else if (!finished) {
        finished = true
        await onComplete()
        zip.end()
      }
    },
  })
}
