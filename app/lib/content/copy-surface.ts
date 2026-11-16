import { rulesForSurface, validateText, type Surface, type ValidationFinding, type ValidationRule } from './validate'

/* Which kind of text a Copy Library item is, for rule scopes (16 Nov 2026, Madhu). Long-form items skip rules scoped 'social' (royal protocol and patronage wording belong in
   long-form material); everything else is checked against every rule that applies to social copy, exactly as before. */
const LONG_FORM_KEYS = new Set(['press_release_ending', 'organiser_line', 'recap', 'youtube_footer', 'konfhub_description'])

export function surfaceOf(assetKey: string, length: string): Surface {
  if (LONG_FORM_KEYS.has(assetKey)) return 'long_form'
  if (assetKey === 'about_event' && (length === 'medium' || length === 'long')) return 'long_form'
  if (assetKey === 'figures_block' && length === 'long') return 'long_form'
  return 'social'
}

/** What a draft breaks in the event's rules, error level only (warnings never trigger a rewrite): the rules that apply to this item's kind of text. */
export function ruleErrorsFor(rules: ValidationRule[] | undefined, key: string, d: { length: string; text: string }): ValidationFinding[] {
  const applicable = rulesForSurface(rules ?? [], surfaceOf(key, d.length))
  return applicable.length ? validateText(d.text, applicable).filter(f => f.severity === 'error') : []
}

/** The lines added to the prompt for the one rewrite: each distinct rule breach, what was found and (when the rule has one) the exact fix. */
export function ruleFeedback(d: { length: string; phase: string }, f: ValidationFinding[]): string[] {
  const seen = new Set<string>()
  return f.filter(x => { const k = `${x.rule_key}|${x.match}`; if (seen.has(k)) return false; seen.add(k); return true }).slice(0, 6)
    .map(x => `The ${d.length}/${d.phase} text breaks a rule: ${x.message} Found: "${x.match}".${x.suggested_fix ? ` Use: ${x.suggested_fix}.` : ''} Rewrite so it does not.`)
}
