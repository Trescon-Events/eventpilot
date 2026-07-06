/**
 * Corporate Deck AI analysis — Gemini reads the PDF natively (visual +
 * text) and returns a list of dynamic sections with slide numbers,
 * confidence, and sample content. This is a suggestion only — the user
 * confirms in the UI before mappings become "editable" in the workspace.
 *
 * Model: gemini-2.5-flash — fast + accurate enough for structured JSON
 * extraction on a ~30-slide deck. Upgrade to gemini-2.5-pro if quality
 * proves too weak on image-heavy decks.
 */
import { GoogleGenerativeAI } from '@google/generative-ai'
import { GoogleAIFileManager } from '@google/generative-ai/server'
import { writeFile, unlink } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'

const INLINE_THRESHOLD = 5 * 1024 * 1024   // 5 MB — smaller PDFs go inline
const MODEL_NAME = 'gemini-2.5-flash'

// The 14 section keys the module supports. Matches the PRD §4.2 list.
// Gemini is instructed to only use these keys; anything else is dropped.
export const SECTION_KEYS = [
  'company_overview',
  'vision',
  'mission',
  'tagline',
  'boilerplate',
  'company_stats',
  'event_series_stats',
  'event_stats',
  'upcoming_events',
  'past_events',
  'leadership',
  'testimonials',
  'images',
  'success_stories',
] as const

export type SectionKey = typeof SECTION_KEYS[number]

export type DetectedSection = {
  section_key:    SectionKey
  section_label:  string
  slide_numbers:  number[]
  confidence:     number      // 0.0 - 1.0
  sample_content: string      // short excerpt so the user can verify
}

export type AnalyseResult = {
  sections: DetectedSection[]
  raw:      unknown           // full Gemini response for debugging
}

const PROMPT = `You are analysing a Trescon corporate deck (PDF) to help a marketing team keep it up to date.

Your job: identify the sections of this deck that change over time and should be maintained as editable content in a separate CMS (EventPilot). Design elements, static branding, and one-off narrative slides are NOT dynamic — skip them.

For each dynamic section you find, return:
- section_key: one of these EXACT strings (drop anything else):
  company_overview, vision, mission, tagline, boilerplate,
  company_stats, event_series_stats, event_stats,
  upcoming_events, past_events,
  leadership, testimonials, images, success_stories
- section_label: short human-readable label (e.g. "Company Statistics")
- slide_numbers: array of 1-indexed page numbers where this content appears (include every occurrence)
- confidence: number between 0.0 and 1.0 (how sure you are this section exists in the deck)
- sample_content: 1-2 sentence excerpt of the actual content you found on those slides, so a human can verify (max 200 chars)

Notes:
- "boilerplate" = the "About Trescon" paragraph often repeated at end of deck
- "company_stats" = high-level numbers about the company ("17 years", "500+ events")
- "event_stats" = numbers about a specific event (attendee count, sponsors)
- "leadership" = named people with photos/titles
- "images" = notable photo galleries or hero imagery
- Only include a section if you have EVIDENCE for it in the deck — do not guess
- Do NOT include design/branding, table of contents, thank-you slides
- Slide numbers must be integers, 1-indexed

Return ONLY a JSON object, no markdown fences, no commentary, shaped exactly like:
{"sections": [{"section_key": "...", "section_label": "...", "slide_numbers": [1,2], "confidence": 0.9, "sample_content": "..."}, ...]}`

export async function analyseCorporateDeck(pdfBuffer: Buffer, fileName: string): Promise<AnalyseResult> {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
  const model = genAI.getGenerativeModel({ model: MODEL_NAME })

  let result
  if (pdfBuffer.byteLength > INLINE_THRESHOLD) {
    // Large PDF → upload via File API, reference by URI
    const fileManager = new GoogleAIFileManager(process.env.GEMINI_API_KEY!)
    const tmpPath = join(tmpdir(), `cm_deck_${Date.now()}_${Math.random().toString(36).slice(2)}.pdf`)
    try {
      await writeFile(tmpPath, pdfBuffer)
      const uploadRes = await fileManager.uploadFile(tmpPath, {
        mimeType:    'application/pdf',
        displayName: fileName,
      })
      result = await model.generateContent([
        { fileData: { mimeType: 'application/pdf', fileUri: uploadRes.file.uri } },
        { text: PROMPT },
      ])
      await fileManager.deleteFile(uploadRes.file.name).catch(() => {})
    } finally {
      await unlink(tmpPath).catch(() => {})
    }
  } else {
    // Small PDF → inline base64
    result = await model.generateContent([
      { inlineData: { mimeType: 'application/pdf', data: pdfBuffer.toString('base64') } },
      { text: PROMPT },
    ])
  }

  let text = result.response.text().trim()
  // Strip markdown fences if Gemini added them
  text = text.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim()

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('Gemini returned non-JSON output for deck analysis')
  }

  const rawSections = (parsed as { sections?: unknown }).sections
  if (!Array.isArray(rawSections)) {
    throw new Error('Gemini response missing "sections" array')
  }

  const validKeys = new Set<string>(SECTION_KEYS)
  const seen = new Set<string>()
  const sections: DetectedSection[] = []

  for (const item of rawSections) {
    if (!item || typeof item !== 'object') continue
    const it = item as Record<string, unknown>
    const key = String(it.section_key ?? '').trim()
    if (!validKeys.has(key)) continue
    if (seen.has(key)) continue        // Gemini sometimes duplicates — keep first
    seen.add(key)

    const slidesRaw = Array.isArray(it.slide_numbers) ? it.slide_numbers : []
    const slides = slidesRaw
      .map(n => Number(n))
      .filter(n => Number.isInteger(n) && n > 0)
      .sort((a, b) => a - b)

    const confRaw = Number(it.confidence)
    const confidence = Number.isFinite(confRaw) ? Math.max(0, Math.min(1, confRaw)) : 0.5

    sections.push({
      section_key:    key as SectionKey,
      section_label:  String(it.section_label ?? key).trim() || key,
      slide_numbers:  slides,
      confidence,
      sample_content: String(it.sample_content ?? '').trim().slice(0, 220),
    })
  }

  // Sort by first slide number for consistent ordering
  sections.sort((a, b) => (a.slide_numbers[0] ?? 999) - (b.slide_numbers[0] ?? 999))

  return { sections, raw: parsed }
}
