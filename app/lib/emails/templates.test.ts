import test from 'node:test'
import assert from 'node:assert/strict'
import { extractTokens, applyTokens, applyTokensPlain, checkRequiredFields, unresolvedTokens, validateTemplate, missingFieldTokens, personValues } from './templates'

test('tokens are found regardless of spacing and case', () => {
  assert.deepEqual(extractTokens('Hi {{ Event_Name }} and {{gallery_link}} and {{event_name}}').sort(), ['event_name', 'gallery_link'])
})
test('applyTokens fills known values, escapes them, leaves unknown tokens alone', () => {
  assert.equal(applyTokens('<p>{{event_name}} &amp; {{x}}</p>', { event_name: 'A & B <Summit>' }), '<p>A &amp; B &lt;Summit&gt; &amp; {{x}}</p>')
  assert.equal(applyTokens('<a href="{{gallery_link}}">{{gallery_link}}</a>', { gallery_link: 'https://g.example/a?x=1&y=2' }), '<a href="https://g.example/a?x=1&amp;y=2">https://g.example/a?x=1&amp;y=2</a>')
})
test('subject lines are filled as plain text', () => {
  assert.equal(applyTokensPlain('Thanks for {{event_name}}', { event_name: 'A & B' }), 'Thanks for A & B')
})
test('person values', () => {
  assert.deepEqual(personValues('  Asha  Rao ', { company: ' Acme ', role: null }), { speaker_name: 'Asha  Rao', first_name: 'Asha', company: 'Acme', role: '' })
})
test('required fields: empty, wrong link, good link', () => {
  const f = [{ key: 'gallery_link', label: 'Photo gallery link', kind: 'url' as const }]
  assert.match((checkRequiredFields(f, {}) as { error: string }).error, /required/)
  assert.match((checkRequiredFields(f, { gallery_link: 'gallery.konfhub.com/x' }) as { error: string }).error, /https:\/\//)
  assert.match((checkRequiredFields(f, { gallery_link: 'https://a b.com' }) as { error: string }).error, /https:\/\//)
  const ok = checkRequiredFields(f, { gallery_link: ' https://gallery.konfhub.com/bss ' })
  assert.deepEqual(ok, { ok: true, values: { gallery_link: 'https://gallery.konfhub.com/bss' } })
})
test('unresolved tokens exclude the per-person ones', () => {
  assert.deepEqual(unresolvedTokens('Dear {{speaker_name}} {{first_name}}, {{event_dates}} {{gallery_link}}').sort(), ['event_dates', 'gallery_link'])
})
test('validateTemplate: catches typos, bad field names, unused fields', () => {
  const base = { name: 'T', subject: 'Hi {{event_name}}', body_html: '<p>{{event_name}} {{gallery_link}}</p>', required_fields: [{ key: 'gallery_link', label: 'Gallery', kind: 'url' }] }
  assert.equal(validateTemplate(base).ok, true)
  assert.match((validateTemplate({ ...base, body_html: '<p>{{event_nmae}}</p>' }) as { error: string }).error, /Unknown placeholder.*event_nmae/)
  assert.match((validateTemplate({ ...base, required_fields: [{ key: 'Gallery Link', label: 'G', kind: 'url' }] }) as { error: string }).error, /cannot be a field name/)
  assert.match((validateTemplate({ ...base, required_fields: [{ key: 'event_name', label: 'G', kind: 'text' }] }) as { error: string }).error, /built-in/)
  assert.match((validateTemplate({ ...base, body_html: '<p>{{event_name}}</p>' }) as { error: string }).error, /not used/)
  assert.match((validateTemplate({ ...base, subject: 'a\nb' }) as { error: string }).error, /one line/)
  assert.match((validateTemplate({ ...base, body_html: '<p></p>' }) as { error: string }).error, /no text/)
})
test('a required field removed from the loaded text is caught', () => {
  const f = [{ key: 'gallery_link', label: 'Photo gallery link', kind: 'url' as const }]
  assert.equal(missingFieldTokens(f, 'Thanks', '<p>See the photos</p>').length, 1)
  assert.equal(missingFieldTokens(f, 'Thanks', '<p>{{gallery_link}}</p>').length, 0)
})
