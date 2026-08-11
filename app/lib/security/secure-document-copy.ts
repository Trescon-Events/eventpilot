import { supabaseAdmin } from '@/app/lib/supabase'
import { getGoogleAccessToken } from './google-drive-auth'
import { getMicrosoftDelegatedToken } from './graph-delegated'

/* Copies one secure_document_transfers row's source file (a HubSpot-hosted
   URL) into the destination Google Drive / Microsoft OneDrive folder
   configured for that transfer's event, using the CONFIGURING PRODUCER's
   own delegated OAuth token — never a shared app-level credential.

   Called fire-and-forget (not awaited) from the HubSpot webhook handler
   (app/api/public/hubspot/submissions/route.ts) right after inserting the
   transfer rows, and again by the retry sweep
   (app/api/cron/secure-documents-retry/route.ts) for anything left
   'pending'/'failed'. This app runs on a persistent Railway Node process
   (not serverless), so a fire-and-forget call is free to keep running
   after the caller's response is sent — same pattern already proven by
   app/api/kb/intel/run/route.ts. */

async function markFailed(transferId: string, attempts: number, error: string) {
  await supabaseAdmin
    .from('secure_document_transfers')
    .update({ status: 'failed', last_error: error, attempts: attempts + 1, updated_at: new Date().toISOString() })
    .eq('id', transferId)
}

async function uploadToGoogleDrive(buffer: Buffer, filename: string, mimeType: string, folderId: string, accessToken: string): Promise<{ ok: boolean; fileId?: string; error?: string }> {
  const boundary = `epboundary${Date.now()}`
  const metadata = JSON.stringify({ name: filename, parents: [folderId] })
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`),
    buffer,
    Buffer.from(`\r\n--${boundary}--`),
  ])

  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  })
  if (!res.ok) return { ok: false, error: `Google Drive upload failed (${res.status}): ${await res.text()}` }
  const data = await res.json() as { id?: string }
  return { ok: true, fileId: data.id }
}

async function uploadToOneDrive(buffer: Buffer, filename: string, mimeType: string, driveId: string, folderId: string, accessToken: string): Promise<{ ok: boolean; fileId?: string; error?: string }> {
  // Simple upload endpoint — fine here since passport/ID scans are always
  // well under Graph's 4MB simple-upload ceiling; no resumable session needed.
  const url = `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${folderId}:/${encodeURIComponent(filename)}:/content`
  const res = await fetch(url, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': mimeType },
    body: new Uint8Array(buffer),
  })
  if (!res.ok) return { ok: false, error: `OneDrive upload failed (${res.status}): ${await res.text()}` }
  const data = await res.json() as { id?: string }
  return { ok: true, fileId: data.id }
}

export async function copySecureDocument(transferId: string): Promise<void> {
  const { data: transfer } = await supabaseAdmin
    .from('secure_document_transfers')
    .select('*')
    .eq('id', transferId)
    .single()
  if (!transfer || transfer.status === 'copied') return

  const { data: folder } = await supabaseAdmin
    .from('event_secure_folders')
    .select('*')
    .eq('event_id', transfer.event_id)
    .maybeSingle()

  if (!folder) {
    // No destination configured yet for this event — not an error, just
    // not actionable. Leave 'pending'; the retry sweep re-checks later
    // once a producer configures a folder.
    return
  }

  const accessToken = folder.provider === 'google'
    ? await getGoogleAccessToken(folder.configured_by)
    : await getMicrosoftDelegatedToken(folder.configured_by)

  if (!accessToken) {
    await markFailed(transferId, transfer.attempts ?? 0, `The producer who configured this event's secure folder (provider: ${folder.provider}) no longer has a valid connection — ask them to reconnect in Connected Accounts.`)
    return
  }

  let buffer: Buffer
  let mimeType: string
  try {
    const fileRes = await fetch(transfer.source_url)
    if (!fileRes.ok) throw new Error(`Could not fetch source file (${fileRes.status})`)
    buffer = Buffer.from(await fileRes.arrayBuffer())
    mimeType = fileRes.headers.get('content-type') || 'application/octet-stream'
  } catch (e) {
    await markFailed(transferId, transfer.attempts ?? 0, `Fetching source file failed: ${(e as Error).message}`)
    return
  }

  const filename = transfer.filename || `${transfer.document_role}-${transfer.id}`

  const result = folder.provider === 'google'
    ? await uploadToGoogleDrive(buffer, filename, mimeType, folder.folder_id, accessToken)
    : await uploadToOneDrive(buffer, filename, mimeType, folder.drive_id, folder.folder_id, accessToken)

  if (!result.ok) {
    await markFailed(transferId, transfer.attempts ?? 0, result.error ?? 'Upload failed')
    return
  }

  await supabaseAdmin
    .from('secure_document_transfers')
    .update({ status: 'copied', provider: folder.provider, destination_file_id: result.fileId, updated_at: new Date().toISOString() })
    .eq('id', transferId)
}
