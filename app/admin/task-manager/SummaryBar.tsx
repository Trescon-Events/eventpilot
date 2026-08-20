'use client'
import StatCard from '@/app/components/ui/StatCard'
import { Avatar } from './ui'

export type AssigneeCounts = Record<string, { name: string; total: number; not_started: number; in_progress: number; completed: number }>

const BREAKDOWN: Array<{ key: 'not_started' | 'in_progress' | 'completed'; label: string; dot: string }> = [
  { key: 'not_started', label: 'Not started', dot: 'var(--ink3)' },
  { key: 'in_progress', label: 'In progress', dot: 'var(--purple)' },
  { key: 'completed', label: 'Done', dot: 'var(--teal)' },
]

interface Props {
  counts: AssigneeCounts
  selectedStaffId?: string | null
  onSelectStaff?: (staffId: string | null) => void
}

export default function SummaryBar({ counts, selectedStaffId, onSelectStaff }: Props) {
  const entries = Object.entries(counts).sort(([, a], [, b]) => b.total - a.total)
  if (entries.length === 0) return null

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '12px', marginBottom: '18px' }}>
      {entries.map(([staffId, r]) => {
        const isSelected = selectedStaffId === staffId
        const donePercent = r.total > 0 ? (r.completed / r.total) * 100 : 0
        const inProgressPercent = r.total > 0 ? (r.in_progress / r.total) * 100 : 0
        const notStartedPercent = r.total > 0 ? (r.not_started / r.total) * 100 : 0

        return (
          <div
            key={staffId}
            onClick={() => onSelectStaff && onSelectStaff(isSelected ? null : staffId)}
            style={{
              cursor: onSelectStaff ? 'pointer' : 'default',
              borderRadius: '12px',
              transition: 'all 0.15s ease',
              outline: isSelected ? '2px solid var(--teal-mid)' : 'none',
              transform: isSelected ? 'translateY(-2px)' : 'none',
            }}
          >
            <StatCard color="indigo">
              <div style={{ padding: '16px 18px', position: 'relative' }}>
                {isSelected && (
                  <div style={{
                    position: 'absolute',
                    top: '12px',
                    right: '12px',
                    fontSize: '10px',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    color: 'var(--teal-mid)',
                    background: 'var(--border-light)',
                    padding: '2px 6px',
                    borderRadius: '4px',
                  }}>
                    Filtered
                  </div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                  <Avatar name={r.name} size={22} />
                  <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink2)' }}>{r.name}</span>
                </div>

                <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginBottom: '8px' }}>
                  <span style={{ fontSize: '28px', fontWeight: 800, color: 'var(--ink)', lineHeight: 1 }}>{r.total}</span>
                  <span style={{ fontSize: '12px', color: 'var(--ink4)' }}>{r.total === 1 ? 'task' : 'tasks'}</span>
                </div>

                {/* Segmented Mini Progress bar */}
                <div style={{
                  height: '4px',
                  width: '100%',
                  borderRadius: '2px',
                  background: 'var(--border-light)',
                  display: 'flex',
                  overflow: 'hidden',
                  marginBottom: '12px',
                }}>
                  <div style={{ width: `${donePercent}%`, background: 'var(--teal)', height: '100%' }} title={`Done: ${r.completed}`} />
                  <div style={{ width: `${inProgressPercent}%`, background: 'var(--purple)', height: '100%' }} title={`In Progress: ${r.in_progress}`} />
                  <div style={{ width: `${notStartedPercent}%`, background: 'var(--ink4)', height: '100%' }} title={`Not Started: ${r.not_started}`} />
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
          </div>
        )
      })}
    </div>
  )
}
