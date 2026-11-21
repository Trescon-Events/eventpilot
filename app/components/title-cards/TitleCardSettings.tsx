'use client'

/* eslint-disable @next/next/no-img-element -- preview of an on-the-fly PNG */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Button, Select } from '@/app/components/ui'
import type { TitleCardConfig, TitleCardTextElement } from '@/app/lib/title-cards/data'
import { DEFAULT_TITLE_CARD_CONFIG } from '@/app/lib/title-cards/data'

/* Title Cards → settings page. Mirrors StageSpeakerPicSettings: saved / draft / applied three-state model,
   sticky save bar, and an "Apply changes to preview" button that only redraws when clicked. */

type SessionRow = { id: string; title: string; stage: string | null; tag: string | null }
type CardVariant = { id: string; name: string; width: number; height: number }
type FontRow = { id: string; family_name: string }
type Data = { config: TitleCardConfig; sessions: SessionRow[]; card_variants: CardVariant[]; fonts: FontRow[] }

const lab = { fontSize: '12px', fontWeight: 800, color: 'var(--ink3)', display: 'block', marginBottom: '4px' } as const
const ctl = { padding: '6px 8px', borderRadius: '8px', border: '1.5px solid var(--border)', background: 'transparent', color: 'var(--ink)', fontFamily: 'inherit', fontSize: '13.5px' } as const

function Sec({ n, title, hint, children }: { n: number; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '16px', display: 'grid', gap: '12px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', flexWrap: 'wrap' }}>
        <span style={{ width: '24px', height: '24px', borderRadius: '999px', background: 'var(--ink)', color: 'var(--card)', fontSize: '12.5px', fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{n}</span>
        <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: 'var(--ink)' }}>{title}</h3>
        {hint && <span style={{ fontSize: '12.5px', color: 'var(--ink3)' }}>{hint}</span>}
      </div>
      {children}
    </section>
  )
}

