import { test } from 'node:test'
import assert from 'node:assert/strict'
import { extractPageImages, canFetch, domainOf } from './pages'

const HTML = `<html><head><meta property="og:image" content="/img/share.jpg"><meta property="og:title" content="Serge Potapov SES"></head><body>
<header><img src="/img/site-logo.png" alt="IDGA"></header>
<nav><img src="/nav/a.jpg"></nav>
<div class="speaker"><h2>Serge Potapov SES</h2><figure><img src="/speakers/serge-potapov.jpg" alt="Serge Potapov" width="400" height="400"><figcaption>Executive Director, TSA</figcaption></figure></div>
<div><img src="data:image/png;base64,AAA"><img src="/ads/pixel.gif"><img src="//cdn.example.com/p.jpg" srcset="/s/small.jpg 320w, /s/big.jpg 1200w" alt="Other"><img src="/tiny.jpg" width="40" height="40"></div>
<footer><img src="/f/footer.jpg"></footer></body></html>`

test('finds the speaker photo and its context, skips chrome, logos, data URIs, tiny images', () => {
  const imgs = extractPageImages(HTML, 'https://www.idga.org/events/speakers/serge-potapov-ses')
  const urls = imgs.map(i => i.url)
  assert.ok(urls.includes('https://www.idga.org/speakers/serge-potapov.jpg'))
  assert.ok(urls.includes('https://www.idga.org/img/share.jpg'))
  assert.ok(!urls.some(u => /logo|nav|footer|pixel|tiny|data:/.test(u)))
  assert.ok(urls.includes('https://www.idga.org/s/big.jpg'), 'takes the largest srcset candidate')
  const serge = imgs.find(i => i.url.endsWith('serge-potapov.jpg'))!
  assert.match(serge.near, /Executive Director, TSA/); assert.equal(serge.alt, 'Serge Potapov')
})
test('never fetches login-walled social sites', () => {
  assert.equal(canFetch('https://www.linkedin.com/in/x'), false); assert.equal(canFetch('https://www.instagram.com/p/1'), false)
  assert.equal(canFetch('https://www.idga.org/a'), true); assert.equal(domainOf('https://www.idga.org/a'), 'idga.org')
})
