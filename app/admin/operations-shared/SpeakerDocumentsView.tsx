'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import PageHeader from '@/app/components/PageHeader'
import { Badge, Button, Input, Select } from '@/app/components/ui'
import Toast from '@/app/components/ui/Toast'
import { useBreadcrumbLabel } from '@/app/lib/nav/breadcrumb-labels'
import { useOpsScope } from './scope-context'

/* Operations > Speaker Documents: confirmed speakers with Passport / National ID STATUS (never the files), grouped by
   event, with totals and filters. Ops can remind a speaker's producer; the email goes out from the Ops person assigned
   to this section. */

type DocStatus = 'missing' | 'in_progress' | 'reviewed'
type Row = {
  id: string; event_id: string; event_name: string; name: string; role: string | null; company: string | null
  producer_id: string | null; producer_name: string | null; is_uae_resident: boolean | null; national_id_applicable: boolean
  passport: DocStatus; national_id: DocStatus; last_reminded_at: string | null
}
type Data = { scope: { kind: 'event' | 'umbrella'; id: string; name: string }; cooldown_hours: number; events: { id: string; name: string }[]; senders: Record<string, string[] | null>; rows: Row[] }

const DOC: Record<DocStatus, { label: string; color: 'red' | 'amber' | 'teal' }> = {
  missing: { label: 'Not received', color: 'red' },
  in_progress: { label: 'Awaiting review', color: 'amber' },
  reviewed: { label: 'Reviewed', color: 'teal' },
}
const outstanding = (r: Row) => r.passport !== 'reviewed' || (r.national_id_applicable && r.national_id !== 'reviewed')
const idNeeded = (r: Row) => r.national_id_applicable && r.national_id !== 'reviewed'
const ago = (iso: string) => { const h = (Date.now() - new Date(iso).getTime()) / 3_600_000; return h < 1 ? 'just now' : h < 24 ? `${Math.floor(h)}h ago` : `${Math.floor(h / 24)}d ago` }

const FILTERS: { value: string; label: string; test: (r: Row) => boolean }[] = [
  { value: 'all', label: 'All confirmed speakers', test: () => true },
  { value: 'outstanding', label: 'Anything outstanding', test: outstanding },
  { value: 'not_received', label: 'Something not received yet', test: r => r.passport === 'missing' || (r.national_id_applicable && r.national_id === 'missing') },
  { value: 'awaiting', label: 'Received, awaiting producer review', test: r => r.passport === 'in_progress' || (r.national_id_applicable && r.national_id === 'in_progress') },
  { value: 'passport', label: 'Passport not reviewed', test: r => r.passport !== 'reviewed' },
  { value: 'national_id', label: 'National ID not reviewed', test: idNeeded },
  { value: 'complete', label: 'All documents reviewed', test: r => !outstanding(r) },
]

