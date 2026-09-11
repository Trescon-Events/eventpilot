import { supabaseAdmin } from '@/app/lib/supabase'
import { resolveEffectiveDocs, getChildEventIds, type MessagingDocRow } from './resolve-reference-docs'
import type { ContentOwnerRef } from './owner'

/* Reference Documents spec, Stage 2 (2026-09-10) — compile.

   Merges an event's effective document set (see resolve-reference-docs.ts)
   into one materialised event_compiled_reference row. Nothing is ever
   silently dropped: every section from every live source document is
   included, tagged with its own source_doc_id/title/role/authority_rank/
   provenance/diverged_from_source, so a downstream consumer (Stage 3
   validation, Stage 4 generation prompt) can see exactly where a statement
   came from and how much authority it carries. Only BYTE-IDENTICAL
   duplicate "rules" sections (the same guidance re-appearing verbatim from
   two documents) are collapsed, keeping the higher-rank copy.

   Conflicts are a SEPARATE, additive signal, not a deletion mechanism: for
   "facts" and "rules" sections, atomic statements (one fact, one rule
   bullet line) from DIFFERENT source documents are compared pairwise. A
   normalized-identical pair is a duplicate (fine, expected — the same
   guidance stated twice). A pair that shares significant word overlap
   (Jaccard similarity over a threshold) but ISN'T identical is flagged as
   a conflict — the higher-authority_rank statement is recorded as the
   "winner" and the other as the "loser", but neither is removed from
   `sections`; a human decides what to do about a flagged conflict, this
   never resolves it for them.

   This is a mechanical, keyword-overlap heuristic, not semantic
   understanding — it will produce false positives (two related-but-
   compatible statements) and false negatives (two contradictory statements
   phrased with no shared vocabulary). It has not been tuned against real
   DFFW documents because none exist in EventPilot yet as of this build
   (verified: event_messaging_docs has zero DFFW-related rows) — revisit
   the threshold once the real style guide + DFS reference are uploaded. */

type SectionKind = 'text' | 'table' | 'facts' | 'rules'
type SourceSection = {
  id: string; order: number; title: string; kind: SectionKind; content: unknown
  diverged_from_source?: boolean
}

export type CompiledSection = SourceSection & {
  source_doc_id: string
  source_doc_title: string
  role: MessagingDocRow['role']
  authority_rank: number
  provenance: MessagingDocRow['provenance']
  diverged_from_source: boolean
}

export type ConflictSide = {
  doc_id: string; doc_title: string; role: MessagingDocRow['role']; authority_rank: number; text: string
}
export type ConflictFlag = {
  kind: 'facts' | 'rules'
  winner: ConflictSide
  loser: ConflictSide
  similarity: number
}

const ROLE_ORDER: Record<MessagingDocRow['role'], number> = { style_guide: 0, messaging: 1, production_pack: 2 }

function sortDocs(docs: MessagingDocRow[]): MessagingDocRow[] {
  return [...docs].sort((a, b) =>
    a.authority_rank - b.authority_rank ||
    ROLE_ORDER[a.role] - ROLE_ORDER[b.role] ||
    a.created_at.localeCompare(b.created_at)
  )
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/\*\*/g, '').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
}

