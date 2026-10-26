import test from 'node:test'
import assert from 'node:assert/strict'
import { zipSync, strToU8 } from 'fflate'
import { docxText, pptxText, parseLinks, filesBlock } from './files'

test('reads the words of a Word file, paragraph by paragraph', () => {
  const xml = '<w:document><w:body><w:p><w:r><w:t>Abhi Bajpai</w:t></w:r></w:p><w:p><w:r><w:t>Director &amp; speaker</w:t></w:r></w:p></w:body></w:document>'
  assert.equal(docxText(zipSync({ 'word/document.xml': strToU8(xml) })), 'Abhi Bajpai\nDirector & speaker')
})
test('reads slides in numeric order', () => {
  const s = (t: string) => strToU8(`<p:sld><a:p><a:r><a:t>${t}</a:t></a:r></a:p></p:sld>`)
  assert.equal(pptxText(zipSync({ 'ppt/slides/slide10.xml': s('ten'), 'ppt/slides/slide2.xml': s('two') })), 'two\n\nten')
})
test('links: one per line, bare domains accepted, junk reported', () => {
  const r = parseLinks('https://a.com/x\nb.org/page\nnot a link\nhttps://a.com/x\n')
  assert.deepEqual(r.urls, ['https://a.com/x', 'https://b.org/page']); assert.deepEqual(r.bad, ['not a link'])
})
test('files block names each text file and skips photos', () => {
  assert.equal(filesBlock([{ id: '1', name: 'bio.pdf', kind: 'text', chars: 3, text: 'abc' }, { id: '2', name: 'p.jpg', kind: 'photo', chars: 0 }]), '[File: bio.pdf]\nabc')
})
