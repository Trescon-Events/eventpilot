'use client'

type Sponsor = { id: string; name: string; logo_url: string | null; website_url: string | null }

export default function LogoTicker({
  sponsors, layout = 'marquee', accent,
}: {
  sponsors: Sponsor[]
  layout?: string
  accent: string
}) {
  if (sponsors.length === 0) return null

  const logoCard = (sp: Sponsor) => (
    <div key={sp.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '14px 24px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(240,237,232,0.06)', borderRadius: '10px', minWidth: '130px', flexShrink: 0 }}>
      {sp.logo_url
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={sp.logo_url} alt={sp.name} style={{ maxHeight: '40px', maxWidth: '120px', objectFit: 'contain', filter: 'brightness(0) invert(0.8)', opacity: 0.7 }} />
        : <span style={{ fontSize: '12px', fontWeight: 700, color: 'rgba(240,237,232,0.4)', whiteSpace: 'nowrap' }}>{sp.name}</span>
      }
    </div>
  )

  if (layout === 'grid') return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', justifyContent: 'center' }}>
      {sponsors.map(sp => logoCard(sp))}
    </div>
  )

  // marquee — duplicate list for seamless loop
  const doubled = [...sponsors, ...sponsors]
  return (
    <>
      <style>{`
        @keyframes ev-ticker { from { transform: translateX(0) } to { transform: translateX(-50%) } }
        .ev-ticker-track { display: flex; gap: 12px; animation: ev-ticker 30s linear infinite; width: max-content; }
        .ev-ticker-track:hover { animation-play-state: paused; }
      `}</style>
      <div style={{ overflow: 'hidden', position: 'relative' }}>
        {/* fade edges */}
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '80px', background: 'linear-gradient(to right, var(--ev-bg, #08121D), transparent)', zIndex: 2, pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: '80px', background: 'linear-gradient(to left, var(--ev-bg, #08121D), transparent)', zIndex: 2, pointerEvents: 'none' }} />
        <div className="ev-ticker-track">
          {doubled.map((sp, i) => (
            <div key={`${sp.id}-${i}`}>
              {sp.website_url
                ? <a href={sp.website_url} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>{logoCard(sp)}</a>
                : logoCard(sp)
              }
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
