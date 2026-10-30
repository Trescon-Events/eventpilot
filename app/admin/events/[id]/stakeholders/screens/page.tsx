'use client'

/* eslint-disable @next/next/no-img-element -- previews of arbitrary stored PNGs, deliberately unoptimised */

import { Suspense, use, useCallback, useEffect, useMemo, useState } from 'react'
import { flashTitle } from '@/app/lib/screens/alerts'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import PageHeader from '@/app/components/PageHeader'
import TableScreensConsole from '@/app/components/screens/TableScreensConsole'
import { Button, Input, Select } from '@/app/components/ui'
import { permissionSetSatisfies } from '@/app/lib/access/permission-match'

/* Stage Screens — one transparent PNG per session (topic + speaker cards, moderator tagged) for the AV team to lay over their video. Generated from the agenda
   and the speaker records, so a swap in the agenda just flags the screen "Changed" and one click redraws it. The AV team gets a private download link per stage. */

type Card = { speaker_id: string; moderator: boolean; text: CardText; base: CardText; has_photo: boolean; low_res: boolean }
type CardText = { name: string; title: string; company: string; country: string }
type Session = {
  id: string; title: string; topic: string; hide_topic: boolean; stage: string | null; track_id: string | null; date: string; start: string; end: string; format: string | null; status: string
  layout: string; fingerprint: string; state: 'new' | 'ready' | 'changed'; png_url: string | null; generated_at: string | null; width: number | null; height: number | null; low_res: string[]; file_name: string; cards: Card[]; reasons: string[]; starts_at: string | null; ends_at: string | null
}
type LinkRow = { id: string; track_id: string | null; label: string; token: string; kind: 'stage' | 'tables' }
type Data = {
  timezone: string; auto_redraw: boolean; sessions: Session[]; fonts: { id: string; family_name: string }[]; stages: { id: string; name: string }[]; links: LinkRow[]
  look: { panel: 'light' | 'dark'; dims: { photoW: number; photoH: number }; head_scale: number; font_id: string | null; font_name: string | null; background_url: string | null; text_color: string; accent_color: string }
}

const STATE_LABEL = { new: 'Not generated', ready: 'Up to date', changed: 'CHANGED — OUT OF DATE' } as const
const FLASH_CSS = `
@keyframes scflash { 0%,100% { box-shadow: 0 0 0 0 transparent; background: var(--card) } 50% { box-shadow: 0 0 0 8px var(--red); background: var(--red-light) } }
@keyframes scbanner { 0%,100% { filter: none } 50% { filter: brightness(1.45) } }
.sc-flash { animation: scflash 0.9s ease-in-out 14; }
.sc-banner { animation: scbanner 0.9s ease-in-out 14; }
@media (prefers-reduced-motion: reduce) { .sc-flash, .sc-banner { animation: none } }
`
const SHELL_CSS = `
.sc-shell { display: grid; grid-template-columns: 230px minmax(0, 1fr); gap: 24px; margin-top: 14px; align-items: start; }
.sc-nav { display: grid; gap: 8px; position: sticky; top: 12px; }
.sc-navitem { text-align: left; display: grid; gap: 2px; padding: 12px 14px; border-radius: 12px; border: 1.5px solid var(--border); background: var(--card); color: var(--ink); cursor: pointer; font-family: inherit; }
.sc-navitem.on { border-color: var(--teal); background: var(--surface); box-shadow: inset 4px 0 0 var(--teal); }
@media (max-width: 820px) { .sc-shell { grid-template-columns: 1fr; gap: 8px } .sc-nav { position: static; grid-template-columns: 1fr 1fr } }
`
const STATE_COLOR = { new: 'var(--ink3)', ready: 'var(--green)', changed: 'var(--red)' } as const
// The panel the graphic will sit on in the venue — previews only; the exported PNG itself is always transparent.
/* eslint-disable no-restricted-syntax */
const PANEL_BG = { light: '#FFFFFF', dark: '#0B1220' } as const
/* eslint-enable no-restricted-syntax */

export default function ScreensPage({ params }: { params: Promise<{ id: string }> }) {
  return <Suspense fallback={null}><ScreensView params={params} /></Suspense>   // useSearchParams (the left-hand menu's view) needs a Suspense boundary
}

