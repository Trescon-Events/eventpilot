'use client'

import { useRef, useState } from 'react'
import { Button, ProcessingOverlay } from '@/app/components/ui'

/* Manual head-position override (2026-08-03) — auto-detection (Gemini,
   app/lib/media/face-alignment.ts) isn't reliable for every photo: re-running
   it 6 times against the same real speaker photo produced heightRatio
   anywhere from 0.22 to 0.68, and whatever got cached at upload was
   essentially a coin flip, badly mis-sizing the generated creative. Rather
   than retrying detection and hoping for a better roll, this lets a human
   drag a marker directly over the head.

   Only center X/Y and HEIGHT are ever read by alignAndCropPhoto() — see
   composite.ts. Hand-rolled (2026-08-03, replacing an earlier react-image-
   crop version) rather than a generic crop-box library component, for two
   reasons: (1) visual/interaction consistency with the template/variant
   editor's own head-position marker (LayerBoxOverlay.tsx) — a thin dashed
   circle with a single resize handle, not a library's default thick-white-
   box-with-8-corner-handles chrome; (2) react-image-crop's crop object
   mixes percent/pixel/natural-vs-displayed unit systems, which is exactly
   what caused a real bug earlier today (a percent value misread as pixels
   produced a fully blank generated photo). Tracking centerXRatio/
   centerYRatio/heightRatio DIRECTLY as state sidesteps that whole class of
   bug — a ratio is scale-invariant, so drag deltas convert via the image's
   own currently-rendered size with no natural-vs-displayed distinction to
   get wrong. */

type HeadBox = { centerXRatio: number; centerYRatio: number; heightRatio: number }

type Props = {
  speakerId: string
  photoUrl: string
  currentHeadBox: HeadBox | null
  onClose: () => void
  onDone: () => void
}

const DEFAULT_BOX: HeadBox = { centerXRatio: 0.5, centerYRatio: 0.22, heightRatio: 0.28 }

