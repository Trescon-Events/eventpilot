import { NextRequest, NextResponse } from 'next/server'
import { readFileSync } from 'fs'
import { join } from 'path'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { getKBContext } from '@/app/lib/kb-context'

export const maxDuration = 90

/*
  POST /api/kb/generators/proposal-creator
  Body: { client_name, client_type?, country?, city?, event_concept_name,
          event_concept_description?, trescon_role?, target_scale?, themes?,
          government_agenda?, competing_events?, client_objectives?, existing_relationship? }

  Loads knowledge-engine/generators/proposal-creator.md as the generation guide,
  plus KB reference material (credentials master, commercial/structure patterns,
  historical proposals, past event reports), and asks Gemini to draft the
  proposal following the guide's exact 16-section structure.
*/
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    const {
      client_name, client_type, country, city,
      event_concept_name, event_concept_description,
      trescon_role, target_scale, themes,
      government_agenda, competing_events, client_objectives, existing_relationship,
    } = body ?? {}

    if (!client_name?.trim() || !event_concept_name?.trim()) {
      return NextResponse.json({ error: 'client_name and event_concept_name are required' }, { status: 400 })
    }

    const guide = readFileSync(join(process.cwd(), 'knowledge-engine', 'generators', 'proposal-creator.md'), 'utf-8')

    const [credentials, reference, proposals, eventReports] = await Promise.all([
      getKBContext({ types: ['corporate_profile'], pilotUseOnly: false, limit: 2, maxCharsPerDoc: 6000 }),
      getKBContext({ types: ['other'],             pilotUseOnly: false, limit: 5, maxCharsPerDoc: 6000 }),
      getKBContext({ types: ['proposal'],          pilotUseOnly: false, limit: 10, maxCharsPerDoc: 3000 }),
      getKBContext({ types: ['event_report'],      pilotUseOnly: false, limit: 8, maxCharsPerDoc: 2000 }),
    ])

    const inputBlock = [
      `Client / prospect: ${client_name}`,
      client_type       ? `Client type: ${client_type}` : '',
      (country || city) ? `Location: ${[city, country].filter(Boolean).join(', ')}` : '',
      `Proposed event concept: ${event_concept_name}`,
      event_concept_description ? `Concept description: ${event_concept_description}` : '',
      trescon_role  ? `Trescon's proposed role: ${trescon_role}` : '',
      target_scale  ? `Target scale: ${target_scale}` : '',
      themes        ? `Key themes / sectors: ${themes}` : '',
      government_agenda    ? `Government / national agenda alignment: ${government_agenda}` : '',
      competing_events     ? `Competing events in the market: ${competing_events}` : '',
      client_objectives    ? `Client's stated objectives: ${client_objectives}` : '',
      existing_relationship ? `Existing relationship / context: ${existing_relationship}` : '',
    ].filter(Boolean).join('\n')

    const prompt = `You are the Proposal Creator tool for Trescon's EventPilot platform.

GENERATOR GUIDE (follow these instructions exactly — section order, tone, language patterns, what NOT to generate):
${guide}

TRESCON CREDENTIALS MASTER (use for the "Why Trescon" and portfolio sections):
${credentials.text || 'Not available.'}

COMMERCIAL MODEL & PROPOSAL STRUCTURE REFERENCE:
${reference.text || 'Not available.'}

HISTORICAL PROPOSALS (structural and language reference only — do not copy verbatim):
${proposals.text || 'Not available.'}

PAST EVENT REPORTS (for audience/scale benchmarks and theme language):
${eventReports.text || 'Not available.'}

STAFF INPUT FOR THIS NEW PROPOSAL:
${inputBlock}

Generate the full proposal now, following the exact 16-section structure and tone rules in the generator guide above.
Output as clean markdown with headings. Do not fabricate statistics — use only real numbers found in the reference material above. Do not invent dates, venues, or prices not given in the staff input.`

    const genAI  = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
    const model  = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })
    const result = await model.generateContent(prompt)
    const proposal = result.response.text().trim().replace(/^```(?:markdown)?\n([\s\S]*?)\n```$/, '$1').trim()

    return NextResponse.json({ success: true, proposal, title: `${client_name} — ${event_concept_name} Proposal` })
  } catch (e) {
    console.error('proposal-creator error:', e)
    return NextResponse.json({ error: 'Something went wrong generating the proposal. Please try again.' }, { status: 500 })
  }
}
