'use client'

/* eslint-disable @next/next/no-img-element -- previews of an on-the-fly PNG, deliberately unoptimised */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Button, Select } from '@/app/components/ui'
import { DEFAULT_DIMS, DIM_LIMITS, PANEL_DEFAULTS, clampDims, clampHeadScale, type Dims, type Panel } from '@/app/lib/screens/dims'

/* Admin Console → "Stage Speaker Pic": where the branding / on-site marketing team defines how the stage-screen graphics look for this event — the panel they sit on
   (white or dark), how big the heads are, font, text colours, the card background and the card sizes. Nothing changes until Save: edits are kept on this page as an
   unsaved draft. The preview does not redraw on every keystroke either; "Apply changes" lights up when the draft differs from what the preview shows, and redraws it
   (still unsaved). The Stage Screens page (Stakeholder Hub) only uses what has been saved. */

type Look = { panel: Panel; head_scale: number; font_id: string | null; background_url: string | null; text_color: string; accent_color: string; dims: Dims }
type ServerLook = Look & { card_style: 'separate' | 'card'; font_name: string | null }
type Data = { sessions: { id: string; title: string; date: string; start: string; stage: string | null; cards: unknown[] }[]; fonts: { id: string; family_name: string }[]; look: ServerLook }

// The panel the graphic will sit on at the venue — preview background only; the exported PNG is always transparent.
/* eslint-disable no-restricted-syntax */
const PANEL_BG = { light: '#FFFFFF', dark: '#0B1220' } as const
/* eslint-enable no-restricted-syntax */

const lab = { fontSize: '12px', fontWeight: 800, color: 'var(--ink3)', display: 'block', marginBottom: '4px' } as const
const toLook = (l: ServerLook): Look => ({ panel: l.panel, head_scale: l.head_scale, font_id: l.font_id, background_url: l.background_url, text_color: l.text_color, accent_color: l.accent_color, dims: { ...l.dims } })
const same = (a: Look | null, b: Look | null) => !!a && !!b && JSON.stringify(a) === JSON.stringify(b)

