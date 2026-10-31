// EventPilot Table Hub — runs on the technician's laptop.
// It asks EventPilot every 2 seconds what each table should show, keeps those pictures on this laptop, and serves them to the table PCs over the local network:
//   http://<this laptop's address>:8080/table/1   …   /table/6      (open in Chrome on each table PC, press F11 or click once for full screen)
// The table PCs need no internet. Once a picture is here it keeps showing even if the internet drops. Needs Node.js 18 or newer. No other installs.
const http = require('node:http')
const os = require('node:os')
const fs = require('node:fs')
const path = require('node:path')
const { createHash } = require('node:crypto')

const PROGRAM_VERSION = 1
// __CONFIG__ is replaced when the file is downloaded from EventPilot with this event's private link. Other ways to give it the link: the one-file .exe is downloaded as TableHub-<code>.exe (the code in
// the file name is the link), or run:  node table-hub.cjs <https://eventpilot…/api/public/screens/CODE> [port]
const DEFAULT_BASE = 'https://eventpilot.tresconglobal.com'
const CONFIG = /*__CONFIG__*/ null
const nameCode = (path.basename(process.execPath) + ' ' + path.basename(process.argv[1] ?? '')).match(/[0-9a-f]{40,128}/i)?.[0]
const link = (CONFIG?.link ?? (process.argv[2]?.startsWith('http') ? process.argv[2] : nameCode ? `${DEFAULT_BASE}/api/public/screens/${nameCode}` : '')).replace(/\/+$/, '')
const PORT = Number(CONFIG?.port ?? (process.argv[2]?.startsWith('http') ? process.argv[3] : null) ?? 8080)
if (!/^https?:\/\/.+\/api\/public\/screens\/[0-9a-f]+$/i.test(link)) { console.error('This copy has no EventPilot link in it. Download the program again from the Table Screens page.'); process.exit(1) }

let isSea = false; try { isSea = require('node:sea').isSea() } catch { /* plain node */ }
const here = isSea ? path.dirname(process.execPath) : __dirname
const cacheDir = path.join(here, 'table-hub-cache')
fs.mkdirSync(cacheDir, { recursive: true })

const tables = new Map()      // n -> { rev, mode, key, identifyUntil }
const images = new Map()      // key -> Buffer
const lastSeen = new Map()    // n -> ms timestamp a table page last asked
const log = (...a) => console.log(new Date().toLocaleTimeString(), ...a)
const keyOf = img => createHash('sha1').update(img).digest('hex').slice(0, 16)

async function getImage(img) {
  const key = keyOf(img)
  if (images.has(key)) return key
  const file = path.join(cacheDir, `${key}.png`)
  try { if (fs.existsSync(file)) { images.set(key, fs.readFileSync(file)); return key } } catch { /* fetch it */ }
  const r = await fetch(link + img, { cache: 'no-store' })
  if (!r.ok) throw new Error(`picture ${r.status}`)
  const buf = Buffer.from(await r.arrayBuffer())
  images.set(key, buf); try { fs.writeFileSync(file, buf) } catch { /* memory only */ }
  return key
}

let lastSeq = -1, online = false
async function poll() {
  try {
    const r = await fetch(`${link}/tables/live`, { cache: 'no-store' })
    if (!r.ok) throw new Error(`EventPilot answered ${r.status}`)
    const v = await r.json()
    if (!online) { online = true; log('Connected to EventPilot.') }
    const identifyLeft = v.state?.identify_until ? v.state.identify_until - v.server_now : 0
    for (const [n, t] of Object.entries(v.state?.tables ?? {})) {
      let key = null
      if (t.mode !== 'blank' && t.img) { try { key = await getImage(t.img) } catch (e) { log(`Table ${n}: could not get the picture (${e.message}) — keeping what it shows`); continue } }
      const cur = tables.get(n)
      if (!cur || cur.key !== key || cur.mode !== t.mode) tables.set(n, { rev: (cur?.rev ?? 0) + 1, mode: t.mode, key, label: t.mode === 'card' ? t.name : t.mode, identifyUntil: 0 })
    }
    const until = identifyLeft > 0 ? Date.now() + identifyLeft : 0
    for (const t of tables.values()) t.identifyUntil = until
    if (v.seq !== lastSeq) { lastSeq = v.seq; log(`New instruction #${v.seq}${v.state?.session ? ' — ' + v.state.session : ''}`) }
  } catch (e) {
    if (online) { online = false; log('Cannot reach EventPilot (' + e.message + '). Tables keep showing what they have.') }
  }
}

