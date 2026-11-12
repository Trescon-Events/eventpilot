'use client'

import { use, useCallback, useEffect, useRef, useState } from 'react'
import PageHeader from '@/app/components/PageHeader'
import { Badge, Button, Card, Input } from '@/app/components/ui'
import { useBreadcrumbLabel } from '@/app/lib/nav/breadcrumb-labels'
import { notify } from '@/app/lib/ui/notify'
import FilterPanel, { EMPTY_FILTERS, type Facets, type Filters } from './FilterPanel'

/* Emails → Lists (2026-11-12). A list is who an email goes to. Two kinds, as in HubSpot:
     Active  keeps only its criteria and is worked out again every time it is used, so when more speakers match later it grows by itself.
     Static  the people matching when it was made are copied in and stay; individuals can still be added or removed by hand.
   The page opens on every list with its type and size; "Create list" opens the builder (criteria on the left, who matches on the right, name and type on top). */

type IndexList = { id: string; name: string; description: string | null; type: 'static' | 'active'; event_id: string | null; created_at: string; updated_at: string; will_receive: number; people: number; used_in: number; in_use: boolean }
type Person = { key: string; contact_id: string | null; name: string; company: string | null; role: string | null; statuses: { event_name: string; status: string | null }[]; last_event_end: string | null; last_emailed: string | null; to?: string | null; cc?: string[]; via_contact?: boolean; reason?: string | null; company_changed?: { from: string; to: string } | null; check_address?: boolean }
type Preview = { summary: { will_receive: number; excluded: number; reasons: Record<string, number>; via_contact: number; company_changed: number }; recipients: Person[]; excluded: Person[]; facets: Facets }
type Detail = {
  list: { id: string; name: string; type: 'static' | 'active'; filters: Filters; excluded: string[]; members: number; event_id: string | null; description: string | null; created_at: string; updated_at: string }
  summary: Preview['summary']; people: Person[]; used_in: { id: string; name: string; status: string; created_at: string }[]; joined_since_last_email: string[]
}

const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—')
const label: React.CSSProperties = { fontSize: '12.5px', fontWeight: 700, color: 'var(--ink3)', marginBottom: '4px' }

function PersonLine({ p, actions }: { p: Person; actions?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border-light)', flexWrap: 'wrap' }}>
      <div style={{ minWidth: 0, flex: '1 1 300px' }}>
        <div style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--ink)' }}>{p.name}{p.company ? <span style={{ fontWeight: 500, color: 'var(--ink3)' }}> · {p.company}{p.role ? `, ${p.role}` : ''}</span> : null}</div>
        <div style={{ fontSize: '12px', color: 'var(--ink3)', marginTop: '2px', lineHeight: 1.5 }}>
          {p.statuses.map(x => `${x.event_name}: ${x.status ?? 'no status'}`).join(' · ')}{p.last_event_end ? ` · last event ended ${day(p.last_event_end)}` : ''}{p.last_emailed ? ` · last emailed ${day(p.last_emailed)}` : ' · never emailed'}
        </div>
        {p.to && <div style={{ fontSize: '12px', color: 'var(--ink2)', marginTop: '2px' }}>{p.to}{p.cc && p.cc.length > 0 ? ` · cc ${p.cc.length}` : ''}{p.via_contact ? ' · via additional contact' : ''}</div>}
        {p.check_address && <div style={{ fontSize: '12px', color: 'var(--amber)', marginTop: '2px' }}>An auto-reply said this person may have left. Check their address before emailing.</div>}
        {p.company_changed && <div style={{ fontSize: '12px', color: 'var(--amber)', marginTop: '2px' }}>Moved from {p.company_changed.from} to {p.company_changed.to}</div>}
        {p.reason && <div style={{ marginTop: '4px' }}><Badge color="amber">{p.reason}</Badge></div>}
      </div>
      {actions && <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>{actions}</div>}
    </div>
  )
}