export default function StageSpeakerPicSettings({ eventId }: { eventId: string }) {
  const [data, setData] = useState<Data | null>(null)
  const [saved, setSaved] = useState<Look | null>(null)       // what is stored
  const [draft, setDraft] = useState<Look | null>(null)       // what the controls show
  const [applied, setApplied] = useState<Look | null>(null)   // what the preview was last drawn with
  const [error, setError] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null)
  const [saving, setSaving] = useState(false)
  const [sample, setSample] = useState('')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [drawing, setDrawing] = useState(false)
  const file = useRef<HTMLInputElement>(null)
  const draw = useRef(0)

  const load = useCallback(async () => {
    const r = await fetch(`/api/events/screens?event_id=${eventId}`)
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { setError(d.error ?? 'Could not load the settings.'); return }
    setData(d)
    const l = toLook(d.look)
    setSaved(l); setDraft(l); setApplied(cur => cur ?? l)
    setSample(cur => cur || ([...d.sessions].sort((a: Data['sessions'][number], b: Data['sessions'][number]) => Math.abs(a.cards.length - 4) - Math.abs(b.cards.length - 4))[0]?.id ?? ''))
  }, [eventId])

  useEffect(() => {
    let cancelled = false
    void (async () => { if (!cancelled) await load() })()
    return () => { cancelled = true }
  }, [load])

  // Draws the preview whenever the applied settings or the sample session change — never because a control was touched.
  useEffect(() => {
    if (!applied || !sample) return
    const mine = ++draw.current
    // eslint-disable-next-line react-hooks/set-state-in-effect -- shows the "Redrawing" state while the request runs
    setDrawing(true); setPreviewError(null)
    void (async () => {
      const r = await fetch('/api/events/screens/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event_id: eventId, session_id: sample, look: applied }) })
      if (mine !== draw.current) return
      if (!r.ok) { setPreviewError((await r.json().catch(() => ({}))).error ?? 'Could not draw the preview.'); setDrawing(false); return }
      const url = URL.createObjectURL(await r.blob())
      setPreviewUrl(old => { if (old) URL.revokeObjectURL(old); return url })
      setDrawing(false)
    })()
  }, [applied, sample, eventId])

  const edit = (patch: Partial<Look>) => { setMsg(null); setDraft(d => (d ? { ...d, ...patch } : d)) }
  const dirty = !same(saved, draft)
  const needsApply = !same(applied, draft)

  async function save() {
    if (!draft) return
    setSaving(true); setMsg(null)
    const r = await fetch('/api/events/screens', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event_id: eventId, ...draft }) })
    if (!r.ok) setMsg({ text: (await r.json().catch(() => ({}))).error ?? 'Could not save.', bad: true })
    else { setMsg({ text: 'Saved. Screens already drawn with the old look show as “Changed” on the Stage Screens page.' }); await load() }
    setSaving(false)
  }

  async function upload(f: File) {
    setMsg(null)
    const fd = new FormData(); fd.append('event_id', eventId); fd.append('file', f)
    const r = await fetch('/api/events/screens/background', { method: 'POST', body: fd })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) setMsg({ text: d.error ?? 'Upload failed.', bad: true })
    else { edit({ background_url: d.url }); setMsg({ text: 'Background uploaded. Press Save changes to keep it.' }) }
  }

  if (error) return <div style={{ color: 'var(--red)' }}>{error}</div>
  if (!data || !draft || !saved) return <div style={{ color: 'var(--ink3)' }}>Loading…</div>
  const fontName = data.look.font_name
  return (
    <div style={{ display: 'grid', gap: '16px' }}>
      <div style={{ fontSize: '13.5px', color: 'var(--ink2)', maxWidth: '760px', lineHeight: 1.55 }}>
        How the stage-screen graphics (speaker photo, name, title, company, country and topic) look for this event. The downloadable file is always transparent — the panel setting only changes the text colours and the preview background, so you can judge it on the real panel.
      </div>

      {/* Save bar: stays in view while scrolling through the settings */}
      <div style={{ position: 'sticky', top: 0, zIndex: 5, display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', padding: '10px 14px', borderRadius: '12px', background: 'var(--card)', border: `1px solid ${dirty ? 'var(--amber)' : 'var(--border)'}` }}>
        <span style={{ fontSize: '13.5px', fontWeight: 800, color: dirty ? 'var(--amber)' : 'var(--ink3)' }}>{dirty ? '● Unsaved changes' : 'All changes saved'}</span>
        <span style={{ flex: 1 }} />
        <Button variant="ghost" disabled={!dirty || saving} onClick={() => { setDraft(saved); setMsg(null) }}>Discard changes</Button>
        <Button variant="lime" disabled={!dirty || saving} onClick={() => void save()}>{saving ? 'Saving…' : 'Save changes'}</Button>
      </div>
      {msg && <div style={{ padding: '10px 14px', borderRadius: '10px', background: 'var(--card)', border: `1px solid ${msg.bad ? 'var(--red)' : 'var(--border)'}`, color: msg.bad ? 'var(--red)' : 'var(--ink)', fontSize: '13.5px' }}>{msg.text}</div>}

      <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', alignItems: 'flex-end', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '16px' }}>
        <div>
          <span style={lab}>Panel the screen sits on</span>
          <div role="group" aria-label="Panel the screen sits on" style={{ display: 'inline-flex', border: '1.5px solid var(--border)', borderRadius: '10px', overflow: 'hidden' }}>
            {(['light', 'dark'] as const).map(p => (
              <button key={p} type="button" aria-pressed={draft.panel === p}
                onClick={() => draft.panel !== p && edit({ panel: p, text_color: PANEL_DEFAULTS[p].text, accent_color: PANEL_DEFAULTS[p].accent })}
                style={{ padding: '8px 16px', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '13.5px', fontWeight: 800, background: draft.panel === p ? 'var(--ink)' : 'transparent', color: draft.panel === p ? 'var(--card)' : 'var(--ink2)' }}>
                {p === 'light' ? 'White bg' : 'Dark bg'}
              </button>
            ))}
          </div>
        </div>
        <div title="Zooms each photo in around the head. 100% = the cleaned photo as it is. Above about 150% photos start to look soft on a big wall.">
          <label style={lab} htmlFor="ssp-head">Head size</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input id="ssp-head" type="range" min={100} max={180} step={5} value={Math.round(draft.head_scale * 100)} onChange={e => edit({ head_scale: clampHeadScale(Number(e.target.value) / 100) })} />
            <span style={{ minWidth: '42px', fontSize: '13.5px', fontWeight: 800, color: 'var(--ink2)' }}>{Math.round(draft.head_scale * 100)}%</span>
          </div>
        </div>
        <div>
          <label style={lab} htmlFor="ssp-font">Font</label>
          <Select id="ssp-font" value={draft.font_id ?? ''} onChange={e => edit({ font_id: e.target.value || null })} style={{ minWidth: '230px' }}>
            <option value="">Same as the event’s speaker templates{fontName ? ` (${fontName})` : ''}</option>
            {data.fonts.map(f => <option key={f.id} value={f.id}>{f.family_name}</option>)}
          </Select>
        </div>
        <Colour label="Name & details colour" value={draft.text_color} onChange={v => edit({ text_color: v })} />
        <Colour label="Topic & moderator colour" value={draft.accent_color} onChange={v => edit({ accent_color: v })} />
        <div>
          <span style={lab}>Card background</span>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {draft.background_url && <img src={draft.background_url} alt="Card background" style={{ width: '44px', height: '44px', objectFit: 'cover', borderRadius: '6px', border: '1px solid var(--border)' }} />}
            <input ref={file} type="file" accept="image/png,image/jpeg,image/webp" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = '' }} />
            <Button variant="ghost" onClick={() => file.current?.click()}>Upload separate background</Button>
            {draft.background_url && <Button variant="ghost" onClick={() => edit({ background_url: null })}>Use the website one</Button>}
          </div>
        </div>
      </div>

      <CardSize dims={draft.dims} onChange={dims => edit({ dims })} />

      <div style={{ fontSize: '12.5px', color: 'var(--ink3)', maxWidth: '820px' }}>
        By default the cards use the event’s website-photo background. Square images of 2048 px or more give the cleanest result. Speaker photos are placed at their own size; only Head size above 100% enlarges them, which softens small photos, so keep it to about 150% or less for a big wall.
      </div>

      <div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '8px' }}>
          <span style={{ ...lab, marginBottom: 0 }}>Preview with</span>
          <Select value={sample} onChange={e => setSample(e.target.value)} style={{ width: 'auto', minWidth: '320px', maxWidth: '100%' }}>
            {data.sessions.map(s => <option key={s.id} value={s.id}>{s.date} {s.start} · {s.stage ?? 'No stage'} · {s.cards.length} on screen · {s.title.slice(0, 60)}</option>)}
          </Select>
          <span style={{ flex: 1 }} />
          {needsApply && <span style={{ fontSize: '12.5px', color: 'var(--amber)', fontWeight: 800 }}>The preview shows the earlier settings</span>}
          <Button variant={needsApply ? 'teal' : 'ghost'} disabled={!needsApply || drawing} onClick={() => setApplied(draft)}>{drawing ? 'Drawing…' : 'Apply changes to preview'}</Button>
        </div>
        {!data.sessions.length ? <div style={{ color: 'var(--ink3)', fontSize: '13.5px' }}>No sessions with speakers yet — add speakers to sessions in the Agenda to preview here.</div> : (
          <div style={{ position: 'relative', background: PANEL_BG[(applied ?? draft).panel], border: '1px solid var(--border)', borderRadius: '10px', padding: '12px', overflow: 'hidden', minHeight: '120px' }}>
            {previewUrl && <img src={previewUrl} alt="Preview of the stage screen" style={{ width: '100%', maxWidth: '1100px', display: 'block', margin: '0 auto', opacity: drawing ? 0.35 : 1 }} />}
            {previewError && <div style={{ color: 'var(--red)', fontSize: '13.5px' }}>{previewError}</div>}
            {drawing && <div style={{ position: 'absolute', top: '14px', left: '14px', fontSize: '12px', fontWeight: 800, padding: '4px 10px', borderRadius: '999px', background: 'var(--amber)', color: 'var(--card)' }}>Redrawing…</div>}
          </div>
        )}
      </div>
    </div>
  )
}

