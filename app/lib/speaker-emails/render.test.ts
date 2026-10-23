import { test } from 'node:test'
import assert from 'node:assert/strict'
import { salutationFor, renderSpeakerEmail, cleanBodyHtml, hasContent, attachmentProblem } from './render'

test('salutation follows protocol for honorific styles', () => {
  assert.equal(salutationFor('Jane Doe', null), 'Dear Jane Doe,')
  assert.equal(salutationFor('Jane Doe', 'her_excellency'), 'Dear Excellency,')
  assert.equal(salutationFor('A. Kumar', 'honble'), 'Dear Hon’ble A. Kumar,')
  assert.equal(salutationFor('', null), 'Dear Speaker,')
})

test('the email wraps the body with greeting and the producer sign-off, and escapes names', () => {
  const html = renderSpeakerEmail({ bodyHtml: '<p>Hello there</p>', publicName: 'A <b> & C', producerName: 'Sam Lee' })
  assert.match(html, /Dear A &lt;b&gt; &amp; C,/)
  assert.match(html, /Hello there/)
  assert.match(html, /Warm regards,<br><strong>Sam Lee<\/strong>/)
})

test('cleaning drops scripts, handlers and inline styles', () => {
  const c = cleanBodyHtml('<p onclick="x()" style="color:red">Hi</p><script>alert(1)</script><h2>Head</h2>')
  assert.ok(!/script|onclick|style=/.test(c))
  assert.match(c, /<strong>Head<\/strong>/)
})

test('empty editor content is not content; attachment limits are enforced', () => {
  assert.equal(hasContent('<p></p>'), false)
  assert.equal(hasContent('<p>Hi</p>'), true)
  assert.match(attachmentProblem([{ name: 'a.pdf', url: 'u', size: 4 * 1048576, type: 'application/pdf' }]) ?? '', /MB/)
  assert.equal(attachmentProblem([]), null)
})
