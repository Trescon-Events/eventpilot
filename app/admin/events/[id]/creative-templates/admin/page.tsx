'use client'

import { useState, useEffect, useRef, use } from 'react'
import PageHeader from '@/app/components/PageHeader'
import { Button, Badge, Input, Select } from '@/app/components/ui'
import AccessTab from '@/app/components/AccessTab'
import type { Layer, ImageLayer, PhotoSlotLayer, TextLayer, Variant, CreativeTemplateConfig, TextLayerDiagnostics } from '@/app/lib/announcements/composite'
import { withTextLayerDefaults } from '@/app/lib/announcements/text-layer-defaults'
import LayerBoxOverlay from './LayerBoxOverlay'

/* Stakeholder Announcement Engine — Admin Console (PRD v1.4 Phase C v3,
   split into landing + admin console per Madhu's 2026-07-27 restructure
   request). Branding-team-only (admin-tier 'sae' module_access, enforced
   server-side by ./layout.tsx — this page assumes that gate already
   passed). Two tabs: Variants (the layer-stack editor, unchanged from the
   original single-page version) and Access Control (who can use/administer
   this module — the shared AccessTab component, module_access table). */

export type StakeholderKind = 'speaker' | 'partner'
export type StakeholderOption = {
  id: string; label: string
  // Ghost-overlay content (2026-07-31) — enough to show the REAL text/
  // photo/logo directly on the canvas while positioning a box, without a
  // server round-trip. Undefined fields fall back to the same placeholder
  // text/blank the server preview itself uses when nothing is selected.
  job_title?: string; company_name?: string
  photo_url?: string | null; company_logo_url?: string | null; logo_url?: string | null
}
type EditorSnapshot = { speakerVariants: Variant[]; partnerVariants: Variant[]; activeType: StakeholderKind; activeVariantId: string | null }
const MAX_UNDO_ENTRIES = 50

const LAYER_TYPE_LABEL: Record<Layer['type'], string> = { image: 'Image', photo_slot: 'Photo/Logo Slot', text: 'Text' }

// Mirrors composite.ts's DEFAULT_MAX_LINES — kept here too (not imported)
// since it's just the starting value for a freshly-added layer, not a
// runtime fallback; the two are allowed to diverge without breaking anything.
const DEFAULT_MAX_LINES_BY_FIELD: Record<TextLayer['field'], number> = { name: 3, title: 2, company: 2, tier: 2, custom: 2 }

function newLayer(type: Layer['type'], activeType: StakeholderKind, canvasWidth: number, canvasHeight: number): Layer {
  const id = crypto.randomUUID()
  // Image layers are always full-bleed background/overlay art pre-sized by
  // the design team to the variant's exact canvas — default to that instead
  // of an arbitrary box, since there's no manual resize UI for this layer type.
  if (type === 'image') return { id, type: 'image', asset_url: '', x: 0, y: 0, width: canvasWidth, height: canvasHeight }
  if (type === 'photo_slot') return { id, type: 'photo_slot', source: activeType === 'speaker' ? 'speaker_photo' : 'partner_logo', x: 0, y: 0, width: 400, height: 400 }
  const field: TextLayer['field'] = activeType === 'speaker' ? 'name' : 'custom'
  const maxLines = DEFAULT_MAX_LINES_BY_FIELD[field]
  const fontSize = 32
  const width = Math.round(canvasWidth * 0.6)
  const height = Math.round(maxLines * fontSize * 1.2)
  // eslint-disable-next-line no-restricted-syntax -- font_color is composited-creative content data, not EventPilot UI theming; the color rule governs var(--token) styling, not this
  return { id, type: 'text', field, value: activeType === 'partner' ? 'LEAD SPONSOR' : undefined, x: 40, y: 40, width, height, max_lines: maxLines, font_size: fontSize, font_color: '#FFFFFF', font_weight: 'normal', align: 'left' }
}

// Fills in width/height/max_lines for any text layer saved before Phase C
// v5 (real production variants predate this — e.g. Sir Alistair Raymond
// Pemberton's "Speaking At" variant), purely so its box is visible/
// draggable immediately on load. Applied once at fetch time, NOT inside
// mutate() — merely opening an old variant must not mark it dirty and
// eligible to save; only a real edit (typing a field, dragging a box)
// should. If the MM never touches the layer, the same defaulting logic
// also runs server-side at render time (composite.ts), so nothing here
// is the only source of truth for what actually gets composited.
function normalizeVariantTextLayers(variant: Variant): Variant {
  return {
    ...variant,
    layers: variant.layers.map(layer =>
      layer.type === 'text' ? withTextLayerDefaults(layer, { width: variant.canvas_width, height: variant.canvas_height }) : layer
    ),
  }
}

export default function CreativeTemplatesAdminPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = use(params)
  const [consoleTab, setConsoleTab] = useState<'variants' | 'access'>('variants')

  const [loading, setLoading] = useState(true)
  const [speakerVariants, setSpeakerVariants] = useState<Variant[]>([])
  const [partnerVariants, setPartnerVariants] = useState<Variant[]>([])
  const [activeType, setActiveType] = useState<StakeholderKind>('speaker')
  const [activeVariantId, setActiveVariantId] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [uploadingLayerId, setUploadingLayerId] = useState<string | null>(null)
  // Lifted out of LayerRow (was private per-row state) so LayerBoxOverlay
  // can highlight the same layer that's expanded in the accordion, and
  // clicking a box on the live preview can open its corresponding row.
  const [expandedLayerId, setExpandedLayerId] = useState<string | null>(null)
  const [textDiagnostics, setTextDiagnostics] = useState<Record<string, TextLayerDiagnostics>>({})

  const [speakers, setSpeakers] = useState<StakeholderOption[]>([])
  const [partners, setPartners] = useState<StakeholderOption[]>([])
  const [brandFonts, setBrandFonts] = useState<Array<{ id: string; family_name: string; regular_url: string; bold_url: string | null }>>([])
  const [previewFor, setPreviewFor] = useState<string>('')
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  // Stale-while-revalidate (2026-07-31 UX pass, replacing the old debounced
  // auto-render): switching speaker/partner keeps showing the last render,
  // dimmed + badged, since the box layout is still correct and only the
  // injected photo/text is stale. Switching variant/type clears it outright
  // (see the effect below) since the layout itself just changed underneath
  // it — an old image there would be actively misleading, not just stale.
  const [previewStale, setPreviewStale] = useState(false)
  const previewReqIdRef = useRef(0)

  // Undo/redo (2026-07-31) — commit-point snapshots, not per-keystroke/
  // per-pointermove. Lives in refs (not state) since snapshots are pushed
  // imperatively from many call sites and don't themselves need to trigger
  // renders; undoCount/redoCount below are the render-triggering mirror,
  // used only to enable/disable the toolbar buttons.
  const undoStackRef = useRef<EditorSnapshot[]>([])
  const redoStackRef = useRef<EditorSnapshot[]>([])
  const [undoCount, setUndoCount] = useState(0)
  const [redoCount, setRedoCount] = useState(0)

  const variants = activeType === 'speaker' ? speakerVariants : partnerVariants
  const setVariants = activeType === 'speaker' ? setSpeakerVariants : setPartnerVariants
  const activeVariant = variants.find(v => v.id === activeVariantId) ?? null
  const stakeholderOptions = activeType === 'speaker' ? speakers : partners
  const previewForRecord = stakeholderOptions.find(o => o.id === previewFor) ?? null

  async function fetchAll() {
    setLoading(true)
    const [configRes, spRes, ptRes, fontsRes] = await Promise.all([
      fetch(`/api/events/templates?event_id=${eventId}`),
      fetch(`/api/events/stakeholders/speakers?event_id=${eventId}`),
      fetch(`/api/events/stakeholders/partners?event_id=${eventId}`),
      fetch('/api/branding/fonts'),
    ])
    const config: CreativeTemplateConfig | null = await configRes.json().catch(() => null)
    const loadedSpeakerVariants = (config?.speaker?.variants ?? []).map(normalizeVariantTextLayers)
    const loadedPartnerVariants = (config?.partner?.variants ?? []).map(normalizeVariantTextLayers)
    setSpeakerVariants(loadedSpeakerVariants)
    setPartnerVariants(loadedPartnerVariants)
    // Auto-select the first variant for the active tab on initial load — the
    // tab-switch effect below only fires when activeType *changes*, so
    // without this, a variant that already existed before this page load
    // never gets selected until the MM manually switches tabs and back.
    const initialList = activeType === 'speaker' ? loadedSpeakerVariants : loadedPartnerVariants
    setActiveVariantId(prev => prev ?? initialList[0]?.id ?? null)
    const sp: Array<{ id: string; full_name: string; job_title: string; company_name: string; photo_processed_url: string | null; photo_url: string | null; company_logo_url: string | null }> = await spRes.json().catch(() => [])
    const pt: Array<{ id: string; company_name: string; logo_url: string | null }> = await ptRes.json().catch(() => [])
    setSpeakers(sp.map(s => ({ id: s.id, label: s.full_name, job_title: s.job_title, company_name: s.company_name, photo_url: s.photo_processed_url ?? s.photo_url, company_logo_url: s.company_logo_url })))
    setPartners(pt.map(p => ({ id: p.id, label: p.company_name, company_name: p.company_name, logo_url: p.logo_url })))
    setBrandFonts(await fontsRes.json().catch(() => []))
    setDirty(false)
    setLoading(false)
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-mount; matches app/admin/events/[id]/stakeholders/page.tsx's fetchAll effect
  useEffect(() => { fetchAll() }, [eventId])

  useEffect(() => {
    const list = activeType === 'speaker' ? speakerVariants : partnerVariants
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resets the selected variant/preview target on tab switch; a derived-state reset, not a fetch side effect, but the same standard pattern
    setActiveVariantId(list[0]?.id ?? null)
    setPreviewFor('')
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-select on tab switch, not on every variants edit
  }, [activeType])

  // On-demand preview (2026-07-31, replacing the old 500ms-debounced
  // auto-render-on-every-edit) — Madhu's explicit request: dragging/typing
  // only ever touches local state (already instant, no network involved),
  // the real Sharp render only fires on the "Generate Preview" button
  // below. The box layout just changed underneath whatever was rendered,
  // so an old image would be actively misleading — clear it outright.
  // (Switching previewFor alone does NOT clear it — see the effect below.)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- clears a now-invalid preview when the box layout it was rendered against just changed; a derived-state reset, not a fetch side effect
    setPreviewDataUrl(null)
    setPreviewStale(false)
  }, [activeVariantId, activeType])

  // Switching which speaker/partner is injected doesn't invalidate the
  // layout — keep showing the last render, just mark it stale (dimmed +
  // badged in the JSX below) rather than clearing it.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- marks the existing image stale rather than a fetch side effect; no-ops harmlessly if there's nothing rendered yet
    if (previewDataUrl) setPreviewStale(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to previewFor changing, not previewDataUrl itself (would loop)
  }, [previewFor])

  async function generatePreview() {
    if (!activeVariant) return
    const reqId = ++previewReqIdRef.current
    setPreviewLoading(true)
    const body: Record<string, unknown> = { stakeholder_type: activeType, variant: activeVariant }
    if (previewFor) body[activeType === 'speaker' ? 'speaker_id' : 'partner_id'] = previewFor
    const res = await fetch('/api/events/templates/preview', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    const data = await res.json().catch(() => ({}))
    if (reqId !== previewReqIdRef.current) return // a newer click superseded this one — discard
    setPreviewDataUrl(res.ok ? data.preview_data_url : null)
    setPreviewStale(false)
    setTextDiagnostics(res.ok ? (data.text_diagnostics ?? {}) : {})
    setPreviewLoading(false)
  }

  function mutate(fn: (vs: Variant[]) => Variant[]) {
    setVariants(fn)
    setDirty(true)
  }

  // Undo/redo (2026-07-31) — push the PRE-edit snapshot at commit points
  // (discrete actions call this directly; drags/NumField edits call it
  // once at the start of a gesture/focus, see LayerBoxOverlay and NumField
  // below). A new edit always clears the redo stack — standard undo
  // semantics, redoing a since-diverged future doesn't make sense.
  function pushUndo() {
    undoStackRef.current.push({ speakerVariants, partnerVariants, activeType, activeVariantId })
    if (undoStackRef.current.length > MAX_UNDO_ENTRIES) undoStackRef.current.shift()
    redoStackRef.current = []
    setUndoCount(undoStackRef.current.length)
    setRedoCount(0)
  }

  // Discards the most recently pushed undo entry — used when a
  // focus→blur field edit turns out to be a no-op (value unchanged), so
  // the undo stack doesn't accumulate entries for edits that never happened.
  function discardLastUndo() {
    undoStackRef.current.pop()
    setUndoCount(undoStackRef.current.length)
  }

  function undo() {
    const entry = undoStackRef.current.pop()
    if (!entry) return
    redoStackRef.current.push({ speakerVariants, partnerVariants, activeType, activeVariantId })
    setSpeakerVariants(entry.speakerVariants)
    setPartnerVariants(entry.partnerVariants)
    setActiveType(entry.activeType)
    setActiveVariantId(entry.activeVariantId)
    setDirty(true)
    setUndoCount(undoStackRef.current.length)
    setRedoCount(redoStackRef.current.length)
  }

  function redo() {
    const entry = redoStackRef.current.pop()
    if (!entry) return
    undoStackRef.current.push({ speakerVariants, partnerVariants, activeType, activeVariantId })
    setSpeakerVariants(entry.speakerVariants)
    setPartnerVariants(entry.partnerVariants)
    setActiveType(entry.activeType)
    setActiveVariantId(entry.activeVariantId)
    setDirty(true)
    setUndoCount(undoStackRef.current.length)
    setRedoCount(redoStackRef.current.length)
  }

  // Global Cmd/Ctrl+Z / Cmd/Ctrl+Shift+Z — guarded against firing while
  // focus is in a text input/select so it never fights native field-level
  // undo (e.g. inside the variant name Input). Latest-ref pattern so the
  // listener is attached once ([] deps) but always calls the current
  // undo/redo closures (which capture fresh state every render).
  const undoRef = useRef(undo)
  const redoRef = useRef(redo)
  useEffect(() => {
    undoRef.current = undo
    redoRef.current = redo
  })

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const active = document.activeElement
      const isEditable = active instanceof HTMLElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName)
      if (isEditable) return
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) redoRef.current(); else undoRef.current()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  function updateActiveVariant(patch: Partial<Variant>) {
    if (!activeVariantId) return
    mutate(vs => vs.map(v => v.id === activeVariantId ? { ...v, ...patch } : v))
    // Every layer/variant edit (field change, drag, add/delete/reorder — all
    // funnel through here) invalidates whatever's currently rendered. Marks
    // stale rather than clearing outright — same "keep showing the last
    // render, dimmed + badged" treatment as switching previewFor below,
    // which also brings the ghost overlay back for the active layer so font/
    // color/weight/position edits get instant client-side feedback again
    // without paying for a new server render on every keystroke.
    if (previewDataUrl) setPreviewStale(true)
  }

  function addVariant() {
    pushUndo()
    const variant: Variant = { id: crypto.randomUUID(), name: 'Untitled Variant', canvas_width: 1080, canvas_height: 1350, layers: [] }
    mutate(vs => [...vs, variant])
    setActiveVariantId(variant.id)
  }

  function deleteVariant(id: string) {
    const variant = variants.find(v => v.id === id)
    if (!variant) return
    if (!confirm(`Delete variant "${variant.name || 'Untitled Variant'}" and its ${variant.layers.length} layer${variant.layers.length === 1 ? '' : 's'}?`)) return
    pushUndo()
    mutate(vs => vs.filter(v => v.id !== id))
    if (activeVariantId === id) setActiveVariantId(null)
  }

  function addLayer(type: Layer['type']) {
    if (!activeVariant) return
    pushUndo()
    updateActiveVariant({ layers: [...activeVariant.layers, newLayer(type, activeType, activeVariant.canvas_width, activeVariant.canvas_height)] })
  }

  function updateLayer(layerId: string, patch: Partial<Layer>) {
    if (!activeVariant) return
    updateActiveVariant({ layers: activeVariant.layers.map(l => l.id === layerId ? ({ ...l, ...patch } as Layer) : l) })
  }

  function deleteLayer(layerId: string) {
    if (!activeVariant) return
    pushUndo()
    updateActiveVariant({ layers: activeVariant.layers.filter(l => l.id !== layerId) })
  }

  function moveLayer(layerId: string, delta: 1 | -1) {
    if (!activeVariant) return
    const layers = [...activeVariant.layers]
    const idx = layers.findIndex(l => l.id === layerId)
    const swapIdx = idx + delta
    if (idx < 0 || swapIdx < 0 || swapIdx >= layers.length) return
    pushUndo()
    ;[layers[idx], layers[swapIdx]] = [layers[swapIdx], layers[idx]]
    updateActiveVariant({ layers })
  }

  async function uploadLayerImage(layerId: string, file: File) {
    setUploadingLayerId(layerId)
    const form = new FormData()
    form.append('file', file)
    form.append('event_id', eventId)
    form.append('template_type', activeType)
    const res = await fetch('/api/events/templates/upload', { method: 'POST', body: form })
    const data = await res.json().catch(() => ({}))
    if (res.ok && data.url) updateLayer(layerId, { asset_url: data.url } as Partial<ImageLayer>)
    else setMsg(data.error || 'Layer image upload failed.')
    setUploadingLayerId(null)
  }

  async function save() {
    setSaving(true)
    const res = await fetch('/api/events/templates/variants', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_id: eventId, stakeholder_type: activeType, variants }),
    })
    const data = await res.json().catch(() => ({}))
    if (res.ok) { setDirty(false); setMsg('Saved.') } else { setMsg(data.error || 'Save failed.') }
    setSaving(false)
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--surface)' }}>
      <PageHeader
        eyebrow="Event Workspace · Admin Console"
        title="Stakeholder Announcement Engine"
        description="Branding-team console — build and edit creative variants (layer stacks), and manage who has access to this tool."
        actions={consoleTab === 'variants' ? (
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <Button variant="ghost" onClick={undo} disabled={undoCount === 0} title="Undo (Cmd/Ctrl+Z)">↶ Undo</Button>
            <Button variant="ghost" onClick={redo} disabled={redoCount === 0} title="Redo (Cmd/Ctrl+Shift+Z)">↷ Redo</Button>
            <Button variant="lime" onClick={save} disabled={saving || !dirty}>{saving ? 'Saving…' : dirty ? 'Save Changes' : 'Saved'}</Button>
          </div>
        ) : undefined}
      />

      <div style={{ padding: '24px 32px' }}>
        <div style={{ display: 'flex', borderRadius: '8px', border: '1px solid var(--border)', overflow: 'hidden', width: 'fit-content', marginBottom: '20px' }}>
          {([['variants', 'Variants'], ['access', 'Access Control']] as const).map(([key, label]) => (
            <button key={key} onClick={() => setConsoleTab(key)}
              style={{
                padding: '7px 18px', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '12.5px', fontWeight: 700,
                background: consoleTab === key ? 'var(--card)' : 'transparent',
                color: consoleTab === key ? 'var(--ink)' : 'var(--ink3)',
              }}>
              {label}
            </button>
          ))}
        </div>

        {consoleTab === 'access' ? (
          <AccessTab moduleKey="sae" moduleLabel="Stakeholder Announcement Engine" />
        ) : (
          <>
            {msg && (
              <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'var(--red-light)', border: '1px solid var(--red-border)', color: 'var(--red)', fontSize: '12.5px', marginBottom: '16px' }}>
                {msg} <button onClick={() => setMsg(null)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontWeight: 700, marginLeft: '8px' }}>×</button>
              </div>
            )}

            <div style={{ display: 'flex', borderRadius: '8px', border: '1px solid var(--border)', overflow: 'hidden', width: 'fit-content', marginBottom: '20px' }}>
              {(['speaker', 'partner'] as const).map(t => (
                <button key={t} onClick={() => setActiveType(t)}
                  style={{
                    padding: '7px 18px', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '12.5px', fontWeight: 700,
                    background: activeType === t ? 'var(--card)' : 'transparent',
                    color: activeType === t ? 'var(--ink)' : 'var(--ink3)',
                  }}>
                  {t === 'speaker' ? 'Speaker' : 'Partner'}
                </button>
              ))}
            </div>

            {loading ? (
              <div style={{ color: 'var(--ink3)', fontSize: '13px' }}>Loading…</div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr 1fr', gap: '24px', alignItems: 'flex-start' }}>
                {/* Variant list */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {variants.map(v => (
                    <button key={v.id} onClick={() => setActiveVariantId(v.id)}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px',
                        padding: '9px 12px', borderRadius: '8px', border: 'none', textAlign: 'left', cursor: 'pointer',
                        fontFamily: 'inherit', fontSize: '13px', fontWeight: 700,
                        background: activeVariantId === v.id ? 'var(--card)' : 'transparent',
                        color: activeVariantId === v.id ? 'var(--ink)' : 'var(--ink3)',
                      }}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.name || 'Untitled Variant'}</span>
                      <span style={{ fontSize: '11px', color: 'var(--ink4)', flexShrink: 0 }}>{v.layers.length}</span>
                    </button>
                  ))}
                  <Button variant="ghost" onClick={addVariant}>+ New Variant</Button>
                </div>

                {/* Layer editor — plain container, not a nested Card; LayerRow's own
                    border is the only "box" here, so this reads as one workspace
                    instead of a card-in-a-card. */}
                <div>
                  {!activeVariant ? (
                    <div style={{ color: 'var(--ink3)', fontSize: '13px', textAlign: 'center', padding: '40px 0' }}>
                      {`No ${activeType} variants yet — click "+ New Variant" to start one.`}
                    </div>
                  ) : (
                    <>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '10px', alignItems: 'center', marginBottom: '14px' }}>
                        <Input value={activeVariant.name} onChange={e => updateActiveVariant({ name: e.target.value })} placeholder="Variant name" />
                        <label style={{ fontSize: '11px', color: 'var(--ink3)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          W <Input type="number" value={activeVariant.canvas_width} onChange={e => updateActiveVariant({ canvas_width: Number(e.target.value) })} style={{ width: '70px' }} />
                        </label>
                        <label style={{ fontSize: '11px', color: 'var(--ink3)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          H <Input type="number" value={activeVariant.canvas_height} onChange={e => updateActiveVariant({ canvas_height: Number(e.target.value) })} style={{ width: '70px' }} />
                        </label>
                      </div>

                      <div style={{ fontSize: '11px', color: 'var(--ink3)', marginBottom: '10px' }}>
                        Layers, bottom to top — the last one renders on top of everything above it.
                      </div>

                      <div style={{ display: 'grid', gap: '8px', marginBottom: '14px' }}>
                        {activeVariant.layers.map((layer, i) => (
                          <LayerRow
                            key={layer.id}
                            layer={layer}
                            index={i}
                            total={activeVariant.layers.length}
                            activeType={activeType}
                            uploading={uploadingLayerId === layer.id}
                            brandFonts={brandFonts}
                            expanded={expandedLayerId === layer.id}
                            onToggleExpand={() => setExpandedLayerId(id => id === layer.id ? null : layer.id)}
                            diagnostics={layer.type === 'text' ? textDiagnostics[layer.id] : undefined}
                            onChange={patch => updateLayer(layer.id, patch)}
                            onDelete={() => deleteLayer(layer.id)}
                            onMove={delta => moveLayer(layer.id, delta)}
                            onUploadImage={file => uploadLayerImage(layer.id, file)}
                            pushUndo={pushUndo}
                            discardLastUndo={discardLastUndo}
                          />
                        ))}
                        {activeVariant.layers.length === 0 && (
                          <div style={{ color: 'var(--ink3)', fontSize: '12.5px', padding: '10px 0' }}>No layers yet.</div>
                        )}
                      </div>

                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        <Button variant="ghost" onClick={() => addLayer('image')}>+ Image Layer</Button>
                        <Button variant="ghost" onClick={() => addLayer('photo_slot')}>+ Photo/Logo Slot</Button>
                        <Button variant="ghost" onClick={() => addLayer('text')}>+ Text Layer</Button>
                        <Button variant="red" onClick={() => deleteVariant(activeVariant.id)}>Delete Variant</Button>
                      </div>
                    </>
                  )}
                </div>

                {/* Preview — on-demand as of 2026-07-31 (was auto-rendering on
                    every edit, which meant every drag pixel triggered a real
                    multi-second Sharp render). Dragging/editing only ever
                    touches local state now; the Generate Preview button is
                    the one place that actually pays for a server render. */}
                <div style={{ position: 'sticky', top: '20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginBottom: '10px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--teal-mid)', letterSpacing: '0.6px', textTransform: 'uppercase' }}>Preview</span>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <Select value={previewFor} onChange={e => setPreviewFor(e.target.value)} style={{ width: '200px' }}>
                        <option value="">Placeholder data</option>
                        {stakeholderOptions.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                      </Select>
                      <Button variant="teal" onClick={generatePreview} disabled={!activeVariant || previewLoading}>
                        {previewLoading ? 'Generating…' : 'Generate Preview'}
                      </Button>
                    </div>
                  </div>
                  <div style={{ position: 'relative', borderRadius: '10px', overflow: 'hidden', background: 'var(--surface)', border: '1px solid var(--border-light)', aspectRatio: activeVariant ? `${activeVariant.canvas_width} / ${activeVariant.canvas_height}` : '4 / 5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {previewDataUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- data: URL preview, next/image can't handle these
                      <img src={previewDataUrl} alt="Creative preview" style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block', opacity: previewStale ? 0.45 : 1, transition: 'opacity 0.15s ease' }} />
                    ) : (
                      <span style={{ fontSize: '12px', color: 'var(--ink3)' }}>
                        {!activeVariant ? 'Select a variant' : previewLoading ? 'Generating…' : 'No preview yet — click Generate Preview'}
                      </span>
                    )}
                    {/* Stale-while-revalidate: the old render stays visible (dimmed
                        above) rather than being replaced by a blank "Rendering…"
                        state — this badge is the only new UI while a fresh one loads. */}
                    {previewLoading && previewDataUrl && (
                      <span style={{ position: 'absolute', top: '10px', left: '10px', padding: '4px 10px', borderRadius: '20px', background: 'color-mix(in srgb, var(--card) 90%, transparent)', border: '1px solid var(--border)', fontSize: '11px', fontWeight: 700, color: 'var(--ink2)', zIndex: 20 }}>
                        Generating…
                      </span>
                    )}
                    {!previewLoading && previewStale && previewDataUrl && (
                      <span style={{ position: 'absolute', top: '10px', left: '10px', padding: '4px 10px', borderRadius: '20px', background: 'color-mix(in srgb, var(--amber) 20%, var(--card))', border: '1px solid var(--amber-border)', fontSize: '11px', fontWeight: 700, color: 'var(--amber)', zIndex: 20 }}>
                        Stale — click Generate Preview
                      </span>
                    )}
                    {activeVariant && (
                      <LayerBoxOverlay
                        layers={activeVariant.layers}
                        canvasWidth={activeVariant.canvas_width}
                        canvasHeight={activeVariant.canvas_height}
                        activeLayerId={expandedLayerId}
                        onSelectLayer={setExpandedLayerId}
                        onChangeLayer={updateLayer}
                        onCommitUndo={pushUndo}
                        activeType={activeType}
                        previewForRecord={previewForRecord}
                        showGhost={!previewDataUrl || previewStale}
                        hasUnderlyingPreview={!!previewDataUrl}
                      />
                    )}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function LayerRow({ layer, index, total, activeType, uploading, brandFonts, expanded, onToggleExpand, diagnostics, onChange, onDelete, onMove, onUploadImage, pushUndo, discardLastUndo }: {
  layer: Layer
  index: number
  total: number
  activeType: StakeholderKind
  uploading: boolean
  brandFonts: Array<{ id: string; family_name: string; regular_url: string; bold_url: string | null }>
  expanded: boolean
  onToggleExpand: () => void
  diagnostics?: TextLayerDiagnostics
  onChange: (patch: Partial<Layer>) => void
  onDelete: () => void
  onMove: (delta: 1 | -1) => void
  onUploadImage: (file: File) => void
  pushUndo: () => void
  discardLastUndo: () => void
}) {
  return (
    <div style={{ border: expanded ? '1px solid var(--lime)' : '1px solid var(--border-light)', borderRadius: '8px', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px', background: 'var(--surface)' }}>
        <Badge color={layer.type === 'image' ? 'purple' : layer.type === 'photo_slot' ? 'amber' : 'teal'}>{LAYER_TYPE_LABEL[layer.type]}</Badge>
        <button onClick={onToggleExpand} style={{ flex: 1, textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '12.5px', color: 'var(--ink)', fontWeight: 700 }}>
          {layerSummary(layer)}
        </button>
        {diagnostics?.did_truncate && <span title="Text was shrunk and still had to be cut off with an ellipsis to fit its box" style={{ fontSize: '10.5px', fontWeight: 700, color: 'var(--red)' }}>⚠ truncated</span>}
        {diagnostics?.did_shrink && !diagnostics.did_truncate && <span title="Font size was auto-shrunk to fit its box" style={{ fontSize: '10.5px', fontWeight: 700, color: 'var(--amber)' }}>shrunk to fit</span>}
        <span style={{ fontSize: '10.5px', color: 'var(--ink4)' }}>{index + 1}/{total}</span>
        <button onClick={() => onMove(1)} disabled={index === total - 1} title="Bring forward" style={{ background: 'none', border: 'none', cursor: index === total - 1 ? 'default' : 'pointer', color: index === total - 1 ? 'var(--ink4)' : 'var(--ink2)', fontSize: '13px' }}>▲</button>
        <button onClick={() => onMove(-1)} disabled={index === 0} title="Send backward" style={{ background: 'none', border: 'none', cursor: index === 0 ? 'default' : 'pointer', color: index === 0 ? 'var(--ink4)' : 'var(--ink2)', fontSize: '13px' }}>▼</button>
        <button onClick={onDelete} title="Delete layer" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', fontSize: '13px' }}>✕</button>
      </div>

      {expanded && (
        <div style={{ padding: '12px 10px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          {layer.type === 'image' && <ImageLayerFields layer={layer} uploading={uploading} onChange={onChange as (patch: Partial<ImageLayer>) => void} onUploadImage={onUploadImage} pushUndo={pushUndo} discardLastUndo={discardLastUndo} />}
          {layer.type === 'photo_slot' && <PhotoSlotLayerFields layer={layer} activeType={activeType} onChange={onChange} pushUndo={pushUndo} discardLastUndo={discardLastUndo} />}
          {layer.type === 'text' && <TextLayerFields layer={layer} activeType={activeType} brandFonts={brandFonts} onChange={onChange} pushUndo={pushUndo} discardLastUndo={discardLastUndo} />}
        </div>
      )}
    </div>
  )
}

function layerSummary(layer: Layer): string {
  if (layer.type === 'image') return layer.asset_url ? `Image (${layer.width}×${layer.height})` : 'Image (no file uploaded)'
  if (layer.type === 'photo_slot') return `${layer.source.replace(/_/g, ' ')} (${layer.width}×${layer.height})`
  return `Text: ${layer.field}${layer.field === 'custom' || layer.field === 'tier' ? ` "${layer.value ?? ''}"` : ''}`
}

function NumField({ label, value, onChange, pushUndo, discardLastUndo }: {
  label: string; value: number; onChange: (v: number) => void
  pushUndo?: () => void; discardLastUndo?: () => void
}) {
  // Undo commit point (2026-07-31): snapshot on focus (before any edit),
  // discard that snapshot on blur if the value never actually changed —
  // live typing keeps using the unthrottled onChange below, this is a
  // separate side-channel so undo doesn't get an entry per keystroke.
  const focusValueRef = useRef(value)
  return (
    <label style={{ fontSize: '11px', color: 'var(--ink3)', display: 'block' }}>
      {label}
      <Input type="number" value={value}
        onFocus={() => { focusValueRef.current = value; pushUndo?.() }}
        onChange={e => onChange(Number(e.target.value))}
        onBlur={() => { if (focusValueRef.current === value) discardLastUndo?.() }}
        style={{ width: '100%', marginTop: '3px' }} />
    </label>
  )
}

function ImageLayerFields({ layer, uploading, onChange, onUploadImage, pushUndo, discardLastUndo }: {
  layer: ImageLayer; uploading: boolean; onChange: (patch: Partial<ImageLayer>) => void; onUploadImage: (file: File) => void
  pushUndo: () => void; discardLastUndo: () => void
}) {
  // Image layers default to full-bleed (newLayer() above), but aren't
  // locked to it — the box overlay on the live preview (LayerBoxOverlay)
  // can drag/resize them like any other layer now (2026-07-29 unification);
  // these NumFields are the precise-entry counterpart to that, matching
  // the pattern already used for photo/logo and text layers.
  return (
    <>
      <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: '10px' }}>
        {layer.asset_url && (
          // eslint-disable-next-line @next/next/no-img-element -- small admin-only thumbnail, not worth next/image's remote-loader setup
          <img src={layer.asset_url} alt="Layer asset" style={{ width: '40px', height: '50px', objectFit: 'cover', borderRadius: '4px', border: '1px solid var(--border-light)' }} />
        )}
        <label style={{ padding: '6px 12px', borderRadius: '8px', border: '1.5px solid var(--border)', background: 'transparent', color: 'var(--ink2)', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>
          {uploading ? 'Uploading…' : layer.asset_url ? 'Replace PNG' : 'Upload PNG'}
          <input type="file" accept="image/png" style={{ display: 'none' }} disabled={uploading}
            onChange={e => { const f = e.target.files?.[0]; if (f) onUploadImage(f); e.target.value = '' }} />
        </label>
      </div>
      <NumField label="X" value={layer.x} onChange={x => onChange({ x })} pushUndo={pushUndo} discardLastUndo={discardLastUndo} />
      <NumField label="Y" value={layer.y} onChange={y => onChange({ y })} pushUndo={pushUndo} discardLastUndo={discardLastUndo} />
      <NumField label="Width" value={layer.width} onChange={width => onChange({ width })} pushUndo={pushUndo} discardLastUndo={discardLastUndo} />
      <NumField label="Height" value={layer.height} onChange={height => onChange({ height })} pushUndo={pushUndo} discardLastUndo={discardLastUndo} />
    </>
  )
}

function PhotoSlotLayerFields({ layer, activeType, onChange, pushUndo, discardLastUndo }: {
  layer: PhotoSlotLayer; activeType: StakeholderKind; onChange: (patch: Partial<PhotoSlotLayer>) => void
  pushUndo: () => void; discardLastUndo: () => void
}) {
  const sourceOptions: PhotoSlotLayer['source'][] = activeType === 'speaker' ? ['speaker_photo', 'speaker_logo'] : ['partner_logo']
  const [analyzing, setAnalyzing] = useState(false)
  const [analyzeError, setAnalyzeError] = useState<string | null>(null)

  const isPhoto = layer.source === 'speaker_photo'

  async function analyzeReferenceLayer(file: File) {
    setAnalyzing(true)
    setAnalyzeError(null)
    const form = new FormData()
    form.append('file', file)
    const res = await fetch('/api/events/templates/derive-alignment', { method: 'POST', body: form })
    const data = await res.json().catch(() => ({}))
    if (res.ok) {
      onChange({
        x: data.box.x, y: data.box.y, width: data.box.width, height: data.box.height,
        // Face-alignment metadata only means anything for a speaker photo —
        // composite.ts only reads .alignment when source === 'speaker_photo',
        // but skip persisting it for logos so a logo layer's data doesn't
        // carry a meaningless "detected shot type".
        ...(isPhoto ? { alignment: { target_head_center_x: data.target_head_center_x, target_head_center_y: data.target_head_center_y, target_head_height: data.target_head_height, shot_type: data.shot_type } } : {}),
      })
    } else {
      setAnalyzeError(data.error || 'Could not analyze that reference image.')
    }
    setAnalyzing(false)
  }

  return (
    <>
      <label style={{ gridColumn: '1 / -1', fontSize: '11px', color: 'var(--ink3)', display: 'block' }}>
        Source
        <Select value={layer.source} onChange={e => onChange({ source: e.target.value as PhotoSlotLayer['source'] })} style={{ width: '100%', marginTop: '3px' }}>
          {sourceOptions.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
        </Select>
      </label>

      <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <label style={{ padding: '7px 14px', borderRadius: '8px', border: '1.5px solid var(--border)', color: 'var(--ink2)', fontSize: '12px', fontWeight: 700, cursor: 'pointer', width: 'fit-content' }}>
          {analyzing ? 'Analyzing…' : 'Upload Reference Layer (auto-position)'}
          <input type="file" accept="image/png" style={{ display: 'none' }} disabled={analyzing}
            onChange={e => { const f = e.target.files?.[0]; if (f) analyzeReferenceLayer(f); e.target.value = '' }} />
        </label>
        <div style={{ fontSize: '10.5px', color: 'var(--ink3)', lineHeight: 1.4 }}>
          {isPhoto
            ? <>Upload a transparent PNG showing a dummy photo already correctly positioned — the box and face-alignment target below are derived automatically. Manual fields below still work if you&apos;d rather set them by hand.</>
            : <>Upload a transparent PNG showing the logo already correctly positioned (e.g. a placeholder logo in its final spot) — the box below is derived automatically from where it sits. Manual fields below still work if you&apos;d rather set them by hand.</>}
        </div>
        {analyzeError && <div style={{ fontSize: '11px', color: 'var(--red)' }}>{analyzeError}</div>}
        {isPhoto && layer.alignment && (
          <div style={{ fontSize: '11px', color: 'var(--teal-mid)', fontWeight: 700 }}>
            Face-aligned ✓ (detected shot type: {layer.alignment.shot_type.replace(/_/g, ' ')})
          </div>
        )}
      </div>

      <NumField label="X" value={layer.x} onChange={x => onChange({ x })} pushUndo={pushUndo} discardLastUndo={discardLastUndo} />
      <NumField label="Y" value={layer.y} onChange={y => onChange({ y })} pushUndo={pushUndo} discardLastUndo={discardLastUndo} />
      <NumField label="Width" value={layer.width} onChange={width => onChange({ width })} pushUndo={pushUndo} discardLastUndo={discardLastUndo} />
      <NumField label="Height" value={layer.height} onChange={height => onChange({ height })} pushUndo={pushUndo} discardLastUndo={discardLastUndo} />
    </>
  )
}

function TextLayerFields({ layer, activeType, brandFonts, onChange, pushUndo, discardLastUndo }: {
  layer: TextLayer
  activeType: StakeholderKind
  brandFonts: Array<{ id: string; family_name: string; regular_url: string; bold_url: string | null }>
  onChange: (patch: Partial<TextLayer>) => void
  pushUndo: () => void
  discardLastUndo: () => void
}) {
  const fieldOptions: TextLayer['field'][] = activeType === 'speaker' ? ['name', 'title', 'company', 'tier', 'custom'] : ['tier', 'custom']
  return (
    <>
      <label style={{ fontSize: '11px', color: 'var(--ink3)', display: 'block' }}>
        Field
        <Select value={layer.field} onChange={e => onChange({ field: e.target.value as TextLayer['field'] })} style={{ width: '100%', marginTop: '3px' }}>
          {fieldOptions.map(f => <option key={f} value={f}>{f}</option>)}
        </Select>
      </label>
      {(layer.field === 'custom' || layer.field === 'tier') && (
        <label style={{ fontSize: '11px', color: 'var(--ink3)', display: 'block' }}>
          {layer.field === 'tier' ? 'Fallback text' : 'Static text'}
          <Input value={layer.value ?? ''} onChange={e => onChange({ value: e.target.value })} style={{ width: '100%', marginTop: '3px' }} />
        </label>
      )}
      <label style={{ gridColumn: '1 / -1', fontSize: '11px', color: 'var(--ink3)', display: 'block' }}>
        Font Family
        <Select
          value={layer.font_family?.family_name ?? ''}
          onChange={e => {
            const font = brandFonts.find(f => f.family_name === e.target.value)
            onChange({ font_family: font ? { family_name: font.family_name, regular_url: font.regular_url, bold_url: font.bold_url } : undefined })
          }}
          style={{ width: '100%', marginTop: '3px' }}
        >
          <option value="">Default (generic sans-serif)</option>
          {brandFonts.map(f => <option key={f.id} value={f.family_name}>{f.family_name}</option>)}
        </Select>
      </label>
      <NumField label="X" value={layer.x} onChange={x => onChange({ x })} pushUndo={pushUndo} discardLastUndo={discardLastUndo} />
      <NumField label="Y" value={layer.y} onChange={y => onChange({ y })} pushUndo={pushUndo} discardLastUndo={discardLastUndo} />
      <NumField label="Width" value={layer.width} onChange={width => onChange({ width })} pushUndo={pushUndo} discardLastUndo={discardLastUndo} />
      <NumField label="Height" value={layer.height} onChange={height => onChange({ height })} pushUndo={pushUndo} discardLastUndo={discardLastUndo} />
      <NumField label="Max lines" value={layer.max_lines} onChange={max_lines => onChange({ max_lines: Math.max(1, max_lines) })} pushUndo={pushUndo} discardLastUndo={discardLastUndo} />
      <NumField label="Font size (ceiling)" value={layer.font_size} onChange={font_size => onChange({ font_size })} pushUndo={pushUndo} discardLastUndo={discardLastUndo} />
      <label style={{ fontSize: '11px', color: 'var(--ink3)', display: 'block' }}>
        Font color
        <Input type="color" value={layer.font_color} onChange={e => onChange({ font_color: e.target.value })} style={{ width: '100%', marginTop: '3px', height: '34px', padding: '2px' }} />
      </label>
      <label style={{ fontSize: '11px', color: 'var(--ink3)', display: 'block' }}>
        Weight
        <Select value={layer.font_weight ?? 'normal'} onChange={e => onChange({ font_weight: e.target.value as TextLayer['font_weight'] })} style={{ width: '100%', marginTop: '3px' }}>
          <option value="normal">Normal</option>
          <option value="bold">Bold</option>
        </Select>
      </label>
      <label style={{ fontSize: '11px', color: 'var(--ink3)', display: 'block' }}>
        Align
        <Select value={layer.align ?? 'left'} onChange={e => onChange({ align: e.target.value as TextLayer['align'] })} style={{ width: '100%', marginTop: '3px' }}>
          <option value="left">Left</option>
          <option value="center">Center</option>
          <option value="right">Right</option>
        </Select>
      </label>
    </>
  )
}
