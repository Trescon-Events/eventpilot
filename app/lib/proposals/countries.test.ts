import { test } from 'node:test'
import assert from 'node:assert/strict'
import { countryCode, flagPath } from './countries'

test('reads the messy country values in the WPS sheet', () => {
  for (const [input, code] of [['UAE ', 'ae'], ['AUS', 'au'], ['German', 'de'], ['USA', 'us'], ['India', 'in'], ['Egypt', 'eg'], ['France', 'fr'], ['Belgium', 'be'], ['United Kingdom', 'gb'], ['Türkiye', 'tr'], ['ae', 'ae']] as const) assert.equal(countryCode(input), code, input)
})
test('unreadable or empty values give no flag instead of a guess', () => {
  assert.equal(countryCode(''), null); assert.equal(countryCode(null), null); assert.equal(countryCode('somewhere'), null)
})
test('flagPath only points at flags we actually store', () => {
  assert.equal(flagPath('AE'), '/flags/ae.svg'); assert.equal(flagPath('zz'), null)
})
