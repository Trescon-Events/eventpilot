import { GoogleGenerativeAI } from '@google/generative-ai'
import { supabaseAdmin } from '@/app/lib/supabase'
import type { ContentOwnerRef } from './owner'

/* Reference Documents spec — extraction-time clarification Q&A (2026-09-10,
   agreed with Madhu after Stage 3). See
   supabase/reference_documents_clarifications_migration.sql for the "why".

   Round 1 is generated as part of the normal upload extraction (see
   STRUCTURE_PROMPT in app/api/events/stakeholders/messaging/route.ts,
   which now also asks the model to propose clarifications). Rounds 2-5 go
   through processAnsweredRound() below, driven by
   .../messaging/[id]/clarifications/answer/route.ts. Capped at
   MAX_CLARIFICATION_ROUNDS — Madhu: "let them go through the questions,"
   no early exit, but also no infinite loop. Past the cap, whatever's still
   unanswered just stays a visible pending row; nothing new gets generated. */

export const MAX_CLARIFICATION_ROUNDS = 5

export type ClarificationOption = { value: string; label: string; description?: string }
export type RawClarification = {
  question_key: string
  question_text: string
  context: string | null
  section_id: string | null
  options: ClarificationOption[]
  allows_other: boolean
}

function normalizeClarifications(raw: unknown): RawClarification[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((c): RawClarification | null => {
      const o = c as Record<string, unknown>
      const question_key = String(o.question_key ?? '').trim()
      const question_text = String(o.question_text ?? '').trim()
      const rawOptions = Array.isArray(o.options) ? o.options : []
      const options: ClarificationOption[] = rawOptions
        .map((opt): ClarificationOption | null => {
          const op = opt as Record<string, unknown>
          const value = String(op.value ?? '').trim()
          const label = String(op.label ?? '').trim()
          if (!value || !label) return null
          return { value, label, description: op.description ? String(op.description) : undefined }
        })
        .filter((x): x is ClarificationOption => x !== null)
      if (!question_key || !question_text || options.length === 0) return null
      return {
        question_key,
        question_text,
        context: o.context ? String(o.context) : null,
        section_id: o.section_id ? String(o.section_id) : null,
        options,
        allows_other: o.allows_other !== false,
      }
    })
    .filter((x): x is RawClarification => x !== null)
}

// Inserts one round of clarification rows. Returns how many were actually
// inserted (0 if the model raised nothing, or everything was malformed).
export async function insertClarificationRound(docId: string, round: number, rawClarifications: unknown): Promise<number> {
  const clarifications = normalizeClarifications(rawClarifications)
  if (clarifications.length === 0) return 0
  const rows = clarifications.map(c => ({
    doc_id: docId,
    round,
    question_key: c.question_key,
    question_text: c.question_text,
    context: c.context,
    section_id: c.section_id,
    options: c.options,
    allows_other: c.allows_other,
  }))
  const { error } = await supabaseAdmin.from('event_messaging_doc_clarifications').insert(rows)
  if (error) {
    console.error('Failed to insert clarification round:', error)
    return 0
  }
  return rows.length
}

const SUGGESTABLE_RULE_TYPES = new Set(['required_format', 'forbidden_term', 'forbidden_pattern'])

