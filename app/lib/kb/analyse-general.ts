import { GoogleGenerativeAI } from '@google/generative-ai'

const DEPARTMENTS = ['all', 'marketing', 'finance', 'sales', 'operations', 'events', 'hr', 'it']
const LAYERS      = ['knowledge_base', 'general', 'specific']
const LEVELS      = ['all', 'team_lead', 'management']

function sanitise(val: string, allowed: string[], fallback: string): string {
  return allowed.includes(val?.toLowerCase()) ? val.toLowerCase() : fallback
}

export interface GeneralDocAnalysis {
  layer: string
  department: string
  min_level: string
  pilot_use: boolean
  ai_reasoning: string
  confidence: number
  suggested_type: string
}

/*
  Classify-only analysis for "General Document" ingests — decides WHO can see
  a document (layer/department/min_level/pilot_use) without rewriting WHAT it
  says. The caller stores the raw extracted text verbatim; this never touches
  document content. Ported from the retired /api/documents/upload/route.ts,
  unchanged, so its confidence/reasoning behavior for existing general-type
  documents doesn't shift.
*/
export async function analyseGeneralDocument(
  title: string,
  extractedText: string,
  uploader: { name: string; department: string | null; role: string | null; job_level: string | null },
  customType?: string
): Promise<GeneralDocAnalysis> {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })

  const prompt = `You are the document intelligence system for Event Pilot, Trescon's internal platform.

A document has been uploaded. Analyse it and return a JSON object with your decisions.

UPLOADER PROFILE:
Name: ${uploader.name}
Department: ${uploader.department ?? 'Unknown'}
Role: ${uploader.role ?? 'Unknown'}
Job Level: ${uploader.job_level ?? 'staff'}

DOCUMENT TITLE: ${title}
${customType ? `DOCUMENT TYPE (user specified): ${customType}` : ''}

DOCUMENT CONTENT (first 3000 chars):
${extractedText.slice(0, 3000)}

DECISION RULES:

layer options:
- "knowledge_base": Foundational company knowledge. Policies, past event summaries, production briefs, SOPs, brand guidelines, onboarding material. Pilot ALWAYS searches these for everyone.
- "general": Relevant to all staff but not core knowledge base. Announcements, culture docs.
- "specific": Active working documents. Campaign plans, budget reviews, event briefs, sales playbooks. Access controlled by department and level.

department options (who should see this):
- "all": All departments
- "marketing", "finance", "sales", "operations", "events", "hr", "it": Specific department only

min_level options (minimum job level to access):
- "all": Every staff member
- "team_lead": Team leads and above
- "management": Office heads and above only

pilot_use: true if Pilot should search this document when answering staff questions, false otherwise.
- Always true for knowledge_base
- True for general if it contains useful reference information
- For specific: true only if it helps staff in the relevant department understand their work

confidence: 0-100. How confident are you in these decisions?
- 90-100: Very clear from content and uploader profile
- 75-89: Reasonably clear
- 50-74: Some ambiguity — will be flagged for admin review
- Below 50: Very unclear

suggested_type: If the user did not specify a type, suggest one. Use existing types (policy, event_brief, staff_doc, onboarding) or suggest a new descriptive type in snake_case.

Return ONLY valid JSON, no markdown:
{
  "layer": "knowledge_base|general|specific",
  "department": "all|marketing|finance|sales|operations|events|hr|it",
  "min_level": "all|team_lead|management",
  "pilot_use": true|false,
  "ai_reasoning": "2-3 sentence explanation of your decisions",
  "confidence": 0-100,
  "suggested_type": "snake_case_type_name"
}`

  try {
    const result = await model.generateContent(prompt)
    const text   = result.response.text().trim()
    const json   = text.startsWith('{') ? text : text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)
    const parsed = JSON.parse(json)

    return {
      layer:          sanitise(parsed.layer,       LAYERS,       'general'),
      department:     sanitise(parsed.department,  DEPARTMENTS,  'all'),
      min_level:      sanitise(parsed.min_level,   LEVELS,       'all'),
      pilot_use:     Boolean(parsed.pilot_use),
      ai_reasoning:   String(parsed.ai_reasoning ?? '').slice(0, 1000),
      confidence:     Math.min(100, Math.max(0, Number(parsed.confidence ?? 70))),
      suggested_type: String(parsed.suggested_type ?? 'other').slice(0, 60),
    }
  } catch {
    return {
      layer: 'general', department: 'all', min_level: 'all',
      pilot_use: false, ai_reasoning: 'AI analysis failed — defaulted to general visibility.',
      confidence: 40, suggested_type: customType ?? 'other',
    }
  }
}
