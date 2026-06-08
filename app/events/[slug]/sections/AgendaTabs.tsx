'use client'

import { useState } from 'react'

type AgendaItem = {
  id: string; day: number; time_slot: string | null; title: string
  description: string | null; speaker_name: string | null; type: string; track: string | null
}

export default function AgendaTabs({
  agByDay, accent, teal,
}: {
  agByDay: Record<string, AgendaItem[]>
  accent: string
  teal: string
}) {
  const days = Object.keys(agByDay).sort()
  const [activeDay, setActiveDay] = useState(days[0] ?? '1')

  if (days.length === 0) return (
    <p style={{ color: 'rgba(240,237,232,0.4)', fontSize: '14px' }}>Agenda coming soon.</p>
  )

  const items = agByDay[activeDay] ?? []

  return (
    <div>
      {/* Day tabs */}
      {days.length > 1 && (
        <div style={{ display: 'flex', gap: '8px', marginBottom: '32px', flexWrap: 'wrap' }}>
          {days.map(d => (
            <button key={d} onClick={() => setActiveDay(d)}
              style={{
                padding: '8px 22px', borderRadius: '8px', cursor: 'pointer', fontFamily: 'inherit',
                border: `1px solid ${activeDay === d ? accent + '66' : 'rgba(240,237,232,0.12)'}`,
                background: activeDay === d ? accent + '18' : 'transparent',
                color: activeDay === d ? accent : 'rgba(240,237,232,0.5)',
                fontSize: '13px', fontWeight: activeDay === d ? 700 : 500,
                transition: 'all 0.15s',
              }}>
              Day {d}
            </button>
          ))}
        </div>
      )}

      {/* Sessions for active day */}
      {items.map(ag => (
        <div key={ag.id} style={{ display: 'flex', gap: '24px', padding: '20px 0', borderBottom: '1px solid rgba(240,237,232,0.05)', alignItems: 'flex-start' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, color: accent, width: '110px', flexShrink: 0, paddingTop: '3px' }}>
            {ag.time_slot ?? ''}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '15px', fontWeight: 700, color: 'rgba(240,237,232,0.95)', marginBottom: '4px' }}>{ag.title}</div>
            {ag.speaker_name && (
              <div style={{ fontSize: '13px', color: 'rgba(240,237,232,0.5)', marginBottom: '4px' }}>{ag.speaker_name}</div>
            )}
            {ag.description && (
              <div style={{ fontSize: '13px', color: 'rgba(240,237,232,0.4)', lineHeight: 1.6 }}>{ag.description}</div>
            )}
            <div style={{ marginTop: '8px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {ag.type !== 'session' && ag.type !== 'other' && (
                <span style={{ display: 'inline-block', fontSize: '10px', fontWeight: 700, letterSpacing: '0.08em', padding: '3px 10px', borderRadius: '20px', border: `1px solid ${accent}44`, color: accent, textTransform: 'uppercase' }}>
                  {ag.type}
                </span>
              )}
              {ag.track && (
                <span style={{ display: 'inline-block', fontSize: '10px', fontWeight: 700, letterSpacing: '0.08em', padding: '3px 10px', borderRadius: '20px', border: '1px solid rgba(240,237,232,0.1)', color: 'rgba(240,237,232,0.4)', textTransform: 'uppercase' }}>
                  {ag.track}
                </span>
              )}
            </div>
          </div>
        </div>
      ))}

      {items.length === 0 && (
        <p style={{ color: 'rgba(240,237,232,0.3)', fontSize: '14px' }}>No sessions for Day {activeDay} yet.</p>
      )}
    </div>
  )
}
