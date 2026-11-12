import test from 'node:test'
import assert from 'node:assert/strict'
import { toCsv } from './csv'

test('csv quotes commas, quotes and newlines, and neutralises formulas', () => {
  const out = toCsv(['name', 'note'], [['Rao, Asha', 'said "hi"'], ['=SUM(A1)', 'line\nbreak'], [null, '+1']])
  assert.equal(out, '﻿name,note\r\n"Rao, Asha","said ""hi"""\r\n\'=SUM(A1),"line\nbreak"\r\n,\'+1\r\n')
})
