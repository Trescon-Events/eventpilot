'use client'

import { useState } from 'react'

type Sponsor = {
  id: string; name: string; tier: string; logo_url: string | null; website_url: string | null
}

// Ordered from highest to lowest
const TIER_ORDER = ['platinum', 'gold', 'silver', 'bronze', 'media', 'association', 'government', 'startup']
const TIER_LABELS: Record<string, string> = {
  platinum:    'Platinum',
  gold:        'Gold',
  silver:      'Silver',
  bronze:      'Bronze',
  media:       'Media Partner',
  association: 'Association',
  government:  'Government',
  startup:     'Startup',
}

// Size of logo cards by tier (bigger = higher tier)
const TIER_CARD_HEIGHT: Record<string, number> = {
  platinum: 80, gold: 64, silver: 52, bronze: 44,
  media: 44, association: 44, government: 44, startup: 36,
}
const TIER_CARD_MIN_WIDTH: Record<string, number> = {
  platinum: 220, gold: 180, silver: 150, bronze: 130,
  media: 130, association: 130, government: 130, startup: 120,
}

export default function PartnerTabs({
  sponsors, accent, showWebsite,
}: {
  sponsors: Sponsor[]
  accent: string
  showWebsite?: boolean
}) {
  const tiersPresent = TIER_ORDER.filter(t => sponsors.some(s => s.tier === t))
  const [activeTab, setActiveTab] = useState<'all' | string>('all')

  const sponsorsInView = activeTab === 'all'
    ? sponsors
    : sponsors.filter(s => s.tier === activeTab)

  // Group into tiers for display
  const grouped = TIER_ORDER.reduce<Record<string, Sponsor[]>>((acc, t) => {
    const list = sponsorsInView.filter(s => s.tier === t)
    if (list.length > 0) acc[t] = list
    return acc
  }, {})

  if (sponsors.length === 0) return (
    <p style={{ color: 'rgba(240,237,232,0.4)', fontSize: '14px' }}>Partner announcements coming soon.</p>
  )

  return (
    <div>
      {/* Tier filter tabs */}
      {tiersPresent.length > 1 && (
        <div style={{ display: 'flex', gap: '8px', marginBottom: '40px', flexWrap: 'wrap' }}>
          {(['all', ...tiersPresent] as string[]).map(t => (
            <button key={t} onClick={() => setActiveTab(t)}
              style={{
                padding: '7px 20px', borderRadius: '8px', cursor: 'pointer', fontFamily: 'inherit',
                border: `1px solid ${activeTab === t ? accent + '66' : 'rgba(240,237,232,0.12)'}`,
                background: activeTab === t ? accent + '18' : 'transparent',
                color: activeTab === t ? accent : 'rgba(240,237,232,0.5)',
                fontSize: '13px', fontWeight: activeTab === t ? 700 : 500,
                transition: 'all 0.15s',
              }}>
              {t === 'all' ? 'All Partners' : TIER_LABELS[t] ?? t}
              <span style={{ fontSize: '10px', marginLeft: '6px', opacity: 0.6 }}>
                {t === 'all' ? sponsors.length : sponsors.filter(s => s.tier === t).length}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Tier groups (highest tier at top, biggest cards) */}
      {Object.entries(grouped).map(([tier, list]) => (
        <div key={tier} style={{ marginBottom: '48px' }}>
          {/* Tier label — show when all tiers visible */}
          {(activeTab === 'all' || tiersPresent.length === 1) && (
            <div style={{ fontSize: '10px', fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(240,237,232,0.3)', marginBottom: '20px' }}>
              {TIER_LABELS[tier]} Partner{list.length > 1 ? 's' : ''}
            </div>
          )}
          {/* Logo wall — platinum spans wider, gold smaller, etc. */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', justifyContent: tier === 'platinum' ? 'center' : 'flex-start' }}>
            {list.map(sp => {
              const h = TIER_CARD_HEIGHT[tier] ?? 44
              const minW = TIER_CARD_MIN_WIDTH[tier] ?? 130
              const inner = (
                <div key={sp.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '18px 28px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(240,237,232,0.07)', borderRadius: '12px', minWidth: `${minW}px`, transition: 'border-color 0.2s' }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(240,237,232,0.18)')}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(240,237,232,0.07)')}>
                  {sp.logo_url
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={sp.logo_url} alt={sp.name} style={{ maxHeight: `${h}px`, maxWidth: `${minW - 32}px`, objectFit: 'contain', opacity: 0.85, filter: 'brightness(0) invert(1)', transition: 'opacity 0.15s, filter 0.15s' }}
                        onMouseEnter={e => { (e.currentTarget as HTMLImageElement).style.opacity = '1'; (e.currentTarget as HTMLImageElement).style.filter = 'none' }}
                        onMouseLeave={e => { (e.currentTarget as HTMLImageElement).style.opacity = '0.85'; (e.currentTarget as HTMLImageElement).style.filter = 'brightness(0) invert(1)' }} />
                    : <span style={{ fontSize: '13px', fontWeight: 700, color: 'rgba(240,237,232,0.6)' }}>{sp.name}</span>
                  }
                </div>
              )
              return showWebsite && sp.website_url
                ? <a key={sp.id} href={sp.website_url} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>{inner}</a>
                : <div key={sp.id}>{inner}</div>
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
