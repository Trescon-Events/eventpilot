'use client'

import { useMemo, useState } from 'react'
import { Button, Card, Input } from '@/app/components/ui'

/* The list criteria (2026-11-12): who a list is about. Used by the list builder and by an active list's editor. */

export type Filters = {
  event_ids: string[]; statuses: string[]; match: 'any' | 'all'; roles: string[]; countries: string[]; producer_ids: string[]; not_on_event_ids: string[]
  last_event_before_months?: number; not_emailed_days?: number
}
export const EMPTY_FILTERS: Filters = { event_ids: [], statuses: [], match: 'any', roles: [], countries: [], producer_ids: [], not_on_event_ids: [] }
export type Facets = { events: { id: string; name: string }[]; producers: { id: string; name: string }[]; roles: string[]; countries: string[] }

const STATUSES = ['Confirmed', 'New Confirmed', 'Reconfirmed', 'Spoke', 'No-show', 'On Hold', 'Withdrew', 'none']
const STATUS_LABEL: Record<string, string> = { none: 'No status yet' }
const toggle = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v])

function Check({ label, on, onChange }: { label: string; on: boolean; onChange: () => void }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--ink)', padding: '3px 0', cursor: 'pointer' }}>
      <input type="checkbox" checked={on} onChange={onChange} /> {label}
    </label>
  )
}
function Group({ title, children, hint }: { title: string; children: React.ReactNode; hint?: string }) {
  return (
    <div style={{ marginBottom: '16px' }}>
      <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '0.5px', textTransform: 'uppercase', color: 'var(--ink3)', marginBottom: '6px' }}>{title}</div>
      {hint && <div style={{ fontSize: '12px', color: 'var(--ink3)', marginBottom: '6px', lineHeight: 1.5 }}>{hint}</div>}
      {children}
    </div>
  )
}

export default function FilterPanel({ filters, onChange, facets }: { filters: Filters; onChange: (f: Filters) => void; facets: Facets | null }) {
  const [eventSearch, setEventSearch] = useState('')
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => onChange({ ...filters, [k]: v })
  const shownEvents = useMemo(() => (facets?.events ?? []).filter(e => e.name.toLowerCase().includes(eventSearch.toLowerCase())), [facets, eventSearch])
  return (
    <Card padded>
      <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '0.6px', textTransform: 'uppercase', color: 'var(--teal-mid)', marginBottom: '12px' }}>Criteria</div>

      <Group title="Events" hint="Leave empty for every event you have access to.">
        <Input value={eventSearch} onChange={e => setEventSearch(e.target.value)} placeholder="Search events…" />
        <div style={{ maxHeight: '170px', overflowY: 'auto', marginTop: '6px' }}>
          {shownEvents.map(e => <Check key={e.id} label={e.name} on={filters.event_ids.includes(e.id)} onChange={() => set('event_ids', toggle(filters.event_ids, e.id))} />)}
        </div>
        {filters.event_ids.length > 1 && (
          <div style={{ display: 'flex', gap: '12px', marginTop: '6px', fontSize: '12.5px' }}>
            {(['any', 'all'] as const).map(m => (
              <label key={m} style={{ display: 'flex', gap: '5px', alignItems: 'center', cursor: 'pointer' }}>
                <input type="radio" name="match" checked={filters.match === m} onChange={() => set('match', m)} /> {m === 'any' ? 'At any of them' : 'At all of them'}
              </label>
            ))}
          </div>
        )}
      </Group>

      <Group title="Status at those events">
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '6px' }}>
          {([['Spoke', ['Spoke']], ['Confirmed', ['Confirmed', 'New Confirmed', 'Reconfirmed']], ['Withdrew', ['Withdrew']]] as const).map(([label, vals]) => (
            <button key={label} type="button" onClick={() => set('statuses', [...vals])} style={{ fontSize: '11.5px', fontWeight: 700, padding: '3px 9px', borderRadius: '999px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--ink2)', cursor: 'pointer' }}>{label}</button>
          ))}
          <button type="button" onClick={() => set('statuses', [])} style={{ fontSize: '11.5px', fontWeight: 700, padding: '3px 9px', borderRadius: '999px', border: '1px solid var(--border)', background: 'none', color: 'var(--ink3)', cursor: 'pointer' }}>Any</button>
        </div>
        {STATUSES.map(st => <Check key={st} label={STATUS_LABEL[st] ?? st} on={filters.statuses.includes(st)} onChange={() => set('statuses', toggle(filters.statuses, st))} />)}
      </Group>

      {!!facets?.roles.length && <Group title="Planned role">{facets.roles.map(r => <Check key={r} label={r} on={filters.roles.includes(r)} onChange={() => set('roles', toggle(filters.roles, r))} />)}</Group>}
      {!!facets?.producers.length && (
        <Group title="Producer"><div style={{ maxHeight: '130px', overflowY: 'auto' }}>{facets.producers.map(p => <Check key={p.id} label={p.name} on={filters.producer_ids.includes(p.id)} onChange={() => set('producer_ids', toggle(filters.producer_ids, p.id))} />)}</div></Group>
      )}
      {!!facets?.countries.length && (
        <Group title="Country"><div style={{ maxHeight: '130px', overflowY: 'auto' }}>{facets.countries.map(c => <Check key={c} label={c} on={filters.countries.includes(c)} onChange={() => set('countries', toggle(filters.countries, c))} />)}</div></Group>
      )}

      <Group title="Leave out anyone already on" hint="To invite past speakers to a new event, pick the new event here.">
        <select value={filters.not_on_event_ids[0] ?? ''} onChange={e => set('not_on_event_ids', e.target.value ? [e.target.value] : [])}
          style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--ink)', fontSize: '13px' }}>
          <option value="">Nobody</option>
          {(facets?.events ?? []).map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
      </Group>

      <Group title="Not seen for a while" hint="Only people whose latest event ended more than this many months ago.">
        <Input type="number" min={0} value={filters.last_event_before_months ?? ''} placeholder="Any" onChange={e => set('last_event_before_months', e.target.value ? Number(e.target.value) : undefined)} />
      </Group>

      <Group title="Not emailed recently" hint="Leave out anyone an EventPilot email went to in the last this-many days, so nobody is emailed too often.">
        <Input type="number" min={0} value={filters.not_emailed_days ?? ''} placeholder="Any" onChange={e => set('not_emailed_days', e.target.value ? Number(e.target.value) : undefined)} />
      </Group>

      <Button variant="ghost" onClick={() => onChange(EMPTY_FILTERS)}>Clear criteria</Button>
    </Card>
  )
}
