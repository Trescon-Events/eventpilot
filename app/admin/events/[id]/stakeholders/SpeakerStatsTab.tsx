'use client'

import { useEffect, useState } from 'react'
import { Card, Button } from '@/app/components/ui'
import { PLANNED_ROLES, WITHDRAWAL_REASONS, WITHDRAWAL_TIMING, type SpeakerStats } from '@/app/lib/speaker-lifecycle/model'

/* Speaker statistics (2026-11-10): the whole speaker lifecycle in one place — invited, confirmed, spoke, no-show, withdrew (with reasons and timing) and roles.
   Test, duplicate and mistaken records are excluded; deleted records not yet classified are reported, never guessed. */

type Payload = { event: { name: string; has_umbrella: boolean }; scope_events: number; stats: SpeakerStats }

function Stat({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <div title={hint} style={{ padding: '12px 14px', background: 'var(--surface)', border: '1px solid var(--border-light)', borderRadius: '10px', minWidth: 0 }}>
      <div style={{ fontSize: '24px', fontWeight: 900, color: 'var(--ink)', lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontSize: '12px', color: 'var(--ink3)', marginTop: '4px' }}>{label}</div>
    </div>
  )
}

function Breakdown({ title, rows }: { title: string; rows: [string, number][] }) {
  return (
    <Card padded>
      <div style={{ fontSize: '13.5px', fontWeight: 800, color: 'var(--ink)', marginBottom: '8px' }}>{title}</div>
      {rows.every(r => r[1] === 0) ? <div style={{ fontSize: '12.5px', color: 'var(--ink4)' }}>None recorded.</div> : rows.filter(r => r[1] > 0).map(([k, n]) => (
        <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', padding: '3px 0', color: 'var(--ink2)' }}><span>{k}</span><strong>{n}</strong></div>
      ))}
    </Card>
  )
}

export default function SpeakerStatsTab({ eventId, onOpenDeleted }: { eventId: string; onOpenDeleted: () => void }) {
  const [scope, setScope] = useState<'event' | 'umbrella'>('event')
  const [data, setData] = useState<Payload | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let gone = false
    fetch(`/api/events/stakeholders/speaker-lifecycle?event_id=${eventId}&scope=${scope}`).then(async r => {
      const d = await r.json().catch(() => ({}))
      if (gone) return
      if (!r.ok) { setError(d.error || 'Could not load.'); setData(null) } else { setError(null); setData(d) }
    }).catch(() => { if (!gone) setError('Could not load.') })
    return () => { gone = true }
  }, [eventId, scope])

  if (error) return <div style={{ color: 'var(--red)', fontSize: '13px' }}>{error}</div>
  if (!data) return <div style={{ color: 'var(--ink3)', fontSize: '13px' }}>Loading…</div>
  const s = data.stats

  function downloadCsv() {
    const lines: string[][] = [['Measure', 'Count'],
      ['Invited', String(s.invited)], ['Invites answered', String(s.invites_answered)], ['Took part (confirmed, spoke or no-show)', String(s.took_part)],
      ['Confirmed now', String(s.confirmed_now)], ['Spoke', String(s.spoke)], ['No-show', String(s.no_show)], ['Withdrew', String(s.withdrew)], ['On hold', String(s.on_hold)],
      ...WITHDRAWAL_REASONS.map(r => [`Withdrew: ${r.label}`, String(s.withdrawal_reasons[r.key] ?? 0)]),
      ['Withdrew: reason not recorded', String(s.withdrawal_reasons.not_recorded ?? 0)],
      ...WITHDRAWAL_TIMING.map(t => [`Withdrew: ${t}`, String(s.withdrawal_timing[t] ?? 0)]),
      ...PLANNED_ROLES.map(r => [`Role: ${r.label}`, String(s.roles[r.key] ?? 0)]),
      ['Role not set', String(s.role_not_set)], ['Dual role', String(s.dual_role)],
      ['Deleted: test, duplicate or mistake (not counted)', String(s.deleted_classified)], ['Deleted: not yet classified', String(s.deleted_unclassified)]]
    const csv = lines.map(r => r.map(c => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = `speaker-stats-${scope}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <div style={{ display: 'grid', gap: '14px', maxWidth: '980px' }}>
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between' }}>
        <div style={{ fontSize: '20px', fontWeight: 900, color: 'var(--ink)' }}>Speaker statistics</div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {data.event.has_umbrella && (
            <Button variant="ghost" onClick={() => setScope(scope === 'event' ? 'umbrella' : 'event')}>
              {scope === 'event' ? 'Show the whole series' : `Showing ${data.scope_events} events: back to this event`}
            </Button>
          )}
          <Button variant="ghost" onClick={downloadCsv}>Download CSV</Button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px' }}>
        <Stat label="Invited" value={s.invited} hint="People sent a speaker invite from EventPilot" />
        <Stat label="Invite answered" value={s.invites_answered} hint="Invited people who submitted the form" />
        <Stat label="Took part" value={s.took_part} hint="Confirmed, spoke or no-show" />
        <Stat label="Confirmed now" value={s.confirmed_now} />
        <Stat label="Spoke" value={s.spoke} />
        <Stat label="No-show" value={s.no_show} />
        <Stat label="Withdrew" value={s.withdrew} />
        <Stat label="On hold" value={s.on_hold} />
      </div>
      <div style={{ fontSize: '12px', color: 'var(--ink4)' }}>
        {s.status_not_set > 0 ? `${s.status_not_set} speaker${s.status_not_set === 1 ? ' has' : 's have'} no status set. ` : ''}
        Invites are counted from the invites sent through EventPilot; people invited another way are not in &quot;Invited&quot;.
      </div>

      {s.deleted_unclassified > 0 && (
        <div style={{ padding: '12px 14px', background: 'var(--amber-light)', border: '1px solid var(--amber)', borderRadius: '10px', fontSize: '13px', color: 'var(--ink)', display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <span><strong>{s.deleted_unclassified}</strong> deleted record{s.deleted_unclassified === 1 ? ' has' : 's have'} not been classified, so {s.deleted_unclassified === 1 ? 'it is' : 'they are'} not in these numbers. Some of them probably withdrew.</span>
          <Button variant="teal" onClick={onOpenDeleted}>Classify them</Button>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '14px' }}>
        <Breakdown title="Roles (speakers who took part)" rows={[...PLANNED_ROLES.map(r => [r.label, s.roles[r.key] ?? 0] as [string, number]), ['Dual role (two or more)', s.dual_role], ['Role not set', s.role_not_set]]} />
        <Breakdown title="Why speakers withdrew" rows={[...WITHDRAWAL_REASONS.map(r => [r.label.replace(' (note required)', ''), s.withdrawal_reasons[r.key] ?? 0] as [string, number]), ['Reason not recorded', s.withdrawal_reasons.not_recorded ?? 0]]} />
        <Breakdown title="When they withdrew" rows={WITHDRAWAL_TIMING.map(t => [t, s.withdrawal_timing[t] ?? 0] as [string, number])} />
      </div>
      <div style={{ fontSize: '12px', color: 'var(--ink4)' }}>{s.deleted_classified} test, duplicate or mistaken record{s.deleted_classified === 1 ? ' is' : 's are'} excluded from every number above.</div>
    </div>
  )
}
