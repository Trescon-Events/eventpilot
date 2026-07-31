'use client'

import { useRef, useState } from 'react'
import type { Layer, TextLayer, PhotoSlotLayer, PlaceholderProfile } from '@/app/lib/announcements/composite'
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
  // The event's saved "Placeholder data" profile (2026-07-31) — used as the
  // ghost's fallback content when no real stakeholder is selected
  // (previewForRecord is null), same as the server preview route falls back
  // to it. Replaces the old hardcoded "Jane Doe" stand-in.
  placeholderProfile: PlaceholderProfile
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
function resolveGhostText(layer: TextLayer, activeType: StakeholderKind, record: StakeholderOption | null, placeholder: PlaceholderProfile): string {
  if (layer.field === 'custom') return layer.value || ''
  if (layer.field === 'tier') return layer.value || 'LEAD SPONSOR'
  if (activeType !== 'speaker') return ''
  if (layer.field === 'name') return record?.label || placeholder.name || 'Jane Doe'
  if (layer.field === 'title') return record?.job_title || placeholder.job_title || 'Chief Officer'
  if (layer.field === 'company') return record?.company_name || placeholder.company_name || 'Acme Corp'
  return ''
}

function resolveGhostImageUrl(layer: PhotoSlotLayer, record: StakeholderOption | null, placeholder: PlaceholderProfile): string | null {
  if (layer.source === 'speaker_photo') return record?.photo_url ?? placeholder.photo_url ?? null
  if (layer.source === 'speaker_logo') return record?.company_logo_url ?? placeholder.company_logo_url ?? null
  return record?.logo_url ?? placeholder.logo_url ?? null // partner_logo
}

// One @font-face rule per distinct custom brand font in use, reusing the
// exact same regular_url/bold_url already stored per-layer — unlike
// librsvg (see composite.ts's renderTextLayerPng doc comment), browsers
// reliably support @font-face, so the ghost can show the REAL font too.
function FontFaceStyles({ layers }: { layers: Layer[] }) {
  const seen = new Set<string>()
  const rules: string[] = []
  for (const layer of layers) {
    if (layer.type !== 'text' || !layer.font_family) continue
    const { family_name, regular_url, bold_url } = layer.font_family
    if (seen.has(family_name)) continue
    seen.add(family_name)
    const safeName = family_name.replace(/"/g, '')
    rules.push(`@font-face{font-family:"${safeName}";font-weight:400;src:url("${regular_url}");}`)
    if (bold_url) rules.push(`@font-face{font-family:"${safeName}";font-weight:700;src:url("${bold_url}");}`)
  }
  if (rules.length === 0) return null
  return <style>{rules.join('\n')}</style>
}

export default function LayerBoxOverlay({ layers, canvasWidth, canvasHeight, activeLayerId, onSelectLayer, onChangeLayer, onCommitUndo, activeType, previewForRecord, placeholderProfile, showGhost, hasUnderlyingPreview }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef<{ layerId: string; mode: DragMode; startClientX: number; startClientY: number; startBox: Box; committed: boolean } | null>(null)
  const nudgeBurstRef = useRef<{ layerId: string; lastAt: number } | null>(null)
  const [guides, setGuides] = useState<{ x: number | null; y: number | null }>({ x: null, y: null })

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
    dragRef.current = { layerId: layer.id, mode, startClientX: e.clientX, startClientY: e.clientY, startBox: { x: layer.x, y: layer.y, width: layer.width, height: layer.height }, committed: false }
  }

  function onPointerMove(e: React.PointerEvent) {
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
    if (dragRef.current) {
      try { (e.currentTarget as Element).releasePointerCapture(e.pointerId) } catch { /* already released on unmount/blur */ }
    }
    dragRef.current = null
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
        const ghostText = isActive && showGhost && layer.type === 'text' ? resolveGhostText(layer, activeType, previewForRecord, placeholderProfile) : ''
        const ghostImageUrl = isActive && showGhost && layer.type === 'photo_slot' ? resolveGhostImageUrl(layer, previewForRecord, placeholderProfile) : null
        const showGhostMask = hasUnderlyingPreview && (!!ghostText || !!ghostImageUrl)
        return (
          <div
            key={layer.id}
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
                  fontWeight: layer.font_weight === 'bold' ? 700 : 400,
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
            {ghostImageUrl && layer.type === 'photo_slot' && (
              // eslint-disable-next-line @next/next/no-img-element -- live positioning approximation for an arbitrary external stakeholder-asset URL, not worth next/image's remote-loader config for a transient editor overlay
              <img src={ghostImageUrl} alt="" style={{
                position: 'absolute', inset: 0, width: '100%', height: '100%',
                objectFit: layer.source === 'speaker_photo' ? 'cover' : 'contain',
                pointerEvents: 'none',
              }} />
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