function lanAddresses() {
  return Object.values(os.networkInterfaces()).flat().filter(i => i && i.family === 'IPv4' && !i.internal).map(i => `http://${i.address}:${PORT}`)
}

async function beat() {
  const now = Date.now(), seen = {}, has = {}
  for (const [n, t] of lastSeen) seen[n] = now - t
  for (const [n, t] of tables) has[n] = t.label ?? ''
  try { await fetch(`${link}/tables/live`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'heartbeat', version: PROGRAM_VERSION, lan: lanAddresses(), seen, has }) }) } catch { /* next time */ }
}

const page = n => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Table ${n}</title>
<style>html,body{margin:0;height:100%;background:#000;overflow:hidden;cursor:none}img{position:fixed;inset:0;width:100%;height:100%;object-fit:contain;display:none}
#id{position:fixed;inset:0;display:none;align-items:center;justify-content:center;background:#fff;color:#000;font:900 28vmin/1 system-ui,sans-serif;flex-direction:column;z-index:5}#id small{font-size:6vmin;font-weight:700}
#w{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;color:#333;font:700 4vmin system-ui,sans-serif}</style></head>
<body><div id="w">Table ${n} — waiting</div><img id="i" alt=""><div id="id">${n}<small>TABLE ${n}</small></div>
<script>
const N=${n};let rev=-1,until=0;const i=document.getElementById('i'),w=document.getElementById('w'),idb=document.getElementById('id')
document.body.addEventListener('click',()=>{if(!document.fullscreenElement)document.documentElement.requestFullscreen?.().catch(()=>{})})
async function tick(){try{const s=await (await fetch('/table/'+N+'/state',{cache:'no-store'})).json()
 if(s.rev!==rev){rev=s.rev;if(s.key){i.src='/img/'+s.key;i.style.display='block';w.style.display='none'}else if(s.mode==='blank'){i.style.display='none';w.style.display='none'}else{i.style.display='none';w.style.display='flex'}}
 until=s.identifyLeft>0?Date.now()+s.identifyLeft:0}catch(e){}
 idb.style.display=Date.now()<until&&Math.floor(Date.now()/500)%2===0?'flex':'none'}
setInterval(tick,700);tick()
</script></body></html>`

const index = () => `<!doctype html><meta charset="utf-8"><title>Table Hub</title><body style="font:16px system-ui;padding:24px"><h2>Table Hub</h2><p>Open one of these on each table PC (full screen: F11):</p><ul>${[1, 2, 3, 4, 5, 6].map(n => `<li><a href="/table/${n}">Table ${n}</a></li>`).join('')}</ul>`

http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x')
  let m
  if ((m = u.pathname.match(/^\/table\/(\d{1,2})$/))) { lastSeen.set(m[1], Date.now()); res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); return res.end(page(m[1])) }
  if ((m = u.pathname.match(/^\/table\/(\d{1,2})\/state$/))) {
    lastSeen.set(m[1], Date.now()); const t = tables.get(m[1])
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
    return res.end(JSON.stringify(t ? { rev: t.rev, mode: t.mode, key: t.key, identifyLeft: t.identifyUntil ? t.identifyUntil - Date.now() : 0 } : { rev: 0, mode: 'waiting', key: null, identifyLeft: 0 }))
  }
  if ((m = u.pathname.match(/^\/img\/([0-9a-f]{16})$/)) && images.has(m[1])) { res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=31536000, immutable' }); return res.end(images.get(m[1])) }
  if (u.pathname === '/') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(index()) }
  res.writeHead(404); res.end('Not found')
}).listen(PORT, '0.0.0.0', () => {
  console.log(`\nEventPilot Table Hub ${PROGRAM_VERSION} is running.\nOn each table PC, open in Chrome (then F11):`)
  for (const a of lanAddresses()) for (const n of [1, 2, 3, 4, 5, 6]) console.log(`   ${a}/table/${n}`)
  console.log('\nLeave this window open during the event. (On Windows, if asked, click "Allow access" so the table PCs can reach this laptop.)\n')
}).on('error', e => { console.error(e.code === 'EADDRINUSE' ? `Port ${PORT} is already in use — is the Table Hub already running?` : e.message); process.exit(1) })

setInterval(poll, 2000); poll()
setInterval(beat, 5000); beat()
