import type { NextRequest } from 'next/server'
import { ownerOfRow } from './owner'
import { loadRulesView } from './rules-view'
import { affectedRules, changedPhrases, contentText, type AffectedRule } from './edit-diff'

/* Part A of docs/build_suggestions/doc-rule-linkage-and-canonical-names.md — for a LIVE doc's section edit, which of the rules in force for that doc's owner (event, umbrella,
   Trescon-wide: the set GET /api/events/validation-rules returns) mention text the edit removes or replaces. Read-only: nothing here changes a rule. Never throws — a failure
   here must not block an edit or its proposal; it just shows no suggestions. */
export async function affectedRulesForEdit(
  req: NextRequest, doc: { event_id: string | null; umbrella_id: string | null; org_scope: string | null },
  oldContent: unknown, newContent: unknown,
): Promise<AffectedRule[]> {
  try {
    const pairs = changedPhrases(contentText(oldContent), contentText(newContent))
    if (!pairs.length) return []
    const view = await loadRulesView(req, ownerOfRow(doc))
    if (!view) return []
    const rules = view.levels.flatMap(l => l.rules.filter(r => !r.disabled_by).map(r => ({ ...r, can_edit: l.can_edit })))
    return affectedRules(rules, pairs)
  } catch (e) {
    console.error('affected rules lookup failed:', e instanceof Error ? e.message : e)
    return []
  }
}
