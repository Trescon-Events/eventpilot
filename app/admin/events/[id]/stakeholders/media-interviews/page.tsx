'use client'

import { use, useCallback, useEffect, useMemo, useState } from 'react'
import PageHeader from '@/app/components/PageHeader'
import { Badge, Button, Input, Select } from '@/app/components/ui'
import { useBreadcrumbLabel } from '@/app/lib/nav/breadcrumb-labels'
import { downloadFormattedXlsx } from '@/app/lib/export/formatted-xlsx'
import { notify } from '@/app/lib/ui/notify'
import { describeWindows, type MediaWindow } from '@/app/lib/pr/windows'
import MediaRequestDialog from '../MediaRequestDialog'

/* Media Interviews (2026-10-23) — the producers' side of PR & Media, laid out like Guest Invites: every speaker with where they stand, filters to find any group
   quickly, and the actions (ask, remind) on selected rows. The PR person does not work here — they see only the speakers who said yes, in PR & Media. */

type State = 'not_asked' | 'asked' | 'interested' | 'declined'
type Row = {
  speaker_id: string; name: string; company: string | null; role: string | null; producer: string | null; request_id: string | null; state: State; windows: MediaWindow[]
  note: string | null; sent_at: string | null; submitted_at: string | null; last_opened_at: string | null; reminder_count: number; expired: boolean; has_email: boolean
}
const TONE: Record<State, { label: string; color: 'grey' | 'amber' | 'teal' | 'red' }> = {
  not_asked: { label: 'Not asked', color: 'grey' }, asked: { label: 'Waiting for answer', color: 'amber' }, interested: { label: 'Interested', color: 'teal' }, declined: { label: 'Not available', color: 'red' },
}
const FILTERS: ('all' | State)[] = ['all', 'not_asked', 'asked', 'interested', 'declined']
const fmtDay = (d: string) => new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
const fmtDate = (s: string | null) => s ? new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : ''

