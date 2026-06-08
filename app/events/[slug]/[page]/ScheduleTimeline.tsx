'use client'

import { useState } from 'react'

type AgendaItem = {
  id: string; day: number; time_slot: string | null; title: string
  description: string | null; speaker_name: string | null; type: string; track: string | null
}

const TYPE_COLORS: Record<string, string> = {
  keynote: '#E07B2C', panel: '#00B4B0', workshop: '#A78BFA',
  fireside: '#F59E0B', networking: '#22C55E', break: '#64748B',
}

export default function ScheduleTimeline({
  agByDay, accent, layout = 'timeline',
}: {
  agByDay: Record<string, AgendaItem[]>
  accent: string
  layout?: string
}) {
  const days = Object.keys(agByDay).sort()
  const [activeDay, setActiveDay] = useState(days[0] ?? '1')
  const items = agByDay[activeDay] ?? []

  if (days.length === 0) return <p style={{ color: 'rgba(240,237,232,0.4)', fontSize: '14px' }}>Schedule coming soon.</p>

  return (
    <div>
      {/* Day selector */}
      {days.length > 1 && (
        <div style={{ display: 'flex', gap: '8px', marginBottom: '40px' }}>
          {days.map(d => (
            <button key={d} onClick={() => setActiveDay(d)}
              style={{ padding: '8px 22px', borderRadius: '8px', cursor: 'pointer', fontFamily: 'inherit', border: `1px solid ${activeDay===d?accent+'66':'rgba(240,237,232,0.12)'}`, background: activeDay===d?accent+'18':'transparent', color: activeDay===d?accent:'rgba(240,237,232,0.5)', fontSize: '13px', fontWeight: activeDay===d?700:500, transition: 'all 0.15s' }}>
              Day {d}
            </button>
          ))}
        </div>
      )}

      {layout === 'compact' ? (
        <div style={{ display: 'grid', gap: '8px' }}>
          {items.map(ag => (
            <div key={ag.id} style={{ display: 'flex', gap: '20px', alignItems: 'center', padding: '14px 20px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(240,237,232,0.05)', borderRadius: '10px' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: accent, width: '90px', flexShrink: 0 }}>{ag.time_slot ?? ''}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '14px', fontWeight: 600, color: 'rgba(240,237,232,0.9)' }}>{ag.title}</div>
                {ag.speaker_name && <div style={{ fontSize: '12px', color: 'rgba(240,237,232,0.4)', marginTop: '2px' }}>{ag.speaker_name}</div>}
              </div>
              {ag.type !== 'session' && ag.type !== 'other' && (
                <div style={{ fontSize: '10px', fontWeight: 700, padding: '3px 10px', borderRadius: '20px', background: (TYPE_COLORS[ag.type] ?? accent) + '20', color: TYPE_COLORS[ag.type] ?? accent, textTransform: 'uppercase', letterSpacing: '0.08em', flexShrink: 0 }}>
                  {ag.type}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        /* timeline layout */
        <div style={{ position: 'relative', paddingLeft: '32px' }}>
          {/* vertical line */}
          <div style={{ position: 'absolute', left: '10px', top: 0, bottom: 0, width: '2px', background: 'rgba(240,237,232,0.06)' }} />
          {items.map((ag, i) => (
            <div key={ag.id} style={{ position: 'relative', marginBottom: i === items.length - 1 ? 0 : '28px' }}>
              {/* dot */}
              <div style={{ position: 'absolute', left: '-28px', top: '6px', width: '16px', height: '16px', borderRadius: '50%', background: TYPE_COLORS[ag.type] ?? accent, border: '3px solid rgba(8,18,29,1)', flexShrink: 0 }} />
              <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(240,237,232,0.06)', borderRadius: '14px', padding: '20px 24px' }}>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', marginBottom: '8px' }}>
                  {ag.time_slot && <span style={{ fontSize: '12px', fontWeight: 700, color: accent, flexShrink: 0, paddingTop: '2px' }}>{ag.time_slot}</span>}
                  <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'rgba(240,237,232,0.95)', margin: 0 }}>{ag.title}</h3>
                </div>
                {ag.speaker_name && <div style={{ fontSize: '13px', color: 'rgba(240,237,232,0.5)', marginBottom: '6px' }}>{ag.speaker_name}</div>}
                {ag.description  && <div style={{ fontSize: '13px', color: 'rgba(240,237,232,0.4)', lineHeight: 1.6 }}>{ag.description}</div>}
                <div style={{ display: 'flex', gap: '6px', marginTop: '10px' }}>
                  {ag.type !== 'session' && ag.type !== 'other' && (
                    <span style={{ fontSize: '10px', fontWeight: 700, padding: '3px 10px', borderRadius: '20px', background: (TYPE_COLORS[ag.type]??accent)+'20', color: TYPE_COLORS[ag.type]??accent, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{ag.type}</span>
                  )}
                  {ag.track && <span style={{ fontSize: '10px', fontWeight: 700, padding: '3px 10px', borderRadius: '20px', border: '1px solid rgba(240,237,232,0.1)', color: 'rgba(240,237,232,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{ag.track}</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
