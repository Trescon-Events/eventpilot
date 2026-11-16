import { test } from 'node:test'
import assert from 'node:assert/strict'
import { completeXml, keysFor, partsFromXml, uploadIdFromXml } from './storage'

test('keysFor: under the event and video id, file name made safe, original never overwritten by derived files', () => {
  const k = keysFor('ev1', 'vid1', 'DFS Day 1 / Stage 2 — Keynote (final).mp4')
  assert.equal(k.original, 'session-videos/ev1/vid1/original/DFS_Day_1_Stage_2_Keynote_final_.mp4')
  assert.equal(k.proxy, 'session-videos/ev1/vid1/proxy.mp4'); assert.equal(k.audio, 'session-videos/ev1/vid1/audio.m4a')
  assert.ok(!k.proxy.includes('/original/') && !k.audio.includes('/original/'))
  assert.equal(keysFor('e', 'v', '').original, 'session-videos/e/v/original/video.mp4')
})
test('S3 XML: upload id, parts (ETag quotes), the completion body sorted by part number', () => {
  assert.equal(uploadIdFromXml('<InitiateMultipartUploadResult><Bucket>b</Bucket><Key>k</Key><UploadId>abc123</UploadId></InitiateMultipartUploadResult>'), 'abc123')
  assert.equal(uploadIdFromXml('<Error/>'), null)
  const parts = partsFromXml('<ListPartsResult><Part><PartNumber>2</PartNumber><ETag>&quot;bb&quot;</ETag><Size>67108864</Size></Part><Part><PartNumber>1</PartNumber><ETag>"aa"</ETag><Size>67108864</Size></Part></ListPartsResult>')
  assert.deepEqual(parts.map(p => [p.PartNumber, p.ETag, p.Size]), [[2, '"bb"', 67108864], [1, '"aa"', 67108864]])
  assert.equal(completeXml([{ PartNumber: 2, ETag: '"bb"' }, { PartNumber: 1, ETag: '"aa"' }]), '<CompleteMultipartUpload><Part><PartNumber>1</PartNumber><ETag>&quot;aa&quot;</ETag></Part><Part><PartNumber>2</PartNumber><ETag>&quot;bb&quot;</ETag></Part></CompleteMultipartUpload>')
})
