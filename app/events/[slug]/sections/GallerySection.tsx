'use client'

import { useState } from 'react'
import type { SectionItem } from '@/app/lib/event-page-types'

export default function GallerySection({
  items, layout = 'grid', accent,
}: {
  items: SectionItem[]
  layout?: string
  accent: string
}) {
  const [lightbox, setLightbox] = useState<string | null>(null)
  const [active,   setActive]   = useState(0)

  const images = items.filter(i => i.image_url)
  if (images.length === 0) return null

  const open  = (url: string, i: number) => { setLightbox(url); setActive(i) }
  const close = () => setLightbox(null)
  const shift = (d: number) => {
    const next = (active + d + images.length) % images.length
    setActive(next); setLightbox(images[next].image_url!)
  }

  const imgStyle: React.CSSProperties = { width: '100%', height: '100%', objectFit: 'cover', display: 'block', cursor: 'pointer', transition: 'transform 0.3s' }

  return (
    <>
      {/* Lightbox */}
      {lightbox && (
        <div onClick={close} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <button onClick={e => { e.stopPropagation(); shift(-1) }} style={{ position: 'absolute', left: '20px', background: 'none', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', fontSize: '24px', width: '48px', height: '48px', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>‹</button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox} alt="" onClick={e => e.stopPropagation()} style={{ maxWidth: '90vw', maxHeight: '85vh', objectFit: 'contain', borderRadius: '12px' }} />
          <button onClick={e => { e.stopPropagation(); shift(1) }} style={{ position: 'absolute', right: '20px', background: 'none', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', fontSize: '24px', width: '48px', height: '48px', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>›</button>
          <button onClick={close} style={{ position: 'absolute', top: '20px', right: '20px', background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', fontSize: '28px', cursor: 'pointer' }}>×</button>
          {images[active].caption && (
            <div style={{ position: 'absolute', bottom: '20px', left: 0, right: 0, textAlign: 'center', fontSize: '13px', color: 'rgba(255,255,255,0.5)' }}>{images[active].caption}</div>
          )}
        </div>
      )}

      {layout === 'carousel' && (
        <div style={{ position: 'relative' }}>
          <div style={{ height: 'clamp(300px,50vw,600px)', borderRadius: '16px', overflow: 'hidden', cursor: 'pointer' }} onClick={() => open(images[active].image_url!, active)}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={images[active].image_url!} alt={images[active].caption ?? ''} style={{ ...imgStyle, height: '100%' }} />
          </div>
          {images.length > 1 && (
            <>
              <button onClick={() => { const n = (active-1+images.length)%images.length; setActive(n) }}
                style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', background: 'rgba(0,0,0,0.5)', border: 'none', color: '#fff', fontSize: '24px', width: '44px', height: '44px', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>‹</button>
              <button onClick={() => { const n = (active+1)%images.length; setActive(n) }}
                style={{ position: 'absolute', right: '16px', top: '50%', transform: 'translateY(-50%)', background: 'rgba(0,0,0,0.5)', border: 'none', color: '#fff', fontSize: '24px', width: '44px', height: '44px', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>›</button>
              <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '16px' }}>
                {images.map((_, i) => (
                  <button key={i} onClick={() => setActive(i)}
                    style={{ width: i === active ? '24px' : '8px', height: '8px', borderRadius: '4px', border: 'none', background: i === active ? accent : 'rgba(240,237,232,0.2)', cursor: 'pointer', transition: 'all 0.3s', padding: 0 }} />
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {layout === 'masonry' && (
        <div style={{ columns: '2 280px', columnGap: '16px' }}>
          {images.map((img, i) => (
            <div key={img.id} style={{ breakInside: 'avoid', marginBottom: '16px', borderRadius: '12px', overflow: 'hidden', cursor: 'pointer' }}
              onClick={() => open(img.image_url!, i)}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.image_url!} alt={img.caption ?? ''} style={{ width: '100%', display: 'block', objectFit: 'cover' }} />
            </div>
          ))}
        </div>
      )}

      {layout === 'grid' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
          {images.map((img, i) => (
            <div key={img.id} style={{ aspectRatio: '16/10', borderRadius: '12px', overflow: 'hidden', cursor: 'pointer' }}
              onClick={() => open(img.image_url!, i)}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.image_url!} alt={img.caption ?? ''} style={imgStyle}
                onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.04)')}
                onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')} />
            </div>
          ))}
        </div>
      )}
    </>
  )
}