function ScreensView({ params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = use(params)
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [perms, setPerms] = useState<Set<string>>(new Set())
  const [day, setDay] = useState('all')
  const [stage, setStage] = useState('all')
  const router = useRouter(), search = useSearchParams()
  const view: 'stage' | 'tables' = search.get('view') === 'tables' ? 'tables' : 'stage'
  const setView = (v: 'stage' | 'tables') => router.replace(`/admin/events/${eventId}/stakeholders/screens${v === 'tables' ? '?view=tables' : ''}`)
  const [busy, setBusy] = useState<Set<string>>(new Set())
  const [progress, setProgress] = useState<string | null>(null)
  const [editing, setEditing] = useState<Session | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const canEdit = permissionSetSatisfies(perms, 'sae.stakeholders.edit')

  const load = useCallback(async () => {
    const r = await fetch(`/api/events/screens?event_id=${eventId}`)
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { setError(d.error ?? 'Could not load the screens.'); return }
    setData(d)
  }, [eventId])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const [, p] = await Promise.all([load(), fetch(`/api/events/access/me?event_id=${eventId}`).then(x => x.json()).catch(() => ({}))])
      if (!cancelled) setPerms(new Set<string>((p as { permissions?: string[] }).permissions ?? []))
    })()
    return () => { cancelled = true }
  }, [eventId, load])

  // Something may change on another desk at any time (a swapped speaker, a new time): look again every 20 s, 5 s while screens are being redrawn.
  const changedCount = (data?.sessions ?? []).filter(s => s.state === 'changed').length
  useEffect(() => {
    const t = setInterval(() => { if (!document.hidden) void load() }, changedCount && data?.auto_redraw ? 5_000 : 20_000)
    return () => clearInterval(t)
  }, [load, changedCount, data?.auto_redraw])
  useEffect(() => {
    if (!changedCount) return
    return flashTitle(`(${changedCount}) CHANGED — Stage Screens`, 'Stage Screens')
  }, [changedCount])

  const days = useMemo(() => [...new Set((data?.sessions ?? []).map(s => s.date))].sort(), [data])
  const shown = useMemo(() => (data?.sessions ?? []).filter(s => (day === 'all' || s.date === day) && (stage === 'all' || s.track_id === stage)), [data, day, stage])
  const todo = shown.filter(s => s.state !== 'ready')
  const outOfDate = (data?.sessions ?? []).filter(s => s.state === 'changed')
  const [autoBusy, setAutoBusy] = useState(false)
  async function setAuto(on: boolean) {
    setAutoBusy(true)
    const r = await fetch('/api/events/screens/auto', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event_id: eventId, auto_redraw: on }) })
    if (!r.ok) setMsg((await r.json().catch(() => ({}))).error ?? 'Could not change auto-redraw.')
    await load(); setAutoBusy(false)
  }
  const panel = data?.look.panel ?? 'light'

  async function generate(ids: string[]) {
    setBusy(b => new Set([...b, ...ids])); setMsg(null)
    const failures: string[] = []
    for (let i = 0; i < ids.length; i += 3) {
      const chunk = ids.slice(i, i + 3)
      setProgress(`Drawing ${Math.min(i + chunk.length, ids.length)} of ${ids.length}…`)
      const r = await fetch('/api/events/screens', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event_id: eventId, session_ids: chunk }) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) failures.push(d.error ?? 'Could not generate.')
      else for (const f of d.failed ?? []) failures.push(f.error)
    }
    setProgress(null); setBusy(new Set())
    setMsg(failures.length ? `Some screens could not be drawn: ${[...new Set(failures)].join(' · ')}` : ids.length === 1 ? 'Done.' : `${ids.length} screens ready.`)
    await load()
  }

  if (error) return <div style={{ padding: '32px', color: 'var(--red)' }}>{error}</div>
  return (
    <div style={{ padding: '24px 32px 80px', maxWidth: '1280px', margin: '0 auto' }}>
      <PageHeader eyebrow="Stakeholder Hub" title="Stage Screens" description="Everything that appears on the screens at the venue: the main stage graphics, and the small screens on the speakers' tables." backHref={`/admin/events/${eventId}/stakeholders`} backLabel="Stakeholder Hub" />
      {!data ? <div style={{ color: 'var(--ink3)', padding: '24px 0' }}>Loading…</div> : (
        <div className="sc-shell">
          <style>{SHELL_CSS}</style>
          <nav className="sc-nav" aria-label="Screens">
            {([['stage', 'Main Stage', 'Stage graphics for the AV team', outOfDate.length], ['tables', 'Table Screens', 'Name cards for the speakers\' tables', 0]] as const).map(([k, l, sub, n]) => (
              <button key={k} onClick={() => setView(k)} aria-current={view === k ? 'page' : undefined} className={`sc-navitem${view === k ? ' on' : ''}`}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 800, fontSize: '14.5px' }}>{l}{n > 0 && <span style={{ background: 'var(--red)', color: 'white', borderRadius: '999px', fontSize: '11px', padding: '1px 7px' }}>{n}</span>}</span>
                <span style={{ fontSize: '12px', color: 'var(--ink3)', fontWeight: 600 }}>{sub}</span>
              </button>
            ))}
          </nav>
          <div className="sc-main">
          {msg && <div style={{ margin: '12px 0', padding: '10px 14px', borderRadius: '10px', background: 'var(--card)', border: '1px solid var(--border)', fontSize: '14px' }}>{msg}</div>}
          <style>{FLASH_CSS}</style>
          {view === 'stage' && (<>
          {outOfDate.length > 0 && (
            <div className="sc-banner" role="alert" style={{ position: 'sticky', top: 0, zIndex: 20, background: 'var(--red)', color: 'white', padding: '14px 18px', borderRadius: '12px', margin: '12px 0', display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 'clamp(16px, 2.2vw, 22px)', fontWeight: 900 }}>{outOfDate.length} {outOfDate.length === 1 ? 'SCREEN IS' : 'SCREENS ARE'} OUT OF DATE</span>
              <span style={{ fontSize: '14px' }}>{data.auto_redraw ? 'Redrawing automatically about a minute after the last change — the AV console is alerted when the new files are ready.' : 'The AV console still has the old content. Redraw them now.'}</span>
              <span style={{ flex: 1 }} />
              {canEdit && <Button variant="lime" disabled={!!progress} onClick={() => generate(outOfDate.map(s => s.id))}>{progress ?? `Redraw ${outOfDate.length} now`}</Button>}
            </div>
          )}
          <div style={{ margin: '14px 0', background: 'var(--card)', border: `1px solid ${data.auto_redraw ? 'var(--green)' : 'var(--border)'}`, borderRadius: '12px', padding: '10px 16px', display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap', fontSize: '13.5px' }}>
            <strong>Event-day mode</strong>
            <span style={{ color: data.auto_redraw ? 'var(--green)' : 'var(--ink3)', fontWeight: 800 }}>● Auto-redraw {data.auto_redraw ? 'ON' : 'OFF'}</span>
            <span style={{ color: 'var(--ink3)', flex: '1 1 280px' }}>When on, a screen whose agenda changed (design, text, speaker or timing) is redrawn by itself a minute after the last edit, and the AV console is alerted. Turn it on for the event days.</span>
            {canEdit && <Button variant={data.auto_redraw ? 'ghost' : 'teal'} disabled={autoBusy} onClick={() => setAuto(!data.auto_redraw)}>{data.auto_redraw ? 'Turn off' : 'Turn on'}</Button>}
          </div>
          <LookSummary look={data.look} eventId={eventId} />
          <LinksPanel kind="stage" data={data} eventId={eventId} canEdit={canEdit} onChanged={load} />

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center', margin: '22px 0 12px' }}>
            <Select value={day} onChange={e => setDay(e.target.value)} style={{ width: 'auto', minWidth: '170px' }}>
              <option value="all">All days</option>{days.map(d => <option key={d} value={d}>{d}</option>)}
            </Select>
            <Select value={stage} onChange={e => setStage(e.target.value)} style={{ width: 'auto', minWidth: '190px' }}>
              <option value="all">All stages</option>{data.stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
            <div style={{ flex: 1 }} />
            <span style={{ fontSize: '13px', color: 'var(--ink3)' }}>{shown.length} sessions · {todo.length} need drawing</span>
            {canEdit && <Button variant="teal" disabled={!todo.length || !!progress} onClick={() => generate(todo.map(s => s.id))}>{progress ?? `Generate ${todo.length} new / changed`}</Button>}
          </div>

          {!shown.length && <div style={{ color: 'var(--ink3)', padding: '20px 0' }}>No sessions with speakers yet. Add speakers to sessions in the Agenda and they appear here.</div>}
          <div style={{ display: 'grid', gap: '12px' }}>
            {shown.map(s => (
              <div key={`${s.id}:${s.state}`} className={s.state === 'changed' ? 'sc-flash' : undefined} style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 340px) 1fr', gap: '16px', background: 'var(--card)', border: `${s.state === 'changed' ? 3 : 1}px solid ${s.state === 'changed' ? 'var(--red)' : 'var(--border)'}`, borderRadius: '12px', padding: '12px' }}>
                <div style={{ position: 'relative', background: PANEL_BG[panel], border: '1px solid var(--border)', borderRadius: '8px', minHeight: '120px', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                  {/* A drawn file is shown as is; anything not drawn yet, or out of date, is a live preview with the current look and the live agenda. */}
                  <img src={s.state === 'ready' && s.png_url ? s.png_url : `/api/events/screens/preview?event_id=${eventId}&session_id=${s.id}&v=${s.fingerprint}`} alt={`Screen for ${s.title}`} loading="lazy" style={{ width: '100%', display: 'block' }} />
                  {s.state !== 'ready' && <span style={{ position: 'absolute', top: '6px', left: '6px', fontSize: '11px', fontWeight: 800, padding: '3px 8px', borderRadius: '999px', background: 'var(--amber)', color: 'var(--card)' }}>PREVIEW — not drawn yet</span>}
                </div>
                <div style={{ display: 'grid', gap: '6px', alignContent: 'start' }}>
                  <div style={{ fontSize: '12.5px', color: 'var(--ink3)', fontWeight: 700 }}>{s.date} · {s.start}–{s.end} · {s.stage ?? 'No stage'} · {s.layout} · {s.cards.length} on screen{s.status !== 'published' ? ' · draft session' : ''}</div>
                  <div style={{ fontSize: '16px', fontWeight: 800, lineHeight: 1.3 }}>{s.topic}</div>
                  <div style={{ fontSize: '13px', color: 'var(--ink2)' }}>{s.cards.map(c => `${c.text.name}${c.moderator ? ' (Moderator)' : ''}`).join(' · ')}</div>
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: s.state === 'changed' ? '16px' : '12.5px', fontWeight: 900, color: STATE_COLOR[s.state] }}>● {STATE_LABEL[s.state]}</span>
                    {s.generated_at && <span style={{ fontSize: '12px', color: 'var(--ink3)' }}>drawn {new Date(s.generated_at).toLocaleString()} · {s.width}×{s.height}px</span>}
                  </div>
                  {s.reasons.length > 0 && <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '13.5px', fontWeight: 700, color: 'var(--red)' }}>{s.reasons.map(r => <li key={r}>{r}</li>)}</ul>}
                  {s.low_res.length > 0 && <div style={{ fontSize: '12.5px', color: 'var(--amber)' }}>Low-resolution photo: {s.low_res.join(', ')} — will look soft on a big wall; ask for a better one.</div>}
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '4px' }}>
                    {canEdit && <Button variant={s.state === 'ready' ? 'ghost' : 'teal'} disabled={busy.has(s.id) || !!progress} onClick={() => generate([s.id])}>{busy.has(s.id) ? 'Drawing…' : s.png_url ? 'Regenerate' : 'Generate'}</Button>}
                    {canEdit && <Button variant="ghost" onClick={() => setEditing(s)}>Edit text</Button>}
                    {s.png_url && <Button variant="ghost" href={s.png_url} target="_blank" rel="noreferrer">Open full size</Button>}
                  </div>
                </div>
              </div>
            ))}
          </div>
          </>)}

          {view === 'tables' && (
            <div style={{ display: 'grid', gap: '14px', marginTop: '14px' }}>
              <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '14px 16px', fontSize: '14px', lineHeight: 1.65 }}>
                <strong>Table Screens</strong> are the small portrait screens on the side tables, one per speaker: the name, and a Moderator tag for the moderator, on the event&apos;s branding.
                <ol style={{ margin: '8px 0 0', paddingLeft: '20px', color: 'var(--ink2)' }}>
                  <li><strong>Design</strong> — the branding team builds the card (and a standby screen) in <Link href={`/admin/events/${eventId}/creative-templates/admin`} style={{ fontWeight: 800, color: 'var(--teal-mid)' }}>Admin Console › Variants › Table Screen</Link>.</li>
                  <li><strong>Technician link</strong> — send the link below to the technician. No login.</li>
                  <li><strong>On the day</strong> — the stage manager tells the technician which table is in which seat; he picks the session, types the table order, checks the cards and downloads them for his app.</li>
                </ol>
              </div>
              <LinksPanel kind="tables" data={data} eventId={eventId} canEdit={canEdit} onChanged={load} />
              <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '14px 16px' }}>
                <div style={{ fontWeight: 800, fontSize: '14.5px' }}>Preview — exactly what the technician sees</div>
                <div style={{ fontSize: '13px', color: 'var(--ink3)', margin: '2px 0 12px' }}>Use it to check the design and the names before you send the link, or to download the cards yourself.</div>
                <TableScreensConsole apiBase="/api/events/screens/tables" query={`event_id=${eventId}`} showStage />
              </div>
            </div>
          )}
          </div>
        </div>
      )}
      {editing && <EditModal session={editing} eventId={eventId} onClose={() => setEditing(null)} onSaved={async () => { setEditing(null); await load() }} />}
    </div>
  )
}

