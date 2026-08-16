'use client'

import { useState, useEffect, use } from 'react'
import Link from 'next/link'
import PageHeader from '@/app/components/PageHeader'
import { Badge, Select } from '@/app/components/ui'
import type { AnnouncementStatus, StakeholderKind } from '../page'

/* Queue view (2026-08-16, Task #9 of the Postiz publishing plan) — every
   announcement across every speaker/partner for this event, in one
   filterable/sortable list. Deliberately Buffer's "Queue" tab shape (flat,
   filterable list), not a calendar grid — see the plan's "Scoped out of
   this pass" section for why the calendar view is a later pass. Reuses the
   existing GET /api/events/stakeholders/announcements route unchanged (it
   already attaches stakeholder_name server-side); each row deep-links back
   into the main creative-templates page via the ?type=&stakeholder=&
   announcement= params wired up there, so the actual action panel (send
   for approval / schedule / post now / retry) lives in exactly one place
   rather than being duplicated here. */

type QueueRow = {
  id: string
  stakeholder_type: StakeholderKind
  speaker_id: string | null
  partner_id: string | null
  stakeholder_name: string | null
  post_copy: string | null
  creative_url: string | null
  status: AnnouncementStatus
  created_at: string
  scheduled_for: string | null
  published_at: string | null
  postiz_channel_ids: string[] | null
}

const STATUS_OPTIONS: { value: AnnouncementStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All statuses' },
  { value: 'draft', label: 'Draft' },
  { value: 'pending_approval', label: 'Pending approval' },
  { value: 'approved', label: 'Approved' },
  { value: 'approved_with_comments', label: 'Approved w/ comments' },
  { value: 'changes_requested', label: 'Changes requested' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'published', label: 'Published' },
  { value: 'failed', label: 'Failed' },
]

function statusColor(s: AnnouncementStatus) {
  if (s === 'published' || s === 'approved' || s === 'approved_with_comments') return 'teal' as const
  if (s === 'failed' || s === 'changes_requested') return 'red' as const
  if (s === 'scheduled') return 'purple' as const
  return 'amber' as const
}

type SortMode = 'scheduled' | 'recent'

export default function AnnouncementQueuePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = use(params)

  const [rows, setRows] = useState<QueueRow[]>([])
  const [loading, setLoading] = useState(true)
  const [typeFilter, setTypeFilter] = useState<StakeholderKind | 'all'>('all')
  const [statusFilter, setStatusFilter] = useState<AnnouncementStatus | 'all'>('all')
  const [sortMode, setSortMode] = useState<SortMode>('scheduled')

  async function fetchAll() {
    setLoading(true)
    const res = await fetch(`/api/events/stakeholders/announcements?event_id=${eventId}`)
    const data = await res.json().catch(() => [])
    setRows(Array.isArray(data) ? data : [])
    setLoading(false)
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-mount, matches this module's other top-level fetchAll effects
  useEffect(() => { fetchAll() }, [eventId])

  const filtered = rows
    .filter(r => typeFilter === 'all' || r.stakeholder_type === typeFilter)
    .filter(r => statusFilter === 'all' || r.status === statusFilter)
    .sort((a, b) => {
      if (sortMode === 'recent') return b.created_at.localeCompare(a.created_at)
      // scheduled: soonest-first, undated rows (drafts) pushed to the end
      if (!a.scheduled_for && !b.scheduled_for) return b.created_at.localeCompare(a.created_at)
      if (!a.scheduled_for) return 1
      if (!b.scheduled_for) return -1
      return a.scheduled_for.localeCompare(b.scheduled_for)
    })

  return (
    <div style={{ minHeight: '100vh', background: 'var(--surface)' }}>
      <PageHeader
        eyebrow="Stakeholder Announcement Engine"
        title="Queue"
        description="Every announcement for this event, in one list — filter, sort, and jump to any post's action panel."
        backHref={`/admin/events/${eventId}/creative-templates`}
        backLabel="Back to Workspace"
      />

      <div style={{ padding: '24px 32px' }}>
        <div style={{ display: 'flex', gap: '10px', marginBottom: '18px', flexWrap: 'wrap' }}>
          <Select value={typeFilter} onChange={e => setTypeFilter(e.target.value as StakeholderKind | 'all')} style={{ width: '160px' }}>
            <option value="all">Speakers & Partners</option>
            <option value="speaker">Speakers</option>
            <option value="partner">Partners</option>
          </Select>
          <Select value={statusFilter} onChange={e => setStatusFilter(e.target.value as AnnouncementStatus | 'all')} style={{ width: '200px' }}>
            {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
          <Select value={sortMode} onChange={e => setSortMode(e.target.value as SortMode)} style={{ width: '180px' }}>
            <option value="scheduled">Sort: Scheduled date</option>
            <option value="recent">Sort: Most recent</option>
          </Select>
        </div>

        {loading ? (
          <div style={{ color: 'var(--ink3)', fontSize: '13px' }}>Loading…</div>
        ) : filtered.length === 0 ? (
          <div style={{ color: 'var(--ink3)', fontSize: '13.5px', padding: '32px 0', textAlign: 'center' }}>
            No announcements match these filters.
          </div>
        ) : (
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px', overflow: 'hidden' }}>
            {filtered.map((row, i) => {
              const stakeholderId = row.speaker_id ?? row.partner_id
              const openHref = stakeholderId
                ? `/admin/events/${eventId}/creative-templates?type=${row.stakeholder_type}&stakeholder=${stakeholderId}&announcement=${row.id}`
                : `/admin/events/${eventId}/creative-templates?type=${row.stakeholder_type}`
              const dateLabel = row.published_at
                ? `Published ${new Date(row.published_at).toLocaleString()}`
                : row.scheduled_for
                ? `Scheduled for ${new Date(row.scheduled_for).toLocaleString()}`
                : `Created ${new Date(row.created_at).toLocaleDateString()}`
              return (
                <Link key={row.id} href={openHref} style={{
                  display: 'grid', gridTemplateColumns: '48px 1fr auto auto', alignItems: 'center', gap: '14px',
                  padding: '14px 18px', textDecoration: 'none', color: 'inherit',
                  borderTop: i === 0 ? 'none' : '1px solid var(--border-light)',
                }}>
                  {row.creative_url ? (
                    // eslint-disable-next-line @next/next/no-img-element -- remote-storage creative thumbnail, not worth next/image's remote-loader config for a 48px queue thumb
                    <img src={row.creative_url} alt="" style={{ width: '48px', height: '48px', objectFit: 'cover', borderRadius: '8px', border: '1px solid var(--border-light)' }} />
                  ) : (
                    <div style={{ width: '48px', height: '48px', borderRadius: '8px', background: 'var(--surface)', border: '1px solid var(--border-light)' }} />
                  )}
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '13.5px', fontWeight: 800, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {row.stakeholder_name ?? 'Unknown'} <span style={{ fontWeight: 500, color: 'var(--ink4)', fontSize: '11.5px' }}>· {row.stakeholder_type}</span>
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--ink3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '460px' }}>
                      {row.post_copy?.replace(/\n+/g, ' ') || '(no copy yet)'}
                    </div>
                  </div>
                  <div style={{ fontSize: '11.5px', color: 'var(--ink4)', whiteSpace: 'nowrap' }}>
                    {dateLabel}{row.postiz_channel_ids?.length ? ` · ${row.postiz_channel_ids.length} channel${row.postiz_channel_ids.length === 1 ? '' : 's'}` : ''}
                  </div>
                  <Badge color={statusColor(row.status)}>{row.status.replace(/_/g, ' ')}</Badge>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
