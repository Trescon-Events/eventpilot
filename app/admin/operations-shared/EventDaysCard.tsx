'use client'

import { useCallback, useEffect, useState } from 'react'

/* "Event days" editor (2026-09-25) — the REAL first / last day of an event or an
   umbrella, as proper dates. They drive when Passport / National ID documents are
   automatically deleted (30 days after the last real day). Separate from the
   whole-cycle dates on the event record and from the public text dates, which
   stay as they are. For an umbrella it also lists each child event's own days. */

type Days = {
  kind: 'event' | 'umbrella'; id: string; name: string
  actual_start_date: string | null; actual_end_date: string | null
  cycle_start: string | null; cycle_end: string | null
  public_dates_text?: string | null
  retention?: { basis: 'actual_dates' | 'cycle_end' | 'none'; delete_on: string; days: number; documents: number }
  documents?: number
  children?: { id: string; name: string; actual_start_date: string | null; actual_end_date: string | null; basis: string; delete_on: string; documents: number }[]
  umbrella?: { id: string; name: string; actual_end_date: string | null } | null
}

const fmt = (d: string | null | undefined) => (d ? new Date(d + 'T00:00:00Z').toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—')

export default function EventDaysCard({ kind, id, canEdit = true }: { kind: 'event' | 'umbrella'; id: string; canEdit?: boolean }) {
  const [tick, setTick] = useState(0)
  const [data, setData] = useState<Days | null>(null)
  const [error, setError] = useState<string | null>(null)
  const query = `${kind === 'umbrella' ? 'umbrella_id' : 'event_id'}=${id}`

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const res = await fetch(`/api/events/event-days?${query}`)
      const body = await res.json().catch(() => null)
      if (cancelled) return
      if (res.ok) { setData(body); setError(null) } else setError(body?.error ?? 'Could not load event days.')
    })()
    return () => { cancelled = true }
  }, [query, tick])
  const reload = useCallback(() => setTick(t => t + 1), [])

  if (error) return <div style={{ ...card, color: 'var(--amber)', fontSize: '13px' }}>{error}</div>
  if (!data) return <div style={{ ...card, color: 'var(--ink3)', fontSize: '13px' }}>Loading event days…</div>

  return (
    <div style={card}>
      <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '0.6px', textTransform: 'uppercase', color: 'var(--teal-mid)' }}>Event days</div>
      <div style={{ fontSize: '12px', color: 'var(--ink3)', margin: '4px 0 14px', lineHeight: 1.6 }}>
        The <strong>real</strong> first and last day{kind === 'umbrella' ? ' of the week' : ''}. Passport and ID documents are deleted automatically 30 days after the last day.
        {' '}This is separate from the event&rsquo;s cycle dates{data.cycle_start || data.cycle_end ? ` (${fmt(data.cycle_start)} – ${fmt(data.cycle_end)})` : ''}{data.public_dates_text ? ` and its public text dates (“${data.public_dates_text}”)` : ''}, which are unchanged.
      </div>
      <DaysEditor target={{ kind: data.kind, id: data.id }} label={data.name} start={data.actual_start_date} end={data.actual_end_date} canEdit={canEdit} onSaved={reload}
        info={data.kind === 'event' && data.retention ? { deleteOn: data.retention.delete_on, basis: data.retention.basis, docs: data.retention.documents } : undefined}
        note={data.kind === 'event' && data.umbrella ? `Part of ${data.umbrella.name}${data.umbrella.actual_end_date ? ` (week ends ${fmt(data.umbrella.actual_end_date)}; documents follow the later of the two)` : ''}` : undefined} />

      {data.kind === 'umbrella' && data.children && data.children.length > 0 && (
        <div style={{ marginTop: '16px', borderTop: '1px solid var(--border)', paddingTop: '12px' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--ink)', marginBottom: '8px' }}>Each event&rsquo;s own days (optional — documents follow the later of the event&rsquo;s and the week&rsquo;s last day)</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {data.children.map(c => (
              <DaysEditor key={c.id} target={{ kind: 'event', id: c.id }} label={c.name} start={c.actual_start_date} end={c.actual_end_date} canEdit={canEdit} onSaved={reload} compact
                info={{ deleteOn: c.delete_on, basis: c.basis as 'actual_dates' | 'cycle_end' | 'none', docs: c.documents }} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function DaysEditor({ target, label, start, end, canEdit, onSaved, info, note, compact }: {
  target: { kind: 'event' | 'umbrella'; id: string }; label: string; start: string | null; end: string | null; canEdit: boolean; onSaved: () => void
  info?: { deleteOn: string; basis: 'actual_dates' | 'cycle_end' | 'none'; docs: number }; note?: string; compact?: boolean
}) {
  const [s, setS] = useState(start ?? '')
  const [e, setE] = useState(end ?? '')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ text: string; kind: 'ok' | 'error' | 'confirm' } | null>(null)
  const dirty = s !== (start ?? '') || e !== (end ?? '')

  async function save(confirmPast: boolean) {
    setBusy(true); setMsg(null)
    const res = await fetch('/api/events/event-days', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [target.kind === 'umbrella' ? 'umbrella_id' : 'event_id']: target.id, actual_start_date: s || null, actual_end_date: e || null, confirm_past: confirmPast }),
    })
    const body = await res.json().catch(() => null)
    setBusy(false)
    if (res.ok) { setMsg({ text: body.documents_updated ? `Saved. Deletion dates updated for ${body.documents_updated} document${body.documents_updated === 1 ? '' : 's'}.` : 'Saved.', kind: 'ok' }); onSaved(); return }
    if (res.status === 409 && body?.needs_confirmation) { setMsg({ text: body.error, kind: 'confirm' }); return }
    setMsg({ text: body?.error ?? 'Could not save.', kind: 'error' })
  }

  const warn = info && info.basis !== 'actual_dates' && info.docs > 0
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ fontSize: compact ? '12px' : '13px', fontWeight: 700, color: 'var(--ink)', minWidth: compact ? '220px' : undefined }}>{label}</div>
        <label style={lab}>First day <input type="date" value={s} onChange={ev => setS(ev.target.value)} disabled={!canEdit} style={inp} /></label>
        <label style={lab}>Last day <input type="date" value={e} min={s || undefined} onChange={ev => setE(ev.target.value)} disabled={!canEdit} style={inp} /></label>
        {canEdit && <button onClick={() => save(false)} disabled={!dirty || busy} style={{ ...btn, opacity: !dirty || busy ? 0.5 : 1 }}>{busy ? 'Saving…' : 'Save'}</button>}
      </div>
      {info && info.docs > 0 && <div style={{ fontSize: '11px', color: warn ? 'var(--amber)' : 'var(--ink3)' }}>
        {info.docs} document{info.docs === 1 ? '' : 's'} on file — deleted on {fmt(info.deleteOn)}.
        {warn ? ' Event days aren’t set, so this follows the event cycle’s end date — set the real days above.' : ''}
      </div>}
      {note && <div style={{ fontSize: '11px', color: 'var(--ink3)' }}>{note}</div>}
      {msg && (
        <div style={{ fontSize: '12px', color: msg.kind === 'ok' ? 'var(--lime)' : 'var(--amber)', fontWeight: 600, display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          {msg.text}
          {msg.kind === 'confirm' && <button onClick={() => save(true)} disabled={busy} style={{ ...btn, background: 'var(--amber)', color: 'var(--surface)' }}>Yes, save and delete them</button>}
        </div>
      )}
    </div>
  )
}

const card: React.CSSProperties = { padding: '18px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--card)' }
const lab: React.CSSProperties = { fontSize: '11px', color: 'var(--ink3)', display: 'flex', gap: '6px', alignItems: 'center' }
const inp: React.CSSProperties = { padding: '7px 9px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--ink)', fontSize: '13px' }
const btn: React.CSSProperties = { padding: '7px 14px', borderRadius: '8px', border: 'none', background: 'var(--teal)', color: 'var(--teal-light)', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }
