'use client'

/* eslint-disable @next/next/no-img-element -- the preview is a blob PNG laid over a sample frame */

import { useCallback, useEffect, useRef, useState } from 'react'
import { Card, Button, Badge, Input, Select, Toast } from '@/app/components/ui'
import { DEFAULT_LT_CONFIG, LT_W, ltTotal, ltTransform, type LowerThirdConfig, type LtTextEl } from '@/app/lib/lower-thirds/config'

/* Session Videos → Lower Thirds tab.
   1) Template — upload the transparent graphic, pick fonts, style name / job title / company, set the slide + hold timing.
   2) Preview — pick any speaker from the event and see THEIR lower third animate over a sample frame (instant, nothing stored).
   3) Real clip — optional last check: the video worker makes the exact final clip for that speaker.
   The whole card (graphic + text) slides in from the left with a fade, holds, then slides back out. */

type Speaker = { id: string; name: string; title: string; company: string }
type Font = { id: string; family_name: string }
type Data = { config: LowerThirdConfig; fonts: Font[]; speakers: Speaker[] }
type ElKey = 'name' | 'title' | 'company'

const EL_LABEL: Record<ElKey, string> = { name: 'Name', title: 'Job title', company: 'Company' }
const STAGES = [
  { key: 'dark', label: 'Dark scene', bg: 'linear-gradient(135deg, #24303c 0%, #0f1720 100%)' },
  { key: 'light', label: 'Light scene', bg: 'linear-gradient(135deg, #cfd8e0 0%, #9fb0bd 100%)' },
] as const

function Sec({ n, title, hint, children }: { n: number; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'grid', gap: 10, paddingTop: 14, borderTop: '1px solid var(--border-light)' }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--teal-mid)' }}>STEP {n}</span>
        <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--ink)' }}>{title}</span>
        {hint && <span style={{ fontSize: 12, color: 'var(--ink3)' }}>{hint}</span>}
      </div>
      {children}
    </div>
  )
}

/** Number box that lets you type freely; the value is checked against min/max only when you leave the box or press Enter.
 *  (Clamping on every keystroke turned "24" into "84": the first "2" was raised to the minimum 8.) */
function Num({ label, value, min, max, step = 1, onChange, disabled }: { label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void; disabled?: boolean }) {
  const [text, setText] = useState(String(value))
  const [editing, setEditing] = useState(false)
  const commit = () => {
    setEditing(false)
    const v = Number(text)
    if (text.trim() === '' || !Number.isFinite(v)) { setText(String(value)); return }
    const c = Math.min(max, Math.max(min, v))
    setText(String(c)); if (c !== value) onChange(c)
  }
  return (
    <label style={{ fontSize: 11, color: 'var(--ink3)', display: 'grid', gap: 3 }}>
      {label}
      <Input type="number" value={editing ? text : String(value)} min={min} max={max} step={step} disabled={disabled}
        onFocus={() => { setText(String(value)); setEditing(true) }}
        onChange={e => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} />
    </label>
  )
}

export default function LowerThirdSettings({ eventId, canEdit }: { eventId: string; canEdit: boolean }) {
  const [data, setData] = useState<Data | null>(null)
  const [draft, setDraft] = useState<LowerThirdConfig>(DEFAULT_LT_CONFIG)
  const [savedJson, setSavedJson] = useState('')
  const [speakerId, setSpeakerId] = useState('')
  const [search, setSearch] = useState('')
  const [stage, setStage] = useState<(typeof STAGES)[number]['key']>('dark')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewErr, setPreviewErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [panelOpen, setPanelOpen] = useState(false)
  const [clip, setClip] = useState<{ status: string; url?: string | null } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const cardRef = useRef<HTMLImageElement>(null)
  const animRef = useRef(draft.animation)
  useEffect(() => { animRef.current = draft.animation }, [draft.animation])

  useEffect(() => {
     
    fetch(`/api/events/lower-thirds/settings?event_id=${eventId}`).then(r => r.json()).then((d: Data & { error?: string }) => {
      if (d.error) { setMsg({ text: d.error, ok: false }); return }
      setData(d); setDraft(d.config); setSavedJson(JSON.stringify(d.config)); setSpeakerId(d.speakers[0]?.id ?? '')
    }).catch(() => setMsg({ text: 'Could not load the lower-third settings.', ok: false }))
  }, [eventId])

  const dirty = JSON.stringify(draft) !== savedJson
  const set = (patch: Partial<LowerThirdConfig>) => setDraft(d => ({ ...d, ...patch }))
  const setEl = (k: ElKey, patch: Partial<LtTextEl>) => setDraft(d => ({ ...d, [k]: { ...d[k], ...patch } }))

  // Only things that change the picture re-render it (animation timing is played live in the browser).
  const pictureKey = JSON.stringify({ b: draft.background_url, f: draft.font_id, n: draft.name, t: draft.title, c: draft.company, s: speakerId })
  useEffect(() => {
    if (!data || !draft.background_url) return
    const ctl = new AbortController()
    const t = setTimeout(async () => {
      try {
        const r = await fetch('/api/events/lower-thirds/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ctl.signal, body: JSON.stringify({ event_id: eventId, config: draft, speaker_id: speakerId || undefined }) })
        if (!r.ok) { setPreviewErr((await r.json().catch(() => ({}))).error ?? 'Preview failed.'); return }
        const url = URL.createObjectURL(await r.blob())
        setPreviewErr(null); setPreviewUrl(old => { if (old) URL.revokeObjectURL(old); return url })
      } catch { /* aborted */ }
    }, 500)
    return () => { clearTimeout(t); ctl.abort() }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- pictureKey captures exactly the inputs that change the image
  }, [pictureKey, data, eventId])

  // Play the slide/fade live with the same maths the worker uses; loops with a short pause.
  const [playToken, setPlayToken] = useState(0)
  useEffect(() => {
    if (!previewUrl) return
    let raf = 0; const start = performance.now()
    const tick = (now: number) => {
      const a = animRef.current, total = ltTotal(a) + 1.2
      const t = ((now - start) / 1000) % total
      const el = cardRef.current
      if (el) { const { opacity, dx } = ltTransform(a, t); el.style.opacity = String(opacity); el.style.transform = `translateX(${(dx / LT_W) * 100}%)` }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [previewUrl, playToken])

  async function upload(f: File) {
    setBusy(true); setMsg(null)
    try {
      const fd = new FormData(); fd.append('event_id', eventId); fd.append('file', f)
      const r = await fetch('/api/events/lower-thirds/background', { method: 'POST', body: fd })
      const j = await r.json().catch(() => ({})) as { url?: string; error?: string; width?: number; height?: number }
      if (!r.ok || !j.url) throw new Error(j.error ?? 'Upload failed.')
      set({ background_url: j.url }); setMsg({ text: `Graphic uploaded (${j.width}×${j.height}, shrunk to 1920×1080). Press Save to keep it.`, ok: true })
    } catch (e) { setMsg({ text: e instanceof Error ? e.message : 'Upload failed.', ok: false }) } finally { setBusy(false) }
  }

  async function save() {
    setBusy(true); setMsg(null)
    try {
      const r = await fetch('/api/events/lower-thirds/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event_id: eventId, config: draft }) })
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? 'Could not save.')
      setSavedJson(JSON.stringify(draft)); setMsg({ text: 'Lower-third template saved.', ok: true })
    } catch (e) { setMsg({ text: e instanceof Error ? e.message : 'Could not save.', ok: false }) } finally { setBusy(false) }
  }

  const pollClip = useCallback(async (sid: string) => {
    const r = await fetch(`/api/events/lower-thirds/clip?event_id=${eventId}&speaker_id=${sid}`)
    const j = await r.json().catch(() => null) as { status: string; url?: string | null } | null
    if (j) setClip(j)
    return j?.status
  }, [eventId])

  // eslint-disable-next-line react-hooks/set-state-in-effect -- forget the previous speaker's clip when the speaker changes
  useEffect(() => { setClip(null) }, [speakerId])
  useEffect(() => {
    if (clip?.status !== 'generating' || !speakerId) return
     
    const t = setInterval(() => { void pollClip(speakerId) }, 4000)
    return () => clearInterval(t)
  }, [clip?.status, speakerId, pollClip])

  async function renderClip() {
    if (!speakerId) return
    if (dirty) { setMsg({ text: 'Save your changes first — the clip uses the saved template.', ok: false }); return }
    setBusy(true); setMsg(null)
    try {
      const r = await fetch('/api/events/lower-thirds/clip', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event_id: eventId, speaker_id: speakerId }) })
      const j = await r.json().catch(() => ({})) as { error?: string }
      if (!r.ok) throw new Error(j.error ?? 'Could not queue the clip.')
      setClip({ status: 'generating' })
    } catch (e) { setMsg({ text: e instanceof Error ? e.message : 'Could not queue the clip.', ok: false }) } finally { setBusy(false) }
  }

  if (!data) return <div style={{ fontSize: 13, color: 'var(--ink3)' }}>{msg?.text ?? 'Loading…'}</div>

  const sp = data.speakers.find(s => s.id === speakerId)
  const q = search.trim().toLowerCase()
  const shown = data.speakers.filter(s => !q || s.name.toLowerCase().includes(q) || s.company.toLowerCase().includes(q))
  const stageBg = STAGES.find(s => s.key === stage)!.bg
  const a = draft.animation

  return (
    <Card padded>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: 6 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--ink)' }}>Lower thirds</div>
          <div style={{ fontSize: 12.5, color: 'var(--ink3)', lineHeight: 1.6, maxWidth: 640 }}>
            The name card that appears over a speaker in the session video. One design for the whole event — the card slides in, stays on screen, then slides out.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Badge color={draft.background_url ? (dirty ? 'amber' : 'teal') : 'amber'}>{!draft.background_url ? 'No graphic yet' : dirty ? 'Unsaved changes' : 'Saved'}</Badge>
          {canEdit && <Button variant="teal" disabled={busy || !dirty} onClick={() => void save()}>Save template</Button>}
        </div>
      </div>

      {/* Live preview */}
      <div style={{ display: 'grid', gap: 8, margin: '10px 0 14px' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search speakers…" style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--ink)', fontSize: 13, width: 190 }} />
          <Select value={speakerId} onChange={e => setSpeakerId(e.target.value)} style={{ maxWidth: 360 }}>
            {shown.length === 0 && <option value="">No speakers match</option>}
            {shown.map(s => <option key={s.id} value={s.id}>{s.name}{s.company ? ` — ${s.company}` : ''}</option>)}
          </Select>
          <div style={{ display: 'flex', gap: 4 }}>
            {STAGES.map(s => <button key={s.key} type="button" onClick={() => setStage(s.key)} style={{ padding: '5px 10px', fontSize: 12, borderRadius: 6, border: `1px solid ${stage === s.key ? 'var(--teal-mid)' : 'var(--border-light)'}`, background: 'none', color: 'var(--ink2)', cursor: 'pointer', fontFamily: 'inherit' }}>{s.label}</button>)}
          </div>
          <Button variant="ghost" onClick={() => setPlayToken(t => t + 1)} disabled={!previewUrl || !draft.background_url}>↻ Replay</Button>
          <Button variant={draft.background_url ? 'ghost' : 'teal'} onClick={() => setPanelOpen(o => !o)}>{panelOpen ? 'Close settings' : '⚙ Template settings'}</Button>
        </div>
        <div style={{ position: 'relative', aspectRatio: '16 / 9', width: '100%', maxWidth: 720, borderRadius: 10, overflow: 'hidden', background: stageBg, border: '1px solid var(--border-light)' }}>
          {previewUrl && draft.background_url
            ? <img ref={cardRef} src={previewUrl} alt="Lower third preview" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, willChange: 'transform, opacity' }} />
            : <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink3)', fontSize: 13, padding: 20, textAlign: 'center' }}>{previewErr ?? (draft.background_url ? 'Drawing preview…' : 'Upload the lower-third graphic in Step 1 to see the preview.')}</div>}
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--ink4)' }}>
          {sp ? <>Showing <b>{sp.name}</b>{sp.title ? ` · ${sp.title}` : ''}{sp.company ? ` · ${sp.company}` : ''}. </> : null}
          Total on screen {ltTotal(a).toFixed(1)}s: slide in {a.in_dur}s · hold {a.hold}s · slide out {a.out_dur}s. The preview plays in your browser; the real clip comes from the video worker.
        </div>
      </div>

      <div style={{ display: 'grid', gap: 16 }}>
        <Sec n={4} title="Real clip (optional last check)" hint="the exact file the video will use">
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <Button variant="ghost" disabled={busy || !speakerId || !draft.background_url || !canEdit || clip?.status === 'generating'} onClick={() => void renderClip()}>
              {clip?.status === 'generating' ? 'Making the clip…' : `Make the real clip for ${sp?.name ?? 'this speaker'}`}
            </Button>
            <Button variant="ghost" disabled={!speakerId} onClick={() => void pollClip(speakerId)}>Check status</Button>
            <span style={{ fontSize: 12, color: 'var(--ink3)' }}>Takes a minute or two. Save the template first.</span>
          </div>
          {clip?.status === 'generated' && clip.url && <video controls src={clip.url} style={{ width: '100%', maxWidth: 640, borderRadius: 8, background: 'var(--card)' }} />}
          {clip?.status === 'generated' && clip.url && <div style={{ fontSize: 11.5, color: 'var(--ink4)' }}>This copy is for viewing and shows the card on black; the video itself uses the transparent version.</div>}
        </Sec>
      </div>
      {panelOpen && (
        <div role="dialog" aria-label="Lower-third template settings" style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(500px, 100vw)', zIndex: 1000, background: 'var(--card)', borderLeft: '1px solid var(--border)', boxShadow: 'var(--shadow-md)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '14px 18px', borderBottom: '1px solid var(--border-light)' }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--ink)', flex: 1 }}>Template settings</div>
            <Badge color={dirty ? 'amber' : 'teal'}>{dirty ? 'Unsaved' : 'Saved'}</Badge>
            {canEdit && <Button variant="teal" disabled={busy || !dirty} onClick={() => void save()}>Save</Button>}
            <Button variant="ghost" onClick={() => setPanelOpen(false)}>Close</Button>
          </div>
          <div style={{ fontSize: 12, color: 'var(--ink3)', padding: '8px 18px 0' }}>Changes show in the preview on the left as you make them. Save to keep them.</div>
          <div style={{ overflowY: 'auto', padding: '4px 18px 24px', display: 'grid', gap: 16, alignContent: 'start' }}>
        <Sec n={1} title="Graphic" hint="transparent PNG, 16:9 (e.g. 1920×1080 or 8000×4500)">
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <input ref={fileRef} type="file" accept="image/png" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = '' }} />
            {canEdit && <Button variant={draft.background_url ? 'ghost' : 'teal'} disabled={busy} onClick={() => fileRef.current?.click()}>{draft.background_url ? 'Replace graphic' : 'Upload graphic'}</Button>}
            <span style={{ fontSize: 12.5, color: 'var(--ink3)' }}>{draft.background_url ? 'Graphic set. It is shrunk to 1920×1080 when uploaded, so positions below use that canvas.' : 'The bar/shape design, with no text — the name, title and company are added on top.'}</span>
          </div>
        </Sec>

        <Sec n={2} title="Text" hint="positions are pixels on the 1920×1080 frame (top-left of each line)">
          <label style={{ fontSize: 11, color: 'var(--ink3)', display: 'grid', gap: 3, maxWidth: 320 }}>
            Font (all three lines)
            <Select value={draft.font_id ?? ''} disabled={!canEdit} onChange={e => set({ font_id: e.target.value || null })}>
              <option value="">Default font</option>
              {data.fonts.map(f => <option key={f.id} value={f.id}>{f.family_name}</option>)}
            </Select>
          </label>
          {(['name', 'title', 'company'] as const).map(k => {
            const e = draft[k]
            return (
              <div key={k} style={{ border: '1px solid var(--border-light)', borderRadius: 10, padding: 12, display: 'grid', gap: 8 }}>
                <div style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--ink)' }}>{EL_LABEL[k]}</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(104px, 1fr))', gap: 8, alignItems: 'end' }}>
                  <Num label="Size (px)" value={e.size} min={8} max={200} disabled={!canEdit} onChange={v => setEl(k, { size: v })} />
                  <Num label="Across (x)" value={e.x} min={0} max={1920} disabled={!canEdit} onChange={v => setEl(k, { x: v })} />
                  <Num label="Down (y)" value={e.y} min={0} max={1080} disabled={!canEdit} onChange={v => setEl(k, { y: v })} />
                  <Num label="Width" value={e.width} min={40} max={1920} disabled={!canEdit} onChange={v => setEl(k, { width: v })} />
                  <Num label="Max lines" value={e.max_lines} min={1} max={4} disabled={!canEdit} onChange={v => setEl(k, { max_lines: Math.round(v) })} />
                  <label style={{ fontSize: 11, color: 'var(--ink3)', display: 'grid', gap: 3 }}>Weight
                    <Select value={e.weight} disabled={!canEdit} onChange={ev => setEl(k, { weight: Number(ev.target.value) })}>
                      <option value={400}>Regular</option><option value={500}>Medium</option><option value={600}>Semibold</option><option value={700}>Bold</option>
                    </Select>
                  </label>
                  <label style={{ fontSize: 11, color: 'var(--ink3)', display: 'grid', gap: 3 }}>Colour
                    {/* eslint-disable-next-line no-restricted-syntax -- colour input needs a hex fallback */}
                    <input type="color" value={/^#[0-9a-f]{6}$/i.test(e.color) ? e.color : '#ffffff'} disabled={!canEdit} onChange={ev => setEl(k, { color: ev.target.value.toUpperCase() })} style={{ width: '100%', height: 34, border: '1px solid var(--border)', borderRadius: 6, background: 'none', padding: 2 }} />
                  </label>
                  <label style={{ fontSize: 12, color: 'var(--ink2)', display: 'flex', gap: 6, alignItems: 'center', paddingBottom: 8 }}>
                    <input type="checkbox" checked={e.upper} disabled={!canEdit} onChange={ev => setEl(k, { upper: ev.target.checked })} /> CAPITALS
                  </label>
                </div>
              </div>
            )
          })}
        </Sec>

        <Sec n={3} title="Animation" hint="the whole card moves as one">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 8, alignItems: 'end' }}>
            <label style={{ fontSize: 11, color: 'var(--ink3)', display: 'grid', gap: 3 }}>Style
              <Select value={a.style} disabled={!canEdit} onChange={e => set({ animation: { ...a, style: e.target.value as 'slide_left' | 'fade' } })}>
                <option value="slide_left">Slide in from left + fade</option><option value="fade">Fade only</option>
              </Select>
            </label>
            <Num label="Slide in (s)" value={a.in_dur} min={0.1} max={3} step={0.1} disabled={!canEdit} onChange={v => set({ animation: { ...a, in_dur: v } })} />
            <Num label="Stay on screen (s)" value={a.hold} min={1} max={30} step={0.5} disabled={!canEdit} onChange={v => set({ animation: { ...a, hold: v } })} />
            <Num label="Slide out (s)" value={a.out_dur} min={0.1} max={3} step={0.1} disabled={!canEdit} onChange={v => set({ animation: { ...a, out_dur: v } })} />
            {a.style === 'slide_left' && <Num label="Slide distance (px)" value={a.slide_px} min={0} max={1200} step={20} disabled={!canEdit} onChange={v => set({ animation: { ...a, slide_px: v } })} />}
          </div>
        </Sec>
          </div>
        </div>
      )}
      <Toast message={msg?.text ?? null} type={msg?.ok ? 'success' : 'error'} onClose={() => setMsg(null)} />
    </Card>
  )
}
