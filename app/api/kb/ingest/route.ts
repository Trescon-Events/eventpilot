import { NextRequest, NextResponse } from 'next/server'
import { readFileSync } from 'fs'
import { join } from 'path'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { randomUUID } from 'crypto'
import { suggestDocType, KB_TYPE_META, KbDocType } from '@/app/lib/kb/classify'
import { extractKbText } from '@/app/lib/kb/extract'
import { putObject, KB_R2_PREFIX } from '@/app/lib/kb/storage'
import { saveDraftDocument } from '@/app/lib/kb/save-draft'
import { supabaseAdmin } from '@/app/lib/supabase'
import { detectGaps, Gap } from '@/app/lib/kb/gaps'
import { buildEffectiveProcessorGuide } from '@/app/lib/kb/update-processor'
import { analyseGeneralDocument } from '@/app/lib/kb/analyse-general'

export const maxDuration = 120

/*
  POST /api/kb/ingest
  Body: multipart/form-data { file, uploaded_by?, doc_type_override? }

  Single entry point for every KB upload. The uploader first picks an intent
  (summarise into the KB vs. upload as-is) in the client UI, which resolves to
  doc_type_override:
  - One of the 4 structured KbDocTypes → classify → extract → process (Gemini,
    guided by the matching knowledge-engine/processors/*.md file) → store
    original in R2 → insert a 'pending' document row, plus self-learning gap
    detection. Admin reviews/publishes via PATCH /api/documents/review.
  - 'general' (upload-as-is intent) → classify-only (layer/department/
    min_level/pilot_use, not a content rewrite) → store the raw extracted
    text verbatim → insert a 'pending' document row, same as the structured
    branch — the admin still reviews and explicitly publishes via PATCH
    /api/documents/review, just without gap detection (there's no schema to
    detect gaps against). This replaces the retired /api/documents/upload,
    which used to publish this branch immediately with no review step.

  BACKGROUND-JOB-BACKED (2026-08-24, same fix as
  app/api/kb/intel/run/route.ts's kb_intel_runs and
  app/api/events/stakeholders/speakers/[id]/clean-photo/generate's
  speaker_photo_clean_jobs). This used to run the whole extract → Gemini
  summary → gap-detection chain (or extract → analyseGeneralDocument for the
  general branch) inline and await it before responding — fine in local
  dev, but production sits behind a Cloudflare Worker proxy in front of
  Railway that kills any single proxied request around ~100s, and this
  route's own `maxDuration = 120` above is a "we know this runs long" signal
  that predates this fix (that Next.js config does nothing against
  Cloudflare's independent timeout). Only the fast, no-external-call parts
  (form parsing, size validation, file→buffer) stay inline; everything that
  touches Gemini, R2, or the DB now runs inside runIngestJob, fired off
  without awaiting it, writing its outcome to a kb_ingest_jobs row. The
  upload UI polls GET .../kb/ingest/job/[jobId] (see that route) until the
  job leaves 'processing', then applies the exact same result shape this
  route used to return inline.
*/
export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null)
  if (!form) return NextResponse.json({ error: 'file is required' }, { status: 400 })
  const file          = form.get('file') as File | null
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

  const buffer = Buffer.from(await file.arrayBuffer())

  const overrideRaw = form.get('doc_type_override') as string | null
  const resolvedType: KbDocType | 'general' =
    overrideRaw && overrideRaw in KB_TYPE_META ? (overrideRaw as KbDocType)
    : overrideRaw === 'general' ? 'general'
    : suggestDocType(file.name)

  const { data: job, error: jobErr } = await supabaseAdmin
    .from('kb_ingest_jobs')
    .insert({ status: 'processing' })
    .select('id')
    .single()
  if (jobErr || !job) return NextResponse.json({ error: 'Could not start the ingest job' }, { status: 500 })

  // Fire and forget — see this file's top doc comment for why this is safe
  // here (persistent Railway process, not serverless).
  runIngestJob(job.id, form, file, buffer, resolvedType, uploaded_by)
    .catch(async e => {
      console.error(`[kb ingest job ${job.id}] uncaught error:`, e)
      await supabaseAdmin.from('kb_ingest_jobs').update({
        status: 'error',
        completed_at: new Date().toISOString(),
        error_message: (e instanceof Error ? e.message : String(e)).slice(0, 2000),
      }).eq('id', job.id)
    })

  return NextResponse.json({ job_id: job.id })
}

