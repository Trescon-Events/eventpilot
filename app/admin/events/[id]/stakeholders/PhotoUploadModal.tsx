'use client'

import { useEffect, useRef, useState } from 'react'
import ReactCrop, { type Crop, type PixelCrop } from 'react-image-crop'
import 'react-image-crop/dist/ReactCrop.css'
import { Button } from '@/app/components/ui'

/* Speaker-photo upload — full lifecycle in one popup (2026-07-28 rewrite,
   replacing the old PhotoCropModal which only handled the post-upload crop
   step and silently opened itself after uploadAsset() had already run with
   no visible progress). Real feedback from Madhu after using the old flow:
   - "let it show a popup first saying uploading, editing etc.. as a
     status and then there itself it can show the edited photo" — this
     modal opens the instant a file is picked (before the network call
     even starts), and shows two real, observable stages via XMLHttpRequest
     upload-progress events (not faked with timers): "uploading" (with a
     genuine % progress bar, driven by xhr.upload.onprogress) while bytes
     are still being sent, then "processing" once the browser has finished
     sending and is waiting on PhotoRoom + Sharp server-side.
   - "do we really need that adjust photo cropping feature? its anyways
     not allowing me to select more than what is selected now... in most
     cases I'll end up selecting use as-is" — the old default crop box was
     pre-inset 5% on every side ({x:5,y:5,w:90,h:90}), so "Skip" and an
     unadjusted "Confirm" produced different results, and there was no room
     to expand outward since 90% was already close to the image's own
     bounds (cropping can never show more than the source image has — an
     inherent limit, not a bug). Default is now the full, untouched image
     (0/0/100/100) and crop is a clearly secondary "Adjust Crop" action
     rather than a forced step — "Use This Photo" is the primary button.
   - "let there be an option to click cancel button or X button to cancel
     this if I want to reupload" — X (top-right) and "Choose Different
     Photo" are both available at every stage; closing mid-upload calls
     xhr.abort(), a real cancel, not just hiding the modal. */

type Stage = 'uploading' | 'processing' | 'preview' | 'crop' | 'error'

type Props = {
  speakerId: string
  initialFile: File
  onClose: () => void
  onDone: () => void
}

