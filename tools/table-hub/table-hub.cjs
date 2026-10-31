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
const NO_OPEN = process.argv.includes('--no-open')
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

let lastSeq = -1, online = false, lastSession = '', lastSent = ''
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
    lastSession = v.state?.session ?? ''; lastSent = v.state?.sent_at ?? ''
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


const statusPage = () => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Table Hub</title>
<style>:root{color-scheme:light dark}body{font:16px/1.5 system-ui,sans-serif;margin:0;background:#0f1720;color:#e8eef5}main{max-width:760px;margin:0 auto;padding:28px 20px}h1{font-size:22px;margin:0 0 4px}
.pill{display:inline-block;padding:3px 12px;border-radius:999px;font-weight:800;font-size:13px;background:#394552;color:#cbd5df}.on{background:#0ea79d;color:#fff}.bad{background:#c0392b;color:#fff}
.card{background:#18222d;border:1px solid #2a3846;border-radius:12px;padding:14px 16px;margin:14px 0}.row{display:flex;gap:10px;align-items:center;justify-content:space-between;padding:8px 0;border-top:1px solid #2a3846;flex-wrap:wrap}.row:first-of-type{border-top:0}
a.btn,button{font:inherit;font-weight:800;padding:8px 14px;border-radius:9px;border:1.5px solid #3a4b5c;background:#18222d;color:#e8eef5;cursor:pointer;text-decoration:none}button.quit{border-color:#7a3a3a;color:#ff9a9a}
code{background:#0b1117;padding:2px 7px;border-radius:6px;font-size:14px}small{color:#93a4b5}</style></head><body><main>
<h1>EventPilot Table Hub</h1><div id="top"><span class="pill">starting…</span></div>
<div class="card"><strong>Tables</strong><div id="tables"></div><p><small>On each table PC: open Chrome, go to that table's address, then click once on the page (or press F11) for full screen. A landscape screen turns the card by itself. Upside down? Add <code>?rotate=270</code> to that address once.</small></p></div>
<div class="card"><strong>Now showing</strong><div id="now" style="margin-top:6px"></div></div>
<p><small>Keep this program running during the event. Close this page whenever you like: the hub keeps running. Open the app again to see this page. The cards are sent from the Table Screens page in EventPilot.</small></p>
<button class="quit" onclick="if(confirm('Stop the Table Hub? The table screens will keep their last picture but stop updating.'))fetch('/quit',{method:'POST'}).then(()=>document.body.innerHTML='<main><h1>Table Hub stopped.</h1><p>Open the app again to start it.</p></main>')">Quit Table Hub</button>
<script>
async function tick(){try{const s=await (await fetch('/api/status',{cache:'no-store'})).json()
document.getElementById('top').innerHTML='<span class="pill '+(s.online?'on':'bad')+'">'+(s.online?'Connected to EventPilot':'Cannot reach EventPilot – tables keep their last picture')+'</span> <small>program v'+s.version+'</small>'
document.getElementById('tables').innerHTML=s.tables.map(t=>'<div class="row"><div><strong>Table '+t.n+'</strong> <span class="pill '+(t.seen?'on':'')+'">'+(t.seen?'screen online':'not opened yet')+'</span><br><small>'+(t.label||'nothing sent yet')+'</small></div><div><code>'+t.url+'</code> <a class="btn" target="_blank" href="'+t.local+'">Open here</a></div></div>').join('')
document.getElementById('now').textContent=s.session?s.session+(s.sent?' (sent '+new Date(s.sent).toLocaleTimeString()+')':''):'Nothing sent yet.'}catch(e){document.getElementById('top').innerHTML='<span class="pill bad">Table Hub is not running</span>'}}
tick();setInterval(tick,2000)
</script></main></body></html>`

const openPage = url => { if (NO_OPEN) return; try { const { spawn } = require('node:child_process'); const [cmd, args] = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]] : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]]; spawn(cmd, args, { stdio: 'ignore', detached: true }).unref() } catch { /* the address is printed anyway */ } }

const page = n => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Table ${n}</title>
<style>html,body{margin:0;height:100%;background:#000;overflow:hidden;cursor:none}img{position:fixed;inset:0;width:100%;height:100%;object-fit:contain;display:none}
.r90 img,.r270 img,.r90 #id,.r270 #id,.r90 #w,.r270 #w{inset:auto;top:50%;left:50%;width:100vh;height:100vw}.r90 img,.r90 #id,.r90 #w{transform:translate(-50%,-50%) rotate(90deg)}.r270 img,.r270 #id,.r270 #w{transform:translate(-50%,-50%) rotate(270deg)}
#id{position:fixed;inset:0;display:none;align-items:center;justify-content:center;background:#fff;color:#000;font:900 28vmin/1 system-ui,sans-serif;flex-direction:column;z-index:5}#id small{font-size:6vmin;font-weight:700}
#w{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;color:#333;font:700 4vmin system-ui,sans-serif}</style></head>
<body><div id="w">Table ${n} — waiting</div><img id="i" alt=""><div id="id">${n}<small>TABLE ${n}</small></div>
<script>
const N=${n};let rev=-1,until=0;
// Automatic: a landscape window shows the portrait card turned 90°, a portrait one shows it as is, so no setting is needed on the table PC. If it ends up upside down, open /table/N?rotate=270 once
// (remembered on that PC); ?rotate=0 never rotates; ?rotate=auto goes back to automatic.
const root=document.documentElement;let mode='auto'
{const q=new URLSearchParams(location.search).get('rotate');try{if(q!==null)localStorage.setItem('rotate',q)}catch(e){}try{mode=localStorage.getItem('rotate')||'auto'}catch(e){}}
function fit(){root.classList.remove('r90','r270');const r=mode==='auto'?(innerWidth>innerHeight?'90':'0'):mode;if(r==='90'||r==='270')root.classList.add('r'+r)}
addEventListener('resize',fit);fit()
const i=document.getElementById('i'),w=document.getElementById('w'),idb=document.getElementById('id')
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
  if (u.pathname === '/api/status') {
    const lan = lanAddresses()[0] ?? `http://localhost:${PORT}`, now = Date.now()
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
    return res.end(JSON.stringify({ online, version: PROGRAM_VERSION, session: lastSession, sent: lastSent, tables: [1, 2, 3, 4, 5, 6].map(n => ({ n, url: `${lan}/table/${n}`, local: `/table/${n}`, seen: lastSeen.has(String(n)) && now - lastSeen.get(String(n)) < 8000, label: tables.get(String(n))?.label ?? '' })) }))
  }
  if (u.pathname === '/quit' && req.method === 'POST') { res.writeHead(200); res.end('bye'); return setTimeout(() => process.exit(0), 200) }
  if (u.pathname === '/') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(statusPage()) }
  res.writeHead(404); res.end('Not found')
}).listen(PORT, '0.0.0.0', () => {
  console.log(`\nEventPilot Table Hub ${PROGRAM_VERSION} is running.\nOn each table PC, open in Chrome (then click once on the page, or press F11, for full screen). A landscape screen shows the card turned automatically; if it comes out upside down, add ?rotate=270 to the address once:`)
  for (const a of lanAddresses()) for (const n of [1, 2, 3, 4, 5, 6]) console.log(`   ${a}/table/${n}`)
  console.log('\nLeave this window open during the event. (On Windows, if asked, click "Allow access" so the table PCs can reach this laptop.)\n')
  openPage(`http://localhost:${PORT}/`)
}).on('error', e => { if (e.code === 'EADDRINUSE') { console.log('The Table Hub is already running. Opening its page.'); openPage(`http://localhost:${PORT}/`); setTimeout(() => process.exit(0), 500); return } console.error(e.message); process.exit(1) })

setInterval(poll, 2000); poll()
setInterval(beat, 5000); beat()
