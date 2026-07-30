'use client'

import { useRef } from 'react'
import type { Layer } from '@/app/lib/announcements/composite'

/* Drag/resize box editor overlaid on the variant editor's live preview
   image (SAE Phase C v5, 2026-07-29) — Madhu's explicit request to unify
   ALL layer types (image, photo/logo, text) under one visual editor rather
   than text-only, since none of them had any drag/resize interaction
   before this (only plain number-input fields). Hand-rolled rather than
   reusing react-image-crop (already a dependency, used in
   PhotoUploadModal.tsx) — that component is a single-box/single-image
   crop selector, the wrong shape for N simultaneous boxes over one shared
   preview image.

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
}

type Box = { x: number; y: number; width: number; height: number }
type HandlePos = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'
type DragMode = 'move' | HandlePos

// Floor in canvas-space px — a box can never be dragged/resized smaller
// than this during a gesture (free-typing in the NumFields is unclamped;
// this only governs pointer drags, per the plan's gesture-vs-typing split).
const MIN_BOX = 16

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

export default function LayerBoxOverlay({ layers, canvasWidth, canvasHeight, activeLayerId, onSelectLayer, onChangeLayer }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef<{ layerId: string; mode: DragMode; startClientX: number; startClientY: number; startBox: Box } | null>(null)

  function toCanvasDelta(clientDx: number, clientDy: number): { dx: number; dy: number } {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0 || rect.height === 0) return { dx: 0, dy: 0 }
    return { dx: (clientDx / rect.width) * canvasWidth, dy: (clientDy / rect.height) * canvasHeight }
  }

  function startDrag(e: React.PointerEvent, layer: Layer, mode: DragMode) {
    e.preventDefault()
    e.stopPropagation()
    onSelectLayer(layer.id)
    ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
    dragRef.current = { layerId: layer.id, mode, startClientX: e.clientX, startClientY: e.clientY, startBox: { x: layer.x, y: layer.y, width: layer.width, height: layer.height } }
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

    // Clamp to stay on-canvas during the gesture itself — dragging/resizing
    // off-canvas is blocked here, but typing an intentionally off-canvas
    // value directly into a NumField is NOT clamped (a legitimate design
    // case, e.g. bleed), so this clamp only ever applies to pointer drags.
    x = Math.max(0, Math.min(x, canvasWidth - MIN_BOX))
    y = Math.max(0, Math.min(y, canvasHeight - MIN_BOX))
    width = Math.min(width, canvasWidth - x)
    height = Math.min(height, canvasHeight - y)

    onChangeLayer(drag.layerId, { x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) } as Partial<Layer>)
  }

  function endDrag(e: React.PointerEvent) {
    if (dragRef.current) {
      try { (e.currentTarget as Element).releasePointerCapture(e.pointerId) } catch { /* already released on unmount/blur */ }
    }
    dragRef.current = null
  }

  return (
    <div ref={containerRef} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} onPointerMove={onPointerMove} onPointerUp={endDrag}>
      {layers.map(layer => {
        const isActive = layer.id === activeLayerId
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
            {isActive && HANDLE_POSITIONS.map(pos => (
              <div key={pos} onPointerDown={e => startDrag(e, layer, pos)} style={handleStyle(pos)} />
            ))}
          </div>
        )
      })}
    </div>
  )
}
