import { NextRequest, NextResponse } from 'next/server'
import { readFileSync } from 'fs'
import { join } from 'path'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { randomUUID } from 'crypto'
import { classifyFilename, KB_TYPE_META } from '@/app/lib/kb/classify'
import { extractKbText } from '@/app/lib/kb/extract'
import { putObject, KB_R2_PREFIX } from '@/app/lib/kb/storage'
import { saveDraftDocument } from '@/app/lib/kb/save-draft'
import { supabaseAdmin } from '@/app/lib/supabase'
import { detectGaps, Gap } from '@/app/lib/kb/gaps'
import { buildEffectiveProcessorGuide } from '@/app/lib/kb/update-processor'

export const maxDuration = 120

/*
  POST /api/kb/ingest
  Body: multipart/form-data { file, uploaded_by? }

  Classify → extract → process (Gemini, guided by the matching
  knowledge-engine/processors/*.md file) → store original in R2 → insert a
  'pending' document row (not yet visible to staff or Pilot). Returns the
  generated summary so the admin can review it before publishing — publishing
  and rejecting both reuse the existing PATCH /api/documents/review endpoint.
*/
export async function POST(req: NextRequest) {
  try {
    const form        = await req.formData()
    const file         = form.get('file') as File | null
    const uploadedByRaw = form.get('uploaded_by') as string | null
    // submitted_by is a uuid column (references staff_members) — the synthetic
    // 'super-admin' session has no staff row, so map it to null like every
    // other admin route does (e.g. app/api/kb/intel/items/[id]/approve/route.ts)
    const uploaded_by = uploadedByRaw === 'super-admin' ? null : uploadedByRaw

    if (!file) return NextResponse.json({ error: 'file is required' }, { status: 400 })

    const MAX_BYTES = 100 * 1024 * 1024
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: `File is too large (${(file.size / 1024 / 1024).toFixed(0)} MB). Maximum is 100 MB.` }, { status: 413 })
    }

    const buffer  = Buffer.from(await file.arrayBuffer())
    const docType = classifyFilename(file.name)
    const meta    = KB_TYPE_META[docType]

    let extractedText: string
    try {
      extractedText = await extractKbText(buffer, file.name)
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not extract text from this file.' }, { status: 422 })
    }
    if (!extractedText) {
      return NextResponse.json({ error: 'Could not extract any content from this file.' }, { status: 422 })
    }

    // Load the matching processor guide, then merge in any self-learned fields
    // that are registered in kb_field_registry but not yet reflected in the
    // file on disk (a redeploy can wipe an in-place file edit — the registry
    // is the durable source of truth, see app/lib/kb/update-processor.ts).
    const processorPath = join(process.cwd(), 'knowledge-engine', 'processors', meta.processor)
    const processorGuide = readFileSync(processorPath, 'utf-8')

    const { data: registryFields } = await supabaseAdmin
      .from('kb_field_registry')
      .select('field_name, field_description, field_category, example_value, is_required')
      .eq('processor_type', docType)
      .eq('is_active', true)

    const effectiveGuide = buildEffectiveProcessorGuide(docType, processorGuide, registryFields ?? [])

    // Generate the structured .md summary
    const genAI  = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
    const model  = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })
    const prompt = `You are processing a document for Trescon's EventPilot Knowledge Base.

PROCESSOR GUIDE (follow these instructions exactly):
${effectiveGuide}

DOCUMENT FILENAME: ${file.name}
DOCUMENT TYPE: ${docType}

EXTRACTED CONTENT:
${extractedText.slice(0, 100000)}

Generate a structured .md summary file following the exact schema and instructions in the processor guide above.
Output ONLY the markdown content — no preamble, no explanation, no code fences.
Start directly with the YAML front matter (---).`

    const result  = await model.generateContent(prompt)
    // Gemini sometimes wraps the output in a ```markdown fence despite being told not to — strip it if present
    const summary = result.response.text().trim().replace(/^```(?:markdown)?\n([\s\S]*?)\n```$/, '$1').trim()

    // Store the original file in R2 (private — never public)
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const r2Key    = `kb/${randomUUID()}/${safeName}`
    await putObject(r2Key, buffer, file.type || 'application/octet-stream')
    const sourceUrl = `${KB_R2_PREFIX}${r2Key}`

    // Title from front matter or first heading
    const titleMatch = summary.match(/^title:\s*(.+)$/m) ?? summary.match(/^#\s+(.+)$/m)
    const title = titleMatch?.[1]?.trim().replace(/^["']|["']$/g, '') ?? file.name

    const doc = await saveDraftDocument({
      title,
      type: meta.type,
      content: summary,
      layer: meta.layer,
      department: meta.department,
      min_level: meta.min_level,
      pilot_use: meta.pilot_use,
      doc_category: meta.docCategory,
      source_url: sourceUrl,
      submitted_by: uploaded_by,
      ai_reasoning: `Ingested via classify → process pipeline. Detected type: ${docType.replace(/_/g, ' ')}. Awaiting admin publish.`,
      confidence: 85,
    })

    // Self-learning gap detection — a second, best-effort Gemini call that
    // never blocks or fails the ingest above. A failure here only logs a
    // warning; the uploader still sees their document processed normally.
    let gaps: Gap[] = []
    let gapSessionId: string | null = null
    try {
      gaps = await detectGaps(model, effectiveGuide, extractedText, file.name, docType)
      if (gaps.length > 0 && doc?.id) {
        const { data: gapSession } = await supabaseAdmin
          .from('kb_gap_sessions')
          .insert({
            document_id: doc.id,
            processor_type: docType,
            gaps: gaps.map((g) => ({ ...g, status: 'unresolved' })),
            resolved: false,
          })
          .select('id')
          .single()
        gapSessionId = gapSession?.id ?? null
      }
    } catch (e) {
      console.warn('kb gap detection failed:', e)
    }

    return NextResponse.json({
      success: true,
      detected_type: docType,
      document: doc,
      summary,
      gaps,
      gap_session_id: gapSessionId,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('kb ingest error:', msg)
    return NextResponse.json({ error: 'Something went wrong while processing this document. Please try again.' }, { status: 500 })
  }
}
