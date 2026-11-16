import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateText, type ValidationRule } from './validate'
import { PATRONAGE_ATTACHED_MESSAGE, PATRONAGE_ATTACHED_PATTERN } from './dfs-patronage-rule'

const rule: ValidationRule = { rule_key: 'difc-patronage-wrong-event', rule_type: 'forbidden_pattern', pattern: PATRONAGE_ATTACHED_PATTERN, severity: 'error', message: PATRONAGE_ATTACHED_MESSAGE, source_clause: 'Style guide §5' }
const fires = (t: string) => validateText(t, [rule]).length > 0
const P = 'the patronage of H.H. Sheikh Maktoum bin Mohammed bin Rashid Al Maktoum, First Deputy Ruler of Dubai'

test('fires when patronage attaches to the other event', () => {
  assert.ok(fires(`Dubai Future Finance Week is held under ${P}.`))
  assert.ok(fires(`Dubai Future Finance Week was held under ${P}.`))
  assert.ok(fires(`organised by DIFC and held as the anchor event of Dubai Future Finance Week under ${P}`))                 // today's DFS organiser_line
  assert.ok(fires(`Dubai FinTech Summit is the anchor event of Dubai Future Finance Week, held under ${P}`))               // comma-separated: fires (Madhu)
  assert.ok(fires('the patronage of Dubai Future Finance Week'))
  assert.ok(fires(`Under ${P}, Dubai Future Finance Week brings together leaders.`))
  assert.ok(fires(`Future Islamic Finance Forum under ${P}`))
})
test('does not fire when the patronage belongs to the Summit', () => {
  assert.ok(!fires(`Dubai FinTech Summit is the anchor event of Dubai Future Finance Week. Held under ${P}.`))                // new sentence: today's DFS about_event short
  assert.ok(!fires(`Dubai FinTech Summit, the anchor event of Dubai Future Finance Week, is held under ${P}.`))              // verb after the bracketing comma
  assert.ok(!fires(`Under ${P}, Dubai FinTech Summit returns.`))
  assert.ok(!fires('Dubai Future Finance Week takes place in November, with directives from the Ruler.'))
})
