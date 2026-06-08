'use client'

import { useState, useEffect, useCallback } from 'react'
import type { SectionItem } from '@/app/lib/event-page-types'

const STARS = (n = 5) => Array.from({ length: 5 }, (_, i) => (
  <span key={i} style={{ color: i < n ? '#F59E0B' : 'rgba(240,237,232,0.15)', fontSize: '14px' }}>★</span>
))

function QuoteCard({ item, accent }: { item: SectionItem; accent: string }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(240,237,232,0.07)', borderRadius: '20px', padding: '32px', display: 'flex', flexDirection: 'column', gap: '20px', height: '100%' }}>
      <div style={{ fontSize: '32px', color: accent, lineHeight: 1, fontWeight: 900, opacity: 0.5 }}>"</div>
      <p style={{ fontSize: '16px', lineHeight: 1.75, color: 'rgba(240,237,232,0.85)', margin: 0, flex: 1 }}>{item.quote}</p>
      {item.rating && <div style={{ display: 'flex', gap: '2px' }}>{STARS(item.rating)}</div>}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        {item.photo_url
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={item.photo_url} alt={item.author ?? ''} style={{ width: '44px', height: '44px', borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: `2px solid ${accent}44` }} />
          : <div style={{ width: '44px', height: '44px', borderRadius: '50%', background: accent + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', fontWeight: 900, color: accent, flexShrink: 0 }}>
              {(item.author ?? '?')[0]}
            </div>
        }
        <div>
          <div style={{ fontSize: '14px', fontWeight: 800, color: 'rgba(240,237,232,0.95)' }}>{item.author}</div>
          {(item.role || item.company) && (
            <div style={{ fontSize: '12px', color: 'rgba(240,237,232,0.45)' }}>
              {[item.role, item.company].filter(Boolean).join(', ')}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function TestimonialsSection({
  items, layout = 'grid', accent, title, customTitle, visibleCount,
}: {
  items: SectionItem[]
  layout?: string
  accent: string
  title?: string | null
  customTitle?: string | null
  visibleCount?: number | null
}) {
  const [active, setActive] = useState(0)

  // For carousel: visible = visibleCount (1/2/3), default 1
  const carouselVisible = layout === 'carousel' ? (visibleCount ?? 1) : 1
  // For grid: columns = visibleCount (3/4/6), default 3
  const gridCols = layout === 'grid' ? (visibleCount ?? 3) : 3

  const next = useCallback(() => {
    setActive(a => (a + carouselVisible) % items.length)
  }, [items.length, carouselVisible])
  const prev = useCallback(() => {
    setActive(a => (a - carouselVisible + items.length) % items.length)
  }, [items.length, carouselVisible])

  // Auto-advance carousel
  useEffect(() => {
    if (layout !== 'carousel' || items.length <= carouselVisible) return
    const id = setInterval(next, 5000)
    return () => clearInterval(id)
  }, [layout, items.length, carouselVisible, next])

  if (items.length === 0) return null

  const heading = customTitle || title || 'What People Say'

  if (layout === 'carousel') {
    // Show `carouselVisible` cards at a time
    const visible = Array.from({ length: carouselVisible }, (_, i) => items[(active + i) % items.length])
    const totalSlides = Math.ceil(items.length / carouselVisible)
    const currentSlide = Math.floor(active / carouselVisible)

    return (
      <div>
        {heading && <h2 style={{ fontSize: 'clamp(28px,3.5vw,44px)', fontWeight: 900, letterSpacing: '-0.03em', margin: '0 0 48px', textAlign: 'center' }}>{heading}</h2>}
        <div style={{ position: 'relative' }}>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${carouselVisible}, 1fr)`, gap: '20px' }}>
            {visible.map((item, i) => <QuoteCard key={`${item.id}-${i}`} item={item} accent={accent} />)}
          </div>
          {items.length > carouselVisible && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '16px', marginTop: '28px' }}>
              <button onClick={prev} style={{ width: '36px', height: '36px', borderRadius: '50%', border: '1px solid rgba(240,237,232,0.15)', background: 'transparent', color: 'rgba(240,237,232,0.5)', fontSize: '16px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>‹</button>
              <div style={{ display: 'flex', gap: '8px' }}>
                {Array.from({ length: totalSlides }, (_, i) => (
                  <button key={i} onClick={() => setActive(i * carouselVisible)}
                    style={{ width: i === currentSlide ? '24px' : '8px', height: '8px', borderRadius: '4px', border: 'none', background: i === currentSlide ? accent : 'rgba(240,237,232,0.2)', cursor: 'pointer', transition: 'all 0.3s', padding: 0 }} />
                ))}
              </div>
              <button onClick={next} style={{ width: '36px', height: '36px', borderRadius: '50%', border: '1px solid rgba(240,237,232,0.15)', background: 'transparent', color: 'rgba(240,237,232,0.5)', fontSize: '16px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>›</button>
            </div>
          )}
        </div>
      </div>
    )
  }

  if (layout === 'wall') return (
    <div>
      {heading && <h2 style={{ fontSize: 'clamp(28px,3.5vw,44px)', fontWeight: 900, letterSpacing: '-0.03em', margin: '0 0 48px', textAlign: 'center' }}>{heading}</h2>}
      <div style={{ columns: '2 320px', columnGap: '20px' }}>
        {items.map(item => (
          <div key={item.id} style={{ breakInside: 'avoid', marginBottom: '20px' }}>
            <QuoteCard item={item} accent={accent} />
          </div>
        ))}
      </div>
    </div>
  )

  // grid — respect column count
  const minW = gridCols >= 6 ? '200px' : gridCols >= 4 ? '240px' : '300px'
  return (
    <div>
      {heading && <h2 style={{ fontSize: 'clamp(28px,3.5vw,44px)', fontWeight: 900, letterSpacing: '-0.03em', margin: '0 0 48px', textAlign: 'center' }}>{heading}</h2>}
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${gridCols}, minmax(${minW}, 1fr))`, gap: '20px' }}>
        {items.map(item => <QuoteCard key={item.id} item={item} accent={accent} />)}
      </div>
    </div>
  )
}
