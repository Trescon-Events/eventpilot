import { test } from 'node:test'
import assert from 'node:assert/strict'
import { figureRefsIn, figuresForVariant, figuresPromptBlock, figuresPromptBlockFor, unapprovedNumbers, type Phase } from './copy-figures'
import type { PublicFigure } from './public-figures-read'

const fig = (id: string, label: string, display: string, over: Partial<PublicFigure> = {}): PublicFigure => ({ id, catalogue_key: null, category: 'at_a_glance', group_label: null, label, kind: 'figure', payload: { display }, version: 1, basis: 'measured', ...over })
const post = [fig('1', 'Footfall', '9,756'), fig('2', 'Speakers', '375'), fig('3', 'PR value', 'INR 29.22M'), fig('4', 'Reach', '2.47B+')]
const pre = [fig('5', 'Footfall', '10,000+ expected'), fig('6', 'Speakers', '300+')]
const facts = 'Event name: Bengaluru Skill Summit 2026\nDates: 3-5 November 2026\nVenue: BIEC, Bengaluru'

test('every number accounted for: nothing flagged', () => {
  assert.deepEqual(unapprovedNumbers('The summit drew 9,756 participants and 375 speakers over 3-5 November 2026.', post, facts), [])
  assert.deepEqual(unapprovedNumbers('Media value of INR 29.22M with a reach of 2.47B+.', post, facts), [])
})
test('a number from the old document or a made-up one is flagged', () => {
  assert.deepEqual(unapprovedNumbers('Expected 10,000 delegates and 300 speakers.', post, facts), ['10,000', '300'])
  assert.deepEqual(unapprovedNumbers('Over 1,200 startups took part.', post, facts), ['1,200'])
})
test('years, dates and single digits are not statistics', () => {
  assert.deepEqual(unapprovedNumbers('Held in 2026 across 2 days, 4 tracks, Phase 2.', post, facts), [])
})
test('the pre-event numbers are not allowed in post-event copy, and the other way round', () => {
  assert.deepEqual(unapprovedNumbers('300+ speakers', post, facts), ['300'])
  assert.deepEqual(unapprovedNumbers('9,756 participants', pre, facts), ['9,756'])
})
test('"any" copy carries no statistics: every number beyond the facts is flagged', () => {
  assert.deepEqual(unapprovedNumbers('A gathering of 375 speakers', figuresForVariant('any', { pre, post }), facts), ['375'])
})
test('figures used by a text are found by their value, so re-approval flags exactly those items', () => {
  assert.deepEqual(figureRefsIn('9,756 participants and INR 29.22M media value', post).map(f => f.id), ['1', '3'])
  assert.deepEqual(figureRefsIn('A great summit.', post), [])
})
test('the prompt block shows each phase its own figures, and says "none approved" when there are none', () => {
  const both = figuresPromptBlock({ pre, post })
  assert.match(both, /phase="pre"[\s\S]*Footfall: 10,000\+ expected[\s\S]*phase="post"[\s\S]*Footfall: 9,756/)
  const none = figuresPromptBlock({ pre: [], post } as Record<Phase, PublicFigure[]>)
  assert.match(none, /phase="pre" \(before the event\):\n\(none approved yet: state NO statistics/)
  assert.match(none, /phase="any" must not state any statistics/)
})
test('breakdowns are not shown to the model but their numbers still count as approved', () => {
  const bd: PublicFigure = fig('7', 'Audience by region', '', { kind: 'breakdown', payload: { title: 'Region', rows: [{ label: 'India', display: '62' }] } })
  assert.ok(!figuresPromptBlock({ pre: [], post: [bd] }).includes('Audience by region'))
  assert.deepEqual(unapprovedNumbers('62% from India', [bd], facts), [])
})
test('a single-phase block (press release): that phase only, or "none approved yet"', () => {
  assert.match(figuresPromptBlockFor('post', post), /APPROVED POST-EVENT FIGURES[\s\S]*Footfall: 9,756/)
  assert.ok(!figuresPromptBlockFor('post', post).includes('10,000'))
  assert.match(figuresPromptBlockFor('pre', []), /APPROVED PRE-EVENT FIGURES[\s\S]*none approved yet: state NO statistics/)
})

