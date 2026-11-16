import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildDescription, checkChapters, cleanTags, eventFigureHits, fmtTime, labelFor, parseTranscript, speakerLine, suggestSessions, titleProblems, transcriptForPrompt, unresolvedPlaceholders, voiceSummaries } from './logic'

test('parseTranscript: fences, strings for numbers, bad rows dropped, sorted, clamped to the duration', () => {
  const raw = 'Here you go:\n```json\n{"segments":[{"start":"12.5","end":20,"voice":"Voice B","text":"  second   one "},{"start":0,"end":10,"voice":"Voice A","text":"first"},{"start":30,"end":25,"voice":"Voice A","text":"backwards"},{"start":40,"end":50,"voice":"Voice A","text":""},{"start":9000,"end":9100,"voice":"Voice A","text":"after the end"}]}\n```'
  const s = parseTranscript(raw, 60)
  assert.deepEqual(s.map(x => [x.start, x.end, x.voice_id, x.text]), [[0, 10, 'Voice A', 'first'], [12.5, 20, 'Voice B', 'second one']])
  assert.throws(() => parseTranscript('no json here'), /not valid JSON/)
  assert.throws(() => parseTranscript('{"segments":[]}'), /no usable segments/)
})
test('voiceSummaries: biggest talker first, up to three spread quotes, long quotes shortened', () => {
  const seg = (start: number, voice: string, text: string) => ({ start, end: start + 20, voice_id: voice, text })
  const long = 'This is a long enough sentence for somebody to recognise the person by what they said today'
  const v = voiceSummaries([seg(0, 'Voice A', long), seg(100, 'Voice A', long + ' again'), seg(200, 'Voice A', long + ' once more'), seg(300, 'Voice A', long + ' and again'), seg(50, 'Voice B', 'Short one.'), seg(400, 'Voice A', 'x'.repeat(300) + ' word word word word word word word word')])
  assert.equal(v[0].voice_id, 'Voice A'); assert.equal(v[0].quotes.length, 3); assert.equal(v[1].voice_id, 'Voice B'); assert.equal(v[1].quotes[0].text, 'Short one.')
  assert.ok(v[0].quotes.every(q => q.text.length <= 160))
})
test('labelFor / transcriptForPrompt: named speaker, "Speaker" when unassigned, "Other voice" when rejected', () => {
  const voices = [{ voice_id: 'A', speaker_id: 's1', rejected: false }, { voice_id: 'B', speaker_id: null, rejected: false }, { voice_id: 'C', speaker_id: null, rejected: true }]
  const names = new Map([['s1', 'Dr. Jane Roe']])
  assert.deepEqual(['A', 'B', 'C', 'Z'].map(v => labelFor(v, voices, names)), ['Dr. Jane Roe', 'Speaker', 'Other voice', 'Speaker'])
  assert.equal(transcriptForPrompt([{ start: 65, end: 70, voice_id: 'A', text: 'Hello' }], voices, names), '[1:05] Dr. Jane Roe: Hello')
})
test('fmtTime', () => { assert.deepEqual([0, 59, 60, 605, 3600, 3725].map(fmtTime), ['0:00', '0:59', '1:00', '10:05', '1:00:00', '1:02:05']) })

