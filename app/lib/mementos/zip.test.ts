import { test } from 'node:test'
import assert from 'node:assert/strict'
import { unzipSync } from 'fflate'
import { buildMementoZip, safeFileName, uniqueNames } from './zip'

test('file names are safe and unique', () => {
  assert.equal(safeFileName('José Álvarez / CEO'), 'Jose Alvarez CEO')
  assert.deepEqual(uniqueNames(['Ann Lee', 'ann lee', 'Bo']), ['Ann Lee.png', 'ann lee-2.png', 'Bo.png'])
})

test('streams a valid zip of the fetched photos', async () => {
  const realFetch = globalThis.fetch
  globalThis.fetch = (async (u: string) => new Response(new Uint8Array([1, 2, 3, String(u).length]))) as typeof fetch
  try {
    const stream = await buildMementoZip([{ name: 'Ann Lee', url: 'http://x/a.png' }, { name: 'Bo', url: 'http://x/bb.png' }])
    const buf = new Uint8Array(await new Response(stream).arrayBuffer())
    const files = unzipSync(buf)
    assert.deepEqual(Object.keys(files).sort(), ['Ann Lee.png', 'Bo.png'])
    assert.deepEqual([...files['Bo.png']], [1, 2, 3, 'http://x/bb.png'.length])
  } finally { globalThis.fetch = realFetch }
})

test('a photo that cannot be fetched fails before streaming', async () => {
  const realFetch = globalThis.fetch
  globalThis.fetch = (async () => new Response('nope', { status: 404 })) as typeof fetch
  try { await assert.rejects(buildMementoZip([{ name: 'Ann', url: 'http://x/a.png' }]), /Could not fetch the photo for Ann/) } finally { globalThis.fetch = realFetch }
})
