import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { putObject } from '@/app/lib/docuhub/storage'
import { getSessionStaffId } from '@/app/lib/access/session'
import { hasModuleAccess } from '@/app/lib/access/module-access'

export const maxDuration = 60

/*
  POST /api/docuhub/upload
  Body: multipart/form-data { file }

  Uploads a file to the private DocuHub R2 bucket and returns its object key
  plus basic metadata. Used by both the single-document upload form and,
  per-row, by the bulk-upload grid. Does not create a docuhub_documents row —
  that happens via POST /api/docuhub/documents once the uploader fills in
  the rest of the form.
*/
export async function POST(req: NextRequest) {
  const staffId = getSessionStaffId(req)
  if (!(await hasModuleAccess(staffId, 'dochub', 'user'))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  try {
    const form = await req.formData()
    const file = form.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'file is required' }, { status: 400 })

    const MAX_BYTES = 100 * 1024 * 1024
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: `File is too large (${(file.size / 1024 / 1024).toFixed(0)} MB). Maximum is 100 MB.` }, { status: 413 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const key = `docuhub/${randomUUID()}/${safeName}`

    await putObject(key, buffer, file.type || 'application/octet-stream')

    return NextResponse.json({
      success: true,
      object_key: key,
      original_filename: file.name,
      file_size_bytes: file.size,
      mime_type: file.type || 'application/octet-stream',
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('docuhub upload error:', msg)
    return NextResponse.json({ error: 'Could not upload the file. Please try again.' }, { status: 500 })
  }
}
