import { validateText, type RuleType, type ValidationRule } from './validate'

/* Rules screen (2026-10-15, docs/build_suggestions/rules-screen-and-trescon-layer.md Part 3) — checks a rule BEFORE it is saved.
   Pure: no DB. Errors block the save; warnings need the person to acknowledge ("Save anyway"). */

export const RULE_TYPES: RuleType[] = ['forbidden_term', 'forbidden_pattern', 'required_format', 'proximity', 'canonical_name']

export type RuleDraft = { rule_type: string; pattern: string; severity?: string; message?: string; rule_key?: string }
export type RuleCheck = { errors: string[]; warnings: string[] }

// An inline flag group such as (?i) or (?i:...) — JavaScript regexes do not take them, and a case-insensitive intent belongs in the rule TYPE.
const INLINE_FLAG = /\(\?[a-zA-Z]+(?:-[a-zA-Z]+)?[:)]/

const FLAG_HINT = 'Inline flags like (?i) are not supported. A forbidden_term rule is already case-insensitive; a forbidden_pattern rule is case-sensitive as written (write [Ff]intech to allow both cases).'

function checkRegex(label: string, source: unknown, out: RuleCheck) {
  if (typeof source !== 'string' || !source) { out.errors.push(`${label} is required.`); return }
  if (INLINE_FLAG.test(source)) { out.errors.push(`${label}: ${FLAG_HINT}`); return }
  let re: RegExp
  try { re = new RegExp(source) } catch (e) { out.errors.push(`${label} is not a valid regular expression: ${e instanceof Error ? e.message : String(e)}`); return }
  if (re.test('')) out.warnings.push(`${label} matches the empty string, so it would flag every piece of text.`)
}

/** Structural check of the pattern for the rule type (no database, no fixed lines). */
export function checkRuleShape(draft: RuleDraft): RuleCheck {
  const out: RuleCheck = { errors: [], warnings: [] }
  if (!RULE_TYPES.includes(draft.rule_type as RuleType)) { out.errors.push('Pick a rule type.'); return out }
  const pattern = draft.pattern ?? ''
  if (!pattern.trim()) { out.errors.push('The pattern is required.'); return out }

  switch (draft.rule_type as RuleType) {
    case 'forbidden_term':
      // Matched as an escaped literal, so it cannot be an invalid regex.
      break
    case 'forbidden_pattern':
      checkRegex('Pattern', pattern, out)
      break
    case 'required_format': {
      let cfg: { trigger?: unknown; allowed?: unknown }
      try { cfg = JSON.parse(pattern) } catch { out.errors.push('A required_format pattern is JSON: {"trigger":"…","allowed":["exact form"]}.'); break }
      checkRegex('Trigger', cfg.trigger, out)
      if (!Array.isArray(cfg.allowed) || cfg.allowed.length === 0 || cfg.allowed.some(a => typeof a !== 'string' || !a)) out.errors.push('"allowed" must list at least one exact string.')
      break
    }
    case 'proximity': {
      let cfg: { a?: unknown; b?: unknown; maxDistance?: unknown }
      try { cfg = JSON.parse(pattern) } catch { out.errors.push('A proximity pattern is JSON: {"a":"…","b":"…","maxDistance":40}.'); break }
      checkRegex('Pattern a', cfg.a, out)
      checkRegex('Pattern b', cfg.b, out)
      if (typeof cfg.maxDistance !== 'number' || !(cfg.maxDistance > 0)) out.errors.push('"maxDistance" must be a positive number of characters.')
      break
    }
    case 'canonical_name': {
      let cfg: { canonical?: unknown; loose?: unknown }
      try { cfg = JSON.parse(pattern) } catch { out.errors.push('A canonical_name pattern is JSON: {"canonical":"Approved Name","loose":"regex that catches any attempt"}.'); break }
      if (typeof cfg.canonical !== 'string' || !cfg.canonical.trim()) out.errors.push('The approved form ("canonical") is required.')
      const before = out.errors.length
      checkRegex('Also catch', cfg.loose, out)
      if (out.errors.length === before && typeof cfg.canonical === 'string' && cfg.canonical.trim() && typeof cfg.loose === 'string') {
        // A catch pattern that does not match the approved form could never pass correct text: the rule would flag nothing it should, or miss its own name.
        if (!new RegExp(cfg.loose).test(cfg.canonical)) out.errors.push('"Also catch" does not match the approved form itself, so the rule could never recognise correct text. It must match the approved name.')
        else if (cfg.loose.length < 5) out.warnings.push('"Also catch" is very short, so it may flag unrelated words. Make it more specific if you can.')
      }
      break
    }
  }
  return out
}

/**
 * Full check: shape, plus a warning when the rule already matches the event's fixed lines (date, venue, attribution, CTA, hashtag).
 * A rule that fires on every post is almost certainly wrong.
 */
export function checkRuleDraft(draft: RuleDraft, fixedTexts: string[]): RuleCheck {
  const out = checkRuleShape(draft)
  if (out.errors.length > 0) return out
  const rule: ValidationRule = {
    rule_key: draft.rule_key || 'draft', rule_type: draft.rule_type as RuleType, pattern: draft.pattern,
    severity: draft.severity === 'warning' ? 'warning' : 'error', message: draft.message || '', source_clause: null,
  }
  const hits = new Set<string>()
  for (const t of fixedTexts) {
    if (!t) continue
    for (const f of validateText(t, [rule])) hits.add(f.match)
  }
  if (hits.size > 0) out.warnings.push(`This rule already matches the event's fixed lines (${[...hits].slice(0, 3).map(h => `"${h}"`).join(', ')}) — it would fire on every post. Check the pattern.`)
  return out
}
