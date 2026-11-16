import { GoogleGenerativeAI } from '@google/generative-ai'
import { GEMINI_PRO_MODEL } from '@/app/lib/ai/models'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getCopyItem, referenceForTools } from '@/app/lib/content/copy-library'
import { resolveEffectiveRules } from '@/app/lib/content/resolve-validation-rules'
import { validateText, type ValidationFinding } from '@/app/lib/content/validate'
import { logJob, type Job } from '@/app/lib/session-videos/jobs'
import { buildDescription, checkChapters, cleanTags, eventFigureHits, titleProblems, transcriptForPrompt, unresolvedPlaceholders, type Chapter, type Segment, type VoiceRow } from '@/app/lib/session-videos/logic'
import { sessionSpeakers } from '@/app/lib/session-videos/speakers'
import { shortNameHits } from '@/app/lib/content/copy-event-name'

/* Text pack (spec 7.5): titles, description, chapters and tags for one session video, after the producer has named the voices.
   Grounded ONLY in: the transcript (with the producer's names), the agenda session and its speakers (names, titles and companies from the RECORDS), the live reference documents (facts and table sections left
   out) and the style notes. The Speakers block, chapters list and footer are assembled in code, not written by the model. The event's approved youtube_footer is appended when there is one.
   No event-level figures (Madhu, 16 Nov 2026): the prompt says so, any that slip in are regenerated once, then shown as a warning. Nothing here depends on public figures. Everything is checked against the
   event's effective rules before the producer sees it. */

export const TEXT_MODEL = GEMINI_PRO_MODEL

type Pack = { titles: string[]; opening: string; summary: string[]; chapters: Chapter[]; tags: string[] }

function readPack(raw: string): Pack {
  const m = raw.match(/\{[\s\S]*\}/); if (!m) throw new Error('not JSON')
  const j = JSON.parse(m[0]) as Record<string, unknown>
  const strs = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').map(x => x.trim()).filter(Boolean) : [])
  const chapters = (Array.isArray(j.chapters) ? j.chapters : []).flatMap((c: Record<string, unknown>) => (typeof c?.title === 'string' && (typeof c.start === 'number' || typeof c.start_s === 'number') ? [{ start_s: Number(c.start ?? c.start_s), title: String(c.title) }] : []))
  if (!strs(j.titles).length || typeof j.opening !== 'string' || !j.opening.trim()) throw new Error('missing titles or opening')
  return { titles: strs(j.titles), opening: String(j.opening).trim(), summary: strs(j.summary), chapters, tags: cleanTags(j.tags) }
}

export type PackInput = {
  eventName: string; dates: string | null; venue: string | null; sessionTitle: string; contentType: string | null
  speakers: Array<{ id: string; name: string; title: string | null; company: string | null; moderator: boolean }>
  docBlock: string; noteBlock: string; rules: Parameters<typeof validateText>[1]
  segments: Segment[]; voices: VoiceRow[]; durationS: number; footer: { text: string; item_id: string; version: number } | null
}
export type PackResult = { pack: Pack; chapters: Chapter[]; description: string; findings: { titles: ValidationFinding[][]; description: ValidationFinding[] }; figures: string[]; problems: string[]; chapterProblems: string[]; footer: 'ok' | 'missing'; placeholders: string[] }

