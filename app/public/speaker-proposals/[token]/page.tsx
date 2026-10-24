'use client'

import { use, useCallback, useEffect, useState } from 'react'
import { ClientGallery, GALLERY_STYLES, type GalleryData } from '@/app/components/proposals/ClientGallery'

/* Speaker Proposals — the page a client reviewer opens from the email link. No login; the private link is the key (it does not expire).
   One card per proposed speaker, with Approve / Reject and an optional comment. The first decision on a speaker settles it; a colleague sees who acted.
   The gallery itself is shared with the producer's preview step (app/components/proposals/ClientGallery.tsx). Only clean content is ever sent to this page. */
export default function SpeakerProposalsReviewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const [data, setData] = useState<GalleryData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fetchData = useCallback(async () => {
    const res = await fetch(`/api/public/speaker-proposals/${token}`, { cache: 'no-store' })
    return { ok: res.ok, d: await res.json().catch(() => ({})) as Record<string, unknown> }
  }, [token])
  const reload = useCallback(async () => { const r = await fetchData(); if (r.ok) setData(r.d as unknown as GalleryData); else setError(String(r.d.error ?? 'This link is not valid.')) }, [fetchData])
  useEffect(() => {
    let cancelled = false
    void (async () => { const r = await fetchData(); if (cancelled) return; if (r.ok) setData(r.d as unknown as GalleryData); else setError(String(r.d.error ?? 'This link is not valid.')) })()
    return () => { cancelled = true }
  }, [fetchData])
  if (error) return <div className="sp-shell"><style>{GALLERY_STYLES}</style><div className="sp-body"><div className="sp-banner">{error}</div></div></div>
  if (!data) return <div className="sp-shell"><style>{GALLERY_STYLES}</style><div className="sp-body">Loading…</div></div>
  return <ClientGallery data={data} token={token} onChanged={reload} />
}
