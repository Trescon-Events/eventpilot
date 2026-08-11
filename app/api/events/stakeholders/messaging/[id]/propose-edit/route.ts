import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { supabaseAdmin } from '@/app/lib/supabase'

/* POST /api/events/stakeholders/messaging/[id]/propose-edit
   Body: { message: string, history?: { role: 'user'|'assistant', text: string }[] }

   Conversational update, step 1 of 2 — proposes section edits without
   writing anything. The user reviews and approves per-section via
   POST .../apply-edit, which is the only endpoint that actually mutates
   structured_json. Never auto-applies. */

type Section = {
  id: string
  order: number
  title: string
  kind: 'text' | 'table' | 'facts' | 'rules'
  content: unknown
  updated_at?: string
  updated_by?: string | null
  change_note?: string | null
}

type Proposal = {
  section_id: string
  section_title: string
  current_excerpt: string
  proposed_content: unknown
  rationale: string
  conflict: string | null
}

let _gemini: GoogleGenerativeAI | null = null
function getGemini() {
  if (!_gemini) _gemini = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
  return _gemini
}

function excerpt(content: unknown): string {
  const s = typeof content === 'string' ? content : JSON.stringify(content)
  return s.length > 400 ? s.slice(0, 400) + '…' : s
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json().catch(() => null)
  const message = body?.message as string | undefined
  const history = Array.isArray(body?.history) ? body.history : []
  if (!message?.trim()) return NextResponse.json({ error: 'message required' }, { status: 400 })

  const { data: doc, error: docErr } = await supabaseAdmin
    .from('event_messaging_docs')
    .select('id, structured_json')
    .eq('id', id)
    .single()
  if (docErr || !doc) return NextResponse.json({ error: 'Messaging doc not found' }, { status: 404 })

  const sections: Section[] = doc.structured_json?.sections ?? []
  if (sections.length === 0) {
    return NextResponse.json({ error: 'This document has no structured sections to edit yet.' }, { status: 400 })
  }

  const historyText = history
    .slice(-8)
    .map((m: { role: string; text: string }) => `${m.role === 'user' ? 'Producer' : 'Assistant'}: ${m.text}`)
    .join('\n')

  const rulesSections = sections.filter(s => s.kind === 'rules')

  const prompt = `You help a producer keep an event's topline messaging document up to date by chatting with them. The document is already split into sections (below). The producer will describe a change — a new sponsor/partner, a speaker to call out, an updated stat, a corrected fact, etc. Your job is to figure out which existing section(s) that change belongs in and propose new content for exactly those sections. Never invent facts the producer didn't give you. Never propose changing a section the request doesn't actually touch.

If the request is genuinely ambiguous (could plausibly belong in more than one section, or you need a missing detail to write it correctly), ask a short clarifying question instead of proposing an edit — set "proposals" to an empty array and put the question in "reply".

CROSS-SECTION CONFLICT CHECK — do this for every proposal before finalizing it:
This document has dedicated "rules" sections (naming/style/language conventions, verbatim lines, and things that must NEVER appear in external copy) listed below. Before finalizing each proposal, check whether the new content you're about to write would contradict, use forbidden terms from, or otherwise conflict with any of these rules — even though the request itself targets a different section. This matters because a producer's request can be perfectly reasonable on its own while still colliding with a naming/style/embargo rule defined elsewhere in the document (e.g. asking to use an abbreviation the rules explicitly forbid in external copy).
- If you find no conflict, set that proposal's "conflict" to null.
- If you find a conflict but there's an obvious way to satisfy the producer's underlying intent while staying compliant (e.g. swap a forbidden term for the approved one from the rules), do that automatically in "proposed_content" and explain the substitution in "conflict" (e.g. "Used the approved primary hashtag set instead of WAIS-prefixed tags, since section 13 marks WAIS as internal-only").
- If the request fundamentally cannot be satisfied without violating a rule (no compliant alternative exists), do not include a proposal for it at all — instead explain the conflict in "reply" and leave "proposals" empty (or omit just that one section's proposal if other sections in the same request are fine).

RULES SECTIONS TO CHECK AGAINST:
${rulesSections.length > 0 ? JSON.stringify(rulesSections.map(s => ({ id: s.id, title: s.title, content: s.content })), null, 2) : '(this document has no sections tagged "rules" yet)'}

CURRENT SECTIONS:
${JSON.stringify(sections.map(s => ({ id: s.id, title: s.title, kind: s.kind, content: s.content })), null, 2)}

${historyText ? `RECENT CONVERSATION:\n${historyText}\n` : ''}
PRODUCER'S REQUEST:
${message}

Return JSON only, no markdown fences, in this exact shape:
{
  "reply": "a short, human sentence explaining what you're proposing (or your clarifying question, or the conflict that blocked a proposal)",
  "proposals": [
    {
      "section_id": "must exactly match an existing section id above",
      "proposed_content": ...,   // same shape/kind as that section's existing content (string for text/rules, {columns,rows} for table, array for facts) — the FULL new content for the section, not just the delta — already conflict-resolved per the check above
      "rationale": "one sentence on what changed and why",
      "conflict": "explanation of the rule conflict and how you resolved it, or null if none"
    }
  ]
}`

  try {
    const model  = getGemini().getGenerativeModel({ model: 'gemini-2.5-flash' })
    const result = await model.generateContent([{ text: prompt }])
    const text   = result.response.text().trim()
    const match  = text.match(/\{[\s\S]*\}/)
    if (!match) throw new Error('No JSON in model response')
    const parsed = JSON.parse(match[0]) as { reply: string; proposals: Array<{ section_id: string; proposed_content: unknown; rationale: string; conflict?: string | null }> }

    const byId = new Map(sections.map(s => [s.id, s]))
    const proposals: Proposal[] = (parsed.proposals ?? [])
      .filter(p => byId.has(p.section_id))
      .map(p => {
        const section = byId.get(p.section_id)!
        return {
          section_id: p.section_id,
          section_title: section.title,
          current_excerpt: excerpt(section.content),
          proposed_content: p.proposed_content,
          rationale: p.rationale,
          conflict: p.conflict ?? null,
        }
      })

    return NextResponse.json({ reply: parsed.reply, proposals })
  } catch (e) {
    console.error('propose-edit failed:', e)
    return NextResponse.json({ error: 'Could not process that request. Please try rephrasing.' }, { status: 500 })
  }
}
