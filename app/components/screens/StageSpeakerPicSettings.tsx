'use client'

/* eslint-disable @next/next/no-img-element -- previews of an on-the-fly PNG, deliberately unoptimised */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Button, Select } from '@/app/components/ui'
import { DEFAULT_DIMS, DIM_LIMITS, PANEL_DEFAULTS, SCREEN_TEXT_ELEMENTS, TYPE_ELEMENTS, TYPE_LABELS, TYPE_SIZE_LIMITS, TYPE_WEIGHTS, clampDims, clampHeadScale, clampTypeStyles, typeDefaults, type Dims, type Panel, type TypeElement, type TypeStyle, type TypeStyles } from '@/app/lib/screens/dims'

/* Admin Console → "Stage Speaker Pic": where the branding / on-site marketing team defines how the stage-screen graphics look for this event — the panel they sit on
   (white or dark), how big the heads are, font, text colours, the card background and the card sizes. Nothing changes until Save: edits are kept on this page as an
   unsaved draft. The preview does not redraw on every keystroke either; "Apply changes" lights up when the draft differs from what the preview shows, and redraws it
   (still unsaved). The Stage Screens page (Stakeholder Hub) only uses what has been saved. */

type Look = { panel: Panel; card_style: 'separate' | 'card'; card_variant_id: string | null; use_website_photo: boolean; type_styles: TypeStyles; head_scale: number; font_id: string | null; background_url: string | null; text_color: string; accent_color: string; dims: Dims }
type ServerLook = Look & { font_name: string | null }
type Data = { website_variant: { name: string; width: number; height: number } | null; card_variants: { id: string; name: string; width: number; height: number }[]; sessions: { id: string; title: string; date: string; start: string; stage: string | null; cards: unknown[] }[]; fonts: { id: string; family_name: string }[]; look: ServerLook }

// The panel the graphic will sit on at the venue — preview background only; the exported PNG is always transparent.
/* eslint-disable no-restricted-syntax */
const PANEL_BG = { light: '#FFFFFF', dark: '#0B1220' } as const
/* eslint-enable no-restricted-syntax */

/** One numbered section of the page: a heading line with a one-sentence hint, then its controls. */
function Sec({ n, title, hint, children, aside }: { n: number; title: string; hint?: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '16px', display: 'grid', gap: '12px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', flexWrap: 'wrap' }}>
        <span style={{ width: '24px', height: '24px', borderRadius: '999px', background: 'var(--ink)', color: 'var(--card)', fontSize: '12.5px', fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{n}</span>
        <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: 'var(--ink)' }}>{title}</h3>
        {hint && <span style={{ fontSize: '12.5px', color: 'var(--ink3)' }}>{hint}</span>}
        <span style={{ flex: 1 }} />
        {aside}
      </div>
      {children}
    </section>
  )
}

