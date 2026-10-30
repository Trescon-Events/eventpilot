/* Doc edits that flag affected rules (docs/build_suggestions/doc-rule-linkage-and-canonical-names.md, Part A).
   When a live doc's section is edited, `changedPhrases` says which phrases went away (and what replaced them), and `affectedRules` says which validation
   rules mention a phrase that went away. Pure — no database, no model. A rule is only ever SUGGESTED a new value here; a person applies it. */

export type PhrasePair = { removed: string; added: string }

/** Text of a section's content for diffing: a string as it is; a table/facts structure as its string values, one per line. */
export function contentText(content: unknown): string {
  if (typeof content === 'string') return content
  const out: string[] = []
  const walk = (v: unknown) => {
    if (typeof v === 'string') out.push(v)
    else if (Array.isArray(v)) v.forEach(walk)
    else if (v && typeof v === 'object') Object.values(v).forEach(walk)
  }
  walk(content)
  return out.join('\n')
}

const EDGE_PUNCT = /^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu
const tidy = (s: string) => s.replace(EDGE_PUNCT, '').trim()
const letters = (s: string) => s.replace(/[^\p{L}\p{N}]+/gu, '').toLowerCase()

/** Word-level LCS diff. Each contiguous removed run is paired with the added run next to it (empty `added` for a pure deletion). Runs under 4 characters
    and changes that are only punctuation/spacing are ignored. When a run swaps the same number of words, each changed word is also emitted on its own, so a
    rule that mentions one word of a longer name is still found. */
export function changedPhrases(oldText: string, newText: string): PhrasePair[] {
  const a = oldText.split(/\s+/).filter(Boolean), b = newText.split(/\s+/).filter(Boolean)
  const n = a.length, m = b.length
  if (n * m > 4_000_000) return []   // an enormous section: skip rather than stall the request
  const lcs: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1))
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1])

  const runs: { rem: string[]; add: string[] }[] = []
  let i = 0, j = 0, cur: { rem: string[]; add: string[] } | null = null
  const flush = () => { if (cur && (cur.rem.length || cur.add.length)) runs.push(cur); cur = null }
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) { flush(); i++; j++; continue }
    cur ??= { rem: [], add: [] }
    if (j >= m || (i < n && lcs[i + 1][j] >= lcs[i][j + 1])) cur.rem.push(a[i++])
    else cur.add.push(b[j++])
  }
  flush()

  const out: PhrasePair[] = []
  const seen = new Set<string>()
  const push = (removed: string, added: string) => {
    removed = tidy(removed); added = tidy(added)
    if (removed.length < 4 || letters(removed) === letters(added)) return
    const key = `${removed}\u0000${added}`
    if (seen.has(key)) return
    seen.add(key); out.push({ removed, added })
  }
  for (const r of runs) {
    if (!r.rem.length) continue
    push(r.rem.join(' '), r.add.join(' '))
    if (r.rem.length > 1 && r.rem.length === r.add.length) r.rem.forEach((w, k) => { if (w !== r.add[k]) push(w, r.add[k]) })
  }
  return out
}

export type RuleLike = { id: string; rule_key: string; rule_type: string; pattern: string; message: string; level: string; is_active?: boolean }
export type AffectedRule = {
  rule_id: string; rule_key: string; level: string; can_edit: boolean; is_active: boolean
  field: 'pattern' | 'message'; removed: string; added: string
  current: string; suggested: string
  /** Same value as `suggested`, named for the field it replaces (the PATCH body). */
  suggested_pattern: string | null; suggested_message: string | null
}

const escapeRegexLiteral = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const replaceAllCI = (text: string, find: string, withText: string) => text.replace(new RegExp(escapeRegexLiteral(find), 'gi'), () => withText)
const includesCI = (text: string, find: string) => text.toLowerCase().includes(find.toLowerCase())

