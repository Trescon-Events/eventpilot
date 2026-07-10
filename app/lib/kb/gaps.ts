import { randomUUID } from 'crypto'
import type { GenerativeModel } from '@google/generative-ai'

export interface Gap {
  id: string
  description: string
  location: string
  example_value: string
  suggested_field_name: string
  suggested_category: string
  suggested_options: string[]
  confidence: 'high' | 'medium' | 'low'
}

const MAX_GAPS = 5

function stripFence(text: string): string {
  return text.trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()
}

/*
  Prose doc types (proposal, post_event_report, corporate_doc): ask Gemini to
  compare the document against the processor guide and flag substantive
  information the guide doesn't cover. Best-effort — any parse failure
  returns no gaps rather than throwing, since the caller must never let this
  block the main ingest flow.
*/
async function detectProseGaps(
  model: GenerativeModel,
  processorGuide: string,
  extractedText: string,
  filename: string,
  docType: string
): Promise<Gap[]> {
  const prompt = `You are reviewing a document that has just been processed for Trescon's Knowledge Base.

The current processor guide lists the fields we know how to extract:
${processorGuide}

The document content is:
${extractedText.slice(0, 30000)}

Filename: ${filename}
Document type: ${docType}

Your task: Compare what you found in this document against the fields listed in the processor guide.
Find information types that ARE in this document but are NOT covered by the processor guide.

Rules:
- Only flag genuinely new field types, not just different values of existing fields
- Minor variations of existing fields do NOT count as gaps
- Ignore formatting, styling, or layout elements — only substantive information
- Maximum 5 gaps per document — only flag the most significant ones
- If there are no gaps, return an empty array

Return a JSON array only (no markdown, no explanation):
[
  {
    "id": "uuid-string",
    "description": "Brief description of what I found (start with 'I found:')",
    "location": "Where in the document (e.g. 'Page 6', 'Section: Commercial Model')",
    "example_value": "The actual value from the document",
    "suggested_field_name": "snake_case_field_name",
    "suggested_category": "Which section this belongs to",
    "suggested_options": ["Option A", "Option B", "Option C", "Something else"],
    "confidence": "high|medium|low"
  }
]

If no gaps found, return: []`

  const result = await model.generateContent(prompt)
  const text = stripFence(result.response.text())

  let parsed: unknown
  try {
    parsed = JSON.parse(text.startsWith('[') ? text : '[]')
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []

  return (parsed as Record<string, unknown>[]).slice(0, MAX_GAPS).map((g) => ({
    id: typeof g?.id === 'string' ? g.id : randomUUID(),
    description: String(g?.description ?? ''),
    location: String(g?.location ?? ''),
    example_value: String(g?.example_value ?? ''),
    suggested_field_name: String(g?.suggested_field_name ?? ''),
    suggested_category: String(g?.suggested_category ?? 'General'),
    suggested_options: Array.isArray(g?.suggested_options) ? g.suggested_options.map(String) : [],
    confidence: g?.confidence === 'high' || g?.confidence === 'low' ? g.confidence : 'medium',
  }))
}

/*
  attendee_data (xlsx) works differently per PRD Section 8: a "gap" here is an
  unmapped column header, not a Gemini-detected concept — so no LLM call is
  needed. extractedText is the tab-separated sheet dump produced by
  extractKbText() (app/lib/kb/extract.ts) — the first line following each
  "--- Sheet: ... ---" marker is the header row. We diff those headers against
  the "Maps from" aliases already listed in attendee-data.md's Standard Column
  Mapping table.
*/
function detectAttendeeColumnGaps(processorGuide: string, extractedText: string): Gap[] {
  const mappedHeaders = new Set<string>()
  const tableMatch = processorGuide.match(/\|\s*Standard field\s*\|\s*Maps from[^\n]*\|\n\|[-\s|]+\|\n([\s\S]*?)\n\n/)
  if (tableMatch) {
    for (const line of tableMatch[1].split('\n')) {
      const cells = line.split('|').map((c) => c.trim()).filter(Boolean)
      if (cells.length < 2) continue
      for (const alias of cells[1].split(',')) {
        mappedHeaders.add(alias.trim().toLowerCase())
      }
    }
  }

  const headers: string[] = []
  const blocks = extractedText.split(/--- Sheet:.*?---\n/).slice(1)
  for (const block of blocks) {
    const firstLine = block.split('\n', 1)[0]
    for (const h of firstLine.split('\t')) {
      const trimmed = h.trim()
      if (trimmed && !headers.includes(trimmed)) headers.push(trimmed)
    }
  }

  const gaps: Gap[] = []
  for (const header of headers) {
    if (mappedHeaders.has(header.toLowerCase())) continue
    gaps.push({
      id: randomUUID(),
      description: `I found a column that isn't mapped: "${header}"`,
      location: 'Column header',
      example_value: header,
      suggested_field_name: header.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'unmapped_column',
      suggested_category: 'Standard Column Mapping',
      suggested_options: [],
      confidence: 'medium',
    })
    if (gaps.length >= MAX_GAPS) break
  }
  return gaps
}

export async function detectGaps(
  model: GenerativeModel,
  processorGuide: string,
  extractedText: string,
  filename: string,
  docType: string
): Promise<Gap[]> {
  if (docType === 'attendee_data') {
    return detectAttendeeColumnGaps(processorGuide, extractedText)
  }
  return detectProseGaps(model, processorGuide, extractedText, filename, docType)
}
