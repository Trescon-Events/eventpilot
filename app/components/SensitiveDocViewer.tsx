'use client'

import { useEffect, useState } from 'react'

/* View-only, watermarked viewer for Passport / National ID documents.
   Shows server-rendered JPEG pages (viewer name + time + view id burned in) —
   never the original file or a storage link. Every page view is audited
   server-side. The print/right-click/drag blocks are advisory only: the burned-in
   watermark is what makes a copy traceable. See app/api/events/sensitive-documents/view. */

type Loaded = { key: string; url: string | null; pageCount: number; error: string | null }

export default function SensitiveDocViewer({ docId, title, onClose }: { docId: string; title: string; onClose: () => void }) {
  const [page, setPage] = useState(0)
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const key = `${docId}:${page}`
  const loading = loaded?.key !== key

  useEffect(() => {
    let cancelled = false
    let objectUrl: string | null = null
    ;(async () => {
      try {
        const res = await fetch(`/api/events/sensitive-documents/view?doc_id=${encodeURIComponent(docId)}&page=${page}`, { cache: 'no-store' })
        if (!res.ok) {
          const body = await res.json().catch(() => null)
          if (!cancelled) setLoaded({ key, url: null, pageCount: 1, error: body?.error ?? 'This document could not be opened.' })
          return
        }
        const count = Number(res.headers.get('X-Page-Count') ?? '1') || 1
        objectUrl = URL.createObjectURL(await res.blob())
        if (cancelled) { URL.revokeObjectURL(objectUrl); return }
        setLoaded({ key, url: objectUrl, pageCount: count, error: null })
      } catch {
        if (!cancelled) setLoaded({ key, url: null, pageCount: 1, error: 'This document could not be opened.' })
      }
    })()
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [docId, page, key])

  const pageCount = loaded?.pageCount ?? 1
  return (
    <div className="sdv-root" onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'var(--overlay-scrim)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '24px' }}>
      <style>{'@media print { .sdv-root { display: none !important; } }'}</style>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--card)', borderRadius: '12px', width: 'min(900px, 100%)', height: 'min(88vh, 940px)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
          <div>
            <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--ink)' }}>{title}</div>
            <div style={{ fontSize: '11px', color: 'var(--ink3)', marginTop: '2px' }}>View only · watermarked with your name and the time · every view is logged</div>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {pageCount > 1 && (
              <>
                <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} style={btn}>‹ Prev</button>
                <span style={{ fontSize: '12px', color: 'var(--ink3)' }}>Page {page + 1} of {pageCount}</span>
                <button onClick={() => setPage(p => Math.min(pageCount - 1, p + 1))} disabled={page >= pageCount - 1} style={btn}>Next ›</button>
              </>
            )}
            <button onClick={onClose} style={btn}>Close</button>
          </div>
        </div>
        <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--surface)', overflow: 'auto', userSelect: 'none' }}>
          {loading && <span style={{ color: 'var(--ink3)', fontSize: '13px' }}>Opening…</span>}
          {!loading && loaded?.error && <span style={{ color: 'var(--amber)', fontSize: '13px', maxWidth: '460px', textAlign: 'center', lineHeight: 1.6, padding: '20px' }}>{loaded.error}</span>}
          {!loading && loaded?.url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={loaded.url} alt={title} draggable={false} onContextMenu={e => e.preventDefault()} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
          )}
        </div>
      </div>
    </div>
  )
}

const btn: React.CSSProperties = { padding: '7px 14px', borderRadius: '8px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--ink3)', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }
