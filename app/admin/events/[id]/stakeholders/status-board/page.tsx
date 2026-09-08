'use client'

import { use, useEffect, useMemo, useRef, useState } from 'react'
import PageHeader from '@/app/components/PageHeader'
import { Card, Input, Select } from '@/app/components/ui'
import { useBreadcrumbLabel } from '@/app/lib/nav/breadcrumb-labels'

/* Speaker Onboarding Status Board (2026-09-04) — a dedicated, dense,
   full-width view of every collection/production/publish signal per
   speaker, built for weekly-meeting review and day-to-day chasing of
   what's still missing. Deliberately separate from the Registry list
   (app/admin/events/[id]/stakeholders/page.tsx), which is optimized for
   browse/edit/bulk-actions across 7 stakeholder categories — this page is
   speaker-only, table-shaped, and adds no edit affordances of its own
   (click a row to open the real Details page, same as Registry does).

   Data comes from GET .../speakers/status-board, which computes every
   column server-side (see that route + app/lib/events/speaker-status.ts
   for exactly what each status means and where it's sourced from). */

type TriState = 'pending' | 'created' | 'published'
type SelfPromoState = 'pending' | 'created' | 'sent'

type Row = {
  id: string
  name: string
  job_title: string | null
  company_name: string | null
  producer_staff_id: string | null
  producer_name: string | null
  full_bio: boolean
  photo: boolean
  passport: boolean
  national_id: boolean
  short_bio: boolean
  cleaned_photo: boolean
  website_photo: boolean
  website_status: TriState
  social_post_status: TriState
  self_promo_status: SelfPromoState
}

type Producer = { id: string; name: string }

const BOOL_COLUMNS: { key: keyof Row; label: string; group: 'Collection' | 'Production' }[] = [
  { key: 'full_bio', label: 'Full Bio', group: 'Collection' },
  { key: 'photo', label: 'Photo', group: 'Collection' },
  { key: 'passport', label: 'Passport', group: 'Collection' },
  { key: 'national_id', label: 'National ID', group: 'Collection' },
  { key: 'short_bio', label: 'Short Bio', group: 'Production' },
  { key: 'cleaned_photo', label: 'Cleaned Photo', group: 'Production' },
  { key: 'website_photo', label: 'Website Photo', group: 'Production' },
]

const TRISTATE_COLUMNS: { key: 'website_status' | 'social_post_status' | 'self_promo_status'; label: string }[] = [
  { key: 'website_status', label: 'Website' },
  { key: 'social_post_status', label: 'Social Post' },
  { key: 'self_promo_status', label: 'Self Promo' },
]

// Text-based status, not a dot (2026-09-08, per Madhu — dots didn't say
// enough at a glance; the actual word plus color reads faster once you
// know what you're looking for, especially scanning down a column). Same
// 3-way color meaning everywhere on this page: red = missing/pending,
// amber = in progress, green = done/published. Boolean columns only ever
// have the red/green ends of that range (there's no "in progress" concept
// for a yes/no field), the 3-state announcement columns use all three.
const STATUS_RED = 'var(--red)'
const STATUS_AMBER = 'var(--amber)'
const STATUS_GREEN = 'var(--success)'

const TRISTATE_COLOR: Record<string, string> = {
  pending: STATUS_RED, created: STATUS_AMBER, published: STATUS_GREEN, sent: STATUS_GREEN,
}
const TRISTATE_LABEL: Record<string, string> = {
  pending: 'Pending', created: 'In Progress', published: 'Published', sent: 'Sent',
}

// Word-wraps naturally inside a narrow column (e.g. "In Progress" breaks
// into two lines on its own at the space) rather than forcing a fixed
// line break — keeps single-word states ("Done", "Pending") on one line
// while still letting longer ones go to two lines to save width, per
// Madhu's ask.
function StatusText({ label, color }: { label: string; color: string }) {
  return (
    <div style={{ fontSize: '11px', fontWeight: 800, color, textAlign: 'center', lineHeight: 1.25, maxWidth: '76px', margin: '0 auto' }}>
      {label}
    </div>
  )
}

function BoolCell({ value }: { value: boolean }) {
  return <StatusText label={value ? 'Done' : 'Pending'} color={value ? STATUS_GREEN : STATUS_RED} />
}

