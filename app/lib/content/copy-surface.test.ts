import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ruleErrorsFor, ruleFeedback, surfaceOf } from './copy-surface'
import { COPY_CATALOGUE } from './copy-catalogue'
import { rulesForSurface, type ValidationRule } from './validate'

test('long-form items', () => {
  for (const [k, l] of [['press_release_ending', 'n/a'], ['organiser_line', 'long'], ['organiser_line', 'short'], ['recap', 'medium'], ['youtube_footer', 'n/a'], ['konfhub_description', 'long'], ['about_event', 'medium'], ['about_event', 'long'], ['figures_block', 'long']]) assert.equal(surfaceOf(k, l), 'long_form', `${k}/${l}`)
})
test('everything else stays on the social surface, so it is checked exactly as before', () => {
  for (const [k, l] of [['about_event', 'one_liner'], ['about_event', 'short'], ['figures_block', 'short'], ['cta', 'n/a'], ['attribution_line', 'n/a'], ['social_signoff', 'n/a'], ['programme_highlights', 'short'], ['approved_quotes', 'n/a']]) assert.equal(surfaceOf(k, l), 'social', `${k}/${l}`)
})
test('every catalogue variant has a surface', () => {
  for (const e of COPY_CATALOGUE) for (const v of e.variants) assert.ok(['social', 'long_form'].includes(surfaceOf(e.key, v.length)))
})
const r = (k: string, scope?: ValidationRule['scope']): ValidationRule => ({ rule_key: k, rule_type: 'forbidden_term', pattern: 'x', severity: 'error', message: '', source_clause: null, ...(scope ? { scope } : {}) })
test('rulesForSurface: no scope and all apply everywhere; social and long_form only to their own surface', () => {
  const rules = [r('none'), r('all', 'all'), r('soc', 'social'), r('long', 'long_form')]
  assert.deepEqual(rulesForSurface(rules, 'social').map(x => x.rule_key), ['none', 'all', 'soc'])
  assert.deepEqual(rulesForSurface(rules, 'long_form').map(x => x.rule_key), ['none', 'all', 'long'])
})

const royal: ValidationRule = { rule_key: 'no-royal', rule_type: 'forbidden_pattern', pattern: '\\b(Sheikh Maktoum|H\\.H\\.)', severity: 'error', message: 'Royal reference in announcement copy.', source_clause: null, scope: 'social' }
const dash: ValidationRule = { rule_key: 'no-em-dash', rule_type: 'forbidden_pattern', pattern: '\u2014', severity: 'error', message: 'No em dashes.', source_clause: null, scope: 'all' }
const warn: ValidationRule = { rule_key: 'warn', rule_type: 'forbidden_term', pattern: 'premier', severity: 'warning', message: 'Ranking claim.', source_clause: null }
const text = 'Held under the patronage of H.H. Sheikh Maktoum \u2014 the premier summit.'
test('a long-form item skips social-only rules but keeps rules for all copy; a social item gets both; warnings never count', () => {
  const rules = [royal, dash, warn]
  assert.deepEqual(ruleErrorsFor(rules, 'organiser_line', { length: 'long', text }).map(f => f.rule_key), ['no-em-dash'])
  assert.deepEqual([...new Set(ruleErrorsFor(rules, 'about_event', { length: 'short', text }).map(f => f.rule_key))].sort(), ['no-em-dash', 'no-royal'])
  assert.deepEqual(ruleErrorsFor(rules, 'about_event', { length: 'long', text }).map(f => f.rule_key), ['no-em-dash'])
  assert.deepEqual(ruleErrorsFor(undefined, 'cta', { length: 'n/a', text }), [])
})
test('rewrite feedback names each distinct breach once and carries the fix when the rule has one', () => {
  const f = ruleErrorsFor([royal, dash], 'cta', { length: 'n/a', text: text + ' H.H. again' })
  const lines = ruleFeedback({ length: 'n/a', phase: 'any' }, f)
  assert.equal(lines.filter(l => l.includes('Royal reference')).length, 2)   // "H.H." and "Sheikh Maktoum" are two different matches
  assert.ok(lines.every(l => l.startsWith('The n/a/any text breaks a rule:')))
  assert.equal(ruleFeedback({ length: 'n/a', phase: 'any' }, [{ ...f[0], suggested_fix: 'the Summit' }])[0].includes('Use: the Summit.'), true)
})