const sessions = [
  { id: 'a', title: 'The Future of Digital Banking', speakers: ['Dr. Jane Roe', 'Omar Khan'] },
  { id: 'b', title: 'Tokenisation and Capital Markets: Panel', speakers: ['Lina Haddad', 'Peter Smith'] },
  { id: 'c', title: 'Opening Keynote', speakers: ['Armin Example'] },
]
test('suggestSessions: file name words and speaker surnames, best first, nothing for noise', () => {
  assert.equal(suggestSessions('DFS26_Day1_Stage2_Tokenisation_Capital_Markets_Panel_FINAL.mp4', sessions)[0].session_id, 'b')
  assert.equal(suggestSessions('roe_digital-banking-v2.mov', sessions)[0].session_id, 'a')
  assert.equal(suggestSessions('Keynote_Example.mp4', sessions)[0].session_id, 'c')
  assert.deepEqual(suggestSessions('IMG_0001.mp4', sessions), [])
  assert.deepEqual(suggestSessions('', sessions), [])
})
test('checkChapters: forced to start at 0:00, close ones dropped, too few reported, past the end dropped', () => {
  const r = checkChapters([{ start_s: 5, title: 'Intro' }, { start_s: 8, title: 'Too close' }, { start_s: 120, title: 'Main topic' }, { start_s: 400, title: 'Q and A' }, { start_s: 9999, title: 'Never' }], 600)
  assert.deepEqual(r.chapters.map(c => c.start_s), [0, 120, 400]); assert.ok(r.problems.some(p => p.includes('0:00'))); assert.ok(r.problems.some(p => p.includes('less than 10 seconds'))); assert.ok(r.problems.some(p => p.includes('after the end')))
  assert.ok(checkChapters([{ start_s: 0, title: 'One' }, { start_s: 60, title: 'Two' }], 600).problems.includes('Fewer than three chapters.'))
  assert.deepEqual(checkChapters([{ start_s: 0, title: 'A' }, { start_s: 30, title: 'B' }, { start_s: 90, title: 'C' }], 600).problems, [])
})
test('titles and tags', () => {
  assert.equal(titleProblems(['a', 'b', 'c', 'd', 'e']).length, 0)
  assert.equal(titleProblems(['a', 'b']).length, 1)
  assert.ok(titleProblems(['x'.repeat(71), 'b', 'c', 'd', 'e'])[0].startsWith('Over 70'))
  assert.deepEqual(cleanTags(['#Fintech', 'fintech ', 'Banking', '', 4]), ['Fintech', 'fintech', 'Banking'])
})
test('eventFigureHits: counts about the event are caught; numbers inside what a speaker said are not', () => {
  for (const t of ['The summit welcomed over 10,000 delegates.', 'More than 300 speakers took part.', 'with 120+ exhibitors and 40 partners', 'a footfall of 9,756', 'attended by 5,000 senior attendees', '150 sessions across 6 stages', 'media reach of 2.4 billion']) assert.ok(eventFigureHits(t).length > 0, t)
  for (const t of ['The panel discusses a $2 trillion market and 4 percent growth.', 'Held on 2 November 2026 in Dubai.', 'She has led teams of 30 engineers for 15 years.', 'Three lessons from the first 100 days.', 'a ZZ Alpha Summit 2026 panel on open banking', 'The 2025 sessions were recorded.']) assert.deepEqual(eventFigureHits(t), [], t)
})
test('speakerLine and buildDescription: speakers from records, chapters, footer last, order fixed', () => {
  assert.equal(speakerLine({ name: 'Dr. Jane Roe', title: 'CEO', company: 'Example Bank', moderator: true }), 'Dr. Jane Roe (Moderator), CEO, Example Bank')
  assert.equal(speakerLine({ name: 'Omar Khan', title: '', company: null }), 'Omar Khan')
  const d = buildDescription({ opening: 'Opening line.', summary: ['P1', 'P2', 'P3', 'P4'], speakers: [{ name: 'Omar Khan', title: 'CFO', company: 'X' }], chapters: [{ start_s: 0, title: 'Intro' }, { start_s: 75, title: 'Main' }], footer: 'About the event\nWatch all sessions: {playlist_link}' })
  assert.equal(d, 'Opening line.\n\nP1\n\nP2\n\nP3\n\nSpeakers\nOmar Khan, CFO, X\n\nChapters\n0:00 Intro\n1:15 Main\n\nAbout the event\nWatch all sessions: {playlist_link}')
  assert.ok(!buildDescription({ opening: 'O', summary: [], speakers: [], chapters: [], footer: null }).includes('Speakers'))
  assert.deepEqual(unresolvedPlaceholders(d), ['{playlist_link}'])
})
