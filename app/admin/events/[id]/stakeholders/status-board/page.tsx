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

const TRISTATE_COLOR: Record<string, string> = {
  pending: 'var(--ink4)', created: 'var(--amber)', published: 'var(--success)', sent: 'var(--success)',
}
const TRISTATE_LABEL: Record<string, string> = {
  pending: 'Pending', created: 'Created', published: 'Published', sent: 'Sent',
}

function Dot({ color, title }: { color: string; title: string }) {
  return <span title={title} style={{ display: 'inline-block', width: '10px', height: '10px', borderRadius: '50%', background: color }} />
}

function BoolCell({ value, presentLabel, missingLabel }: { value: boolean; presentLabel: string; missingLabel: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'center' }}>
      <Dot color={value ? 'var(--success)' : 'var(--ink4)'} title={value ? presentLabel : missingLabel} />
    </div>
  )
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

          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginLeft: 'auto', fontSize: '11.5px', color: 'var(--ink3)' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}><Dot color="var(--success)" title="" /> Done / Published</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}><Dot color="var(--amber)" title="" /> In progress</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}><Dot color="var(--ink4)" title="" /> Missing / Pending</span>
          </div>
        </div>

        {loading ? (
          <div style={{ fontSize: '13px', color: 'var(--ink4)', padding: '40px', textAlign: 'center' }}>Loading…</div>
        ) : (
          <div style={{ overflowX: 'auto', border: '1px solid var(--border-light)', borderRadius: '12px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: 'var(--card-hi)' }}>
                  <th rowSpan={2} style={thStyle('left')}>Speaker</th>
                  <th rowSpan={2} style={thStyle('left')}>Producer</th>
                  <th colSpan={4} style={{ ...thStyle('center'), borderBottom: '1px solid var(--border-light)' }}>Collection</th>
                  <th colSpan={3} style={{ ...thStyle('center'), borderBottom: '1px solid var(--border-light)' }}>Production</th>
                  <th colSpan={3} style={{ ...thStyle('center'), borderBottom: '1px solid var(--border-light)' }}>Publish</th>
                </tr>
                <tr style={{ background: 'var(--card-hi)' }}>
                  {BOOL_COLUMNS.map(c => <th key={c.key as string} style={thStyle('center')}>{c.label}</th>)}
                  {TRISTATE_COLUMNS.map(c => <th key={c.key} style={thStyle('center')}>{c.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {filteredRows.length === 0 ? (
                  <tr><td colSpan={2 + BOOL_COLUMNS.length + TRISTATE_COLUMNS.length} style={{ padding: '32px', textAlign: 'center', color: 'var(--ink4)' }}>No speakers match these filters.</td></tr>
                ) : filteredRows.map(r => (
                  <tr key={r.id}
                    onClick={() => window.open(`/admin/events/${eventId}/stakeholders/${r.id}?kind=speaker`, '_self')}
                    style={{ cursor: 'pointer', borderTop: '1px solid var(--border-light)' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--card-hi)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td style={tdStyle('left')}>
                      <div style={{ fontWeight: 700, color: 'var(--ink)' }}>{r.name}</div>
                      <div style={{ fontSize: '11.5px', color: 'var(--ink4)' }}>{[r.job_title, r.company_name].filter(Boolean).join(' · ')}</div>
                    </td>
                    <td style={tdStyle('left')}>
                      <span style={{ color: r.producer_name ? 'var(--ink2)' : 'var(--ink4)' }}>{r.producer_name ?? '—'}</span>
                    </td>
                    {BOOL_COLUMNS.map(c => (
                      <td key={c.key as string} style={tdStyle('center')}>
                        <BoolCell value={r[c.key] as boolean} presentLabel={`${c.label}: on file`} missingLabel={`${c.label}: missing`} />
                      </td>
                    ))}
                    {TRISTATE_COLUMNS.map(c => {
                      const state = r[c.key]
                      return (
                        <td key={c.key} style={tdStyle('center')}>
                          <div style={{ display: 'flex', justifyContent: 'center' }}>
                            <Dot color={TRISTATE_COLOR[state]} title={`${c.label}: ${TRISTATE_LABEL[state]}`} />
                          </div>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
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
