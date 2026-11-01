'use client'

import Link from 'next/link'
import { Badge, Card } from '@/app/components/ui'
import type { SpeakerSession } from '@/app/lib/stakeholders/speaker-sessions'

/* Sessions tab — what this speaker is on, read from the Agenda (assignments are changed there, not here). */

export type SessionsInfo = { sessions: SpeakerSession[]; clashes: [string, string][] }

const day = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })

export default function SessionsTab({ eventId, info, error }: { eventId: string; info: SessionsInfo | null; error: string | null }) {
  if (error) return <div style={{ maxWidth: '1240px', margin: '0 auto', padding: '24px 32px', color: 'var(--red)' }}>{error}</div>
  if (!info) return <div style={{ maxWidth: '1240px', margin: '0 auto', padding: '24px 32px', color: 'var(--ink3)' }}>Loading sessions…</div>
  const clash = new Set(info.clashes.flat())
  return (
    <div style={{ maxWidth: '1240px', margin: '0 auto', padding: '24px 32px', display: 'grid', gap: '14px' }}>
      {info.clashes.length > 0 && (
        <Card color="red" padded><strong>Time clash.</strong> {info.clashes.map(([a, b]) => { const x = info.sessions.find(s => s.id === a)!, y = info.sessions.find(s => s.id === b)!; return `“${x.title}” (${x.startHM}–${x.endHM}) overlaps “${y.title}” (${y.startHM}–${y.endHM}) on ${day(x.date)}` }).join('; ')}.</Card>
      )}
      {info.sessions.length === 0 ? (
        <Card padded><strong>Not on any session yet.</strong> <span style={{ color: 'var(--ink3)' }}>Add them to a session in the <Link href={`/admin/events/${eventId}/agenda`} style={{ color: 'var(--teal-mid)', fontWeight: 700 }}>Agenda</Link>.</span></Card>
      ) : (
        <div style={{ display: 'grid', gap: '8px' }}>
          {info.sessions.map(s => (
            <div key={s.id} style={{ display: 'grid', gridTemplateColumns: '120px 90px minmax(0, 1fr) auto', gap: '14px', alignItems: 'center', padding: '12px 16px', background: 'var(--card)', border: `1px solid ${clash.has(s.id) ? 'var(--red)' : 'var(--border)'}`, borderRadius: '12px' }}>
              <div><div style={{ fontWeight: 800 }}>{day(s.date)}</div><div style={{ color: 'var(--ink3)', fontSize: '13px' }}>{s.startHM}–{s.endHM}</div></div>
              <div style={{ fontSize: '13px', color: 'var(--ink2)', fontWeight: 700 }}>{s.stage ?? '—'}</div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700 }}>{s.title}</div>
                <div style={{ color: 'var(--ink3)', fontSize: '12.5px' }}>{[s.format, s.role].filter(Boolean).join(' · ')}</div>
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <Badge color={s.status === 'published' ? 'teal' : 'amber'}>{s.status === 'published' ? 'Published' : 'Draft'}</Badge>
                <Link href={`/admin/events/${eventId}/agenda`} style={{ color: 'var(--teal-mid)', fontWeight: 700, fontSize: '13px', whiteSpace: 'nowrap' }}>Open in Agenda</Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
