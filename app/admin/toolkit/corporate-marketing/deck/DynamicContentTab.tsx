'use client'

/*
  Dynamic Content tab. Four sub-sections:
    1. Company content — prose (overview, vision, mission, tagline, boilerplate)
    2. Statistics       — structured JSON (label + value pairs)
    3. Events           — read-only preview of upcoming/past from `events`
    4. Leadership       — staff from staff_members + per-person overrides

  Save behavior: each sub-section has its own save cadence to keep
  updates atomic and errors localised. Autosave-on-blur for prose;
  explicit save button for stats/leadership arrays.
*/

import { useCallback, useEffect, useState } from 'react'
import { BRAND, Card, SectionLabel, H2, PrimaryButton, GhostButton, ErrorBox, inputStyle, textareaStyle, fmtDate, initials } from './_shared'

type ContentMap = Record<string, { label: string; value_text: string | null; value_json: unknown; updated_at: string }>

const PROSE_KEYS = ['company_overview', 'vision', 'mission', 'tagline', 'boilerplate'] as const
const STAT_KEYS  = ['company_stats', 'event_series_stats', 'event_stats'] as const

type EventRow = { id: string; name: string; event_date: string | null; city: string | null; venue: string | null; type: string | null; status: string }
type LeaderRow = {
  id: string; name: string; role: string | null; department: string | null; email: string; job_level: string;
  include_in_deck: boolean; display_order: number; corporate_bio: string | null
}

const PROSE_LABELS: Record<string, string> = {
  company_overview: 'Company Overview',
  vision:           'Vision',
  mission:          'Mission',
  tagline:          'Tagline',
  boilerplate:      'Corporate Boilerplate',
}
const STAT_LABELS: Record<string, string> = {
  company_stats:       'Company Statistics',
  event_series_stats:  'Event Series Statistics',
  event_stats:         'Event Statistics',
}

