'use client'

import { use, useEffect, useMemo, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import PageHeader from '@/app/components/PageHeader'
import { Button, Card, Input, Select } from '@/app/components/ui'
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
  // UAE Resident (2026-09-08) — null = not yet determined. Gates whether
  // National ID is actually required (mirrors the HubSpot onboarding
  // form's own logic) — see national_id_applicable below and this
  // route's own top comment.
  is_uae_resident: boolean | null
  national_id_applicable: boolean
  short_bio: boolean
  cleaned_photo: boolean
  website_photo: boolean
  website_status: TriState
  social_post_status: TriState
  self_promo_status: SelfPromoState
  confirmation_status: string | null
  // Who originally sourced/introduced this speaker (2026-09-08) — plain
  // text, informational only, sourced from the producers' own Excel
  // tracker. Distinct from producer_name (who's actually assigned to
  // produce them in EventPilot).
  reference: string | null
}

type Producer = { id: string; name: string }

// National ID is deliberately NOT in this array (2026-09-08) — it's the
// one column whose meaning depends on another field (UAE Resident), so it
// gets fully custom header/cell JSX below instead of the generic
// BoolCell render every other column here uses. Collection's own colSpan
// is COLLECTION_BOOL_COLUMNS.length + 2 (UAE Resident, National ID) —
// see the header JSX.
const BOOL_COLUMNS: { key: keyof Row; label: string; group: 'Collection' | 'Production' }[] = [
  { key: 'full_bio', label: 'Full Bio', group: 'Collection' },
  { key: 'photo', label: 'Photo', group: 'Collection' },
  { key: 'passport', label: 'Passport', group: 'Collection' },
  { key: 'short_bio', label: 'Short Bio', group: 'Production' },
  { key: 'cleaned_photo', label: 'Cleaned Photo', group: 'Production' },
  { key: 'website_photo', label: 'Website Photo', group: 'Production' },
]
const COLLECTION_BOOL_COLUMNS = BOOL_COLUMNS.filter(c => c.group === 'Collection')
const PRODUCTION_BOOL_COLUMNS = BOOL_COLUMNS.filter(c => c.group === 'Production')

const TRISTATE_COLUMNS: { key: 'website_status' | 'social_post_status' | 'self_promo_status'; label: string }[] = [
  { key: 'website_status', label: 'Website' },
  { key: 'social_post_status', label: 'Social Post' },
  { key: 'self_promo_status', label: 'Self Promo' },
]
// Speaker, Producer, REF, Confirmation Status (4) + Collection's own bool
// columns + UAE Resident + National ID (2) + Production + the 3-state
// Publish columns.
const TOTAL_TABLE_COLUMNS = 4 + COLLECTION_BOOL_COLUMNS.length + 2 + PRODUCTION_BOOL_COLUMNS.length + TRISTATE_COLUMNS.length

// One accent color per column group (2026-09-08, per Madhu — make the
// three groups visually distinct, not just via the header labels). A
// bright left border marks where each group starts, on both header rows
// and every body row.
const GROUP_COLOR: Record<'Collection' | 'Production' | 'Publish', string> = {
  Collection: 'var(--teal-mid)', Production: 'var(--indigo)', Publish: 'var(--purple)',
}
function groupStartStyle(group: keyof typeof GROUP_COLOR): React.CSSProperties {
  return { borderLeft: `1.5px solid ${GROUP_COLOR[group]}` }
}
function groupHeaderStyle(group: keyof typeof GROUP_COLOR): React.CSSProperties {
  return { background: `color-mix(in srgb, ${GROUP_COLOR[group]} 14%, var(--card-hi))`, borderBottom: `1px solid ${GROUP_COLOR[group]}` }
}
// Widened + name/company only, job title dropped (2026-09-08, per Madhu —
// wanted more speakers visible per screen without scrolling; job title's
// already one click away on the Details page this row opens).
const SPEAKER_COL_WIDTH = '260px'

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
  { value: 'uae_not_determined', label: 'UAE Residency Not Set' },
  { value: 'short_bio', label: 'Missing Short Bio' },
  { value: 'cleaned_photo', label: 'Not Cleaned' },
  { value: 'website_photo', label: 'Missing Website Photo' },
]