const lab = { fontSize: '12px', fontWeight: 800, color: 'var(--ink3)', display: 'block', marginBottom: '4px' } as const
const toLook = (l: ServerLook): Look => ({ panel: l.panel, card_style: l.card_style, card_variant_id: l.card_variant_id, use_website_photo: l.use_website_photo === true, type_styles: clampTypeStyles(l.type_styles), head_scale: l.head_scale, font_id: l.font_id, background_url: l.background_url, text_color: l.text_color, accent_color: l.accent_color, dims: { ...l.dims } })
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
    else { setMsg({ text: 'Saved. Every screen already drawn with the old look now shows as “Changed” on the Stage Screens page, and any AV console that has its link open is alerted (with Auto-redraw on, they are redrawn by themselves).' }); await load() }
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

      <Sec n={1} title="Card design" hint="How each speaker’s card is made.">
        {(() => {
          const mode = draft.card_style === 'card' ? 'card' : draft.use_website_photo && data.website_variant ? 'website' : 'plain'
          const opts = [
            ['website', 'Website photo, details underneath', !data.website_variant],
            ['plain', 'Photo on plain background, details underneath', false],
            ['card', 'Designed card (template)', false],
          ] as const
          return (
            <div role="group" aria-label="Card design" style={{ display: 'inline-flex', flexWrap: 'wrap', border: '1.5px solid var(--border)', borderRadius: '10px', overflow: 'hidden', width: 'fit-content', maxWidth: '100%' }}>
              {opts.map(([v, t, off]) => (
                <button key={v} type="button" disabled={off} aria-pressed={mode === v} title={off ? 'This event has no complete Website Photo template yet (Variants → Website Photo).' : undefined}
                  onClick={() => edit({ card_style: v === 'card' ? 'card' : 'separate', use_website_photo: v === 'website' })}
                  style={{ padding: '8px 16px', border: 'none', cursor: off ? 'not-allowed' : 'pointer', opacity: off ? 0.45 : 1, fontFamily: 'inherit', fontSize: '13.5px', fontWeight: 800, background: mode === v ? 'var(--ink)' : 'transparent', color: mode === v ? 'var(--card)' : 'var(--ink2)' }}>{t}</button>
              ))}
            </div>
          )
        })()}
        {draft.card_style === 'card' ? (
          <div style={{ display: 'grid', gap: '10px' }}>
            <div style={{ fontSize: '12.5px', color: 'var(--ink3)', maxWidth: '820px', lineHeight: 1.5 }}>
              The card is designed in the template editor — background and gradient layers, the speaker photo, and the name, job title and company (and country) with their own fonts and colours, stacked from the bottom up.
            </div>
            {data.card_variants.length ? (
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                <label style={{ ...lab, marginBottom: 0 }} htmlFor="ssp-card">Card template</label>
                <Select id="ssp-card" value={draft.card_variant_id ?? data.card_variants[0].id} onChange={e => edit({ card_variant_id: e.target.value })} style={{ width: 'auto', minWidth: '260px' }}>
                  {data.card_variants.map(v => <option key={v.id} value={v.id}>{v.name} · {v.width} × {v.height} px</option>)}
                </Select>
                <a href={`/admin/events/${eventId}/creative-templates/admin`} target="_blank" rel="noreferrer" style={{ fontSize: '13.5px', fontWeight: 800, color: 'var(--teal-mid)' }}>Edit the card template ↗</a>
              </div>
            ) : (
              <div style={{ padding: '12px 14px', border: '1.5px dashed var(--border)', borderRadius: '10px', fontSize: '13.5px', color: 'var(--ink2)', lineHeight: 1.55 }}>
                No card template yet — until one exists the plain design is drawn. In the template editor choose <strong>Variants → + New Variant → Stage Screen Card</strong>, design it, save, then come back and pick it here.{' '}
                <a href={`/admin/events/${eventId}/creative-templates/admin`} target="_blank" rel="noreferrer" style={{ fontWeight: 800, color: 'var(--teal-mid)' }}>Open the template editor ↗</a>
              </div>
            )}
          </div>
        ) : (
          draft.use_website_photo && data.website_variant ? (
            <div style={{ fontSize: '12.5px', color: 'var(--ink3)', maxWidth: '820px', lineHeight: 1.5 }}>
              Each speaker’s photo is drawn with this event’s own <strong>{data.website_variant.name}</strong> template ({data.website_variant.width} × {data.website_variant.height} px) — its background, the face-aligned photo and any design layer on top — exactly as on the website, so nothing is rebuilt. The cleaned photos are 1024 px, so a bigger template size would not add detail. A speaker without a confirmed head position falls back to the plain frame. Change the look in <a href={`/admin/events/${eventId}/creative-templates/admin`} target="_blank" rel="noreferrer" style={{ fontWeight: 800, color: 'var(--teal-mid)' }}>the template editor ↗</a>.
            </div>
          ) : (
          <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div title="Zooms each photo in around the head. 100% = the cleaned photo as it is. Above about 150% photos start to look soft on a big wall.">
              <label style={lab} htmlFor="ssp-head">Head size</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input id="ssp-head" type="range" min={100} max={180} step={5} value={Math.round(draft.head_scale * 100)} onChange={e => edit({ head_scale: clampHeadScale(Number(e.target.value) / 100) })} />
                <span style={{ minWidth: '42px', fontSize: '13.5px', fontWeight: 800, color: 'var(--ink2)' }}>{Math.round(draft.head_scale * 100)}%</span>
              </div>
            </div>
            <div>
              <span style={lab}>Card background</span>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                {draft.background_url && <img src={draft.background_url} alt="Card background" style={{ width: '44px', height: '44px', objectFit: 'cover', borderRadius: '6px', border: '1px solid var(--border)' }} />}
                <input ref={file} type="file" accept="image/png,image/jpeg,image/webp" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = '' }} />
                <Button variant="ghost" onClick={() => file.current?.click()}>Upload separate background</Button>
                {draft.background_url && <Button variant="ghost" onClick={() => edit({ background_url: null })}>Use the website one</Button>}
              </div>
            </div>
            <div style={{ flexBasis: '100%', fontSize: '12.5px', color: 'var(--ink3)', maxWidth: '820px', lineHeight: 1.5 }}>
              The speaker’s photo on the card background, with name, job title, company and country written underneath. By default the cards use the event’s website-photo background; square images of 2048 px or more are cleanest. Only Head size above 100% enlarges a photo, which softens small ones, so keep it to about 150% or less for a big wall.
            </div>
          </div>
          )
        )}
      </Sec>

      <Sec n={2} title="Screen" hint="The panel the graphic is shown on. The downloaded file is always transparent; this only sets the preview background and the default text colours.">
        <div role="group" aria-label="Panel the screen sits on" style={{ display: 'inline-flex', border: '1.5px solid var(--border)', borderRadius: '10px', overflow: 'hidden', width: 'fit-content' }}>
          {(['light', 'dark'] as const).map(p => (
            <button key={p} type="button" aria-pressed={draft.panel === p}
              onClick={() => draft.panel !== p && edit({ panel: p, text_color: PANEL_DEFAULTS[p].text, accent_color: PANEL_DEFAULTS[p].accent })}
              style={{ padding: '8px 16px', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '13.5px', fontWeight: 800, background: draft.panel === p ? 'var(--ink)' : 'transparent', color: draft.panel === p ? 'var(--card)' : 'var(--ink2)' }}>
              {p === 'light' ? 'White bg' : 'Dark bg'}
            </button>
          ))}
        </div>
      </Sec>

      <TextStyles n={3} look={draft} fonts={data.fonts} fontName={fontName} cardMode={draft.card_style === 'card' && data.card_variants.length > 0} onChange={patch => edit(patch)} />

      <CardSize n={4} dims={draft.dims} onChange={dims => edit({ dims })} cardMode={(draft.card_style === 'card' && data.card_variants.length > 0) || (draft.use_website_photo && !!data.website_variant)} />

      <Sec n={5} title="Preview" hint="Pick any session to try the settings on. Nothing is saved until you press Save changes.">
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
      </Sec>
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
  { key: 'minTopicW', label: 'Least width for the topic', hint: 'px' },
]

