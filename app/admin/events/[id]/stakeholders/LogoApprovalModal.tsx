'use client'

import { Button } from '@/app/components/ui'

/* Logo processing review step, shown right after the Logo Engine processes
   a freshly uploaded partner/speaker company logo (background removal +
   rasterization — app/lib/media/logo-engine.ts). Unlike the speaker photo
   crop tool (PhotoCropModal.tsx), there's no crop/zoom choice here — the
   fitting math is fully deterministic — so this is just a look-and-confirm
   step: approve, or re-upload a different source file if the automatic
   processing looks wrong (e.g. a bad background-removal call on an unusual
   logo). Confirmed via real testing that the flood-fill heuristic handles
   the common cases correctly; this is the safety net for the rest. */

type Props = {
  logoUrl: string
  onClose: () => void
  onReupload: (file: File) => void
}

export default function LogoApprovalModal({ logoUrl, onClose, onReupload }: Props) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'color-mix(in srgb, black 60%, transparent)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: '380px', maxWidth: '92%', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px', padding: '22px' }}>
        <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--ink)', marginBottom: '4px' }}>Review Logo</div>
        <div style={{ fontSize: '11.5px', color: 'var(--ink3)', marginBottom: '14px' }}>Background removed automatically. Confirm it looks right, or upload a different file if it doesn&apos;t.</div>

        <div style={{
          background: 'repeating-conic-gradient(var(--border-light) 0% 25%, var(--surface) 0% 50%) 50% / 16px 16px',
          borderRadius: '10px', padding: '16px', display: 'flex', justifyContent: 'center',
        }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- checkerboard preview needs the real transparent PNG, not a next/image optimization pass */}
          <img src={logoUrl} alt="Processed logo" style={{ maxWidth: '100%', maxHeight: '220px', display: 'block' }} />
        </div>

        <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
          <Button variant="lime" onClick={onClose}>Looks Good</Button>
          <label style={{ flex: 1, textAlign: 'center', padding: '9px 14px', borderRadius: '10px', border: '1.5px solid var(--border)', color: 'var(--ink2)', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>
            Upload Different File
            <input type="file" accept="image/*,.pdf,.ai,.svg" style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) onReupload(f); e.target.value = '' }} />
          </label>
        </div>
      </div>
    </div>
  )
}
