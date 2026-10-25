import { test } from 'node:test'
import assert from 'node:assert/strict'
import { defaultMiddle, reviewEmailHtml, sanitizeMiddle } from './review-email'

test('what a producer types is made safe: simple formatting stays, scripts, handlers and odd links go', () => {
  const out = sanitizeMiddle('<p onclick="x()" style="color:red">Hi <strong>all</strong><script>alert(1)</script> <a href="javascript:alert(1)">bad</a> <a href="https://ok.example/a">ok</a><img src=x onerror=y><iframe src=z></iframe></p>')
  assert.ok(!/script|onclick|onerror|iframe|javascript:|style=|<img/i.test(out), out)
  assert.ok(out.includes('<strong>all</strong>') && out.includes('<a href="https://ok.example/a">ok</a>'))
})
test('the email keeps its locked parts however the middle is edited', () => {
  const html = reviewEmailHtml({ name: 'Layla Hassan', link: 'https://x.test/r/abc', senderName: 'Madre', middle: sanitizeMiddle('<p>Short note.</p>') })
  assert.ok(html.startsWith('<p id="locked-greeting">Dear Layla,</p>'))
  assert.ok(html.includes('href="https://x.test/r/abc"') && html.includes('Thank you,<br/>Madre'))
  assert.ok(defaultMiddle({ eventName: 'WPS', batchName: 'Drop 1', count: 3, kind: 'new', message: 'Hello <b>' }).includes('Hello &lt;b&gt;'), 'the note is escaped')
})
