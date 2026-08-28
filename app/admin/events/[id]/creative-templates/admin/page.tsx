'use client'

import { useState, useEffect, useRef, use } from 'react'
import PageHeader from '@/app/components/PageHeader'
import { Button, Badge, Input, Select, Textarea, ProcessingOverlay } from '@/app/components/ui'
import AccessTab from '@/app/components/AccessTab'
import type { Layer, ImageLayer, PhotoSlotLayer, TextLayer, Variant, CreativeTemplateConfig, TextLayerDiagnostics, PlaceholderProfile, GlobalPlaceholderDefault, CleaningCycleTemplate } from '@/app/lib/announcements/composite'
import { withTextLayerDefaults } from '@/app/lib/announcements/text-layer-defaults'
import { CLEANING_CYCLE_CANVAS_SIZE } from '@/app/lib/media/cleaning-cycle-constants'
import type { ResolvedFont, BrandRulesSnapshot } from '@/app/lib/branding/brand-rules'
import LayerBoxOverlay from './LayerBoxOverlay'

/* Stakeholder Announcement Engine — Admin Console (PRD v1.4 Phase C v3,
   split into landing + admin console per Madhu's 2026-07-27 restructure
   request). Branding-team-only (admin-tier 'sae' module_access, enforced
   server-side by ./layout.tsx — this page assumes that gate already
   passed). Two tabs: Variants (the layer-stack editor, unchanged from the
   original single-page version) and Access Control (who can use/administer
   this module — the shared AccessTab component, module_access table). */

export type StakeholderKind = 'speaker' | 'partner'
// 2026-08-04 — weights added (full weight support, was regular_url/bold_url
// only). Nullable/optional since fonts added before that date have no
// weights map at all.
export type BrandFontOption = { id: string; family_name: string; regular_url: string; bold_url: string | null; weights?: Record<number, string> | null }
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
const DEFAULT_MAX_LINES_BY_FIELD: Record<TextLayer['field'], number> = { name: 3, title: 2, company: 2, country: 1, tier: 2, custom: 2 }

// Editor-local — maps a text layer's `field` to the content-type slug the
// brand-rules resolver understands (app/lib/branding/brand-rules.ts). This
// is presentation-editor business logic (what a "name" field usually looks
// like on a card), not general brand-rules logic, so it stays here rather
// than in the shared library.
const FIELD_TO_CONTENT_TYPE: Record<TextLayer['field'], string> = {
  name: 'heading', title: 'subheading', company: 'body', country: 'body', tier: 'body', custom: 'body',
}