// The actual ingest pipeline, run detached from the request/response cycle
// (see this file's top doc comment). Writes its outcome to the
// kb_ingest_jobs row the caller already created.
async function runIngestJob(
  jobId: string,
  form: FormData,
  file: File,
  buffer: Buffer,
  resolvedType: KbDocType | 'general',
  uploaded_by: string | null,
) {
  const markDone = async (result: unknown) => {
    await supabaseAdmin.from('kb_ingest_jobs').update({
      status: 'done', completed_at: new Date().toISOString(), result,
    }).eq('id', jobId)
  }
  const markError = async (message: string) => {
    await supabaseAdmin.from('kb_ingest_jobs').update({
      status: 'error', completed_at: new Date().toISOString(), error_message: message,
    }).eq('id', jobId)
  }

  let extractedText: string
  try {
    extractedText = await extractKbText(buffer, file.name)
  } catch (e) {
    await markError(e instanceof Error ? e.message : 'Could not extract text from this file.')
    return
  }
  if (!extractedText) {
    await markError('Could not extract any content from this file.')
    return
  }

  if (resolvedType === 'general') {
    try {
      const result = await runGeneralIngest(form, file, buffer, extractedText, uploaded_by)
      await markDone(result)
    } catch (e) {
      console.error('kb ingest (general) error:', e)
      await markError('Something went wrong while processing this document. Please try again.')
    }
    return
  }

  try {
    const docType = resolvedType
    const meta    = KB_TYPE_META[docType]

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

    await markDone({
      success: true,
      detected_type: docType,
      document: doc,
      summary,
      gaps,
      gap_session_id: gapSessionId,
    })
  } catch (e) {
    console.error('kb ingest error:', e instanceof Error ? e.message : e)
    await markError('Something went wrong while processing this document. Please try again.')
  }
}

/*
  General-document branch ("upload as-is" intent) — classify-only, no content
  rewrite, saved as a pending draft awaiting admin publish (same review gate
  as the structured branch). Ported from the retired
  /api/documents/upload/route.ts, folded into the single ingest entry point
  — that route used to publish this branch immediately; this one no longer
  does. Extra form fields carry what that route used to collect directly
  (title, type incl. custom/"other", visibility, event link, category,
  external source link, BD workspace link, versioning).
*/
async function runGeneralIngest(
  form: FormData,
  file: File,
  buffer: Buffer,
  extractedText: string,
  uploaded_by: string | null
) {
  const title          = (form.get('title') as string | null)?.trim() || file.name
  const type            = (form.get('type') as string | null) || 'other'
  const visibility      = (form.get('visibility') as string | null) || 'all'
  const event_id        = (form.get('event_id') as string | null) || undefined
  const doc_category    = (form.get('doc_category') as string | null) || 'uncategorised'
  const sourceUrlInput  = (form.get('source_url') as string | null)?.trim() || null
  const workspace_id    = (form.get('workspace_id') as string | null) || undefined
  const supersedes_id   = (form.get('supersedes_id') as string | null) || undefined
  const version_note    = (form.get('version_note') as string | null)?.trim() || undefined

  let uploader = { name: 'Unknown', department: null as string | null, role: null as string | null, job_level: null as string | null }
  if (uploaded_by) {
    const { data: staffData } = await supabaseAdmin
      .from('staff_members')
      .select('name, department, role, job_level')
      .eq('id', uploaded_by)
      .single()
    if (staffData) uploader = staffData
  }

  const analysis = await analyseGeneralDocument(title, extractedText, uploader, type !== 'other' ? type : undefined)
  const flagged  = analysis.confidence < 75

  // Store the original in R2 unless the uploader pasted their own external link
  let sourceUrl = sourceUrlInput
  if (!sourceUrl) {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const r2Key    = `kb/${randomUUID()}/${safeName}`
    await putObject(r2Key, buffer, file.type || 'application/octet-stream')
    sourceUrl = `${KB_R2_PREFIX}${r2Key}`
  }

  const doc = await saveDraftDocument({
    title,
    type,
    content: extractedText,
    layer: analysis.layer,
    department: analysis.department,
    min_level: analysis.min_level,
    pilot_use: analysis.pilot_use,
    doc_category,
    source_url: sourceUrl,
    submitted_by: uploaded_by,
    ai_reasoning: analysis.ai_reasoning,
    confidence: analysis.confidence,
    visibility,
    event_id,
    workspace_id,
    supersedes_id,
    version_note,
    flagged,
  })

  return {
    success: true,
    detected_type: 'general',
    document: doc,
    analysis: { ...analysis, flagged },
    gaps: [],
    gap_session_id: null,
  }
}
