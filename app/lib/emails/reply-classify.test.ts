import test from 'node:test'
import assert from 'node:assert/strict'
import { classifyMessage, bounceKind, pickBest, type GraphMsg } from './reply-classify'

const SENDER = 'md@tresconglobal.com'
const msg = (o: Partial<GraphMsg>): GraphMsg => ({ id: '1', subject: 'Re: Thank you', from: 'asha@client.com', fromName: 'Asha', receivedDateTime: '2026-11-12T10:00:00Z', conversationId: 'c1', bodyPreview: 'Thanks, lovely to hear from you.', ...o })

test('the real Exchange bounce seen in production is a bounce', () => {
  const c = classifyMessage(msg({ from: 'MicrosoftExchange329e71ec88ae4615bbc36ab6ce41109e@tresconglobal.com', fromName: 'Microsoft Outlook', subject: 'Undeliverable: EP phase 5 bounce probe', bodyPreview: 'Your message to x@y.com couldn’t be delivered. x wasn’t found at y.com.' }), SENDER)
  assert.equal(c.kind, 'bounce')
})
test('other delivery failures are bounces too', () => {
  assert.equal(classifyMessage(msg({ from: 'postmaster@other.com', subject: 'Delivery Status Notification (Failure)' }), SENDER).kind, 'bounce')
  assert.equal(classifyMessage(msg({ from: 'mailer-daemon@googlemail.com', fromName: 'Mail Delivery Subsystem', subject: 'Re: hello', bodyPreview: 'Your message could not be delivered' }), SENDER).kind, 'bounce')
})
test('out-of-office replies are auto-replies; "left the company" is noticed', () => {
  assert.deepEqual(classifyMessage(msg({ subject: 'Automatic reply: Thank you', bodyPreview: 'I am out of office until Monday.' }), SENDER), { kind: 'auto_reply', stopRequested: false, leftCompany: false })
  assert.equal(classifyMessage(msg({ subject: 'Automatic reply: Thank you', bodyPreview: 'Ravi is no longer with Acme Corp. Please contact info@acme.com.' }), SENDER).leftCompany, true)
  assert.equal(classifyMessage(msg({ subject: 'Out of Office', bodyPreview: 'I have left the company.' }), SENDER).leftCompany, true)
})
test('a human reply is a reply; one asking to stop is flagged, not acted on', () => {
  assert.deepEqual(classifyMessage(msg({}), SENDER), { kind: 'reply', stopRequested: false, leftCompany: false })
  for (const t of ['Please remove me from your list.', 'Kindly stop emailing me.', 'Unsubscribe', "Don't email me again", 'I would like to opt out', 'Please stop']) {
    assert.equal(classifyMessage(msg({ bodyPreview: t }), SENDER).stopRequested, true, t)
  }
  assert.equal(classifyMessage(msg({ bodyPreview: 'Happy to join. Do email me the agenda.' }), SENDER).stopRequested, false)
})
test('our own messages in the conversation are ignored', () => {
  assert.equal(classifyMessage(msg({ from: 'MD@tresconglobal.com' }), SENDER).kind, 'ignore')
})
test('bounce kind: bad address is hard, full mailbox or policy is soft', () => {
  assert.equal(bounceKind('Remote server returned 550 5.1.10 RESOLVER.ADR.RecipientNotFound'), 'hard')
  assert.equal(bounceKind('Diagnostic code 5.1.1 user unknown'), 'hard')
  assert.equal(bounceKind("the recipient's mailbox is full 5.2.2"), 'soft')
  assert.equal(bounceKind('550 5.7.1 message rejected by policy'), 'soft')
  assert.equal(bounceKind('451 4.7.0 temporary failure, try again'), 'soft')
  assert.equal(bounceKind('x wasn’t found at example.com'), 'hard')
  assert.equal(bounceKind('something else entirely'), 'soft')
})
test('pickBest: a bounce beats a reply beats an auto-reply; earliest of a kind', () => {
  const l = [{ kind: 'auto_reply' as const, receivedAt: '2026-11-12T09:00:00Z' }, { kind: 'reply' as const, receivedAt: '2026-11-12T11:00:00Z' }, { kind: 'reply' as const, receivedAt: '2026-11-12T10:00:00Z' }]
  assert.equal(pickBest(l)!.receivedAt, '2026-11-12T10:00:00Z')
  assert.equal(pickBest([...l, { kind: 'bounce' as const, receivedAt: '2026-11-12T12:00:00Z' }])!.kind, 'bounce')
  assert.equal(pickBest([{ kind: 'ignore' as const, receivedAt: 'x' }]), null)
})
