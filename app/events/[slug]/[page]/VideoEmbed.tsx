'use client'

import { useState } from 'react'

function getEmbedUrl(url: string): string | null {
  if (!url) return null
  // YouTube
  const yt = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([A-Za-z0-9_-]{11})/)
  if (yt) return `https://www.youtube.com/embed/${yt[1]}?autoplay=1&rel=0`
  // Vimeo
  const vm = url.match(/vimeo\.com\/(\d+)/)
  if (vm) return `https://player.vimeo.com/video/${vm[1]}?autoplay=1`
  return null
}

function getThumbnail(url: string): string | null {
  const yt = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([A-Za-z0-9_-]{11})/)
  if (yt) return `https://img.youtube.com/vi/${yt[1]}/maxresdefault.jpg`
  return null
}

export default function VideoEmbed({
  videoUrl, layout = 'contained', accent, customTitle,
}: {
  videoUrl: string
  layout?: string
  accent: string
  customTitle?: string | null
}) {
  const [playing, setPlaying] = useState(false)
  const embedUrl  = getEmbedUrl(videoUrl)
  const thumbnail = getThumbnail(videoUrl)

  if (!embedUrl) return null

  const maxW = layout === 'fullscreen' ? '100%' : '960px'

  return (
    <div style={{ maxWidth: maxW, margin: '0 auto' }}>
      {customTitle && (
        <h2 style={{ fontSize: 'clamp(28px,3.5vw,44px)', fontWeight: 900, letterSpacing: '-0.03em', margin: '0 0 32px', textAlign: layout === 'fullscreen' ? 'center' : 'left' }}>{customTitle}</h2>
      )}
      <div style={{ position: 'relative', paddingTop: '56.25%', borderRadius: layout === 'fullscreen' ? 0 : '16px', overflow: 'hidden', background: '#000' }}>
        {playing
          ? <iframe src={embedUrl} allow="autoplay; fullscreen; picture-in-picture" allowFullScreen
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none' }} />
          : (
            <div style={{ position: 'absolute', inset: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              onClick={() => setPlaying(true)}>
              {thumbnail && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={thumbnail} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.7 }} />
              )}
              <div style={{ position: 'relative', zIndex: 2, width: '80px', height: '80px', borderRadius: '50%', background: accent, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 0 40px ${accent}66`, transition: 'transform 0.2s' }}
                onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.1)')}
                onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="#fff"><polygon points="5 3 19 12 5 21 5 3"/></svg>
              </div>
            </div>
          )
        }
      </div>
    </div>
  )
}
