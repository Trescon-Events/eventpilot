import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { putObject, KB_R2_PREFIX } from '@/app/lib/kb/storage'
import { requireApiModuleAccess } from '@/app/lib/registry/api-access'

export const maxDuration = 60

/*
  POST /api/kb/upload-to-s3
  Body: multipart/form-data { file }

  Uploads the original file to the private KB R2 bucket and returns a
  `source_url` value to store on the document row. That value is prefixed
  with "r2:" so the UI knows to fetch it via /api/kb/download (which mints a
  short-lived presigned URL after an access check) rather than linking to it
  directly — the bucket itself is never public.
*/
export async function POST(req: NextRequest) {
  const gate = await requireApiModuleAccess(req, 'kb')
  if (gate.response) return gate.response

  try {
    const form = await req.formData()
    const file = form.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'file is required' }, { status: 400 })

    const MAX_BYTES = 200 * 1024 * 1024
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: `File is too large (${(file.size / 1024 / 1024).toFixed(0)} MB). Maximum is 200 MB.` }, { status: 413 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const key = `kb/${randomUUID()}/${safeName}`

    await putObject(key, buffer, file.type || 'application/octet-stream')

    return NextResponse.json({ success: true, source_url: `${KB_R2_PREFIX}${key}`, filename: file.name })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('kb upload-to-s3 error:', msg)
    return NextResponse.json({ error: 'Could not upload the original file to storage. Please try again.' }, { status: 500 })
  }
}
