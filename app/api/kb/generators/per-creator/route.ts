import { NextRequest, NextResponse } from 'next/server'
import { readFileSync } from 'fs'
import { join } from 'path'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { getKBContext } from '@/app/lib/kb-context'

export const maxDuration = 90

/*
  POST /api/kb/generators/per-creator
  Body: structured event data (see fields below).

  Loads knowledge-engine/generators/per-creator.md as the generation guide,
  plus the Trescon credentials master and a pool of past event reports (so
  Gemini can pick the matching series for structural/language reference), and
  asks Gemini to draft the post-event report following the guide's exact
  16-section structure.
*/
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    const {
      event_name, edition_year, date_start, date_end, venue, city, country,
      organiser, patronage,
      total_attendees, countries_count, speakers_count, exhibitors_count, sessions_count, mous,
      themes, sponsors_by_tier, media_stats, startup_competition,
      testimonials, key_outcomes,
      attendee_profile, session_titles, speaker_list, social_stats, yoy_comparison,
    } = body ?? {}

    if (!event_name?.trim() || !total_attendees?.trim()) {
      return NextResponse.json({ error: 'event_name and total_attendees are required' }, { status: 400 })
    }

    const guide = readFileSync(join(process.cwd(), 'knowledge-engine', 'generators', 'per-creator.md'), 'utf-8')

    const [credentials, pastReports] = await Promise.all([
      getKBContext({ types: ['corporate_profile'], pilotUseOnly: false, limit: 2, maxCharsPerDoc: 6000 }),
      getKBContext({ types: ['event_report'],       pilotUseOnly: false, limit: 10, maxCharsPerDoc: 3000 }),
    ])

    const inputBlock = [
      `Event name: ${event_name}`,
      edition_year ? `Edition year: ${edition_year}` : '',
      (date_start || date_end) ? `Dates: ${[date_start, date_end].filter(Boolean).join(' to ')}` : '',
      venue   ? `Venue: ${venue}` : '',
      (city || country) ? `Location: ${[city, country].filter(Boolean).join(', ')}` : '',
      organiser ? `Organiser: ${organiser}` : '',
      patronage ? `Patronage: ${patronage}` : '',
      `Total attendees: ${total_attendees}`,
      countries_count  ? `Countries represented: ${countries_count}` : '',
      speakers_count   ? `Speakers: ${speakers_count}` : '',
      exhibitors_count ? `Exhibitors / sponsors: ${exhibitors_count}` : '',
      sessions_count   ? `Sessions / stages: ${sessions_count}` : '',
      mous             ? `MoUs / partnerships signed: ${mous}` : '',
      themes           ? `Main themes:\n${themes}` : '',
      sponsors_by_tier ? `Sponsors (by tier):\n${sponsors_by_tier}` : '',
      media_stats      ? `Media and PR stats:\n${media_stats}` : '',
      startup_competition ? `Startup competition outcomes:\n${startup_competition}` : '',
      testimonials     ? `Testimonials (attributed quotes):\n${testimonials}` : '',
      key_outcomes     ? `Key outcomes achieved:\n${key_outcomes}` : '',
      attendee_profile ? `Attendee profile breakdown:\n${attendee_profile}` : '',
      session_titles   ? `Session titles:\n${session_titles}` : '',
      speaker_list     ? `Speaker list:\n${speaker_list}` : '',
      social_stats     ? `Social media stats:\n${social_stats}` : '',
      yoy_comparison   ? `Year-on-year comparison:\n${yoy_comparison}` : '',
    ].filter(Boolean).join('\n')

    const prompt = `You are the Post-Event Report Creator tool for Trescon's EventPilot platform.

GENERATOR GUIDE (follow these instructions exactly — section order, tone, language patterns, what NOT to generate):
${guide}

TRESCON CREDENTIALS MASTER (use for the "About Trescon" section):
${credentials.text || 'Not available.'}

PAST EVENT REPORTS (structural and language reference — pick the matching series if one exists, otherwise use as general reference only):
${pastReports.text || 'Not available.'}

EVENT DATA PROVIDED BY THE PROJECT TEAM:
${inputBlock}

Generate the full post-event report now, following the exact 16-section structure and tone rules in the generator guide above.
Output as clean markdown with headings. Do not fabricate quotes, attendee names, financial figures, or comparative claims against competitors — use only what is given in the event data above. If a section has no data provided, write "Not available for this edition" rather than inventing content.`

    const genAI  = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
    const model  = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })
    const result = await model.generateContent(prompt)
    const report = result.response.text().trim().replace(/^```(?:markdown)?\n([\s\S]*?)\n```$/, '$1').trim()

    const title = `${event_name}${edition_year ? ` ${edition_year}` : ''}${city ? ` ${city}` : ''} — Post-Event Report`

    return NextResponse.json({ success: true, report, title })
  } catch (e) {
    console.error('per-creator error:', e)
    return NextResponse.json({ error: 'Something went wrong generating the report. Please try again.' }, { status: 500 })
  }
}
