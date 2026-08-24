'use client'

import { useLayoutEffect, useRef, useState } from 'react'
import Cropper, { getInitialCropFromCroppedAreaPixels, type Area, type Point, type MediaSize } from 'react-easy-crop'
import type { HeadBox } from '@/app/lib/media/face-alignment'

/* "Confirm Cleaned Photo" step's editor (2026-08-22, rebuilt on
   react-easy-crop after a hand-rolled version produced a real bug — the
   "+" zoom button stretched the photo non-proportionately on one side,
   confirmed live by Madhu. Per Madhu: "dont invent anything new.. just
   follow standardised, tried and tested stuff." react-easy-crop (~125k
   weekly downloads) is exactly the library behind the standard "avatar
   cropper" pattern (LinkedIn/Facebook profile photo upload) — drag to pan,
   scroll/pinch to zoom, aspect ratio ALWAYS locked by the library itself,
   not hand-maintained math that can drift.

   The crop area (aspect=1, matching the Cleaning Cycle's square canvas
   exactly) is sized to fill the whole viewport — cropShape stays 'rect'
   (not round) here on purpose: react-easy-crop's own round overlay is
   ALWAYS centered within the crop area with no way to offset it, but this
   event's real target isn't centered (e.g. head center at 35.1% down, not
   50%) — so instead of relying on the library's built-in circle, a small
   custom ring is drawn on top (a plain, non-interactive absolutely-
   positioned div, pointer-events:none) at the template's EXACT stored
   coordinates. The library only ever needs to know the crop area is a
   square matching the full canvas; where within that square the target
   sits is purely this component's own overlay.

   The math: react-easy-crop's `croppedAreaPixels` is the exact SOURCE-
   photo rectangle that becomes the final canvas. Once we have that, the
   head's position in SOURCE-photo terms is just: find the pixel inside
   that rectangle corresponding to the target's known canvas-ratio
   position. That IS the HeadBox .../clean-photo/finalize already expects
   — no backend change needed, same as the previous version, just derived
   from a library's proven transform instead of hand-rolled math.

   Initial seed uses the library's OWN exported
   getInitialCropFromCroppedAreaPixels helper (the official inverse of
   croppedAreaPixels) rather than reverse-engineering its internal
   transform — feed it the crop rectangle that WOULD produce the current
   best-guess head position, get back the correct starting crop/zoom.

   The "canvas vs. object" model (2026-08-22 — per Madhu, with a Word
   screenshot for reference). The CANVAS (the checkerboard frame) and the
   fixed target ring never move — they represent the fixed page/template,
   exactly like a page in Word. The PHOTO is the object placed on it, and
   it's the photo — not the canvas — that gets the bright dashed selection
   border and the draggable corner handle, same as selecting a picture in
   Word shows handles at THAT PICTURE's own corners, not the page's.

   Both the border and the corner handle are positioned by directly
   MEASURING the real rendered <img> (via `setImageRef`, the library's own
   escape hatch for the underlying DOM node) in a useLayoutEffect that
   re-reads getBoundingClientRect() whenever crop/zoom change — rather
   than re-deriving the library's fit/transform math independently, which
   could silently drift out of sync with whatever the library actually
   renders. Neither is a child of the <img> itself: an earlier version put
   the border directly on the <img> via the library's own `style.mediaStyle`
   (which correctly merges into the same style object as the library's own
   transform, unlike `mediaProps.style` which gets silently overwritten) —
   confirmed via computed style that the border WAS being applied, but it
   never actually painted on screen (confirmed live: even an exaggerated
   10px solid border was invisible, while an unrelated plain test div with
   the same border rendered fine) — an apparent Chrome quirk with `border`
   on an `<img>` combined with `object-fit`. Drawing it as a separate
   absolutely-positioned div at the img's own measured rect sidesteps that
   entirely, using the same plain, reliably-rendering technique as every
   other overlay in this file.

   Dragging the handle only ever calls setZoom() with a new number (the
   EXACT same controlled `zoom` state scroll/pinch already drive via
   onZoomChange) — never a second, independent transform. */

