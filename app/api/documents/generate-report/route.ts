import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { GoogleGenerativeAI } from '@google/generative-ai'

/*
  GET   /api/documents/generate-report?event_id=uuid  — fetch existing draft/live report for event
  POST  /api/documents/generate-report                 — generate draft report from checklist
  PATCH /api/documents/generate-report?id=uuid        — conclude report (draft → live)
*/

export async function GET(req: NextRequest) {
  const eventId = req.nextUrl.searchParams.get('event_id')
  if (!eventId) return NextResponse.json(null)

  const { data } = await supabaseAdmin
    .from('documents')
    .select('id, title, extracted_text, status, created_at')
    .eq('event_id', eventId)
    .eq('type', 'event_report')
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return NextResponse.json(data ?? null)
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body?.event_id) return NextResponse.json({ error: 'event_id required' }, { status: 400 })

  // Fetch event details
  const { data: event, error: evErr } = await supabaseAdmin
    .from('events')
    .select('name, type, city, event_date, description, client_name, expected_attendance')
    .eq('id', body.event_id)
    .single()

  if (evErr || !event) return NextResponse.json({ error: 'Event not found' }, { status: 404 })

  // Fetch all checklist items with notes and owner
  const { data: items } = await supabaseAdmin
    .from('event_checklist')
    .select(`
      department, title, status, due_date, notes,
      owner:owner_id (name, department)
    `)
    .eq('event_id', body.event_id)
    .order('department')
    .order('sort_order')

  if (!items || items.length === 0) {
    return NextResponse.json({ error: 'No checklist items found. Generate the checklist first.' }, { status: 400 })
  }

  // If a draft already exists, delete it so we start fresh
  await supabaseAdmin
    .from('documents')
    .update({ is_active: false })
    .eq('event_id', body.event_id)
    .eq('type', 'event_report')
    .eq('status', 'draft')

  // Build checklist summary for Gemini
  const byDept: Record<string, typeof items> = {}
  for (const item of items) {
    if (!byDept[item.department]) byDept[item.department] = []
    byDept[item.department].push(item)
  }

  const checklistSummary = Object.entries(byDept).map(([dept, dItems]) => {
    const lines = dItems.map(i => {
      const ownerName = (i.owner as { name?: string } | null)?.name ?? 'Unassigned'
      const statusLabel = i.status.replace('_', ' ')
      const notesLine = i.notes ? `\n      Notes: ${i.notes}` : ''
      const dueLine = i.due_date ? ` | Due: ${i.due_date}` : ''
      return `    - ${i.title} [${statusLabel}] | Owner: ${ownerName}${dueLine}${notesLine}`
    }).join('\n')
    return `${dept}:\n${lines}`
  }).join('\n\n')

  const total   = items.length
  const done    = items.filter(i => i.status === 'done').length
  const inProg  = items.filter(i => i.status === 'in_progress').length
  const notStr  = items.filter(i => i.status === 'not_started').length

  const prompt = `You are the event intelligence system for Trescon. Generate a comprehensive Event Status Report based on the following event details and checklist.

EVENT DETAILS
─────────────
Name: ${event.name}
Type: ${event.type}
City: ${event.city ?? 'TBD'}
Date: ${event.event_date ?? 'TBD'}
Client: ${event.client_name ?? 'Trescon'}
Expected Attendance: ${event.expected_attendance ?? 'TBD'}
Description: ${event.description ?? 'Not provided'}

CHECKLIST STATUS
────────────────
Total Items: ${total}
Completed: ${done} (${Math.round((done / total) * 100)}%)
In Progress: ${inProg}
Not Started: ${notStr}

CHECKLIST DETAILS BY DEPARTMENT
────────────────────────────────
${checklistSummary}

INSTRUCTIONS
────────────
Write a structured Event Status Report that:
1. Opens with an Executive Summary (2–3 sentences: event purpose, current readiness, overall status)
2. Has a Department-by-Department Status section — for each department: what's done, what's in progress, what's at risk, and any notes provided by the team
3. Has a Key Risks & Action Items section — flag anything not started that is high-priority, anything overdue, and items with no owner
4. Closes with a Recommended Next Steps section (top 3–5 specific actions to move the event forward)

Tone: Professional, factual, direct. Written as an internal operational report.
Format: Use clear headings. Use bullet points within sections. Do not use markdown code blocks.
Length: Comprehensive but concise — aim for a thorough report that covers all departments.`

  let reportText = ''

  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })
    const result = await model.generateContent(prompt)
    reportText = result.response.text()
  } catch {
    return NextResponse.json({ error: 'AI service unavailable. Try again.' }, { status: 500 })
  }

  const wordCount = Math.ceil(reportText.split(/\s+/).length)
  const title = `${event.name} — Event Report (Draft)`

  const { data: doc, error: insErr } = await supabaseAdmin
    .from('documents')
    .insert({
      title,
      type:           'event_report',
      layer:          'knowledge_base',
      department:     'all',
      min_level:      'all',
      pilot_use:     false,
      ai_reasoning:   'Generated from event checklist and team inputs via Event Pilot.',
      confidence:     90,
      status:         'draft',
      is_active:      true,
      flagged:        false,
      extracted_text: reportText,
      word_count:     wordCount,
      event_id:       body.event_id,
    })
    .select('id, title, extracted_text, status, created_at')
    .single()

  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })
  return NextResponse.json(doc)
}

export async function PATCH(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  // Conclude: flip to live and enable Pilot search
  const { data, error } = await supabaseAdmin
    .from('documents')
    .update({
      status:     'live',
      pilot_use: true,
      title:      undefined, // preserve existing title
    })
    .eq('id', id)
    .select('id, title, extracted_text, status, created_at')
    .single()

  // Remove "Draft" from title on conclude
  if (data?.title?.includes('(Draft)')) {
    await supabaseAdmin
      .from('documents')
      .update({ title: data.title.replace(' (Draft)', '') })
      .eq('id', id)
    data.title = data.title.replace(' (Draft)', '')
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
