import { NextRequest, NextResponse } from 'next/server'
import { readFileSync } from 'fs'
import { join } from 'path'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getKBContext } from '@/app/lib/kb-context'

export const maxDuration = 90

/*
  POST /api/kb/generators/project-brief
  Body: { event_id }

  Loads knowledge-engine/generators/project-brief-creator.md for its
  intelligence-surfacing philosophy (audience shifts, scale trajectory, theme
  gaps, commercial patterns, market context), pulls in the most relevant past
  event report, proposal, and Trescon credentials via getKBContext(), and asks
  Gemini to draft the event_briefs fields — informed by real prior-edition
  data where it exists, not generic boilerplate.
*/
export async function POST(req: NextRequest) {
  try {
    const { event_id } = await req.json().catch(() => ({}))
    if (!event_id) return NextResponse.json({ error: 'event_id required' }, { status: 400 })

    const { data: event, error: eventErr } = await supabaseAdmin
      .from('events')
      .select('name, type, city, client_name, description, event_date')
      .eq('id', event_id)
      .single()

    if (eventErr || !event) return NextResponse.json({ error: 'Event not found' }, { status: 404 })

    const guide = readFileSync(join(process.cwd(), 'knowledge-engine', 'generators', 'project-brief-creator.md'), 'utf-8')

    const [credentials, pastReports, proposals] = await Promise.all([
      getKBContext({ types: ['corporate_profile'], pilotUseOnly: false, limit: 2, maxCharsPerDoc: 5000 }),
      getKBContext({ types: ['event_report'],       pilotUseOnly: false, limit: 10, maxCharsPerDoc: 3000 }),
      getKBContext({ types: ['proposal'],           pilotUseOnly: false, limit: 6, maxCharsPerDoc: 2500 }),
    ])

    const eventBlock = [
      `Event name: ${event.name}`,
      event.type        ? `Type: ${event.type}` : '',
      event.city         ? `City: ${event.city}` : '',
      event.event_date   ? `Date: ${event.event_date}` : '',
      event.client_name  ? `Client: ${event.client_name}` : '',
      event.description  ? `Description: ${event.description}` : '',
    ].filter(Boolean).join('\n')

    const prompt = `You are the Project Brief intelligence assistant for Trescon's EventPilot platform.

GENERATOR PHILOSOPHY (from the internal Project Brief Creator guide — apply its "surface intelligence" approach: reference real prior-edition numbers and trends wherever the KB material below supports it, e.g. "Previous editions: 2023 → 5,868 registrants, 2024 → 9,506 — suggest targeting 18,000" or "Banking represented 23% of attendees last edition — a growth area"):
${guide}

TRESCON CREDENTIALS MASTER:
${credentials.text || 'Not available.'}

PAST EVENT REPORTS (look for one matching this event's series/name — use its real numbers, themes, and audience data if found; otherwise use as general benchmark reference):
${pastReports.text || 'Not available.'}

RELEVANT PROPOSALS (if one exists for this client/event, use its positioning and differentiators):
${proposals.text || 'Not available.'}

THIS EVENT:
${eventBlock}

Generate a marketing/commercial brief for this event as a JSON object with exactly these fields (all strings unless noted as an array; use empty string/array if genuinely nothing applies — never fabricate specifics not supported by the KB material or the event's own description):
{
  "elevator_pitch": string (2 lines max),
  "value_proposition": string,
  "target_audience": string,
  "industry_focus": string[],
  "geography_focus": string[],
  "key_themes": string[] (3-5 items),
  "key_messages": string[],
  "tone_of_voice": string[],
  "tagline": string,
  "hashtags": string[],
  "sponsor_value_prop": string,
  "delegate_profile": string,
  "differentiators": string[],
  "market_positioning": string,
  "competing_events": [{ "name": string, "organizer": string, "notes": string }]
}

Where the past event reports contain real prior-edition numbers for this series, weave that trajectory into value_proposition or market_positioning (e.g. scale growth, sector shifts) — this is what makes the brief "intelligence-led" rather than generic.
Return ONLY the JSON object, no markdown fences, no commentary.`

    const genAI  = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
    const model  = genAI.getGenerativeModel({ model: 'gemini-2.5-flash', generationConfig: { responseMimeType: 'application/json' } })
    const result = await model.generateContent(prompt)
    const brief  = JSON.parse(result.response.text())

    const sources = [...credentials.documents, ...pastReports.documents, ...proposals.documents].map(d => d.title)

    return NextResponse.json({ success: true, brief, sources })
  } catch (e) {
    console.error('project-brief generator error:', e)
    return NextResponse.json({ error: 'Something went wrong generating the brief. Please try again.' }, { status: 500 })
  }
}