export default function MediaInterviewsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = use(params)
  const [rows, setRows] = useState<Row[] | null>(null)
  const [canSend, setCanSend] = useState(false)
  const [canDelete, setCanDelete] = useState(false)
  const [deleting, setDeleting] = useState<{ row: Row; step: 1 | 2; busy: boolean } | null>(null)
  const [setupProblem, setSetupProblem] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [eventName, setEventName] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | State>('all')
  const [producer, setProducer] = useState('')
  const [search, setSearch] = useState('')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [asking, setAsking] = useState(false)
  const [reminding, setReminding] = useState(false)
  const [tick, setTick] = useState(0)
  useBreadcrumbLabel(eventId, eventName)
  const reload = useCallback(() => setTick(t => t + 1), [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const [a, e] = await Promise.all([fetch(`/api/events/pr/outreach?event_id=${eventId}`), fetch(`/api/events?id=${eventId}`)])
      const d = await a.json().catch(() => ({})), ed = await e.json().catch(() => ({}))
      if (cancelled) return
      if (!a.ok) { setError(d.error ?? 'Could not load media interviews.'); setRows([]); return }
      setRows(d.rows); setCanSend(!!d.can_send); setCanDelete(!!d.can_delete); setSetupProblem(d.setup_problem ?? null)
      const ev = Array.isArray(ed) ? ed[0] : ed; setEventName(ev?.public_name || ev?.name || null)
    })()
    return () => { cancelled = true }
  }, [eventId, tick])

  const counts = useMemo(() => { const c = { not_asked: 0, asked: 0, interested: 0, declined: 0 }; for (const r of rows ?? []) c[r.state]++; return c }, [rows])
  const producers = useMemo(() => [...new Set((rows ?? []).map(r => r.producer).filter((p): p is string => !!p))].sort(), [rows])
  const shown = useMemo(() => (rows ?? []).filter(r =>
    (filter === 'all' || r.state === filter) && (!producer || (producer === '__none' ? !r.producer : r.producer === producer)) &&
    (!search.trim() || `${r.name} ${r.company ?? ''}`.toLowerCase().includes(search.trim().toLowerCase()))), [rows, filter, producer, search])

  const selectable = (r: Row) => canSend && r.has_email && r.state !== 'interested' && r.state !== 'declined'
  const pickedRows = (rows ?? []).filter(r => picked.has(r.speaker_id))
  const askable = pickedRows.filter(r => r.state === 'not_asked' || r.state === 'asked')
  const remindable = pickedRows.filter(r => r.state === 'asked' && r.request_id)
  const toggle = (id: string) => setPicked(p => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n })

  async function remindSelected() {
    setReminding(true)
    let ok = 0; const failed: string[] = []
    for (const r of remindable) {
      const res = await fetch(`/api/events/pr/requests/${r.request_id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'remind' }) })
      if (res.ok) ok++; else failed.push(`${r.name}: ${(await res.json().catch(() => ({}))).error ?? 'failed'}`)
      await new Promise(x => setTimeout(x, 400))
    }
    setReminding(false)
    if (ok) notify(`Reminder sent to ${ok} speaker${ok === 1 ? '' : 's'}.`)
    if (failed.length) notify(`Could not remind: ${failed.join(' · ')}`, 'error')
    setPicked(new Set()); reload()
  }

  async function exportXlsx() {
    await downloadFormattedXlsx({
      filename: `media-interviews-${new Date().toISOString().slice(0, 10)}.xlsx`, sheetName: 'Media interviews', title: `${eventName ? `${eventName} — ` : ''}Media interview requests`,
      subtitle: `${rows?.length ?? 0} speakers · ${counts.interested} interested · ${counts.asked} waiting · ${counts.declined} not available · ${counts.not_asked} not asked`,
      columns: [{ header: 'Speaker', width: 26 }, { header: 'Company', width: 26 }, { header: 'Producer', width: 20 }, { header: 'Status', width: 18 }, { header: 'Asked', width: 12 }, { header: 'Answered', width: 12 }, { header: 'Available', width: 48 }, { header: 'Speaker note', width: 40 }],
      rows: (rows ?? []).map(r => [r.name, r.company ?? '', r.producer ?? '', TONE[r.state].label, fmtDate(r.sent_at), fmtDate(r.submitted_at),
        [...new Set(r.windows.map(w => w.date))].map(d => `${fmtDay(d)}: ${describeWindows(r.windows.filter(w => w.date === d))}`).join('\n'), r.note ?? '']),
      tone: (h, v) => h !== 'Status' ? undefined : v === 'Interested' ? 'teal' : v === 'Not available' ? 'red' : v === 'Waiting for answer' ? 'amber' : 'grey',
    })
  }

  const th: React.CSSProperties = { textAlign: 'left', padding: '10px 12px', fontSize: '12px', fontWeight: 800, letterSpacing: '0.04em', color: 'var(--ink3)', textTransform: 'uppercase', position: 'sticky', top: 0, background: 'var(--card)' }
  const td: React.CSSProperties = { padding: '10px 12px', fontSize: '13.5px', color: 'var(--ink)', borderTop: '1px solid var(--border-light)', verticalAlign: 'top' }
  return (
    <div style={{ minHeight: '100vh', background: 'var(--surface)' }}>
      <PageHeader eyebrow="Stakeholder Hub · Speakers" title="Media Interviews" backHref={`/admin/events/${eventId}/stakeholders`} backLabel="Stakeholder Hub"
        description="Ask speakers whether they will give media bites or interviews, and see who has answered. The PR team sees only the speakers who said yes." />
      <div style={{ padding: '24px 32px 80px', display: 'grid', gridTemplateColumns: '220px 1fr', gap: '24px', alignItems: 'flex-start' }}>
        {/* Left nav — same pattern as the Stakeholder Hub */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {FILTERS.map(f => (
            <button key={f} onClick={() => { setFilter(f); setPicked(new Set()) }}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', padding: '9px 12px', borderRadius: '8px', border: 'none', textAlign: 'left', cursor: 'pointer',
                fontFamily: 'inherit', fontSize: '15px', fontWeight: 700, background: filter === f ? 'var(--card)' : 'transparent', color: filter === f ? 'var(--ink)' : 'var(--ink3)',
              }}>
              <span>{f === 'all' ? 'All speakers' : TONE[f].label}</span>
              <span style={{ fontSize: '13px', color: 'var(--ink3)' }}>{f === 'all' ? rows?.length ?? 0 : counts[f]}</span>
            </button>
          ))}
        </div>

        <div>
        {error && <div style={{ color: 'var(--red)', fontSize: '14px', marginBottom: '12px' }}>{error}</div>}
        {setupProblem && <div style={{ marginBottom: '14px', padding: '12px 14px', borderRadius: '10px', border: '1px solid var(--amber)', background: 'var(--amber-light)', fontSize: '13.5px', lineHeight: 1.5 }}>Not ready to send yet: {setupProblem}</div>}

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '14px' }}>
          <div style={{ fontSize: '20px', fontWeight: 900, color: 'var(--ink)' }}>{filter === 'all' ? 'All speakers' : TONE[filter].label}</div>
          <div style={{ flex: 1 }} />
          <Select value={producer} onChange={e => setProducer(e.target.value)} style={{ width: '190px' }}>
            <option value="">All producers</option>
            {producers.map(p => <option key={p} value={p}>{p}</option>)}
            <option value="__none">No producer set</option>
          </Select>
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search speaker or company" style={{ width: '220px' }} />
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '12px' }}>
          {canSend && <>
            <Button variant="ghost" onClick={() => setPicked(new Set(shown.filter(selectable).map(r => r.speaker_id)))}>Select shown</Button>
            <Button variant="ghost" onClick={() => setPicked(new Set())} disabled={picked.size === 0}>Clear</Button>
            <Button variant="teal" onClick={() => setAsking(true)} disabled={askable.length === 0 || !!setupProblem}>{askable.length ? `Send request to ${askable.length}` : 'Send request'}</Button>
            <Button variant="ghost" onClick={remindSelected} disabled={remindable.length === 0 || reminding || !!setupProblem}>{reminding ? 'Sending…' : remindable.length ? `Send reminder to ${remindable.length}` : 'Send reminder'}</Button>
          </>}
          <div style={{ flex: 1 }} />
          <Button variant="ghost" onClick={exportXlsx} disabled={!rows?.length}>Download Excel</Button>
        </div>

        {rows === null ? <div style={{ color: 'var(--ink3)' }}>Loading…</div> : shown.length === 0 ? <div style={{ color: 'var(--ink3)', fontSize: '14px' }}>Nobody matches.</div> : (
          <div style={{ overflowX: 'auto', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '860px' }}>
              <thead><tr><th style={{ ...th, width: '40px' }} /><th style={th}>Speaker</th><th style={th}>Producer</th><th style={th}>Status</th><th style={th}>Answer</th><th style={th}>History</th>{canDelete && <th style={{ ...th, width: '90px' }} />}</tr></thead>
              <tbody>
                {shown.map(r => (
                  <tr key={r.speaker_id} style={{ background: picked.has(r.speaker_id) ? 'color-mix(in srgb, var(--teal) 8%, transparent)' : 'transparent' }}>
                    <td style={td}>
                      <input type="checkbox" checked={picked.has(r.speaker_id)} disabled={!selectable(r)} onChange={() => toggle(r.speaker_id)} style={{ width: '16px', height: '16px' }}
                        title={!canSend ? 'You can view but not send' : !r.has_email ? 'No email address on file' : r.state === 'interested' || r.state === 'declined' ? 'Already answered' : ''} />
                    </td>
                    <td style={td}><div style={{ fontWeight: 700 }}>{r.name}</div><div style={{ fontSize: '12.5px', color: 'var(--ink3)' }}>{[r.role, r.company].filter(Boolean).join(' · ')}</div></td>
                    <td style={{ ...td, color: r.producer ? 'var(--ink2)' : 'var(--ink4)' }}>{r.producer ?? 'None set'}</td>
                    <td style={td}>
                      <Badge color={TONE[r.state].color}>{TONE[r.state].label}</Badge>
                      {r.expired && r.state === 'asked' && <div style={{ marginTop: '4px' }}><Badge color="red">Link expired</Badge></div>}
                      {!r.has_email && r.state === 'not_asked' && <div style={{ marginTop: '4px', fontSize: '12px', color: 'var(--red)' }}>No email on file</div>}
                    </td>
                    <td style={{ ...td, lineHeight: 1.6 }}>
                      {r.state === 'interested' ? (
                        <>
                          {[...new Set(r.windows.map(w => w.date))].map(d => <div key={d}><strong>{fmtDay(d)}</strong>: {describeWindows(r.windows.filter(w => w.date === d))}</div>)}
                          {r.note && <div style={{ color: 'var(--ink3)' }}>“{r.note}”</div>}
                        </>
                      ) : <span style={{ color: 'var(--ink4)' }}>—</span>}
                    </td>
                    <td style={{ ...td, fontSize: '12.5px', color: 'var(--ink3)' }}>
                      {r.state === 'not_asked' ? 'Not asked yet' : `Asked ${fmtDate(r.sent_at)}${r.submitted_at ? ` · answered ${fmtDate(r.submitted_at)}` : r.last_opened_at ? ` · opened ${fmtDate(r.last_opened_at)}` : ' · not opened'}${r.reminder_count ? ` · ${r.reminder_count} reminder${r.reminder_count === 1 ? '' : 's'}` : ''}`}
                    </td>
                    {canDelete && (
                      <td style={td}>{r.request_id && <Button variant="ghost" onClick={() => setDeleting({ row: r, step: 1, busy: false })}>Delete</Button>}</td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        </div>
      </div>
      {deleting && (
        <div role="dialog" aria-modal="true" style={{ position: 'fixed', inset: 0, background: 'var(--overlay-scrim)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div style={{ background: 'var(--card)', border: `1px solid ${deleting.step === 2 ? 'var(--red-border)' : 'var(--border)'}`, borderRadius: '14px', padding: '22px', width: 'min(460px, 100%)' }}>
            <div style={{ fontSize: '17px', fontWeight: 900, marginBottom: '8px', color: deleting.step === 2 ? 'var(--red)' : 'var(--ink)' }}>
              {deleting.step === 1 ? 'Delete this request?' : 'Really delete? This cannot be undone'}
            </div>
            <div style={{ fontSize: '14px', color: 'var(--ink2)', lineHeight: 1.6, marginBottom: '16px' }}>
              {deleting.step === 1
                ? <>This removes <strong>{deleting.row.name}</strong>’s media interview request{deleting.row.state === 'asked' ? '' : ' and their answer'}. They go back to “Not asked” and can be asked again.</>
                : <>Last check: <strong>{deleting.row.name}</strong>’s request{deleting.row.state === 'interested' || deleting.row.state === 'declined' ? `, their answer (${TONE[deleting.row.state].label})` : ''} and their private link will be permanently deleted. Their old link will stop working.</>}
            </div>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <Button variant="ghost" onClick={() => setDeleting(null)} disabled={deleting.busy}>Cancel</Button>
              {deleting.step === 1
                ? <Button variant="ghost" onClick={() => setDeleting({ ...deleting, step: 2 })}>Yes, continue</Button>
                : <Button variant="teal" disabled={deleting.busy} onClick={async () => {
                    setDeleting({ ...deleting, busy: true })
                    const res = await fetch(`/api/events/pr/requests/${deleting.row.request_id}`, { method: 'DELETE' })
                    const d = await res.json().catch(() => ({}))
                    if (!res.ok) { notify(d.error ?? 'Could not delete the request.', 'error'); setDeleting({ ...deleting, busy: false }); return }
                    notify(`${deleting.row.name}’s request was deleted.`); setDeleting(null); setPicked(new Set()); reload()
                  }}>{deleting.busy ? 'Deleting…' : 'Delete permanently'}</Button>}
            </div>
          </div>
        </div>
      )}
      {asking && <MediaRequestDialog eventId={eventId} speakers={askable.map(r => ({ id: r.speaker_id, name: r.name }))} onClose={() => setAsking(false)} onFinished={() => { setPicked(new Set()); reload() }} />}
    </div>
  )
}