const MISSING_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: 'all', label: 'Show all' },
  { value: 'anything', label: 'Missing anything' },
  { value: 'full_bio', label: 'Missing Full Bio' },
  { value: 'photo', label: 'Missing Photo' },
  { value: 'passport', label: 'Missing Passport' },
  { value: 'national_id', label: 'Missing National ID' },
  { value: 'short_bio', label: 'Missing Short Bio' },
  { value: 'cleaned_photo', label: 'Not Cleaned' },
  { value: 'website_photo', label: 'Missing Website Photo' },
]

export default function StatusBoardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = use(params)
  const [eventName, setEventName] = useState('')
  const [rows, setRows] = useState<Row[]>([])
  const [producers, setProducers] = useState<Producer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [selectedProducerIds, setSelectedProducerIds] = useState<Set<string>>(new Set())
  const [missingFilter, setMissingFilter] = useState('all')
  const [producerDropdownOpen, setProducerDropdownOpen] = useState(false)
  const producerDropdownRef = useRef<HTMLDivElement | null>(null)

  // Sticky header (2026-09-08, per Madhu — freeze the header rows and the
  // Speaker column while scrolling). The group-label row's real rendered
  // height drives the second header row's own `top` offset — measured
  // rather than hardcoded, since it depends on font metrics/padding that
  // aren't worth pinning down by hand and re-checking every time either
  // changes.
  const headerRow1Ref = useRef<HTMLTableRowElement | null>(null)
  const [headerRow1Height, setHeaderRow1Height] = useState(0)
  useEffect(() => {
    if (headerRow1Ref.current) setHeaderRow1Height(headerRow1Ref.current.getBoundingClientRect().height)
  }, [loading])

  useBreadcrumbLabel(eventId, eventName)

  async function load() {
    setLoading(true)
    setError(null)
    const [boardRes, eventRes] = await Promise.all([
      fetch(`/api/events/stakeholders/speakers/status-board?event_id=${eventId}`),
      fetch(`/api/events?id=${eventId}`),
    ])
    const boardData = await boardRes.json().catch(() => ({}))
    if (!boardRes.ok) { setError(boardData.error ?? 'Could not load the status board.'); setLoading(false); return }
    setRows(boardData.rows ?? [])
    setProducers(boardData.producers ?? [])
    const eventData = await eventRes.json().catch(() => null)
    const ev = Array.isArray(eventData) ? eventData[0] : eventData
    setEventName(ev?.public_name || ev?.name || '')
    setLoading(false)
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-mount, matches this app's other top-level fetchAll effects
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refetch only when the event itself changes
  }, [eventId])

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (producerDropdownRef.current && !producerDropdownRef.current.contains(e.target as Node)) setProducerDropdownOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  const filteredRows = useMemo(() => {
    return rows.filter(r => {
      if (search.trim() && !r.name.toLowerCase().includes(search.trim().toLowerCase())) return false
      if (selectedProducerIds.size > 0 && !(r.producer_staff_id && selectedProducerIds.has(r.producer_staff_id))) return false
      if (missingFilter === 'anything') {
        return BOOL_COLUMNS.some(c => r[c.key] === false)
      }
      if (missingFilter !== 'all') {
        const col = BOOL_COLUMNS.find(c => c.key === missingFilter)
        if (col && r[col.key] !== false) return false
      }
      return true
    })
  }, [rows, search, selectedProducerIds, missingFilter])

  const summary = useMemo(() => {
    const total = filteredRows.length
    const boolCounts = BOOL_COLUMNS.map(c => ({ ...c, count: filteredRows.filter(r => r[c.key] === true).length }))
    return { total, boolCounts }
  }, [filteredRows])

  function toggleProducer(id: string) {
    setSelectedProducerIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--surface)' }}>
      <PageHeader
        eyebrow="Stakeholder Hub"
        title="Speaker Onboarding Status Board"
        backHref={`/admin/events/${eventId}/stakeholders`}
        backLabel="Back to Stakeholder Hub"
      />

      <div style={{ maxWidth: '100%', padding: '20px 28px 40px' }}>
        {error && (
          <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'var(--red-light)', border: '1px solid var(--red-border)', color: 'var(--red)', fontSize: '14.5px', marginBottom: '16px' }}>
            {error}
          </div>
        )}

        {/* Summary strip */}
        {!loading && !error && (
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '18px' }}>
            <Card padded>
              <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', color: 'var(--ink3)' }}>Speakers Shown</div>
              <div style={{ fontSize: '22px', fontWeight: 900, color: 'var(--ink)', marginTop: '2px' }}>{summary.total}</div>
            </Card>
            {summary.boolCounts.map(c => (
              <Card key={c.key as string} padded>
                <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', color: 'var(--ink3)' }}>{c.label}</div>
                <div style={{ fontSize: '22px', fontWeight: 900, color: c.count === summary.total ? 'var(--success)' : 'var(--ink)', marginTop: '2px' }}>
                  {c.count}/{summary.total}
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* Filters */}
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '16px' }}>
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search speakers…" style={{ width: '220px' }} />

          <div ref={producerDropdownRef} style={{ position: 'relative' }}>
            <button onClick={() => setProducerDropdownOpen(v => !v)}
              style={{
                padding: '9px 14px', borderRadius: '9px', border: '1px solid var(--border)', background: 'var(--card)',
                color: 'var(--ink)', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
              }}>
              Producer {selectedProducerIds.size > 0 ? `(${selectedProducerIds.size})` : '(All)'} ▾
            </button>
            {producerDropdownOpen && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 20, minWidth: '220px',
                background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '10px',
                boxShadow: 'var(--shadow-md)', padding: '10px',
              }}>
                {producers.length === 0 ? (
                  <div style={{ fontSize: '12.5px', color: 'var(--ink4)', padding: '4px' }}>No producers assigned on this event.</div>
                ) : (
                  <>
                    <div style={{ display: 'flex', gap: '10px', marginBottom: '8px' }}>
                      <button onClick={() => setSelectedProducerIds(new Set(producers.map(p => p.id)))}
                        style={{ background: 'none', border: 'none', color: 'var(--teal-mid)', fontSize: '12px', fontWeight: 700, cursor: 'pointer', padding: 0 }}>
                        Select all
                      </button>
                      <button onClick={() => setSelectedProducerIds(new Set())}
                        style={{ background: 'none', border: 'none', color: 'var(--ink3)', fontSize: '12px', fontWeight: 700, cursor: 'pointer', padding: 0 }}>
                        Clear
                      </button>
                    </div>
                    {producers.map(p => (
                      <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--ink)', cursor: 'pointer', padding: '4px 2px' }}>
                        <input type="checkbox" checked={selectedProducerIds.has(p.id)} onChange={() => toggleProducer(p.id)} />
                        {p.name}
                      </label>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>

          <Select value={missingFilter} onChange={e => setMissingFilter(e.target.value)} style={{ width: '220px' }}>
            {MISSING_FILTER_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>

          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginLeft: 'auto', fontSize: '11.5px', fontWeight: 700 }}>
            <span style={{ color: STATUS_GREEN }}>Done / Published</span>
            <span style={{ color: STATUS_AMBER }}>In progress</span>
            <span style={{ color: STATUS_RED }}>Missing / Pending</span>
          </div>
        </div>

        {loading ? (
          <div style={{ fontSize: '13px', color: 'var(--ink4)', padding: '40px', textAlign: 'center' }}>Loading…</div>
        ) : (
          // overflow-x only (never overflow-y) is deliberate — it's what
          // lets `position: sticky` on the header/Speaker-column cells
          // below track the PAGE's own scroll instead of being confined to
          // a scroll box inside this div. Confirmed the standard pattern
          // for "horizontal scroll + sticky vertical header" (2026-09-08,
          // per Madhu: freeze the header rows and the Speaker column while
          // scrolling through a wide/tall roster).
          <div style={{ overflowX: 'auto', border: '1px solid var(--border-light)', borderRadius: '12px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr ref={headerRow1Ref} style={{ background: 'var(--card-hi)' }}>
                  <th rowSpan={2} style={{ ...thStyle('left'), ...stickyStyle({ top: 0, left: 0, z: 4 }) }}>Speaker</th>
                  <th rowSpan={2} style={{ ...thStyle('left'), ...stickyStyle({ top: 0, z: 3 }) }}>Producer</th>
                  <th colSpan={4} style={{ ...thStyle('center'), borderBottom: '1px solid var(--border-light)', ...stickyStyle({ top: 0, z: 3 }) }}>Collection</th>
                  <th colSpan={3} style={{ ...thStyle('center'), borderBottom: '1px solid var(--border-light)', ...stickyStyle({ top: 0, z: 3 }) }}>Production</th>
                  <th colSpan={3} style={{ ...thStyle('center'), borderBottom: '1px solid var(--border-light)', ...stickyStyle({ top: 0, z: 3 }) }}>Publish</th>
                </tr>
                <tr style={{ background: 'var(--card-hi)' }}>
                  {BOOL_COLUMNS.map(c => <th key={c.key as string} style={{ ...thStyle('center'), ...stickyStyle({ top: headerRow1Height, z: 3 }) }}>{c.label}</th>)}
                  {TRISTATE_COLUMNS.map(c => <th key={c.key} style={{ ...thStyle('center'), ...stickyStyle({ top: headerRow1Height, z: 3 }) }}>{c.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {filteredRows.length === 0 ? (
                  <tr><td colSpan={2 + BOOL_COLUMNS.length + TRISTATE_COLUMNS.length} style={{ padding: '32px', textAlign: 'center', color: 'var(--ink4)' }}>No speakers match these filters.</td></tr>
                ) : filteredRows.map(r => (
                  <tr key={r.id}
                    className="sb-row"
                    onClick={() => window.open(`/admin/events/${eventId}/stakeholders/${r.id}?kind=speaker`, '_self')}
                    style={{ cursor: 'pointer', borderTop: '1px solid var(--border-light)' }}
                  >
                    <td className="sb-sticky-col" style={{ ...tdStyle('left'), ...stickyStyle({ left: 0, z: 1 }) }}>
                      <div style={{ fontWeight: 700, color: 'var(--ink)' }}>{r.name}</div>
                      <div style={{ fontSize: '11.5px', color: 'var(--ink4)' }}>{[r.job_title, r.company_name].filter(Boolean).join(' · ')}</div>
                    </td>
                    <td style={tdStyle('left')}>
                      <span style={{ color: r.producer_name ? 'var(--ink2)' : 'var(--ink4)' }}>{r.producer_name ?? '—'}</span>
                    </td>
                    {BOOL_COLUMNS.map(c => (
                      <td key={c.key as string} style={tdStyle('center')}>
                        <BoolCell value={r[c.key] as boolean} />
                      </td>
                    ))}
                    {TRISTATE_COLUMNS.map(c => {
                      const state = r[c.key]
                      return (
                        <td key={c.key} style={tdStyle('center')}>
                          <StatusText label={TRISTATE_LABEL[state]} color={TRISTATE_COLOR[state]} />
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <style jsx>{`
          .sb-row:hover { background: var(--card-hi); }
          .sb-row:hover .sb-sticky-col { background: var(--card-hi); }
        `}</style>
      </div>
    </div>
  )
}

function thStyle(align: 'left' | 'center'): React.CSSProperties {
  return {
    padding: '10px 12px', textAlign: align, fontSize: '11px', fontWeight: 800, textTransform: 'uppercase',
    letterSpacing: '0.4px', color: 'var(--ink3)', whiteSpace: 'nowrap',
  }
}
function tdStyle(align: 'left' | 'center'): React.CSSProperties {
  return { padding: '10px 12px', textAlign: align, verticalAlign: 'middle' }
}

// A sticky cell needs its OWN explicit background — it doesn't reliably
// pick up its row's background the way a normal cell does, since sticky
// positioning paints it in a separate layer above whatever scrolls
// underneath. Header cells match the header row's own var(--card-hi);
// the Speaker column's body cells default to var(--surface) — the same
// color a non-sticky cell would show against this page's background —
// and the .sb-row:hover CSS rule (see the <style jsx> block below)
// overrides it to var(--card-hi) on hover, same as every other cell in
// that row.
function stickyStyle(opts: { top?: number; left?: number; z: number }): React.CSSProperties {
  return {
    position: 'sticky',
    ...(opts.top !== undefined ? { top: opts.top } : {}),
    ...(opts.left !== undefined ? { left: opts.left } : {}),
    zIndex: opts.z,
    background: opts.top !== undefined ? 'var(--card-hi)' : 'var(--surface)',
  }
}
