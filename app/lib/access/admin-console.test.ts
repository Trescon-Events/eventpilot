import test from 'node:test'
import assert from 'node:assert/strict'
import { canOpenConsole, canUseConsoleTab, consoleTabsFor } from './admin-console'

test('the old whole-console key and wildcards open every area', () => {
  for (const held of [['sae.admin.access'], ['sae.admin.*'], ['sae.*'], ['*']]) assert.deepEqual(consoleTabsFor(held), ['variants', 'stage', 'access'], held.join())
})

test('a marketing role with only the Stage Speaker Pic key sees only that area', () => {
  const held = ['sae.stakeholders.view', 'sae.admin.stage_screens']
  assert.deepEqual(consoleTabsFor(held), ['stage'])
  assert.equal(canUseConsoleTab(held, 'variants'), false); assert.equal(canUseConsoleTab(held, 'access'), false)
  assert.equal(canOpenConsole(held), true)
})

test('areas can be combined and nothing means no console', () => {
  assert.deepEqual(consoleTabsFor(['sae.admin.variants', 'sae.admin.access_control']), ['variants', 'access'])
  assert.deepEqual(consoleTabsFor(['sae.stakeholders.view', 'sae.screens.manage']), []); assert.equal(canOpenConsole([]), false)
  assert.equal(canOpenConsole(new Set(['sae.admin.stage_screens'])), true)
})
