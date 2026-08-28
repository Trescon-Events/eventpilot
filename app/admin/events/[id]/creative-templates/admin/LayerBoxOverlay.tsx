'use client'

import { useRef, useState } from 'react'
import type { Layer, TextLayer, PhotoSlotLayer, PlaceholderProfile, GlobalPlaceholderDefault } from '@/app/lib/announcements/composite'
import type { HeadBox } from '@/app/lib/media/face-alignment'
import type { StakeholderKind, StakeholderOption } from './page'

/* Drag/resize box editor overlaid on the variant editor's live preview
   image (SAE Phase C v5, 2026-07-29) — Madhu's explicit request to unify
   ALL layer types (image, photo/logo, text) under one visual editor rather
   than text-only, since none of them had any drag/resize interaction
   before this (only plain number-input fields). Hand-rolled rather than
   reusing react-image-crop (already a dependency, used in
   PhotoUploadModal.tsx) — that component is a single-box/single-image
   crop selector, the wrong shape for N simultaneous boxes over one shared
   preview image.

   2026-07-31 UX pass added arrow-key nudging, snap guides, and undo
   commit points (see onCommitUndo) — the editor previously had zero
   precision-editing ergonomics beyond raw number fields.

   Positioning uses plain CSS percentages of the container (left/top/width/
   height as % of canvas_width/canvas_height) rather than tracking the
   container's rendered pixel size — the parent's aspect-ratio is already
   locked to match canvas_width/canvas_height exactly, so percentages alone
   keep every box correctly aligned with zero resize-observer bookkeeping.
   Dragging still needs the container's actual rendered pixel size (to
   convert on-screen pointer-movement pixels into canvas-space deltas) —
   read via getBoundingClientRect() at move time, not cached, so it's
   always correct even if the window resizes mid-drag.

   Uses Pointer Events (not mouse events) to unify mouse/touch/pen — there
   was no drag precedent anywhere in this app to extend, so this starts
   from the more complete API. */

type Props = {
  layers: Layer[]
  canvasWidth: number
  canvasHeight: number
  activeLayerId: string | null
  onSelectLayer: (id: string) => void
  onChangeLayer: (layerId: string, patch: Partial<Layer>) => void
  // Called once per edit "gesture" (a drag, or a burst of arrow-key
  // nudges), right before the FIRST actual change is applied — the caller
  // (page.tsx) pushes a pre-edit undo snapshot. Never called for a
  // click/press that ends up not moving anything.
  onCommitUndo: () => void
  // Ghost-overlay content (2026-07-31): text/photo/logo layers need to be
  // positioned relative to their REAL content, not just a dashed outline —
  // Madhu's own framing: "for such layers, its required for live preview
  // to work... otherwise they wont be able to properly adjust". Rather
  // than a real server render on every move (the exact cost problem the
  // rest of this pass just fixed), the active layer's real text or real
  // photo/logo image renders directly as a client-side approximation —
  // actual font (loaded via @font-face from the same URLs already stored
  // on the layer) and actual image, no server round-trip. Approximate,
  // not pixel-identical to the real Sharp render (natural CSS wrapping
  // instead of wrapAndFit's shrink algorithm, no face-alignment crop) —
  // "Generate Preview" is still the source of truth for the exact result.
  activeType: StakeholderKind
  previewForRecord: StakeholderOption | null
  // The event's saved "Placeholder data" profile (2026-07-31, text-only —
  // see resolveGhostImageUrl's comment for why photo/logo aren't part of
  // this) — used as the ghost text's fallback when no real stakeholder is
  // selected (previewForRecord is null), same as the server preview route
  // falls back to it. Replaces the old hardcoded "Jane Doe" stand-in.
  placeholderProfile: PlaceholderProfile
  // Global (cross-event) default for the active stakeholder type
  // (2026-08-29) — see resolveGhostImageUrl's own comment.
  globalDefault?: GlobalPlaceholderDefault | null
  // Whether to actually draw the ghost content. False once a real,
  // up-to-date preview render is showing underneath — otherwise the ghost
  // text/image stacks directly on top of the real Sharp-rendered text at a
  // slightly different position/size (different wrap + font-matching
  // engines), reading as a visible duplicate layer. True when there's no
  // preview yet, or the last one is stale relative to the current edit.
  showGhost: boolean
  // Whether an existing (now possibly stale) real preview image is showing
  // underneath at all. When true AND the ghost is drawing for this exact
  // layer, the ghost's own box gets a blur/scrim mask first — otherwise the
  // stale render's OWN old text for this same layer is still sitting there
  // (just dimmed, not gone) directly behind the crisp new ghost text,
  // which reads as a doubled/ghosted layer (2026-07-31, caught live: editing
  // a field re-arms the ghost per v6.4, and the dimmed-but-still-legible old
  // text was showing right through it).
  hasUnderlyingPreview: boolean
}

