import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { supabaseAdmin } from '@/app/lib/supabase'
import { TRACKED_EVENT_FIELDS, FIELD_LABELS } from '@/app/lib/events/detail-field-log'

/* POST /api/events/stakeholders/messaging/[id]/propose-edit
   Body (conversational mode): { message: string, history?: { role: 'user'|'assistant', text: string }[], section_id?: string }
   Body (sync mode):           { sync: true }

   `section_id` (LIVE docs' chat, Event Details page) scopes a
   conversational request to exactly one section a producer has selected
   in the UI — the model only ever sees that one section's content (plus
   the rules sections, for the conflict check) and can only propose a
   change to it, never any other section. This is what makes "select a
   section, then chat next to it" an actual guarantee rather than a UI
   suggestion Gemini could ignore — without it, a broad request like
   "update the sponsor section" could land on the wrong section, or a
   vague one could silently touch several. Draft-doc review (still
   whole-document) and sync mode don't take section_id.

   Conversational update, step 1 of 2 — proposes edits without writing
   anything. The user reviews and approves per-proposal via POST
   .../apply-edit, which is the only endpoint that actually mutates
   anything. Never auto-applies.

   A proposal targets either an existing narrative section (target_type:
   'section'), or one of the fixed default_fields (target_type:
   'default_field'). Conversational default_field proposals only happen
   on DRAFT docs — before a producer has hit Approve, chatting can adjust
   the whole draft including its default_fields. Once a doc is 'live',
   default_fields are normally plain inline-edited fields on the Event
   Details page, not chat-edited here.

   Sync mode (`{sync:true}`, LIVE docs only) is the one exception: the
   Event Details page's "Sync with Messaging Doc" button, for when a
   producer edited a LIVE doc's sections via chat afterward (e.g. changed
   the venue mentioned in a section) and the Common Details fields on the
   events table are now stale relative to that. No producer message —
   Gemini compares the doc's current sections against the event's CURRENT
   Common Details values (fetched fresh from `events`, not the doc's own
   default_fields blob, which is only meaningful pre-approval) and
   proposes default_field updates only where the sections clearly imply a
   different value. apply-edit writes a sync-derived default_field
   proposal straight into `events` (see that route's comment). */

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
  target_type: 'section' | 'default_field'
  target_key: string
  target_label: string
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
  const syncMode = body?.sync === true
  const message = body?.message as string | undefined
  const history = Array.isArray(body?.history) ? body.history : []
  const sectionId = body?.section_id as string | undefined
  if (!syncMode && !message?.trim()) return NextResponse.json({ error: 'message required' }, { status: 400 })

  const { data: doc, error: docErr } = await supabaseAdmin
    .from('event_messaging_docs')
    .select('id, event_id, status, structured_json')
    .eq('id', id)
    .single()
  if (docErr || !doc) return NextResponse.json({ error: 'Messaging doc not found' }, { status: 404 })
  if (syncMode && doc.status !== 'live') {
    return NextResponse.json({ error: 'Sync only applies to the live document.' }, { status: 400 })
  }

  const sections: Section[] = doc.structured_json?.sections ?? []
  const isDraft = doc.status === 'draft'

  let scopedSection: Section | undefined
  if (sectionId) {
    scopedSection = sections.find(s => s.id === sectionId)
    if (!scopedSection) return NextResponse.json({ error: 'Section not found on this document' }, { status: 404 })
  }

  // Sync mode always sources "current" default field values fresh from the
  // events row (the real source of truth once live); conversational mode
  // on a draft sources from the draft's own staged blob (nothing's been
  // written to events yet); conversational mode on a live doc doesn't
  // offer default_field targets at all.
  let defaultFields: Record<string, string | null> = {}
  if (syncMode) {
    const { data: eventRow } = await supabaseAdmin.from('events').select(TRACKED_EVENT_FIELDS.join(', ')).eq('id', doc.event_id).single() as { data: Record<string, string | null> | null }
    defaultFields = eventRow ?? {}
  } else if (isDraft) {
    defaultFields = doc.structured_json?.default_fields ?? {}
  }

  if (sections.length === 0 && Object.keys(defaultFields).length === 0) {
    return NextResponse.json({ error: 'This document has no structured content to edit yet.' }, { status: 400 })
  }

  const rulesSections = sections.filter(s => s.kind === 'rules')
  const offerDefaultFields = syncMode || isDraft

  const defaultFieldsBlock = offerDefaultFields
    ? `\nDEFAULT FIELDS (fixed atomic facts, target_type "default_field" — target_key must exactly match one of these "key" values):\n${JSON.stringify(TRACKED_EVENT_FIELDS.map(k => ({ key: k, label: FIELD_LABELS[k], current_value: defaultFields[k] ?? null })), null, 2)}\n`
    : ''

  let prompt: string

  if (syncMode) {
    prompt = `You are checking whether an event's Common Details (fixed atomic facts — name, dates, venue, links) are still accurate compared to the current content of its topline messaging document. The producer edits the messaging document's sections independently over time (via chat), so these fixed fields can drift out of date.

Compare the CURRENT SECTIONS below against the CURRENT DEFAULT FIELD VALUES. Propose an update ONLY for a field where the sections clearly and unambiguously state something different from the current value (e.g. the sections now mention a different venue, a different date range, an updated hashtag). Do NOT propose a change just because a field is currently blank and the sections don't mention it — leave it alone unless there's a clear, confident signal that the CURRENT value is wrong or outdated.

RULES SECTIONS (for context only — do not propose changes to these):
${rulesSections.length > 0 ? JSON.stringify(rulesSections.map(s => ({ id: s.id, title: s.title, content: s.content })), null, 2) : '(none)'}

CURRENT SECTIONS:
${JSON.stringify(sections.map(s => ({ id: s.id, title: s.title, kind: s.kind, content: s.content })), null, 2)}
${defaultFieldsBlock}
Return JSON only, no markdown fences, in this exact shape:
{
  "reply": "a short, human sentence summarizing what's out of date (or confirming everything still matches, with an empty proposals array)",
  "proposals": [
    {
      "target_type": "default_field",
      "target_key": "must exactly match one of the default field keys listed above",
      "proposed_content": "the new value as a plain string, or null to clear it",
      "rationale": "one sentence on what changed and why, quoting or pointing at the specific section that implies it",
      "conflict": null
    }
  ]
}`
  } else {
    const historyText = history
      .slice(-8)
      .map((m: { role: string; text: string }) => `${m.role === 'user' ? 'Producer' : 'Assistant'}: ${m.text}`)
      .join('\n')

    const contextSections = scopedSection ? [scopedSection] : sections

    const scopeInstruction = scopedSection
      ? `The producer has selected exactly ONE section to update — "${scopedSection.title}" (id "${scopedSection.id}") — shown below in CURRENT SECTIONS. You may ONLY propose a change to this section. You cannot see the document's other sections, so never guess at or propose a different target_key. If the request clearly doesn't belong in this section (it describes something that belongs elsewhere in the document), say so in "reply" and return no proposals — do not attempt it here.`
      : `Your job is to figure out which existing section(s)${isDraft ? ' or default field(s)' : ''} the request belongs in and propose new content for exactly those targets. Never invent facts the producer didn't give you. Never propose changing something the request doesn't actually touch.`

    prompt = `You help a producer keep an event's topline messaging document up to date by chatting with them.${isDraft ? ' This document is still a DRAFT awaiting the producer\'s first approval, so a small fixed set of "default fields" (name, dates, venue, links) is also available below.' : ''} The producer will describe a change — a new sponsor/partner, a speaker to call out, an updated stat, a corrected fact, a link that changed, etc. ${scopeInstruction}

If the request is genuinely ambiguous (could plausibly belong in more than one target, or you need a missing detail to write it correctly), ask a short clarifying question instead of proposing an edit — set "proposals" to an empty array and put the question in "reply".

CROSS-SECTION CONFLICT CHECK — do this for every SECTION proposal before finalizing it (this check does not apply to default_field proposals, which are atomic facts, not copy):
This document has dedicated "rules" sections (naming/style/language conventions, verbatim lines, and things that must NEVER appear in external copy) listed below. Before finalizing each section proposal, check whether the new content you're about to write would contradict, use forbidden terms from, or otherwise conflict with any of these rules — even though the request itself targets a different section. This matters because a producer's request can be perfectly reasonable on its own while still colliding with a naming/style/embargo rule defined elsewhere in the document (e.g. asking to use an abbreviation the rules explicitly forbid in external copy).
- If you find no conflict, set that proposal's "conflict" to null.
- If you find a conflict but there's an obvious way to satisfy the producer's underlying intent while staying compliant (e.g. swap a forbidden term for the approved one from the rules), do that automatically in "proposed_content" and explain the substitution in "conflict" (e.g. "Used the approved primary hashtag set instead of WAIS-prefixed tags, since section 13 marks WAIS as internal-only").
- If the request fundamentally cannot be satisfied without violating a rule (no compliant alternative exists), do not include a proposal for it at all — instead explain the conflict in "reply" and leave "proposals" empty (or omit just that one section's proposal if other targets in the same request are fine).

RULES SECTIONS TO CHECK AGAINST:
${rulesSections.length > 0 ? JSON.stringify(rulesSections.map(s => ({ id: s.id, title: s.title, content: s.content })), null, 2) : '(this document has no sections tagged "rules" yet)'}

CURRENT SECTIONS:
${JSON.stringify(contextSections.map(s => ({ id: s.id, title: s.title, kind: s.kind, content: s.content })), null, 2)}
${defaultFieldsBlock}
${historyText ? `RECENT CONVERSATION:\n${historyText}\n` : ''}
PRODUCER'S REQUEST:
${message}

Return JSON only, no markdown fences, in this exact shape:
{
  "reply": "a short, human sentence explaining what you're proposing (or your clarifying question, or the conflict that blocked a proposal)",
  "proposals": [
    {
      "target_type": "section" | "default_field",
      "target_key": "must exactly match an existing section id, or one of the default field keys listed above",
      "proposed_content": ...,   // for "section": same shape/kind as that section's existing content (string for text/rules, {columns,rows} for table, array for facts) — the FULL new content, not just the delta, already conflict-resolved per the check above. For "default_field": a plain string (the new value), or null to clear it.
      "rationale": "one sentence on what changed and why",
      "conflict": "explanation of the rule conflict and how you resolved it, or null if none"
    }
  ]
}`
  }

  try {
    const model  = getGemini().getGenerativeModel({ model: 'gemini-2.5-flash' })
    const result = await model.generateContent([{ text: prompt }])
    const text   = result.response.text().trim()
    const match  = text.match(/\{[\s\S]*\}/)
    if (!match) throw new Error('No JSON in model response')
    const parsed = JSON.parse(match[0]) as { reply: string; proposals: Array<{ target_type: 'section' | 'default_field'; target_key: string; proposed_content: unknown; rationale: string; conflict?: string | null }> }

    const sectionsByKey = new Map(sections.map(s => [s.id, s]))
    const trackedKeys: readonly string[] = TRACKED_EVENT_FIELDS
    const proposals: Proposal[] = (parsed.proposals ?? [])
      .filter(p => p.target_type === 'section'
        ? sectionsByKey.has(p.target_key) && (!scopedSection || p.target_key === scopedSection.id)
        : (offerDefaultFields && !scopedSection && trackedKeys.includes(p.target_key)))
      .map(p => {
        if (p.target_type === 'section') {
          const section = sectionsByKey.get(p.target_key)!
          return {
            target_type: 'section' as const,
            target_key: p.target_key,
            target_label: section.title,
            current_excerpt: excerpt(section.content),
            proposed_content: p.proposed_content,
            rationale: p.rationale,
            conflict: p.conflict ?? null,
          }
        }
        const key = p.target_key as typeof TRACKED_EVENT_FIELDS[number]
        return {
          target_type: 'default_field' as const,
          target_key: key,
          target_label: FIELD_LABELS[key],
          current_excerpt: excerpt(defaultFields[key] ?? null),
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
