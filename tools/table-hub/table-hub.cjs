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


const statusPage = () => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Table Hub</title>
<style>
:root{--bg:#0b1220;--panel:#131c2e;--line:#22304a;--ink:#eaf0fa;--dim:#8fa1bd;--teal:#19c3b1;--red:#ef5b5b;--amber:#f2b84b}
*{box-sizing:border-box}html,body{margin:0;height:100%}body{font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,system-ui,sans-serif;background:radial-gradient(1200px 500px at 80% -10%,#16314a 0,transparent 60%),var(--bg);color:var(--ink);-webkit-font-smoothing:antialiased}
main{max-width:880px;margin:0 auto;padding:26px 24px 40px}
header{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:22px}
.brand{display:flex;align-items:center;gap:12px}.logo{width:38px;height:38px;border-radius:11px;background:linear-gradient(135deg,var(--teal),#2a7de1);display:grid;place-items:center;font-weight:900;color:#fff;font-size:18px}
h1{font-size:20px;margin:0;letter-spacing:-.2px}.sub{color:var(--dim);font-size:13px}
.status{display:flex;align-items:center;gap:8px;padding:8px 14px;border-radius:999px;background:var(--panel);border:1px solid var(--line);font-weight:700;font-size:13.5px}
.dot{width:9px;height:9px;border-radius:50%;background:var(--dim)}.ok .dot{background:var(--teal);box-shadow:0 0 0 4px #19c3b133}.bad .dot{background:var(--red);box-shadow:0 0 0 4px #ef5b5b33}
.now{background:linear-gradient(180deg,#16233a,#111a2b);border:1px solid var(--line);border-radius:16px;padding:18px 20px;margin-bottom:22px}
.label{color:var(--dim);font-size:12px;font-weight:700;letter-spacing:.8px;text-transform:uppercase}.now .t{font-size:19px;font-weight:700;margin-top:4px;line-height:1.3}.now .s{color:var(--dim);font-size:13px;margin-top:4px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:14px}
.tile{background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:16px;display:grid;gap:10px}.tile.on{border-color:#19c3b155}
.top{display:flex;align-items:center;justify-content:space-between}.num{font-size:15px;font-weight:800}.chip{font-size:11.5px;font-weight:800;padding:3px 10px;border-radius:999px;background:#22304a;color:var(--dim);white-space:nowrap}.on .chip{background:#19c3b122;color:var(--teal)}
.who{min-height:42px;font-size:17px;font-weight:700;line-height:1.25;word-break:break-word}.who.empty{color:var(--dim);font-weight:500;font-size:14px}
.addr{font:12px ui-monospace,Menlo,Consolas,monospace;color:var(--dim);word-break:break-all}
.btns{display:flex;gap:8px}button,a.btn{font:inherit;font-size:13px;font-weight:700;padding:8px 12px;border-radius:10px;border:1px solid var(--line);background:#1a2740;color:var(--ink);cursor:pointer;text-decoration:none;flex:1;text-align:center}button:hover,a.btn:hover{background:#21314f}
details{margin-top:22px;color:var(--dim);font-size:13.5px}summary{cursor:pointer;font-weight:700;color:var(--ink)}details p{margin:8px 0 0}code{background:#0d1626;padding:2px 7px;border-radius:6px;color:#cfe0f7}
footer{margin-top:26px;display:flex;justify-content:space-between;align-items:center;color:var(--dim);font-size:12.5px;gap:10px;flex-wrap:wrap}button.quit{flex:none;color:#ff9a9a;border-color:#4a2a33;background:transparent}
</style></head><body><main>
<header><div class="brand"><div class="logo">T</div><div><h1>Table Hub</h1><div class="sub">Shows each speaker's card on their table screen</div></div></div><div id="top" class="status"><span class="dot"></span>Starting…</div></header>
<section class="now"><div class="label">Now showing</div><div class="t" id="nowT">Nothing sent yet</div><div class="s" id="nowS">Choose a session on the Table Screens page in EventPilot, then press Send to tables.</div></section>
<div class="label" style="margin-bottom:10px">Table screens</div><div class="grid" id="grid"></div>
<details><summary>How to set up a table PC</summary><p>On each table PC open Chrome, go to that table's address (use Copy address), then click once on the page, or press F11, for full screen. A landscape screen turns the card by itself. If a card comes out upside down, add <code>?rotate=270</code> to that address once. The table PCs and this computer must be on the same network. Keep this program running during the event; closing this window does not stop it.</p></details>
<footer><span id="ver"></span><button class="quit" onclick="if(confirm('Stop the Table Hub? The table screens keep their last picture but stop updating.'))fetch('/quit',{method:'POST'}).then(()=>{document.body.innerHTML='<main><h1>Table Hub stopped</h1><p class=sub>Open the app again to start it.</p></main>'})">Quit Table Hub</button></footer>
<script>
const $=id=>document.getElementById(id)
async function copy(u,b){try{await navigator.clipboard.writeText(u);const t=b.textContent;b.textContent='Copied';setTimeout(()=>b.textContent=t,1200)}catch(e){prompt('Copy this address',u)}}
document.addEventListener('click',e=>{const b=e.target.closest&&e.target.closest('button.cp');if(b)copy(b.dataset.u,b)})
async function tick(){try{const s=await (await fetch('/api/status',{cache:'no-store'})).json()
$('top').className='status '+(s.online?'ok':'bad');$('top').innerHTML='<span class="dot"></span>'+(s.online?'Connected to EventPilot':'No connection to EventPilot')
$('ver').textContent='Table Hub v'+s.version+(s.online?'':' · tables keep their last picture until the connection returns')
$('nowT').textContent=s.session||'Nothing sent yet';$('nowS').textContent=s.session?(s.sent?'Sent '+new Date(s.sent).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}):''):'Choose a session on the Table Screens page in EventPilot, then press Send to tables.'
$('grid').innerHTML=s.tables.map(t=>'<div class="tile '+(t.seen?'on':'')+'"><div class="top"><span class="num">Table '+t.n+'</span><span class="chip">'+(t.seen?'Screen online':'Not opened yet')+'</span></div><div class="who '+(t.label?'':'empty')+'">'+(t.label?t.label.replace(/</g,'&lt;'):'Nothing sent yet')+'</div><div class="addr">'+t.url+'</div><div class="btns"><button class="cp" data-u="'+t.url+'">Copy address</button><a class="btn" target="_blank" href="'+t.local+'">Preview</a></div></div>').join('')
}catch(e){$('top').className='status bad';$('top').innerHTML='<span class="dot"></span>Table Hub is not running'}}
tick();setInterval(tick,2000)
</script></main></body></html>`

// Opens the hub's page in its own app window (no tabs, no address bar) using Chrome or Edge, which these computers already have; falls back to the normal browser.
const openPage = url => {
  if (NO_OPEN) return
  const { spawn, spawnSync } = require('node:child_process')
  const profile = path.join(here, 'table-hub-window')
  const flags = [`--app=${url}`, `--user-data-dir=${profile}`, '--window-size=960,820', '--no-first-run', '--no-default-browser-check', '--disable-features=Translate']
  const candidates = process.platform === 'win32'
    ? ['LOCALAPPDATA', 'PROGRAMFILES', 'PROGRAMFILES(X86)'].flatMap(v => process.env[v] ? [path.join(process.env[v], 'Google/Chrome/Application/chrome.exe'), path.join(process.env[v], 'Microsoft/Edge/Application/msedge.exe')] : [])
    : process.platform === 'darwin'
      ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser']
      : ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/microsoft-edge']
  const browser = candidates.find(c => { try { return fs.existsSync(c) } catch { return false } })
  try {
    if (browser) { spawn(browser, flags, { stdio: 'ignore', detached: true }).unref(); return }
    const [cmd, args] = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]] : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]]
    spawn(cmd, args, { stdio: 'ignore', detached: true }).unref()
  } catch { /* the address is printed anyway */ }
  void spawnSync
}

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
