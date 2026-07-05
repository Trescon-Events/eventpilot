import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { GoogleAIFileManager } from '@google/generative-ai/server'
import { writeFile, unlink } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'

export const maxDuration = 120

/*
  POST /api/documents/upload
  For: super_admin, office_head, dept_head — direct upload, no approval needed.

  Flow:
  1. Read file bytes
  2. For PDFs > 5 MB: write to /tmp, upload via Gemini File API (supports up to 2 GB), extract text, clean up
     For PDFs <= 5 MB: pass as inline base64 (faster)
     For TXT/MD: plain UTF-8 decode
  3. Pull uploader profile
  4. Gemini classifies the extracted content
  5. Save extracted text to DB — original file is never stored
  6. Return saved document with AI analysis
*/

const DEPARTMENTS = ['all', 'marketing', 'finance', 'sales', 'operations', 'events', 'hr', 'it']
const LAYERS      = ['knowledge_base', 'general', 'specific']
const LEVELS      = ['all', 'team_lead', 'management']

const MAX_FILE_BYTES = 50 * 1024 * 1024 // 50 MB hard limit
const INLINE_THRESHOLD = 5 * 1024 * 1024 // Use File API above 5 MB

function sanitise(val: string, allowed: string[], fallback: string): string {
  return allowed.includes(val?.toLowerCase()) ? val.toLowerCase() : fallback
}

// ── Step 1: Extract text ──────────────────────────────────────────────────────
async function extractText(buffer: Buffer, fileName: string): Promise<string> {
  if (!fileName.toLowerCase().endsWith('.pdf')) {
    return buffer.toString('utf-8').trim()
  }

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })
  const extractPrompt = 'Extract all text content from this PDF document. Return only the raw text exactly as it appears — preserve headings, paragraphs, lists, and section structure. Do not summarise, do not add commentary, do not add formatting characters. Return the full text.'

  // Large PDFs: upload via File API then reference by URI
  if (buffer.byteLength > INLINE_THRESHOLD) {
    const fileManager = new GoogleAIFileManager(process.env.GEMINI_API_KEY!)
    const tmpPath = join(tmpdir(), `doc_${Date.now()}_${Math.random().toString(36).slice(2)}.pdf`)

    try {
      await writeFile(tmpPath, buffer)
      const uploadRes = await fileManager.uploadFile(tmpPath, {
        mimeType: 'application/pdf',
        displayName: fileName,
      })
      const fileUri = uploadRes.file.uri

      const result = await model.generateContent([
        { fileData: { mimeType: 'application/pdf', fileUri } },
        { text: extractPrompt },
      ])

      // Clean up uploaded file from Gemini
      await fileManager.deleteFile(uploadRes.file.name).catch(() => {/* ignore */})

      return result.response.text().trim()
    } finally {
      await unlink(tmpPath).catch(() => {/* ignore */})
    }
  }

  // Small PDFs: inline base64 (faster, no temp file needed)
  const result = await model.generateContent([
    {
      inlineData: {
        mimeType: 'application/pdf',
        data: buffer.toString('base64'),
      },
    },
    { text: extractPrompt },
  ])

  return result.response.text().trim()
}

// ── Step 2: Classify ──────────────────────────────────────────────────────────
async function analyseWithGemini(
  title: string,
  extractedText: string,
  uploader: { name: string; department: string | null; role: string | null; job_level: string | null },
  customType?: string
): Promise<{
  layer: string; department: string; min_level: string;
  pilot_use: boolean; ai_reasoning: string; confidence: number; suggested_type: string
}> {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })

  const prompt = `You are the document intelligence system for Event Pilot, Trescon's internal platform.

A document has been uploaded. Analyse it and return a JSON object with your decisions.

UPLOADER PROFILE:
Name: ${uploader.name}
Department: ${uploader.department ?? 'Unknown'}
Role: ${uploader.role ?? 'Unknown'}
Job Level: ${uploader.job_level ?? 'staff'}

DOCUMENT TITLE: ${title}
${customType ? `DOCUMENT TYPE (user specified): ${customType}` : ''}

DOCUMENT CONTENT (first 3000 chars):
${extractedText.slice(0, 3000)}

DECISION RULES:

layer options:
- "knowledge_base": Foundational company knowledge. Policies, past event summaries, production briefs, SOPs, brand guidelines, onboarding material. Pilot ALWAYS searches these for everyone.
- "general": Relevant to all staff but not core knowledge base. Announcements, culture docs.
- "specific": Active working documents. Campaign plans, budget reviews, event briefs, sales playbooks. Access controlled by department and level.

department options (who should see this):
- "all": All departments
- "marketing", "finance", "sales", "operations", "events", "hr", "it": Specific department only

min_level options (minimum job level to access):
- "all": Every staff member
- "team_lead": Team leads and above
- "management": Office heads and above only

pilot_use: true if Pilot should search this document when answering staff questions, false otherwise.
- Always true for knowledge_base
- True for general if it contains useful reference information
- For specific: true only if it helps staff in the relevant department understand their work

confidence: 0-100. How confident are you in these decisions?
- 90-100: Very clear from content and uploader profile
- 75-89: Reasonably clear
- 50-74: Some ambiguity — will be flagged for admin review
- Below 50: Very unclear

suggested_type: If the user did not specify a type, suggest one. Use existing types (policy, event_brief, staff_doc, onboarding) or suggest a new descriptive type in snake_case.

Return ONLY valid JSON, no markdown:
{
  "layer": "knowledge_base|general|specific",
  "department": "all|marketing|finance|sales|operations|events|hr|it",
  "min_level": "all|team_lead|management",
  "pilot_use": true|false,
  "ai_reasoning": "2-3 sentence explanation of your decisions",
  "confidence": 0-100,
  "suggested_type": "snake_case_type_name"
}`

  try {
    const result = await model.generateContent(prompt)
    const text   = result.response.text().trim()
    const json   = text.startsWith('{') ? text : text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)
    const parsed = JSON.parse(json)

    return {
      layer:          sanitise(parsed.layer,       LAYERS,       'general'),
      department:     sanitise(parsed.department,  DEPARTMENTS,  'all'),
      min_level:      sanitise(parsed.min_level,   LEVELS,       'all'),
      pilot_use:     Boolean(parsed.pilot_use),
      ai_reasoning:   String(parsed.ai_reasoning ?? '').slice(0, 1000),
      confidence:     Math.min(100, Math.max(0, Number(parsed.confidence ?? 70))),
      suggested_type: String(parsed.suggested_type ?? 'other').slice(0, 60),
    }
  } catch {
    return {
      layer: 'general', department: 'all', min_level: 'all',
      pilot_use: false, ai_reasoning: 'AI analysis failed — defaulted to general visibility.',
      confidence: 40, suggested_type: customType ?? 'other',
    }
  }
}