// National ID's "missing" meaning depends on national_id_applicable —
// see the Row type's own comment — so it can't go through the generic
// BOOL_COLUMNS lookup below like every other filter option.
function nationalIdMissing(r: Row) {
  return r.national_id_applicable && !r.national_id
}

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

  // The sticky filter bar's own real height drives how tall the table's
  // own (internally-scrolling — see its own comment) box gets to be: it
  // fills every remaining pixel of viewport below the stuck filter bar,
  // rather than a guessed fixed value that either wastes space or clips
  // rows short.
  const filterBarRef = useRef<HTMLDivElement | null>(null)
  const [filterBarHeight, setFilterBarHeight] = useState(0)
  useEffect(() => {
    if (filterBarRef.current) setFilterBarHeight(filterBarRef.current.getBoundingClientRect().height)
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
        return BOOL_COLUMNS.some(c => r[c.key] === false) || nationalIdMissing(r)
      }
      if (missingFilter === 'national_id') return nationalIdMissing(r)
      if (missingFilter === 'uae_not_determined') return r.is_uae_resident === null
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
    // National ID's own denominator is applicable rows only (2026-09-08) —
    // counting it against the full total would make the card look stuck
    // well short of 100% forever for any event with real non-UAE-resident
    // speakers, even once every actually-required National ID is on file.
    const nationalIdApplicable = filteredRows.filter(r => r.national_id_applicable)
    const nationalIdCount = { key: 'national_id' as const, label: 'National ID', count: nationalIdApplicable.filter(r => r.national_id).length, total: nationalIdApplicable.length }
    const uaeDeterminedCount = filteredRows.filter(r => r.is_uae_resident !== null).length
    return { total, boolCounts, nationalIdCount, uaeDeterminedCount }
  }, [filteredRows])

  function toggleProducer(id: string) {
    setSelectedProducerIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  // Excel export (2026-09-09, per Madhu) — same flat-row json_to_sheet
  // pattern the Registry's own "Speaker Details (Excel)" download already
  // uses (app/admin/events/[id]/stakeholders/page.tsx), not a new
  // convention. Exports the FULL roster (`rows`, not `filteredRows`) —
  // "download the full speaker list" — regardless of whatever
  // search/producer/missing filter happens to be active on screen right
  // now. Every column/value mirrors exactly what's on the board: same
  // Done/Pending/N/A/Unknown labels (BoolCell's own boolean→label mapping
  // and TRISTATE_LABEL are reused here, not re-derived), same left-to-
  // right order (Collection, then Production, then Publish).
  function downloadExcel() {
    const sheetRows = rows.map(r => ({
      'Speaker': r.name,
      'Company': r.company_name ?? '',
      'Ref': r.reference ?? '',
      'Producer': r.producer_name ?? '',
      'Confirmation Status': r.confirmation_status ?? 'Not set',
      'Full Bio': r.full_bio ? 'Done' : 'Pending',
      'Photo': r.photo ? 'Done' : 'Pending',
      'UAE Resident': r.is_uae_resident === true ? 'UAE' : r.is_uae_resident === false ? 'Not UAE' : 'Unknown',
      'Passport': r.passport ? 'Done' : 'Pending',
      'National ID': r.national_id_applicable ? (r.national_id ? 'Done' : 'Pending') : 'Not Applicable',
      'Short Bio': r.short_bio ? 'Done' : 'Pending',
      'Cleaned Photo': r.cleaned_photo ? 'Done' : 'Pending',
      'Website Photo': r.website_photo ? 'Done' : 'Pending',
      'Website': TRISTATE_LABEL[r.website_status],
      'Social Post': TRISTATE_LABEL[r.social_post_status],
      'Self Promo': TRISTATE_LABEL[r.self_promo_status],
    }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sheetRows), 'Status Board')
    XLSX.writeFile(wb, `speaker-status-board-${Date.now()}.xlsx`)
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
            {summary.boolCounts.filter(c => c.group === 'Collection').map(c => (
              <Card key={c.key as string} padded>
                <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', color: 'var(--ink3)' }}>{c.label}</div>
                <div style={{ fontSize: '22px', fontWeight: 900, color: c.count === summary.total ? 'var(--success)' : 'var(--ink)', marginTop: '2px' }}>
                  {c.count}/{summary.total}
                </div>
              </Card>
            ))}
            <Card padded>
              <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', color: 'var(--ink3)' }}>UAE Residency Set</div>
              <div style={{ fontSize: '22px', fontWeight: 900, color: summary.uaeDeterminedCount === summary.total ? 'var(--success)' : 'var(--ink)', marginTop: '2px' }}>
                {summary.uaeDeterminedCount}/{summary.total}
              </div>
            </Card>
            <Card padded>
              <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', color: 'var(--ink3)' }}>National ID</div>
              <div style={{ fontSize: '22px', fontWeight: 900, color: summary.nationalIdCount.total > 0 && summary.nationalIdCount.count === summary.nationalIdCount.total ? 'var(--success)' : 'var(--ink)', marginTop: '2px' }}>
                {summary.nationalIdCount.count}/{summary.nationalIdCount.total}
              </div>
              <div style={{ fontSize: '10.5px', color: 'var(--ink4)', marginTop: '2px' }}>of UAE residents</div>
            </Card>
            {summary.boolCounts.filter(c => c.group === 'Production').map(c => (
              <Card key={c.key as string} padded>
                <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', color: 'var(--ink3)' }}>{c.label}</div>
                <div style={{ fontSize: '22px', fontWeight: 900, color: c.count === summary.total ? 'var(--success)' : 'var(--ink)', marginTop: '2px' }}>
                  {c.count}/{summary.total}
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* Filters — sticky (2026-09-08, per Madhu: the summary cards above
            should scroll away normally, but this bar and the table's own
            header should freeze once scrolled up to them, maximizing how
            many speaker rows fit on screen). Plain `position: sticky` at
            the page level works fine for this bar specifically — unlike
            the table below, it has no overflow-x of its own to fight
            (see the table wrapper's own comment for why THAT one can't
            use this same simple approach). Needs its own opaque
            background since content scrolls underneath it once stuck. */}
        <div ref={filterBarRef} style={{
          position: 'sticky', top: 0, zIndex: 10, background: 'var(--surface)',
          display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center',
          padding: '10px 0 16px',
        }}>
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

          <Button variant="ghost" onClick={downloadExcel}>Download Excel</Button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginLeft: 'auto', fontSize: '11.5px', fontWeight: 700 }}>
            <span style={{ color: STATUS_GREEN }}>Done / Published</span>
            <span style={{ color: STATUS_AMBER }}>In progress</span>
            <span style={{ color: STATUS_RED }}>Missing / Pending</span>
            <span style={{ color: 'var(--ink4)' }}>Not Applicable</span>
          </div>
        </div>

        {loading ? (
          <div style={{ fontSize: '13px', color: 'var(--ink4)', padding: '40px', textAlign: 'center' }}>Loading…</div>
        ) : (
          // Bounded height + overflow: auto on BOTH axes (2026-09-08, real
          // bug found live — the sticky header/column never froze at all).
          // The previous attempt set overflow-x: auto with overflow-y left
          // (or even explicitly set) to 'visible', intending sticky to
          // track the PAGE's own scroll — but per the CSS Overflow spec,
          // the computed value of overflow-y becomes 'auto' regardless of
          // what's specified, the instant overflow-x isn't 'visible'. That
          // silently turns this div into its own vertical scroll
          // container — and since it never had a constrained height, that
          // container's scrollbar never actually needed to move, so
          // `position: sticky` below was tracking a scroll box that never
          // scrolled. There is no page-scroll-tracking way around this
          // specific combination — the standard, working pattern instead
          // (same one Google Sheets/Airtable-style tables use) is to give
          // the table its OWN bounded height and let IT scroll internally,
          // in both directions, with sticky positioned relative to that.
          // `height` (not maxHeight) so it actually fills the remaining
          // viewport below the sticky filter bar rather than leaving
          // unused space (2026-09-08, real gap found live) — 24px is
          // just breathing room above this page's own bottom padding.
          //
          // paddingTop: 3px (2026-09-09, real bug found live, verified via
          // getBoundingClientRect on the actual text nodes — NOT a layout
          // bug, the box model for row1's "Collection" header and row2's
          // "Full Bio" header were pixel-identical) — this is a Chromium
          // rasterization quirk: sticky content sitting EXACTLY flush with
          // its scroll container's own clip edge (top: 0 of a scrollport
          // whose overflow clipping starts at that exact same edge) gets a
          // sliver visually shaved off the top on paint, even though the
          // DOM layout says the padding is fully there. Row2's header
          // doesn't show it because it sticks at headerRow1Height, safely
          // away from the clip boundary — only row1, at the literal edge,
          // is affected. Insetting the scrollport itself by a few px means
          // nothing ever sits exactly flush with the clip edge. box-sizing:
          // border-box keeps the box's total rendered size exactly what
          // `height` says despite adding this padding.
          <div style={{ height: `calc(100vh - ${filterBarHeight}px - 24px)`, boxSizing: 'border-box', paddingTop: '3px', overflow: 'auto', border: '1px solid var(--border)', borderRadius: '12px' }}>
            <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: '13px' }}>
              <thead>
                <tr ref={headerRow1Ref} style={{ background: 'var(--card-hi)' }}>
                  <Th rowSpan={2} cellStyle={{ ...stickyStyle({ top: 0, left: 0, z: 4 }), minWidth: SPEAKER_COL_WIDTH, width: SPEAKER_COL_WIDTH }} contentStyle={thContentStyle('left')}>Speaker</Th>
                  {/* Reference (2026-09-08) — who originally sourced/
                      introduced this speaker, per the producers' own Excel
                      tracker. Plain text, no color-coding — informational
                      only, not a completion signal like every other
                      column here. Ordered before Producer per Madhu. */}
                  <Th rowSpan={2} cellStyle={{ ...stickyStyle({ top: 0, z: 3 }), minWidth: '70px', width: '70px' }} contentStyle={thContentStyle('left')}>Ref</Th>
                  <Th rowSpan={2} cellStyle={{ ...stickyStyle({ top: 0, z: 3 }), minWidth: '110px', width: '110px' }} contentStyle={{ ...thContentStyle('left'), whiteSpace: 'normal' }}>Producer</Th>
                  <Th rowSpan={2} cellStyle={{ ...stickyStyle({ top: 0, z: 3 }), minWidth: '90px', width: '90px' }} contentStyle={{ ...thContentStyle('center'), whiteSpace: 'normal' }}>Confirmation Status</Th>
                  {/* +2 for UAE Resident and National ID — hand-placed
                      below, not in COLLECTION_BOOL_COLUMNS (see that
                      array's own comment). */}
                  <Th colSpan={COLLECTION_BOOL_COLUMNS.length + 2} cellStyle={{ ...stickyStyle({ top: 0, z: 3 }), ...groupHeaderStyle('Collection'), ...groupStartStyle('Collection') }} contentStyle={thContentStyle('center')}>Collection</Th>
                  <Th colSpan={PRODUCTION_BOOL_COLUMNS.length} cellStyle={{ ...stickyStyle({ top: 0, z: 3 }), ...groupHeaderStyle('Production'), ...groupStartStyle('Production') }} contentStyle={thContentStyle('center')}>Production</Th>
                  <Th colSpan={3} cellStyle={{ ...stickyStyle({ top: 0, z: 3 }), ...groupHeaderStyle('Publish'), ...groupStartStyle('Publish') }} contentStyle={thContentStyle('center')}>Publish</Th>
                </tr>
                <tr style={{ background: 'var(--card-hi)' }}>
                  {/* Collection's own order (2026-09-09, per Madhu): Full
                      Bio, Photo, UAE Resident, Passport, National ID — UAE
                      Resident moved before Passport since it gates what
                      Passport/National ID actually require. Hand-rendered
                      rather than mapped over COLLECTION_BOOL_COLUMNS since
                      UAE Resident/National ID split it out of array order. */}
                  <Th cellStyle={{ ...groupStartStyle('Collection'), ...stickyStyle({ top: headerRow1Height, z: 3 }) }} contentStyle={thContentStyle('center')}>Full Bio</Th>
                  <Th cellStyle={stickyStyle({ top: headerRow1Height, z: 3 })} contentStyle={thContentStyle('center')}>Photo</Th>
                  <Th cellStyle={stickyStyle({ top: headerRow1Height, z: 3 })} contentStyle={thContentStyle('center')}>UAE Resident</Th>
                  <Th cellStyle={stickyStyle({ top: headerRow1Height, z: 3 })} contentStyle={thContentStyle('center')}>Passport</Th>
                  <Th cellStyle={stickyStyle({ top: headerRow1Height, z: 3 })} contentStyle={thContentStyle('center')}>National ID</Th>
                  {PRODUCTION_BOOL_COLUMNS.map((c, i) => (
                    <Th key={c.key as string} cellStyle={{ ...(i === 0 ? groupStartStyle('Production') : {}), ...stickyStyle({ top: headerRow1Height, z: 3 }) }} contentStyle={thContentStyle('center')}>{c.label}</Th>
                  ))}
                  {TRISTATE_COLUMNS.map((c, i) => (
                    <Th key={c.key} cellStyle={{ ...(i === 0 ? groupStartStyle('Publish') : {}), ...stickyStyle({ top: headerRow1Height, z: 3 }) }} contentStyle={thContentStyle('center')}>{c.label}</Th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredRows.length === 0 ? (
                  <tr><td colSpan={TOTAL_TABLE_COLUMNS} style={{ padding: '32px', textAlign: 'center', color: 'var(--ink4)' }}>No speakers match these filters.</td></tr>
                ) : filteredRows.map(r => (
                  <tr key={r.id}
                    className="sb-row"
                    onClick={() => window.open(`/admin/events/${eventId}/stakeholders/${r.id}?kind=speaker`, '_self')}
                    style={{ cursor: 'pointer', borderTop: '1px solid var(--border)' }}
                  >
                    <td className="sb-sticky-col" style={{ ...tdStyle('left'), ...stickyStyle({ left: 0, z: 1 }), minWidth: SPEAKER_COL_WIDTH, width: SPEAKER_COL_WIDTH }}>
                      <div style={{ fontWeight: 700, color: 'var(--ink)' }}>{r.name}</div>
                      {r.company_name && <div style={{ fontSize: '11.5px', color: 'var(--ink4)' }}>{r.company_name}</div>}
                    </td>
                    <td style={tdStyle('left')}>
                      <span style={{ color: 'var(--ink3)' }}>{r.reference || '—'}</span>
                    </td>
                    <td style={tdStyle('left')}>
                      <span style={{ color: r.producer_name ? 'var(--ink2)' : 'var(--ink4)' }}>{r.producer_name ?? '—'}</span>
                    </td>
                    <td style={tdStyle('center')}>
                      {r.confirmation_status
                        ? <StatusText label={r.confirmation_status} color={r.confirmation_status === 'On Hold' ? STATUS_RED : STATUS_GREEN} />
                        : <StatusText label="Not set" color="var(--ink4)" />}
                    </td>
                    {/* Collection's own order — see the header's matching
                        comment for why this is hand-rendered. */}
                    <td style={{ ...tdStyle('center'), ...groupStartStyle('Collection') }}>
                      <BoolCell value={r.full_bio} />
                    </td>
                    <td style={tdStyle('center')}>
                      <BoolCell value={r.photo} />
                    </td>
                    <td style={tdStyle('center')}>
                      <StatusText
                        label={r.is_uae_resident === true ? 'UAE' : r.is_uae_resident === false ? 'Not UAE' : 'Unknown'}
                        color={r.is_uae_resident === null ? STATUS_RED : STATUS_GREEN}
                      />
                    </td>
                    <td style={tdStyle('center')}>
                      <BoolCell value={r.passport} />
                    </td>
                    <td style={tdStyle('center')}>
                      {r.national_id_applicable
                        ? <BoolCell value={r.national_id} />
                        : <StatusText label="N/A" color="var(--ink4)" />}
                    </td>
                    {PRODUCTION_BOOL_COLUMNS.map((c, i) => (
                      <td key={c.key as string} style={{ ...tdStyle('center'), ...(i === 0 ? groupStartStyle('Production') : {}) }}>
                        <BoolCell value={r[c.key] as boolean} />
                      </td>
                    ))}
                    {TRISTATE_COLUMNS.map((c, i) => {
                      const state = r[c.key]
                      return (
                        <td key={c.key} style={{ ...tdStyle('center'), ...(i === 0 ? groupStartStyle('Publish') : {}) }}>
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

// Padding lives on an inner div, NOT the <th> itself (2026-09-09, real bug
// found live — Chrome visually clips a sticky table cell's own padding-top
// right at the moment it's stuck, cropping the top of the header text with
// no clean workaround at the <th> level). Wrapping the actual content in a
// plain (non-sticky) child div sidesteps it entirely — the <th> stays
// sticky/positioned/bordered, the div carries every text/spacing style.
function thContentStyle(align: 'left' | 'center'): React.CSSProperties {
  return {
    padding: '10px 12px', textAlign: align, fontSize: '11px', fontWeight: 800, textTransform: 'uppercase',
    letterSpacing: '0.4px', color: 'var(--ink3)', whiteSpace: 'nowrap',
  }
}
// Explicit, equal height on every header cell (2026-09-09, real bug found
// live, confirmed via pixel measurement of an actual screenshot — row1's
// colSpan group headers (Collection/Production/Publish) rendered ~1px
// shorter than row2's own leaf headers, because row1 also contains the
// rowSpan=2 cells (Speaker/Ref/Producer/Confirmation Status) and the
// browser's row-height distribution across a mixed rowSpan/colSpan row
// isn't guaranteed to split evenly. That 1px difference was enough,
// combined with vertical centering, to visibly shift text closer to one
// edge in row1 than row2. Pinning every single-row header to the same
// explicit height (and every rowSpan=2 header to exactly double it)
// removes the ambiguity outright instead of trusting the browser to
// distribute it identically on its own.
const HEADER_ROW_HEIGHT = 39
function Th({ children, cellStyle, contentStyle, rowSpan, colSpan }: {
  children: React.ReactNode; cellStyle: React.CSSProperties; contentStyle: React.CSSProperties
  rowSpan?: number; colSpan?: number
}) {
  const height = HEADER_ROW_HEIGHT * (rowSpan ?? 1)
  return (
    <th rowSpan={rowSpan} colSpan={colSpan} style={{ height, verticalAlign: 'middle', ...cellStyle }}>
      <div style={contentStyle}>{children}</div>
    </th>
  )
}
function tdStyle(align: 'left' | 'center'): React.CSSProperties {
  return { padding: '10px 12px', textAlign: align, verticalAlign: 'middle' }
}

// A sticky cell needs its OWN explicit background — it doesn't reliably
// pick up its row's background the way a normal cell does, since sticky
// positioning paints it in a separate layer above whatever scrolls
// underneath. Every sticky cell on this page (header row cells AND the
// frozen Speaker column) shares the same var(--card-hi) — Speaker was
// var(--surface) originally, but per Madhu that made the frozen column
// look "plain"/unmarked; matching the header's own color instead makes
// it visually read as "this is pinned," not just coincidentally solid.
function stickyStyle(opts: { top?: number; left?: number; z: number }): React.CSSProperties {
  return {
    position: 'sticky',
    ...(opts.top !== undefined ? { top: opts.top } : {}),
    ...(opts.left !== undefined ? { left: opts.left } : {}),
    zIndex: opts.z,
    background: 'var(--card-hi)',
  }
}
