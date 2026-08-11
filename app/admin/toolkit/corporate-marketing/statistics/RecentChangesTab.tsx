'use client'

/*
  Recent Changes tab (CMOS 2.1 §Recent Changes).
  Filterable feed of every history row, joined to its statistic + changer.
*/

import { useCallback, useEffect, useState } from 'react'
import { BRAND, INPUT_STYLE, fmtRel } from './_shared'
import { StatusPill } from './OverviewDashboard'

type Row = {
  id: string
  old_value: string | null
  new_value: string | null
  changed_at: string
  reason: string | null
  status_before: string | null
  status_after:  string | null
  changer:   { id: string; name: string } | null
  statistic: { id: string; name: string; scope: string; scope_ref_label: string | null; current_value: string; approval_status: string } | null
}

export default function RecentChangesTab() {
  const [rows, setRows]     = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [scope, setScope]   = useState<'' | 'company' | 'event_series' | 'event'>('')

  const load = useCallback(async () => {
    setLoading(true)
    const qs = new URLSearchParams({ limit: '200' })
    if (scope) qs.set('scope', scope)
    const r = await fetch(`/api/corporate-marketing/statistics/history?${qs}`, { cache: 'no-store' })
    if (r.ok) { const d = await r.json(); setRows(d.history ?? []) }
    setLoading(false)
  }, [scope])
  useEffect(() => { load() }, [load])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div style={{
        background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px',
        padding: '14px 20px', display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap',
      }}>
        <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--ink4)', letterSpacing: '1px', textTransform: 'uppercase' }}>Filter</span>
        <select value={scope} onChange={e => setScope(e.target.value as typeof scope)} style={{ ...INPUT_STYLE, width: 'auto' }}>
          <option value="">All scopes</option>
          <option value="company">Company</option>
          <option value="event_series">Event Series</option>
          <option value="event">Event</option>
        </select>
        <div style={{ marginLeft: 'auto', fontSize: '12px', color: 'var(--ink4)' }}>
          {rows.length} update{rows.length === 1 ? '' : 's'}
        </div>
      </div>

      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px', overflow: 'hidden' }}>
        <div style={{
          display: 'grid', gridTemplateColumns: '1.6fr 1.4fr 1fr 130px 130px',
          padding: '12px 18px', gap: '10px', background: 'var(--border-light)',
          fontSize: '11px', fontWeight: 800, color: 'var(--ink4)', letterSpacing: '0.5px', textTransform: 'uppercase',
        }}>
          <div>Statistic</div><div>Change</div><div>By</div><div>Status</div><div>When</div>
        </div>
        {loading
          ? <div style={{ padding: '32px', textAlign: 'center', color: 'var(--ink3)' }}>Loading…</div>
          : rows.length === 0
            ? <div style={{ padding: '32px 18px', textAlign: 'center', color: 'var(--ink4)', fontSize: '13px' }}>No history entries.</div>
            : rows.map(r => (
                <div key={r.id} style={{
                  display: 'grid', gridTemplateColumns: '1.6fr 1.4fr 1fr 130px 130px',
                  padding: '12px 18px', gap: '10px',
                  borderTop: '1px solid var(--border)', alignItems: 'center',
                  fontSize: '13px', color: 'var(--ink)',
                }}>
                  <div>
                    <div style={{ fontWeight: 800 }}>{r.statistic?.name ?? 'deleted'}</div>
                    <div style={{ fontSize: '11px', color: 'var(--ink4)', marginTop: '2px' }}>
                      {r.statistic?.scope === 'company' ? 'Company' : r.statistic?.scope === 'event_series' ? `Series · ${r.statistic?.scope_ref_label ?? ''}` : 'Event'}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '12px', color: 'var(--ink3)' }}>{r.reason ?? 'Update'}</div>
                    {(r.old_value != null && r.new_value != null && r.old_value !== r.new_value) && (
                      <div style={{ fontSize: '11px', color: 'var(--ink4)', marginTop: '2px' }}>
                        <code style={{ background: 'var(--border-light)', padding: '1px 5px', borderRadius: '3px' }}>{r.old_value || '∅'}</code>
                        {' → '}
                        <code style={{ background: 'var(--border-light)', padding: '1px 5px', borderRadius: '3px' }}>{r.new_value || '∅'}</code>
                      </div>
                    )}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--ink3)' }}>{r.changer?.name ?? '—'}</div>
                  <div>{r.status_after && <StatusPill status={r.status_after} />}</div>
                  <div style={{ fontSize: '11px', color: 'var(--ink4)' }}>{fmtRel(r.changed_at)}</div>
                </div>
              ))}
      </div>
    </div>
  )
}
