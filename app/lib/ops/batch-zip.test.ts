import { test } from 'node:test'
import assert from 'node:assert/strict'
import { unzipSync } from 'fflate'
import { streamZip, type ZipFailure, type ZipFile } from './batch-zip'

const enc = (s: string) => new TextEncoder().encode(s)
const read = async (rs: ReadableStream<Uint8Array>) => { const parts: Uint8Array[] = []; const r = rs.getReader(); for (;;) { const { done, value } = await r.read(); if (done) break; parts.push(value) } const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let o = 0; for (const p of parts) { out.set(p, o); o += p.length } return out }

test('files are read ahead but written in order, and the archive is complete', async () => {
  let live = 0, peak = 0
  const files: ZipFile[] = Array.from({ length: 12 }, (_, i) => ({ name: `f${i}.txt`, load: async () => { live++; peak = Math.max(peak, live); await new Promise(r => setTimeout(r, 20 - i)); live--; return enc(`file ${i}`) } }))
  let done = 0
  const zip = unzipSync(await read(streamZip(files, async () => { done++ })))
  assert.equal(done, 1)
  assert.deepEqual(Object.keys(zip), files.map(f => f.name))
  assert.equal(new TextDecoder().decode(zip['f7.txt']), 'file 7')
  assert.ok(peak > 1 && peak <= 6, `peak ${peak}`)
})

test('a file that fails once is retried; a file that keeps failing stops the archive and is reported', async () => {
  let tries = 0
  const flaky: ZipFile = { name: 'a.txt', load: async () => { if (++tries === 1) throw new Error('blip'); return enc('ok') } }
  assert.deepEqual(Object.keys(unzipSync(await read(streamZip([flaky], async () => {})))), ['a.txt'])

  let completed = false, failure: ZipFailure | null = null
  const files: ZipFile[] = [{ name: 'a.txt', load: async () => enc('a') }, { name: 'b.txt', load: async () => null }, { name: 'c.txt', load: async () => enc('c') }]
  await assert.rejects(read(streamZip(files, async () => { completed = true }, { onFail: f => { failure = f } })))
  assert.equal(completed, false)
  assert.ok(failure)
  const f = failure as ZipFailure
  assert.equal(f.fileIndex, 1); assert.equal(f.fileCount, 3); assert.match(f.reason, /b\.txt/)
})

test('a receiver that goes away mid-way is reported, not marked complete', async () => {
  let completed = false, failure: ZipFailure | null = null
  const files: ZipFile[] = Array.from({ length: 8 }, (_, i) => ({ name: `f${i}`, load: async () => enc('x'.repeat(1000)) }))
  const r = streamZip(files, async () => { completed = true }, { onFail: f => { failure = f } }).getReader()
  await r.read(); await r.cancel()
  assert.equal(completed, false); assert.ok(failure)
})

test('a batch is split into parts of PART_SIZE speakers', async () => {
  const { PART_SIZE, partCountOf } = await import('./batch-zip')
  assert.equal(partCountOf(0), 1); assert.equal(partCountOf(1), 1); assert.equal(partCountOf(PART_SIZE), 1)
  assert.equal(partCountOf(PART_SIZE + 1), 2); assert.equal(partCountOf(80), Math.ceil(80 / PART_SIZE))
})