type Target = { centerXRatio: number; centerYRatio: number; heightRatio: number }

type Props = {
  photoUrl: string
  target: Target
  initialHeadBox: HeadBox
  onChange: (headBox: HeadBox) => void
  // Fires whenever the photo's own rendered bottom edge does/doesn't reach
  // the canvas's bottom edge — a cheap GEOMETRIC check (2026-08-22, per
  // Madhu: gate "Looks Good"/"Enhance Only" so a producer can't mark a
  // photo complete when the body visibly doesn't reach the bottom of the
  // frame). Deliberately only the bottom edge, matching the one real
  // failure mode hasRealContentGap was ever built for (see that function's
  // own doc comment) — corners/top/sides naturally taper and aren't
  // checked. This is a bounding-box check, not a pixel-content one: it
  // can't catch a transparent notch inside the photo's own edge, only
  // whether the photo's box reaches far enough to plausibly be complete.
  onReachesBottomChange?: (reachesBottom: boolean) => void
  // Fires with how much empty canvas surrounds the photo on each edge, as
  // a FRACTION of canvas size (0-1, resolution-independent) — not a
  // pass/fail check like onReachesBottomChange, just raw numbers for the
  // caller to decide what's "a lot" (2026-08-22, per Madhu — real
  // incident: a photo needed AI to fill real, substantial gaps on all
  // four edges at once, which turned out to mean the photo just wasn't
  // zoomed in enough at Compose — closing that gap by zooming in is
  // strictly safer than any amount of AI-fill prompt tuning, since it
  // removes the need for generation entirely rather than trying to make
  // the generation more reliable).
  onGapsChange?: (gaps: { top: number; left: number; right: number; bottom: number }) => void
  size?: number
}

const MIN_ZOOM = 0.2
const MAX_ZOOM = 8
const HANDLE_SIZE = 14
// How far past the canvas edges the handle is allowed to sit (2026-08-22,
// real problem found live: at high zoom the photo's TRUE corner can end
// up past even this modal's own outer edge — unlike a real editor's
// effectively-infinite canvas, this preview sits in a fixed-height
// dialog, so an unclamped handle could become genuinely unreachable,
// clipped by the dialog's own rounded-corner mask). The border itself is
// NOT clamped — it always traces the photo's real position/size exactly,
// even extending past the canvas, same as Word still shows a picture's
// selection outline past the edge of the page. Only the interactive
// handle dot stays pinned within reach.
const HANDLE_MARGIN = 40

// Small slack, not exact-pixel equality — matches this codebase's existing
// convention (e.g. photo-cleaning-pipeline.ts's own crop-warning threshold)
// of a few px of rounding/sub-pixel tolerance rather than demanding a
// perfect match.
const REACHES_BOTTOM_TOLERANCE_PX = 3