/** Replaces string leaves inside decoded JSON; returns null when nothing changed. */
function replaceInJson(value: unknown, pairs: PhrasePair[]): { value: unknown; changed: boolean } {
  if (typeof value === 'string') {
    let v = value
    for (const p of pairs) if (includesCI(v, p.removed)) v = replaceAllCI(v, p.removed, p.added)
    return { value: v, changed: v !== value }
  }
  if (Array.isArray(value)) { const r = value.map(x => replaceInJson(x, pairs)); return { value: r.map(x => x.value), changed: r.some(x => x.changed) } }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value).map(([k, v]) => [k, replaceInJson(v, pairs)] as const)
    return { value: Object.fromEntries(entries.map(([k, r]) => [k, r.value])), changed: entries.some(([, r]) => r.changed) }
  }
  return { value, changed: false }
}

const stringLeaves = (v: unknown): string[] => typeof v === 'string' ? [v] : Array.isArray(v) ? v.flatMap(stringLeaves) : v && typeof v === 'object' ? Object.values(v).flatMap(stringLeaves) : []
const JSON_TYPES = new Set(['required_format', 'proximity', 'canonical_name'])

/** The rules that mention text an edit removed. One entry per rule and field: the rule's `pattern` (JSON types are decoded, so `canonical`, `trigger`, `allowed[]`,
    `a`, `b` are all searched) and its `message`. A pattern written as a regex is also found when the text is regex-escaped in it (`Dr\.` for `Dr.`). */
export function affectedRules(rules: (RuleLike & { can_edit?: boolean })[], pairs: PhrasePair[]): AffectedRule[] {
  const out: AffectedRule[] = []
  const longestFirst = [...pairs].sort((x, y) => y.removed.length - x.removed.length)
  for (const rule of rules) {
    const canEdit = rule.can_edit === true
    // pattern
    let hit: PhrasePair[] = []
    let suggestedPattern: string | null = null
    if (JSON_TYPES.has(rule.rule_type)) {
      let decoded: unknown = null
      try { decoded = JSON.parse(rule.pattern) } catch { /* a broken pattern is searched as plain text below */ }
      if (decoded !== null) {
        const leaves = stringLeaves(decoded)
        hit = longestFirst.filter(p => leaves.some(l => includesCI(l, p.removed)))
        if (hit.length) suggestedPattern = JSON.stringify(replaceInJson(decoded, hit).value)
      }
    }
    if (!hit.length && suggestedPattern === null) {
      hit = longestFirst.filter(p => includesCI(rule.pattern, p.removed))
      if (hit.length) { let v = rule.pattern; for (const p of hit) v = replaceAllCI(v, p.removed, p.added); suggestedPattern = v }
      else if (rule.rule_type !== 'forbidden_term') {
        // regex-escaped spelling of the phrase (Dr\. Sharan…): replace the escaped form with the escaped new text
        const esc = longestFirst.filter(p => includesCI(rule.pattern, escapeRegexLiteral(p.removed)))
        if (esc.length) { hit = esc; let v = rule.pattern; for (const p of esc) v = replaceAllCI(v, escapeRegexLiteral(p.removed), escapeRegexLiteral(p.added)); suggestedPattern = v }
      }
    }
    if (hit.length && suggestedPattern !== null) {
      const first = hit[0]
      out.push({ rule_id: rule.id, rule_key: rule.rule_key, level: rule.level, can_edit: canEdit, is_active: rule.is_active !== false, field: 'pattern', removed: first.removed, added: first.added, current: rule.pattern, suggested: suggestedPattern, suggested_pattern: suggestedPattern, suggested_message: null })
    }
    // message
    const mhit = longestFirst.filter(p => includesCI(rule.message, p.removed))
    if (mhit.length) {
      let v = rule.message; for (const p of mhit) v = replaceAllCI(v, p.removed, p.added)
      out.push({ rule_id: rule.id, rule_key: rule.rule_key, level: rule.level, can_edit: canEdit, is_active: rule.is_active !== false, field: 'message', removed: mhit[0].removed, added: mhit[0].added, current: rule.message, suggested: v, suggested_pattern: null, suggested_message: v })
    }
  }
  return out
}