/** The look is defined by the branding team in the SAE Admin Console; here it is only shown, with a way to go and change it. */
function LookSummary({ look, eventId }: { look: Data['look']; eventId: string }) {
  return (
    <div style={{ margin: '14px 0', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '10px 16px', display: 'flex', gap: '10px 16px', flexWrap: 'wrap', alignItems: 'center', fontSize: '13.5px' }}>
      <strong>Look</strong>
      <span>{look.panel === 'dark' ? 'Dark bg' : 'White bg'} · head size {Math.round(look.head_scale * 100)}% · photo {look.dims.photoW}×{look.dims.photoH} · font {look.font_name ?? '(default)'}</span>
      <span style={{ flex: 1 }} />
      <Link href={`/admin/events/${eventId}/creative-templates/admin?tab=stage`} style={{ fontWeight: 800, color: 'var(--teal-mid)' }}>Change in Admin Console → Stage Speaker Pic</Link>
    </div>
  )
}

function LinksPanel({ kind, data, eventId, canEdit, onChanged }: { kind: 'stage' | 'tables'; data: Data; eventId: string; canEdit: boolean; onChanged: () => void }) {
  const links = data.links.filter(l => l.kind === kind)
  const [stage, setStage] = useState('')
  const [copied, setCopied] = useState<string | null>(null)
  const url = (t: string) => `${typeof window === 'undefined' ? '' : window.location.origin}/public/screens/${t}`
  async function create() {
    await fetch('/api/events/screens/links', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event_id: eventId, kind, track_id: kind === 'stage' ? stage || null : null, ...(kind === 'tables' ? { label: 'Table screens — technician' } : {}) }) })
    onChanged()
  }
  async function revoke(id: string) {
    if (!window.confirm('Switch this link off? Anyone using it loses access immediately.')) return
    await fetch('/api/events/screens/links', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event_id: eventId, id }) })
    onChanged()
  }
  return (
    <details open style={{ margin: '14px 0', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '12px 16px' }}>
      <summary style={{ cursor: 'pointer', fontWeight: 800, fontSize: '14.5px' }}>{kind === 'tables' ? 'Technician link' : 'AV team links'} ({links.length})</summary>
      <div style={{ fontSize: '13px', color: 'var(--ink3)', margin: '8px 0 10px' }}>{kind === 'tables' ? 'Send this link to the technician. He opens it, picks the session, types the table order and downloads the name cards for the table screens — no login. Switch it off any time.' : 'Send a stage\'s link to its AV console. They open it, see the latest PNG for each session in time order, and download — no login. Switch a link off any time.'}</div>
      {links.map(l => (
        <div key={l.id} style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', padding: '6px 0', borderTop: '1px solid var(--border-light)' }}>
          <strong style={{ minWidth: '150px', fontSize: '14px' }}>{l.label}</strong>
          <code style={{ fontSize: '12px', color: 'var(--ink2)', wordBreak: 'break-all', flex: '1 1 260px' }}>{url(l.token)}</code>
          <Button variant="ghost" onClick={() => { void navigator.clipboard.writeText(url(l.token)); setCopied(l.id); setTimeout(() => setCopied(null), 1500) }}>{copied === l.id ? 'Copied' : 'Copy link'}</Button>
          {canEdit && <Button variant="red" onClick={() => revoke(l.id)}>Switch off</Button>}
        </div>
      ))}
      {canEdit && (
        <div style={{ display: 'flex', gap: '8px', marginTop: '10px', flexWrap: 'wrap' }}>
          {kind === 'stage' && (
            <Select value={stage} onChange={e => setStage(e.target.value)} style={{ width: 'auto', minWidth: '220px' }}>
              <option value="">All stages (one link)</option>{data.stages.map(s => <option key={s.id} value={s.id}>{s.name} only</option>)}
            </Select>
          )}
          {!(kind === 'tables' && links.length > 0) && <Button variant="teal" onClick={create}>{kind === 'tables' ? 'Create technician link' : 'Create link'}</Button>}
        </div>
      )}
    </details>
  )
}