export default function DynamicContentTab() {
  const [subTab, setSubTab] = useState<'company' | 'stats' | 'events' | 'leadership'>('company')

  return (
    <div style={{ display: 'grid', gap: '20px', maxWidth: '980px' }}>
      {/* Sub-tab strip */}
      <div style={{ display: 'flex', gap: '4px', background: '#fff', border: '1px solid #DDE8EE', borderRadius: '14px', padding: '4px', width: 'fit-content' }}>
        {([
          { id: 'company',    label: 'Company Content' },
          { id: 'stats',      label: 'Statistics' },
          { id: 'events',     label: 'Events' },
          { id: 'leadership', label: 'Leadership' },
        ] as const).map(t => {
          const active = subTab === t.id
          return (
            <button
              key={t.id}
              onClick={() => setSubTab(t.id)}
              style={{
                border: 'none',
                background: active ? BRAND : 'transparent',
                color: active ? '#fff' : '#5B7080',
                padding: '9px 16px',
                fontSize: '12px',
                fontWeight: 800,
                borderRadius: '10px',
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {t.label}
            </button>
          )
        })}
      </div>

      {subTab === 'company'    && <CompanyContentPanel />}
      {subTab === 'stats'      && <StatsPanel />}
      {subTab === 'events'     && <EventsPanel />}
      {subTab === 'leadership' && <LeadershipPanel />}
    </div>
  )
}

/* ────────────────────────────────────────────────────────────────
   Company content — prose fields
   ──────────────────────────────────────────────────────────────── */

function CompanyContentPanel() {
  const [content, setContent] = useState<ContentMap>({})
  const [drafts, setDrafts]   = useState<Record<string, string>>({})
  const [savedNote, setSavedNote] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(async () => {
    const res = await fetch('/api/corporate-marketing/content', { cache: 'no-store' })
    if (res.ok) {
      const d = await res.json()
      setContent(d.content ?? {})
      const drafts: Record<string, string> = {}
      for (const k of PROSE_KEYS) drafts[k] = d.content?.[k]?.value_text ?? ''
      setDrafts(drafts)
    }
  }, [])
  useEffect(() => { load() }, [load])

  async function saveKey(key: string) {
    setErr(null)
    try {
      const res = await fetch('/api/corporate-marketing/content', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key,
          label:      PROSE_LABELS[key] ?? key,
          value_text: drafts[key] ?? '',
        }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d?.error ?? 'Save failed')
      }
      setSavedNote(`Saved ${PROSE_LABELS[key] ?? key}`)
      setTimeout(() => setSavedNote(null), 2000)
      await load()
    } catch (e) {
      setErr((e as Error).message)
    }
  }

  return (
    <Card>
      <SectionLabel>Company Content</SectionLabel>
      <H2 style={{ marginBottom: '6px' }}>Long-form corporate copy</H2>
      <div style={{ fontSize: '13px', color: '#5B7080', lineHeight: 1.6, marginBottom: '18px' }}>
        Prose fields used across the deck. Edit, click <strong>Save</strong> — the last-saved time appears next to each field.
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {PROSE_KEYS.map(key => {
          const label = PROSE_LABELS[key] ?? key
          const meta = content[key]
          const isTagline = key === 'tagline'
          return (
            <div key={key}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                <label style={{ fontSize: '12px', fontWeight: 800, color: '#0F1923', letterSpacing: '0.3px' }}>
                  {label}
                </label>
                {meta?.updated_at && (
                  <span style={{ fontSize: '11px', color: '#94A3B8', fontWeight: 600 }}>
                    Updated {fmtDate(meta.updated_at)}
                  </span>
                )}
              </div>
              {isTagline ? (
                <input
                  type="text"
                  value={drafts[key] ?? ''}
                  onChange={e => setDrafts({ ...drafts, [key]: e.target.value })}
                  placeholder="e.g. Shaping the future of enterprise events"
                  style={inputStyle}
                />
              ) : (
                <textarea
                  value={drafts[key] ?? ''}
                  onChange={e => setDrafts({ ...drafts, [key]: e.target.value })}
                  placeholder={`Enter ${label.toLowerCase()}…`}
                  style={{ ...textareaStyle, minHeight: key === 'boilerplate' || key === 'company_overview' ? '120px' : '80px' }}
                />
              )}
              <div style={{ marginTop: '8px' }}>
                <PrimaryButton onClick={() => saveKey(key)} style={{ padding: '8px 16px', fontSize: '12px' }}>
                  Save
                </PrimaryButton>
              </div>
            </div>
          )
        })}
      </div>

      {savedNote && <div style={{ marginTop: '14px', fontSize: '12px', color: '#00897B', fontWeight: 700 }}>{savedNote}</div>}
      {err && <ErrorBox>{err}</ErrorBox>}
    </Card>
  )
}

/* ────────────────────────────────────────────────────────────────
   Statistics — structured JSON of { label, value } pairs
   ──────────────────────────────────────────────────────────────── */

type Stat = { label: string; value: string }