function Colour({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return <div><label style={lab}>{label}</label><input type="color" value={value} aria-label={label} onChange={e => onChange(e.target.value)} /></div>
}

const SIZE_FIELDS: { key: keyof Dims; label: string; hint: string }[] = [
  { key: 'photoW', label: 'Photo width', hint: 'px' },
  { key: 'photoH', label: 'Photo height', hint: 'px' },
  { key: 'gap', label: 'Space between cards', hint: 'px' },
  { key: 'pad', label: 'Margin round the graphic', hint: 'px' },
  { key: 'maxPerRow', label: 'Most cards on one row', hint: 'cards' },
  { key: 'nameSize', label: 'Name text size', hint: 'px' },
  { key: 'lineSize', label: 'Title / company / country size', hint: 'px' },
  { key: 'topicSize', label: 'Topic text size', hint: 'px' },
  { key: 'minTopicW', label: 'Least width for the topic', hint: 'px' },
]

/** Card sizes. Typing only changes the draft; each field is brought into its allowed range when you leave it. */
function CardSize({ dims, onChange }: { dims: Dims; onChange: (d: Dims) => void }) {
  const [typed, setTyped] = useState<Partial<Record<keyof Dims, string>>>({})
  const shown = (k: keyof Dims) => typed[k] ?? String(dims[k])
  const commit = (k: keyof Dims) => {
    const t = typed[k]
    if (t === undefined) return
    const n = Number(t)
    if (t.trim() !== '' && Number.isFinite(n)) onChange(clampDims({ ...dims, [k]: n }))
    setTyped(cur => { const c = { ...cur }; delete c[k]; return c })
  }
  const isDefault = (Object.keys(DEFAULT_DIMS) as (keyof Dims)[]).every(k => dims[k] === DEFAULT_DIMS[k])
  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px', flexWrap: 'wrap', marginBottom: '10px' }}>
        <span style={{ ...lab, marginBottom: 0 }}>Card size — photo and details separate</span>
        <span style={{ fontSize: '12.5px', color: 'var(--ink3)' }}>Photo shape {dims.photoW} × {dims.photoH} px ({(dims.photoW / dims.photoH).toFixed(2)} : 1)</span>
        <span style={{ flex: 1 }} />
        {!isDefault && <Button variant="ghost" onClick={() => { setTyped({}); onChange({ ...DEFAULT_DIMS }) }}>Back to standard sizes</Button>}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: '12px 16px' }}>
        {SIZE_FIELDS.map(f => (
          <div key={f.key}>
            <label style={lab} htmlFor={`ssp-${f.key}`}>{f.label}</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <input id={`ssp-${f.key}`} type="number" inputMode="numeric" min={DIM_LIMITS[f.key][0]} max={DIM_LIMITS[f.key][1]} value={shown(f.key)}
                onChange={e => setTyped(c => ({ ...c, [f.key]: e.target.value }))} onBlur={() => commit(f.key)} onKeyDown={e => { if (e.key === 'Enter') commit(f.key) }}
                style={{ width: '96px', padding: '6px 8px', borderRadius: '8px', border: '1.5px solid var(--border)', background: 'transparent', color: 'var(--ink)', fontFamily: 'inherit', fontSize: '13.5px' }} />
              <span style={{ fontSize: '12px', color: 'var(--ink3)' }}>{f.hint} · {DIM_LIMITS[f.key][0]}–{DIM_LIMITS[f.key][1]}</span>
            </div>
          </div>
        ))}
      </div>
      <div style={{ fontSize: '12.5px', color: 'var(--ink3)', marginTop: '12px', maxWidth: '820px', lineHeight: 1.5 }}>
        The cleaned speaker photos are 1024 px, so they are never enlarged to fill a bigger frame: a taller or wider frame shows more of the card background around the photo. Sizes are in pixels of the finished PNG; Watchout scales it to the screen, so one size works for every screen.
      </div>
    </div>
  )
}
