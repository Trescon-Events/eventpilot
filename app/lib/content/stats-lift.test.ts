import { test } from 'node:test'
import assert from 'node:assert/strict'
import { applyRemovals, buildPlan, describeSections, type Candidate, type Section } from './stats-lift'

const sections = (): Section[] => [
  { id: 's1', title: 'About', kind: 'text', content: 'The summit builds the skilling ecosystem.\n\n- Expected 10,000 delegates\n- Hosted by KSDC\n- 300 speakers across 4 tracks' },
  { id: 's2', title: 'Key facts', kind: 'facts', content: [{ fact: 'Attendance', detail: '10,000 expected' }, { fact: 'Venue', detail: 'BIEC, Bengaluru' }, { fact: 'Speakers', detail: '300+' }] },
  { id: 's3', title: 'Audience', kind: 'table', content: { columns: ['Region', 'Share'], rows: [['India', '62%'], ['Middle East', '20%'], ['Other', '18%']] } },
  { id: 's4', title: 'Programme', kind: 'table', content: { columns: ['Item', 'Detail'], rows: [['Stages', '2'], ['Venue hall', 'Hall A']] } },
]

test('describeSections numbers every row and line so a model can answer by position', () => {
  const d = describeSections(sections())
  assert.match(d, /\[s2\] Key facts \(facts\)[\s\S]*row 0: Attendance = 10,000 expected/)
  assert.match(d, /line 2: - Expected 10,000 delegates/); assert.match(d, /\[s3\] Audience \(table\) columns: Region \| Share/)
})
test('a verified plan: facts rows, bullet lines and a whole percentage table', () => {
  const c: Candidate[] = [
    { section_id: 's2', at: { row: 0 }, label: 'Attendance', value: '10,000 expected' }, { section_id: 's2', at: { row: 2 }, label: 'Speakers', value: '300+' },
    { section_id: 's1', at: { line: 2 }, label: 'Delegates', value: '10,000 delegates' }, { section_id: 's3', at: { table: true }, label: 'Audience by region', category: 'audience' },
  ]
  const p = buildPlan(sections(), c)
  assert.equal(p.items.length, 4); assert.equal(p.rejected.length, 0)
  assert.equal(p.items[0].display, '10,000 expected'); assert.equal(p.items[0].phase, 'pre')
  assert.equal(p.items[3].kind, 'breakdown'); assert.deepEqual(p.items[3].rows, [{ label: 'India', display: '62%' }, { label: 'Middle East', display: '20%' }, { label: 'Other', display: '18%' }])
})
test('proposals that do not match the document are rejected, never fixed', () => {
  const p = buildPlan(sections(), [
    { section_id: 's2', at: { row: 1 }, label: 'Venue', value: 'BIEC' },            // no number
    { section_id: 's2', at: { row: 9 }, label: 'Ghost', value: '1' },               // no such row
    { section_id: 's1', at: { line: 0 }, label: 'Narrative', value: '1' },          // narrative, not a bullet (and no digit)
    { section_id: 's1', at: { line: 3 }, label: 'Hosted', value: 'x' },             // bullet without a number
    { section_id: 'zz', at: { row: 0 }, label: 'Nope', value: '1' },                // no such section
    { section_id: 's4', at: { table: true }, label: 'Programme', value: '' },       // not every row is a labelled number
    { section_id: 's2', at: { line: 0 }, label: 'Wrong position kind', value: '1' }, // line on a facts section
    { section_id: 's2', at: { row: 0 }, label: '', value: '10,000' },               // no label
  ])
  assert.equal(p.items.length, 0); assert.equal(p.rejected.length, 8)
})
test('removal takes out exactly the planned rows and lines, and drops a section left empty', () => {
  const plan = buildPlan(sections(), [
    { section_id: 's2', at: { row: 0 }, label: 'Attendance', value: '' }, { section_id: 's2', at: { row: 2 }, label: 'Speakers', value: '' },
    { section_id: 's1', at: { line: 2 }, label: 'Delegates', value: '' }, { section_id: 's1', at: { line: 4 }, label: 'Speakers and tracks', value: '' }, { section_id: 's3', at: { table: true }, label: 'Audience', value: '' },
  ])
  const r = applyRemovals(sections(), plan)
  assert.equal(r.removed.length, 5); assert.equal(r.stale.length, 0)
  const by = new Map(r.sections.map(s => [s.id, s]))
  assert.deepEqual(by.get('s2')!.content, [{ fact: 'Venue', detail: 'BIEC, Bengaluru' }])
  assert.equal(by.get('s1')!.content, 'The summit builds the skilling ecosystem.\n\n- Hosted by KSDC')
  assert.ok(!by.has('s3'), 'a table that was all statistics leaves no empty section behind')
  assert.ok(by.has('s4'))
})
test('a row that changed since the plan was made is kept and reported as stale', () => {
  const plan = buildPlan(sections(), [{ section_id: 's2', at: { row: 0 }, label: 'Attendance', value: '' }])
  const changed = sections(); (changed[1].content as Array<{ detail: string }>)[0].detail = '12,000 expected'
  const r = applyRemovals(changed, plan)
  assert.equal(r.removed.length, 0); assert.equal(r.stale.length, 1)
  assert.equal((r.sections.find(s => s.id === 's2')!.content as unknown[]).length, 3)
})
test('the input sections are never mutated', () => {
  const s = sections(); const before = JSON.stringify(s)
  applyRemovals(s, buildPlan(s, [{ section_id: 's2', at: { row: 0 }, label: 'Attendance', value: '' }]))
  assert.equal(JSON.stringify(s), before)
})