function StatsPanel() {
  const [content, setContent] = useState<ContentMap>({})
  const [drafts, setDrafts]   = useState<Record<string, Stat[]>>({})
  const [savedNote, setSavedNote] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(async () => {
    const res = await fetch('/api/corporate-marketing/content', { cache: 'no-store' })
    if (res.ok) {
      const d = await res.json()
      setContent(d.content ?? {})
      const drafts: Record<string, Stat[]> = {}
      for (const k of STAT_KEYS) {
        const raw = d.content?.[k]?.value_json
        drafts[k] = Array.isArray(raw) ? (raw as Stat[]).filter(s => s && typeof s === 'object') : []
      }
      setDrafts(drafts)
    }
  }, [])
  useEffect(() => { load() }, [load])

  function updateStat(key: string, idx: number, field: 'label' | 'value', val: string) {
    setDrafts(prev => {
      const list = [...(prev[key] ?? [])]
      list[idx] = { ...list[idx], [field]: val }
      return { ...prev, [key]: list }
    })
  }
  function addStat(key: string) {
    setDrafts(prev => ({ ...prev, [key]: [...(prev[key] ?? []), { label: '', value: '' }] }))
  }
  function removeStat(key: string, idx: number) {
    setDrafts(prev => ({ ...prev, [key]: (prev[key] ?? []).filter((_, i) => i !== idx) }))
  }

  async function saveKey(key: string) {
    setErr(null)
    try {
      const cleaned = (drafts[key] ?? []).filter(s => s.label.trim() || s.value.trim())
      const res = await fetch('/api/corporate-marketing/content', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key,
          label:      STAT_LABELS[key] ?? key,
          value_json: cleaned,
          value_text: null,
        }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d?.error ?? 'Save failed')
      }
      setSavedNote(`Saved ${STAT_LABELS[key] ?? key}`)
      setTimeout(() => setSavedNote(null), 2000)
      await load()
    } catch (e) {
      setErr((e as Error).message)
    }
  }

  return (
    <Card>
      <SectionLabel>Statistics</SectionLabel>
      <H2 style={{ marginBottom: '6px' }}>Numbers that anchor the deck</H2>
      <div style={{ fontSize: '13px', color: '#5B7080', lineHeight: 1.6, marginBottom: '18px' }}>
        Each stat is a label + value pair. Examples: <em>&ldquo;Years in business&rdquo; → &ldquo;17&rdquo;</em>, <em>&ldquo;Countries&rdquo; → &ldquo;50+&rdquo;</em>.
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '26px' }}>
        {STAT_KEYS.map(key => {
          const meta = content[key]
          const list = drafts[key] ?? []
          return (
            <div key={key}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                <label style={{ fontSize: '12px', fontWeight: 800, color: '#0F1923', letterSpacing: '0.3px' }}>
                  {STAT_LABELS[key] ?? key}
                </label>
                {meta?.updated_at && (
                  <span style={{ fontSize: '11px', color: '#94A3B8', fontWeight: 600 }}>
                    Updated {fmtDate(meta.updated_at)}
                  </span>
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {list.length === 0 && (
                  <div style={{ fontSize: '12px', color: '#94A3B8', fontStyle: 'italic', padding: '10px 0' }}>
                    No stats yet — click Add stat below.
                  </div>
                )}
                {list.map((s, i) => (
                  <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <input
                      value={s.label}
                      onChange={e => updateStat(key, i, 'label', e.target.value)}
                      placeholder="Label"
                      style={{ ...inputStyle, flex: 2 }}
                    />
                    <input
                      value={s.value}
                      onChange={e => updateStat(key, i, 'value', e.target.value)}
                      placeholder="Value"
                      style={{ ...inputStyle, flex: 1 }}
                    />
                    <button
                      onClick={() => removeStat(key, i)}
                      title="Remove"
                      style={{ background: 'transparent', border: 'none', color: '#94A3B8', cursor: 'pointer', padding: '8px', fontSize: '18px', lineHeight: 1 }}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                <GhostButton onClick={() => addStat(key)}>+ Add stat</GhostButton>
                <PrimaryButton onClick={() => saveKey(key)} style={{ padding: '8px 16px', fontSize: '12px' }}>Save</PrimaryButton>
              </div>
            </div>
          )
        })}
      </div>

      {savedNote && <div style={{ marginTop: '14px', fontSize: '12px', color: '#00897B', fontWeight: 700 }}>{savedNote}</div>}
      {err && <ErrorBox>{err}</ErrorBox>}
    </Card>
  )
}

/* ────────────────────────────────────────────────────────────────
   Events — read-only preview from `events` table
   ──────────────────────────────────────────────────────────────── */

function EventsPanel() {
  const [upcoming, setUpcoming] = useState<EventRow[]>([])
  const [past, setPast]         = useState<EventRow[]>([])
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    fetch('/api/corporate-marketing/events', { cache: 'no-store' })
      .then(r => r.json())
      .then(d => { setUpcoming(d.upcoming ?? []); setPast(d.past ?? []) })
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <Card><div style={{ fontSize: '13px', color: '#5B7080' }}>Loading events…</div></Card>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      <Card>
        <SectionLabel>Upcoming events</SectionLabel>
        <H2 style={{ marginBottom: '6px' }}>Deck reflects the live Events module</H2>
        <div style={{ fontSize: '13px', color: '#5B7080', lineHeight: 1.6, marginBottom: '18px' }}>
          This is a preview of what the deck will pull. Edit events in the <a href="/admin/events" style={{ color: BRAND, fontWeight: 700 }}>Events module</a> — changes appear here automatically. No duplication.
        </div>
        <EventList rows={upcoming} emptyText="No upcoming events." />
      </Card>

      <Card>
        <SectionLabel>Past events</SectionLabel>
        <H2 style={{ marginBottom: '6px' }}>Most recent 24 completed events</H2>
        <div style={{ fontSize: '13px', color: '#5B7080', lineHeight: 1.6, marginBottom: '18px' }}>
          Same source as above. Ordered by date, most recent first.
        </div>
        <EventList rows={past} emptyText="No past events yet." />
      </Card>
    </div>
  )
}

function EventList({ rows, emptyText }: { rows: EventRow[]; emptyText: string }) {
  if (rows.length === 0) return <div style={{ fontSize: '12px', color: '#94A3B8', fontStyle: 'italic' }}>{emptyText}</div>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {rows.map(e => (
        <div key={e.id} style={{ display: 'flex', gap: '14px', padding: '12px 14px', border: '1px solid #EEF3F7', borderRadius: '12px', background: '#FAFBFC', alignItems: 'center' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '13px', fontWeight: 800, color: '#0F1923' }}>{e.name}</div>
            <div style={{ fontSize: '11px', color: '#5B7080', marginTop: '3px', display: 'flex', gap: '10px' }}>
              {e.event_date && <span>{fmtDate(e.event_date)}</span>}
              {e.city && <span>{e.city}</span>}
              {e.venue && <span>{e.venue}</span>}
              {e.type && <span>{e.type}</span>}
            </div>
          </div>
          <span style={{ fontSize: '10px', fontWeight: 800, letterSpacing: '0.5px', textTransform: 'uppercase', color: '#5B7080', background: '#EEF3F7', padding: '3px 10px', borderRadius: '10px' }}>{e.status}</span>
        </div>
      ))}
    </div>
  )
}

/* ────────────────────────────────────────────────────────────────
   Leadership — reuses staff_members + override table
   ──────────────────────────────────────────────────────────────── */

function LeadershipPanel() {
  const [rows, setRows]     = useState<LeaderRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [err, setErr]       = useState<string | null>(null)
  const [dirty, setDirty]   = useState(false)

  const load = useCallback(async () => {
    const res = await fetch('/api/corporate-marketing/leadership', { cache: 'no-store' })
    if (res.ok) {
      const d = await res.json()
      setRows(d.candidates ?? [])
    }
    setLoading(false)
    setDirty(false)
  }, [])
  useEffect(() => { load() }, [load])

  function updateRow(id: string, patch: Partial<LeaderRow>) {
    setRows(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r))
    setDirty(true)
  }

  async function saveAll() {
    setSaving(true)
    setErr(null)
    try {
      const res = await fetch('/api/corporate-marketing/leadership', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          updates: rows.map(r => ({
            staff_id:        r.id,
            include_in_deck: r.include_in_deck,
            display_order:   r.display_order ?? 0,
            corporate_bio:   r.corporate_bio,
          })),
        }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d?.error ?? 'Save failed')
      }
      await load()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <Card><div style={{ fontSize: '13px', color: '#5B7080' }}>Loading leadership…</div></Card>

  const included = rows.filter(r => r.include_in_deck)
  const others   = rows.filter(r => !r.include_in_deck)

  return (
    <Card>
      <SectionLabel>Leadership</SectionLabel>
      <H2 style={{ marginBottom: '6px' }}>Who appears in the deck</H2>
      <div style={{ fontSize: '13px', color: '#5B7080', lineHeight: 1.6, marginBottom: '18px' }}>
        People come from <strong>staff_members</strong> (single source of truth — do not duplicate). You control who&apos;s included, in what order, and can add an optional corporate bio just for the deck.
      </div>

      {included.length > 0 && (
        <div style={{ marginBottom: '18px' }}>
          <div style={{ fontSize: '11px', fontWeight: 800, color: BRAND, letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '10px' }}>
            In deck ({included.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {included.map(r => <LeaderRowCard key={r.id} row={r} onChange={p => updateRow(r.id, p)} included />)}
          </div>
        </div>
      )}

      <div>
        <div style={{ fontSize: '11px', fontWeight: 800, color: '#94A3B8', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '10px' }}>
          Available ({others.length})
        </div>
        {others.length === 0 && <div style={{ fontSize: '12px', color: '#94A3B8', fontStyle: 'italic' }}>Everyone is included.</div>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {others.map(r => <LeaderRowCard key={r.id} row={r} onChange={p => updateRow(r.id, p)} included={false} />)}
        </div>
      </div>

      <div style={{ marginTop: '20px', display: 'flex', gap: '10px', alignItems: 'center' }}>
        <PrimaryButton onClick={saveAll} disabled={saving || !dirty}>
          {saving ? 'Saving…' : dirty ? 'Save changes' : 'Saved'}
        </PrimaryButton>
        {dirty && <span style={{ fontSize: '12px', color: '#94A3B8' }}>Unsaved changes</span>}
      </div>

      {err && <ErrorBox>{err}</ErrorBox>}
    </Card>
  )
}

function LeaderRowCard({ row, onChange, included }: { row: LeaderRow; onChange: (patch: Partial<LeaderRow>) => void; included: boolean }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div style={{ border: '1px solid #DDE8EE', borderRadius: '12px', padding: '12px 14px', background: included ? '#fff' : '#FAFBFC' }}>
      <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
        <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={row.include_in_deck}
            onChange={e => onChange({ include_in_deck: e.target.checked })}
            style={{ width: '16px', height: '16px', accentColor: BRAND, cursor: 'pointer' }}
          />
        </label>
        <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: `${BRAND}12`, color: BRAND, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 800, flexShrink: 0 }}>
          {initials(row.name)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '13px', fontWeight: 800, color: '#0F1923' }}>{row.name}</div>
          <div style={{ fontSize: '11px', color: '#5B7080', marginTop: '2px' }}>
            {[row.role, row.department].filter(Boolean).join(' · ') || row.email}
          </div>
        </div>
        {included && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '10px', fontWeight: 700, color: '#94A3B8', letterSpacing: '0.5px', textTransform: 'uppercase' }}>Order</span>
            <input
              type="number"
              value={row.display_order ?? 0}
              onChange={e => onChange({ display_order: Number.parseInt(e.target.value || '0', 10) })}
              style={{ width: '60px', padding: '5px 8px', borderRadius: '8px', border: '1px solid #DDE8EE', fontSize: '12px', fontFamily: 'inherit', textAlign: 'center' }}
            />
          </div>
        )}
        <button
          onClick={() => setExpanded(x => !x)}
          style={{ background: 'transparent', border: '1px solid #DDE8EE', borderRadius: '8px', padding: '5px 10px', fontSize: '11px', fontWeight: 700, color: '#5B7080', cursor: 'pointer', fontFamily: 'inherit' }}
        >
          {expanded ? 'Hide bio' : row.corporate_bio ? 'Edit bio' : 'Add bio'}
        </button>
      </div>
      {expanded && (
        <div style={{ marginTop: '10px' }}>
          <textarea
            value={row.corporate_bio ?? ''}
            onChange={e => onChange({ corporate_bio: e.target.value })}
            placeholder="Optional corporate bio for the deck (overrides staff profile bio)."
            style={{ ...textareaStyle, minHeight: '70px' }}
          />
        </div>
      )}
    </div>
  )
}
