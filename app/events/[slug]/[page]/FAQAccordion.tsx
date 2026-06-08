'use client'

import { useState } from 'react'
import type { SectionItem } from '@/app/lib/event-page-types'

export default function FAQAccordion({
  items, layout = 'accordion', accent, customTitle,
}: {
  items: SectionItem[]
  layout?: string
  accent: string
  customTitle?: string | null
}) {
  const [open, setOpen] = useState<string | null>(null)

  if (items.length === 0) return null

  const heading = customTitle || 'Frequently Asked Questions'

  if (layout === 'two_col') return (
    <div>
      <h2 style={{ fontSize: 'clamp(28px,3.5vw,44px)', fontWeight: 900, letterSpacing: '-0.03em', margin: '0 0 48px' }}>{heading}</h2>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px 48px' }}>
        {items.map(item => (
          <div key={item.id} style={{ borderTop: '1px solid rgba(240,237,232,0.08)', paddingTop: '24px' }}>
            <div style={{ fontSize: '16px', fontWeight: 700, color: 'rgba(240,237,232,0.95)', marginBottom: '12px' }}>{item.question}</div>
            <div style={{ fontSize: '15px', lineHeight: 1.7, color: 'rgba(240,237,232,0.55)' }}>{item.answer}</div>
          </div>
        ))}
      </div>
    </div>
  )

  // accordion
  return (
    <div>
      <h2 style={{ fontSize: 'clamp(28px,3.5vw,44px)', fontWeight: 900, letterSpacing: '-0.03em', margin: '0 0 48px' }}>{heading}</h2>
      <div style={{ maxWidth: '800px' }}>
        {items.map(item => {
          const isOpen = open === item.id
          return (
            <div key={item.id} style={{ borderBottom: '1px solid rgba(240,237,232,0.08)' }}>
              <button
                onClick={() => setOpen(isOpen ? null : item.id)}
                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 0', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', gap: '16px' }}>
                <span style={{ fontSize: '16px', fontWeight: 600, color: isOpen ? accent : 'rgba(240,237,232,0.9)', transition: 'color 0.15s' }}>{item.question}</span>
                <span style={{ fontSize: '20px', color: isOpen ? accent : 'rgba(240,237,232,0.3)', transition: 'all 0.2s', transform: isOpen ? 'rotate(45deg)' : 'none', flexShrink: 0, lineHeight: 1 }}>+</span>
              </button>
              {isOpen && (
                <div style={{ paddingBottom: '20px', fontSize: '15px', lineHeight: 1.75, color: 'rgba(240,237,232,0.55)' }}>
                  {item.answer}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
