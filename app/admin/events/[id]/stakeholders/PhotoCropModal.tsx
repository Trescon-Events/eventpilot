'use client'

import { useState, useRef } from 'react'
import ReactCrop, { type Crop, type PixelCrop } from 'react-image-crop'
import 'react-image-crop/dist/ReactCrop.css'
import { Button } from '@/app/components/ui'

/* Speaker-photo crop/zoom tool, shown right after PhotoRoom's background
   removal — confirmed mid-build addition, not in the original PRD.
   react-image-crop only drives the interactive rectangle selection
   (dragging repositions it, resizing it is the "zoom" — a tighter
   rectangle means more zoomed in once it becomes the final image); the
   actual pixel crop happens server-side via Sharp
   (app/api/events/stakeholders/speakers/[id]/crop-photo/route.ts), not
   browser canvas export. Speaker photos only — never partner logos.

   react-image-crop ships required CSS for its drag handles/overlay grid —
   importing it here is a narrow, deliberate exception to this codebase's
   "inline styles only" convention, which governs EventPilot's own
   component styling, not a UI library's own required CSS. */

type Props = {
  speakerId: string
  photoUrl: string
  onClose: () => void
  onCropped: () => void
}

export default function PhotoCropModal({ speakerId, photoUrl, onClose, onCropped }: Props) {
  const [crop, setCrop] = useState<Crop>({ unit: '%', x: 5, y: 5, width: 90, height: 90 })
  const [completedCrop, setCompletedCrop] = useState<PixelCrop | null>(null)
  const [saving, setSaving] = useState(false)
  const imgRef = useRef<HTMLImageElement | null>(null)

  async function confirmCrop() {
    const img = imgRef.current
    if (!img || !completedCrop) { onClose(); return }

    // Scale from the displayed (CSS-sized) image to its natural pixel
    // dimensions — react-image-crop's PixelCrop is in displayed-image units.
    const scaleX = img.naturalWidth / img.width
    const scaleY = img.naturalHeight / img.height

    setSaving(true)
    const res = await fetch(`/api/events/stakeholders/speakers/${speakerId}/crop-photo`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        crop: {
          x: Math.round(completedCrop.x * scaleX),
          y: Math.round(completedCrop.y * scaleY),
          width: Math.round(completedCrop.width * scaleX),
          height: Math.round(completedCrop.height * scaleY),
        },
      }),
    })
    setSaving(false)
    if (res.ok) onCropped()
    onClose()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'color-mix(in srgb, black 60%, transparent)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: '480px', maxWidth: '92%', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px', padding: '22px' }}>
        <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--ink)', marginBottom: '4px' }}>Adjust Photo</div>
        <div style={{ fontSize: '11.5px', color: 'var(--ink3)', marginBottom: '14px' }}>Drag to reposition, resize the box to zoom. This is how the photo will appear in the announcement creative.</div>

        <div style={{ background: 'var(--surface)', borderRadius: '10px', overflow: 'hidden', display: 'flex', justifyContent: 'center' }}>
          <ReactCrop crop={crop} onChange={c => setCrop(c)} onComplete={c => setCompletedCrop(c)}>
            {/* eslint-disable-next-line @next/next/no-img-element -- react-image-crop needs a plain <img> ref, not next/image */}
            <img ref={imgRef} src={photoUrl} alt="Speaker photo" style={{ maxWidth: '100%', maxHeight: '420px', display: 'block' }} />
          </ReactCrop>
        </div>

        <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
          <Button variant="lime" onClick={confirmCrop} disabled={saving}>{saving ? 'Saving…' : 'Confirm Crop'}</Button>
          <Button variant="ghost" onClick={onClose}>Skip — use as-is</Button>
        </div>
      </div>
    </div>
  )
}