// Clarification-to-validation-rule bridge (2026-09-10, agreed after Stage
// 4) — inserted with is_active=false, review_status='suggested': visible
// to a producer to accept or dismiss (see ClarificationsPanel/
// SuggestedRulesPanel in app/admin/events/[id]/details/page.tsx and
// .../messaging/[id]/suggested-rules/route.ts), never affecting generated
// copy until a human explicitly accepts one. source_clarification_id
// keeps every suggestion traceable back to the exact Q&A that produced it.
async function insertSuggestedRules(
  owner: ContentOwnerRef,
  rawSuggestions: unknown,
  answeredRows: Array<{ id: string; question_key: string }>
): Promise<void> {
  if (!Array.isArray(rawSuggestions) || rawSuggestions.length === 0) return
  const answeredByKey = new Map(answeredRows.map(a => [a.question_key, a.id]))

  const rows = rawSuggestions
    .map((raw) => {
      const s = raw as Record<string, unknown>
      const ruleKeyRaw = String(s.rule_key ?? '').trim()
      const ruleType = String(s.rule_type ?? '')
      const pattern = s.pattern
      const message = String(s.message ?? '').trim()
      if (!ruleKeyRaw || !SUGGESTABLE_RULE_TYPES.has(ruleType) || !message) return null
      const patternStr = typeof pattern === 'string' ? pattern : JSON.stringify(pattern)
      if (!patternStr) return null
      const answeredQuestionKey = String(s.answered_question_key ?? '')
      // The model doesn't always echo answered_question_key reliably —
      // when it's missing/unmatched and there was only one answered
      // question this round (the common case), that's still an
      // unambiguous link; only genuinely unknown when several questions
      // were answered and none match.
      const sourceClarificationId = answeredByKey.get(answeredQuestionKey)
        ?? (answeredRows.length === 1 ? answeredRows[0].id : null)
      return {
        event_id: owner.kind === 'event' ? owner.id : null,
        umbrella_id: owner.kind === 'umbrella' ? owner.id : null,
        // Prefixed so a model-proposed key can't collide with a manually
        // authored one (e.g. the Stage 3 DFFW seed set's "difc-*" keys).
        rule_key: `clarification-${ruleKeyRaw}`.slice(0, 200),
        rule_type: ruleType,
        pattern: patternStr,
        severity: s.severity === 'warning' ? 'warning' : 'error',
        message,
        source_clause: s.rationale ? String(s.rationale) : null,
        is_active: false,
        review_status: 'suggested',
        source_clarification_id: sourceClarificationId,
      }
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)

  if (rows.length === 0) return
  const { error } = await supabaseAdmin.from('event_validation_rules')
    .upsert(rows, { onConflict: owner.kind === 'event' ? 'event_id,rule_key' : 'umbrella_id,rule_key', ignoreDuplicates: true })
  if (error) console.error('Failed to insert suggested validation rules:', error)
}

let _gemini: GoogleGenerativeAI | null = null
function getGemini() {
  if (!_gemini) _gemini = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
  return _gemini
}

const ROUND_PROMPT = `You previously structured an event's topline messaging document and asked the uploader some clarifying questions about things you were unsure of. They've now answered this round. Your job now:

1. Fold each answer into the document's structured content. If the answer supplies specific wording (e.g. an exact protocol title, a corrected fact), add or update the relevant section so that wording is actually present verbatim — do not paraphrase an exact-wording answer. If the answer resolves a categorization question, correct that section's "kind"/"topic"/"confidence" accordingly.
2. Decide whether anything NEW needs asking — either because an answer itself raised a new question, or because resolving one thing surfaced another genuine gap. Use the same bar as before: a clarification must matter if answered wrong. Do not re-ask anything already answered. If nothing new meets the bar, return an empty "clarifications" array — that's the expected/good outcome once things are settled.
3. For EACH answer, decide whether it defines a checkable constraint on future GENERATED COPY, not just on this document. Most answers don't — a categorization choice or general narrative decision isn't checkable text. Only propose a rule when the answer states something a machine could mechanically verify in a piece of generated text later:
   - An exact required wording (a title, a name, a tagline) -> rule_type "required_format", pattern is a JSON string exactly like {"trigger":"<regex matching an attempt at this content>","allowed":["<the exact approved wording>"]}.
   - A term/phrase that must never appear, or must always be used a specific way -> rule_type "forbidden_term" (pattern is the literal banned word/phrase) or "forbidden_pattern" (pattern is a regex).
   Do NOT propose a rule for a categorization answer, a general-guidance answer, or anything not mechanically checkable in arbitrary future text. When in doubt, don't propose one — a wrong or overly broad suggestion costs a producer's review time for nothing.

Return a JSON object of EXACTLY this shape (same as the original extraction, plus "suggested_rules"):
{
  "sections": [ { "id": ..., "order": ..., "title": ..., "kind": "text"|"table"|"facts"|"rules", "topic": ..., "confidence": "high"|"medium"|"low", "content": ... } ],
  "default_fields": { ... same keys as given below, updated only if an answer changed one ... },
  "clarifications": [ { "question_key": ..., "question_text": ..., "context": ..., "section_id": ..., "options": [{"value":...,"label":...,"description":...}], "allows_other": true|false } ],
  "suggested_rules": [ { "rule_key": "kebab-case-slug", "rule_type": "required_format"|"forbidden_term"|"forbidden_pattern", "pattern": ..., "severity": "error"|"warning", "message": "what a reviewer sees when this fires", "source_clause": "e.g. this document's title, since it has no section number", "rationale": "one sentence: why this answer became a rule", "answered_question_key": "<the question_key whose answer this came from>" } ]
}
Include the FULL sections array and FULL default_fields object — every section, not just ones you changed. Only use information actually present in the document or in the answers given — never invent, infer, or embellish. Return JSON only, no commentary, no markdown fences.

ORIGINAL DOCUMENT TEXT:
`

type StructuredJson = { sections: Array<Record<string, unknown>>; default_fields?: Record<string, unknown> }

// Processes one round's worth of answered clarifications: asks Gemini to
// fold the answers into structured_json, then either stops (cap reached or
// nothing new to ask) or inserts the next round. Returns the number of new
// clarifications raised (0 = this doc's Q&A is done, at least for now).
export async function processAnsweredRound(docId: string): Promise<{ nextRound: number; newClarifications: number }> {
  const { data: doc, error: docErr } = await supabaseAdmin
    .from('event_messaging_docs')
    .select('id, event_id, umbrella_id, raw_text, structured_json, clarification_rounds_used')
    .eq('id', docId)
    .single()
  if (docErr || !doc) throw new Error('Messaging doc not found')
  const owner: ContentOwnerRef = doc.event_id ? { kind: 'event', id: doc.event_id } : { kind: 'umbrella', id: doc.umbrella_id }

  const { data: answered } = await supabaseAdmin
    .from('event_messaging_doc_clarifications')
    .select('id, question_key, question_text, options, answer_value, answer_note')
    .eq('doc_id', docId)
    .eq('round', doc.clarification_rounds_used)
    .eq('status', 'answered')

  const qaBlock = (answered ?? []).map(a => {
    const opts = (a.options ?? []) as ClarificationOption[]
    const chosen = opts.find(o => o.value === a.answer_value)
    const answerText = a.answer_value === 'other' || !chosen
      ? (a.answer_note ?? '(no answer given)')
      : `${chosen.label}${a.answer_note ? ` — ${a.answer_note}` : ''}`
    return `Q: ${a.question_text}\nA: ${answerText}`
  }).join('\n\n')

  const structured = doc.structured_json as StructuredJson | null
  const currentContent = JSON.stringify({ sections: structured?.sections ?? [], default_fields: structured?.default_fields ?? {} })

  const atCap = doc.clarification_rounds_used >= MAX_CLARIFICATION_ROUNDS

  const model = getGemini().getGenerativeModel({ model: 'gemini-2.5-flash' })
  const prompt = `${ROUND_PROMPT}${doc.raw_text ?? ''}\n\nCURRENT STRUCTURED CONTENT:\n${currentContent}\n\nQUESTIONS ASKED AND ANSWERS GIVEN THIS ROUND:\n${qaBlock}`
  const result = await model.generateContent([{ text: prompt }])
  const text = result.response.text().trim()
  const match = text.match(/\{[\s\S]*\}/)
  const parsed = match ? JSON.parse(match[0]) : null

  if (!parsed || !Array.isArray(parsed.sections)) {
    // Model failed to return usable JSON — leave structured_json untouched
    // rather than risk corrupting it; no new round either.
    console.error('Clarification round processing returned unusable output for doc', docId)
    return { nextRound: doc.clarification_rounds_used, newClarifications: 0 }
  }

  const now = new Date().toISOString()
  const sections = (parsed.sections as Array<Record<string, unknown>>).map(s => ({
    ...s,
    // Preserve manual-edit provenance if a producer already edited this
    // section before this round ran — don't let a clarification-round
    // rewrite silently clear a diverged_from_source flag.
    diverged_from_source: !!s.diverged_from_source,
    updated_at: s.updated_at ?? now,
  }))

  await supabaseAdmin.from('event_messaging_docs')
    .update({ structured_json: { sections, default_fields: parsed.default_fields ?? structured?.default_fields ?? {} }, updated_at: now })
    .eq('id', docId)

  // Clarification-to-validation-rule bridge (2026-09-10, agreed after
  // Stage 4) — never auto-activated, see insertSuggestedRules() below.
  await insertSuggestedRules(owner, parsed.suggested_rules, answered ?? [])

  if (atCap) return { nextRound: doc.clarification_rounds_used, newClarifications: 0 }

  const nextRound = doc.clarification_rounds_used + 1
  const inserted = await insertClarificationRound(docId, nextRound, parsed.clarifications)
  if (inserted > 0) {
    await supabaseAdmin.from('event_messaging_docs').update({ clarification_rounds_used: nextRound }).eq('id', docId)
  }
  return { nextRound: inserted > 0 ? nextRound : doc.clarification_rounds_used, newClarifications: inserted }
}