const STOPWORDS = new Set(['the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'on', 'for', 'is', 'be', 'as', 'must', 'not', 'this', 'that', 'with', 'at'])

function significantTokens(s: string): Set<string> {
  return new Set(normalize(s).split(' ').filter(w => w.length > 2 && !STOPWORDS.has(w)))
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  let intersection = 0
  for (const t of a) if (b.has(t)) intersection++
  const union = a.size + b.size - intersection
  return union === 0 ? 0 : intersection / union
}

// Splits "rules"/"text"-kind markdown-lite content into atomic bullet-line
// statements — same format STRUCTURE_PROMPT documents (only **bold** and
// "- " bullets). Non-bullet prose lines are skipped; a "rules" section is
// expected to be almost entirely bullets per that prompt.
function bulletAtoms(content: unknown): string[] {
  const text = typeof content === 'string' ? content : ''
  return text.split('\n').map(l => l.trim()).filter(l => l.startsWith('- ') || l.startsWith('• ')).map(l => l.replace(/^[-•]\s*/, '').trim()).filter(Boolean)
}

// Rules: two bullet lines are flagged as a potential conflict if they're
// NOT near-identical but either (a) share enough overall vocabulary
// (Jaccard), or (b) share at least one long/distinctive word — a single
// rare shared term like "transformative" is a much stronger same-subject
// signal in a short sentence than overall word-overlap percentage
// captures. Looser than a single Jaccard cutoff on purpose: per the
// non-negotiable, a false positive (human glances, dismisses) is far
// cheaper than a false negative (a real conflict never surfaced).
const RULES_JACCARD_THRESHOLD = 0.35
const DISTINCTIVE_TOKEN_MIN_LENGTH = 8

function rulesLikelyConflict(a: Set<string>, b: Set<string>): { conflict: boolean; similarity: number } {
  const similarity = jaccard(a, b)
  if (similarity >= 0.999) return { conflict: false, similarity } // identical — a duplicate, not a conflict
  if (similarity >= RULES_JACCARD_THRESHOLD) return { conflict: true, similarity }
  for (const t of a) {
    if (t.length >= DISTINCTIVE_TOKEN_MIN_LENGTH && b.has(t)) return { conflict: true, similarity }
  }
  return { conflict: false, similarity }
}

export async function compileEventReference(eventId: string): Promise<{ version: number; conflicts: number }> {
  // Always a real event — event_compiled_reference is only ever
  // materialised per event (see the umbrella/event separation migration's
  // comment on why it deliberately doesn't need an umbrella_id column: an
  // umbrella's own live docs are already included via the resolver below
  // whenever a CHILD event compiles, so there's nothing to read by
  // compiling "the umbrella itself").
  const rawDocs = await resolveEffectiveDocs({ kind: 'event', id: eventId })
  const docs = sortDocs(rawDocs)

  const sections: CompiledSection[] = []
  const conflicts: ConflictFlag[] = []

  // Exact-duplicate "rules" section dedup — compares each new section's
  // normalized full content against ones already kept from a
  // higher-or-equal-ranked (already-processed) document.
  const seenRulesContent = new Set<string>()

  // Rules atoms seen so far, in rank order (so the first match is always
  // the higher-authority side).
  const seenRuleAtoms: Array<{ docId: string; docTitle: string; role: MessagingDocRow['role']; rank: number; text: string; tokens: Set<string> }> = []
  // Facts seen so far, keyed by normalized `fact` label — matched
  // EXACTLY on the label (facts are short, deliberate labels like
  // "Attendance", not prose), then compared on `detail`: any difference
  // in detail for the same labeled fact is a real conflict, no threshold.
  const seenFactsByKey = new Map<string, { docId: string; docTitle: string; role: MessagingDocRow['role']; rank: number; fact: string; detail: string }>()

  for (const doc of docs) {
    const docSections = (doc.structured_json?.sections ?? []) as SourceSection[]
    for (const s of docSections) {
      if (s.kind === 'rules') {
        const key = normalize(typeof s.content === 'string' ? s.content : JSON.stringify(s.content))
        if (seenRulesContent.has(key)) continue // exact duplicate of an already-kept, equal-or-higher-ranked section
        seenRulesContent.add(key)
      }

      sections.push({
        ...s,
        diverged_from_source: !!s.diverged_from_source,
        source_doc_id: doc.id,
        source_doc_title: doc.title,
        role: doc.role,
        authority_rank: doc.authority_rank,
        provenance: doc.provenance,
      })

      if (s.kind === 'rules') {
        for (const atomText of bulletAtoms(s.content)) {
          const tokens = significantTokens(atomText)
          for (const prior of seenRuleAtoms) {
            if (prior.docId === doc.id) continue
            const { conflict, similarity } = rulesLikelyConflict(tokens, prior.tokens)
            if (conflict) {
              conflicts.push({
                kind: 'rules',
                winner: { doc_id: prior.docId, doc_title: prior.docTitle, role: prior.role, authority_rank: prior.rank, text: prior.text },
                loser: { doc_id: doc.id, doc_title: doc.title, role: doc.role, authority_rank: doc.authority_rank, text: atomText },
                similarity: Math.round(similarity * 100) / 100,
              })
            }
          }
          seenRuleAtoms.push({ docId: doc.id, docTitle: doc.title, role: doc.role, rank: doc.authority_rank, text: atomText, tokens })
        }
      } else if (s.kind === 'facts' && Array.isArray(s.content)) {
        for (const f of s.content as Array<{ fact?: string; detail?: string }>) {
          if (!f.fact) continue
          const key = normalize(f.fact)
          const detail = normalize(f.detail ?? '')
          const prior = seenFactsByKey.get(key)
          if (prior && prior.docId !== doc.id) {
            if (prior.detail !== detail) {
              conflicts.push({
                kind: 'facts',
                winner: { doc_id: prior.docId, doc_title: prior.docTitle, role: prior.role, authority_rank: prior.rank, text: `${prior.fact}: ${prior.detail}` },
                loser: { doc_id: doc.id, doc_title: doc.title, role: doc.role, authority_rank: doc.authority_rank, text: `${f.fact}: ${f.detail ?? ''}` },
                similarity: 1, // same fact label, different detail — not a fuzzy match, a direct contradiction
              })
            }
            continue // keep the higher-rank (already-seen) fact as the key's entry either way
          }
          if (!prior) seenFactsByKey.set(key, { docId: doc.id, docTitle: doc.title, role: doc.role, rank: doc.authority_rank, fact: f.fact, detail })
        }
      }
    }
  }

  const { data: existing } = await supabaseAdmin
    .from('event_compiled_reference').select('version').eq('event_id', eventId).order('version', { ascending: false }).limit(1).maybeSingle()
  const nextVersion = (existing?.version ?? 0) + 1

  const { error } = await supabaseAdmin.from('event_compiled_reference').insert({
    event_id: eventId,
    version: nextVersion,
    source_doc_ids: docs.map(d => d.id),
    sections,
    conflicts,
  })
  if (error) throw new Error(`Compile failed for event ${eventId}: ${error.message}`)

  return { version: nextVersion, conflicts: conflicts.length }
}

// Recompiles whatever needs it after a document's live status changes.
// For a real event's own document: just that event (events have no
// children). For an umbrella-level document: every child event, since a
// single umbrella-level approval changes every child's effective document
// set at once — the umbrella itself is never compiled (see
// compileEventReference's comment). Called from the approve route and
// from the version-history "Make live" PATCH path, best-effort (a compile
// failure shouldn't block the doc-status change that triggered it).
export async function recompileEventAndChildren(owner: ContentOwnerRef): Promise<void> {
  const targets = owner.kind === 'event' ? [owner.id] : await getChildEventIds(owner.id)
  await Promise.all(targets.map(id => compileEventReference(id).catch(e => console.error(`Recompile failed for event ${id}:`, e))))
}

export async function getLatestCompiledReference(eventId: string) {
  const { data } = await supabaseAdmin
    .from('event_compiled_reference').select('*').eq('event_id', eventId).order('version', { ascending: false }).limit(1).maybeSingle()
  return data
}
