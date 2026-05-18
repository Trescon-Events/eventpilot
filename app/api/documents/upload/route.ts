import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { GoogleGenerativeAI } from '@google/generative-ai'

export const maxDuration = 60

/*
  POST /api/documents/upload
  For: super_admin, office_head, dept_head — direct upload, no approval needed.

  Flow:
  1. Read file bytes
  2. For PDFs: Gemini reads the PDF natively (handles text-based AND scanned/image PDFs)
     For TXT/MD: plain UTF-8 decode
  3. Pull uploader profile
  4. Gemini classifies the extracted content
  5. Save extracted text to DB — original file is never stored, destroyed after read
  6. Return saved document with AI analysis
*/

const DEPARTMENTS = ['all', 'marketing', 'finance', 'sales', 'operations', 'events', 'hr', 'it']
const LAYERS      = ['knowledge_base', 'general', 'specific']
const LEVELS      = ['all', 'team_lead', 'management']

function sanitise(val: string, allowed: string[], fallback: string): string {
  return allowed.includes(val?.toLowerCase()) ? val.toLowerCase() : fallback
}

// ── Step 1: Extract text ──────────────────────────────────────────────────────
// PDFs are passed to Gemini as inline base64 — Gemini reads text AND scanned pages.
// Text files are decoded directly. PDF file is never written to disk or stored.
async function extractText(buffer: Buffer, fileName: string): Promise<string> {
  if (!fileName.toLowerCase().endsWith('.pdf')) {
    return buffer.toString('utf-8').trim()
  }

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })

  const result = await model.generateContent([
    {
      inlineData: {
        mimeType: 'application/pdf',
        data: buffer.toString('base64'),
      },
    },
    {
      text: 'Extract all text content from this PDF document. Return only the raw text exactly as it appears — preserve headings, paragraphs, lists, and section structure. Do not summarise, do not add commentary, do not add formatting characters. Return the full text.',
    },
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
  tresci_use: boolean; ai_reasoning: string; confidence: number; suggested_type: string
}> {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })

  const prompt = `You are the document intelligence system for Trescademy, Trescon Global's internal platform.

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
- "knowledge_base": Foundational company knowledge. Policies, past event summaries, production briefs, SOPs, brand guidelines, onboarding material. Tresci ALWAYS searches these for everyone.
- "general": Relevant to all staff but not core knowledge base. Announcements, culture docs.
- "specific": Active working documents. Campaign plans, budget reviews, event briefs, sales playbooks. Access controlled by department and level.

department options (who should see this):
- "all": All departments
- "marketing", "finance", "sales", "operations", "events", "hr", "it": Specific department only

min_level options (minimum job level to access):
- "all": Every staff member
- "team_lead": Team leads and above
- "management": Office heads and above only

tresci_use: true if Tresci should search this document when answering staff questions, false otherwise.
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
  "tresci_use": true|false,
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
      tresci_use:     Boolean(parsed.tresci_use),
      ai_reasoning:   String(parsed.ai_reasoning ?? '').slice(0, 1000),
      confidence:     Math.min(100, Math.max(0, Number(parsed.confidence ?? 70))),
      suggested_type: String(parsed.suggested_type ?? 'other').slice(0, 60),
    }
  } catch {
    return {
      layer: 'general', department: 'all', min_level: 'all',
      tresci_use: false, ai_reasoning: 'AI analysis failed — defaulted to general visibility.',
      confidence: 40, suggested_type: customType ?? 'other',
    }
  }
}

// ── Route ─────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const form        = await req.formData()
    const file        = form.get('file') as File | null
    const title       = form.get('title') as string
    const type        = form.get('type') as string
    const uploaded_by = form.get('uploaded_by') as string | null

    if (!file || !title || !type) {
      return NextResponse.json({ error: 'file, title and type are required' }, { status: 400 })
    }

    // Read file bytes — this is the only time the file exists in memory
    const buffer = Buffer.from(await file.arrayBuffer())

    // Extract text — PDF is read by Gemini vision, never stored
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
        tresci_use:     analysis.tresci_use,
        ai_reasoning:   analysis.ai_reasoning,
        confidence:     analysis.confidence,
        flagged,
      })
      .select('id, title, word_count, layer, department, min_level, tresci_use, ai_reasoning, confidence, flagged')
      .single()

    if (error) throw error

    return NextResponse.json({
      success:  true,
      document: data,
      analysis: {
        layer:          analysis.layer,
        department:     analysis.department,
        min_level:      analysis.min_level,
        tresci_use:     analysis.tresci_use,
        ai_reasoning:   analysis.ai_reasoning,
        confidence:     analysis.confidence,
        flagged,
        suggested_type: analysis.suggested_type,
      },
    })
  } catch (e) {
    console.error('document upload error:', e)
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }
}