export default function PhotoFitEditor({ photoUrl, target, initialHeadBox, onChange, onReachesBottomChange, onGapsChange, size = 420 }: Props) {
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [ready, setReady] = useState(false)
  const [mediaSize, setMediaSize] = useState<MediaSize | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const imageElRef = useRef<HTMLImageElement | null>(null)
  // The photo's own live rect and the handle's (clamped) corner position,
  // both in CSS px relative to the container — recomputed by the layout
  // effect below every time crop/zoom change.
  const [photoRect, setPhotoRect] = useState<{ left: number; top: number; width: number; height: number } | null>(null)
  const [handlePos, setHandlePos] = useState<{ left: number; top: number } | null>(null)
  const handleDragRef = useRef<{ startClientX: number; startClientY: number; startZoom: number; centerX: number; centerY: number } | null>(null)

  useLayoutEffect(() => {
    const img = imageElRef.current
    const container = containerRef.current
    if (!img || !container || !ready) return
    const iRect = img.getBoundingClientRect()
    const cRect = container.getBoundingClientRect()
    setPhotoRect({ left: iRect.left - cRect.left, top: iRect.top - cRect.top, width: iRect.width, height: iRect.height })
    setHandlePos({
      left: Math.max(-HANDLE_MARGIN, Math.min(size + HANDLE_MARGIN, iRect.right - cRect.left)),
      top: Math.max(-HANDLE_MARGIN, Math.min(size + HANDLE_MARGIN, iRect.bottom - cRect.top)),
    })
    onReachesBottomChange?.(iRect.bottom - cRect.top >= size - REACHES_BOTTOM_TOLERANCE_PX)
    onGapsChange?.({
      top: Math.max(0, iRect.top - cRect.top) / size,
      left: Math.max(0, iRect.left - cRect.left) / size,
      right: Math.max(0, cRect.right - iRect.right) / size,
      bottom: Math.max(0, cRect.bottom - iRect.bottom) / size,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onReachesBottomChange/onGapsChange intentionally excluded: callers pass inline setters, including them would re-run this layout effect (and re-measure the DOM) every render for no reason
  }, [crop, zoom, ready, size])

  function headBoxFromCroppedArea(area: Area, media: MediaSize): HeadBox {
    const headCenterX = area.x + target.centerXRatio * area.width
    const headCenterY = area.y + target.centerYRatio * area.height
    const headHeight = target.heightRatio * area.height
    return {
      centerXRatio: headCenterX / media.naturalWidth,
      centerYRatio: headCenterY / media.naturalHeight,
      heightRatio: headHeight / media.naturalHeight,
    }
  }

  function handleMediaLoaded(media: MediaSize) {
    setMediaSize(media)
    // The crop rectangle (in SOURCE-photo pixels) that would place the
    // current best-guess head position exactly on the target — see this
    // file's top comment for the derivation.
    const cropSizePx = (initialHeadBox.heightRatio * media.naturalHeight) / target.heightRatio
    const initialCroppedAreaPixels: Area = {
      width: cropSizePx,
      height: cropSizePx,
      x: initialHeadBox.centerXRatio * media.naturalWidth - target.centerXRatio * cropSizePx,
      y: initialHeadBox.centerYRatio * media.naturalHeight - target.centerYRatio * cropSizePx,
    }
    const { crop: initialCrop, zoom: initialZoom } = getInitialCropFromCroppedAreaPixels(
      initialCroppedAreaPixels, media, 0, { width: size, height: size }, MIN_ZOOM, MAX_ZOOM
    )
    setCrop(initialCrop)
    setZoom(initialZoom)
    setReady(true)
    onChange(headBoxFromCroppedArea(initialCroppedAreaPixels, media))
  }

  function handleCropComplete(_croppedArea: Area, croppedAreaPixels: Area) {
    if (!mediaSize) return
    onChange(headBoxFromCroppedArea(croppedAreaPixels, mediaSize))
  }

  // Drag the corner handle away from the PHOTO's own current center to
  // zoom in, toward it to zoom out — proportional to how far the pointer
  // has moved relative to its starting distance from that center. The
  // photo's center (not the container's) is the right anchor: it's what
  // CSS transform-origin actually scales around when zoom changes with
  // crop held constant (confirmed live — a zoom-only change never moved
  // the photo's own rendered center), so using it keeps the interaction
  // accurate even after the photo's been panned off-center.
  function startHandleDrag(e: React.PointerEvent) {
    e.preventDefault()
    e.stopPropagation()
    ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
    const iRect = imageElRef.current?.getBoundingClientRect()
    const centerX = iRect ? iRect.left + iRect.width / 2 : e.clientX
    const centerY = iRect ? iRect.top + iRect.height / 2 : e.clientY
    handleDragRef.current = { startClientX: e.clientX, startClientY: e.clientY, startZoom: zoom, centerX, centerY }
  }

  function onHandleDragMove(e: React.PointerEvent) {
    const drag = handleDragRef.current
    if (!drag) return
    const startDistance = Math.hypot(drag.startClientX - drag.centerX, drag.startClientY - drag.centerY)
    const currentDistance = Math.hypot(e.clientX - drag.centerX, e.clientY - drag.centerY)
    if (startDistance < 1) return
    const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, drag.startZoom * (currentDistance / startDistance)))
    setZoom(newZoom)
  }

  function endHandleDrag(e: React.PointerEvent) {
    if (handleDragRef.current) {
      try { (e.currentTarget as Element).releasePointerCapture(e.pointerId) } catch { /* already released on unmount/blur */ }
    }
    handleDragRef.current = null
  }

  return (
    <div>
      <div ref={containerRef} style={{ position: 'relative', width: `${size}px`, height: `${size}px`, margin: '0 auto' }}>
        {/* Clipped layer — only the photo itself gets clipped to the
            canvas edges; the border+handle (below, on the un-clipped
            wrapper) stay visible even when the photo is zoomed in far
            enough that its edges fall outside the visible frame, same as
            Word still shows a picture's selection outline and resize
            handles even when they're off the edge of the page. */}
        <div style={{
          position: 'absolute', inset: 0, borderRadius: '8px', overflow: 'hidden', border: '1.5px solid var(--border)',
          background: 'repeating-conic-gradient(var(--border-light) 0% 25%, var(--surface) 0% 50%) 50% / 14px 14px',
          visibility: ready ? 'visible' : 'hidden',
        }}>
          <Cropper
            image={photoUrl}
            crop={crop}
            zoom={zoom}
            aspect={1}
            cropShape="rect"
            cropSize={{ width: size, height: size }}
            showGrid={false}
            minZoom={MIN_ZOOM}
            maxZoom={MAX_ZOOM}
            restrictPosition={false}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={handleCropComplete}
            onMediaLoaded={handleMediaLoaded}
            setImageRef={ref => { imageElRef.current = ref.current }}
            style={{ containerStyle: { background: 'transparent' } }}
          />
          {/* The FIXED target ring — the "page," never moves regardless of
              how the photo underneath is panned/zoomed. Purely visual
              (pointer-events none so drag/wheel on top of it still reaches
              the Cropper). */}
          <div style={{
            position: 'absolute', pointerEvents: 'none',
            left: `${(target.centerXRatio - target.heightRatio / 2) * 100}%`,
            top: `${(target.centerYRatio - target.heightRatio / 2) * 100}%`,
            width: `${target.heightRatio * 100}%`, height: `${target.heightRatio * 100}%`,
            borderRadius: '50%', border: '2px dashed var(--teal-mid)',
          }} />
        </div>
        {/* The photo's own selection border — a plain overlay div at its
            measured rect (see this file's top comment on why not
            style.mediaStyle), not clamped, so it always traces the
            photo's true position/size exactly, even past the canvas
            edges. */}
        {photoRect && (
          <div style={{
            position: 'absolute', pointerEvents: 'none', boxSizing: 'border-box',
            left: `${photoRect.left}px`, top: `${photoRect.top}px`, width: `${photoRect.width}px`, height: `${photoRect.height}px`,
            border: '2px dashed var(--lime)',
          }} />
        )}
        {/* Corner drag handle — glued to the PHOTO's own live bottom-right
            corner, clamped to stay reachable (see HANDLE_MARGIN above). */}
        {handlePos && (
          <div
            onPointerDown={startHandleDrag}
            onPointerMove={onHandleDragMove}
            onPointerUp={endHandleDrag}
            title="Drag to resize the photo"
            style={{
              position: 'absolute', left: `${handlePos.left}px`, top: `${handlePos.top}px`, transform: 'translate(-50%, -50%)',
              width: `${HANDLE_SIZE}px`, height: `${HANDLE_SIZE}px`, borderRadius: '50%',
              background: 'var(--lime)', border: '2px solid var(--card)',
              cursor: 'nwse-resize', touchAction: 'none',
              boxShadow: '0 1px 4px color-mix(in srgb, black 40%, transparent)',
            }}
          />
        )}
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', marginTop: '10px' }}>
        <span style={{ fontSize: '11px', color: 'var(--ink4)' }}>Drag to reposition, scroll/pinch or drag the yellow corner handle to resize</span>
      </div>
    </div>
  )
}
