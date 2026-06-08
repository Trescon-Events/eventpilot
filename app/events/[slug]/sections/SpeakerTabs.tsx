'use client'

import { useState } from 'react'

type Speaker = {
  id: string; name: string; role: string | null; company: string | null; bio: string | null
  photo_url: string | null; linkedin_url: string | null; tier: string; session_title: string | null
}

const TIER_ORDER  = ['keynote', 'speaker', 'panelist', 'moderator']
const TIER_LABELS: Record<string, string> = {
  keynote:   'Keynote',
  speaker:   'Speakers',
  panelist:  'Panelists',
  moderator: 'Moderators',
}

export default function SpeakerTabs({
  speakers, accent, showBio, layout,
}: {
  speakers: Speaker[]
  accent: string
  showBio?: boolean
  layout?: string
}) {
  const tiersPresent = TIER_ORDER.filter(t => speakers.some(s => s.tier === t))
  const [activeTab, setActiveTab] = useState<'all' | string>(tiersPresent.length > 1 ? 'all' : tiersPresent[0] ?? 'all')

  const filtered = activeTab === 'all' ? speakers : speakers.filter(s => s.tier === activeTab)
  const isGrid   = layout !== 'list'

  if (speakers.length === 0) return (
    <p style={{ color: 'rgba(240,237,232,0.4)', fontSize: '14px' }}>Speaker announcements coming soon.</p>
  )

  return (
    <div>
      {/* Tier tabs — only show if multiple tiers */}
      {tiersPresent.length > 1 && (
        <div style={{ display: 'flex', gap: '8px', marginBottom: '36px', flexWrap: 'wrap' }}>
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
              {t === 'all' ? 'All Speakers' : TIER_LABELS[t] ?? t}
              <span style={{ fontSize: '10px', marginLeft: '6px', opacity: 0.6 }}>
                {t === 'all' ? speakers.length : speakers.filter(s => s.tier === t).length}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Speaker grid / list */}
      {isGrid ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px,1fr))', gap: '20px' }}>
          {filtered.map(sp => <SpeakerCard key={sp.id} sp={sp} accent={accent} showBio={showBio} layout="grid" />)}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {filtered.map(sp => <SpeakerCard key={sp.id} sp={sp} accent={accent} showBio={showBio} layout="list" />)}
        </div>
      )}

      {filtered.length === 0 && (
        <p style={{ color: 'rgba(240,237,232,0.3)', fontSize: '14px' }}>No speakers in this category yet.</p>
      )}
    </div>
  )
}

function SpeakerCard({ sp, accent, showBio, layout }: { sp: Speaker; accent: string; showBio?: boolean; layout: string }) {
  const isList = layout === 'list'
  return (
    <div style={{
      display: isList ? 'flex' : 'block', alignItems: isList ? 'center' : undefined,
      gap: isList ? '20px' : undefined, textAlign: isList ? 'left' : 'center',
      background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(240,237,232,0.06)',
      borderRadius: '16px', padding: isList ? '16px 24px' : '28px 20px',
      transition: 'border-color 0.2s',
    }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = accent + '44')}
      onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(240,237,232,0.06)')}>
      {sp.photo_url
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={sp.photo_url} alt={sp.name} style={{ width: '96px', height: '96px', borderRadius: '48px', objectFit: 'cover', display: 'block', border: `2px solid ${accent}`, flexShrink: 0, margin: isList ? 0 : '0 auto 16px' }} />
        : <div style={{ width: '96px', height: '96px', borderRadius: '48px', background: accent + '22', display: isList ? 'flex' : 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '32px', fontWeight: 900, color: accent, flexShrink: 0, margin: isList ? 0 : '0 auto 16px' }}>{sp.name[0]}</div>
      }
      <div>
        <div style={{ fontSize: '15px', fontWeight: 800, color: 'rgba(240,237,232,1)', marginBottom: '4px' }}>{sp.name}</div>
        {sp.role    && <div style={{ fontSize: '12px', color: accent, fontWeight: 600, marginBottom: '2px' }}>{sp.role}</div>}
        {sp.company && <div style={{ fontSize: '12px', color: 'rgba(240,237,232,0.45)' }}>{sp.company}</div>}
        {showBio && sp.bio && <div style={{ fontSize: '12px', color: 'rgba(240,237,232,0.4)', marginTop: '8px', lineHeight: 1.5 }}>{sp.bio}</div>}
        {sp.session_title && <div style={{ fontSize: '11px', color: 'rgba(240,237,232,0.35)', marginTop: '8px', lineHeight: 1.5, fontStyle: 'italic' }}>{sp.session_title}</div>}
        {sp.linkedin_url && (
          <a href={sp.linkedin_url} target="_blank" rel="noreferrer"
            style={{ display: 'inline-block', marginTop: '10px', fontSize: '11px', color: accent, fontWeight: 600 }}>LinkedIn →</a>
        )}
      </div>
    </div>
  )
}
