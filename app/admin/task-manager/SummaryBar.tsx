'use client'
import StatCard from '@/app/components/ui/StatCard'
import { Avatar } from './ui'

export type AssigneeCounts = Record<string, { name: string; total: number; not_started: number; in_progress: number; completed: number }>

const BREAKDOWN: Array<{ key: 'not_started' | 'in_progress' | 'completed'; label: string; dot: string }> = [
  { key: 'not_started', label: 'Not started', dot: 'var(--ink3)' },
  { key: 'in_progress', label: 'In progress', dot: 'var(--purple)' },
  { key: 'completed', label: 'Done', dot: 'var(--teal)' },
]

export default function SummaryBar({ counts }: { counts: AssigneeCounts }) {
  const rows = Object.values(counts).sort((a, b) => b.total - a.total)
  if (rows.length === 0) return null

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '12px', marginBottom: '18px' }}>
      {rows.map(r => (
        <StatCard key={r.name} color="indigo">
          <div style={{ padding: '16px 18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <Avatar name={r.name} size={22} />
              <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink2)' }}>{r.name}</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginBottom: '12px' }}>
              <span style={{ fontSize: '28px', fontWeight: 800, color: 'var(--ink)', lineHeight: 1 }}>{r.total}</span>
              <span style={{ fontSize: '12px', color: 'var(--ink4)' }}>{r.total === 1 ? 'task' : 'tasks'}</span>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
              {BREAKDOWN.map(b => (
                <div key={b.key} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: b.dot, flexShrink: 0 }} />
                  <span style={{ fontSize: '11px', color: 'var(--ink4)' }}>{r[b.key]} {b.label}</span>
                </div>
              ))}
            </div>
          </div>
        </StatCard>
      ))}
    </div>
  )
}