export default function ListsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = use(params)
  const [eventName, setEventName] = useState<string | null>(null)
  useBreadcrumbLabel(eventId, eventName)
  const [view, setView] = useState<'index' | 'create' | string>('index')
  const [lists, setLists] = useState<IndexList[] | null>(null)
  const [facets, setFacets] = useState<Facets | null>(null)
  const [busy, setBusy] = useState(false)

  const loadIndex = useCallback(async () => {
    const r = await fetch(`/api/events/stakeholders/email-lists?event_id=${eventId}`)
    const d = await r.json().catch(() => ({}))
    if (r.ok) { setLists(d.lists ?? []); setFacets(d.facets ?? null) } else setLists([])
  }, [eventId])
  // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch on mount
  useEffect(() => { void loadIndex() }, [loadIndex])
  useEffect(() => { fetch(`/api/events?id=${eventId}`).then(r => r.json()).then(d => setEventName((Array.isArray(d) ? d[0] : d)?.name ?? null)).catch(() => {}) }, [eventId])

  async function remove(l: IndexList) {
    if (!window.confirm(`Delete the list “${l.name}”? Emails already sent keep their record.`)) return
    setBusy(true)
    const r = await fetch(`/api/events/stakeholders/email-lists?id=${l.id}`, { method: 'DELETE' })
    const d = await r.json().catch(() => ({}))
    setBusy(false)
    notify(r.ok ? 'List deleted.' : d.error ?? 'Could not delete it.', r.ok ? 'success' : 'error')
    if (r.ok) { if (view === l.id) setView('index'); void loadIndex() }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Stakeholder Hub"
        title={view === 'create' ? 'Create list' : view !== 'index' ? (lists?.find(l => l.id === view)?.name ?? 'List') : 'Lists'}
        description={view === 'index' ? 'Who your emails go to. An active list updates itself as more speakers match; a static list stays as it was made.' : 'Choose the criteria, see exactly who matches, then name the list and pick its type.'}
        backHref={view === 'index' ? `/admin/events/${eventId}/stakeholders` : undefined}
        backLabel={view === 'index' ? 'Back to Stakeholder Hub' : undefined}
        actions={view === 'index' ? <Button variant="teal" onClick={() => setView('create')}>+ Create list</Button> : <Button variant="ghost" onClick={() => { setView('index'); void loadIndex() }}>← All lists</Button>}
      />
      <div style={{ padding: '4px 32px 56px', maxWidth: '1280px' }}>
        {view === 'index' && (
          <div style={{ display: 'grid', gap: '10px' }}>
            {lists === null && <div style={{ color: 'var(--ink3)', fontSize: '13px' }}>Loading…</div>}
            {lists && lists.length === 0 && (
              <div style={{ padding: '28px', borderRadius: '14px', border: '1px solid var(--border)', background: 'var(--card)', fontSize: '14px', color: 'var(--ink2)', lineHeight: 1.7 }}>
                No lists yet. A list is who an email goes to, for example “everyone who spoke at BSS 2026”. <button type="button" onClick={() => setView('create')} style={{ background: 'none', border: 'none', padding: 0, color: 'var(--teal-mid)', fontWeight: 800, cursor: 'pointer' }}>Create your first list</button>.
              </div>
            )}
            {(lists ?? []).map(l => (
              <div key={l.id} style={{ display: 'flex', gap: '14px', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', padding: '14px 18px', borderRadius: '14px', border: '1px solid var(--border)', background: 'var(--card)' }}>
                <button type="button" onClick={() => setView(l.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0, flex: '1 1 300px', minWidth: 0 }}>
                  <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--ink)' }}>{l.name} <Badge color={l.type === 'active' ? 'teal' : 'purple'}>{l.type}</Badge>{l.event_id === null ? <Badge color="grey">any event</Badge> : null}</div>
                  {l.description && <div style={{ fontSize: '12.5px', color: 'var(--ink3)', marginTop: '2px' }}>{l.description}</div>}
                  <div style={{ fontSize: '12px', color: 'var(--ink3)', marginTop: '3px' }}>{l.type === 'active' ? 'Updates automatically' : 'Fixed'} · updated {day(l.updated_at)} · used in {l.used_in} email{l.used_in === 1 ? '' : 's'}</div>
                </button>
                <div style={{ display: 'flex', gap: '18px', alignItems: 'center' }}>
                  <div style={{ fontSize: '12px', color: 'var(--ink3)' }}><strong style={{ fontSize: '17px', color: 'var(--ink)', display: 'block' }}>{l.will_receive}</strong>would receive{l.people > l.will_receive ? ` (of ${l.people})` : ''}</div>
                  <Button variant="ghost" onClick={() => setView(l.id)}>Open</Button>
                  <a href={`/api/events/stakeholders/email-lists/${l.id}/export?event_id=${eventId}`} style={{ textDecoration: 'none' }}><Button variant="ghost">Export CSV</Button></a>
                  <Button variant="ghost" onClick={() => remove(l)} disabled={busy || l.in_use}>Delete</Button>
                </div>
              </div>
            ))}
          </div>
        )}
        {view === 'create' && <Builder eventId={eventId} facets={facets} onDone={id => { void loadIndex(); setView(id) }} />}
        {view !== 'index' && view !== 'create' && <ListDetail eventId={eventId} id={view} facets={facets} onChanged={() => void loadIndex()} />}
      </div>
    </div>
  )
}

