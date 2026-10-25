import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as XLSX from 'xlsx'
import { parseSpeakerSheet } from './import'

test('the sheet can carry a website and a notes / LinkedIn-text column, which are kept per row', () => {
  const ws = XLSX.utils.aoa_to_sheet([
    ['Name', 'Designation', 'Company', 'Country', 'LinkedIn', 'Website', 'Notes'],
    ['Jane Roe', 'Director', 'Acme Authority', 'UAE', 'https://www.linkedin.com/in/jane-roe', 'acme.ae', 'About: Jane leads enforcement at Acme since 2019.'],
    ['John Doe', 'Chief', 'Beta Police', 'UK', '', '', ''],
  ])
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Speakers')
  const { rows } = parseSpeakerSheet(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer)
  assert.equal(rows.length, 2)
  assert.equal(rows[0].cells.website, 'acme.ae')
  assert.match(rows[0].cells.notes, /leads enforcement/)
  assert.equal(rows[1].cells.notes, '')
})
