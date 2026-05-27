import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { GoogleAIFileManager } from '@google/generative-ai/server'
import { writeFile, unlink } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'

export const maxDuration = 120

/*
  POST /api/documents/process
  Body: { storage_path, title, type, visibility, event_id?, uploaded_by? }
  Downloads the file from Supabase Storage (doc-uploads bucket),
  extracts text via Gemini, classifies, saves to DB, deletes from storage.
  Used for large files (> 4 MB) where direct API upload would hit Vercel limits.
*/

const DEPARTMENTS = ['all', 'marketing', 'finance', 'sales', 'operations', 'events', 'hr', 'it']
const LAYERS      = ['knowledge_base', 'general', 'specific']
const LEVELS      = ['all', 'team_lead', 'management']

function sanitise(val: string, allowed: string[], fallback: string): string {
  return allowed.includes(val?.toLowerCase()) ? val.toLowerCase() : fallback
}

async function extractText(buffer: Buffer, fileName: string): Promise<string> {
  if (!fileName.toLowerCase().endsWith('.pdf')) {
    return buffer.toString('utf-8').trim()
  }

  const genAI  = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
  const model  = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })
  const prompt = 'Extract all text content from this PDF document. Return only the raw text exactly as it appears — preserve headings, paragraphs, lists, and section structure. Do not summarise, do not add commentary, do not add formatting characters. Return the full text.'

  // Always use Gemini File API for files coming through this route (they're large)
  const fileManager = new GoogleAIFileManager(process.env.GEMINI_API_KEY!)
  const tmpPath = join(tmpdir(), `doc_${Date.now()}_${Math.random().toString(36).slice(2)}.pdf`)

  try {
    await writeFile(tmpPath, buffer)
    const uploadRes = await fileManager.uploadFile(tmpPath, { mimeType: 'application/pdf', displayName: fileName })
    const fileUri   = uploadRes.file.uri

    const result = await model.generateContent([
      { fileData: { mimeType: 'application/pdf', fileUri } },
      { text: prompt },
    ])

    await fileManager.deleteFile(uploadRes.file.name).catch(() => {})
    return result.response.text().trim()
  } finally {
    await unlink(tmpPath).catch(() => {})
  }
}

async function analyseWithGemini(
  title: string, extractedText: string,
  uploader: { name: string; department: string | null; role: string | null; job_level: string | null },
  customType?: string
) {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })

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

layer: "knowledge_base" | "general" | "specific"
department: "all" | "marketing" | "finance" | "sales" | "operations" | "events" | "hr" | "it"
min_level: "all" | "team_lead" | "management"
tresci_use: true if Tresci should search this document
confidence: 0-100
suggested_type: snake_case

Return ONLY valid JSON, no markdown:
{"layer":"...","department":"...","min_level":"...","tresci_use":true,"ai_reasoning":"...","confidence":85,"suggested_type":"..."}`

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
    return { layer: 'general', department: 'all', min_level: 'all', tresci_use: false, ai_reasoning: 'AI analysis failed.', confidence: 40, suggested_type: customType ?? 'other' }
  }
}

export async function POST(req: NextRequest) {
  try {
    const { storage_path, title, type, uploaded_by } = await req.json()
    if (!storage_path || !title || !type) {
      return NextResponse.json({ error: 'storage_path, title and type are required' }, { status: 400 })
    }

    // Download from Supabase Storage
    const { data: fileData, error: dlErr } = await supabaseAdmin.storage
      .from('doc-uploads')
      .download(storage_path)

    if (dlErr || !fileData) {
      return NextResponse.json({ error: 'Could not retrieve uploaded file. Please try again.' }, { status: 500 })
    }

    const buffer   = Buffer.from(await fileData.arrayBuffer())
    const fileName = storage_path.split('_').slice(2).join('_') // recover original name

    // Delete from storage immediately after download
    supabaseAdmin.storage.from('doc-uploads').remove([storage_path]).catch(() => {})

    const extractedText = await extractText(buffer, fileName)
    if (!extractedText) {
      return NextResponse.json({ error: 'Could not extract text from this file.' }, { status: 422 })
    }

    const wordCount = extractedText.split(/\s+/).filter(Boolean).length
    const finalType = type === 'other' ? 'other' : type

    let uploader = { name: 'Unknown', department: null as string | null, role: null as string | null, job_level: null as string | null }
    if (uploaded_by) {
      const { data } = await supabaseAdmin.from('staff_members').select('name, department, role, job_level').eq('id', uploaded_by).single()
      if (data) uploader = data
    }

    const analysis = await analyseWithGemini(title, extractedText, uploader, finalType !== 'other' ? finalType : undefined)
    const flagged  = analysis.confidence < 75

    const { data, error } = await supabaseAdmin
      .from('documents')
      .insert({
        title, type: finalType,
        extracted_text: extractedText,
        word_count: wordCount,
        visibility: 'all',
        uploaded_by: uploaded_by || null,
        submitted_by: uploaded_by || null,
        status: 'live',
        layer: analysis.layer,
        department: analysis.department,
        min_level: analysis.min_level,
        tresci_use: analysis.tresci_use,
        ai_reasoning: analysis.ai_reasoning,
        confidence: analysis.confidence,
        flagged,
      })
      .select('id, title, word_count, layer, department, min_level, tresci_use, ai_reasoning, confidence, flagged')
      .single()

    if (error) throw error

    return NextResponse.json({
      success: true, document: data,
      analysis: { ...analysis, flagged, suggested_type: analysis.suggested_type },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('document process error:', msg)
    return NextResponse.json({ error: 'Something went wrong while processing your document. Please try again.' }, { status: 500 })
  }
}