export default function PhotoUploadModal({ speakerId, initialFile, onClose, onDone }: Props) {
  const [stage, setStage] = useState<Stage>('uploading')
  const [progress, setProgress] = useState(0)
  const [processedUrl, setProcessedUrl] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const xhrRef = useRef<XMLHttpRequest | null>(null)

  const [crop, setCrop] = useState<Crop>({ unit: '%', x: 0, y: 0, width: 100, height: 100 })
  const [completedCrop, setCompletedCrop] = useState<PixelCrop | null>(null)
  const [cropSaving, setCropSaving] = useState(false)
  const imgRef = useRef<HTMLImageElement | null>(null)

  function startUpload(file: File) {
    setStage('uploading')
    setProgress(0)
    setErrorMsg(null)

    const form = new FormData()
    form.append('file', file)
    form.append('asset_type', 'photo')

    const xhr = new XMLHttpRequest()
    xhrRef.current = xhr
    xhr.open('POST', `/api/events/stakeholders/speakers/${speakerId}/upload-asset`)
    xhr.upload.onprogress = e => { if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100)) }
    xhr.upload.onload = () => setStage('processing') // bytes fully sent — now waiting on PhotoRoom + Sharp server-side
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText)
          const url = data.photo_processed_url || data.photo_url
          if (url) {
            setProcessedUrl(url)
            setCrop({ unit: '%', x: 0, y: 0, width: 100, height: 100 })
            setCompletedCrop(null)
            setStage('preview')
          } else {
            setErrorMsg('Upload succeeded but no photo was returned.')
            setStage('error')
          }
        } catch {
          setErrorMsg('Unexpected response from the server.')
          setStage('error')
        }
      } else {
        let message = `Upload failed (${xhr.status}).`
        try { const data = JSON.parse(xhr.responseText); if (data.error) message = data.error } catch { /* non-JSON error body */ }
        setErrorMsg(message)
        setStage('error')
      }
    }
    xhr.onerror = () => { setErrorMsg('Network error during upload.'); setStage('error') }
    xhr.send(form)
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect -- kicks off the upload once, on mount; matches this page's other mount-time fetch effects
  useEffect(() => { startUpload(initialFile) }, []) // eslint-disable-line react-hooks/exhaustive-deps -- initialFile is the one-shot file this modal was opened for

  function cancel() {
    if (stage === 'uploading') xhrRef.current?.abort()
    onClose()
  }

  function reupload(file: File) {
    startUpload(file)
  }

  async function confirmCrop() {
    const img = imgRef.current
    if (!img || !completedCrop) { setStage('preview'); return }
    const scaleX = img.naturalWidth / img.width
    const scaleY = img.naturalHeight / img.height

    setCropSaving(true)
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
    setCropSaving(false)
    if (res.ok) { onDone(); onClose() }
  }

  function useAsIs() {
    onDone()
    onClose()
  }

  const chooseDifferentInput = (
    <label style={{ display: 'inline-flex' }}>
      <span style={{ padding: '9px 14px', borderRadius: '10px', border: '1.5px solid var(--border)', color: 'var(--ink2)', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>
        Choose Different Photo
      </span>
      <input type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }}
        onChange={e => { const f = e.target.files?.[0]; if (f) reupload(f); e.target.value = '' }} />
    </label>
  )

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'color-mix(in srgb, black 60%, transparent)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div style={{ width: '480px', maxWidth: '100%', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px', padding: '22px', position: 'relative' }}>
        <button onClick={cancel} title="Cancel" style={{ position: 'absolute', top: '14px', right: '14px', background: 'none', border: 'none', color: 'var(--ink3)', fontSize: '18px', cursor: 'pointer', lineHeight: 1 }}>✕</button>

        {(stage === 'uploading' || stage === 'processing') && (
          <div style={{ padding: '30px 10px', textAlign: 'center' }}>
            <div style={{ width: '36px', height: '36px', margin: '0 auto 18px', border: '3px solid var(--border-light)', borderTopColor: 'var(--lime)', borderRadius: '50%', animation: 'photoUploadSpin 0.8s linear infinite' }} />
            <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--ink)', marginBottom: '6px' }}>
              {stage === 'uploading' ? `Uploading photo… ${progress}%` : 'Removing background & enhancing…'}
            </div>
            <div style={{ fontSize: '11.5px', color: 'var(--ink3)' }}>
              {stage === 'uploading' ? 'Sending your file to Event Pilot.' : 'This usually takes a few seconds.'}
            </div>
            {stage === 'uploading' && (
              <div style={{ width: '100%', height: '6px', background: 'var(--surface)', borderRadius: '4px', overflow: 'hidden', marginTop: '16px' }}>
                <div style={{ width: `${progress}%`, height: '100%', background: 'var(--lime)', transition: 'width 0.15s ease' }} />
              </div>
            )}
            <div style={{ marginTop: '20px' }}>
              <Button variant="ghost" onClick={cancel}>Cancel</Button>
            </div>
          </div>
        )}

        {stage === 'error' && (
          <div style={{ padding: '10px' }}>
            <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--red)', marginBottom: '6px' }}>Upload failed</div>
            <div style={{ fontSize: '12.5px', color: 'var(--ink3)', marginBottom: '18px' }}>{errorMsg}</div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <Button variant="lime" onClick={() => startUpload(initialFile)}>Retry</Button>
              {chooseDifferentInput}
              <Button variant="ghost" onClick={cancel}>Cancel</Button>
            </div>
          </div>
        )}

        {stage === 'preview' && processedUrl && (
          <>
            <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--ink)', marginBottom: '4px' }}>Photo Ready</div>
            <div style={{ fontSize: '11.5px', color: 'var(--ink3)', marginBottom: '14px' }}>Background removed and enhanced automatically. Use it as-is, or adjust the crop.</div>
            <div style={{
              background: 'repeating-conic-gradient(var(--border-light) 0% 25%, var(--surface) 0% 50%) 50% / 16px 16px',
              borderRadius: '10px', padding: '16px', display: 'flex', justifyContent: 'center',
            }}>
              {/* eslint-disable-next-line @next/next/no-img-element -- checkerboard preview needs the real transparent PNG, not a next/image optimization pass */}
              <img src={processedUrl} alt="Processed speaker photo" style={{ maxWidth: '100%', maxHeight: '320px', display: 'block' }} />
            </div>
            <div style={{ display: 'flex', gap: '8px', marginTop: '16px', flexWrap: 'wrap' }}>
              <Button variant="lime" onClick={useAsIs}>Use This Photo</Button>
              <Button variant="ghost" onClick={() => setStage('crop')}>Adjust Crop</Button>
              {chooseDifferentInput}
            </div>
          </>
        )}

        {stage === 'crop' && processedUrl && (
          <>
            <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--ink)', marginBottom: '4px' }}>Adjust Photo</div>
            <div style={{ fontSize: '11.5px', color: 'var(--ink3)', marginBottom: '14px' }}>Drag to reposition, resize the box to zoom in. The box can&apos;t extend past the photo&apos;s own edges — there&apos;s no more image beyond them to show.</div>
            <div style={{ background: 'var(--surface)', borderRadius: '10px', overflow: 'hidden', display: 'flex', justifyContent: 'center' }}>
              <ReactCrop crop={crop} onChange={c => setCrop(c)} onComplete={c => setCompletedCrop(c)}>
                {/* eslint-disable-next-line @next/next/no-img-element -- react-image-crop needs a plain <img> ref, not next/image */}
                <img ref={imgRef} src={processedUrl} alt="Speaker photo" style={{ maxWidth: '100%', maxHeight: '380px', display: 'block' }} />
              </ReactCrop>
            </div>
            <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
              <Button variant="lime" onClick={confirmCrop} disabled={cropSaving}>{cropSaving ? 'Saving…' : 'Confirm Crop'}</Button>
              <Button variant="ghost" onClick={() => setStage('preview')}>Back</Button>
            </div>
          </>
        )}
      </div>
      <style>{`@keyframes photoUploadSpin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
