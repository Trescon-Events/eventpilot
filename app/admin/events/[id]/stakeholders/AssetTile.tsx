'use client'
import { Download } from 'lucide-react'
import { downloadFile } from '@/app/lib/download-file'

/* Photo tile with checkerboard preview + Download link — the same tile the speaker details page uses (copied rather than imported: a page
   file can't export it, and the speaker page is left untouched). VIP details page (2026-10-19). */
export function AssetTile({ label, url, filename, onOpen, badge, badges, size }: {
  label: string; url: string | null | undefined; filename: string
  onOpen: (url: string, label: string) => void
  badge?: { text: string; tone: 'success' | 'amber' }
  badges?: { text: string; tone: 'success' | 'amber' }[]
  size?: number
}) {
  const allBadges = badges ?? (badge ? [badge] : [])
  const tileSize = size ?? 132
  return (
    <div>
      <div style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--ink4)', marginBottom: '7px', textTransform: 'uppercase', letterSpacing: '0.4px' }}>{label}</div>
      <div
        onClick={url ? () => onOpen(url, label) : undefined}
        style={{
          width: `${tileSize}px`, height: `${tileSize}px`, borderRadius: '10px', overflow: 'hidden', padding: url ? '8px' : 0,
          background: 'repeating-conic-gradient(var(--border-light) 0% 25%, var(--surface) 0% 50%) 50% / 14px 14px',
          border: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: url ? 'zoom-in' : 'default', position: 'relative',
        }}
      >
        {url
          // eslint-disable-next-line @next/next/no-img-element -- checkerboard preview needs the real image, not a next/image optimization pass
          ? <img src={url} alt={label} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
          : <span style={{ fontSize: '11.5px', color: 'var(--ink4)' }}>None</span>}
        {url && allBadges.length > 0 && (
          <div style={{ position: 'absolute', top: '5px', left: '5px', right: '5px', display: 'grid', gap: '3px' }}>
            {allBadges.map((b, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '3px',
                padding: '3px 6px', borderRadius: '6px', fontSize: '9.5px', fontWeight: 800, letterSpacing: '0.2px',
                background: b.tone === 'success' ? 'color-mix(in srgb, var(--success) 88%, transparent)' : 'color-mix(in srgb, var(--amber) 88%, transparent)',
                color: b.tone === 'success' ? 'var(--success-light)' : 'var(--amber-light)',
              }}>
                {b.tone === 'success' ? '✓ ' : '⚠ '}{b.text}
              </div>
            ))}
          </div>
        )}
      </div>
      <button
        onClick={() => url && downloadFile(url, filename).catch(() => {})}
        disabled={!url}
        title={url ? 'Download' : undefined}
        style={{
          marginTop: '7px', display: 'flex', alignItems: 'center', gap: '4px', background: 'none', border: 'none',
          color: url ? 'var(--ink3)' : 'var(--ink4)', fontSize: '12px', fontWeight: 600, cursor: url ? 'pointer' : 'default',
          padding: 0, opacity: url ? 1 : 0.4,
        }}
      >
        <Download size={12} /> Download
      </button>
    </div>
  )
}