type Box = { x: number; y: number; width: number; height: number }
type HandlePos = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'
type DragMode = 'move' | HandlePos

// Logo boxes resize locked to this ratio (2026-08-01) — a real speaker/
// partner logo always gets standardized onto the Clean Logo Base's fixed
// 600×300 canvas (app/lib/media/logo-engine.ts's BASE_WIDTH/BASE_HEIGHT —
// NOT imported directly: that module pulls in `sharp`, a Node-only native
// dependency, which broke the entire client bundle the first time this was
// tried, since composite.ts — which re-exports PhotoSlotLayer etc. used all
// over this file — also imports `sharp` at its top; any RUNTIME (non-type)
// import from it drags the whole server-only module graph into the
// browser bundle. A plain duplicated number has none of that risk), so a
// template's own logo box should always match that ratio too, or a
// compliant real logo ends up letterboxed/cropped once it's swapped in.
// Photo boxes are unaffected — their sizing is governed by face-alignment,
// not a fixed ratio.
const LOGO_BOX_ASPECT_RATIO = 2 // width:height
function isLogoLayer(layer: Layer): boolean {
  return layer.type === 'photo_slot' && (layer.source === 'speaker_logo' || layer.source === 'partner_logo')
}

// Floor in canvas-space px — a box can never be dragged/resized smaller
// than this during a gesture (free-typing in the NumFields is unclamped;
// this only governs pointer drags, per the plan's gesture-vs-typing split).
const MIN_BOX = 16
// Snap threshold, in canvas-space px (resolution-independent — matches the
// space onPointerMove already computes deltas in).
const SNAP_THRESHOLD = 6
// A burst of rapid arrow-key nudges (holding the key, or fast repeats)
// coalesces into one undo entry — a new burst starts after this much quiet.
const NUDGE_BURST_GAP_MS = 500

const HANDLE_POSITIONS: HandlePos[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']
const HANDLE_CURSOR: Record<HandlePos, string> = { nw: 'nwse-resize', n: 'ns-resize', ne: 'nesw-resize', e: 'ew-resize', se: 'nwse-resize', s: 'ns-resize', sw: 'nesw-resize', w: 'ew-resize' }

// Head-position REFERENCE marker geometry, as a %-of-the-CURRENT-box rect
// suitable for direct use in the marker div's inline style — see the call
// site's comment for why this isn't just `layer.alignment` read directly.
function computeHeadMarkerRect(layer: PhotoSlotLayer): { left: number; top: number; width: number; height: number } | null {
  if (!layer.alignment) return null
  const refW = layer.alignment.reference_box_width ?? layer.width
  const refH = layer.alignment.reference_box_height ?? layer.height
  const diameterPx = layer.alignment.target_head_height * refH
  const centerXPx = layer.alignment.target_head_center_x * refW
  const centerYPx = layer.alignment.target_head_center_y * refH
  return {
    left: ((centerXPx - diameterPx / 2) / layer.width) * 100,
    top: ((centerYPx - diameterPx / 2) / layer.height) * 100,
    width: (diameterPx / layer.width) * 100,
    height: (diameterPx / layer.height) * 100,
  }
}

// Ghost speaker-photo rect, as a %-of-the-CURRENT-box size anchored at its
// top-left — 2026-08-16, per Madhu: dragging a box bigger was making the
// ghost preview image visibly "zoom in/expand," which looked like the same
// head-repositioning bug even though the real math (alignAndCropPhoto) was
// already correct. Cause: the ghost <img> used `objectFit: 'cover'` sized
// to 100%/100% of the LIVE box — cover naturally rescales whenever the
// box's own aspect ratio changes, regardless of any alignment fix. Fixing
// it to look right means sizing the <img> to cover the FROZEN reference
// box (refW × refH) instead of the live one — extending the box then just
// reveals more of the SAME fixed-scale reference image (transparent/empty
// past its own edges, same as the real crop would show past a real photo's
// own content), rather than rescaling it. Logos don't use this — see call
// site (they keep plain contain-fit against the live box, unaffected by
// any of this).
function computeGhostPhotoRect(layer: PhotoSlotLayer): { width: number; height: number } {
  const refW = layer.alignment?.reference_box_width ?? layer.width
  const refH = layer.alignment?.reference_box_height ?? layer.height
  return { width: (refW / layer.width) * 100, height: (refH / layer.height) * 100 }
}

function handleStyle(pos: HandlePos): React.CSSProperties {
  const size = 9
  const half = size / 2
  const style: React.CSSProperties = {
    position: 'absolute', width: size, height: size, background: 'var(--lime)',
    border: '1px solid var(--card)', borderRadius: '2px', cursor: HANDLE_CURSOR[pos], zIndex: 11, pointerEvents: 'auto',
  }
  if (pos.includes('n')) style.top = -half
  if (pos.includes('s')) style.bottom = -half
  if (pos.includes('w')) style.left = -half
  if (pos.includes('e')) style.right = -half
  if (pos === 'n' || pos === 's') { style.left = '50%'; style.marginLeft = -half }
  if (pos === 'e' || pos === 'w') { style.top = '50%'; style.marginTop = -half }
  return style
}

// Snap targets = canvas edges/center (as one implicit pseudo-layer) plus
// every OTHER layer's edges and centers. Returns the snapped value and
// whether a snap actually engaged, for both axes independently — only the
// moving edge/axis snaps, box size is never silently altered by this.
function computeSnap(
  value: number, size: number, axisMax: number, siblingRanges: Array<{ start: number; size: number }>
): { snapped: number; guideAt: number | null } {
  const center = value + size / 2
  const candidates: number[] = [0, axisMax / 2 - size / 2, axisMax - size] // canvas start/center/end (for this box's start coordinate)
  const guideCandidates: number[] = [0, axisMax / 2, axisMax]
  for (const sibling of siblingRanges) {
    candidates.push(sibling.start, sibling.start + sibling.size / 2 - size / 2, sibling.start + sibling.size - size)
    guideCandidates.push(sibling.start, sibling.start + sibling.size / 2, sibling.start + sibling.size)
  }
  let best: { snapped: number; guideAt: number; dist: number } | null = null
  for (let i = 0; i < candidates.length; i++) {
    const dist = Math.abs(value - candidates[i])
    if (dist <= SNAP_THRESHOLD && (!best || dist < best.dist)) {
      best = { snapped: candidates[i], guideAt: guideCandidates[i], dist }
    }
  }
  // Also check the box's CENTER against guide centerlines directly (covers
  // the common case of centering a box that isn't the same size as a sibling).
  for (const g of guideCandidates) {
    const dist = Math.abs(center - g)
    if (dist <= SNAP_THRESHOLD && (!best || dist < best.dist)) {
      best = { snapped: g - size / 2, guideAt: g, dist }
    }
  }
  return best ? { snapped: best.snapped, guideAt: best.guideAt } : { snapped: value, guideAt: null }
}

// Mirrors the server's own placeholder fallback chain (preview/route.ts):
// real stakeholder record, then the event's saved placeholder profile, then
// the same hardcoded last-resort text — so the ghost matches what
// "Generate Preview" would actually show at every tier, not just when a
// real speaker/partner is selected.
// Client-safe duplicate of composite.ts's resolveFontWeight() (2026-08-04)
// — that module imports sharp/@napi-rs/canvas at the top level, native
// server-only deps this 'use client' file must never pull into the browser
// bundle (same risk this file's own LOGO_BOX_ASPECT_RATIO comment already
// flags for a different import). The logic itself is 3 lines, safe to
// duplicate rather than risk that.
function resolveGhostFontWeight(w: TextLayer['font_weight']): number {
  if (typeof w === 'number') return w
  if (w === 'bold') return 700
  return 400
}

function resolveGhostText(layer: TextLayer, activeType: StakeholderKind, record: StakeholderOption | null, placeholder: PlaceholderProfile, globalDefault: GlobalPlaceholderDefault | null | undefined): string {
  const raw = resolveGhostTextRaw(layer, activeType, record, placeholder, globalDefault)
  // Mirrors resolveTextValue()'s uppercase transform (composite.ts) so the
  // editor's ghost preview matches what a real render will actually produce
  // (2026-08-04).
  return layer.uppercase && raw ? raw.toUpperCase() : raw
}

function resolveGhostTextRaw(layer: TextLayer, activeType: StakeholderKind, record: StakeholderOption | null, placeholder: PlaceholderProfile, globalDefault: GlobalPlaceholderDefault | null | undefined): string {
  if (layer.field === 'custom') return layer.value || ''
  if (layer.field === 'tier') return layer.value || 'LEAD SPONSOR'
  if (activeType !== 'speaker') return ''
  if (layer.field === 'name') return record?.label || placeholder.name || globalDefault?.name || 'Jane Doe'
  if (layer.field === 'title') return record?.job_title || placeholder.job_title || globalDefault?.job_title || 'Chief Officer'
  if (layer.field === 'company') return record?.company_name || placeholder.company_name || globalDefault?.company_name || 'Acme Corp'
  if (layer.field === 'country') return placeholder.country || globalDefault?.country || 'United Arab Emirates'
  return ''
}

// Falls back to the layer's OWN reference_url first (2026-07-31 — the
// image uploaded via "Upload Reference Layer (auto-position)"), THEN the
// global placeholder default photo (2026-08-29 — see composite.ts's
// GlobalPlaceholderDefault comment) as a last resort when no reference
// layer has been uploaded yet for this layer at all.
//
// Deliberately the OPPOSITE priority from the real preview route (which
// puts the global default first) — real bug, caught live 2026-08-29: this
// live canvas is what a branding producer is actively looking at WHILE
// dragging/resizing the alignment circle onto a reference image they just
// uploaded, specifically so they can trace the real head position in
// THAT image. Showing the global default photo here instead (a different
// person entirely) makes it impossible to calibrate the box against
// anything real. "Generate Preview" — the actual server composite — is
// the one place the global default photo belongs, cropped/positioned
// using whatever alignment was set here; see preview/route.ts's own
// comment for that (correct, unchanged) priority.
function resolveGhostImageUrl(layer: PhotoSlotLayer, record: StakeholderOption | null, activeType: StakeholderKind, globalDefault: GlobalPlaceholderDefault | null | undefined): string | null {
  const globalPhotoUrl = globalDefault?.photo_url ?? null
  if (layer.source === 'speaker_photo') return record?.photo_url ?? layer.reference_url ?? (activeType === 'speaker' ? globalPhotoUrl : null)
  if (layer.source === 'speaker_logo') return record?.company_logo_url ?? layer.reference_url ?? null
  return record?.logo_url ?? layer.reference_url ?? (activeType === 'partner' ? globalPhotoUrl : null) // partner_logo
}

// One @font-face rule per distinct WEIGHT of each custom brand font in use
// (2026-08-04, was exactly 2 hardcoded rules — regular_url/bold_url only).
// Reuses whatever's already denormalized onto the layer — unlike librsvg
// (see composite.ts's renderTextLayerPng doc comment), browsers reliably
// support @font-face natively, so the ghost preview can show any number of
// real weights, not just Regular/Bold, with no extra work here.
function FontFaceStyles({ layers }: { layers: Layer[] }) {
  const seen = new Set<string>()
  const rules: string[] = []
  for (const layer of layers) {
    if (layer.type !== 'text' || !layer.font_family) continue
    const { family_name, regular_url, bold_url, weights } = layer.font_family
    if (seen.has(family_name)) continue
    seen.add(family_name)
    const safeName = family_name.replace(/"/g, '')
    const urlsByWeight: Record<number, string> = weights ? { ...weights } : {}
    if (!urlsByWeight[400] && regular_url) urlsByWeight[400] = regular_url
    if (!urlsByWeight[700] && bold_url) urlsByWeight[700] = bold_url
    for (const [weight, url] of Object.entries(urlsByWeight)) {
      rules.push(`@font-face{font-family:"${safeName}";font-weight:${weight};src:url("${url}");}`)
    }
  }
  if (rules.length === 0) return null
  return <style>{rules.join('\n')}</style>
}

export default function LayerBoxOverlay({ layers, canvasWidth, canvasHeight, activeLayerId, onSelectLayer, onChangeLayer, onCommitUndo, activeType, previewForRecord, placeholderProfile, globalDefault, showGhost, hasUnderlyingPreview }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef<{ layerId: string; mode: DragMode; startClientX: number; startClientY: number; startBox: Box; committed: boolean; aspectLocked: boolean } | null>(null)
  // Head-marker drag (2026-08-03, Madhu's ask — "shouldn't the circle be
  // aligned to wherever the head is?") — a SEPARATE drag mode from the box's
  // own, since it edits target_head_center_x/y/height (ratios of the BOX's
  // own width/height), not the box's canvas-space x/y/width/height. Uses the
  // box element's own on-screen rect (captured once at drag start, via the
  // `data-box-el` marker on that div) to convert client-pixel deltas into
  // box-relative fractions directly — deliberately NOT reusing toCanvasDelta,
  // which converts into CANVAS-space, the wrong space for a box-relative ratio.
  const markerDragRef = useRef<{
    layerId: string; mode: 'move' | 'resize'
    startClientX: number; startClientY: number
    startCenterX: number; startCenterY: number; startHeight: number
    boxRectWidth: number; boxRectHeight: number
    committed: boolean
  } | null>(null)
  const nudgeBurstRef = useRef<{ layerId: string; lastAt: number } | null>(null)
  const [guides, setGuides] = useState<{ x: number | null; y: number | null }>({ x: null, y: null })

  function startMarkerDrag(e: React.PointerEvent, layer: PhotoSlotLayer, mode: 'move' | 'resize') {
    if (!layer.alignment) return
    e.preventDefault()
    e.stopPropagation()
    onSelectLayer(layer.id)
    containerRef.current?.focus()
    ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
    const boxEl = (e.target as HTMLElement).closest('[data-box-el]') as HTMLElement | null
    const rect = boxEl?.getBoundingClientRect()
    markerDragRef.current = {
      layerId: layer.id, mode,
      startClientX: e.clientX, startClientY: e.clientY,
      startCenterX: layer.alignment.target_head_center_x,
      startCenterY: layer.alignment.target_head_center_y,
      startHeight: layer.alignment.target_head_height,
      // Fallback to the canvas-space box size if the rect lookup somehow
      // fails — wrong on-screen scale, but never a divide-by-zero.
      boxRectWidth: rect?.width || layer.width,
      boxRectHeight: rect?.height || layer.height,
      committed: false,
    }
  }

  function toCanvasDelta(clientDx: number, clientDy: number): { dx: number; dy: number } {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0 || rect.height === 0) return { dx: 0, dy: 0 }
    return { dx: (clientDx / rect.width) * canvasWidth, dy: (clientDy / rect.height) * canvasHeight }
  }

  function startDrag(e: React.PointerEvent, layer: Layer, mode: DragMode) {
    e.preventDefault()
    e.stopPropagation()
    onSelectLayer(layer.id)
    containerRef.current?.focus()
    ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
    dragRef.current = { layerId: layer.id, mode, startClientX: e.clientX, startClientY: e.clientY, startBox: { x: layer.x, y: layer.y, width: layer.width, height: layer.height }, committed: false, aspectLocked: mode !== 'move' && isLogoLayer(layer) }
  }

  function onPointerMove(e: React.PointerEvent) {
    const markerDrag = markerDragRef.current
    if (markerDrag) {
      const dxRatio = (e.clientX - markerDrag.startClientX) / markerDrag.boxRectWidth
      const dyRatio = (e.clientY - markerDrag.startClientY) / markerDrag.boxRectHeight
      const layer = layers.find(l => l.id === markerDrag.layerId) as PhotoSlotLayer | undefined
      if (!layer?.alignment) return

      let target_head_center_x = markerDrag.startCenterX
      let target_head_center_y = markerDrag.startCenterY
      let target_head_height = markerDrag.startHeight
      if (markerDrag.mode === 'move') {
        target_head_center_x = Math.max(0, Math.min(1, markerDrag.startCenterX + dxRatio))
        target_head_center_y = Math.max(0, Math.min(1, markerDrag.startCenterY + dyRatio))
      } else {
        // Resize handle sits at the circle's bottom edge (center_y + height/2)
        // — dragging it down/up by dy moves that edge, so the diameter
        // (target_head_height) changes by 2×dy. Min floor keeps the marker
        // from collapsing to an unusable sliver; no upper cap (a shot-type
        // mismatch, e.g. a waist-level target, can legitimately exceed 1).
        target_head_height = Math.max(0.03, markerDrag.startHeight + dyRatio * 2)
      }

      if (!markerDrag.committed) { onCommitUndo(); markerDrag.committed = true }
      // Re-anchors the reference dimensions to the box AS IT CURRENTLY IS —
      // dragging the marker directly is the admin deliberately re-specifying
      // "the head goes exactly here" relative to what they're looking at
      // right now, same convention deriveAlignmentTarget() uses on a fresh
      // reference upload. See PhotoAlignmentMeta's doc comment.
      const alignment = { ...layer.alignment, target_head_center_x, target_head_center_y, target_head_height, reference_box_width: layer.width, reference_box_height: layer.height }
      // reference_head_box mirrors alignment EXACTLY (same convention
      // c6ea243 established) — this is what makes the reference photo
      // preview a no-op crop against its own now-corrected target, instead
      // of drifting out of sync with whatever this drag just set.
      const reference_head_box: HeadBox = { centerXRatio: target_head_center_x, centerYRatio: target_head_center_y, heightRatio: target_head_height }
      onChangeLayer(markerDrag.layerId, { alignment, reference_head_box } as Partial<Layer>)
      return
    }

    const drag = dragRef.current
    if (!drag) return
    const { dx, dy } = toCanvasDelta(e.clientX - drag.startClientX, e.clientY - drag.startClientY)
    const { mode, startBox } = drag
    let { x, y, width, height } = startBox

    if (mode === 'move') {
      x = startBox.x + dx
      y = startBox.y + dy
    } else {
      if (mode.includes('e')) width = Math.max(MIN_BOX, startBox.width + dx)
      if (mode.includes('s')) height = Math.max(MIN_BOX, startBox.height + dy)
      if (mode.includes('w')) {
        width = Math.max(MIN_BOX, startBox.width - dx)
        x = startBox.x + (startBox.width - width)
      }
      if (mode.includes('n')) {
        height = Math.max(MIN_BOX, startBox.height - dy)
        y = startBox.y + (startBox.height - height)
      }

      // Logo boxes: re-derive whichever dimension the handle didn't directly
      // drive so width:height always stays exactly LOGO_BOX_ASPECT_RATIO —
      // width leads for corner handles (both axes present), otherwise
      // whichever axis IS present leads and the box re-centers along the
      // other axis (there's no drag intent to anchor an edge on there).
      if (drag.aspectLocked) {
        const hasH = mode.includes('e') || mode.includes('w')
        const hasV = mode.includes('n') || mode.includes('s')
        if (hasH) {
          height = Math.max(MIN_BOX, width / LOGO_BOX_ASPECT_RATIO)
          y = hasV ? (mode.includes('n') ? startBox.y + startBox.height - height : startBox.y) : startBox.y + (startBox.height - height) / 2
        } else if (hasV) {
          width = Math.max(MIN_BOX, height * LOGO_BOX_ASPECT_RATIO)
          x = startBox.x + (startBox.width - width) / 2
        }
      }
    }

    // Snap (move gestures only — resizing snaps would silently change the
    // box's own size, which isn't what a snap guide should do) against
    // canvas edges/center and every OTHER layer's edges/centers.
    let guideX: number | null = null
    let guideY: number | null = null
    if (mode === 'move') {
      const siblingsX = layers.filter(l => l.id !== drag.layerId).map(l => ({ start: l.x, size: l.width }))
      const siblingsY = layers.filter(l => l.id !== drag.layerId).map(l => ({ start: l.y, size: l.height }))
      const snapX = computeSnap(x, width, canvasWidth, siblingsX)
      const snapY = computeSnap(y, height, canvasHeight, siblingsY)
      x = snapX.snapped
      y = snapY.snapped
      guideX = snapX.guideAt
      guideY = snapY.guideAt
    }
    setGuides({ x: guideX, y: guideY })

    // Clamp to stay on-canvas during the gesture itself — dragging/resizing
    // off-canvas is blocked here, but typing an intentionally off-canvas
    // value directly into a NumField is NOT clamped (a legitimate design
    // case, e.g. bleed), so this clamp only ever applies to pointer drags.
    x = Math.max(0, Math.min(x, canvasWidth - MIN_BOX))
    y = Math.max(0, Math.min(y, canvasHeight - MIN_BOX))
    width = Math.min(width, canvasWidth - x)
    height = Math.min(height, canvasHeight - y)

    if (!drag.committed) {
      onCommitUndo() // first real change of this drag — snapshot the pre-drag state, once
      drag.committed = true
    }
    onChangeLayer(drag.layerId, { x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) } as Partial<Layer>)
  }

  function endDrag(e: React.PointerEvent) {
    if (dragRef.current || markerDragRef.current) {
      try { (e.currentTarget as Element).releasePointerCapture(e.pointerId) } catch { /* already released on unmount/blur */ }
    }
    dragRef.current = null
    markerDragRef.current = null
    setGuides({ x: null, y: null })
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!activeLayerId) return
    const deltas: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1],
    }
    const delta = deltas[e.key]
    if (!delta) return
    e.preventDefault()
    const layer = layers.find(l => l.id === activeLayerId)
    if (!layer) return

    const step = e.shiftKey ? 10 : 1
    const nextX = Math.max(0, Math.min(layer.x + delta[0] * step, canvasWidth - MIN_BOX))
    const nextY = Math.max(0, Math.min(layer.y + delta[1] * step, canvasHeight - MIN_BOX))

    const now = Date.now()
    const burst = nudgeBurstRef.current
    const isNewBurst = !burst || burst.layerId !== activeLayerId || now - burst.lastAt > NUDGE_BURST_GAP_MS
    if (isNewBurst) onCommitUndo()
    nudgeBurstRef.current = { layerId: activeLayerId, lastAt: now }

    onChangeLayer(activeLayerId, { x: nextX, y: nextY } as Partial<Layer>)
  }

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      onKeyDown={onKeyDown}
      // containerType enables the `cqw` unit below (1cqw = 1% of THIS
      // container's width) — lets ghost font-size scale exactly like the
      // box's own %-based position/size math, regardless of the preview
      // panel's actual on-screen pixel size.
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none', outline: 'none', containerType: 'inline-size' }}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
    >
      <FontFaceStyles layers={layers} />
      {layers.map(layer => {
        const isActive = layer.id === activeLayerId
        const ghostText = isActive && showGhost && layer.type === 'text' ? resolveGhostText(layer, activeType, previewForRecord, placeholderProfile, globalDefault) : ''
        const ghostImageUrl = isActive && showGhost && layer.type === 'photo_slot' ? resolveGhostImageUrl(layer, previewForRecord, activeType, globalDefault) : null
        const showGhostMask = hasUnderlyingPreview && (!!ghostText || !!ghostImageUrl)
        const headMarkerRect = layer.type === 'photo_slot' && layer.source === 'speaker_photo' ? computeHeadMarkerRect(layer) : null
        const ghostPhotoRect = layer.type === 'photo_slot' && layer.source === 'speaker_photo' ? computeGhostPhotoRect(layer) : null
        return (
          <div
            key={layer.id}
            data-box-el
            onPointerDown={e => startDrag(e, layer, 'move')}
            style={{
              position: 'absolute',
              left: `${(layer.x / canvasWidth) * 100}%`,
              top: `${(layer.y / canvasHeight) * 100}%`,
              width: `${(layer.width / canvasWidth) * 100}%`,
              height: `${(layer.height / canvasHeight) * 100}%`,
              boxSizing: 'border-box',
              border: isActive ? '1.5px dashed var(--lime)' : '1px dashed color-mix(in srgb, var(--ink4) 70%, transparent)',
              background: isActive ? 'color-mix(in srgb, var(--lime) 6%, transparent)' : 'transparent',
              zIndex: isActive ? 10 : 1,
              pointerEvents: 'auto',
              cursor: isActive ? 'move' : 'pointer',
            }}
          >
            {/* Ghost content sits in its own overflow:hidden wrapper, separate
                from the outer box div — the box div's own resize handles are
                deliberately positioned with negative offsets to sit OUTSIDE
                its bounds (see handleStyle), so clipping couldn't be applied
                to the outer div itself without also cutting off the handles.
                Only matters once ghostPhotoRect can legitimately exceed
                100% (a box shrunk below its own frozen reference size) — a
                no-op otherwise. */}
            <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
              {showGhostMask && (
                // Blur/scrim the stale render's own old content for this exact
                // box before drawing the crisp ghost on top — plain dimming
                // (opacity on the whole preview image) still leaves the old
                // text legible enough to read as a second, offset layer.
                <div style={{
                  position: 'absolute', inset: 0, pointerEvents: 'none',
                  backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
                  background: 'color-mix(in srgb, var(--card) 55%, transparent)',
                }} />
              )}
              {ghostImageUrl && layer.type === 'photo_slot' && (
                // eslint-disable-next-line @next/next/no-img-element -- live positioning approximation for an arbitrary external stakeholder-asset URL, not worth next/image's remote-loader config for a transient editor overlay
                <img src={ghostImageUrl} alt="" style={ghostPhotoRect ? {
                  position: 'absolute', left: 0, top: 0, width: `${ghostPhotoRect.width}%`, height: `${ghostPhotoRect.height}%`,
                  objectFit: 'cover', pointerEvents: 'none',
                } : {
                  position: 'absolute', inset: 0, width: '100%', height: '100%',
                  objectFit: 'contain', pointerEvents: 'none',
                }} />
              )}
            </div>
            {ghostText && layer.type === 'text' && (
              // Top-anchored (2026-07-31, matches the real render — see
              // renderTextLayerPng's comment in composite.ts) — was
              // alignItems: 'center', which hid where the box's own top
              // edge actually was during editing.
              <div style={{
                position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none',
                display: 'flex', alignItems: 'flex-start',
                justifyContent: layer.align === 'center' ? 'center' : layer.align === 'right' ? 'flex-end' : 'flex-start',
              }}>
                <span style={{
                  fontFamily: layer.font_family ? `"${layer.font_family.family_name.replace(/"/g, '')}"` : 'sans-serif',
                  fontWeight: resolveGhostFontWeight(layer.font_weight),
                  fontSize: `${(layer.font_size / canvasWidth) * 100}cqw`,
                  lineHeight: 1.2,
                  color: layer.font_color,
                  textAlign: layer.align ?? 'left',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  display: '-webkit-box',
                  WebkitLineClamp: layer.max_lines,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                } as React.CSSProperties}>
                  {ghostText}
                </span>
              </div>
            )}
            {layer.type === 'photo_slot' && layer.source === 'speaker_photo' && layer.alignment && headMarkerRect && (
              // Head-position REFERENCE marker (2026-08-03, Madhu's idea,
              // made draggable same day after a real miscalibrated reference
              // upload made this necessary — auto-detection isn't reliable
              // enough to trust blindly, see face-alignment.ts's own doc
              // comments) — not a crop container, a visual + EDITABLE guide
              // for where/how big alignAndCropPhoto() will place a real
              // speaker's head within this box.
              //
              // 2026-08-16: the actual geometry math lives in
              // computeHeadMarkerRect() (above) rather than inline here —
              // target_head_center_x/y/height are ratios of
              // reference_box_width/height (frozen at derive/last-drag time —
              // see PhotoAlignmentMeta's doc comment), NOT necessarily this
              // box's CURRENT width/height — the whole point being that the
              // box can now be resized (e.g. taller, for footroom) without
              // moving the head. computeHeadMarkerRect() converts the
              // reference-relative ratios into a %-of-the-CURRENT-box rect
              // for rendering; when the box hasn't been resized since the
              // reference was set, that reduces to exactly the old formula.
              <div
                onPointerDown={isActive ? e => startMarkerDrag(e, layer, 'move') : undefined}
                style={{
                  position: 'absolute',
                  left: `${headMarkerRect.left}%`,
                  top: `${headMarkerRect.top}%`,
                  width: `${headMarkerRect.width}%`,
                  height: `${headMarkerRect.height}%`,
                  borderRadius: '50%',
                  border: '1.5px dashed var(--teal-mid)',
                  background: 'color-mix(in srgb, var(--teal-mid) 8%, transparent)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  pointerEvents: isActive ? 'auto' : 'none',
                  cursor: isActive ? 'move' : undefined,
                  zIndex: 6,
                }}>
                <span style={{ fontSize: '9px', fontWeight: 800, letterSpacing: '0.4px', textTransform: 'uppercase', color: 'var(--teal-mid)', opacity: 0.85, pointerEvents: 'none' }}>Head</span>
                {isActive && (
                  // Resize handle — bottom edge of the circle. Dragging it
                  // vertically changes target_head_height (radius); the
                  // circle stays centered on target_head_center_x/y, only
                  // its size changes.
                  <div
                    onPointerDown={e => startMarkerDrag(e, layer, 'resize')}
                    title="Drag to resize the head marker"
                    style={{
                      position: 'absolute', bottom: -5, left: '50%', marginLeft: -5,
                      width: 10, height: 10, borderRadius: '50%',
                      background: 'var(--teal-mid)', border: '1.5px solid var(--card)',
                      cursor: 'ns-resize', pointerEvents: 'auto',
                    }}
                  />
                )}
              </div>
            )}
            {isActive && HANDLE_POSITIONS.map(pos => (
              <div key={pos} onPointerDown={e => startDrag(e, layer, pos)} style={handleStyle(pos)} />
            ))}
          </div>
        )
      })}

      {/* Snap guide lines — only rendered while a snap is actively engaged during a move drag. */}
      {guides.x !== null && (
        <div style={{ position: 'absolute', left: `${(guides.x / canvasWidth) * 100}%`, top: 0, bottom: 0, width: '1px', background: 'var(--teal-mid)', zIndex: 15, pointerEvents: 'none' }} />
      )}
      {guides.y !== null && (
        <div style={{ position: 'absolute', top: `${(guides.y / canvasHeight) * 100}%`, left: 0, right: 0, height: '1px', background: 'var(--teal-mid)', zIndex: 15, pointerEvents: 'none' }} />
      )}
    </div>
  )
}
