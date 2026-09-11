/* Reference Documents spec, Stage 3 (2026-09-10) — deterministic content
   validation. Pure and synchronous, no model call — this is mechanical
   pattern matching, not judgement. "Implied privileged access, guaranteed
   outcomes, unsupported statistics, generic promotional fluff" are
   explicitly out of scope for this build (see the spec's Stage 3 section);
   this library only catches what a regex/keyword genuinely can.

   `pattern` shape depends on `rule_type`:
   - forbidden_term:    a literal word/phrase, matched case-insensitively
                         with word boundaries (e.g. "transformative").
   - forbidden_pattern: a regex string, matched case-SENSITIVELY as written
                         (e.g. "\\bfintech\\b" to catch lowercase but not
                         "FinTech" — case-sensitivity is the point of this
                         type, not an omission).
   - required_format:   a JSON-encoded {trigger, allowed} — trigger is a
                         regex matching an ATTEMPT at the constrained
                         content (e.g. any mention of "Sheikh Maktoum" or
                         "Connecting Markets"); allowed is the list of
                         exact strings that make the attempt correct. If
                         the trigger matches anywhere but NONE of the
                         allowed exact strings appear anywhere in the same
                         text, every trigger occurrence is flagged. This
                         is a document-wide check, not a per-sentence one —
                         it doesn't verify the trigger and the allowed
                         string are the same instance, just that a correct
                         form exists somewhere if an attempt was made.
   - proximity:         a JSON-encoded {a, b, maxDistance} — two regexes;
                         flagged when a match of `a` and a match of `b`
                         occur within `maxDistance` characters of each
                         other anywhere in the text. */

export type RuleType = 'forbidden_term' | 'forbidden_pattern' | 'required_format' | 'proximity'
export type Severity = 'error' | 'warning'

export type ValidationRule = {
  rule_key: string
  rule_type: RuleType
  pattern: string
  severity: Severity
  message: string
  source_clause: string | null
}

export type ValidationFinding = {
  rule_key: string
  severity: Severity
  message: string
  source_clause: string | null
  match: string
  offset: number
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function safeRegex(pattern: string, flags: string): RegExp | null {
  try { return new RegExp(pattern, flags) } catch { return null }
}

function collectMatches(re: RegExp, text: string, rule: ValidationRule): ValidationFinding[] {
  const out: ValidationFinding[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    out.push({ rule_key: rule.rule_key, severity: rule.severity, message: rule.message, source_clause: rule.source_clause, match: m[0], offset: m.index })
    if (m[0].length === 0) re.lastIndex++ // never loop forever on a zero-width match
  }
  return out
}

function checkForbiddenTerm(text: string, rule: ValidationRule): ValidationFinding[] {
  const re = safeRegex(`\\b${escapeRegex(rule.pattern)}\\b`, 'gi')
  return re ? collectMatches(re, text, rule) : []
}

function checkForbiddenPattern(text: string, rule: ValidationRule): ValidationFinding[] {
  const re = safeRegex(rule.pattern, 'g')
  return re ? collectMatches(re, text, rule) : []
}

function checkRequiredFormat(text: string, rule: ValidationRule): ValidationFinding[] {
  let config: { trigger: string; allowed: string[] }
  try { config = JSON.parse(rule.pattern) } catch { return [] }
  const triggerRe = safeRegex(config.trigger, 'gi')
  if (!triggerRe) return []
  const hasAllowedForm = (config.allowed ?? []).length > 0 && config.allowed.some(a => text.includes(a))
  if (hasAllowedForm) return []
  return collectMatches(triggerRe, text, rule)
}

function checkProximity(text: string, rule: ValidationRule): ValidationFinding[] {
  let config: { a: string; b: string; maxDistance: number }
  try { config = JSON.parse(rule.pattern) } catch { return [] }
  const reA = safeRegex(config.a, 'gi')
  const reB = safeRegex(config.b, 'gi')
  if (!reA || !reB) return []
  const matchesA = [...text.matchAll(reA)]
  const matchesB = [...text.matchAll(reB)]
  const out: ValidationFinding[] = []
  for (const ma of matchesA) {
    const nearby = matchesB.find(mb => Math.abs((mb.index ?? 0) - (ma.index ?? 0)) <= config.maxDistance)
    if (nearby) {
      out.push({ rule_key: rule.rule_key, severity: rule.severity, message: rule.message, source_clause: rule.source_clause, match: `${ma[0]} … ${nearby[0]}`, offset: Math.min(ma.index ?? 0, nearby.index ?? 0) })
    }
  }
  return out
}

export function validateText(text: string, rules: ValidationRule[]): ValidationFinding[] {
  if (!text) return []
  const findings: ValidationFinding[] = []
  for (const rule of rules) {
    switch (rule.rule_type) {
      case 'forbidden_term':    findings.push(...checkForbiddenTerm(text, rule)); break
      case 'forbidden_pattern': findings.push(...checkForbiddenPattern(text, rule)); break
      case 'required_format':   findings.push(...checkRequiredFormat(text, rule)); break
      case 'proximity':         findings.push(...checkProximity(text, rule)); break
    }
  }
  return findings.sort((a, b) => a.offset - b.offset)
}
