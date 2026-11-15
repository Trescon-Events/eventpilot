'use client'

/* eslint-disable @next/next/no-img-element -- previews of arbitrary stored images, deliberately unoptimised */

import { use, useCallback, useEffect, useMemo, useState } from 'react'
import PageHeader from '@/app/components/PageHeader'
import { Button, Input, Select } from '@/app/components/ui'

/* Session thumbnails — one YouTube thumbnail per agenda session, made from the agenda and the speaker records (docs/build_suggestions/session-thumbnails.md).
   Producers generate, edit text for one session only (overrides: the agenda and speaker records are never touched), approve, and download. */

type Issue = { level: 'attention' | 'error' | 'warning'; text: string; speaker_id?: string }
type Overrides = { title?: string; tag?: string; hide_tag?: boolean; cards?: Record<string, { name?: string; company?: string }>; exclude?: string[]; order?: string[] }
type Card = { speaker_id: string; moderator: boolean; name: string; company: string; base_name: string; base_company: string; ready: boolean }
type Cand = { speaker_id: string; name: string; moderator: boolean; excluded: boolean }
type State = 'new' | 'ready' | 'changed' | 'needs_attention' | 'approved'
type Session = {
  id: string; position: number; title: string; session_title: string; format: string | null; date: string; start: string; stage: string | null; layout: string; tag: string | null
  cards: Card[]; candidates: Cand[]; overrides: Overrides; issues: Issue[]; state: State; png_url: string | null; jpg_url: string | null; generated_at: string | null; approved_at: string | null; file_base: string
}
type Variant = { id: string; name: string; category: string; kind?: string; w: number; h: number }
type Data = { max_speakers: number; can_edit: boolean; settings: { card_variant_id: string | null; layout_variant_ids: Record<string, string>; card_text: 'name' | 'name_company' }; missing: string[]; variants: Variant[]; sessions: Session[] }

const LABEL: Record<State, string> = { new: 'Not generated', ready: 'Ready: not approved', changed: 'CHANGED: out of date', needs_attention: 'Needs attention', approved: 'Approved' }
const COLOR: Record<State, string> = { new: 'var(--ink3)', ready: 'var(--teal-mid)', changed: 'var(--red)', needs_attention: 'var(--amber)', approved: 'var(--green)' }
const LAYOUTS = ['keynote', 'fireside', 'panel'] as const