/** Card sizes. Typing only changes the draft; each field is brought into its allowed range when you leave it. */
function CardSize({ n, dims, onChange, cardMode }: { n: number; dims: Dims; onChange: (d: Dims) => void; cardMode: boolean }) {
  const fields = SIZE_FIELDS.filter(f => !cardMode || !['photoW', 'photoH'].includes(f.key))   // a designed card has its own size, set in the template
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
    <Sec n={n} title={cardMode ? 'Layout on the screen' : 'Card size and layout'} hint={cardMode ? 'How the cards sit on the screen.' : `Photo shape ${dims.photoW} × ${dims.photoH} px (${(dims.photoW / dims.photoH).toFixed(2)} : 1).`}
      aside={!isDefault ? <Button variant="ghost" onClick={() => { setTyped({}); onChange({ ...DEFAULT_DIMS }) }}>Back to standard sizes</Button> : undefined}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: '12px 16px' }}>
        {fields.map(f => (
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
        Sizes are in pixels of the finished PNG; Watchout scales it to the screen, so one size works for every screen.{!cardMode && ' The cleaned speaker photos are 1024 px, so they are never enlarged to fill a bigger frame: a taller or wider frame shows more of the card background around the photo.'}
      </div>
    </Sec>
  )
}


const COL = 'minmax(130px,1.1fr) minmax(190px,2fr) 118px 96px 70px 96px 64px'
const ctl = { padding: '6px 8px', borderRadius: '8px', border: '1.5px solid var(--border)', background: 'transparent', color: 'var(--ink)', fontFamily: 'inherit', fontSize: '13.5px' } as const

/** Text styles: font, weight, size, colour and capitals for each element on its own. A blank setting means "the event default", shown greyed, so nothing changes until it is set. */
function TextStyles({ n, look, fonts, fontName, cardMode, onChange }: { n: number; look: Look; fonts: { id: string; family_name: string }[]; fontName: string | null; cardMode: boolean; onChange: (p: Partial<Look>) => void }) {
  const [typed, setTyped] = useState<Partial<Record<TypeElement, string>>>({})
  const elements = cardMode ? SCREEN_TEXT_ELEMENTS : TYPE_ELEMENTS   // a designed card styles its own name / title / company / country in the template
  const ctx = { cardMode, dims: look.dims, frameW: look.dims.photoW, textColor: look.text_color, accentColor: look.accent_color }
  const set = (el: TypeElement, patch: Partial<TypeStyle>) => {
    const next: TypeStyle = { ...(look.type_styles[el] ?? {}), ...patch }
    for (const k of Object.keys(next) as (keyof TypeStyle)[]) if (next[k] === undefined) delete next[k]
    const all = { ...look.type_styles, [el]: next }
    if (!Object.keys(next).length) delete all[el]
    onChange({ type_styles: all })
  }
  const commitSize = (el: TypeElement) => {
    const t = typed[el]
    if (t === undefined) return
    const n = Number(t)
    set(el, { size: t.trim() !== '' && Number.isFinite(n) ? Math.min(TYPE_SIZE_LIMITS[1], Math.max(TYPE_SIZE_LIMITS[0], Math.round(n))) : undefined })
    setTyped(c => { const x = { ...c }; delete x[el]; return x })
  }
  const head = { fontSize: '11.5px', fontWeight: 800, color: 'var(--ink3)' } as const
  return (
    <Sec n={n} title="Text styles" hint={cardMode ? 'Session title and moderator tag. The name, job title, company and country are styled in the card template.' : 'Each line of the graphic is styled on its own. A greyed value is the default; set it to override.'}>
      <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div>
          <label style={lab} htmlFor="ssp-font">Default font</label>
          <Select id="ssp-font" value={look.font_id ?? ''} onChange={e => onChange({ font_id: e.target.value || null })} style={{ minWidth: '230px' }}>
            <option value="">Same as the event’s speaker templates{fontName ? ` (${fontName})` : ''}</option>
            {fonts.map(f => <option key={f.id} value={f.id}>{f.family_name}</option>)}
          </Select>
        </div>
        {!cardMode && <Colour label="Default name & details colour" value={look.text_color} onChange={v => onChange({ text_color: v })} />}
        <Colour label="Default topic & moderator colour" value={look.accent_color} onChange={v => onChange({ accent_color: v })} />
      </div>

      <div style={{ overflowX: 'auto' }}>
        <div style={{ display: 'grid', gap: '8px', minWidth: '820px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: COL, gap: '10px', alignItems: 'end' }}>
            <span style={head}>Element</span><span style={head}>Font</span><span style={head}>Weight</span><span style={head}>Size (px)</span><span style={head}>Colour</span><span style={head}>Capitals</span><span />
          </div>
          {elements.map(el => {
            const d = typeDefaults(el, ctx), o = look.type_styles[el] ?? {}
            const set0 = Object.keys(o).length > 0
            return (
              <div key={el} style={{ display: 'grid', gridTemplateColumns: COL, gap: '10px', alignItems: 'center', padding: '8px 0', borderTop: '1px solid var(--border)' }}>
                <span style={{ fontSize: '13.5px', fontWeight: 800, color: 'var(--ink)' }}>{TYPE_LABELS[el]}{set0 && <span style={{ color: 'var(--amber)' }} title="Customised"> ●</span>}</span>
                <Select aria-label={`${TYPE_LABELS[el]} font`} value={o.fontId ?? ''} onChange={e => set(el, { fontId: e.target.value || undefined })}>
                  <option value="">Default font</option>
                  {fonts.map(f => <option key={f.id} value={f.id}>{f.family_name}</option>)}
                </Select>
                <Select aria-label={`${TYPE_LABELS[el]} weight`} value={o.weight ?? ''} onChange={e => set(el, { weight: e.target.value ? Number(e.target.value) : undefined })}>
                  <option value="">Default ({d.weight})</option>
                  {TYPE_WEIGHTS.map(w => <option key={w} value={w}>{w === 400 ? 'Regular' : w === 500 ? 'Medium' : w === 600 ? 'Semi-bold' : 'Bold'}</option>)}
                </Select>
                <input aria-label={`${TYPE_LABELS[el]} size`} type="number" inputMode="numeric" min={TYPE_SIZE_LIMITS[0]} max={TYPE_SIZE_LIMITS[1]} placeholder={String(d.size)}
                  value={typed[el] ?? (o.size !== undefined ? String(o.size) : '')} onChange={e => setTyped(c => ({ ...c, [el]: e.target.value }))} onBlur={() => commitSize(el)} onKeyDown={e => { if (e.key === 'Enter') commitSize(el) }} style={{ ...ctl, width: '86px' }} />
                <input aria-label={`${TYPE_LABELS[el]} colour`} type="color" value={o.color ?? d.color} onChange={e => set(el, { color: e.target.value })} style={{ opacity: o.color ? 1 : 0.55 }} title={o.color ? 'Custom colour' : 'Event default colour'} />
                <label style={{ display: 'flex', gap: '6px', alignItems: 'center', fontSize: '13px', color: o.upper === undefined ? 'var(--ink3)' : 'var(--ink)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={o.upper ?? d.upper} onChange={e => set(el, { upper: e.target.checked })} /> ALL CAPS
                </label>
                <Button variant="ghost" disabled={!set0} onClick={() => { const all = { ...look.type_styles }; delete all[el]; onChange({ type_styles: all }) }}>Reset</Button>
              </div>
            )
          })}
        </div>
      </div>
      <div style={{ fontSize: '12.5px', color: 'var(--ink3)', maxWidth: '820px', lineHeight: 1.5 }}>
        Fonts come from the Brand fonts library. Text that is too long for its space is shrunk to fit, never cut off. The moderator tag sits above the moderator’s card and the topic runs across the top.
      </div>
    </Sec>
  )
}
