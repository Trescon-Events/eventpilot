'use client'

/* eslint-disable @next/next/no-img-element -- previews of arbitrary stored PNGs, deliberately unoptimised */

import { use, useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import PageHeader from '@/app/components/PageHeader'
import { Button, Input, Select } from '@/app/components/ui'
import { permissionSetSatisfies } from '@/app/lib/access/permission-match'

/* Stage Screens — one transparent PNG per session (topic + speaker cards, moderator tagged) for the AV team to lay over their video. Generated from the agenda
   and the speaker records, so a swap in the agenda just flags the screen "Changed" and one click redraws it. The AV team gets a private download link per stage. */

type Card = { speaker_id: string; moderator: boolean; text: CardText; base: CardText; has_photo: boolean; low_res: boolean }
type CardText = { name: string; title: string; company: string; country: string }
type Session = {
  id: string; title: string; topic: string; hide_topic: boolean; stage: string | null; track_id: string | null; date: string; start: string; end: string; format: string | null; status: string
  layout: string; fingerprint: string; state: 'new' | 'ready' | 'changed'; png_url: string | null; generated_at: string | null; width: number | null; height: number | null; low_res: string[]; file_name: string; cards: Card[]
}
type LinkRow = { id: string; track_id: string | null; label: string; token: string }
type Data = {
  timezone: string; sessions: Session[]; fonts: { id: string; family_name: string }[]; stages: { id: string; name: string }[]; links: LinkRow[]
  look: { panel: 'light' | 'dark'; dims: { photoW: number; photoH: number }; head_scale: number; font_id: string | null; font_name: string | null; background_url: string | null; text_color: string; accent_color: string }
}

const STATE_LABEL = { new: 'Not generated', ready: 'Up to date', changed: 'Changed — regenerate' } as const
const STATE_COLOR = { new: 'var(--ink3)', ready: 'var(--green)', changed: 'var(--amber)' } as const
// The panel the graphic will sit on in the venue — previews only; the exported PNG itself is always transparent.
/* eslint-disable no-restricted-syntax */
const PANEL_BG = { light: '#FFFFFF', dark: '#0B1220' } as const
/* eslint-enable no-restricted-syntax */

export default function ScreensPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = use(params)
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [perms, setPerms] = useState<Set<string>>(new Set())
  const [day, setDay] = useState('all')
  const [stage, setStage] = useState('all')
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

  const days = useMemo(() => [...new Set((data?.sessions ?? []).map(s => s.date))].sort(), [data])
  const shown = useMemo(() => (data?.sessions ?? []).filter(s => (day === 'all' || s.date === day) && (stage === 'all' || s.track_id === stage)), [data, day, stage])
  const todo = shown.filter(s => s.state !== 'ready')
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
      <PageHeader eyebrow="Stakeholder Hub" title="Stage Screens" description="A transparent PNG for every session — topic and speaker cards, moderator tagged — for the AV team to lay over the stage video. Built from the agenda and the speaker records, so a change in the agenda just flags the screen to redraw." backHref={`/admin/events/${eventId}/stakeholders`} backLabel="Stakeholder Hub" />
      {!data ? <div style={{ color: 'var(--ink3)', padding: '24px 0' }}>Loading…</div> : (
        <>
          {msg && <div style={{ margin: '12px 0', padding: '10px 14px', borderRadius: '10px', background: 'var(--card)', border: '1px solid var(--border)', fontSize: '14px' }}>{msg}</div>}
          <LookSummary look={data.look} eventId={eventId} />
          <LinksPanel data={data} eventId={eventId} canEdit={canEdit} onChanged={load} />

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
              <div key={s.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 340px) 1fr', gap: '16px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '12px' }}>
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
                    <span style={{ fontSize: '12.5px', fontWeight: 800, color: STATE_COLOR[s.state] }}>● {STATE_LABEL[s.state]}</span>
                    {s.generated_at && <span style={{ fontSize: '12px', color: 'var(--ink3)' }}>drawn {new Date(s.generated_at).toLocaleString()} · {s.width}×{s.height}px</span>}
                  </div>
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
        </>
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

function LinksPanel({ data, eventId, canEdit, onChanged }: { data: Data; eventId: string; canEdit: boolean; onChanged: () => void }) {
  const [stage, setStage] = useState('')
  const [copied, setCopied] = useState<string | null>(null)
  const url = (t: string) => `${typeof window === 'undefined' ? '' : window.location.origin}/public/screens/${t}`
  async function create() {
    await fetch('/api/events/screens/links', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event_id: eventId, track_id: stage || null }) })
    onChanged()
  }
  async function revoke(id: string) {
    if (!window.confirm('Switch this link off? Anyone using it loses access immediately.')) return
    await fetch('/api/events/screens/links', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event_id: eventId, id }) })
    onChanged()
  }
  return (
    <details open style={{ margin: '14px 0', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '12px 16px' }}>
      <summary style={{ cursor: 'pointer', fontWeight: 800, fontSize: '14.5px' }}>AV team links ({data.links.length})</summary>
      <div style={{ fontSize: '13px', color: 'var(--ink3)', margin: '8px 0 10px' }}>Send a stage&apos;s link to its AV console. They open it, see the latest PNG for each session in time order, and download — no login. Switch a link off any time.</div>
      {data.links.map(l => (
        <div key={l.id} style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', padding: '6px 0', borderTop: '1px solid var(--border-light)' }}>
          <strong style={{ minWidth: '150px', fontSize: '14px' }}>{l.label}</strong>
          <code style={{ fontSize: '12px', color: 'var(--ink2)', wordBreak: 'break-all', flex: '1 1 260px' }}>{url(l.token)}</code>
          <Button variant="ghost" onClick={() => { void navigator.clipboard.writeText(url(l.token)); setCopied(l.id); setTimeout(() => setCopied(null), 1500) }}>{copied === l.id ? 'Copied' : 'Copy link'}</Button>
          {canEdit && <Button variant="red" onClick={() => revoke(l.id)}>Switch off</Button>}
        </div>
      ))}
      {canEdit && (
        <div style={{ display: 'flex', gap: '8px', marginTop: '10px', flexWrap: 'wrap' }}>
          <Select value={stage} onChange={e => setStage(e.target.value)} style={{ width: 'auto', minWidth: '220px' }}>
            <option value="">All stages (one link)</option>{data.stages.map(s => <option key={s.id} value={s.id}>{s.name} only</option>)}
          </Select>
          <Button variant="teal" onClick={create}>Create link</Button>
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
