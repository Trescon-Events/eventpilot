import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { GoogleGenerativeAI } from '@google/generative-ai'

export const maxDuration = 60

/*
  POST /api/documents/submit
  For: staff, team_lead — creates a draft pending manager approval.

  Flow:
  1. Extract text
  2. Pull submitter profile
  3. Gemini analyses content + profile
  4. Saved as status='pending_manager' (team_lead) or 'pending_manager' (staff)
  5. Notification sent to manager
*/

const DEPARTMENTS = ['all', 'marketing', 'finance', 'sales', 'operations', 'events', 'hr', 'it']
const LAYERS      = ['knowledge_base', 'general', 'specific']
const LEVELS      = ['all', 'team_lead', 'management']

function sanitise(val: string, allowed: string[], fallback: string): string {
  return allowed.includes(val?.toLowerCase()) ? val.toLowerCase() : fallback
}

async function analyseWithGemini(
  title: string,
  extractedText: string,
  uploader: { name: string; department: string | null; role: string | null; job_level: string | null }
): Promise<{
  layer: string; department: string; min_level: string;
  pilot_use: boolean; ai_reasoning: string; confidence: number; suggested_type: string
}> {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })

  const prompt = `You are the document intelligence system for Event Pilot, Trescon's internal platform.

SUBMITTER PROFILE:
Name: ${uploader.name}
Department: ${uploader.department ?? 'Unknown'}
Role: ${uploader.role ?? 'Unknown'}
Job Level: ${uploader.job_level ?? 'staff'}

DOCUMENT TITLE: ${title}

DOCUMENT CONTENT (first 3000 chars):
${extractedText.slice(0, 3000)}

Analyse and return ONLY valid JSON:
{
  "layer": "knowledge_base|general|specific",
  "department": "all|marketing|finance|sales|operations|events|hr|it",
  "min_level": "all|team_lead|management",
  "pilot_use": true|false,
  "ai_reasoning": "2-3 sentence explanation",
  "confidence": 0-100,
  "suggested_type": "snake_case_type"
}`

  try {
    const result = await model.generateContent(prompt)
    const text   = result.response.text().trim()
    const json   = text.startsWith('{') ? text : text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)
    const parsed = JSON.parse(json)

    return {
      layer:          sanitise(parsed.layer,      LAYERS,      'general'),
      department:     sanitise(parsed.department, DEPARTMENTS, 'all'),
      min_level:      sanitise(parsed.min_level,  LEVELS,      'all'),
      pilot_use:     Boolean(parsed.pilot_use),
      ai_reasoning:   String(parsed.ai_reasoning ?? '').slice(0, 1000),
      confidence:     Math.min(100, Math.max(0, Number(parsed.confidence ?? 60))),
      suggested_type: String(parsed.suggested_type ?? 'other').slice(0, 60),
    }
  } catch {
    return {
      layer: 'general', department: 'all', min_level: 'all',
      pilot_use: false, ai_reasoning: 'AI analysis incomplete — manager will review.',
      confidence: 40, suggested_type: 'other',
    }
  }
}

export async function POST(req: NextRequest) {
  try {
    const form         = await req.formData()
    const file         = form.get('file') as File | null
    const title        = form.get('title') as string
    const type         = form.get('type') as string
    const staff_id     = form.get('staff_id') as string
    const submit_note  = (form.get('submit_note') as string) ?? ''

    if (!file || !title || !staff_id) {
      return NextResponse.json({ error: 'file, title and staff_id are required' }, { status: 400 })
    }

    // Extract text — PDF read by Gemini vision (handles text + scanned), file never stored
    const buffer = Buffer.from(await file.arrayBuffer())
    let extractedText = ''

    if (file.name.toLowerCase().endsWith('.pdf')) {
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })
      const result = await model.generateContent([
        { inlineData: { mimeType: 'application/pdf', data: buffer.toString('base64') } },
        { text: 'Extract all text content from this PDF document. Return only the raw text, preserving paragraphs and structure. No commentary.' },
      ])
      extractedText = result.response.text().trim()
    } else {
      extractedText = buffer.toString('utf-8').trim()
    }

    if (!extractedText) {
      return NextResponse.json({
        error: 'Could not extract any text from this file. Check that the file has readable content and try again.',
      }, { status: 422 })
    }

    const wordCount = extractedText.split(/\s+/).filter(Boolean).length

    // Pull submitter profile + manager
    const { data: staffData } = await supabaseAdmin
      .from('staff_members')
      .select('name, department, role, job_level, manager_id')
      .eq('id', staff_id)
      .single()

    if (!staffData) {
      return NextResponse.json({ error: 'Staff record not found.' }, { status: 404 })
    }

    if (!staffData.manager_id) {
      return NextResponse.json({
        error: 'Your manager has not been assigned yet. Contact your admin to submit documents.',
      }, { status: 403 })
    }

    // Gemini analysis
    const analysis = await analyseWithGemini(title, extractedText, staffData)

    // Save as pending
    const { data, error } = await supabaseAdmin
      .from('documents')
      .insert({
        title,
        type:           type || analysis.suggested_type || 'other',
        extracted_text: extractedText,
        word_count:     wordCount,
        visibility:     'all',
        submitted_by:   staff_id,
        status:         'pending_manager',
        layer:          analysis.layer,
        department:     analysis.department,
        min_level:      analysis.min_level,
        pilot_use:     analysis.pilot_use,
        ai_reasoning:   analysis.ai_reasoning,
        confidence:     analysis.confidence,
        flagged:        false,
        review_note:    submit_note,
      })
      .select('id, title, word_count, layer, department, min_level, ai_reasoning, confidence')
      .single()

    if (error) throw error

    // Notify manager
    await supabaseAdmin.from('notifications').insert({
      staff_id:  staffData.manager_id,
      type:      'document_review',
      title:     'Document pending your review',
      body:      `${staffData.name} submitted "${title}" for your review.`,
      course_id: null,
      read:      false,
    })

    return NextResponse.json({ success: true, document: data, analysis })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('document submit error:', msg)

    if (msg.includes('503') || msg.toLowerCase().includes('overloaded') || msg.toLowerCase().includes('service unavailable')) {
      return NextResponse.json({
        error: 'Pilot is under high load right now. Please wait a moment and try again — your document has not been saved.',
      }, { status: 503 })
    }

    return NextResponse.json({ error: 'Something went wrong while processing your document. Please try again.' }, { status: 500 })
  }
}