export default function ThumbnailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = use(params)
  const [data, setData] = useState<Data | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState<Set<string>>(new Set())
  const [progress, setProgress] = useState<string | null>(null)
  const [editing, setEditing] = useState<Session | null>(null)
  const [day, setDay] = useState('all')
  const [stamp, setStamp] = useState(0)

  const load = useCallback(async () => {
    const r = await fetch(`/api/events/thumbnails?event_id=${eventId}`, { cache: 'no-store' })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) { setErr(j.error ?? 'Could not load.'); return }
    setErr(null); setData(j as Data)
  }, [eventId])
  // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load
  useEffect(() => { void load() }, [load])

  async function post(body: Record<string, unknown>) {
    const r = await fetch('/api/events/thumbnails', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event_id: eventId, ...body }) })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(j.error ?? 'Failed.')
    return j
  }
  async function generate(ids: string[]) {
    setMsg(null); setBusy(b => new Set([...b, ...ids]))
    const failures: string[] = []
    try {
      for (let i = 0; i < ids.length; i += 3) {
        setProgress(`Generating ${Math.min(i + 3, ids.length)} of ${ids.length}…`)
        const r = await post({ action: 'generate', session_ids: ids.slice(i, i + 3) })
        for (const f of r.failed ?? []) failures.push(`${data?.sessions.find(s => s.id === f.id)?.title ?? f.id}: ${f.error}`)
      }
    } catch (e) { failures.push(e instanceof Error ? e.message : 'Failed.') }
    setProgress(null); setBusy(new Set()); setStamp(n => n + 1); setMsg(failures.length ? `Not generated:\n${failures.join('\n')}` : `Generated ${ids.length}.`); await load()
  }
  async function act(action: 'approve' | 'unapprove', id: string) {
    setMsg(null)
    try { await post({ action, session_id: id }); await load() } catch (e) { setMsg(e instanceof Error ? e.message : 'Failed.') }
  }

  const days = useMemo(() => [...new Set((data?.sessions ?? []).map(s => s.date).filter(Boolean))].sort(), [data])
  const shown = (data?.sessions ?? []).filter(s => day === 'all' || s.date === day)
  const todo = shown.filter(s => (s.state === 'new' || s.state === 'changed') && !s.issues.some(i => i.level === 'attention'))
  const approved = (data?.sessions ?? []).filter(s => s.state === 'approved').length
  const canEdit = !!data?.can_edit

  return (
    <div style={{ maxWidth: '1180px', margin: '0 auto', padding: '0 16px 60px' }}>
      <PageHeader eyebrow="Stakeholder Hub" title="Session Thumbnails" description="One YouTube thumbnail per agenda session, made from the agenda and the speaker records. Nothing is published from here." backHref={`/admin/events/${eventId}/stakeholders`} backLabel="Stakeholder Hub" />
      {err && <div style={{ color: 'var(--red)', padding: '12px 0' }}>{err}</div>}
      {!data && !err && <div style={{ color: 'var(--ink3)', padding: '20px 0' }}>Loading…</div>}
      {data && (<>
        <Settings data={data} canEdit={canEdit} onSave={async (b) => { try { await post({ action: 'save_settings', ...b }); setMsg('Settings saved.'); await load() } catch (e) { setMsg(e instanceof Error ? e.message : 'Failed.') } }} />
        {msg && <pre style={{ whiteSpace: 'pre-wrap', margin: '10px 0', padding: '10px 14px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '10px', fontSize: '13px', fontFamily: 'inherit' }}>{msg}</pre>}

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center', margin: '20px 0 12px' }}>
          <Select value={day} onChange={e => setDay(e.target.value)} style={{ width: 'auto', minWidth: '170px' }}><option value="all">All days</option>{days.map(d => <option key={d} value={d}>{d}</option>)}</Select>
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: '13px', color: 'var(--ink3)' }}>{shown.length} sessions · {todo.length} to generate · {approved} approved</span>
          {canEdit && <Button variant="teal" disabled={!todo.length || !!progress || data.missing.length > 0} onClick={() => generate(todo.map(s => s.id))}>{progress ?? `Generate ${todo.length}`}</Button>}
          {approved > 0 && <Button variant="ghost" href={`/api/events/thumbnails/download?event_id=${eventId}&zip=1`}>Download all approved (ZIP)</Button>}
        </div>

        {!shown.length && <div style={{ color: 'var(--ink3)', padding: '20px 0' }}>No sessions with speakers yet. Add speakers to sessions in the Agenda and they appear here.</div>}
        <div style={{ display: 'grid', gap: '12px' }}>
          {shown.map(s => {
            const blocked = s.issues.some(i => i.level === 'attention')
            const show = s.state === 'ready' || s.state === 'approved'
            return (
              <div key={s.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(240px, 380px) 1fr', gap: '16px', background: 'var(--card)', border: `${s.state === 'changed' ? 3 : 1}px solid ${s.state === 'changed' ? 'var(--red)' : 'var(--border)'}`, borderRadius: '12px', padding: '12px' }}>
                <div style={{ position: 'relative', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '8px', aspectRatio: '16 / 9', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {show && s.jpg_url ? <img src={s.jpg_url} alt={`Thumbnail for ${s.title}`} loading="lazy" style={{ width: '100%', display: 'block' }} />
                    : blocked || data.missing.length ? <span style={{ color: 'var(--ink3)', fontSize: '13px', padding: '10px', textAlign: 'center' }}>Cannot be drawn yet</span>
                    : <img src={`/api/events/thumbnails/preview?event_id=${eventId}&session_id=${s.id}&v=${s.state}${stamp}`} alt={`Preview for ${s.title}`} loading="lazy" style={{ width: '100%', display: 'block' }} />}
                  {!show && !blocked && !data.missing.length && <span style={{ position: 'absolute', top: '6px', left: '6px', fontSize: '11px', fontWeight: 800, padding: '3px 8px', borderRadius: '999px', background: 'var(--amber)', color: 'var(--card)' }}>PREVIEW: not generated yet</span>}
                </div>
                <div style={{ display: 'grid', gap: '6px', alignContent: 'start' }}>
                  <div style={{ fontSize: '12.5px', color: 'var(--ink3)', fontWeight: 700 }}>#{String(s.position).padStart(3, '0')} · {s.date} {s.start} · {s.stage ?? 'No stage'} · {s.layout} layout · {s.cards.length} speaker{s.cards.length === 1 ? '' : 's'}{s.tag ? ` · ${s.tag}` : ''}</div>
                  <div style={{ fontSize: '16px', fontWeight: 800, lineHeight: 1.3 }}>{s.title}</div>
                  <div style={{ fontSize: '13px', color: 'var(--ink2)' }}>{s.cards.map(c => `${c.name}${c.moderator ? ' (Moderator)' : ''}`).join(' · ')}</div>
                  <div style={{ fontSize: '13px', fontWeight: 900, color: COLOR[s.state] }}>● {LABEL[s.state]}{s.approved_at ? ` ${new Date(s.approved_at).toLocaleDateString()}` : ''}{s.generated_at ? <span style={{ fontWeight: 500, color: 'var(--ink3)' }}> · generated {new Date(s.generated_at).toLocaleString()}</span> : null}</div>
                  {s.issues.length > 0 && <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '13px', lineHeight: 1.5 }}>{s.issues.map((i, k) => <li key={k} style={{ color: i.level === 'warning' ? 'var(--amber)' : 'var(--red)', fontWeight: i.level === 'attention' ? 800 : 600 }}>{i.level === 'attention' ? 'Needs attention: ' : i.level === 'error' ? 'Rule error: ' : ''}{i.text}</li>)}</ul>}
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '4px' }}>
                    {canEdit && <Button variant={s.state === 'new' || s.state === 'changed' ? 'teal' : 'ghost'} disabled={busy.has(s.id) || !!progress || blocked || data.missing.length > 0} onClick={() => generate([s.id])}>{busy.has(s.id) ? 'Generating…' : s.png_url ? 'Regenerate' : 'Generate'}</Button>}
                    {canEdit && <Button variant="ghost" onClick={() => setEditing(s)}>Edit text / speakers</Button>}
                    {canEdit && s.state === 'ready' && <Button variant="lime" onClick={() => act('approve', s.id)}>Approve</Button>}
                    {canEdit && s.state === 'approved' && <Button variant="ghost" onClick={() => act('unapprove', s.id)}>Remove approval</Button>}
                    {s.jpg_url && s.state !== 'new' && <Button variant="ghost" href={`/api/events/thumbnails/download?event_id=${eventId}&session_id=${s.id}&format=jpg`}>JPG 1280×720</Button>}
                    {s.png_url && s.state !== 'new' && <Button variant="ghost" href={`/api/events/thumbnails/download?event_id=${eventId}&session_id=${s.id}&format=png`}>PNG 1920×1080</Button>}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </>)}
      {editing && data && <OverrideEditor session={editing} maxSpeakers={data.max_speakers} onClose={() => setEditing(null)} onSave={async o => { try { await post({ action: 'save_overrides', session_id: editing.id, overrides: o }); setEditing(null); setStamp(n => n + 1); await load() } catch (e) { setMsg(e instanceof Error ? e.message : 'Failed.'); setEditing(null) } }} />}
    </div>
  )
}

function Settings({ data, canEdit, onSave }: { data: Data; canEdit: boolean; onSave: (b: { card_variant_id: string | null; layout_variant_ids: Record<string, string>; card_text: string }) => Promise<void> }) {
  const [card, setCard] = useState(data.settings.card_variant_id ?? '')
  const [layouts, setLayouts] = useState<Record<string, string>>(data.settings.layout_variant_ids ?? {})
  const [text, setText] = useState(data.settings.card_text)
  const cards = data.variants.filter(v => v.category === 'thumbnail_card'), lays = data.variants.filter(v => v.category === 'thumbnail_layout')
  return (
    <div style={{ background: 'var(--card)', border: `1px solid ${data.missing.length ? 'var(--amber)' : 'var(--border)'}`, borderRadius: '12px', padding: '14px 16px', display: 'grid', gap: '10px', marginTop: '14px' }}>
      <strong>Templates for this event</strong>
      <span style={{ fontSize: '13px', color: 'var(--ink3)' }}>Built by the branding team in Admin Console › Variants (Thumbnail Card and Thumbnail Layout). Nothing is generated until the card and all three layouts are chosen.</span>
      {data.missing.length > 0 && <div style={{ color: 'var(--amber)', fontWeight: 700, fontSize: '13px' }}>Still missing: {data.missing.join(' · ')}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '10px' }}>
        <label style={{ fontSize: '12.5px', fontWeight: 700 }}>Speaker card
          <Select value={card} disabled={!canEdit} onChange={e => setCard(e.target.value)}><option value="">Choose…</option>{cards.map(v => <option key={v.id} value={v.id}>{v.name} ({v.w}×{v.h})</option>)}</Select></label>
        {LAYOUTS.map(k => (
          <label key={k} style={{ fontSize: '12.5px', fontWeight: 700, textTransform: 'capitalize' }}>{k} layout
            <Select value={layouts[k] ?? ''} disabled={!canEdit} onChange={e => setLayouts(l => ({ ...l, [k]: e.target.value }))}><option value="">Choose…</option>{lays.filter(v => !v.kind || v.kind === k).map(v => <option key={v.id} value={v.id}>{v.name} ({v.w}×{v.h})</option>)}</Select></label>
        ))}
        <label style={{ fontSize: '12.5px', fontWeight: 700 }}>Text on each card
          <Select value={text} disabled={!canEdit} onChange={e => setText(e.target.value as 'name' | 'name_company')}><option value="name">Name only</option><option value="name_company">Name and company</option></Select></label>
      </div>
      {canEdit && <div><Button variant="teal" onClick={() => onSave({ card_variant_id: card || null, layout_variant_ids: Object.fromEntries(Object.entries(layouts).filter(([, v]) => v)), card_text: text })}>Save settings</Button></div>}
    </div>
  )
}

function OverrideEditor({ session, maxSpeakers, onSave, onClose }: { session: Session; maxSpeakers: number; onSave: (o: Overrides) => Promise<void>; onClose: () => void }) {
  const [o, setO] = useState<Overrides>(session.overrides)
  const excluded = new Set(o.exclude ?? [])
  const left = session.candidates.filter(c => !excluded.has(c.speaker_id)).length
  const setCard = (id: string, k: 'name' | 'company', v: string) => setO(x => ({ ...x, cards: { ...(x.cards ?? {}), [id]: { ...(x.cards?.[id] ?? {}), [k]: v } } }))
  const toggle = (id: string) => setO(x => { const s = new Set(x.exclude ?? []); if (s.has(id)) s.delete(id); else s.add(id); return { ...x, exclude: [...s] } })
  const others = session.candidates.filter(c => !c.moderator && !excluded.has(c.speaker_id))
  const move = (id: string, d: -1 | 1) => setO(x => { const ids = (x.order?.length ? x.order : others.map(c => c.speaker_id)).filter(i => others.some(c => c.speaker_id === i)); for (const c of others) if (!ids.includes(c.speaker_id)) ids.push(c.speaker_id); const i = ids.indexOf(id), j = i + d; if (i < 0 || j < 0 || j >= ids.length) return x; [ids[i], ids[j]] = [ids[j], ids[i]]; return { ...x, order: ids } })
  return (
    // eslint-disable-next-line no-restricted-syntax -- modal scrim, same as the other dialogs
    <div role="dialog" aria-modal="true" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '16px' }}>
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px', padding: '18px', width: 'min(680px, 100%)', maxHeight: '90vh', overflow: 'auto', display: 'grid', gap: '12px' }}>
        <strong style={{ fontSize: '16px' }}>Edit this thumbnail only</strong>
        <span style={{ fontSize: '12.5px', color: 'var(--ink3)' }}>These changes apply to this thumbnail only. The agenda and the speaker records are not changed. Leave a box empty to use the agenda / record value.</span>
        <label style={{ fontSize: '12.5px', fontWeight: 700 }}>Title<Input value={o.title ?? ''} placeholder={session.session_title} onChange={e => setO(x => ({ ...x, title: e.target.value }))} /></label>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'end', flexWrap: 'wrap' }}>
          <label style={{ fontSize: '12.5px', fontWeight: 700, flex: '1 1 220px' }}>Tag text<Input value={o.tag ?? ''} placeholder={session.format ?? 'No format on the agenda'} disabled={!!o.hide_tag} onChange={e => setO(x => ({ ...x, tag: e.target.value }))} /></label>
          <label style={{ fontSize: '13px', display: 'flex', gap: '6px', alignItems: 'center' }}><input type="checkbox" checked={!!o.hide_tag} onChange={e => setO(x => ({ ...x, hide_tag: e.target.checked }))} />No tag</label>
        </div>
        <div style={{ fontSize: '13px', fontWeight: 800, color: left > maxSpeakers ? 'var(--red)' : 'var(--ink2)' }}>Speakers shown: {left} (up to {maxSpeakers}){left > maxSpeakers ? `: exclude ${left - maxSpeakers} more` : ''}</div>
        {session.candidates.map(c => {
          const ex = excluded.has(c.speaker_id)
          const pos = others.findIndex(x => x.speaker_id === c.speaker_id)
          return (
            <div key={c.speaker_id} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '8px', alignItems: 'center', opacity: ex ? 0.5 : 1 }}>
              <Input value={o.cards?.[c.speaker_id]?.name ?? ''} placeholder={c.name + (c.moderator ? ' (Moderator)' : '')} disabled={ex} onChange={e => setCard(c.speaker_id, 'name', e.target.value)} />
              <Input value={o.cards?.[c.speaker_id]?.company ?? ''} placeholder="Company (from record)" disabled={ex} onChange={e => setCard(c.speaker_id, 'company', e.target.value)} />
              <div style={{ display: 'flex', gap: '4px' }}>
                {!c.moderator && !ex && <Button variant="ghost" disabled={pos <= 0} onClick={() => move(c.speaker_id, -1)}>↑</Button>}
                {!c.moderator && !ex && <Button variant="ghost" disabled={pos < 0 || pos >= others.length - 1} onClick={() => move(c.speaker_id, 1)}>↓</Button>}
                <Button variant="ghost" onClick={() => toggle(c.speaker_id)}>{ex ? 'Include' : 'Exclude'}</Button>
              </div>
            </div>
          )
        })}
        <div style={{ fontSize: '12px', color: 'var(--ink3)' }}>The moderator is always first, and cannot be excluded while on the thumbnail.</div>
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="teal" onClick={() => onSave(o)}>Save</Button></div>
      </div>
    </div>
  )
}
