import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { GoogleGenerativeAI } from '@google/generative-ai'

/*
  GET  /api/events/checklist?event_id=uuid  — fetch checklist for event
  POST /api/events/checklist                — generate checklist via Gemini
  PATCH /api/events/checklist?id=uuid       — update a checklist item
  DELETE /api/events/checklist?id=uuid      — delete a checklist item
*/

async function generateChecklist(event: {
  name: string; type: string; city: string | null;
  event_date: string | null; description: string | null;
  client_name: string | null; expected_attendance: number | null
}): Promise<{ department: string; title: string; sort_order: number }[]> {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })

  const weeksOut = event.event_date
    ? Math.round((new Date(event.event_date).getTime() - Date.now()) / (7 * 24 * 60 * 60 * 1000))
    : null

  const prompt = `You are the event planning system for Trescon, a B2B events company that runs AI summits, conferences, and forums across the Middle East and Asia.

Generate a comprehensive event checklist for the following event:

Event Name: ${event.name}
Type: ${event.type}
City: ${event.city ?? 'TBD'}
Date: ${event.event_date ?? 'TBD'}${weeksOut ? ` (${weeksOut} weeks away)` : ''}
Client/Partner: ${event.client_name ?? 'Trescon'}
Description: ${event.description ?? 'Not provided'}
Expected Attendance: ${event.expected_attendance ?? 'TBD'}

Generate a realistic, practical checklist that covers ALL departments involved in running a Trescon event. Each item must be a specific, actionable deliverable — not a vague task.

Departments to cover: Operations, Marketing, Sales, Finance, Content, HR (if needed)

Return ONLY a valid JSON array, no markdown:
[
  {
    "department": "Operations",
    "title": "Venue contract signed",
    "sort_order": 1
  },
  ...
]

Rules:
- 4 to 8 items per department
- Items should be in logical sequence (sort_order within each department)
- Titles should be specific deliverables, not vague tasks
- Match the scale and type of event
- For a conference/summit: include venue, AV, catering, run-of-show, security
- For an awards: include ceremony flow, judging process, trophies, gala dinner
- Always include: sponsor management (Sales), marketing campaigns, speaker/delegate management (Content), budget (Finance)
- Do not include items that don't apply to this event type`

  try {
    const result = await model.generateContent(prompt)
    const text   = result.response.text().trim()
    const json   = text.startsWith('[') ? text : text.slice(text.indexOf('['), text.lastIndexOf(']') + 1)
    const parsed = JSON.parse(json)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    // Fallback checklist if Gemini fails
    return [
      { department: 'Operations', title: 'Venue confirmed and contract signed', sort_order: 1 },
      { department: 'Operations', title: 'AV vendor briefed and confirmed', sort_order: 2 },
      { department: 'Operations', title: 'Catering vendor confirmed', sort_order: 3 },
      { department: 'Operations', title: 'Run-of-show drafted', sort_order: 4 },
      { department: 'Operations', title: 'On-ground team briefed', sort_order: 5 },
      { department: 'Marketing', title: 'Event page live', sort_order: 1 },
      { department: 'Marketing', title: 'Registration campaign launched', sort_order: 2 },
      { department: 'Marketing', title: 'Sponsor briefing packs sent', sort_order: 3 },
      { department: 'Marketing', title: 'Social media campaign live', sort_order: 4 },
      { department: 'Sales', title: 'Sponsor pipeline confirmed', sort_order: 1 },
      { department: 'Sales', title: 'Lead sponsor contract signed', sort_order: 2 },
      { department: 'Sales', title: 'All sponsor contracts signed', sort_order: 3 },
      { department: 'Finance', title: 'Budget approved', sort_order: 1 },
      { department: 'Finance', title: 'Sponsor invoices raised', sort_order: 2 },
      { department: 'Finance', title: 'Vendor payments scheduled', sort_order: 3 },
      { department: 'Content', title: 'Speaker confirmations done', sort_order: 1 },
      { department: 'Content', title: 'Agenda finalised', sort_order: 2 },
      { department: 'Content', title: 'Speaker briefing packs sent', sort_order: 3 },
    ]
  }
}

export async function GET(req: NextRequest) {
  const eventId = req.nextUrl.searchParams.get('event_id')
  if (!eventId) return NextResponse.json({ error: 'event_id required' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('event_checklist')
    .select(`
      id, event_id, department, title, status, due_date,
      completed_at, notes, sort_order, document_id,
      owner:owner_id (id, name, department)
    `)
    .eq('event_id', eventId)
    .order('department')
    .order('sort_order')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)

  // Single item add
  if (body?.title && body?.event_id && !body?.generate) {
    const { data, error } = await supabaseAdmin
      .from('event_checklist')
      .insert({
        event_id:   body.event_id,
        department: body.department || 'Operations',
        title:      body.title,
        sort_order: body.sort_order ?? 99,
      })
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  }

  // Generate full checklist via Gemini
  if (!body?.event_id) return NextResponse.json({ error: 'event_id required' }, { status: 400 })

  // Fetch event details
  const { data: event, error: evErr } = await supabaseAdmin
    .from('events')
    .select('name, type, city, event_date, description, client_name, expected_attendance')
    .eq('id', body.event_id)
    .single()

  if (evErr || !event) return NextResponse.json({ error: 'Event not found' }, { status: 404 })

  // Check if checklist already exists
  const { count } = await supabaseAdmin
    .from('event_checklist')
    .select('*', { count: 'exact', head: true })
    .eq('event_id', body.event_id)

  if ((count ?? 0) > 0 && !body.regenerate) {
    return NextResponse.json({ error: 'Checklist already exists. Pass regenerate:true to replace.' }, { status: 409 })
  }

  // Delete existing if regenerating
  if (body.regenerate) {
    await supabaseAdmin.from('event_checklist').delete().eq('event_id', body.event_id)
  }

  const items = await generateChecklist(event)

  // Insert all items
  const toInsert = items.map(item => ({
    event_id:   body.event_id,
    department: item.department,
    title:      item.title,
    sort_order: item.sort_order,
    status:     'not_started',
  }))

  const { data: inserted, error: insErr } = await supabaseAdmin
    .from('event_checklist')
    .insert(toInsert)
    .select()

  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })

  return NextResponse.json({ success: true, count: inserted?.length ?? 0, items: inserted })
}

export async function PATCH(req: NextRequest) {
  const id   = req.nextUrl.searchParams.get('id')
  const body = await req.json().catch(() => null)
  if (!id || !body) return NextResponse.json({ error: 'id and body required' }, { status: 400 })

  // Auto-set completed_at when marking done
  if (body.status === 'done' && !body.completed_at) {
    body.completed_at = new Date().toISOString()
  }
  if (body.status !== 'done') {
    body.completed_at = null
  }

  const { data, error } = await supabaseAdmin
    .from('event_checklist')
    .update(body)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  await supabaseAdmin.from('event_checklist').delete().eq('id', id)
  return NextResponse.json({ success: true })
}
