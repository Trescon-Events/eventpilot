import { test } from 'node:test'
import assert from 'node:assert/strict'
import { approvalOutcome, approvalEmailBody } from './client-approval'

test('approved with no comments', () => assert.equal(approvalOutcome([{ comment: null, rejected: false }, { comment: '  ', rejected: false }]), 'approved'))
test('one comment anywhere makes it "with comments"', () => assert.equal(approvalOutcome([{ comment: null, rejected: false }, { comment: 'Fix the title', rejected: false }]), 'approved_with_comments'))
test('a rejection alone does not change the wording', () => assert.equal(approvalOutcome([{ comment: null, rejected: true }]), 'approved'))
test('email escapes names and keeps the link', () => {
  const html = approvalEmailBody({ name: 'A<b>', eventName: 'DFS & Co', batchName: 'Batch 1', badges: 3, link: 'https://x/y', senderName: 'Jarryd', message: null })
  assert.ok(html.includes('A&lt;b&gt;') && html.includes('DFS &amp; Co') && html.includes('href="https://x/y"'))
})