export default function HeadBoxEditorModal({ speakerId, photoUrl, currentHeadBox, onClose, onDone }: Props) {
  const [box, setBox] = useState<HeadBox>(currentHeadBox ?? DEFAULT_BOX)
  // naturalWidth/naturalHeight of the photo — the ONLY thing needed to draw
  // a true on-screen circle despite heightRatio being relative to height
  // only (see widthRatio below). Not needed for any drag math: ratio deltas
  // are computed straight from the image's own rendered rect at drag time.
  const [imgAspect, setImgAspect] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [redetecting, setRedetecting] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef<{
    mode: 'move' | 'resize'
    startClientX: number; startClientY: number
    startBox: HeadBox
    rectWidth: number; rectHeight: number
  } | null>(null)

  function onImgLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    const img = e.currentTarget
    setImgAspect(img.naturalWidth / img.naturalHeight)
  }

  function startDrag(e: React.PointerEvent, mode: 'move' | 'resize') {
    e.preventDefault()
    e.stopPropagation()
    ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
    const rect = containerRef.current?.getBoundingClientRect()
    dragRef.current = { mode, startClientX: e.clientX, startClientY: e.clientY, startBox: box, rectWidth: rect?.width || 1, rectHeight: rect?.height || 1 }
  }

  function onPointerMove(e: React.PointerEvent) {
    const drag = dragRef.current
    if (!drag) return
    const dxRatio = (e.clientX - drag.startClientX) / drag.rectWidth
    const dyRatio = (e.clientY - drag.startClientY) / drag.rectHeight
    if (drag.mode === 'move') {
      setBox({
        centerXRatio: Math.max(0, Math.min(1, drag.startBox.centerXRatio + dxRatio)),
        centerYRatio: Math.max(0, Math.min(1, drag.startBox.centerYRatio + dyRatio)),
        heightRatio: drag.startBox.heightRatio,
      })
    } else {
      // Resize handle sits at the circle's bottom edge — dragging it down/up
      // by dy moves that edge, so the diameter (heightRatio) changes by 2×dy.
      setBox({ ...drag.startBox, heightRatio: Math.max(0.03, drag.startBox.heightRatio + dyRatio * 2) })
    }
  }

  function endDrag(e: React.PointerEvent) {
    if (dragRef.current) {
      try { (e.currentTarget as Element).releasePointerCapture(e.pointerId) } catch { /* already released on unmount/blur */ }
    }
    dragRef.current = null
  }

  async function save() {
    setSaving(true)
    setErrorMsg(null)
    try {
      const res = await fetch(`/api/events/stakeholders/speakers/${speakerId}/head-box`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ head_box: box }),
      })
      if (!res.ok) { setErrorMsg('Could not save — please try again.'); return }
      onDone()
      onClose()
    } catch {
      setErrorMsg('Could not save — check your connection and try again.')
    } finally {
      setSaving(false)
    }
  }

  // "Re-detect Automatically" — runs a fresh detectHeadBox() call against the
  // current photo and re-seeds the marker from it. Mainly for when a photo
  // somehow has no cached photo_head_box at all (upload-time detection can
  // fail silently), so there's a real starting point instead of the generic
  // default — but also a convenient reset if a manual edit went wrong.
  // Detection is already known to be unreliable (see this file's top
  // comment) — a starting point to correct, not a substitute for dragging.
  async function redetect() {
    setRedetecting(true)
    setErrorMsg(null)
    try {
      const res = await fetch(`/api/events/stakeholders/speakers/${speakerId}/head-box`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setErrorMsg(data?.error ?? 'Could not detect a face — drag the marker manually.'); return }
      setBox(data.photo_head_box as HeadBox)
    } catch {
      setErrorMsg('Could not detect a face — check your connection and try again.')
    } finally {
      setRedetecting(false)
    }
  }

  // Diameter is heightRatio (fraction of the image's own HEIGHT) applied to
  // BOTH axes via the image's own aspect ratio, for a true on-screen circle
  // — same convention as the template editor's marker (see
  // LayerBoxOverlay.tsx's "Head-position REFERENCE marker" comment).
  const widthRatio = imgAspect ? box.heightRatio / imgAspect : box.heightRatio

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'color-mix(in srgb, black 60%, transparent)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ width: '480px', maxWidth: '100%', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px', padding: '22px' }}>
        <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--ink)', marginBottom: '4px' }}>Fix Head Position</div>
        <div style={{ fontSize: '11.5px', color: 'var(--ink3)', marginBottom: '14px' }}>
          Drag the circle over just the head (not shoulders or torso) — resize with the handle at its bottom edge. This overrides automatic detection used when generating creatives — useful when a generated creative shows the head too small, too large, or mispositioned.
        </div>
        <div style={{ background: 'var(--surface)', borderRadius: '10px', overflow: 'hidden', display: 'flex', justifyContent: 'center', padding: '12px' }}>
          <div
            ref={containerRef}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            style={{ position: 'relative', display: 'inline-block', touchAction: 'none' }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- needs real onLoad access to naturalWidth/naturalHeight, not next/image */}
            <img src={photoUrl} alt="Speaker photo" onLoad={onImgLoad} style={{ maxWidth: '100%', maxHeight: '380px', display: 'block' }} />
            {imgAspect && (
              <div
                onPointerDown={e => startDrag(e, 'move')}
                style={{
                  position: 'absolute',
                  left: `${(box.centerXRatio - widthRatio / 2) * 100}%`,
                  top: `${(box.centerYRatio - box.heightRatio / 2) * 100}%`,
                  width: `${widthRatio * 100}%`,
                  height: `${box.heightRatio * 100}%`,
                  borderRadius: '50%',
                  border: '1.5px dashed var(--teal-mid)',
                  background: 'color-mix(in srgb, var(--teal-mid) 10%, transparent)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'move',
                }}
              >
                <span style={{ fontSize: '9px', fontWeight: 800, letterSpacing: '0.4px', textTransform: 'uppercase', color: 'var(--teal-mid)', opacity: 0.9, pointerEvents: 'none' }}>Head</span>
                <div
                  onPointerDown={e => startDrag(e, 'resize')}
                  title="Drag to resize the head marker"
                  style={{
                    position: 'absolute', bottom: -5, left: '50%', marginLeft: -5,
                    width: 10, height: 10, borderRadius: '50%',
                    background: 'var(--teal-mid)', border: '1.5px solid var(--card)',
                    cursor: 'ns-resize',
                  }}
                />
              </div>
            )}
          </div>
        </div>
        {errorMsg && <div style={{ fontSize: '11.5px', color: 'var(--red)', marginTop: '10px' }}>{errorMsg}</div>}
        <div style={{ display: 'flex', gap: '8px', marginTop: '16px', flexWrap: 'wrap' }}>
          <Button variant="lime" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save Head Position'}</Button>
          <Button variant="ghost" onClick={redetect} disabled={redetecting} title="Run automatic face detection again and reset the marker to its result">
            {redetecting ? 'Detecting…' : 'Re-detect Automatically'}
          </Button>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
        </div>
      </div>
      <ProcessingOverlay
        active={saving || redetecting}
        label={redetecting ? 'Detecting the face position…' : 'Saving head position…'}
        sublabel={redetecting ? 'Running automatic face detection.' : undefined}
        estimatedMs={redetecting ? 4000 : 700}
      />
    </div>
  )
}