/** The model part: build the prompt, generate, check (titles, chapters, event name, event figures, effective rules), regenerate ONCE with the problems named, assemble the description. No database. */
export async function generatePack(input: PackInput, log: (m: string) => unknown = () => undefined): Promise<PackResult> {
  const key = process.env.GEMINI_API_KEY; if (!key) throw new Error('GEMINI_API_KEY is not set.')
  const { eventName, speakers } = input
  const names = new Map(speakers.map(s => [s.id, s.name]))
  const transcript = transcriptForPrompt(input.segments, input.voices, names)
  const speakerList = speakers.map(s => `- ${s.name}${s.moderator ? ' (Moderator)' : ''}${s.title ? `, ${s.title}` : ''}${s.company ? `, ${s.company}` : ''}`).join('\n') || '(none recorded)'
  const speakerLines = speakers.map(s => ({ name: s.name, title: s.title, company: s.company, moderator: s.moderator }))
  const footerText = input.footer?.text?.trim() ? input.footer.text : null
  const base = `You write the YouTube text for ONE recorded conference session, for Trescon, an event organiser.

EVENT: ${eventName}${input.dates ? ` | ${input.dates}` : ''}${input.venue ? ` | ${input.venue}` : ''}
SESSION TITLE (agenda): ${input.sessionTitle}${input.contentType ? ` (${input.contentType})` : ''}
SPEAKERS (from the records: the only names, titles and companies you may use):
${speakerList}

REFERENCE DOCUMENTS (voice, positioning and rules; context only):
${input.docBlock || '(none)'}
${input.noteBlock}

TRANSCRIPT (with speaker names; [m:ss] timestamps):
${transcript}

Return JSON only:
{"titles":[5 strings],"opening":"...","summary":["paragraph","paragraph"],"chapters":[{"start":0,"title":"..."}],"tags":[10 to 15 strings]}
RULES
- titles: exactly 5 options, each under 70 characters, the session topic first, then the event name or a speaker where it fits. Accurate to what was said: no clickbait that misrepresents the content.
- opening: the first line of the description, about 150 characters: what the session is about, its main keywords and the event name.
- summary: 2 or 3 short paragraphs on what was discussed, from the transcript only. Do not list the speakers (that block is added separately) and do not repeat the chapters.
- chapters: "start" is whole seconds from the transcript timestamps. The first is 0. At least 3, each at least 10 seconds after the previous, placed at real topic shifts. Short, specific titles.
- tags: 10 to 15 search tags about the topic.
- Name the event exactly as "${eventName}" every time you name it; never shorten it or drop the year.
- Names, titles and companies come ONLY from the SPEAKERS list. Never take them from the transcript. Use no honorific the list does not carry.
- NO EVENT FIGURES: write no statistic about the event: no footfall, attendee, speaker, session, country, partner or exhibitor counts, no MoUs, deals, money or media reach. Describe the session, its speakers and the event without numbers about the event. (Numbers the speakers themselves discussed about their topic are fine.)
- Do not use em dashes. Plain, specific language; no filler such as "excited to announce".`

  let feedback = '', pack: Pack | null = null, problems: string[] = [], figures: string[] = [], chapters: Chapter[] = [], chapterProblems: string[] = []
  let findings: PackResult['findings'] = { titles: [], description: [] }
  const model = new GoogleGenerativeAI(key).getGenerativeModel({ model: TEXT_MODEL, generationConfig: { maxOutputTokens: 8192, temperature: 0.4, responseMimeType: 'application/json' } })
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await model.generateContent(base + (feedback ? `\n\nFIX THESE PROBLEMS FROM YOUR LAST ATTEMPT\n${feedback}` : ''))
    try { pack = readPack(r.response.text()) } catch (e) { feedback = `Your last answer was not usable (${e instanceof Error ? e.message : 'bad JSON'}). Return only the JSON object.`; pack = null; continue }
    const cc = checkChapters(pack.chapters, input.durationS); chapters = cc.chapters; chapterProblems = cc.problems
    problems = [...titleProblems(pack.titles), ...cc.problems.filter(p => p.startsWith('Fewer') || p === 'No chapters.'), ...(shortNameHits(pack.opening + ' ' + pack.summary.join(' '), eventName) ? [`The event is named without its year: write "${eventName}" every time.`] : [])]
    figures = eventFigureHits([...pack.titles, pack.opening, ...pack.summary, ...pack.tags].join('\n'))
    const desc = buildDescription({ opening: pack.opening, summary: pack.summary, speakers: speakerLines, chapters, footer: footerText })
    findings = { titles: pack.titles.map(x => validateText(x, input.rules)), description: validateText(desc, input.rules) }
    const ruleErrs = [...findings.titles.flat(), ...findings.description].filter(f => f.severity === 'error')
    const lines = [...problems, ...(figures.length ? [`It states event figures (${figures.join('; ')}). Remove every number about the event.`] : []), ...ruleErrs.slice(0, 6).map(f => `It breaks a rule: ${f.message} Found: "${f.match}".${f.suggested_fix ? ` Use: ${f.suggested_fix}.` : ''}`)]
    await log(`Attempt ${attempt + 1}: ${lines.length ? `${lines.length} problem(s)` : 'clean'}`)
    if (!lines.length) break
    feedback = lines.join('\n')
  }
  if (!pack) throw new Error('The model did not return usable text twice.')
  const description = buildDescription({ opening: pack.opening, summary: pack.summary, speakers: speakerLines, chapters, footer: footerText })
  return { pack, chapters, description, findings, figures, problems, chapterProblems, footer: footerText ? 'ok' : 'missing', placeholders: unresolvedPlaceholders(description) }
}

