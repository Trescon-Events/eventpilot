'use client'

import { use, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import PageHeader from '@/app/components/PageHeader'
import { Badge, Button, Card, Input, Toast } from '@/app/components/ui'
import { useBreadcrumbLabel } from '@/app/lib/nav/breadcrumb-labels'

/* Emails → Lists (2026-11-11, phase 1 of docs/build_suggestions/emails-module.md). The list builder: choose who an email should reach across all the events you have access
   to, see exactly who would receive it and who is left out (and why), set do-not-email, and save the list. Nothing is sent from here yet — Compose comes next. */

type Filters = { event_ids: string[]; statuses: string[]; match: 'any' | 'all'; roles: string[]; countries: string[]; producer_ids: string[]; not_on_event_ids: string[]; last_event_before_months?: number }
type PersonRow = {
  key: string; contact_id: string | null; name: string; company: string | null; country: string | null; statuses: { event_name: string; status: string | null }[]
  last_event_end: string | null; company_changed: { from: string; to: string } | null; producer: string | null
  to?: string; cc?: string[]; mode?: 'own' | 'assistant'; reason?: string
}
type Preview = {
  summary: { will_receive: number; excluded: number; reasons: Record<string, number>; via_assistant: number; company_changed: number }
  recipients: PersonRow[]; excluded: PersonRow[]
  facets: { events: { id: string; name: string; start: string | null; end: string | null }[]; producers: { id: string; name: string }[]; roles: string[]; countries: string[] }
}
type SavedList = { id: string; name: string; filters: Partial<Filters>; pinned_contact_ids: string[]; excluded_contact_ids: string[]; allow_assistant: boolean; event_id: string | null; created_by: string | null }

const STATUSES = ['Confirmed', 'New Confirmed', 'Reconfirmed', 'Spoke', 'No-show', 'On Hold', 'Withdrew', 'none']
const STATUS_LABEL: Record<string, string> = { none: 'No status yet' }
const DNE_REASONS = [['asked_to_stop', 'Asked to stop'], ['bounced', 'Email bounces'], ['left_company', 'Left the company'], ['client_request', 'Client request'], ['other', 'Other']] as const
const EMPTY: Filters = { event_ids: [], statuses: [], match: 'any', roles: [], countries: [], producer_ids: [], not_on_event_ids: [] }

const fmtDay = (d: string | null) => (d ? new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : null)
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

export default function EmailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = use(params)
  const [eventName, setEventName] = useState<string | null>(null)
  useBreadcrumbLabel(eventId, eventName)
  const [filters, setFilters] = useState<Filters>(EMPTY)
  const [allowAssistant, setAllowAssistant] = useState(false)
  const [removed, setRemoved] = useState<string[]>([])
  const [preview, setPreview] = useState<Preview | null>(null)
  const [loading, setLoading] = useState(false)
  const [tab, setTab] = useState<'receive' | 'left'>('receive')
  const [eventSearch, setEventSearch] = useState('')
  const [lists, setLists] = useState<SavedList[]>([])
  const [listName, setListName] = useState('')
  const [anyEvent, setAnyEvent] = useState(false)
  const [loadedId, setLoadedId] = useState<string | null>(null)
  const [dnePick, setDnePick] = useState<{ contact_id: string; reason: string } | null>(null)
  const [toast, setToast] = useState<{ text: string; type: 'success' | 'error' } | null>(null)
  const seq = useRef(0)

  useEffect(() => {
    fetch(`/api/events?id=${eventId}`).then(r => r.json()).then(d => setEventName((Array.isArray(d) ? d[0] : d)?.name ?? null)).catch(() => {})
  }, [eventId])

  const loadLists = useCallback(async () => {
    const r = await fetch(`/api/events/stakeholders/email-lists?event_id=${eventId}`)
    if (r.ok) setLists((await r.json()).lists ?? [])
  }, [eventId])
  // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch on mount
  useEffect(() => { void loadLists() }, [loadLists])

  const run = useCallback(async () => {
    const mine = ++seq.current
    setLoading(true)
    const r = await fetch('/api/events/stakeholders/email-people', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_id: eventId, filters, allow_assistant: allowAssistant, excluded_contact_ids: removed }),
    })
    const d = await r.json().catch(() => ({}))
    if (mine !== seq.current) return
    setLoading(false)
    if (!r.ok) { setToast({ text: d.error ?? 'Could not build the preview.', type: 'error' }); return }
    setPreview(d)
  }, [eventId, filters, allowAssistant, removed])
  useEffect(() => { const t = setTimeout(() => { void run() }, 250); return () => clearTimeout(t) }, [run])

  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => { setFilters(f => ({ ...f, [k]: v })); setLoadedId(null) }
  const facets = preview?.facets
  const shownEvents = useMemo(() => (facets?.events ?? []).filter(e => e.name.toLowerCase().includes(eventSearch.toLowerCase())), [facets, eventSearch])

  async function dne(contactId: string, on: boolean, reason?: string) {
    const r = await fetch('/api/events/stakeholders/email-people/do-not-email', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contact_id: contactId, on, reason }) })
    const d = await r.json().catch(() => ({}))
    setToast({ text: r.ok ? (d.note ?? (on ? 'Marked do not email.' : 'Do-not-email cleared.')) : d.error ?? 'Could not save.', type: r.ok ? 'success' : 'error' })
    setDnePick(null)
    if (r.ok) void run()
  }

  async function saveList() {
    const r = await fetch('/api/events/stakeholders/email-lists', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event_id: eventId, name: listName, filters, allow_assistant: allowAssistant, excluded_contact_ids: removed, any_event: anyEvent }) })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { setToast({ text: d.error ?? 'Could not save the list.', type: 'error' }); return }
    setToast({ text: 'List saved.', type: 'success' }); setListName(''); setLoadedId(d.list.id); void loadLists()
  }
  async function updateList() {
    if (!loadedId) return
    const r = await fetch(`/api/events/stakeholders/email-lists?id=${loadedId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filters, allow_assistant: allowAssistant, excluded_contact_ids: removed }) })
    const d = await r.json().catch(() => ({}))
    setToast({ text: r.ok ? 'List updated.' : d.error ?? 'Could not update the list.', type: r.ok ? 'success' : 'error' })
    if (r.ok) void loadLists()
  }
  async function deleteList(id: string) {
    const r = await fetch(`/api/events/stakeholders/email-lists?id=${id}`, { method: 'DELETE' })
    const d = await r.json().catch(() => ({}))
    setToast({ text: r.ok ? 'List deleted.' : d.error ?? 'Could not delete.', type: r.ok ? 'success' : 'error' })
    if (r.ok) { if (loadedId === id) setLoadedId(null); void loadLists() }
  }
  function loadList(l: SavedList) {
    setFilters({ ...EMPTY, ...l.filters } as Filters); setAllowAssistant(l.allow_assistant); setRemoved(l.excluded_contact_ids ?? []); setLoadedId(l.id)
  }

  const rows = tab === 'receive' ? preview?.recipients ?? [] : preview?.excluded ?? []
  const s = preview?.summary

  return (
    <div>
      <PageHeader
        eyebrow="Stakeholder Hub"
        title="Emails"
        description="Build a list of speakers from any of your events, see exactly who it would reach and who is left out, then save it. Sending comes next; nothing is sent from this page."
        backHref={`/admin/events/${eventId}/stakeholders`}
        backLabel="Back to Stakeholder Hub"
      />
      <Toast message={toast?.text ?? null} type={toast?.type} onClose={() => setToast(null)} />
      <div style={{ display: 'flex', gap: '24px', alignItems: 'flex-start', padding: '20px 32px 48px', maxWidth: '1380px', flexWrap: 'wrap' }}>
        <div style={{ width: '320px', flexShrink: 0 }}>
          <Card padded>
            <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '0.6px', textTransform: 'uppercase', color: 'var(--teal-mid)', marginBottom: '12px' }}>Who</div>

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
                {[['Spoke', ['Spoke']], ['Confirmed', ['Confirmed', 'New Confirmed', 'Reconfirmed']], ['Withdrew', ['Withdrew']]].map(([label, vals]) => (
                  <button key={label as string} type="button" onClick={() => set('statuses', vals as string[])} style={{ fontSize: '11.5px', fontWeight: 700, padding: '3px 9px', borderRadius: '999px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--ink2)', cursor: 'pointer' }}>{label as string}</button>
                ))}
                <button type="button" onClick={() => set('statuses', [])} style={{ fontSize: '11.5px', fontWeight: 700, padding: '3px 9px', borderRadius: '999px', border: '1px solid var(--border)', background: 'none', color: 'var(--ink3)', cursor: 'pointer' }}>Any</button>
              </div>
              {STATUSES.map(st => <Check key={st} label={STATUS_LABEL[st] ?? st} on={filters.statuses.includes(st)} onChange={() => set('statuses', toggle(filters.statuses, st))} />)}
            </Group>

            {!!facets?.roles.length && (
              <Group title="Planned role">
                {facets.roles.map(r => <Check key={r} label={r} on={filters.roles.includes(r)} onChange={() => set('roles', toggle(filters.roles, r))} />)}
              </Group>
            )}
            {!!facets?.producers.length && (
              <Group title="Producer">
                <div style={{ maxHeight: '130px', overflowY: 'auto' }}>
                  {facets.producers.map(p => <Check key={p.id} label={p.name} on={filters.producer_ids.includes(p.id)} onChange={() => set('producer_ids', toggle(filters.producer_ids, p.id))} />)}
                </div>
              </Group>
            )}
            {!!facets?.countries.length && (
              <Group title="Country">
                <div style={{ maxHeight: '130px', overflowY: 'auto' }}>
                  {facets.countries.map(c => <Check key={c} label={c} on={filters.countries.includes(c)} onChange={() => set('countries', toggle(filters.countries, c))} />)}
                </div>
              </Group>
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

            <Group title="People without their own email">
              <Check label="Reach them through an assistant or office contact" on={allowAssistant} onChange={() => { setAllowAssistant(v => !v); setLoadedId(null) }} />
              <div style={{ fontSize: '11.5px', color: 'var(--ink3)', lineHeight: 1.5 }}>Only for emails written for an assistant, because the greeting differs.</div>
            </Group>

            <Button variant="ghost" onClick={() => { setFilters(EMPTY); setAllowAssistant(false); setRemoved([]); setLoadedId(null) }}>Clear filters</Button>
          </Card>
        </div>

        <div style={{ flex: '1 1 560px', minWidth: 0 }}>
          <Card padded>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
              <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--ink)' }}>
                {s ? <>{s.will_receive} will receive it</> : 'Building preview…'}
                {s && s.excluded > 0 && <span style={{ fontWeight: 600, color: 'var(--ink3)' }}> · {s.excluded} left out</span>}
              </div>
              {loading && <span style={{ fontSize: '12px', color: 'var(--ink3)' }}>Updating…</span>}
            </div>
            {s && s.excluded > 0 && (
              <div style={{ fontSize: '12.5px', color: 'var(--ink2)', marginTop: '6px', lineHeight: 1.6 }}>
                {Object.entries(s.reasons).map(([k, n]) => `${n} ${k.toLowerCase()}`).join(' · ')}
              </div>
            )}
            {s && (s.via_assistant > 0 || s.company_changed > 0) && (
              <div style={{ fontSize: '12.5px', color: 'var(--ink2)', marginTop: '4px' }}>
                {s.via_assistant > 0 && `${s.via_assistant} reached through an assistant. `}{s.company_changed > 0 && `${s.company_changed} changed company since their earlier event.`}
              </div>
            )}

            <div style={{ display: 'flex', gap: '8px', margin: '14px 0 10px', borderBottom: '1px solid var(--border-light)' }}>
              {([['receive', `Will receive (${s?.will_receive ?? 0})`], ['left', `Left out (${s?.excluded ?? 0})`]] as const).map(([k, label]) => (
                <button key={k} type="button" onClick={() => setTab(k)} aria-current={tab === k ? 'page' : undefined}
                  style={{ padding: '8px 12px', fontSize: '13px', fontWeight: 700, border: 'none', background: 'none', cursor: 'pointer', color: tab === k ? 'var(--teal-mid)' : 'var(--ink3)', borderBottom: `2px solid ${tab === k ? 'var(--teal-mid)' : 'transparent'}` }}>{label}</button>
              ))}
            </div>

            {rows.length === 0 ? (
              <div style={{ fontSize: '13px', color: 'var(--ink3)', padding: '16px 0' }}>{tab === 'receive' ? 'Nobody matches these filters.' : 'Nobody is left out.'}</div>
            ) : (
              <div style={{ maxHeight: '620px', overflowY: 'auto' }}>
                {rows.slice(0, 400).map(p => (
                  <div key={p.key} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border-light)', flexWrap: 'wrap' }}>
                    <div style={{ minWidth: 0, flex: '1 1 300px' }}>
                      <div style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--ink)' }}>{p.name}{p.company ? <span style={{ fontWeight: 500, color: 'var(--ink3)' }}> · {p.company}</span> : null}</div>
                      <div style={{ fontSize: '12px', color: 'var(--ink3)', marginTop: '2px', lineHeight: 1.5 }}>
                        {p.statuses.map(x => `${x.event_name}: ${x.status ?? 'no status'}`).join(' · ')}
                        {p.last_event_end ? ` · last event ended ${fmtDay(p.last_event_end)}` : ''}
                      </div>
                      {tab === 'receive' && p.to && (
                        <div style={{ fontSize: '12px', color: 'var(--ink2)', marginTop: '2px' }}>
                          {p.to}{p.cc && p.cc.length > 0 ? ` · cc ${p.cc.length}` : ''}{p.mode === 'assistant' ? ' · via assistant' : ''}
                        </div>
                      )}
                      {p.company_changed && <div style={{ fontSize: '12px', color: 'var(--amber)', marginTop: '2px' }}>Moved from {p.company_changed.from} to {p.company_changed.to}</div>}
                      {tab === 'left' && p.reason && <div style={{ marginTop: '4px' }}><Badge color="amber">{p.reason}</Badge></div>}
                    </div>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                      {p.contact_id && dnePick?.contact_id === p.contact_id ? (
                        <>
                          <select value={dnePick.reason} onChange={e => setDnePick({ contact_id: p.contact_id!, reason: e.target.value })}
                            style={{ padding: '6px 8px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--ink)', fontSize: '12.5px' }}>
                            {DNE_REASONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                          </select>
                          <Button variant="teal" onClick={() => dne(p.contact_id!, true, dnePick.reason)}>Save</Button>
                          <Button variant="ghost" onClick={() => setDnePick(null)}>Cancel</Button>
                        </>
                      ) : (
                        <>
                          {tab === 'receive' && p.contact_id && <Button variant="ghost" onClick={() => setRemoved(r => [...r, p.contact_id!])}>Remove</Button>}
                          {tab === 'receive' && p.contact_id && <Button variant="ghost" onClick={() => setDnePick({ contact_id: p.contact_id!, reason: 'asked_to_stop' })}>Do not email</Button>}
                          {tab === 'left' && p.contact_id && removed.includes(p.contact_id) && <Button variant="ghost" onClick={() => setRemoved(r => r.filter(x => x !== p.contact_id))}>Put back</Button>}
                          {tab === 'left' && p.contact_id && p.reason?.startsWith('Do not email') && <Button variant="ghost" onClick={() => dne(p.contact_id!, false)}>Clear do not email</Button>}
                        </>
                      )}
                    </div>
                  </div>
                ))}
                {rows.length > 400 && <div style={{ fontSize: '12px', color: 'var(--ink3)', padding: '10px 0' }}>Showing the first 400 of {rows.length}. Narrow the filters to see the rest.</div>}
              </div>
            )}
          </Card>

          <Card padded>
            <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '0.6px', textTransform: 'uppercase', color: 'var(--teal-mid)', marginBottom: '10px' }}>Saved lists</div>
            {lists.length === 0 && <div style={{ fontSize: '13px', color: 'var(--ink3)', marginBottom: '10px' }}>No saved lists yet.</div>}
            {lists.map(l => (
              <div key={l.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', padding: '8px 0', borderBottom: '1px solid var(--border-light)', flexWrap: 'wrap' }}>
                <div style={{ fontSize: '13.5px', fontWeight: loadedId === l.id ? 800 : 600, color: 'var(--ink)' }}>{l.name}{l.event_id === null ? <span style={{ fontWeight: 500, color: 'var(--ink3)' }}> · any event</span> : null}</div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <Button variant="ghost" onClick={() => loadList(l)}>Open</Button>
                  <Button variant="ghost" onClick={() => deleteList(l.id)}>Delete</Button>
                </div>
              </div>
            ))}
            <div style={{ display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ flex: '1 1 220px' }}><Input value={listName} onChange={e => setListName(e.target.value)} placeholder="Name this list, e.g. BSS speakers who spoke" /></div>
              <label style={{ display: 'flex', gap: '6px', alignItems: 'center', fontSize: '12.5px', color: 'var(--ink2)', cursor: 'pointer' }}><input type="checkbox" checked={anyEvent} onChange={() => setAnyEvent(v => !v)} /> Usable from any event</label>
              <Button variant="teal" onClick={saveList} disabled={!listName.trim()}>Save as new list</Button>
              {loadedId && <Button variant="ghost" onClick={updateList}>Update “{lists.find(l => l.id === loadedId)?.name}”</Button>}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--ink3)', marginTop: '8px', lineHeight: 1.5 }}>A saved list keeps your filters and the people you removed by hand. It is worked out again each time it is used, so people who have since opted out are never included.</div>
          </Card>
        </div>
      </div>
    </div>
  )
}
