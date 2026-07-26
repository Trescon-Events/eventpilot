'use client'

import { useState } from 'react'
import { Button } from '@/app/components/ui'

/* Consolidated per-generation review screen (SAE Phase C v4) — shown right
   after a real generate() call succeeds, before the announcement is sent
   into the existing Phase D approval workflow. One screen: the final
   composite, the generated post copy, and thumbnails of the actual dynamic
   assets used (photo, logo) — so the MM can sanity-check the raw material
   the layer stack was built from, not just the flattened result. Static
   layers (background, overlay, event-details) never change per speaker, so
   they're not shown here — only what's genuinely new each generation. */

type Props = {
  announcementId: string
  initialCreativeUrl: string | null
  initialPostCopy: string
  photoUrl?: string | null
  logoUrl?: string | null
  onClose: () => void
}

export default function AnnouncementReviewModal({ announcementId, initialCreativeUrl, initialPostCopy, photoUrl, logoUrl, onClose }: Props) {
  const [creativeUrl, setCreativeUrl] = useState(initialCreativeUrl)
  const [postCopy, setPostCopy] = useState(initialPostCopy)
  const [regeneratingCreative, setRegeneratingCreative] = useState(false)
  const [regeneratingCopy, setRegeneratingCopy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  async function regenerateCreative() {
    setRegeneratingCreative(true)
    const res = await fetch(`/api/events/stakeholders/announcements/${announcementId}/regenerate-creative`, { method: 'POST' })
    const data = await res.json().catch(() => ({}))
    if (res.ok) setCreativeUrl(data.creative_url)
    else setMsg(data.error || 'Could not regenerate the creative.')
    setRegeneratingCreative(false)
  }

  async function regenerateCopy() {
    setRegeneratingCopy(true)
    const res = await fetch(`/api/events/stakeholders/announcements/${announcementId}/regenerate-copy`, { method: 'POST' })
    const data = await res.json().catch(() => ({}))
    if (res.ok) setPostCopy(data.post_copy)
    else setMsg(data.error || 'Could not regenerate the post copy.')
    setRegeneratingCopy(false)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'color-mix(in srgb, black 60%, transparent)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ width: '640px', maxWidth: '94%', maxHeight: '90vh', overflowY: 'auto', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px', padding: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
          <div style={{ fontSize: '16px', fontWeight: 900, color: 'var(--ink)' }}>Review Announcement</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--ink3)', fontSize: '18px', cursor: 'pointer' }}>✕</button>
        </div>
        <div style={{ fontSize: '11.5px', color: 'var(--ink3)', marginBottom: '16px' }}>Check the creative and post copy look right before this moves forward.</div>

        {msg && (
          <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'var(--red-light)', border: '1px solid var(--red-border)', color: 'var(--red)', fontSize: '12.5px', marginBottom: '14px' }}>
            {msg} <button onClick={() => setMsg(null)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontWeight: 700, marginLeft: '8px' }}>×</button>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 200px', gap: '16px' }}>
          <div>
            <div style={{ borderRadius: '10px', overflow: 'hidden', background: 'var(--surface)', border: '1px solid var(--border-light)', aspectRatio: '4 / 5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {creativeUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- reviewing a freshly generated/regenerated remote asset, not worth next/image's static-optimization pass here
                <img src={creativeUrl} alt="Generated creative" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              ) : (
                <span style={{ fontSize: '12px', color: 'var(--ink3)' }}>No creative generated</span>
              )}
            </div>
            <Button variant="ghost" onClick={regenerateCreative} disabled={regeneratingCreative}>
              {regeneratingCreative ? 'Regenerating…' : 'Regenerate Creative'}
            </Button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ fontSize: '10.5px', fontWeight: 800, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Assets Used</div>
            {photoUrl && (
              <div>
                <div style={{ fontSize: '10.5px', color: 'var(--ink3)', marginBottom: '4px' }}>Photo</div>
                {/* eslint-disable-next-line @next/next/no-img-element -- small reference thumbnail of the already-processed asset */}
                <img src={photoUrl} alt="Speaker photo used" style={{ width: '100%', borderRadius: '8px', border: '1px solid var(--border-light)' }} />
              </div>
            )}
            {logoUrl && (
              <div>
                <div style={{ fontSize: '10.5px', color: 'var(--ink3)', marginBottom: '4px' }}>Logo</div>
                <div style={{ background: 'repeating-conic-gradient(var(--border-light) 0% 25%, var(--surface) 0% 50%) 50% / 12px 12px', borderRadius: '8px', padding: '8px' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- small reference thumbnail of the already-processed asset */}
                  <img src={logoUrl} alt="Logo used" style={{ width: '100%' }} />
                </div>
              </div>
            )}
            {!photoUrl && !logoUrl && <div style={{ fontSize: '11px', color: 'var(--ink4)' }}>No photo/logo layer in this creative.</div>}
          </div>
        </div>

        <div style={{ marginTop: '16px' }}>
          <div style={{ fontSize: '10.5px', fontWeight: 800, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>Post Copy</div>
          <div style={{ padding: '12px', borderRadius: '8px', border: '1px solid var(--border-light)', background: 'var(--surface)', fontSize: '12.5px', color: 'var(--ink2)', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
            {postCopy}
          </div>
          <Button variant="ghost" onClick={regenerateCopy} disabled={regeneratingCopy}>
            {regeneratingCopy ? 'Regenerating…' : 'Regenerate Post Copy'}
          </Button>
        </div>

        <div style={{ display: 'flex', gap: '8px', marginTop: '20px' }}>
          <Button variant="lime" onClick={onClose}>Looks Good</Button>
          <Button variant="ghost" onClick={onClose}>Close</Button>
        </div>
      </div>
    </div>
  )
}
