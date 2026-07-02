import { GoogleGenerativeAI } from '@google/generative-ai'

/**
 * Drafts a per-member Pilot Project checklist with Gemini, mirroring the tone and
 * structure of the checklists hand-written for the first three Pilot Projects
 * (Bespoke Event Module, Corporate Marketing Module, Website Builder & Brand Studio):
 * a few "prerequisite" items, several "scope_decision" items naming the actual open
 * question, "content_prep" items for anything that needs curating, and "coordination"
 * items for cross-checking with other members. Output is a draft — admins edit before
 * sending, so it's fine (expected, even) for the model to guess at specifics.
 */

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })

export type DraftChecklistItem = { title: string; description: string; category: string }

export interface DraftChecklistInput {
  projectName:        string
  projectDescription: string
  members:            Array<{ id: string; name: string; roleLabel: string }>
}

const CATEGORIES = ['prerequisite', 'scope_decision', 'content_prep', 'coordination']

export async function draftPilotChecklist(input: DraftChecklistInput): Promise<Record<string, DraftChecklistItem[]>> {
  const memberList = input.members.map(m => `- ${m.name} (${m.roleLabel}) — id: "${m.id}"`).join('\n')

  const prompt = `You are drafting the initial onboarding checklist for a new "Pilot Project" inside EventPilot, Trescon's internal staff platform. A Pilot Project is a micro-tool build led by a subject-matter expert ("Pilot") in collaboration with an engineer named Durga. The Pilot owns scope, a Co-Pilot (if present) supports them, a Consulting member contributes domain expertise, and a Tracker maintains visibility and escalates blockers. This checklist is a DRAFT — a human will review and edit every item before it's sent, so it's fine to be specific and opinionated even if you have to guess at details.

PROJECT NAME: ${input.projectName}
PROJECT DESCRIPTION: ${input.projectDescription}

MEMBERS (draft one checklist array per member, keyed by their id):
${memberList}

For each member, write 2-7 checklist items appropriate to their role:
- The Pilot (and Co-Pilot, if present) should get: reading the SME Context Guide (a "prerequisite"), scheduling an alignment call with Durga to decide Phase 1 scope (a "scope_decision"), 2-4 concrete "scope_decision" items naming the actual open questions for THIS project (infer these from the project description — e.g. standalone vs. integrated, which sub-feature is Phase 1, what data model choices matter), any "content_prep" items for assets/templates/examples that would need curating, and a final "prerequisite" item to write the Phase 1 PRD prompt for Durga.
- Consulting members get 1-3 items: sharing relevant domain feedback ("content_prep") and joining the alignment call or reviewing the PRD draft ("coordination").
- Tracking members get exactly 2 items: logging into EventPilot to check the Pilot Projects page ("prerequisite"), and setting up a check-in cadence with the Pilot — always ending with "Flag any blockers directly to Durga (dc@tresconglobal.com) — not to Madhu." ("coordination").

Each item needs: "title" (short, imperative, under 12 words), "description" (1-2 sentences, specific to this project — not generic filler), and "category" (one of: ${CATEGORIES.join(' | ')}).

Return ONLY a JSON object, no markdown fences, no commentary, shaped exactly like:
{"<member id>": [{"title": "...", "description": "...", "category": "..."}], "<member id>": [...]}

Every member id listed above must be a key in the returned object.`

  const result = await model.generateContent(prompt)
  let text = result.response.text().trim()
  text = text.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim()

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('Gemini returned non-JSON output for checklist draft')
  }

  const out: Record<string, DraftChecklistItem[]> = {}
  for (const m of input.members) {
    const items = (parsed as Record<string, unknown>)[m.id]
    if (!Array.isArray(items)) { out[m.id] = []; continue }
    out[m.id] = items
      .filter((it): it is Record<string, unknown> => !!it && typeof it === 'object')
      .map(it => ({
        title:       String(it.title ?? '').trim(),
        description: String(it.description ?? '').trim(),
        category:    CATEGORIES.includes(String(it.category)) ? String(it.category) : 'prerequisite',
      }))
      .filter(it => it.title)
  }
  return out
}
