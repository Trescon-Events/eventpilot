'use client'

/*
  Readiness Dashboard — Phase-1 Refinement PRD (Thulasi).

  Renders at the TOP of the Overview tab, before the Master Deck card.
  Three panels:
    1. Summary card       — current version, last published date, overall status pill
    2. Sections grid      — per-section status (6 rows) + last modified / last synced
    3. Timeline           — recent changes since last publish (best-effort from updated_at)

  Data source: GET /api/corporate-marketing/deck/readiness.
*/

import { useCallback, useEffect, useState } from 'react'
import { BRAND, Card, SectionLabel, H2 } from './_shared'

type SectionKey =
  | 'company_information'
  | 'statistics'
  | 'events'
  | 'leadership'
  | 'testimonials'
  | 'images'

type Status = 'up_to_date' | 'needs_review' | 'not_yet_published'

type Section = {
  key:           SectionKey
  name:          string
  status:        Status
  last_modified: string | null
  last_synced?:  string | null
}

type Change = {
  section:     string
  section_key: SectionKey
  field:       string
  updated_at:  string
}

type Readiness = {
  current_version:       number
  published_version:     number | null
  last_published_at:     string | null
  overall_status:        Status
  sections:              Section[]
  changes_since_publish: Change[]
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) +
         ' · ' +
         d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

function relTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const s = Math.floor(diffMs / 1000)
  if (s < 60)          return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60)          return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24)          return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 7)           return `${d}d ago`
  const w = Math.floor(d / 7)
  if (w < 5)           return `${w}w ago`
  return fmtDate(iso)
}

function StatusPill({ status }: { status: Status }) {
  const styles: Record<Status, { bg: string; color: string; label: string }> = {
    up_to_date:        { bg: 'var(--success-light)', color: 'var(--success)', label: 'Up to date' },
    needs_review:      { bg: 'var(--amber-light)', color: 'var(--amber)', label: 'Update Recommended' },
    not_yet_published: { bg: 'var(--border-light)', color: 'var(--ink3)', label: 'Not yet published' },
  }
  const s = styles[status]
  return (
    <span style={{
      display:      'inline-flex',
      alignItems:   'center',
      gap:          '6px',
      fontSize:     '11px',
      fontWeight:   800,
      letterSpacing:'0.5px',
      color:        s.color,
      background:   s.bg,
      padding:      '5px 12px',
      borderRadius: '14px',
      whiteSpace:   'nowrap',
    }}>
      {s.label}
    </span>
  )
}

export default function ReadinessDashboard() {
  const [data, setData]       = useState<Readiness | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/corporate-marketing/deck/readiness', { cache: 'no-store' })
      if (!res.ok) throw new Error(`Failed to load readiness (${res.status})`)
      const d = await res.json()
      setData(d as Readiness)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  if (loading) {
    return (
      <Card>
        <SectionLabel>Deck Readiness</SectionLabel>
        <div style={{ fontSize: '13px', color: 'var(--ink3)', marginTop: '10px' }}>Loading…</div>
      </Card>
    )
  }

  if (error || !data) {
    return (
      <Card>
        <SectionLabel>Deck Readiness</SectionLabel>
        <div style={{ marginTop: '10px', fontSize: '13px', color: 'var(--red)', fontWeight: 700 }}>
          {error ?? 'Failed to load readiness data.'}
        </div>
      </Card>
    )
  }

  const { current_version, published_version, last_published_at, overall_status, sections, changes_since_publish } = data
  const notYetPublished = overall_status === 'not_yet_published'

  return (
    <div style={{ display: 'grid', gap: '20px' }}>
      {/* Summary card */}
      <Card style={{ borderColor: overall_status === 'needs_review' ? 'var(--amber-border)' : 'var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '20px', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '240px' }}>
            <SectionLabel>Deck Readiness</SectionLabel>
            <H2 style={{ marginBottom: '14px' }}>Publish status at a glance</H2>

            <div style={{ display: 'flex', gap: '32px', flexWrap: 'wrap', marginBottom: '14px' }}>
              <div>
                <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--ink4)', letterSpacing: '1.5px', textTransform: 'uppercase' }}>Current version</div>
                <div style={{ fontSize: '20px', fontWeight: 900, color: 'var(--ink)', marginTop: '2px' }}>
                  v{current_version}
                  {published_version !== null && (
                    <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--ink3)', marginLeft: '8px' }}>
                      (last published v{published_version})
                    </span>
                  )}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--ink4)', letterSpacing: '1.5px', textTransform: 'uppercase' }}>Last published</div>
                <div style={{ fontSize: '20px', fontWeight: 900, color: 'var(--ink)', marginTop: '2px' }}>
                  {last_published_at ? fmtDate(last_published_at) : '—'}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--ink3)', letterSpacing: '0.5px', textTransform: 'uppercase' }}>Status</span>
              <StatusPill status={overall_status} />
              {overall_status === 'needs_review' && (
                <span style={{ fontSize: '12px', color: 'var(--ink3)', fontWeight: 600 }}>
                  Content has changed since the last published version.
                </span>
              )}
              {notYetPublished && (
                <span style={{ fontSize: '12px', color: 'var(--ink3)', fontWeight: 600 }}>
                  Publish a first version to start tracking changes.
                </span>
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* Section-wise status */}
      <Card>
        <SectionLabel>Sections</SectionLabel>
        <H2 style={{ marginBottom: '16px' }}>Section-by-section readiness</H2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          {sections.map((s, i) => (
            <div
              key={s.key}
              style={{
                display:        'grid',
                gridTemplateColumns: 'minmax(160px, 1.4fr) auto 1fr',
                alignItems:     'center',
                gap:            '16px',
                padding:        '12px 4px',
                borderTop:      i === 0 ? 'none' : '1px solid var(--border-light)',
              }}
            >
              <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--ink)' }}>
                {s.name}
              </div>
              <div>
                <StatusPill status={s.status} />
              </div>
              <div style={{ fontSize: '12px', color: 'var(--ink3)', textAlign: 'right', fontWeight: 600 }}>
                {s.key === 'events' && s.last_synced && (
                  <>Last synced: {fmtDateTime(s.last_synced)}</>
                )}
                {s.key === 'events' && !s.last_synced && (
                  <>Last synced: —</>
                )}
                {s.key !== 'events' && s.last_modified && (
                  <>Last modified: {fmtDateTime(s.last_modified)}</>
                )}
                {s.key !== 'events' && !s.last_modified && (
                  <>Last modified: —</>
                )}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Changes since last publish */}
      <Card>
        <SectionLabel>Timeline</SectionLabel>
        <H2 style={{ marginBottom: '16px' }}>Changes since last publish</H2>

        {notYetPublished ? (
          <div style={{ fontSize: '13px', color: 'var(--ink3)', fontWeight: 600 }}>
            The deck has not been published yet. Once you publish a first version, tracked changes will appear here.
          </div>
        ) : changes_since_publish.length === 0 ? (
          <div style={{ fontSize: '13px', color: 'var(--ink3)', fontWeight: 600 }}>
            No changes since the last publish.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {changes_since_publish.map((c, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{
                  width: '10px', height: '10px', borderRadius: '50%',
                  background: BRAND, flexShrink: 0,
                }}/>
                <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--ink)', minWidth: '150px' }}>
                  {c.section}
                </div>
                <div style={{ fontSize: '13px', color: 'var(--ink)', flex: 1 }}>
                  {c.field}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--ink3)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                  {relTime(c.updated_at)}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