function newLayer(type: Layer['type'], activeType: StakeholderKind, canvasWidth: number, canvasHeight: number, fontSuggestion?: ResolvedFont | null, category?: Variant['category']): Layer {
  const id = crypto.randomUUID()
  // Image layers are always full-bleed background/overlay art pre-sized by
  // the design team to the variant's exact canvas — default to that instead
  // of an arbitrary box, since there's no manual resize UI for this layer type.
  if (type === 'image') return { id, type: 'image', asset_url: '', x: 0, y: 0, width: canvasWidth, height: canvasHeight }
  if (type === 'photo_slot') {
    // A website_photo variant's Photo/Logo Slot is ALWAYS the full canvas
    // (2026-08-21, per Madhu) — this category has no other layer sharing
    // the frame with it, unlike a Promo variant's photo slot, which is
    // typically a smaller inset within a larger poster (400x400 stays the
    // sensible default there).
    const full = category === 'website_photo'
    return { id, type: 'photo_slot', source: activeType === 'speaker' ? 'speaker_photo' : 'partner_logo', x: 0, y: 0, width: full ? canvasWidth : 400, height: full ? canvasHeight : 400 }
  }
  const field: TextLayer['field'] = activeType === 'speaker' ? 'name' : 'custom'
  const maxLines = DEFAULT_MAX_LINES_BY_FIELD[field]
  const fontSize = 32
  const width = Math.round(canvasWidth * 0.6)
  const height = Math.round(maxLines * fontSize * 1.2)
  // Brand-rules suggestion (app/lib/branding/brand-rules.ts) — a default
  // for a NEW layer only, never touches an existing saved layer's choice.
  // Absent/no-match leaves font_family undefined, byte-identical to today's
  // behavior (generic sans-serif fallback at render time).
  const font_family = fontSuggestion
    ? { family_name: fontSuggestion.family_name, regular_url: fontSuggestion.regular_url, bold_url: fontSuggestion.bold_url, weights: fontSuggestion.weights }
    : undefined
  const font_weight: TextLayer['font_weight'] = fontSuggestion?.weight ?? 'normal'
  return { id, type: 'text', field, value: activeType === 'partner' ? 'LEAD SPONSOR' : undefined, x: 40, y: 40, width, height, max_lines: maxLines, font_size: fontSize, font_color: '#FFFFFF', font_family, font_weight, align: 'left' }
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
  const [consoleTab, setConsoleTab] = useState<'variants' | 'ai_edit_prompts' | 'access'>('variants')

  const [loading, setLoading] = useState(true)
  const [speakerVariants, setSpeakerVariants] = useState<Variant[]>([])
  const [partnerVariants, setPartnerVariants] = useState<Variant[]>([])
  const [activeType, setActiveType] = useState<StakeholderKind>('speaker')
  const [activeVariantId, setActiveVariantId] = useState<string | null>(null)
  const [newVariantPickerOpen, setNewVariantPickerOpen] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  // Lifted out of LayerRow (was private per-row state) so LayerBoxOverlay
  // can highlight the same layer that's expanded in the accordion, and
  // clicking a box on the live preview can open its corresponding row.
  const [expandedLayerId, setExpandedLayerId] = useState<string | null>(null)
  const [textDiagnostics, setTextDiagnostics] = useState<Record<string, TextLayerDiagnostics>>({})
  // Only meaningful for category: 'website_photo' — see preview/route.ts's
  // top comment. null = not a website_photo variant / no issue to report.
  const [websitePhotoError, setWebsitePhotoError] = useState<string | null>(null)

  const [brandFonts, setBrandFonts] = useState<Array<BrandFontOption>>([])
  const [brandRules, setBrandRules] = useState<BrandRulesSnapshot>({ fonts: [] })
  // Reusable "Placeholder data" content (2026-07-31) — one profile per
  // stakeholder type, saved on the event alongside the variants themselves
  // (events.creative_template_config.placeholder), so every variant's
  // preview/ghost shares the same stand-in photo/name/title/company
  // instead of each hardcoding its own "Jane Doe" sample text.
  const [placeholderProfiles, setPlaceholderProfiles] = useState<{ speaker: PlaceholderProfile; partner: PlaceholderProfile }>({ speaker: {}, partner: {} })
  // Global (cross-event) placeholder default (2026-08-29) — independent of
  // eventId, fetched once alongside everything else in fetchAll() below.
  const [globalDefaults, setGlobalDefaults] = useState<{ speaker: GlobalPlaceholderDefault | null; partner: GlobalPlaceholderDefault | null }>({ speaker: null, partner: null })
  const [showPlaceholderPanel, setShowPlaceholderPanel] = useState(false)
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  // Stale-while-revalidate (2026-07-31 UX pass, replacing the old debounced
  // auto-render): any layer/variant edit keeps showing the last render,
  // dimmed + badged, rather than clearing it outright — an old image there
  // is still useful context while a fresh one renders. Switching variant/
  // type DOES clear it outright (see the effect below) since the layout
  // itself just changed underneath it — an old image there would be
  // actively misleading, not just stale.
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

  async function fetchAll() {
    setLoading(true)
    const [configRes, fontsRes, brandRulesRes, globalDefaultsRes] = await Promise.all([
      fetch(`/api/events/templates?event_id=${eventId}`),
      fetch('/api/branding/fonts'),
      fetch('/api/branding/brand-rules'),
      fetch('/api/events/templates/global-placeholder-defaults'),
    ])
    const config: CreativeTemplateConfig | null = await configRes.json().catch(() => null)
    const loadedSpeakerVariants = (config?.speaker?.variants ?? []).map(normalizeVariantTextLayers)
    const loadedPartnerVariants = (config?.partner?.variants ?? []).map(normalizeVariantTextLayers)
    setSpeakerVariants(loadedSpeakerVariants)
    setPartnerVariants(loadedPartnerVariants)
    setPlaceholderProfiles({ speaker: config?.placeholder?.speaker ?? {}, partner: config?.placeholder?.partner ?? {} })
    const loadedGlobalDefaults = await globalDefaultsRes.json().catch(() => ({ speaker: null, partner: null }))
    setGlobalDefaults({ speaker: loadedGlobalDefaults.speaker ?? null, partner: loadedGlobalDefaults.partner ?? null })
    // Auto-select the first variant for the active tab on initial load — the
    // tab-switch effect below only fires when activeType *changes*, so
    // without this, a variant that already existed before this page load
    // never gets selected until the MM manually switches tabs and back.
    const initialList = activeType === 'speaker' ? loadedSpeakerVariants : loadedPartnerVariants
    setActiveVariantId(prev => prev ?? initialList[0]?.id ?? null)
    setBrandFonts(await fontsRes.json().catch(() => []))
    setBrandRules(await brandRulesRes.json().catch(() => ({ fonts: [] })))
    setDirty(false)
    setLoading(false)
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-mount; matches app/admin/events/[id]/stakeholders/page.tsx's fetchAll effect
  useEffect(() => { fetchAll() }, [eventId])

  useEffect(() => {
    const list = activeType === 'speaker' ? speakerVariants : partnerVariants
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resets the selected variant on tab switch; a derived-state reset, not a fetch side effect, but the same standard pattern
    setActiveVariantId(list[0]?.id ?? null)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-select on tab switch, not on every variants edit
  }, [activeType])

  // On-demand preview (2026-07-31, replacing the old 500ms-debounced
  // auto-render-on-every-edit) — Madhu's explicit request: dragging/typing
  // only ever touches local state (already instant, no network involved),
  // the real Sharp render only fires on the "Generate Preview" button
  // below. The box layout just changed underneath whatever was rendered,
  // so an in-memory preview from a DIFFERENT variant would be actively
  // misleading — but THIS variant's own last saved preview
  // (last_preview_url, 2026-08-01) is exactly what belongs here, so restore
  // that instead of clearing to null. Not stale — it was generated against
  // and saved alongside this exact layer state, by definition, since save()
  // now always regenerates before persisting when previewStale (2026-08-21
  // fix — it used to just persist whatever was on screen even if stale,
  // which is what silently broke this guarantee).
  useEffect(() => {
    const list = activeType === 'speaker' ? speakerVariants : partnerVariants
    const v = list.find(x => x.id === activeVariantId)
    // eslint-disable-next-line react-hooks/set-state-in-effect -- restores this variant's own saved preview when switching to it; a derived-state reset, not a fetch side effect
    setPreviewDataUrl(v?.last_preview_url ?? null)
    setPreviewStale(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run on variant/type switch, not on every speakerVariants/partnerVariants edit (would re-restore over in-progress local changes)
  }, [activeVariantId, activeType])

  async function generatePreview() {
    if (!activeVariant) return
    const reqId = ++previewReqIdRef.current
    setPreviewLoading(true)
    // Placeholder data only (2026-08-21, was also selectable against any
    // real speaker/partner for testing) — per Madhu: this editor's own
    // preview isn't the place to spot-check real stakeholder data, and the
    // photo half of "placeholder" already comes from whatever's uploaded as
    // the Photo/Logo Slot's own reference layer, so there was never a case
    // this couldn't already cover.
    const body: Record<string, unknown> = { event_id: eventId, stakeholder_type: activeType, variant: activeVariant }
    const res = await fetch('/api/events/templates/preview', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    const data = await res.json().catch(() => ({}))
    if (reqId !== previewReqIdRef.current) return // a newer click superseded this one — discard
    setPreviewDataUrl(res.ok ? data.preview_data_url : null)
    setPreviewStale(false)
    setTextDiagnostics(res.ok ? (data.text_diagnostics ?? {}) : {})
    setWebsitePhotoError(res.ok && activeVariant.category === 'website_photo' ? (data.website_photo_error ?? null) : null)
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
    // stale rather than clearing outright — "keep showing the last render,
    // dimmed + badged" also brings the ghost overlay back for the active
    // layer so font/color/weight/position edits get instant client-side
    // feedback again without paying for a new server render on every
    // keystroke. save() now always regenerates first when this is true
    // (2026-08-21 fix), so a stale preview never gets silently persisted.
    if (previewDataUrl) setPreviewStale(true)
  }

  // Category picked FIRST, before a variant exists (2026-08-21, per Madhu)
  // — asking "Use: Promo/Self Promo/Website Photo" only after the fact (the
  // old flow) is exactly what let a Website Photo variant get built at the
  // wrong canvas size (1080x1350) by mistake, only caught once a layer
  // inside it was already wrong too. Gating on the choice up front means
  // canvas dimensions are correct from the variant's very first layer.
  function addVariant(category: 'promo' | 'self_promo' | 'website_photo') {
    pushUndo()
    const size = category === 'website_photo' ? CLEANING_CYCLE_CANVAS_SIZE : null
    const variant: Variant = {
      id: crypto.randomUUID(), name: 'Untitled Variant', category,
      canvas_width: size ?? 1080, canvas_height: size ?? 1350, layers: [],
    }
    mutate(vs => [...vs, variant])
    setActiveVariantId(variant.id)
    setNewVariantPickerOpen(false)
  }

  // Persists immediately (2026-08-19) rather than just staging a local
  // edit — a "Delete" button that silently reverts on refresh unless the
  // user separately remembers to click "Save Changes" reads as a bug, not
  // an unsaved draft. mutate()'s normal dirty-staging is right for every
  // other edit here (name/layers/etc — those are genuinely drafts you're
  // still composing), but a destructive action should behave destructively.
  async function deleteVariant(id: string) {
    const variant = variants.find(v => v.id === id)
    if (!variant) return
    if (!confirm(`Delete variant "${variant.name || 'Untitled Variant'}" and its ${variant.layers.length} layer${variant.layers.length === 1 ? '' : 's'}?`)) return
    pushUndo()
    const newVariants = variants.filter(v => v.id !== id)
    setVariants(newVariants)
    if (activeVariantId === id) setActiveVariantId(null)
    setDirty(true)
    setSaving(true)
    const res = await fetch('/api/events/templates/variants', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_id: eventId, stakeholder_type: activeType, variants: newVariants }),
    })
    const data = await res.json().catch(() => ({}))
    if (res.ok) setDirty(false)
    else setMsg(data.error || 'Delete failed to save — click "Save Changes" to retry.')
    setSaving(false)
  }

  function addLayer(type: Layer['type']) {
    if (!activeVariant) return
    pushUndo()
    // Mirrors newLayer()'s own field derivation (it isn't passed in) so the
    // brand-rules lookup matches the field the new layer will actually get.
    const field: TextLayer['field'] = activeType === 'speaker' ? 'name' : 'custom'
    const fontSuggestion = type === 'text' ? brandRules.fonts.find(f => f.content_type === FIELD_TO_CONTENT_TYPE[field]) ?? null : null
    const layer = newLayer(type, activeType, activeVariant.canvas_width, activeVariant.canvas_height, fontSuggestion, activeVariant.category)
    updateActiveVariant({ layers: [...activeVariant.layers, layer] })
    // Auto-expand the new layer and collapse whatever was open (2026-08-02,
    // real confusion caught live) — previously the new row landed collapsed
    // at the bottom while the old one stayed open, so clicking "+ ..." looked
    // like it did nothing for a moment.
    setExpandedLayerId(layer.id)
  }

  function updateLayer(layerId: string, patch: Partial<Layer>) {
    if (!activeVariant) return
    updateActiveVariant({
      layers: activeVariant.layers.map(l => {
        if (l.id !== layerId) return l
        if (l.type !== 'photo_slot' || !l.alignment || 'alignment' in patch) {
          // No adjustment needed: not a photo_slot, has no alignment yet, or
          // this patch already carries its own `alignment` (a fresh
          // reference upload or a head-marker drag) — don't clobber
          // reference dims/ratios that call site just deliberately set.
          return { ...l, ...patch } as Layer
        }
        const pl = l as PhotoSlotLayer
        const alignment = pl.alignment!
        const hasSize = 'width' in patch || 'height' in patch
        const hasOrigin = 'x' in patch || 'y' in patch
        // A drag that changes BOTH origin (x/y) AND size (width/height) in
        // the same gesture is a resize-from-a-west/north handle — the box's
        // OWN top-left corner moving is what makes the west/north edge
        // "extend." A drag that changes ONLY origin (no size) is a plain
        // move, where the content SHOULD travel with the box — no
        // compensation there, that's correct as-is.
        const isEdgeResize = hasSize && hasOrigin
        const refW = alignment.reference_box_width ?? pl.width
        const refH = alignment.reference_box_height ?? pl.height
        // Real bug found live (2026-08-16, Madhu): dragging the box's west
        // edge to add room on the left also dragged the speaker photo left
        // with it. Cause: target_head_center_x/y are ratios of the FROZEN
        // reference box, applied on top of the box's OWN origin (layer.x/y)
        // at composite time — moving x without compensating shifts the
        // photo's absolute canvas position by exactly as much as the origin
        // moved. Compensating here (only for a genuine edge-resize, not a
        // move) keeps the head/photo pinned at its existing absolute
        // position while the box's edge — and the extra room it reveals —
        // moves independently, matching south/east resize (which never
        // touches x/y, so never needed this).
        const dx = isEdgeResize ? (patch.x as number ?? pl.x) - pl.x : 0
        const dy = isEdgeResize ? (patch.y as number ?? pl.y) - pl.y : 0
        const needsFreeze = !alignment.reference_box_width || !alignment.reference_box_height
        if (!isEdgeResize && !(hasSize && needsFreeze)) return { ...l, ...patch } as Layer
        return {
          ...l, ...patch,
          alignment: {
            ...alignment,
            target_head_center_x: alignment.target_head_center_x - dx / refW,
            target_head_center_y: alignment.target_head_center_y - dy / refH,
            reference_box_width: refW,
            reference_box_height: refH,
          },
        } as Layer
      }),
    })
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

  async function savePlaceholder(profile: PlaceholderProfile) {
    const res = await fetch('/api/events/templates/placeholder', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_id: eventId, stakeholder_type: activeType, placeholder: profile }),
    })
    const data = await res.json().catch(() => ({}))
    if (res.ok) {
      setPlaceholderProfiles(p => ({ ...p, [activeType]: profile }))
      setMsg('Placeholder saved.')
    } else {
      setMsg(data.error || 'Placeholder save failed.')
    }
  }

  async function saveGlobalDefaultText(profile: PlaceholderProfile) {
    const res = await fetch('/api/events/templates/global-placeholder-defaults', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stakeholder_type: activeType, ...profile }),
    })
    const data = await res.json().catch(() => ({}))
    if (res.ok) {
      setGlobalDefaults(g => ({ ...g, [activeType]: data }))
      setMsg('Global default saved.')
    } else {
      setMsg(data.error || 'Global default save failed.')
    }
  }

  async function uploadGlobalDefaultPhoto(file: File) {
    const form = new FormData()
    form.append('file', file)
    form.append('stakeholder_type', activeType)
    const res = await fetch('/api/events/templates/global-placeholder-defaults/photo', { method: 'POST', body: form })
    const data = await res.json().catch(() => ({}))
    if (res.ok) {
      setGlobalDefaults(g => ({ ...g, [activeType]: data }))
      setMsg('Global placeholder photo saved.')
    } else {
      setMsg(data.error || 'Photo upload failed.')
    }
  }

  async function save() {
    setSaving(true)

    // Real bug found live (2026-08-21) — a stale preview (dimmed, badged
    // "Stale — click Generate Preview" on screen) could still get persisted
    // as-is here, since this function only ever looked at whatever
    // previewDataUrl currently held, never at previewStale. Reload later —
    // this file's own restore-on-mount effect above trusts last_preview_url
    // as "generated against and saved alongside this exact layer state, by
    // definition" — and that promise was false: the persisted image
    // silently didn't match the config it was saved next to (e.g. Upload
    // Reference Layer, then Save Changes without re-clicking Generate
    // Preview first). Regenerating here when stale, rather than requiring
    // the producer to remember an extra manual step, is what actually keeps
    // that invariant true instead of just documenting it.
    // Local, not just the React state read below — setPreviewDataUrl here
    // wouldn't be visible until next render, and the upload step right
    // after this needs the FRESH value in the same synchronous call.
    let freshPreviewDataUrl = previewDataUrl
    if (activeVariant && previewStale) {
      const body: Record<string, unknown> = { event_id: eventId, stakeholder_type: activeType, variant: activeVariant }
      const res = await fetch('/api/events/templates/preview', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        freshPreviewDataUrl = data.preview_data_url
        setPreviewDataUrl(data.preview_data_url)
        setPreviewStale(false)
        setTextDiagnostics(data.text_diagnostics ?? {})
      }
    }

    // Persist whatever preview is currently on screen (2026-08-01) so
    // revisiting this variant later shows it immediately instead of "No
    // preview yet" — previewDataUrl otherwise only ever lived in client
    // React state, gone on refresh. A fresh, not-yet-persisted render is a
    // `data:` URL and needs uploading first; a previously-persisted one
    // (loaded from last_preview_url on mount, or from an earlier save this
    // session) is already a real URL and just carries straight through.
    let previewUrlToSave = activeVariant?.last_preview_url
    if (activeVariantId && freshPreviewDataUrl) {
      if (freshPreviewDataUrl.startsWith('data:')) {
        const blob = await (await fetch(freshPreviewDataUrl)).blob()
        const form = new FormData()
        form.append('file', blob, 'preview.png')
        form.append('event_id', eventId)
        form.append('variant_id', activeVariantId)
        const uploadRes = await fetch('/api/events/templates/save-preview', { method: 'POST', body: form })
        const uploadData = await uploadRes.json().catch(() => ({}))
        if (uploadRes.ok && uploadData.url) {
          previewUrlToSave = uploadData.url
          setPreviewDataUrl(uploadData.url) // swap local state to the persisted URL too, not left pointing at a throwaway data: URL
        }
      } else {
        previewUrlToSave = freshPreviewDataUrl
      }
    }
    const variantsToSave = activeVariantId
      ? variants.map(v => v.id === activeVariantId ? { ...v, last_preview_url: previewUrlToSave } : v)
      : variants

    const res = await fetch('/api/events/templates/variants', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_id: eventId, stakeholder_type: activeType, variants: variantsToSave }),
    })
    const data = await res.json().catch(() => ({}))
    // No success toast (2026-08-02, per Madhu) — the Save button itself
    // already flips to a disabled "Saved" state once `dirty` clears below,
    // which is the whole signal a save succeeded; a separate banner just
    // duplicated that and ate vertical space. Failures still need surfacing
    // here since nothing else shows them.
    if (res.ok) { setVariants(variantsToSave); setDirty(false) } else { setMsg(data.error || 'Save failed.') }
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
          </div>
        ) : undefined}
      />

      <div style={{ padding: '24px 32px' }}>
        <div style={{ display: 'flex', borderRadius: '8px', border: '1px solid var(--border)', overflow: 'hidden', width: 'fit-content', marginBottom: '20px' }}>
          {([['variants', 'Variants'], ['ai_edit_prompts', 'AI Edit Prompts'], ['access', 'Access Control']] as const).map(([key, label]) => (
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
        ) : consoleTab === 'ai_edit_prompts' ? (
          <CleaningCycleTemplatePanel eventId={eventId} />
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
                  <Button variant="ghost" onClick={() => setNewVariantPickerOpen(true)}>+ New Variant</Button>
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
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto auto', gap: '10px', alignItems: 'center', marginBottom: '14px' }}>
                        <Input value={activeVariant.name} onChange={e => updateActiveVariant({ name: e.target.value })} placeholder="Variant name" />
                        <label style={{ fontSize: '11px', color: 'var(--ink3)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          Use
                          <Select
                            value={activeVariant.category ?? 'promo'}
                            onChange={e => {
                              const category = e.target.value as 'promo' | 'self_promo' | 'website_photo'
                              // Website Photo variants must stay square at
                              // the Cleaning Cycle's own standardized canvas
                              // size (2026-08-21, per Madhu) — selecting the
                              // category sets it immediately, so any layer
                              // added afterward (addLayer() sizes new layers
                              // from the variant's current canvas) inherits it
                              // for free rather than needing a manual W/H fix.
                              updateActiveVariant(category === 'website_photo' ? { category, canvas_width: CLEANING_CYCLE_CANVAS_SIZE, canvas_height: CLEANING_CYCLE_CANVAS_SIZE } : { category })
                            }}
                            style={{ width: '150px' }}
                          >
                            <option value="promo">Promo</option>
                            <option value="self_promo">Self Promo</option>
                            <option value="website_photo">Website Photo</option>
                          </Select>
                        </label>
                        <label style={{ fontSize: '11px', color: 'var(--ink3)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          {/* 90px, was 70px (2026-08-21) — a 4-digit value
                              (e.g. 1024) plus the browser's built-in number
                              spinner arrows clipped the last digit at 70px. */}
                          W <Input type="number" value={activeVariant.canvas_width} onChange={e => updateActiveVariant({ canvas_width: Number(e.target.value) })} style={{ width: '90px' }} />
                        </label>
                        <label style={{ fontSize: '11px', color: 'var(--ink3)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          H <Input type="number" value={activeVariant.canvas_height} onChange={e => updateActiveVariant({ canvas_height: Number(e.target.value) })} style={{ width: '90px' }} />
                        </label>
                      </div>
                      {activeVariant.category === 'website_photo' && (
                        <div style={{ marginBottom: '14px' }}>
                          <div style={{ fontSize: '11px', color: 'var(--ink3)', marginBottom: '10px' }}>
                            This variant should have exactly two layers: an <strong>Image</strong> layer for the background, and a <strong>Photo/Logo Slot</strong> (source: speaker photo) sized to the full canvas — set the slot up exactly like a Promo variant&apos;s: click <strong>Upload Reference Layer (auto-position)</strong> and adjust the head position. That known position, the crop, and the background composite always happen exactly the same way, every time.
                          </div>
                        </div>
                      )}

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
                            brandFonts={brandFonts}
                            expanded={expandedLayerId === layer.id}
                            onToggleExpand={() => setExpandedLayerId(id => id === layer.id ? null : layer.id)}
                            diagnostics={layer.type === 'text' ? textDiagnostics[layer.id] : undefined}
                            onChange={patch => updateLayer(layer.id, patch)}
                            onDelete={() => deleteLayer(layer.id)}
                            onMove={delta => moveLayer(layer.id, delta)}
                            pushUndo={pushUndo}
                            discardLastUndo={discardLastUndo}
                            eventId={eventId}
                            allLayers={activeVariant.layers}
                            canvasWidth={activeVariant.canvas_width}
                            canvasHeight={activeVariant.canvas_height}
                          />
                        ))}
                        {activeVariant.layers.length === 0 && (
                          <div style={{ color: 'var(--ink3)', fontSize: '12.5px', padding: '10px 0' }}>No layers yet.</div>
                        )}
                      </div>

                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        <Button variant="ghost" title="Static art, identical on every announcement — backgrounds, decorative overlays, branding blocks. Not this speaker/partner's own photo or logo." onClick={() => addLayer('image')}>+ Image Layer</Button>
                        <Button variant="ghost" title="A slot that fills in with each real speaker/partner's own photo or logo at generation time. Not static art." onClick={() => addLayer('photo_slot')}>+ Photo/Logo Slot</Button>
                        <Button variant="ghost" title="A field of text (name, title, company, a static caption, etc.) rendered live at generation time." onClick={() => addLayer('text')}>+ Text Layer</Button>
                        <Button variant="red" onClick={() => deleteVariant(activeVariant.id)}>Delete Variant</Button>
                      </div>
                      {/* Inline, not just hover tooltips (2026-08-01) — the
                          branding team will be clicking these repeatedly
                          across several variants with none of this session's
                          context; Madhu himself mixed these two up once
                          earlier this session (a real speaker photo uploaded
                          into a plain Image layer), so the distinction is
                          spelled out up front, not just on hover. */}
                      <div style={{ fontSize: '10.5px', color: 'var(--ink4)', marginTop: '6px', lineHeight: 1.4 }}>
                        <strong>Image Layer</strong> = fixed art, same on every announcement (backgrounds, decorative overlays, branding). <strong>Photo/Logo Slot</strong> = swaps in each speaker/partner&apos;s own photo or logo.
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
                      <Button variant="ghost" onClick={() => setShowPlaceholderPanel(s => !s)}>
                        {showPlaceholderPanel ? 'Close' : 'Edit Placeholder'}
                      </Button>
                      <Button variant="teal" onClick={generatePreview} disabled={!activeVariant || previewLoading}>
                        {previewLoading ? 'Generating…' : 'Generate Preview'}
                      </Button>
                      {/* Moved here from the page header (2026-08-01, per
                          Madhu) — was far from the preview it actually
                          controls; saving is also what persists the current
                          preview render (last_preview_url), so it belongs
                          next to the button that generates it. */}
                      <Button variant="lime" onClick={save} disabled={saving || !dirty}>{saving ? 'Saving…' : dirty ? 'Save Changes' : 'Saved'}</Button>
                    </div>
                  </div>
                  {showPlaceholderPanel && (
                    <>
                      <PlaceholderPanel
                        key={activeType}
                        activeType={activeType}
                        profile={placeholderProfiles[activeType]}
                        onSave={savePlaceholder}
                      />
                      <GlobalPlaceholderDefaultsPanel
                        key={`global-${activeType}`}
                        activeType={activeType}
                        value={globalDefaults[activeType]}
                        onSaveText={saveGlobalDefaultText}
                        onUploadPhoto={uploadGlobalDefaultPhoto}
                      />
                    </>
                  )}
                  {/* maxWidth: 80% (2026-08-02, per Madhu) — on smaller
                      screens the full-width preview (tall, ~4:5 for a real
                      1080x1350 canvas) didn't fit in one look, forcing a
                      scroll just to see the whole creative. */}
                  <div style={{ position: 'relative', borderRadius: '10px', overflow: 'hidden', background: 'var(--surface)', border: '1px solid var(--border-light)', aspectRatio: activeVariant ? `${activeVariant.canvas_width} / ${activeVariant.canvas_height}` : '4 / 5', display: 'flex', alignItems: 'center', justifyContent: 'center', maxWidth: '80%' }}>
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
                        // Always null (2026-08-21, was selectable against any
                        // real speaker/partner) — with no real record, the
                        // ghost overlay's own resolveGhostImageUrl() falls
                        // back to the global default photo, then the Photo/
                        // Logo Slot's own reference_url (see LayerBoxOverlay.tsx).
                        previewForRecord={null}
                        placeholderProfile={placeholderProfiles[activeType]}
                        globalDefault={globalDefaults[activeType]}
                        showGhost={!previewDataUrl || previewStale}
                        hasUnderlyingPreview={!!previewDataUrl}
                      />
                    )}
                  </div>
                  {activeVariant?.category === 'website_photo' && websitePhotoError && (
                    <div style={{ marginTop: '8px', fontSize: '11.5px', fontWeight: 700, color: 'var(--amber)' }}>
                      {websitePhotoError}
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
      {newVariantPickerOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'color-mix(in srgb, black 60%, transparent)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }} onClick={() => setNewVariantPickerOpen(false)}>
          <div onClick={e => e.stopPropagation()} style={{ width: '360px', maxWidth: '100%', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px', padding: '22px' }}>
            <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--ink)', marginBottom: '4px' }}>New Variant — Use</div>
            <div style={{ fontSize: '11.5px', color: 'var(--ink3)', marginBottom: '16px' }}>
              Picked up front so the canvas size is correct from the start — a Website Photo variant always starts at {CLEANING_CYCLE_CANVAS_SIZE}x{CLEANING_CYCLE_CANVAS_SIZE}, Promo/Self Promo at 1080x1350.
            </div>
            <div style={{ display: 'grid', gap: '8px' }}>
              {([
                ['promo', 'Promo', 'Org’s own channel-publish flow'],
                ['self_promo', 'Self Promo', 'Emailed to the speaker for them to post'],
                ['website_photo', 'Website Photo', `Square speaker card photo, ${CLEANING_CYCLE_CANVAS_SIZE}x${CLEANING_CYCLE_CANVAS_SIZE}`],
              ] as const).map(([value, label, hint]) => (
                <button key={value} onClick={() => addVariant(value)} style={{
                  display: 'block', width: '100%', padding: '11px 14px', borderRadius: '10px',
                  border: '1.5px solid var(--border)', background: 'var(--surface)', cursor: 'pointer',
                  fontFamily: 'inherit', textAlign: 'left',
                }}>
                  <div style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--ink)' }}>{label}</div>
                  <div style={{ fontSize: '11px', color: 'var(--ink3)', marginTop: '2px' }}>{hint}</div>
                </button>
              ))}
            </div>
            <div style={{ marginTop: '14px' }}>
              <Button variant="ghost" onClick={() => setNewVariantPickerOpen(false)}>Cancel</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function LayerRow({ layer, index, total, activeType, brandFonts, expanded, onToggleExpand, diagnostics, onChange, onDelete, onMove, pushUndo, discardLastUndo, eventId, allLayers, canvasWidth, canvasHeight }: {
  layer: Layer
  index: number
  total: number
  activeType: StakeholderKind
  brandFonts: Array<BrandFontOption>
  expanded: boolean
  onToggleExpand: () => void
  diagnostics?: TextLayerDiagnostics
  onChange: (patch: Partial<Layer>) => void
  onDelete: () => void
  onMove: (delta: 1 | -1) => void
  pushUndo: () => void
  discardLastUndo: () => void
  eventId: string
  allLayers: Layer[]
  canvasWidth: number
  canvasHeight: number
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
          {layer.type === 'image' && <ImageLayerFields layer={layer} onChange={onChange as (patch: Partial<ImageLayer>) => void} pushUndo={pushUndo} discardLastUndo={discardLastUndo} eventId={eventId} />}
          {layer.type === 'photo_slot' && <PhotoSlotLayerFields layer={layer} activeType={activeType} onChange={onChange} pushUndo={pushUndo} discardLastUndo={discardLastUndo} eventId={eventId} canvasWidth={canvasWidth} canvasHeight={canvasHeight} />}
          {layer.type === 'text' && <TextLayerFields layer={layer} activeType={activeType} brandFonts={brandFonts} onChange={onChange} pushUndo={pushUndo} discardLastUndo={discardLastUndo} eventId={eventId} allLayers={allLayers} />}
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

// Reusable "Placeholder data" editor (2026-07-31) — one profile PER EVENT,
// per stakeholder type, shared by every variant's preview/ghost in THIS
// event instead of each hardcoding "Jane Doe" independently. Keyed by
// activeType at the call site so switching tabs remounts this with a fresh
// draft rather than leaking the other type's in-progress edits. Overrides
// the new cross-event global default below when set; leave any field blank
// to fall back to the global default instead.
//
// Still no photo/logo field here (2026-08-29, reaffirming the 2026-07-31
// decision at the PER-EVENT level specifically) — the per-event override
// is deliberately text-only; the placeholder photo is now a single global
// asset (see GlobalPlaceholderDefaultsPanel below), not something each
// event manages separately.
function PlaceholderPanel({ activeType, profile, onSave }: {
  activeType: StakeholderKind; profile: PlaceholderProfile
  onSave: (profile: PlaceholderProfile) => Promise<void>
}) {
  const [draft, setDraft] = useState<PlaceholderProfile>(profile)
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    await onSave(draft)
    setSaving(false)
  }

  const fieldStyle: React.CSSProperties = { fontSize: '11px', color: 'var(--ink3)', display: 'block' }

  return (
    <div style={{ marginBottom: '10px', padding: '12px', borderRadius: '10px', border: '1px solid var(--border-light)', background: 'var(--surface)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
      {activeType === 'speaker' ? (
        <>
          <label style={fieldStyle}>Name<Input value={draft.name ?? ''} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} style={{ width: '100%', marginTop: '3px' }} /></label>
          <label style={fieldStyle}>Job Title<Input value={draft.job_title ?? ''} onChange={e => setDraft(d => ({ ...d, job_title: e.target.value }))} style={{ width: '100%', marginTop: '3px' }} /></label>
          <label style={fieldStyle}>Company<Input value={draft.company_name ?? ''} onChange={e => setDraft(d => ({ ...d, company_name: e.target.value }))} style={{ width: '100%', marginTop: '3px' }} /></label>
          <label style={fieldStyle}>Country<Input value={draft.country ?? ''} onChange={e => setDraft(d => ({ ...d, country: e.target.value }))} style={{ width: '100%', marginTop: '3px' }} /></label>
        </>
      ) : (
        <>
          <label style={{ ...fieldStyle, gridColumn: '1 / -1' }}>Company Name<Input value={draft.company_name ?? ''} onChange={e => setDraft(d => ({ ...d, company_name: e.target.value }))} style={{ width: '100%', marginTop: '3px' }} /></label>
          <label style={{ ...fieldStyle, gridColumn: '1 / -1' }}>Country<Input value={draft.country ?? ''} onChange={e => setDraft(d => ({ ...d, country: e.target.value }))} style={{ width: '100%', marginTop: '3px' }} /></label>
        </>
      )}
      <div style={{ gridColumn: '1 / -1', fontSize: '10.5px', color: 'var(--ink4)' }}>
        Blank fields fall back to the global default below, then to sample text. Placeholder photo/logo is managed there too, not here.
      </div>
      <div style={{ gridColumn: '1 / -1' }}>
        <Button variant="teal" onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save Placeholder'}</Button>
      </div>
    </div>
  )
}

// Global (cross-event) placeholder default (2026-08-29, per Madhu) — one
// row per stakeholder type, reused by EVERY event unless that event's own
// PlaceholderPanel above overrides a field. Includes the one genuinely new
// piece: a dedicated placeholder photo, decoupled from any per-template
// "reference layer" (which stays whatever the branding team uploads purely
// for positioning — can be anybody's photo). Expected to be a clean,
// already-transparent image — same shape as the photo-cleaning module's
// own 1024x1024 output.
function GlobalPlaceholderDefaultsPanel({ activeType, value, onSaveText, onUploadPhoto }: {
  activeType: StakeholderKind
  value: GlobalPlaceholderDefault | null
  onSaveText: (profile: PlaceholderProfile) => Promise<void>
  onUploadPhoto: (file: File) => Promise<void>
}) {
  const [draft, setDraft] = useState<PlaceholderProfile>({
    name: value?.name ?? undefined, job_title: value?.job_title ?? undefined, company_name: value?.company_name ?? undefined, country: value?.country ?? undefined,
  })
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function handleSave() {
    setSaving(true)
    await onSaveText(draft)
    setSaving(false)
  }
  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    await onUploadPhoto(file)
    setUploading(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const fieldStyle: React.CSSProperties = { fontSize: '11px', color: 'var(--ink3)', display: 'block' }

  return (
    <div style={{ marginBottom: '10px', padding: '12px', borderRadius: '10px', border: '1.5px solid var(--teal-mid)', background: 'var(--teal-light)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
      <div style={{ gridColumn: '1 / -1', fontSize: '11px', fontWeight: 800, color: 'var(--ink2)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
        Global Default — used across every event
      </div>
      {activeType === 'speaker' ? (
        <>
          <label style={fieldStyle}>Name<Input value={draft.name ?? ''} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} style={{ width: '100%', marginTop: '3px' }} /></label>
          <label style={fieldStyle}>Job Title<Input value={draft.job_title ?? ''} onChange={e => setDraft(d => ({ ...d, job_title: e.target.value }))} style={{ width: '100%', marginTop: '3px' }} /></label>
          <label style={fieldStyle}>Company<Input value={draft.company_name ?? ''} onChange={e => setDraft(d => ({ ...d, company_name: e.target.value }))} style={{ width: '100%', marginTop: '3px' }} /></label>
          <label style={fieldStyle}>Country<Input value={draft.country ?? ''} onChange={e => setDraft(d => ({ ...d, country: e.target.value }))} style={{ width: '100%', marginTop: '3px' }} /></label>
        </>
      ) : (
        <>
          <label style={{ ...fieldStyle, gridColumn: '1 / -1' }}>Company Name<Input value={draft.company_name ?? ''} onChange={e => setDraft(d => ({ ...d, company_name: e.target.value }))} style={{ width: '100%', marginTop: '3px' }} /></label>
          <label style={{ ...fieldStyle, gridColumn: '1 / -1' }}>Country<Input value={draft.country ?? ''} onChange={e => setDraft(d => ({ ...d, country: e.target.value }))} style={{ width: '100%', marginTop: '3px' }} /></label>
        </>
      )}
      <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: '12px' }}>
        {value?.photo_url && (
          <img src={value.photo_url} alt="Global placeholder" style={{ width: '52px', height: '52px', borderRadius: '8px', objectFit: 'cover', border: '1px solid var(--border)' }} />
        )}
        <div>
          <input ref={fileInputRef} type="file" accept="image/png,image/jpeg" style={{ display: 'none' }} onChange={handleFileChange} />
          <Button variant="ghost" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
            {uploading ? 'Uploading…' : value?.photo_url ? 'Replace Placeholder Photo' : 'Upload Placeholder Photo'}
          </Button>
          <div style={{ fontSize: '10px', color: 'var(--ink4)', marginTop: '3px' }}>Clean, transparent-background PNG — same shape as the photo-cleaning module&apos;s output.</div>
        </div>
      </div>
      <div style={{ gridColumn: '1 / -1' }}>
        <Button variant="teal" onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save Global Default'}</Button>
      </div>
    </div>
  )
}

const DEFAULT_CLEANING_TEMPLATE: CleaningCycleTemplate = {
  reference_url: null,
  target_head_center_x: 0.5, target_head_center_y: 0.265, target_head_height: 0.29,
  reference_box_width: CLEANING_CYCLE_CANVAS_SIZE, reference_box_height: CLEANING_CYCLE_CANVAS_SIZE,
  shot_type: 'shoulders',
  prompt: '',
}

// "AI Edit Prompts" — Admin Console's third tab (2026-08-18, rebuilt
// 2026-08-21). Was a named PhotoRoom editWithAI prompt library
// (AI_EDIT_MODULES) for a lighting/style feature that got abandoned before
// any module ever used it — replaced with the one real config this
// pipeline needs: the Cleaning Cycle's own template (composite.ts's
// CleaningCycleTemplate). Branding team uploads a reference photo (any
// speaker photo already correctly composed) and fine-tunes the head marker
// — same "Upload Reference Layer (auto-position)" flow as a Variant's own
// Photo/Logo Slot, deliberately reused rather than reinvented, but this
// config is NOT tied to any one Variant: it defines the single standard
// every speaker's cleaned photo is measured against (see clean-photo/
// generate+finalize routes), independent of which creative later crops
// from that clean result to its own canvas/head position.
function CleaningCycleTemplatePanel({ eventId }: { eventId: string }) {
  const [loading, setLoading] = useState(true)
  const [template, setTemplate] = useState<CleaningCycleTemplate>(DEFAULT_CLEANING_TEMPLATE)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [imgAspect, setImgAspect] = useState<number | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef<{ mode: 'move' | 'resize'; startClientX: number; startClientY: number; startTemplate: CleaningCycleTemplate; rectWidth: number; rectHeight: number } | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/events/templates?event_id=${eventId}`)
      .then(r => r.json())
      .then((config: CreativeTemplateConfig | null) => {
        if (cancelled) return
        if (config?.cleaning_cycle_template) setTemplate(config.cleaning_cycle_template)
        setLoading(false)
      })
      .catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [eventId])

  function update(patch: Partial<CleaningCycleTemplate>) {
    setTemplate(t => ({ ...t, ...patch }))
    setDirty(true)
  }

  async function uploadReference(file: File) {
    setAnalyzing(true)
    setMsg(null)
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('event_id', eventId)
      form.append('detect_face', 'true')
      const res = await fetch('/api/events/templates/derive-alignment', { method: 'POST', body: form })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setMsg(data.error || 'Could not analyze the reference photo.'); return }
      setImgAspect(null)
      update({
        reference_url: data.reference_url,
        target_head_center_x: data.target_head_center_x, target_head_center_y: data.target_head_center_y, target_head_height: data.target_head_height,
        reference_box_width: data.reference_box_width, reference_box_height: data.reference_box_height,
        shot_type: data.shot_type,
      })
    } finally {
      setAnalyzing(false)
    }
  }

  function onImgLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    setImgAspect(e.currentTarget.naturalWidth / e.currentTarget.naturalHeight)
  }

  function startDrag(e: React.PointerEvent, mode: 'move' | 'resize') {
    e.preventDefault()
    e.stopPropagation()
    ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
    const rect = containerRef.current?.getBoundingClientRect()
    dragRef.current = { mode, startClientX: e.clientX, startClientY: e.clientY, startTemplate: template, rectWidth: rect?.width || 1, rectHeight: rect?.height || 1 }
  }

  function onPointerMove(e: React.PointerEvent) {
    const drag = dragRef.current
    if (!drag) return
    const dxRatio = (e.clientX - drag.startClientX) / drag.rectWidth
    const dyRatio = (e.clientY - drag.startClientY) / drag.rectHeight
    if (drag.mode === 'move') {
      update({
        target_head_center_x: Math.max(0, Math.min(1, drag.startTemplate.target_head_center_x + dxRatio)),
        target_head_center_y: Math.max(0, Math.min(1, drag.startTemplate.target_head_center_y + dyRatio)),
      })
    } else {
      update({ target_head_height: Math.max(0.03, drag.startTemplate.target_head_height + dyRatio * 2) })
    }
  }

  function endDrag(e: React.PointerEvent) {
    if (dragRef.current) { try { (e.currentTarget as Element).releasePointerCapture(e.pointerId) } catch { /* already released */ } }
    dragRef.current = null
  }

  async function save() {
    setSaving(true)
    const res = await fetch('/api/events/templates/cleaning-cycle-template', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_id: eventId, template }),
    })
    const data = await res.json().catch(() => ({}))
    if (res.ok) setDirty(false); else setMsg(data.error || 'Save failed.')
    setSaving(false)
  }

  if (loading) return <div style={{ color: 'var(--ink3)', fontSize: '13px' }}>Loading…</div>

  const widthRatio = imgAspect ? template.target_head_height / imgAspect : template.target_head_height

  return (
    <div style={{ maxWidth: '640px' }}>
      <div style={{ fontSize: '12.5px', color: 'var(--ink3)', marginBottom: '16px' }}>
        This is the single standard every speaker&apos;s Cleaned Photo is measured against — set it up once per event. Upload a reference photo (any speaker photo already correctly composed works), then drag/resize the circle to mark exactly where the head should sit. The &quot;Clean Photo&quot; action on each speaker crops to this target, calling AI only when a photo doesn&apos;t have enough real content to fill it.
      </div>

      {msg && (
        <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'var(--red-light)', border: '1px solid var(--red-border)', color: 'var(--red)', fontSize: '12.5px', marginBottom: '16px' }}>
          {msg} <button onClick={() => setMsg(null)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontWeight: 700, marginLeft: '8px' }}>×</button>
        </div>
      )}

      <div style={{ background: 'var(--surface)', borderRadius: '10px', overflow: 'hidden', display: 'flex', justifyContent: 'center', padding: '16px', marginBottom: '14px' }}>
        {template.reference_url ? (
          <div ref={containerRef} onPointerMove={onPointerMove} onPointerUp={endDrag} style={{ position: 'relative', display: 'inline-block', touchAction: 'none' }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- needs real onLoad access to naturalWidth/naturalHeight, not next/image */}
            <img src={template.reference_url} alt="Cleaning Cycle reference" onLoad={onImgLoad} style={{ maxWidth: '100%', maxHeight: '420px', display: 'block' }} />
            {imgAspect && (
              <div onPointerDown={e => startDrag(e, 'move')} style={{
                position: 'absolute',
                left: `${(template.target_head_center_x - widthRatio / 2) * 100}%`,
                top: `${(template.target_head_center_y - template.target_head_height / 2) * 100}%`,
                width: `${widthRatio * 100}%`, height: `${template.target_head_height * 100}%`,
                borderRadius: '50%', border: '1.5px dashed var(--teal-mid)', background: 'color-mix(in srgb, var(--teal-mid) 10%, transparent)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'move',
              }}>
                <span style={{ fontSize: '9px', fontWeight: 800, letterSpacing: '0.4px', textTransform: 'uppercase', color: 'var(--teal-mid)', opacity: 0.9, pointerEvents: 'none' }}>Head</span>
                <div onPointerDown={e => startDrag(e, 'resize')} title="Drag to resize the head marker" style={{
                  position: 'absolute', bottom: -5, left: '50%', marginLeft: -5, width: 10, height: 10, borderRadius: '50%',
                  background: 'var(--teal-mid)', border: '1.5px solid var(--card)', cursor: 'ns-resize',
                }} />
              </div>
            )}
          </div>
        ) : (
          <div style={{ color: 'var(--ink3)', fontSize: '13px', textAlign: 'center', padding: '32px 0' }}>No reference photo yet — upload one below.</div>
        )}
      </div>

      <label style={{ display: 'inline-flex', marginBottom: '18px' }}>
        <span style={{ padding: '7px 14px', borderRadius: '10px', border: '1.5px solid var(--border)', color: 'var(--ink2)', fontSize: '13px', fontWeight: 700, cursor: analyzing ? 'default' : 'pointer' }}>
          {analyzing ? 'Analyzing…' : template.reference_url ? 'Replace Reference Photo (auto-position)' : 'Upload Reference Photo (auto-position)'}
        </span>
        <input type="file" accept="image/png,image/jpeg,image/webp" style={{ display: 'none' }} disabled={analyzing}
          onChange={e => { const f = e.target.files?.[0]; if (f) uploadReference(f); e.target.value = '' }} />
      </label>

      <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--ink2)', display: 'block', marginBottom: '6px' }}>
        Additional AI fill notes (optional — only used when a photo needs it)
      </label>
      <div style={{ fontSize: '11px', color: 'var(--ink4)', marginBottom: '6px' }}>
        The exact target head position/size above is always sent automatically as precise numbers — this field is extra style guidance only (e.g. lighting, mood), not a full prompt replacement.
      </div>
      <Textarea value={template.prompt} onChange={e => update({ prompt: e.target.value })}
        placeholder="Optional — e.g. 'prefer a slightly warmer, more corporate lighting look'. Leave blank if you have no extra notes."
        style={{ width: '100%', minHeight: '100px', marginBottom: '18px' }} />

      <Button variant="teal" onClick={save} disabled={saving || !dirty}>{saving ? 'Saving…' : dirty ? 'Save Changes' : 'Saved'}</Button>
      {/* Blocking overlay while analyzing (2026-08-21, per Madhu) — the
          inline "Analyzing…" button label alone didn't stop a branding-team
          user from clicking elsewhere mid-upload; this is the same shared
          overlay every other perceptibly-slow action in this app already
          uses (see ProcessingOverlay's own doc comment). */}
      <ProcessingOverlay active={analyzing} label="Analyzing reference photo…" estimatedMs={4000} />
    </div>
  )
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

// Image layers default to full-bleed (newLayer() above), but aren't locked
// to it — the box overlay on the live preview (LayerBoxOverlay) can
// drag/resize them like any other layer (2026-07-29 unification); the
// NumFields below are the precise-entry counterpart to that.
//
// "Upload Reference Layer (auto-position)" (2026-08-01, replaces the old
// plain "Upload PNG" button) — mirrors PhotoSlotLayerFields' pattern, but
// simpler: an Image layer's art is static, the same on every announcement
// (background art, decorative overlays, branding blocks), so there's no
// "reference vs. real content" distinction the way there is for a
// photo_slot's per-speaker photo. One upload does double duty — the
// alpha-trimmed PNG becomes the box (x/y/width/height) AND the real
// asset_url — instead of today's two-step "upload art" then "manually type
// X/Y/W/H." Always sends detect_face=false — a background/graphic layer
// never has a face to detect, and running Gemini against it would just
// waste a call and return meaningless data (see derive-alignment/route.ts).
function ImageLayerFields({ layer, onChange, pushUndo, discardLastUndo, eventId }: {
  layer: ImageLayer; onChange: (patch: Partial<ImageLayer>) => void
  pushUndo: () => void; discardLastUndo: () => void; eventId: string
}) {
  const [analyzing, setAnalyzing] = useState(false)
  const [analyzeError, setAnalyzeError] = useState<string | null>(null)

  async function analyzeReferenceLayer(file: File) {
    setAnalyzing(true)
    setAnalyzeError(null)
    const form = new FormData()
    form.append('file', file)
    form.append('event_id', eventId)
    form.append('detect_face', 'false')
    // Never trim — 2026-08-16, per Madhu: every reference layer (background,
    // foreground overlay, design element) is exported at the template's own
    // full canvas size, with the actual art already positioned wherever it
    // should visually sit and everything else transparent. The reference
    // file stays the literal rendered asset forever (see the 'image' branch
    // of composite.ts), so its own internal composition already IS the
    // layout — trimming would only throw that away, same root cause as the
    // speaker-photo box-too-tight bugs (see deriveAlignmentTarget's doc
    // comment).
    form.append('trim_to_content', 'false')
    const res = await fetch('/api/events/templates/derive-alignment', { method: 'POST', body: form })
    const data = await res.json().catch(() => ({}))
    if (res.ok) {
      onChange({ x: data.box.x, y: data.box.y, width: data.box.width, height: data.box.height, asset_url: data.reference_url })
    } else {
      setAnalyzeError(data.error || 'Could not analyze that reference image.')
    }
    setAnalyzing(false)
  }

  return (
    <>
      <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: '10px' }}>
        {layer.asset_url && (
          // eslint-disable-next-line @next/next/no-img-element -- small admin-only thumbnail, not worth next/image's remote-loader setup
          <img src={layer.asset_url} alt="Layer asset" style={{ width: '40px', height: '50px', objectFit: 'cover', borderRadius: '4px', border: '1px solid var(--border-light)' }} />
        )}
        <label style={{ padding: '7px 14px', borderRadius: '8px', border: '1.5px solid var(--border)', background: 'transparent', color: 'var(--ink2)', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>
          {analyzing ? 'Analyzing…' : layer.asset_url ? 'Replace (auto-position)' : 'Upload Reference Layer (auto-position)'}
          <input type="file" accept="image/png" style={{ display: 'none' }} disabled={analyzing}
            onChange={e => { const f = e.target.files?.[0]; if (f) analyzeReferenceLayer(f); e.target.value = '' }} />
        </label>
      </div>
      <ProcessingOverlay active={analyzing} label="Analyzing reference layer…" sublabel="Detecting where the art sits on the canvas." estimatedMs={1500} />
      <div style={{ gridColumn: '1 / -1', fontSize: '10.5px', color: 'var(--ink3)', lineHeight: 1.4 }}>
        Upload a transparent PNG with the art already positioned where it should sit on the canvas — the box below and the rendered asset are both derived automatically from it. Manual fields below still work if you&apos;d rather set them by hand.
      </div>
      {analyzeError && <div style={{ gridColumn: '1 / -1', fontSize: '11px', color: 'var(--red)' }}>{analyzeError}</div>}
      <NumField label="X" value={layer.x} onChange={x => onChange({ x })} pushUndo={pushUndo} discardLastUndo={discardLastUndo} />
      <NumField label="Y" value={layer.y} onChange={y => onChange({ y })} pushUndo={pushUndo} discardLastUndo={discardLastUndo} />
      <NumField label="Width" value={layer.width} onChange={width => onChange({ width })} pushUndo={pushUndo} discardLastUndo={discardLastUndo} />
      <NumField label="Height" value={layer.height} onChange={height => onChange({ height })} pushUndo={pushUndo} discardLastUndo={discardLastUndo} />
    </>
  )
}

// Matches the same lock LayerBoxOverlay.tsx's drag-resize enforces for
// logo boxes (a plain local duplicate, deliberately — see that file's
// LOGO_BOX_ASPECT_RATIO comment for why this doesn't come from a shared
// import: composite.ts pulls in `sharp`, and any runtime value import from
// it breaks the client bundle). Applied here too (2026-08-01, real bug
// caught live) because "Upload Reference Layer" sets the box from the
// uploaded PNG's own raw alpha-trim bounding box — completely bypassing
// the drag-resize lock, since it never goes through a drag at all. Shrinks
// the derived box to 2:1 around its own center, same as the manual snap
// already applied to the real "speaker logo" layer.
const LOGO_BOX_ASPECT_RATIO = 2 // width:height
function snapLogoBox(box: { x: number; y: number; width: number; height: number }) {
  const ratio = box.width / box.height
  let { width, height } = box
  if (ratio > LOGO_BOX_ASPECT_RATIO) width = height * LOGO_BOX_ASPECT_RATIO
  else height = width / LOGO_BOX_ASPECT_RATIO
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2
  return { x: Math.round(cx - width / 2), y: Math.round(cy - height / 2), width: Math.round(width), height: Math.round(height) }
}

// Warn when a photo_slot's head target leaves very little room below it —
// 2026-08-16, per Madhu: box height is capped by the canvas itself (auto-
// extending it further isn't always possible — see this variant's own
// canvas_height), so if the head is set to occupy a large share of
// whatever height IS available, there's a hard ceiling on how much torso/
// arm can ever show for a real speaker's photo, no matter how the box is
// sized. That's a genuine design trade-off (bigger head vs. more visible
// body), not a bug — this surfaces it directly in the editor instead of a
// branding user only discovering it via a clipped real photo later.
// Threshold (15% of the box's own height) is a starting heuristic, not a
// hard rule — tune if it fires too eagerly/rarely in practice.
const LOW_FOOTROOM_THRESHOLD = 0.15
function computeFootroomWarning(layer: PhotoSlotLayer): { footroomPct: number } | null {
  if (!layer.alignment) return null
  const refH = layer.alignment.reference_box_height ?? layer.height
  const headBottomPx = refH * (layer.alignment.target_head_center_y + layer.alignment.target_head_height / 2)
  const footroomPx = layer.height - headBottomPx
  const footroomPct = footroomPx / layer.height
  return footroomPct < LOW_FOOTROOM_THRESHOLD ? { footroomPct } : null
}

function PhotoSlotLayerFields({ layer, activeType, onChange, pushUndo, discardLastUndo, eventId, canvasWidth, canvasHeight }: {
  layer: PhotoSlotLayer; activeType: StakeholderKind; onChange: (patch: Partial<PhotoSlotLayer>) => void
  pushUndo: () => void; discardLastUndo: () => void; eventId: string; canvasWidth: number; canvasHeight: number
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
    form.append('event_id', eventId)
    // Only a real speaker photo needs face detection — see
    // derive-alignment/route.ts's doc comment (2026-08-01, generalized to
    // every layer type). Without this, the route defaults to skipping
    // detection entirely, which would silently break real photo alignment.
    form.append('detect_face', isPhoto ? 'true' : 'false')
    // Speaker photos: never trim — the reference gets replaced by a real
    // photo scaled/positioned to match the SAME head ratio within the same
    // full frame (see deriveAlignmentTarget's doc comment). Logos: still
    // trim — a real logo has no "show more if available" concept, the box
    // just needs to be the small region where the reference logo actually
    // sits, not the whole canvas.
    form.append('trim_to_content', isPhoto ? 'false' : 'true')
    const res = await fetch('/api/events/templates/derive-alignment', { method: 'POST', body: form })
    const data = await res.json().catch(() => ({}))
    if (res.ok) {
      const trimmedBox = isPhoto ? data.box : snapLogoBox(data.box)
      // Auto-extend a speaker-photo box out to the canvas's bottom and
      // right edges — 2026-08-16, per Madhu: don't rely on a branding user
      // remembering to manually drag the box for footroom after uploading
      // a reference. Grows height DOWNWARD and width RIGHTWARD only (x/y —
      // the box's top-left origin — are never touched): the target head
      // position is a fraction of reference_box_width/height times the
      // box's OWN origin offset (layer.x/y, applied later at composite
      // time), so growing from the top-left corner is the one direction
      // that can never shift where the head ends up — growing the other
      // way (or resizing x/y) would need to also shift the origin to
      // compensate, which isn't worth the complexity for an automatic
      // default (a manual drag can still do that if a template genuinely
      // needs it). Logo boxes are untouched (aspect-locked, not
      // head-aligned). Extends ONLY — a trimmed box already reaching (or
      // past) an edge is left alone, never shrunk.
      const box = isPhoto
        ? { ...trimmedBox, width: Math.max(trimmedBox.width, canvasWidth - trimmedBox.x), height: Math.max(trimmedBox.height, canvasHeight - trimmedBox.y) }
        : trimmedBox
      onChange({
        x: box.x, y: box.y, width: box.width, height: box.height,
        // Saved (2026-07-31) so it can stand in for the real photo/logo when
        // previewing with no real stakeholder selected — see
        // PhotoSlotLayer.reference_url's doc comment in composite.ts. Only
        // for a photo does the cached head-box detection mean anything
        // (logos never go through alignAndCropPhoto).
        reference_url: data.reference_url,
        ...(isPhoto ? { reference_head_box: data.reference_head_box } : {}),
        // Face-alignment metadata only means anything for a speaker photo —
        // composite.ts only reads .alignment when source === 'speaker_photo',
        // but skip persisting it for logos so a logo layer's data doesn't
        // carry a meaningless "detected shot type".
        ...(isPhoto ? { alignment: {
          target_head_center_x: data.target_head_center_x, target_head_center_y: data.target_head_center_y, target_head_height: data.target_head_height, shot_type: data.shot_type,
          // Freezes the alignment ratios to THIS reference upload's own box
          // size — see PhotoAlignmentMeta's doc comment (face-alignment.ts)
          // for why this is what lets the box be resized afterward (e.g. to
          // add footroom below the head) without silently rescaling/moving
          // the head target.
          reference_box_width: data.reference_box_width, reference_box_height: data.reference_box_height,
        } } : {}),
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
        <ProcessingOverlay
          active={analyzing}
          label={isPhoto ? 'Analyzing reference photo…' : 'Analyzing reference logo…'}
          sublabel={isPhoto ? 'Detecting position and running face alignment.' : 'Detecting where the logo sits on the canvas.'}
          estimatedMs={isPhoto ? 5500 : 1500}
        />
        <div style={{ fontSize: '10.5px', color: 'var(--ink3)', lineHeight: 1.4 }}>
          {isPhoto
            ? <>Upload a transparent PNG showing a dummy photo already correctly positioned — the box and face-alignment target below are derived automatically. This image can be anybody&apos;s photo, purely for positioning; it only stands in for the real photo in a placeholder preview when no Global Default photo is set above. Manual fields below still work if you&apos;d rather set them by hand.</>
            : layer.source === 'partner_logo'
              ? <>Upload a transparent PNG showing the logo already correctly positioned (e.g. a placeholder logo in its final spot) — the box below is derived automatically from where it sits. This image can be anybody&apos;s logo, purely for positioning; it only stands in for the real logo in a placeholder preview when no Global Default photo is set above. Manual fields below still work if you&apos;d rather set them by hand.</>
              : <>Upload a transparent PNG showing the logo already correctly positioned (e.g. a placeholder logo in its final spot) — the box below is derived automatically from where it sits, and this image also stands in for the real logo when previewing with Placeholder data selected. Manual fields below still work if you&apos;d rather set them by hand.</>}
        </div>
        {analyzeError && <div style={{ fontSize: '11px', color: 'var(--red)' }}>{analyzeError}</div>}
        {isPhoto && layer.alignment && (
          <div style={{ fontSize: '11px', color: 'var(--teal-mid)', fontWeight: 700 }}>
            Face-aligned ✓ (detected shot type: {layer.alignment.shot_type.replace(/_/g, ' ')})
          </div>
        )}
        {isPhoto && layer.alignment && (() => {
          const footroom = computeFootroomWarning(layer)
          if (!footroom) return null
          return (
            <div style={{ fontSize: '10.5px', color: 'var(--amber)', fontWeight: 700, lineHeight: 1.5 }}>
              ⚠ Limited footroom — only ~{Math.round(footroom.footroomPct * 100)}% of the box is left below the head. Real
              speaker photos with more visible torso/arms will likely get cropped tighter here — consider a smaller
              head-size target, or accept the trade-off.
            </div>
          )
        })()}
        {layer.reference_url && (
          <div style={{ fontSize: '11px', color: 'var(--teal-mid)', fontWeight: 700 }}>
            Reference image saved ✓ (also a placeholder-preview fallback when no Global Default photo is set)
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

// Full weight support (2026-08-04, was Normal/Bold only) — per Madhu: "for
// most of our google fonts or custom fonts we also use font weight option
// too instead of just using regular/bold." Every standard CSS weight is
// always LISTED, but only ones the selected font genuinely has a distinct
// file for are selectable — see availableWeightsFor() below.
const WEIGHT_OPTIONS: { value: number; label: string }[] = [
  { value: 100, label: '100 · Thin' },
  { value: 200, label: '200 · Extra Light' },
  { value: 300, label: '300 · Light' },
  { value: 400, label: '400 · Regular' },
  { value: 500, label: '500 · Medium' },
  { value: 600, label: '600 · SemiBold' },
  { value: 700, label: '700 · Bold' },
  { value: 800, label: '800 · Extra Bold' },
  { value: 900, label: '900 · Black' },
]

// Client-safe duplicate of composite.ts's resolveFontWeight() — that
// module imports sharp/@napi-rs/canvas at the top level, native server-
// only deps this 'use client' page must never pull into the browser bundle.
function resolveWeightForUI(w: TextLayer['font_weight']): number {
  if (typeof w === 'number') return w
  if (w === 'bold') return 700
  return 400
}

// No custom font selected -> generic sans-serif fallback, which only ever
// had Normal/Bold to pick from before this feature existed — kept exactly
// that conservative for the no-font case rather than guessing how a
// generic system family handles the other 7 weights.
function availableWeightsFor(font: BrandFontOption | undefined): number[] {
  if (!font) return [400, 700]
  if (font.weights && Object.keys(font.weights).length > 0) return Object.keys(font.weights).map(Number)
  return [400, ...(font.bold_url ? [700] : [])]
}

function TextLayerFields({ layer, activeType, brandFonts, onChange, pushUndo, discardLastUndo, eventId, allLayers }: {
  layer: TextLayer
  activeType: StakeholderKind
  brandFonts: Array<BrandFontOption>
  onChange: (patch: Partial<TextLayer>) => void
  pushUndo: () => void
  discardLastUndo: () => void
  eventId: string
  allLayers: Layer[]
}) {
  const snapCandidates = allLayers.filter((l): l is TextLayer => l.type === 'text' && l.id !== layer.id)
  const fieldOptions: TextLayer['field'][] = activeType === 'speaker' ? ['name', 'title', 'company', 'country', 'tier', 'custom'] : ['tier', 'custom']
  const [analyzing, setAnalyzing] = useState(false)
  const [analyzeError, setAnalyzeError] = useState<string | null>(null)
  const [styleDetected, setStyleDetected] = useState(false)

  // Counterpart to ImageLayerFields/PhotoSlotLayerFields' same button
  // (2026-08-01, styling guess added 2026-08-02) — a text layer always
  // renders its text live at generation time (wrapAndFit/canvas), so unlike
  // those two there's no asset_url/reference_url to persist here; the
  // uploaded reference PNG is analyzed and discarded. Always sends
  // detect_text_style:true (never detect_face — a name/title block has no
  // face to detect) — Madhu asked whether the branding team should also
  // have to manually re-type color/weight/align they can already see in
  // their own Canva mockup; text-style-detection.ts guesses those via
  // Gemini. Font FAMILY is never guessed (no reliable way to match a flat
  // image to one of this event's actual brand fonts) and stays manual
  // below regardless. font_size is derived locally from the box height and
  // the detected line_count, not asked of Gemini directly — it's only ever
  // a ceiling (wrapAndFit auto-shrinks to fit), so an exact pixel guess
  // isn't needed, just a reasonable starting point; 1.2 matches
  // text-layout.ts's own LINE_HEIGHT_RATIO.
  async function analyzeReferenceLayer(file: File) {
    setAnalyzing(true)
    setAnalyzeError(null)
    const form = new FormData()
    form.append('file', file)
    form.append('event_id', eventId)
    form.append('detect_face', 'false')
    // Text layers keep trimming — no asset ever renders here (live text via
    // wrapAndFit instead, the reference is analyzed and discarded), so the
    // box's job is "roughly where does the text sit and how big an area
    // does it need to wrap within" — a full-canvas box would break
    // wrapping/positioning/font-size-from-box-height entirely, unlike a
    // photo/image box which just gets more room. See deriveAlignmentTarget's
    // doc comment.
    form.append('trim_to_content', 'true')
    form.append('detect_text_style', 'true')
    const res = await fetch('/api/events/templates/derive-alignment', { method: 'POST', body: form })
    const data = await res.json().catch(() => ({}))
    if (res.ok) {
      const style = data.text_style as { color: string; weight: 'normal' | 'bold'; align: 'left' | 'center' | 'right'; line_count: number } | null
      onChange({
        x: data.box.x, y: data.box.y, width: data.box.width, height: data.box.height,
        ...(style ? {
          font_color: style.color,
          font_weight: style.weight,
          align: style.align,
          font_size: Math.max(10, Math.round(data.box.height / (style.line_count * 1.2))),
        } : {}),
      })
      setStyleDetected(!!style)
    } else {
      setAnalyzeError(data.error || 'Could not analyze that reference image.')
    }
    setAnalyzing(false)
  }

  return (
    <>
      <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <label style={{ padding: '7px 14px', borderRadius: '8px', border: '1.5px solid var(--border)', color: 'var(--ink2)', fontSize: '12px', fontWeight: 700, cursor: 'pointer', width: 'fit-content' }}>
          {analyzing ? 'Analyzing…' : 'Upload Reference Layer (auto-position)'}
          <input type="file" accept="image/png" style={{ display: 'none' }} disabled={analyzing}
            onChange={e => { const f = e.target.files?.[0]; if (f) analyzeReferenceLayer(f); e.target.value = '' }} />
        </label>
        <ProcessingOverlay active={analyzing} label="Analyzing reference layer…" sublabel="Detecting position and guessing text style." estimatedMs={4000} />
        <div style={{ fontSize: '10.5px', color: 'var(--ink3)', lineHeight: 1.4 }}>
          Upload a transparent PNG showing where THIS ONE field&apos;s text should sit — e.g. a mockup with just the name in place, not the whole name/title/company block at once (upload one reference per text layer, same as you would for a photo or logo slot). The box, color, weight, and alignment below are all derived automatically from it — font family and exact size still need a manual check afterward.
        </div>
        {analyzeError && <div style={{ fontSize: '11px', color: 'var(--red)' }}>{analyzeError}</div>}
        {styleDetected && (
          <div style={{ fontSize: '11px', color: 'var(--teal-mid)', fontWeight: 700 }}>
            Style guessed ✓ (color/weight/align below — double-check them, this is Gemini&apos;s best guess from the image)
          </div>
        )}
      </div>
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
      {/* "Snap below" (2026-08-02) — fixes a real gap Madhu hit: a job-title
          box reserved 2 lines for a long title, but a short 1-line title
          left visible empty space before "company" below it, since company
          sat at a fixed Y unaware of how many lines title actually used.
          Picking a layer here makes THIS layer's rendered Y follow that
          layer's actual bottom edge at generation time instead of its own
          fixed Y — see composite.ts's TextLayer.snap_below_layer_id. Chains
          — if title itself snaps below name, and company snaps below
          title, a short name pulls title up which pulls company up too. */}
      <label style={{ gridColumn: '1 / -1', fontSize: '11px', color: 'var(--ink3)', display: 'block' }}>
        Snap below (closes the gap if that layer wraps to fewer lines)
        <Select
          value={layer.snap_below_layer_id ?? ''}
          onChange={e => {
            const id = e.target.value || undefined
            // Default the gap to 20px the moment a target is first picked
            // (2026-08-02, per Madhu) so there's always a sane starting
            // value rather than an empty/zero gap — still fully editable
            // in the field below.
            onChange({ snap_below_layer_id: id, ...(id && layer.snap_gap === undefined ? { snap_gap: 20 } : {}) })
          }}
          style={{ width: '100%', marginTop: '3px' }}
        >
          <option value="">None — stays at its own fixed Y</option>
          {snapCandidates.map(l => <option key={l.id} value={l.id}>{layerSummary(l)}</option>)}
        </Select>
      </label>
      {layer.snap_below_layer_id && (
        <NumField label="Gap (px)" value={layer.snap_gap ?? 20} onChange={snap_gap => onChange({ snap_gap: Math.max(0, snap_gap) })} pushUndo={pushUndo} discardLastUndo={discardLastUndo} />
      )}
      <label style={{ gridColumn: '1 / -1', fontSize: '11px', color: 'var(--ink3)', display: 'block' }}>
        Font Family
        <Select
          value={layer.font_family?.family_name ?? ''}
          onChange={e => {
            const font = brandFonts.find(f => f.family_name === e.target.value)
            const font_family = font ? { family_name: font.family_name, regular_url: font.regular_url, bold_url: font.bold_url, weights: font.weights ?? null } : undefined
            // Snap the current weight to the nearest one the NEW font
            // actually has — switching fonts can silently leave a weight
            // selected that font has no file for at all otherwise.
            const available = availableWeightsFor(font)
            const currentWeight = resolveWeightForUI(layer.font_weight)
            const nearestAvailable = available.reduce((best, w) => Math.abs(w - currentWeight) < Math.abs(best - currentWeight) ? w : best, available[0])
            onChange({ font_family, font_weight: nearestAvailable })
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
        <Select
          value={String(resolveWeightForUI(layer.font_weight))}
          onChange={e => onChange({ font_weight: Number(e.target.value) })}
          style={{ width: '100%', marginTop: '3px' }}
        >
          {WEIGHT_OPTIONS.map(opt => {
            const available = availableWeightsFor(brandFonts.find(f => f.family_name === layer.font_family?.family_name)).includes(opt.value)
            return (
              <option key={opt.value} value={opt.value} disabled={!available}>
                {opt.label}{available ? '' : ' — not available for this font'}
              </option>
            )
          })}
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
      {/* Uppercase toggle (2026-08-04, per Madhu: "we sometimes go with full
          upper case version for speaker names... if unselected, it goes
          back to whatever format it is typed in coming from the speaker
          database") — purely a display transform (resolveTextValue() in
          composite.ts), never rewrites the underlying speaker/partner data. */}
      <label style={{ gridColumn: '1 / -1', fontSize: '11px', color: 'var(--ink3)', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
        <input type="checkbox" checked={layer.uppercase ?? false} onChange={e => onChange({ uppercase: e.target.checked })} />
        Uppercase (renders as ALL CAPS regardless of how it's typed in the source data)
      </label>
    </>
  )
}