function Colour({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return <div><label style={lab}>{label}</label><input type="color" value={value} aria-label={label} onChange={e => onChange(e.target.value)} /></div>
}

function NumField({ label, value, min, max, hint, onChange }: { label: string; value: number; min: number; max: number; hint?: string; onChange: (v: number) => void }) {
  const [typed, setTyped] = useState('')
  const shown = typed !== '' ? typed : String(value)
  const commit = () => {
    const n = Number(typed)
    if (typed.trim() !== '' && isFinite(n)) onChange(Math.min(max, Math.max(min, n)))
    setTyped('')
  }
  return (
    <div>
      <label style={lab}>{label}</label>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <input type="number" inputMode="numeric" min={min} max={max} value={shown}
          onChange={e => setTyped(e.target.value)} onBlur={commit} onKeyDown={e => e.key === 'Enter' && commit()}
          style={{ ...ctl, width: '90px' }} />
        {hint && <span style={{ fontSize: '12px', color: 'var(--ink3)' }}>{hint}</span>}
      </div>
    </div>
  )
}

const WEIGHTS = [300, 400, 500, 600, 700, 800] as const
const WEIGHT_LABELS: Record<number, string> = { 300: 'Light', 400: 'Regular', 500: 'Medium', 600: 'Semi-bold', 700: 'Bold', 800: 'Extra bold' }

const same = (a: TitleCardConfig | null, b: TitleCardConfig | null) =>
  !!a && !!b && JSON.stringify(a) === JSON.stringify(b)

type TextElKey = keyof TitleCardConfig['text_elements']

const TEXT_ELEMENT_ROWS: { key: TextElKey; label: string; hasPosition: boolean; hasPill: boolean }[] = [
  { key: 'session_tag',     label: 'Session tag',   hasPosition: true,  hasPill: true },
  { key: 'session_stage',   label: 'Session stage', hasPosition: true,  hasPill: true },
  { key: 'session_title',   label: 'Session title', hasPosition: true,  hasPill: true },
  { key: 'moderator',       label: 'Moderator',     hasPosition: false, hasPill: true },
  { key: 'speaker_name',    label: 'Name',          hasPosition: false, hasPill: true },
  { key: 'speaker_title',   label: 'Job title',     hasPosition: false, hasPill: true },
  { key: 'speaker_company', label: 'Company',       hasPosition: false, hasPill: true },
]

export default function TitleCardSettings({ eventId }: { eventId: string }) {
  const [data, setData] = useState<Data | null>(null)
  const [saved, setSaved] = useState<TitleCardConfig | null>(null)
  const [draft, setDraft] = useState<TitleCardConfig | null>(null)
  const [applied, setApplied] = useState<TitleCardConfig | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null)
  const [saving, setSaving] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [drawing, setDrawing] = useState(false)
  const [sample, setSample] = useState('')
  const [bgUploading, setBgUploading] = useState(false)
  const draw = useRef(0)
  const bgFile = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    const r = await fetch(`/api/events/title-cards/settings?event_id=${eventId}`)
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { setError(d.error ?? 'Could not load settings.'); return }
    setData(d as Data)
    const cfg = (d as Data).config
    setSaved(cfg); setDraft(cfg); setApplied(cur => cur ?? cfg)
    setSample(cur => cur || ((d as Data).sessions[0]?.id ?? ''))
  }, [eventId])

  useEffect(() => {
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load() fetches and sets state; cancellation guard matches StageSpeakerPicSettings pattern
    void (async () => { if (!cancelled) await load() })()
    return () => { cancelled = true }
  }, [load])

  useEffect(() => {
    if (!applied) return
    const mine = ++draw.current
    // eslint-disable-next-line react-hooks/set-state-in-effect -- shows drawing state while the request runs
    setDrawing(true); setPreviewError(null)
    void (async () => {
      const r = await fetch('/api/events/title-cards/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_id: eventId, config: applied, ...(sample ? { session_id: sample } : { speaker_count: 3 }) }),
      })
      if (mine !== draw.current) return
      if (!r.ok) { setPreviewError((await r.json().catch(() => ({}))).error ?? 'Render failed.'); setDrawing(false); return }
      const url = URL.createObjectURL(await r.blob())
      setPreviewUrl(old => { if (old) URL.revokeObjectURL(old); return url })
      setDrawing(false)
    })()
  }, [applied, sample, eventId])

  const edit = (patch: Partial<TitleCardConfig>) => { setMsg(null); setDraft(d => d ? { ...d, ...patch } : d) }
  const editEl = (key: TextElKey, patch: Partial<TitleCardTextElement>) =>
    setDraft(d => {
      if (!d) return d
      const cur = d.text_elements[key] ?? DEFAULT_TITLE_CARD_CONFIG.text_elements[key] ?? { size: 32, weight: 400, color: '#FFFFFF', upper: false }
      return { ...d, text_elements: { ...d.text_elements, [key]: { ...cur, ...patch } } }
    })
  const editGrid = (patch: Partial<TitleCardConfig['speaker_grid']>) =>
    setDraft(d => d ? { ...d, speaker_grid: { ...d.speaker_grid, ...patch } } : d)

  const dirty = !same(saved, draft)
  const needsApply = !same(applied, draft)

  async function save() {
    if (!draft) return
    setSaving(true); setMsg(null)
    const r = await fetch('/api/events/title-cards/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_id: eventId, config: draft }),
    })
    if (!r.ok) setMsg({ text: (await r.json().catch(() => ({}))).error ?? 'Could not save.', bad: true })
    else { setMsg({ text: 'Saved. Any title cards already generated will show as "Changed" until regenerated.' }); await load() }
    setSaving(false)
  }

  async function uploadBg(f: File) {
    setBgUploading(true); setMsg(null)
    const fd = new FormData(); fd.append('event_id', eventId); fd.append('file', f)
    const r = await fetch('/api/events/title-cards/background', { method: 'POST', body: fd })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) setMsg({ text: d.error ?? 'Upload failed.', bad: true })
    else { edit({ background_url: d.url }); setMsg({ text: 'Background uploaded. Press Save changes to keep it.' }) }
    setBgUploading(false)
  }

  if (error) return <div style={{ color: 'var(--red)' }}>{error}</div>
  if (!data || !draft) return <div style={{ color: 'var(--ink3)' }}>Loading…</div>

  const sg = draft.speaker_grid

  return (
    <div style={{ display: 'grid', gap: '16px' }}>
      <div style={{ fontSize: '13.5px', color: 'var(--ink2)', maxWidth: '760px', lineHeight: 1.55 }}>
        Configure the title card background, session text layers, speaker card styles, and grid layout. No manual layer positioning in a template editor — everything is set here.
      </div>

      {/* Sticky save bar */}
      <div style={{ position: 'sticky', top: 0, zIndex: 5, display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', padding: '10px 14px', borderRadius: '12px', background: 'var(--card)', border: `1px solid ${dirty ? 'var(--amber)' : 'var(--border)'}` }}>
        <span style={{ fontSize: '13.5px', fontWeight: 800, color: dirty ? 'var(--amber)' : 'var(--ink3)' }}>{dirty ? '● Unsaved changes' : 'All changes saved'}</span>
        <span style={{ flex: 1 }} />
        <Button variant="ghost" disabled={!dirty || saving} onClick={() => { setDraft(saved); setMsg(null) }}>Discard changes</Button>
        <Button variant="lime" disabled={!dirty || saving} onClick={() => void save()}>{saving ? 'Saving…' : 'Save changes'}</Button>
      </div>
      {msg && <div style={{ padding: '10px 14px', borderRadius: '10px', background: 'var(--card)', border: `1px solid ${msg.bad ? 'var(--red)' : 'var(--border)'}`, color: msg.bad ? 'var(--red)' : 'var(--ink)', fontSize: '13.5px' }}>{msg.text}</div>}

      {/* Section 1 — Card design */}
      <Sec n={1} title="Card design" hint="How each speaker's photo card is rendered.">
        <div role="group" aria-label="Card design" style={{ display: 'inline-flex', flexWrap: 'wrap', border: '1.5px solid var(--border)', borderRadius: '10px', overflow: 'hidden', width: 'fit-content', maxWidth: '100%' }}>
          {(['website', 'plain', 'template'] as const).map(v => (
            <button key={v} type="button" aria-pressed={draft.card_design === v}
              onClick={() => edit({ card_design: v })}
              style={{ padding: '8px 16px', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '13.5px', fontWeight: 800, background: draft.card_design === v ? 'var(--ink)' : 'transparent', color: draft.card_design === v ? 'var(--card)' : 'var(--ink2)' }}>
              {v === 'website' ? 'Website photo (pre-styled)' : v === 'plain' ? 'Photo on plain background' : 'Designed card (template)'}
            </button>
          ))}
        </div>

        {draft.card_design === 'template' && (
          <div style={{ display: 'grid', gap: '10px' }}>
            <div style={{ fontSize: '12.5px', color: 'var(--ink3)', maxWidth: '820px', lineHeight: 1.5 }}>
              The speaker card is built from a card template in the Admin Console. Create one under <strong>Variants → + New Variant → Title Card — Card</strong>, then pick it here.
            </div>
            {data.card_variants.length ? (
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                <label style={{ ...lab, marginBottom: 0 }}>Card template</label>
                <Select value={draft.card_variant_id ?? ''} onChange={e => edit({ card_variant_id: e.target.value || null })} style={{ minWidth: '260px' }}>
                  <option value="">— pick a card variant —</option>
                  {data.card_variants.map(v => <option key={v.id} value={v.id}>{v.name} · {v.width} × {v.height}</option>)}
                </Select>
              </div>
            ) : (
              <div style={{ padding: '12px 14px', border: '1.5px dashed var(--border)', borderRadius: '10px', fontSize: '13.5px', color: 'var(--ink2)', lineHeight: 1.55 }}>
                No card template yet. Create one in the Variants tab.
              </div>
            )}
          </div>
        )}

        {draft.card_design !== 'template' && (
          <div style={{ fontSize: '12.5px', color: 'var(--ink3)', maxWidth: '820px', lineHeight: 1.5 }}>
            {draft.card_design === 'website'
              ? "Uses each speaker's pre-styled square website card photo — already correctly framed, no cropping needed."
              : 'Uses the cleaned headshot placed on the card background, with name and details underneath.'}
          </div>
        )}
      </Sec>

      {/* Section 2 — Background */}
      <Sec n={2} title="Background" hint="1920 × 1080 px image — the base layer of every title card for this event.">
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          {draft.background_url && (
            <img src={draft.background_url} alt="Background" style={{ width: '160px', height: '90px', objectFit: 'cover', borderRadius: '6px', border: '1px solid var(--border)' }} />
          )}
          <input ref={bgFile} type="file" accept="image/png,image/jpeg,image/webp" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) void uploadBg(f); e.target.value = '' }} />
          <Button variant="ghost" disabled={bgUploading} onClick={() => bgFile.current?.click()}>{bgUploading ? 'Uploading…' : draft.background_url ? 'Replace background' : 'Upload background'}</Button>
          {draft.background_url && <Button variant="ghost" onClick={() => edit({ background_url: null })}>Remove</Button>}
        </div>
        {!draft.background_url && <div style={{ fontSize: '12.5px', color: 'var(--amber)', fontWeight: 700 }}>No background set — the title card will render on a transparent canvas.</div>}
      </Sec>

      {/* Section 3 — Text styles + positions */}
      <Sec n={3} title="Text styles and positions" hint="Styling for each text layer. Session tag / stage / title can also be repositioned on the canvas.">
        <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <label style={lab}>Default font</label>
            <Select value={draft.font_id ?? ''} onChange={e => edit({ font_id: e.target.value || null })} style={{ minWidth: '230px' }}>
              <option value="">Event default font</option>
              {data.fonts.map(f => <option key={f.id} value={f.id}>{f.family_name}</option>)}
            </Select>
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <div style={{ display: 'grid', gap: '0', minWidth: '900px' }}>
            {/* Header row */}
            <div style={{ display: 'grid', gridTemplateColumns: '140px 160px 128px 80px 68px 56px 80px 1fr', gap: '8px', padding: '0 0 6px 0', borderBottom: '1px solid var(--border)' }}>
              {['Element', 'Font', 'Weight', 'Size', 'Colour', 'CAPS', 'Pill', ''].map((h, i) => (
                <span key={i} style={{ fontSize: '11.5px', fontWeight: 800, color: 'var(--ink3)' }}>{h}</span>
              ))}
            </div>
            {TEXT_ELEMENT_ROWS.map(row => {
              const el = draft.text_elements[row.key] ?? DEFAULT_TITLE_CARD_CONFIG.text_elements[row.key] ?? { size: 32, weight: 400, color: '#FFFFFF', upper: false }
              const hasPill = row.hasPill
              const pill = el.pill
              return (
                <div key={row.key}>
                  <div style={{ display: 'grid', gridTemplateColumns: '140px 160px 128px 80px 68px 56px 80px 1fr', gap: '8px', padding: '10px 0', borderBottom: '1px solid var(--border)', alignItems: 'center' }}>
                    <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--ink)' }}>{row.label}</span>
                    <Select aria-label={`${row.label} font`} value={el.font_id ?? ''} onChange={e => editEl(row.key, { font_id: e.target.value || null })} style={{ fontSize: '12.5px' }}>
                      <option value="">Default font</option>
                      {data.fonts.map(f => <option key={f.id} value={f.id}>{f.family_name}</option>)}
                    </Select>
                    <Select aria-label={`${row.label} weight`} value={String(el.weight)} onChange={e => editEl(row.key, { weight: Number(e.target.value) })} style={{ fontSize: '12.5px' }}>
                      {WEIGHTS.map(w => <option key={w} value={w}>{WEIGHT_LABELS[w]}</option>)}
                    </Select>
                    <input aria-label={`${row.label} size`} type="number" inputMode="numeric" min={8} max={200} value={el.size}
                      onChange={e => { const n = Number(e.target.value); if (isFinite(n)) editEl(row.key, { size: Math.min(200, Math.max(8, n)) }) }}
                      style={{ ...ctl, width: '72px' }} />
                    <input aria-label={`${row.label} colour`} type="color" value={el.color} onChange={e => editEl(row.key, { color: e.target.value })} />
                    <label style={{ display: 'flex', gap: '4px', alignItems: 'center', fontSize: '12px', cursor: 'pointer' }}>
                      <input type="checkbox" checked={el.upper} onChange={e => editEl(row.key, { upper: e.target.checked })} /> CAPS
                    </label>
                    {hasPill ? (
                      <label style={{ display: 'flex', gap: '4px', alignItems: 'center', fontSize: '12px', cursor: 'pointer' }}>
                        <input type="checkbox" checked={!!pill} onChange={e => editEl(row.key, { pill: e.target.checked ? { fill: '#00B4D8', padding_x: 18, padding_y: 8, radius: 6 } : null })} /> Pill
                      </label>
                    ) : <span />}
                    <span />
                  </div>

                  {/* Pill sub-row */}
                  {hasPill && pill && (
                    <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', padding: '6px 0 10px 140px', borderBottom: '1px solid var(--border)', alignItems: 'flex-end', background: 'var(--bg2, transparent)' }}>
                      <Colour label="Pill colour" value={pill.fill} onChange={v => editEl(row.key, { pill: { ...pill, fill: v } })} />
                      <div>
                        <label style={lab}>H padding</label>
                        <input type="number" value={pill.padding_x} min={0} max={100} onChange={e => editEl(row.key, { pill: { ...pill, padding_x: Math.max(0, Math.min(100, Number(e.target.value))) } })} style={{ ...ctl, width: '72px' }} />
                      </div>
                      <div>
                        <label style={lab}>V padding</label>
                        <input type="number" value={pill.padding_y} min={0} max={60} onChange={e => editEl(row.key, { pill: { ...pill, padding_y: Math.max(0, Math.min(60, Number(e.target.value))) } })} style={{ ...ctl, width: '72px' }} />
                      </div>
                      <div>
                        <label style={lab}>Radius</label>
                        <input type="number" value={pill.radius} min={0} max={50} onChange={e => editEl(row.key, { pill: { ...pill, radius: Math.max(0, Math.min(50, Number(e.target.value))) } })} style={{ ...ctl, width: '72px' }} />
                      </div>
                    </div>
                  )}

                  {/* Position sub-row (session text layers only) */}
                  {row.hasPosition && (
                    <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', padding: '6px 0 10px 140px', borderBottom: '1px solid var(--border)', alignItems: 'flex-end' }}>
                      <NumField label="X" value={el.x ?? 52} min={0} max={1920} hint="px" onChange={v => editEl(row.key, { x: v })} />
                      <NumField label="Y" value={el.y ?? 180} min={0} max={1080} hint="px" onChange={v => editEl(row.key, { y: v })} />
                      <NumField label="Width" value={el.width ?? 500} min={50} max={1920} hint="px" onChange={v => editEl(row.key, { width: v })} />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
        <div style={{ fontSize: '12.5px', color: 'var(--ink3)', maxWidth: '820px', lineHeight: 1.5 }}>
          Speaker card text sizes are at a 600 px reference cell width — they scale proportionally to the actual card size, which depends on speaker count and the grid dimensions below. Text that is too long for its space shrinks to fit, never truncates.
        </div>
      </Sec>

      {/* Section 4 — Speaker grid */}
      <Sec n={4} title="Speaker grid and card" hint="Where the grid of speaker cards sits on the 1920 × 1080 canvas, and how each card is proportioned.">
        <div style={{ display: 'grid', gap: '8px' }}>
          <div style={{ fontSize: '12.5px', fontWeight: 800, color: 'var(--ink2)' }}>Grid on canvas</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px 16px' }}>
            <NumField label="X" value={sg.x} min={0} max={1900} hint="px" onChange={v => editGrid({ x: v })} />
            <NumField label="Y" value={sg.y} min={0} max={1070} hint="px" onChange={v => editGrid({ y: v })} />
            <NumField label="Width" value={sg.width} min={50} max={1920} hint="px" onChange={v => editGrid({ width: v })} />
            <NumField label="Height" value={sg.height} min={50} max={1080} hint="px" onChange={v => editGrid({ height: v })} />
            <NumField label="Max columns" value={sg.columns} min={1} max={10} onChange={v => editGrid({ columns: v })} />
            <NumField label="Max rows" value={sg.max_rows} min={1} max={8} onChange={v => editGrid({ max_rows: v })} />
            <NumField label="H gap" value={sg.gap_x} min={0} max={200} hint="px" onChange={v => editGrid({ gap_x: v })} />
            <NumField label="V gap" value={sg.gap_y} min={0} max={200} hint="px" onChange={v => editGrid({ gap_y: v })} />
          </div>
        </div>
        <div style={{ display: 'grid', gap: '8px', marginTop: '4px' }}>
          <div style={{ fontSize: '12.5px', fontWeight: 800, color: 'var(--ink2)' }}>Speaker card</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px 16px' }}>
            <div>
              <label style={lab} htmlFor="tc-photo-pct">Photo width <span style={{ fontWeight: 400 }}>% of card</span></label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input id="tc-photo-pct" type="range" min={10} max={70} step={1} value={draft.photo_pct} onChange={e => edit({ photo_pct: Number(e.target.value) })} />
                <span style={{ minWidth: '34px', fontSize: '13.5px', fontWeight: 800, color: 'var(--ink2)' }}>{draft.photo_pct}%</span>
              </div>
            </div>
            <NumField label="Photo → text gap" value={draft.gap_px} min={0} max={200} hint="px at 600px ref" onChange={v => edit({ gap_px: v })} />
            <div>
              <label style={lab} htmlFor="tc-aspect">Card height / width</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input id="tc-aspect" type="range" min={30} max={150} step={1} value={Math.round(draft.card_aspect * 100)} onChange={e => edit({ card_aspect: Number(e.target.value) / 100 })} />
                <span style={{ minWidth: '34px', fontSize: '13.5px', fontWeight: 800, color: 'var(--ink2)' }}>{draft.card_aspect.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>
      </Sec>

      {/* Section 5 — Preview */}
      <Sec n={5} title="Preview" hint="Pick a real session to preview with actual speaker photos. Nothing is saved until you press Save changes.">
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '4px' }}>
          <span style={{ ...lab, marginBottom: 0 }}>Preview with</span>
          {data.sessions.length ? (
            <Select value={sample} onChange={e => setSample(e.target.value)} style={{ width: 'auto', minWidth: '320px', maxWidth: '100%' }}>
              {data.sessions.map(s => <option key={s.id} value={s.id}>{s.stage ?? 'No stage'} · {s.title.slice(0, 60)}</option>)}
            </Select>
          ) : (
            <span style={{ fontSize: '13px', color: 'var(--ink3)' }}>No sessions with speakers yet — using placeholder data.</span>
          )}
          <span style={{ flex: 1 }} />
          {needsApply && <span style={{ fontSize: '12.5px', color: 'var(--amber)', fontWeight: 800 }}>Preview shows earlier settings</span>}
          <Button variant={needsApply ? 'teal' : 'ghost'} disabled={!needsApply || drawing} onClick={() => setApplied(draft)}>
            {drawing ? 'Drawing…' : 'Apply changes to preview'}
          </Button>
        </div>
        <div style={{ position: 'relative', border: '1px solid var(--border)', borderRadius: '10px', padding: '12px', background: '#0a0f1a', overflow: 'hidden', minHeight: '120px' }}>
          {previewUrl && <img src={previewUrl} alt="Title card preview" style={{ width: '100%', maxWidth: '1200px', display: 'block', margin: '0 auto', opacity: drawing ? 0.35 : 1 }} />}
          {previewError && <div style={{ color: 'var(--red)', fontSize: '13.5px', padding: '12px' }}>{previewError}</div>}
          {!previewUrl && !previewError && !drawing && <div style={{ color: 'var(--ink3)', fontSize: '13px', padding: '20px' }}>Click "Apply changes to preview" to render.</div>}
          {drawing && <div style={{ position: 'absolute', top: '14px', left: '14px', fontSize: '12px', fontWeight: 800, padding: '4px 10px', borderRadius: '999px', background: 'var(--amber)', color: 'var(--card)' }}>Drawing…</div>}
        </div>
      </Sec>
    </div>
  )
}