// ── Route ─────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const form          = await req.formData()
    const file          = form.get('file') as File | null
    const title         = form.get('title') as string
    const type          = form.get('type') as string
    const uploaded_by   = form.get('uploaded_by') as string | null
    const source_url    = (form.get('source_url') as string | null)?.trim() || null
    const workspace_id  = (form.get('workspace_id') as string | null) || null
    const supersedes_id = (form.get('supersedes_id') as string | null) || null
    const version_note  = (form.get('version_note') as string | null)?.trim() || null

    if (!file || !title || !type) {
      return NextResponse.json({ error: 'file, title and type are required' }, { status: 400 })
    }

    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json({
        error: `File is too large (${(file.size / 1024 / 1024).toFixed(0)} MB). Maximum allowed is 50 MB. Compress your PDF first using smallpdf.com or Adobe Acrobat.`,
      }, { status: 413 })
    }

    // Read file bytes
    const buffer = Buffer.from(await file.arrayBuffer())

    // Extract text
    const extractedText = await extractText(buffer, file.name)

    if (!extractedText) {
      return NextResponse.json({
        error: 'Could not extract any text from this file. Check that the file has readable content and try again.',
      }, { status: 422 })
    }

    const wordCount = extractedText.split(/\s+/).filter(Boolean).length
    const finalType = type === 'other' ? 'other' : type

    // Pull uploader profile
    let uploader = { name: 'Unknown', department: null as string | null, role: null as string | null, job_level: null as string | null }
    if (uploaded_by) {
      const { data: staffData } = await supabaseAdmin
        .from('staff_members')
        .select('name, department, role, job_level')
        .eq('id', uploaded_by)
        .single()
      if (staffData) uploader = staffData
    }

    // Classify
    const analysis = await analyseWithGemini(title, extractedText, uploader, finalType !== 'other' ? finalType : undefined)
    const flagged   = analysis.confidence < 75

    // If this upload supersedes an existing document, chain it into the same version group
    let documentGroupId: string | null = null
    let version = 1
    if (supersedes_id) {
      const { data: prior } = await supabaseAdmin
        .from('documents')
        .select('id, document_group_id, version')
        .eq('id', supersedes_id)
        .single()
      if (prior) {
        documentGroupId = prior.document_group_id ?? prior.id
        version = (prior.version ?? 1) + 1
      }
    }

    // Save extracted text to DB — original file is gone, never persisted
    const { data, error } = await supabaseAdmin
      .from('documents')
      .insert({
        title,
        type:           finalType,
        extracted_text: extractedText,
        word_count:     wordCount,
        visibility:     'all',
        uploaded_by:    uploaded_by || null,
        submitted_by:   uploaded_by || null,
        status:         'live',
        layer:          analysis.layer,
        department:     analysis.department,
        min_level:      analysis.min_level,
        pilot_use:     analysis.pilot_use,
        ai_reasoning:   analysis.ai_reasoning,
        confidence:     analysis.confidence,
        flagged,
        source_url:     source_url,
        workspace_id:   workspace_id,
        document_group_id: documentGroupId,
        version,
        version_note:   supersedes_id ? version_note : null,
      })
      .select('id, title, word_count, layer, department, min_level, pilot_use, ai_reasoning, confidence, flagged, version, document_group_id')
      .single()

    if (error) throw error

    // First version of a group: document_group_id has no DB default, backfill it to its own id.
    // Then, if this upload supersedes a prior version, mark that prior row superseded.
    if (!documentGroupId) {
      await supabaseAdmin.from('documents').update({ document_group_id: data.id }).eq('id', data.id)
    }
    if (supersedes_id) {
      await supabaseAdmin.from('documents').update({ superseded_by: data.id }).eq('id', supersedes_id)
    }

    return NextResponse.json({
      success:  true,
      document: data,
      analysis: {
        layer:          analysis.layer,
        department:     analysis.department,
        min_level:      analysis.min_level,
        pilot_use:     analysis.pilot_use,
        ai_reasoning:   analysis.ai_reasoning,
        confidence:     analysis.confidence,
        flagged,
        suggested_type: analysis.suggested_type,
      },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('document upload error:', msg)

    if (msg.includes('503') || msg.toLowerCase().includes('overloaded') || msg.toLowerCase().includes('service unavailable')) {
      return NextResponse.json({
        error: 'Pilot is under high load right now. Please wait a moment and try again — your document has not been saved.',
      }, { status: 503 })
    }

    return NextResponse.json({ error: 'Something went wrong while processing your document. Please try again.' }, { status: 500 })
  }
}