export function SpeakerDocumentsPanel() {
  const scope = useOpsScope()
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [eventId, setEventId] = useState('all')
  const [resident, setResident] = useState('all')
  const [filter, setFilter] = useState('all')
  const [producer, setProducer] = useState('all')
  const [search, setSearch] = useState('')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const load = useCallback(async () => {
    const res = await fetch(`/api/events/operations/speakers?${scope.query}`)
    const body = await res.json().catch(() => ({}))
    if (!res.ok) { setError(body.error ?? 'Could not load speakers.'); return }
    setData(body); setError(null)
  }, [scope.query])
  // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load
  useEffect(() => { void load() }, [load])

  const rows = useMemo(() => data?.rows ?? [], [data])
  const producers = useMemo(() => [...new Map(rows.filter(r => r.producer_id).map(r => [r.producer_id!, r.producer_name ?? ''])).entries()].sort((a, b) => a[1].localeCompare(b[1])), [rows])
  const inEvent = useMemo(() => rows.filter(r => eventId === 'all' || r.event_id === eventId), [rows, eventId])

  const stats = useMemo(() => {
    const idRows = inEvent.filter(r => r.national_id_applicable)
    return {
      total: inEvent.length,
      uae: inEvent.filter(r => r.is_uae_resident === true).length,
      nonUae: inEvent.filter(r => r.is_uae_resident === false).length,
      unknown: inEvent.filter(r => r.is_uae_resident === null).length,
      passport: inEvent.filter(r => r.passport === 'reviewed').length,
      passportAwaiting: inEvent.filter(r => r.passport === 'in_progress').length,
      id: idRows.filter(r => r.national_id === 'reviewed').length, idTotal: idRows.length,
      idAwaiting: idRows.filter(r => r.national_id === 'in_progress').length,
      outstanding: inEvent.filter(outstanding).length,
    }
  }, [inEvent])

  const shown = useMemo(() => {
    const test = FILTERS.find(f => f.value === filter)!.test
    const q = search.trim().toLowerCase()
    return inEvent.filter(r =>
      test(r)
      && (resident === 'all' || (resident === 'yes' ? r.is_uae_resident === true : resident === 'no' ? r.is_uae_resident === false : r.is_uae_resident === null))
      && (producer === 'all' || (producer === 'none' ? !r.producer_id : r.producer_id === producer))
      && (!q || `${r.name} ${r.company ?? ''}`.toLowerCase().includes(q)))
  }, [inEvent, filter, resident, producer, search])

  const groups = useMemo(() => {
    const m = new Map<string, Row[]>()
    for (const r of shown) m.set(r.event_id, [...(m.get(r.event_id) ?? []), r])
    return [...m.entries()].map(([id, list]) => ({ id, name: list[0].event_name, list })).sort((a, b) => a.name.localeCompare(b.name))
  }, [shown])

  const remindable = (r: Row) => outstanding(r) && !!r.producer_id
  const toggle = (id: string) => setPicked(p => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n })

  async function remind(ids: string[]) {
    if (!ids.length) return
    setBusy(true)
    const res = await fetch('/api/events/operations/speakers/remind', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...scope.body, speaker_ids: ids }) })
    const body = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) { setToast({ message: body.error ?? 'Could not send reminders.', type: 'error' }); return }
    const sent = (body.sent ?? []) as { producer: string; speakers: number; from: string }[]
    const skipped = (body.skipped ?? []) as { name: string; reason: string }[]
    const msg = sent.length
      ? `Reminded ${sent.length} producer${sent.length === 1 ? '' : 's'} about ${sent.reduce((n, s) => n + s.speakers, 0)} speaker${sent.reduce((n, s) => n + s.speakers, 0) === 1 ? '' : 's'}${skipped.length ? `. Skipped ${skipped.length}: ${skipped.slice(0, 3).map(s => `${s.name} (${s.reason})`).join(', ')}${skipped.length > 3 ? '…' : ''}` : '.'}`
      : `Nothing sent. ${skipped.slice(0, 3).map(s => `${s.name}: ${s.reason}`).join('; ')}`
    setToast({ message: msg, type: sent.length ? 'success' : 'error' })
    setPicked(new Set()); await load()
  }

  const statCard = (label: string, value: string, sub: string | null, onClick?: () => void) => (
    <div onClick={onClick} style={{ padding: '14px 16px', border: '1px solid var(--border-light)', borderRadius: '10px', background: 'var(--card)', cursor: onClick ? 'pointer' : 'default' }}>
      <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--ink3)' }}>{label}</div>
      <div style={{ fontSize: '24px', fontWeight: 900, color: 'var(--ink)', marginTop: '2px' }}>{value}</div>
      {sub && <div style={{ fontSize: '12px', color: 'var(--ink3)', marginTop: '2px' }}>{sub}</div>}
    </div>
  )

  const senderNote = (eid: string) => {
    const s = data?.senders[eid]
    return s?.length ? `Reminders go out from ${s.join(' / ')}.` : 'No Ops person is assigned to Speaker Documents (Operations › Access), so reminders go out from the shared Event Pilot address.'
  }

  return (
    <>
      <div style={{ display: 'grid', gap: '16px' }}>
        {error && <div style={{ color: 'var(--red)', fontSize: '14px' }}>{error}</div>}
        {!data && !error && <div style={{ color: 'var(--ink3)' }}>Loading…</div>}
        {data && (<>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: '12px' }}>
            {statCard('Confirmed speakers', String(stats.total), `${stats.uae} UAE · ${stats.nonUae} non-UAE · ${stats.unknown} not set`, () => { setFilter('all'); setResident('all') })}
            {statCard('Passport reviewed', `${stats.passport}/${stats.total}`, `${stats.passportAwaiting} awaiting review`, () => setFilter('passport'))}
            {statCard('National ID reviewed', `${stats.id}/${stats.idTotal}`, `${stats.idAwaiting} awaiting review · UAE residents`, () => setFilter('national_id'))}
            {statCard('Still outstanding', String(stats.outstanding), 'speakers with a document to chase', () => setFilter('outstanding'))}
          </div>

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
            {data.events.length > 1 && (
              <Select value={eventId} onChange={e => setEventId(e.target.value)} style={{ width: '220px' }}>
                <option value="all">All events</option>
                {data.events.filter(e => rows.some(r => r.event_id === e.id)).map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
              </Select>
            )}
            <Select value={filter} onChange={e => setFilter(e.target.value)} style={{ width: '260px' }}>{FILTERS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}</Select>
            <Select value={resident} onChange={e => setResident(e.target.value)} style={{ width: '170px' }}>
              <option value="all">Any residency</option><option value="yes">UAE resident</option><option value="no">Not UAE resident</option><option value="unknown">Residency not set</option>
            </Select>
            <Select value={producer} onChange={e => setProducer(e.target.value)} style={{ width: '190px' }}>
              <option value="all">All producers</option>{producers.map(([id, name]) => <option key={id} value={id}>{name}</option>)}<option value="none">No producer</option>
            </Select>
            <div style={{ flex: '1 1 180px', minWidth: '160px' }}><Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name or company…" /></div>
            <Button variant="lime" disabled={busy || picked.size === 0} onClick={() => void remind([...picked])}>{busy ? 'Sending…' : `Remind producers (${picked.size})`}</Button>
          </div>

          {groups.length === 0 && <div style={{ color: 'var(--ink3)', fontSize: '14px', padding: '32px 0', textAlign: 'center' }}>No speakers match these filters.</div>}
          {groups.map(g => {
            const ids = g.list.filter(remindable).map(r => r.id)
            return (
              <div key={g.id} style={{ border: '1px solid var(--border-light)', borderRadius: '12px', background: 'var(--card)', overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', padding: '12px 16px', borderBottom: '1px solid var(--border-light)' }}>
                  <div style={{ flex: '1 1 260px', minWidth: 0 }}>
                    <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--ink)' }}>{g.name} <span style={{ fontWeight: 500, color: 'var(--ink3)' }}>· {g.list.length} speaker{g.list.length === 1 ? '' : 's'} · {g.list.filter(outstanding).length} outstanding</span></div>
                    <div style={{ fontSize: '12px', color: 'var(--ink3)' }}>{senderNote(g.id)}</div>
                  </div>
                  <Button variant="ghost" disabled={busy || ids.length === 0} onClick={() => setPicked(new Set([...picked, ...ids]))}>Select outstanding ({ids.length})</Button>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13.5px' }}>
                    <thead><tr style={{ textAlign: 'left', color: 'var(--ink3)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '.04em' }}>
                      <th style={{ padding: '8px 16px', width: '32px' }} /><th style={{ padding: '8px' }}>Speaker</th><th style={{ padding: '8px' }}>Producer</th><th style={{ padding: '8px' }}>UAE resident</th>
                      <th style={{ padding: '8px' }}>Passport</th><th style={{ padding: '8px' }}>National ID</th><th style={{ padding: '8px' }}>Last reminded</th><th style={{ padding: '8px 16px' }} />
                    </tr></thead>
                    <tbody>
                      {g.list.map(r => (
                        <tr key={r.id} style={{ borderTop: '1px solid var(--border-light)' }}>
                          <td style={{ padding: '8px 16px' }}>{remindable(r) && <input type="checkbox" checked={picked.has(r.id)} onChange={() => toggle(r.id)} />}</td>
                          <td style={{ padding: '8px' }}><div style={{ fontWeight: 700, color: 'var(--ink)' }}>{r.name}</div><div style={{ fontSize: '12px', color: 'var(--ink3)' }}>{[r.role, r.company].filter(Boolean).join(' · ')}</div></td>
                          <td style={{ padding: '8px', color: r.producer_name ? 'var(--ink2)' : 'var(--amber)' }}>{r.producer_name ?? 'None assigned'}</td>
                          <td style={{ padding: '8px' }}>{r.is_uae_resident === true ? 'Yes' : r.is_uae_resident === false ? 'No' : <span style={{ color: 'var(--ink3)' }}>Not set</span>}</td>
                          <td style={{ padding: '8px' }}><Badge color={DOC[r.passport].color}>{DOC[r.passport].label}</Badge></td>
                          <td style={{ padding: '8px' }}>{r.national_id_applicable ? <Badge color={DOC[r.national_id].color}>{DOC[r.national_id].label}</Badge> : <span style={{ color: 'var(--ink3)' }}>Not required</span>}</td>
                          <td style={{ padding: '8px', color: 'var(--ink3)' }}>{r.last_reminded_at ? ago(r.last_reminded_at) : '—'}</td>
                          <td style={{ padding: '8px 16px', textAlign: 'right' }}>{remindable(r) && <Button variant="ghost" disabled={busy} onClick={() => void remind([r.id])}>Remind</Button>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          })}
          <div style={{ fontSize: '12px', color: 'var(--ink3)' }}>Reminders go to the speaker’s producer only, one email per producer, and a speaker can be reminded once every {data.cooldown_hours} hours.</div>
        </>)}
      </div>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </>
  )
}

export default function SpeakerDocumentsView() {
  const scope = useOpsScope()
  const [name, setName] = useState<string | null>(null)
  useBreadcrumbLabel(scope.id, name)
  useEffect(() => {
    fetch(`/api/events/operations/vendors?${scope.query}`).then(r => r.ok ? r.json() : null).then(b => setName(b?.scope?.name ?? null)).catch(() => {})
  }, [scope.query])
  return (
    <div style={{ minHeight: '100vh', background: 'var(--surface)' }}>
      <PageHeader eyebrow="Operations" title="Speaker Documents" backHref={scope.basePath} backLabel="Operations"
        description="Confirmed speakers and the status of their Passport and National ID. You see where each document stands, not the documents themselves." />
      <div style={{ padding: '24px 32px', maxWidth: '1180px' }}><SpeakerDocumentsPanel /></div>
    </div>
  )
}
