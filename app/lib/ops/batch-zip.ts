import { Zip, ZipPassThrough } from 'fflate'
import { supabaseAdmin } from '@/app/lib/supabase'
import { downloadSensitiveDocument } from '@/app/lib/events/sensitive-storage'
import { sensitiveDocumentFileName } from '@/app/lib/events/sensitive-doc-name'
import { formatDeleteBy } from '@/app/lib/ops/delete-by'

/* Builds the vendor's download for one batch: a ZIP with a folder per
   speaker (passport, and National ID for UAE residents) plus a manifest.csv.
   The file list comes ONLY from the frozen batch items in our database —
   nothing about which files to include is taken from the request. The ZIP
   is streamed one file at a time so a large batch never sits fully in memory. */

export type ZipFile = { name: string; load: () => Promise<Uint8Array | null> }
export type PreparedZip = { ok: true; batchNumber: number; files: ZipFile[]; speakerCount: number; part: number; partCount: number } | { ok: false; message: string }

/** A big batch is downloaded in parts of this many speakers (about 30 MB each for passports + IDs), so one slow or dropped connection only costs one part. */
export const PART_SIZE = 20
export const partCountOf = (speakers: number) => Math.max(1, Math.ceil(speakers / PART_SIZE))

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

/** `part` is 1-based and required when the batch has more than one part. Each part is a complete ZIP of its own speakers (README + manifest.csv + a folder per speaker; folder numbers continue across parts). */
export async function prepareBatchZip(batchId: string, deleteBy?: string | null, part?: number): Promise<PreparedZip> {
  const { data: batch } = await supabaseAdmin.from('ops_license_batches').select('batch_number').eq('id', batchId).maybeSingle()
  if (!batch) return { ok: false, message: 'Batch not found.' }

  const { data: allItems } = await supabaseAdmin.from('ops_license_batch_items')
    .select('speaker_name, job_title, company, country, is_uae_resident, passport_doc_id, national_id_doc_id')
    .eq('batch_id', batchId).eq('active', true).order('speaker_name')
  if (!allItems?.length) return { ok: false, message: 'This batch has no speakers.' }
  const partCount = partCountOf(allItems.length)
  if (partCount > 1 && part === undefined) return { ok: false, message: 'This batch is downloaded in parts. Please choose which part.' }
  const partNo = part ?? 1
  if (!Number.isInteger(partNo) || partNo < 1 || partNo > partCount) return { ok: false, message: 'That part does not exist.' }
  const offset = (partNo - 1) * PART_SIZE
  const items = allItems.slice(offset, offset + PART_SIZE)

  const docIds = items.flatMap(i => [i.passport_doc_id, i.national_id_doc_id]).filter((d): d is string => !!d)
  const { data: docs } = await supabaseAdmin.from('speaker_sensitive_documents')
    .select('id, storage_path, mime_type, file_name, deleted_at').in('id', docIds)
  const docById = new Map((docs ?? []).map(d => [d.id, d]))

  const files: ZipFile[] = []
  const rows: string[] = ['Speaker,Job title,Company,Country,UAE resident,Passport file,National ID file']
  for (const [i, it] of items.entries()) {
    const idx = offset + i
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
  const readme = new TextEncoder().encode([
    'CONFIDENTIAL - personal data of speakers.',
    'Use these documents only to apply for the speakers\' licences/permits. Do not share or forward them.',
    `Delete EVERY copy (drive, email, devices, downloads) as soon as the permits are approved${deleteBy ? ` - and in any case by ${formatDeleteBy(deleteBy)}` : ''}.`,
    'Report any loss or exposure to the Trescon Ops team immediately.',
    ...(partCount > 1 ? ['', `This is part ${partNo} of ${partCount} of the batch (speakers ${offset + 1}-${offset + items.length} of ${allItems.length}). Download every part.`] : []),
    '',
  ].join('\r\n'))
  return { ok: true, batchNumber: batch.batch_number, speakerCount: items.length, part: partNo, partCount, files: [{ name: 'README.txt', load: async () => readme }, { name: 'manifest.csv', load: async () => manifest }, ...files] }
}

export type ZipFailure = { fileIndex: number; fileCount: number; bytesSent: number; seconds: number; reason: string }

/** Files read ahead of the one being written. Reading them one by one took over two minutes for 146 files; a few at a time keeps memory small (a handful of files) and cuts the wait. */
const READ_AHEAD = 5

/** Streams the archive. `onComplete` runs only after every file was read successfully (never on abort/failure).
    `onFail` runs once if the archive cannot be finished: a file could not be read (after one retry) or the receiver went away before the end. */
export function streamZip(files: ZipFile[], onComplete: () => Promise<void>, opts?: { onFail?: (f: ZipFailure) => void | Promise<void> }): ReadableStream<Uint8Array> {
  const t0 = Date.now()
  let next = 0, nextLoad = 0, bytesSent = 0
  let finished = false, failed = false
  let zip: Zip
  const pending = new Map<number, Promise<Uint8Array | null>>()
  // Never rejects: a file that cannot be read after one more try comes back as null.
  const load = async (f: ZipFile): Promise<Uint8Array | null> => {
    for (let attempt = 0; attempt < 2; attempt++) { try { const b = await f.load(); if (b) return b } catch { /* try once more */ } }
    return null
  }
  const readAhead = () => { while (pending.size < READ_AHEAD && nextLoad < files.length) { pending.set(nextLoad, load(files[nextLoad])); nextLoad++ } }
  const fail = async (reason: string, fileIndex: number) => {
    if (failed || finished) return
    failed = true; pending.clear()
    try { await opts?.onFail?.({ fileIndex, fileCount: files.length, bytesSent, seconds: Math.round((Date.now() - t0) / 1000), reason }) } catch { /* reporting must never mask the failure */ }
  }
  return new ReadableStream<Uint8Array>({
    start(controller) {
      zip = new Zip((err, chunk, final) => {
        if (err) { void fail(`Archive error: ${err.message}`, next); controller.error(err); return }
        bytesSent += chunk.length
        controller.enqueue(chunk)
        if (final) controller.close()
      })
    },
    async pull(controller) {
      if (failed) return
      readAhead()
      if (next < files.length) {
        const idx = next++
        const file = files[idx]
        const bytes = await pending.get(idx)
        pending.delete(idx)
        readAhead()
        if (!bytes) { await fail(`Could not read ${file.name}`, idx); controller.error(new Error(`Could not read ${file.name}`)); return }
        const entry = new ZipPassThrough(file.name)   // JPG/PDF/PNG are already compressed
        zip.add(entry)
        entry.push(bytes, true)
      } else if (!finished) {
        finished = true
        await onComplete()
        zip.end()
      }
    },
    cancel() { void fail('The connection was closed before the download finished (the receiver went away or the network dropped)', next) },
  })
}
