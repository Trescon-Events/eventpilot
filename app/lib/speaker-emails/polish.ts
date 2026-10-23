import { GoogleGenerativeAI } from '@google/generative-ai'
import { GEMINI_FLASH_MODEL } from '@/app/lib/ai/models'
import { COPY_GENERATION_CONFIG, generateCopy } from '@/app/lib/ai/gemini-call'
import { getEventGuidelines, renderGuidelinesMarkdown } from '@/app/lib/content/guidelines-api'
import { checkEmailCompliance, htmlToPlainText } from '@/app/lib/guest-invites/template'
import { PRONOUN_GUIDANCE } from '@/app/lib/events/announcements'
import { cleanBodyHtml, hasContent } from './render'

/* "Polish" (2026-10-23): one click turns a producer's rough draft into a short, courteous, guideline-compliant email body. The greeting and sign-off are added per speaker
   later (render.ts), so the model writes only the body — a courteous opening sentence, the message, a clear closing sentence. Nothing here sends anything. */

let _gemini: GoogleGenerativeAI | null = null
const gemini = () => (_gemini ??= new GoogleGenerativeAI(process.env.GEMINI_API_KEY!))

export type PolishResult = { polished_html: string; changes: string[]; errors: { message: string; match: string }[]; warnings: { message: string; match: string }[] }

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n) + '\n[…]' : s)

export function parsePolishResponse(raw: string): { polished_html: string; changes: string[] } | null {
  const m = raw.match(/\{[\s\S]*\}/)
  if (!m) return null
  try {
    const j = JSON.parse(m[0]) as { polished_html?: unknown; changes?: unknown }
    if (typeof j.polished_html !== 'string' || !j.polished_html.trim()) return null
    const changes = Array.isArray(j.changes) ? j.changes.filter((c): c is string => typeof c === 'string' && !!c.trim()).map(c => c.trim()).slice(0, 8) : []
    return { polished_html: j.polished_html.trim(), changes }
  } catch { return null }
}

export async function polishEmail(args: { eventId: string; eventName: string; bodyHtml: string; pronounStyles: string[] }): Promise<PolishResult | { error: string }> {
  if (!hasContent(args.bodyHtml)) return { error: 'Write something first — Polish tidies what you have written.' }
  const guidelines = await getEventGuidelines(args.eventId).catch(() => null)
  const guideText = guidelines ? clip(renderGuidelinesMarkdown(guidelines, ['style_guide', 'messaging']), 60_000) : ''
  const honorifics = [...new Set(args.pronounStyles)].map(p => PRONOUN_GUIDANCE[p]).filter(Boolean)

  const prompt = `You are the copy editor for Trescon's event producers. A producer has written a rough email to speakers at "${args.eventName}". Rewrite it so it is ready to send.

HOW THE EMAIL IS ASSEMBLED
The system adds the greeting ("Dear <name>,") and the sign-off ("Warm regards, <producer>") itself. You write ONLY the body. Do NOT write a greeting, a sign-off, a signature or a subject line.

WHAT TO DO
- Open with one short, warm, courteous sentence that fits the message (never gushing, never "I hope this email finds you well").
- Say what is needed, clearly and in the fewest words. Keep it professional and to the point — ideally 60 to 150 words. Cut padding, repetition and apologies.
- Make the one action or answer the producer needs obvious, with any deadline stated plainly.
- Close with one short courteous sentence (for example offering help or thanking them). No extra pleasantries after it.
- Short paragraphs; use a bullet list only when there are three or more parallel items.
- Respect the event's content and message guidelines below: its terminology, spelling, names, style, and any banned words or claims.
- Keep EVERY fact exactly as the producer wrote it: names, dates, times, places, numbers, amounts, links and deadlines. Never invent a fact, promise, benefit, price or commitment the producer did not write. If something important is missing or unclear, keep the text as it is — do not guess.
- Keep links (<a href>) intact. Keep the producer's meaning and intent.
- Use plain English with no jargon, no exclamation marks and no emoji. Output simple HTML only: <p>, <strong>, <em>, <ul>, <ol>, <li>, <a href>.
${honorifics.length ? `- If speakers are referred to in the third person, use their required form of address: ${honorifics.join('; ')}.\n` : ''}
${guideText ? `EVENT GUIDELINES (follow these)\n${guideText}\n` : ''}
THE PRODUCER'S DRAFT
${htmlToPlainText(args.bodyHtml)}

Return JSON only, no markdown fences: { "polished_html": "<p>…</p>", "changes": ["short plain-English note of what you changed", "…"] }
"changes" has 2 to 6 notes, each under 14 words, saying what you did (for example "Shortened from 190 to 95 words", "Added a clear deadline line", "Replaced 'ASAP' with the date given").`

  let raw: string
  try {
    const model = gemini().getGenerativeModel({ model: GEMINI_FLASH_MODEL, generationConfig: COPY_GENERATION_CONFIG })
    raw = await generateCopy(model, prompt, 'speaker email polish')
  } catch (e) {
    console.error('speaker email polish failed:', e)
    return { error: 'The AI editor didn’t respond. Your text is untouched — try again in a moment.' }
  }
  const parsed = parsePolishResponse(raw)
  if (!parsed) return { error: 'The AI editor returned something unreadable. Your text is untouched — try again.' }
  const polished = cleanBodyHtml(parsed.polished_html)
  const { errors, warnings } = await checkEmailCompliance(args.eventId, htmlToPlainText(polished))
  const f = (x: { message: string; match: string }) => ({ message: x.message, match: x.match })
  return { polished_html: polished, changes: parsed.changes, errors: errors.map(f), warnings: warnings.map(f) }
}
