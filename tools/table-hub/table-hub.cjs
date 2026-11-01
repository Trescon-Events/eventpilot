// EventPilot Table Hub — runs on the technician's laptop.
// It asks EventPilot every 2 seconds what each table should show, keeps those pictures on this laptop, and serves them to the table PCs over the local network:
//   http://<this laptop's address>:8080/table/1   …   /table/6      (open in Chrome on each table PC, press F11 or click once for full screen)
// The table PCs need no internet. Once a picture is here it keeps showing even if the internet drops. If this program stops answering (laptop hung, restarted, program closed) every table page switches by itself to the standby
// picture it already holds, after 6 s of no answer, and goes back to the right picture as soon as the program is back at the same address. Needs Node.js 18 or newer. No other installs.
const http = require('node:http')
const os = require('node:os')
const fs = require('node:fs')
const path = require('node:path')
const { createHash } = require('node:crypto')

const PROGRAM_VERSION = 3
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
const REV0 = Date.now()       // revisions count up from the start time, so after a restart a table page never mistakes a new picture for one it already has
let standbyKey = null, ready = false   // ready = EventPilot has been reached at least once since this start (until then the table pages keep what they show)
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

let replaced = false   // EventPilot says this link no longer exists (switched off / replaced by a new one)
let lastSeq = -1, online = false, lastSession = '', lastSent = ''
async function poll() {
  try {
    const r = await fetch(`${link}/tables/live`, { cache: 'no-store' })
    if (r.status === 404) { if (!replaced) log('This link was switched off or replaced. Download the Table Hub again from the new link on the Table Screens page.'); replaced = true; online = false; return }
    if (!r.ok) throw new Error(`EventPilot answered ${r.status}`)
    const v = await r.json()
    replaced = false
    if (!online) { online = true; log('Connected to EventPilot.') }
    const identifyLeft = v.state?.identify_until ? v.state.identify_until - v.server_now : 0
    try { standbyKey = await getImage('/tables/card?standby=1' + (v.state?.standby_template ? '&template=' + encodeURIComponent(v.state.standby_template) : '')) } catch { /* keep the last one */ }
    ready = true
    for (const [n, t] of Object.entries(v.state?.tables ?? {})) {
      let key = null
      if (t.mode !== 'blank' && t.img) { try { key = await getImage(t.img) } catch (e) { log(`Table ${n}: could not get the picture (${e.message}) — keeping what it shows`); continue } }
      const cur = tables.get(n)
      if (!cur || cur.key !== key || cur.mode !== t.mode) tables.set(n, { rev: (cur?.rev ?? REV0) + 1, mode: t.mode, key, label: t.mode === 'card' ? t.name : t.mode, identifyUntil: 0 })
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


// ---- Start by itself when this computer starts (on by default the first time; the switch at the bottom of the page turns it off) ----
const stateFile = path.join(cacheDir, 'hub-settings.json')
const readState = () => { try { return JSON.parse(fs.readFileSync(stateFile, 'utf8')) } catch { return {} } }
const writeState = o => { try { fs.writeFileSync(stateFile, JSON.stringify({ ...readState(), ...o })) } catch { /* not fatal */ } }
const startCmd = () => (isSea ? [process.execPath] : [process.execPath, process.argv[1]])
const winEntry = () => path.join(process.env.APPDATA || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup', 'TableHub.cmd')
const macEntry = () => path.join(os.homedir(), 'Library', 'LaunchAgents', 'com.trescon.tablehub.plist')
const esc = x => String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;')
function writeEntry() {
  try {
    const cmd = startCmd()
    if (process.platform === 'win32') {
      if (!process.env.APPDATA) return
      fs.mkdirSync(path.dirname(winEntry()), { recursive: true })
      fs.writeFileSync(winEntry(), `@echo off\r\ncd /d "${here}"\r\nstart "Table Hub" ${cmd.map(c => `"${c}"`).join(' ')}\r\n`)
    } else if (process.platform === 'darwin') {
      fs.mkdirSync(path.dirname(macEntry()), { recursive: true })
      fs.writeFileSync(macEntry(), `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict>\n<key>Label</key><string>com.trescon.tablehub</string>\n<key>ProgramArguments</key><array>${cmd.map(c => `<string>${esc(c)}</string>`).join('')}</array>\n<key>WorkingDirectory</key><string>${esc(here)}</string>\n<key>RunAtLoad</key><true/>\n<key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict>\n<key>StandardOutPath</key><string>/tmp/table-hub.log</string><key>StandardErrorPath</key><string>/tmp/table-hub.log</string>\n</dict></plist>\n`)
    }
  } catch { /* not fatal */ }
}
function removeEntry() { try { fs.rmSync(process.platform === 'win32' ? winEntry() : macEntry(), { force: true }) } catch { /* not fatal */ } }
const autostartOn = () => readState().autostart === true
function setAutostart(on) { writeState({ autostart: on }); if (on) writeEntry(); else removeEntry() }
if (readState().autostart === undefined) setAutostart(true)   // first run on this computer
else if (autostartOn()) writeEntry()                          // keeps the entry pointing at this copy of the program

// If this computer got a different network address since last time, the table PCs' saved addresses no longer work — say so on the page.
let addrChanged = null
{ const a = lanAddresses()[0] ?? null, was = readState().lan ?? null; if (a && was && a !== was) addrChanged = { was, now: a }; if (a) writeState({ lan: a }) }

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
<section id="warn" class="now" style="display:none;border-color:#f2b84b88"></section>
<section class="now"><div class="label">Now showing</div><div class="t" id="nowT">Nothing sent yet</div><div class="s" id="nowS">Choose a session on the Table Screens page in EventPilot, then press Send to tables.</div></section>
<div class="label" style="margin-bottom:10px">Table screens</div><div class="grid" id="grid"></div>
<details><summary>How to set up a table PC</summary><p>On each table PC open Chrome, go to that table's address (use Copy address), then click once on the page, or press F11, for full screen. A landscape screen turns the card by itself. If a card comes out upside down, add <code>?rotate=270</code> to that address once. The table PCs and this computer must be on the same network. Keep this program running during the event; closing this window does not stop it.</p></details>
<footer><span id="ver"></span><label style="display:flex;gap:6px;align-items:center;cursor:pointer"><input type="checkbox" id="auto" onchange="fetch('/api/autostart',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({on:this.checked})})"> Start by itself when this computer starts</label><button class="quit" onclick="if(confirm('Stop the Table Hub? The table screens will switch to their standby screen.'))fetch('/quit',{method:'POST'}).then(()=>{document.body.innerHTML='<main><h1>Table Hub stopped</h1><p class=sub>Open the app again to start it.</p></main>'})">Quit Table Hub</button></footer>
<script>
const $=id=>document.getElementById(id)
async function copy(u,b){try{await navigator.clipboard.writeText(u);const t=b.textContent;b.textContent='Copied';setTimeout(()=>b.textContent=t,1200)}catch(e){prompt('Copy this address',u)}}
document.addEventListener('click',e=>{const b=e.target.closest&&e.target.closest('button.cp');if(b)copy(b.dataset.u,b)})
async function tick(){try{const s=await (await fetch('/api/status',{cache:'no-store'})).json()
$('top').className='status '+(s.online?'ok':'bad');$('top').innerHTML='<span class="dot"></span>'+(s.online?'Connected to EventPilot':s.replaced?'Link switched off':'No connection to EventPilot')
const wa=$('warn');if(s.addrChanged){wa.style.display='block';wa.innerHTML='<div class="label" style="color:#f2b84b">Address changed</div><div class="s">This computer\\'s network address changed from '+s.addrChanged.was+' to '+s.addrChanged.now+'. The table PCs still point at the old address and will stay on the standby screen. Open each table\\'s new address (below) on its PC, or ask IT to reserve a fixed address for this computer.</div>'}else wa.style.display='none'
$('auto').checked=!!s.autostart
$('ver').textContent='Table Hub v'+s.version+(s.online?'':' · tables keep their last picture until the connection returns')
$('nowT').textContent=s.replaced?'This Table Hub is using an old link':(s.session||'Nothing sent yet');$('nowS').textContent=s.replaced?'The technician link was switched off or replaced. Open the new technician link in EventPilot (Table Screens page) and download the Table Hub again. The tables keep their last picture meanwhile.':s.session?(s.sent?'Sent '+new Date(s.sent).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}):''):'Choose a session on the Table Screens page in EventPilot, then press Send to tables.'
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
// Standby on its own: the page keeps the standby picture in memory (sent along by the hub while it is healthy). If the hub does not answer for 6 s in a row (a failed or timed-out request counts; one slow answer does not),
// the standby picture is shown; the first good answer afterwards puts the right picture back. Only requests that actually fail count, so a throttled background tab can never trigger it, and a hub that has just
// restarted and has not reached EventPilot yet (ready:false) changes nothing.
let sbKey='',sbUrl='',sbBusy=false,failSince=0,onStandby=false
async function loadStandby(k){if(sbBusy)return;sbBusy=true;try{const r=await fetch('/img/'+k,{cache:'no-store'});if(r.ok){const u=URL.createObjectURL(await r.blob());const old=sbUrl;sbUrl=u;sbKey=k;if(old)setTimeout(()=>URL.revokeObjectURL(old),5000);if(onStandby)i.src=sbUrl}}catch(e){}sbBusy=false}
async function tick(){const ac=new AbortController(),to=setTimeout(()=>ac.abort(),2500)
 try{const s=await (await fetch('/table/'+N+'/state',{cache:'no-store',signal:ac.signal})).json();clearTimeout(to);failSince=0
 if(s.standbyKey&&s.standbyKey!==sbKey)loadStandby(s.standbyKey)
 if(s.ready===false){}
 else{if(onStandby){onStandby=false;rev=-1}
 if(s.rev!==rev){rev=s.rev;if(s.key){i.src='/img/'+s.key;i.style.display='block';w.style.display='none'}else if(s.mode==='blank'){i.style.display='none';w.style.display='none'}else{i.style.display='none';w.style.display='flex'}}}
 until=s.identifyLeft>0?Date.now()+s.identifyLeft:0}catch(e){clearTimeout(to);const now=Date.now();if(!failSince)failSince=now
 if(now-failSince>=6000&&!onStandby&&sbUrl){onStandby=true;i.src=sbUrl;i.style.display='block';w.style.display='none';until=0}}
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
    return res.end(JSON.stringify(t ? { ready, standbyKey, rev: t.rev, mode: t.mode, key: t.key, identifyLeft: t.identifyUntil ? t.identifyUntil - Date.now() : 0 } : { ready, standbyKey, rev: 0, mode: 'waiting', key: null, identifyLeft: 0 }))
  }
  if ((m = u.pathname.match(/^\/img\/([0-9a-f]{16})$/)) && images.has(m[1])) { res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=31536000, immutable' }); return res.end(images.get(m[1])) }
  if (u.pathname === '/api/status') {
    const lan = lanAddresses()[0] ?? `http://localhost:${PORT}`, now = Date.now()   // (addrChanged / autostart below)
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
    return res.end(JSON.stringify({ online, replaced, addrChanged, autostart: autostartOn(), version: PROGRAM_VERSION, session: lastSession, sent: lastSent, tables: [1, 2, 3, 4, 5, 6].map(n => ({ n, url: `${lan}/table/${n}`, local: `/table/${n}`, seen: lastSeen.has(String(n)) && now - lastSeen.get(String(n)) < 8000, label: tables.get(String(n))?.label ?? '' })) }))
  }
  if (u.pathname === '/api/autostart' && req.method === 'POST') { let b = ''; req.on('data', c => { b += c }); req.on('end', () => { let on = false; try { on = JSON.parse(b).on === true } catch { /* off */ } setAutostart(on); res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ autostart: autostartOn() })) }); return }
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