/** Criteria on the left, who matches on the right, name and type on top. */
function Builder({ eventId, facets, onDone }: { eventId: string; facets: Facets | null; onDone: (id: string) => void }) {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [type, setType] = useState<'active' | 'static'>('active')
  const [anyEvent, setAnyEvent] = useState(false)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [tab, setTab] = useState<'receive' | 'left'>('receive')
  const [saving, setSaving] = useState(false)
  const seq = useRef(0)

  useEffect(() => {
    const t = setTimeout(async () => {
      const mine = ++seq.current
      const r = await fetch('/api/events/stakeholders/email-people', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event_id: eventId, filters }) })
      const d = await r.json().catch(() => null)
      if (mine === seq.current && r.ok) setPreview(d)
    }, 250)
    return () => clearTimeout(t)
  }, [eventId, filters])

  async function save() {
    setSaving(true)
    const r = await fetch('/api/events/stakeholders/email-lists', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event_id: eventId, name, description, type, filters, any_event: anyEvent }) })
    const d = await r.json().catch(() => ({}))
    setSaving(false)
    if (!r.ok) { notify(d.error ?? 'Could not create the list.', 'error'); return }
    notify(type === 'static' ? `Static list created with ${d.members} people.` : 'Active list created. It updates itself as more people match.', 'success')
    onDone(d.list.id)
  }

  const s = preview?.summary
  const rows = tab === 'receive' ? preview?.recipients ?? [] : preview?.excluded ?? []
  return (
    <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
      <div style={{ width: '320px', flexShrink: 0 }}><FilterPanel filters={filters} onChange={setFilters} facets={facets ?? preview?.facets ?? null} /></div>
      <div style={{ flex: '1 1 560px', minWidth: 0, display: 'grid', gap: '14px' }}>
        <Card padded>
          <div style={{ display: 'grid', gap: '12px' }}>
            <div><div style={label}>List name</div><Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. BSS 2026 speakers who spoke" /></div>
            <div><div style={label}>Description (optional)</div><Input value={description} onChange={e => setDescription(e.target.value)} /></div>
            <div>
              <div style={label}>Type</div>
              <div style={{ display: 'grid', gap: '8px', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
                {([['active', 'Active list', 'Keeps only the criteria and updates itself. If 100 speakers match today and more are added later, they join the list automatically.'], ['static', 'Static list', `Copies the ${s?.will_receive !== undefined ? s.will_receive + s.excluded : 'matching'} people who match right now and stays exactly as it is. You can still add or remove individuals by hand.`]] as const).map(([k, t, d]) => (
                  <button key={k} type="button" onClick={() => setType(k)} aria-pressed={type === k} style={{ textAlign: 'left', padding: '12px 14px', borderRadius: '12px', cursor: 'pointer', border: `2px solid ${type === k ? 'var(--teal-mid)' : 'var(--border)'}`, background: type === k ? 'var(--teal-light)' : 'var(--card)', color: 'var(--ink)' }}>
                    <div style={{ fontSize: '14px', fontWeight: 800 }}>{t}</div><div style={{ fontSize: '12.5px', color: 'var(--ink2)', marginTop: '3px', lineHeight: 1.5 }}>{d}</div>
                  </button>
                ))}
              </div>
            </div>
            <label style={{ display: 'flex', gap: '8px', alignItems: 'center', fontSize: '13px', color: 'var(--ink2)', cursor: 'pointer' }}><input type="checkbox" checked={anyEvent} onChange={() => setAnyEvent(v => !v)} /> Usable from any event (otherwise only from this event)</label>
            <div><Button variant="teal" onClick={save} disabled={saving || !name.trim()}>{saving ? 'Creating…' : 'Create list'}</Button></div>
          </div>
        </Card>
        <Card padded>
          <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--ink)' }}>
            {s ? <>{s.will_receive} would receive an email{s.excluded > 0 && <span style={{ fontWeight: 600, color: 'var(--ink3)' }}> · {s.excluded} left out</span>}</> : 'Building preview…'}
          </div>
          {s && s.excluded > 0 && <div style={{ fontSize: '12.5px', color: 'var(--ink2)', marginTop: '6px', lineHeight: 1.6 }}>{Object.entries(s.reasons).map(([k, n]) => `${n} ${k.toLowerCase()}`).join(' · ')}</div>}
          {s && s.via_contact > 0 && <div style={{ fontSize: '12.5px', color: 'var(--ink2)', marginTop: '4px' }}>{s.via_contact} have no address of their own: the email goes to their additional contacts, addressed to the speaker.</div>}
          <div style={{ display: 'flex', gap: '8px', margin: '12px 0 8px', borderBottom: '1px solid var(--border-light)' }}>
            {([['receive', `Would receive (${s?.will_receive ?? 0})`], ['left', `Left out (${s?.excluded ?? 0})`]] as const).map(([k, l]) => (
              <button key={k} type="button" onClick={() => setTab(k)} aria-current={tab === k ? 'page' : undefined} style={{ padding: '8px 12px', fontSize: '13px', fontWeight: 700, border: 'none', background: 'none', cursor: 'pointer', color: tab === k ? 'var(--teal-mid)' : 'var(--ink3)', borderBottom: `2px solid ${tab === k ? 'var(--teal-mid)' : 'transparent'}` }}>{l}</button>
            ))}
          </div>
          {rows.length === 0 ? <div style={{ fontSize: '13px', color: 'var(--ink3)', padding: '14px 0' }}>{tab === 'receive' ? 'Nobody matches these criteria.' : 'Nobody is left out.'}</div> : (
            <div style={{ maxHeight: '560px', overflowY: 'auto' }}>
              {rows.slice(0, 300).map(p => <PersonLine key={p.key} p={p} />)}
              {rows.length > 300 && <div style={{ fontSize: '12px', color: 'var(--ink3)', padding: '10px 0' }}>Showing the first 300 of {rows.length}.</div>}
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}

/** One list: its people, the emails that used it, and (active) its criteria or (static) adding and removing individuals. */
function ListDetail({ eventId, id, facets, onChanged }: { eventId: string; id: string; facets: Facets | null; onChanged: () => void }) {
  const [d, setD] = useState<Detail | null>(null)
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [live, setLive] = useState<Preview | null>(null)
  const [tab, setTab] = useState<'receive' | 'left'>('receive')
  const [search, setSearch] = useState('')
  const [found, setFound] = useState<{ key: string; name: string; company: string | null }[]>([])
  const [busy, setBusy] = useState(false)
  const [addFilters, setAddFilters] = useState<Filters | null>(null)

  const load = useCallback(async () => {
    const r = await fetch(`/api/events/stakeholders/email-lists?event_id=${eventId}&id=${id}`)
    const j = await r.json().catch(() => null)
    if (r.ok) { setD(j); setFilters({ ...EMPTY_FILTERS, ...j.list.filters }); setName(j.list.name); setDescription(j.list.description ?? '') }
  }, [eventId, id])
  // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch on mount
  useEffect(() => { void load() }, [load])

  // an active list's criteria are edited with a live preview
  useEffect(() => {
    if (d?.list.type !== 'active') return
    const t = setTimeout(async () => {
      const r = await fetch('/api/events/stakeholders/email-people', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event_id: eventId, filters, excluded_contact_ids: d.list.excluded }) })
      if (r.ok) setLive(await r.json())
    }, 250)
    return () => clearTimeout(t)
  }, [eventId, filters, d])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- search results follow the typed text
    if (search.trim().length < 2) { setFound([]); return }
    const t = setTimeout(async () => {
      const r = await fetch(`/api/events/stakeholders/email-people/search?event_id=${eventId}&q=${encodeURIComponent(search.trim())}`)
      if (r.ok) setFound((await r.json()).people ?? [])
    }, 250)
    return () => clearTimeout(t)
  }, [eventId, search])

  async function patch(body: Record<string, unknown>, ok = 'Saved.') {
    setBusy(true)
    const r = await fetch(`/api/events/stakeholders/email-lists?id=${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const j = await r.json().catch(() => ({}))
    setBusy(false)
    notify(r.ok ? ok : j.error ?? 'Could not save.', r.ok ? 'success' : 'error')
    if (r.ok) { await load(); onChanged() }
  }

  if (!d) return <div style={{ color: 'var(--ink3)', fontSize: '13px' }}>Loading…</div>
  const isStatic = d.list.type === 'static'
  const recipients = d.people.filter(p => !p.reason), left = d.people.filter(p => p.reason)
  const rows = isStatic ? (tab === 'receive' ? recipients : left) : (tab === 'receive' ? live?.recipients ?? [] : live?.excluded ?? [])
  const sum = isStatic ? d.summary : live?.summary ?? d.summary

  return (
    <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
      {!isStatic && <div style={{ width: '320px', flexShrink: 0 }}><FilterPanel filters={filters} onChange={setFilters} facets={facets} /></div>}
      <div style={{ flex: '1 1 560px', minWidth: 0, display: 'grid', gap: '14px' }}>
        <Card padded>
          <div style={{ display: 'grid', gap: '10px' }}>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
              <Badge color={isStatic ? 'purple' : 'teal'}>{d.list.type}</Badge>
              <span style={{ fontSize: '12.5px', color: 'var(--ink3)' }}>{isStatic ? `Fixed: ${d.list.members} people were put in it. Add or remove individuals below.` : 'Updates automatically every time it is used.'}</span>
            </div>
            <div><div style={label}>Name</div><Input value={name} onChange={e => setName(e.target.value)} /></div>
            <div><div style={label}>Description</div><Input value={description} onChange={e => setDescription(e.target.value)} /></div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <Button variant="teal" disabled={busy || !name.trim()} onClick={() => patch(isStatic ? { name, description } : { name, description, filters }, isStatic ? 'Saved.' : 'Saved. The list now follows these criteria.')}>Save{isStatic ? '' : ' name and criteria'}</Button>
              <a href={`/api/events/stakeholders/email-lists/${id}/export?event_id=${eventId}`} style={{ textDecoration: 'none' }}><Button variant="ghost">Export CSV</Button></a>
            </div>
          </div>
        </Card>

        {d.used_in.length > 0 && (
          <Card padded>
            <div style={{ fontSize: '12px', fontWeight: 800, letterSpacing: '0.5px', textTransform: 'uppercase', color: 'var(--ink3)', marginBottom: '6px' }}>Used in</div>
            {d.used_in.map(u => <div key={u.id} style={{ fontSize: '13px', color: 'var(--ink)', padding: '3px 0' }}>{u.name} <Badge color={u.status === 'sent' ? 'teal' : u.status === 'scheduled' ? 'purple' : 'grey'}>{u.status}</Badge> <span style={{ color: 'var(--ink3)' }}>{day(u.created_at)}</span></div>)}
            {!isStatic && d.joined_since_last_email.length > 0 && <div style={{ fontSize: '12.5px', color: 'var(--ink2)', marginTop: '8px', lineHeight: 1.6 }}><strong>{d.joined_since_last_email.length} joined since the last email:</strong> {d.joined_since_last_email.slice(0, 12).join(', ')}{d.joined_since_last_email.length > 12 ? '…' : ''}</div>}
          </Card>
        )}

        {isStatic && (
          <Card padded>
            <div style={{ fontSize: '12px', fontWeight: 800, letterSpacing: '0.5px', textTransform: 'uppercase', color: 'var(--ink3)', marginBottom: '8px' }}>Add people</div>
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, company or email…" />
            {found.map(f => <div key={f.key} style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--border-light)', fontSize: '13px' }}><span>{f.name}{f.company ? <span style={{ color: 'var(--ink3)' }}> · {f.company}</span> : null}</span><Button variant="ghost" onClick={() => patch({ add_members: [f.key] }, `${f.name} added.`)} disabled={busy}>Add</Button></div>)}
            <div style={{ marginTop: '10px' }}>
              {addFilters === null ? <Button variant="ghost" onClick={() => setAddFilters(EMPTY_FILTERS)}>Add everyone matching some criteria…</Button> : (
                <div style={{ display: 'grid', gap: '10px' }}>
                  <FilterPanel filters={addFilters} onChange={setAddFilters} facets={facets} />
                  <div style={{ display: 'flex', gap: '8px' }}><Button variant="teal" disabled={busy} onClick={() => { void patch({ add_from_filters: addFilters }, 'Everyone matching was added.'); setAddFilters(null) }}>Add everyone matching</Button><Button variant="ghost" onClick={() => setAddFilters(null)}>Cancel</Button></div>
                </div>
              )}
            </div>
          </Card>
        )}

        <Card padded>
          <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--ink)' }}>{sum.will_receive} would receive an email{sum.excluded > 0 && <span style={{ fontWeight: 600, color: 'var(--ink3)' }}> · {sum.excluded} left out</span>}</div>
          {sum.excluded > 0 && <div style={{ fontSize: '12.5px', color: 'var(--ink2)', marginTop: '6px' }}>{Object.entries(sum.reasons).map(([k, n]) => `${n} ${k.toLowerCase()}`).join(' · ')}</div>}
          <div style={{ display: 'flex', gap: '8px', margin: '12px 0 8px', borderBottom: '1px solid var(--border-light)' }}>
            {([['receive', `Would receive (${sum.will_receive})`], ['left', `Left out (${sum.excluded})`]] as const).map(([k, l]) => (
              <button key={k} type="button" onClick={() => setTab(k)} aria-current={tab === k ? 'page' : undefined} style={{ padding: '8px 12px', fontSize: '13px', fontWeight: 700, border: 'none', background: 'none', cursor: 'pointer', color: tab === k ? 'var(--teal-mid)' : 'var(--ink3)', borderBottom: `2px solid ${tab === k ? 'var(--teal-mid)' : 'transparent'}` }}>{l}</button>
            ))}
          </div>
          {rows.length === 0 ? <div style={{ fontSize: '13px', color: 'var(--ink3)', padding: '14px 0' }}>Nobody here.</div> : (
            <div style={{ maxHeight: '560px', overflowY: 'auto' }}>
              {rows.slice(0, 300).map(p => <PersonLine key={p.key} p={p} actions={isStatic ? <Button variant="ghost" disabled={busy} onClick={() => patch({ remove_members: [p.key] }, `${p.name} removed.`)}>Remove from list</Button> : undefined} />)}
              {rows.length > 300 && <div style={{ fontSize: '12px', color: 'var(--ink3)', padding: '10px 0' }}>Showing the first 300 of {rows.length}.</div>}
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