function EditModal({ session, eventId, onClose, onSaved }: { session: Session; eventId: string; onClose: () => void; onSaved: () => void }) {
  const [topic, setTopic] = useState(session.topic !== session.title ? session.topic : '')
  const [hide, setHide] = useState(session.hide_topic)
  const [cards, setCards] = useState<Record<string, Partial<CardText>>>(() => Object.fromEntries(session.cards.map(c => [c.speaker_id, Object.fromEntries((Object.keys(c.text) as (keyof CardText)[]).filter(k => c.text[k] !== c.base[k]).map(k => [k, c.text[k]]))])))
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  async function save() {
    setSaving(true); setErr(null)
    const r = await fetch('/api/events/screens', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event_id: eventId, session_id: session.id, overrides: { topic, hide_topic: hide, cards } }) })
    if (!r.ok) { setErr((await r.json().catch(() => ({}))).error ?? 'Could not save.'); setSaving(false); return }
    onSaved()
  }
  const set = (id: string, k: keyof CardText, v: string, base: string) => setCards(c => { const cur = { ...(c[id] ?? {}) }; if (v === base) delete cur[k]; else cur[k] = v; return { ...c, [id]: cur } })
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--overlay-scrim)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px', padding: '22px', width: 'min(720px, 100%)', maxHeight: '90vh', overflow: 'auto' }}>
        <div style={{ fontSize: '17px', fontWeight: 900 }}>Edit this screen only</div>
        <div style={{ fontSize: '13px', color: 'var(--ink3)', margin: '4px 0 14px' }}>Changes apply to this session&apos;s graphic. The speaker&apos;s own record and the agenda are not touched. Leave a box as it is to keep the original.</div>
        <label style={{ fontSize: '12px', fontWeight: 800, color: 'var(--ink3)' }}>Topic (agenda title: {session.title})</label>
        <Input value={topic} onChange={e => setTopic(e.target.value)} placeholder={session.title} disabled={hide} />
        <label style={{ display: 'flex', gap: '8px', alignItems: 'center', fontSize: '13.5px', margin: '8px 0 14px' }}><input type="checkbox" checked={hide} onChange={e => setHide(e.target.checked)} /> Don&apos;t show the topic on this screen</label>
        {session.cards.map(c => (
          <div key={c.speaker_id} style={{ borderTop: '1px solid var(--border-light)', padding: '10px 0', display: 'grid', gap: '6px' }}>
            <div style={{ fontWeight: 800, fontSize: '14px' }}>{c.base.name}{c.moderator ? ' — Moderator' : ''}{!c.has_photo ? ' — no photo yet' : ''}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '8px' }}>
              {(['name', 'title', 'company', 'country'] as const).map(k => <Input key={k} aria-label={k} placeholder={c.base[k] || k} value={cards[c.speaker_id]?.[k] ?? c.base[k]} onChange={e => set(c.speaker_id, k, e.target.value, c.base[k])} />)}
            </div>
          </div>
        ))}
        {err && <div style={{ color: 'var(--red)', fontSize: '13px', marginTop: '8px' }}>{err}</div>}
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '14px' }}>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="teal" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save'}</Button>
        </div>
      </div>
    </div>
  )
}