export async function runTextPack(job: Job): Promise<void> {
  const { data: v } = await supabaseAdmin.from('session_videos').select('*').eq('id', job.session_video_id).single()
  if (!v) throw new Error('Video not found.')
  if (!v.agenda_session_id) throw new Error('Pick the agenda session first: the title and speakers come from it.')
  const { data: t } = await supabaseAdmin.from('session_video_transcripts').select('*').eq('session_video_id', v.id).single()
  if (!t) throw new Error('There is no transcript yet.')
  await supabaseAdmin.from('session_videos').update({ status: 'text_pending', error: null, updated_at: new Date().toISOString() }).eq('id', v.id)
  const eventId = v.event_id as string
  const [{ data: ses }, speakers, ref, rules, { data: ev }, footer] = await Promise.all([
    supabaseAdmin.from('event_agenda_sessions').select('title, content_type').eq('id', v.agenda_session_id).single(),
    sessionSpeakers(eventId, v.agenda_session_id as string), referenceForTools({ kind: 'event', id: eventId }), resolveEffectiveRules(eventId, 'long_form').catch(() => []),
    supabaseAdmin.from('events').select('name, public_name, public_dates_display, public_venue_display').eq('id', eventId).single(), getCopyItem(eventId, 'youtube_footer'),
  ])
  const segments = t.segments as Segment[]
  const r = await generatePack({
    eventName: (ev?.public_name as string | null) || (ev?.name as string | null) || '', dates: (ev?.public_dates_display as string | null) ?? null, venue: (ev?.public_venue_display as string | null) ?? null,
    sessionTitle: String(ses?.title ?? ''), contentType: (ses?.content_type as string | null) ?? null, speakers, docBlock: ref.docBlock, noteBlock: ref.noteBlock, rules,
    segments, voices: t.voices as VoiceRow[], durationS: (v.duration_s as number | null) ?? (segments.at(-1)?.end ?? 0), footer: footer?.text?.trim() ? footer : null,
  }, m => logJob(job.id, m))
  await supabaseAdmin.from('session_video_text').upsert({
    session_video_id: v.id, titles: r.pack.titles, selected_title: r.pack.titles[0], description_working: r.description, description_approved: null, chapters: r.chapters, tags: r.pack.tags,
    findings: { titles: r.findings.titles, description: r.findings.description, event_figures: r.figures, chapters: r.chapterProblems, problems: r.problems, footer: r.footer, placeholders: r.placeholders },
    footer_item_id: footer?.item_id ?? null, footer_version: footer?.version ?? null, model: TEXT_MODEL, approved_by: null, approved_at: null, updated_at: new Date().toISOString(),
  }, { onConflict: 'session_video_id' })
  await supabaseAdmin.from('session_videos').update({ status: 'ready', updated_at: new Date().toISOString() }).eq('id', v.id)
}
