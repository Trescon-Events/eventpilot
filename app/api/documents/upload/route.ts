import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import * as pdfParse from 'pdf-parse'

/*
  POST /api/documents/upload
  Accepts multipart form data:
    - file: PDF or text file
    - title: string
    - type: policy | event_brief | staff_doc | onboarding | other
    - visibility: all | event_only
    - event_id: uuid (optional, required if event_only)
    - uploaded_by: staff uuid

  Extracts text, saves to documents table. File is never stored anywhere.
*/
export async function POST(req: NextRequest) {
  try {
    const form        = await req.formData()
    const file        = form.get('file') as File | null
    const title       = form.get('title') as string
    const type        = form.get('type') as string
    const visibility  = (form.get('visibility') as string) || 'all'
    const event_id    = form.get('event_id') as string | null
    const uploaded_by = form.get('uploaded_by') as string | null

    if (!file || !title || !type) {
      return NextResponse.json({ error: 'file, title and type are required' }, { status: 400 })
    }

    const bytes  = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    let extractedText = ''

    if (file.name.toLowerCase().endsWith('.pdf')) {
      const parsed  = await (pdfParse as unknown as (b: Buffer) => Promise<{text:string}>)(buffer)
      extractedText = parsed.text?.trim() ?? ''
    } else {
      // Plain text / markdown
      extractedText = buffer.toString('utf-8').trim()
    }

    if (!extractedText) {
      return NextResponse.json({ error: 'Could not extract text from this file. Make sure it is a text-based PDF, not a scanned image.' }, { status: 422 })
    }

    const wordCount = extractedText.split(/\s+/).filter(Boolean).length

    const { data, error } = await supabaseAdmin
      .from('documents')
      .insert({
        title,
        type,
        extracted_text: extractedText,
        word_count:     wordCount,
        visibility,
        event_id:       event_id  || null,
        uploaded_by:    uploaded_by || null,
      })
      .select('id, title, word_count')
      .single()

    if (error) throw error

    return NextResponse.json({ success: true, document: data })
  } catch (e) {
    console.error('document upload error:', e)
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }
}
