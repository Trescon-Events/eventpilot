'use client'

/*
  Shared building blocks for the Statistics Repository tabs. Extracted from
  CompanyStatsTab.tsx so Event Series + Event tabs render the same row shape
  without duplicating the CRUD logic.
*/

import { useCallback, useEffect, useState } from 'react'
import { StatusPill } from './OverviewDashboard'

export const BRAND = '#F1667A'

export type Statistic = {
  id:              string
  scope:           'company' | 'event_series' | 'event'
  scope_ref_id:    string | null
  scope_ref_label: string | null
  name:            string
  current_value:   string
  previous_value:  string | null
  unit:            string | null
  description:     string | null
  source:          string | null
  approval_status: 'draft' | 'pending_review' | 'approved' | 'archived'
  updated_at:      string
  owner:           { id: string; name: string } | null
}

export type Me = { sid: string; adm: boolean } | null

export const INPUT_STYLE: React.CSSProperties = {
  width: '100%', padding: '6px 10px',
  background: 'var(--card)', border: '1px solid var(--border)',
  borderRadius: '6px', color: 'var(--ink)',
  fontFamily: 'inherit', fontSize: '13px',
}

export function useMe(): Me {
  const [me, setMe] = useState<Me>(null)
  useEffect(() => {
    fetch('/api/me').then(r => r.ok ? r.json() : null).then(d => d && setMe({ sid: d.sid, adm: !!d.adm })).catch(() => {})
  }, [])
  return me
}

export function fmtRel(iso: string): string {
  const then = new Date(iso).getTime(), now = Date.now()
  const min = Math.round((now - then) / 60_000)
  if (min < 1)  return 'just now'
  if (min < 60) return `${min}m ago`
  const hr = Math.round(min / 60)
  if (hr < 24) return `${hr}h ago`
  const d = Math.round(hr / 24)
  if (d < 7)   return `${d}d ago`
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
}

export function Btn({ onClick, disabled, primary, danger, children }: {
  onClick: () => void
  disabled?: boolean
  primary?:  boolean
  danger?:   boolean
  children:  React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '5px 10px', borderRadius: '6px',
        border: primary ? 'none' : `1px solid ${danger ? 'var(--red-border)' : 'var(--ink4)'}`,
        background: primary ? BRAND : (danger ? 'var(--red-light)' : 'var(--card)'),
        color:      primary ? 'var(--red-light)' : (danger ? 'var(--red)' : 'var(--ink3)'),
        fontSize: '11px', fontWeight: 700, fontFamily: 'inherit',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        whiteSpace: 'nowrap',
      }}>
      {children}
    </button>
  )
}

/**
 * Reusable stat-row hooks + handlers so Company / Event Series / Event
 * tables share behaviour. Consumers pass in the fetch URL (with scope
 * + scope_ref filter) and get back { rows, loading, error, reload,
 * editing, saveEdit, transition, archive }.
 */
export function useStatCrud(fetchUrl: string) {
  const [rows,      setRows]     = useState<Statistic[]>([])
  const [loading,   setLoading]  = useState(true)
  const [error,     setError]    = useState<string | null>(null)
  const [editing,   setEditing]  = useState<Record<string, { value: string; unit: string }>>({})
  const [busy,      setBusy]     = useState<Record<string, boolean>>({})

  const reload = useCallback(async () => {
    setError(null); setLoading(true)
    try {
      const r = await fetch(fetchUrl, { cache: 'no-store' })
      if (!r.ok) throw new Error(`${r.status} ${r.statusText}`)
      const d = await r.json(); setRows(d.statistics ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load statistics')
    } finally { setLoading(false) }
  }, [fetchUrl])
  useEffect(() => { reload() }, [reload])

  function beginEdit(r: Statistic) {
    setEditing(e => ({ ...e, [r.id]: { value: r.current_value ?? '', unit: r.unit ?? '' } }))
  }
  function cancelEdit(id: string) {
    setEditing(e => { const cp = { ...e }; delete cp[id]; return cp })
  }
  async function saveEdit(r: Statistic) {
    const edit = editing[r.id]; if (!edit) return
    setBusy(b => ({ ...b, [r.id]: true }))
    try {
      const res = await fetch(`/api/corporate-marketing/statistics/${r.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ current_value: edit.value, unit: edit.unit || null }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText)
      cancelEdit(r.id); await reload()
    } catch (e) {
      alert(`Save failed: ${e instanceof Error ? e.message : 'unknown'}`)
    } finally { setBusy(b => ({ ...b, [r.id]: false })) }
  }
  async function transition(r: Statistic, endpoint: 'submit' | 'approve' | 'reject', body?: unknown) {
    setBusy(b => ({ ...b, [r.id]: true }))
    try {
      const res = await fetch(`/api/corporate-marketing/statistics/${r.id}/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText)
      await reload()
    } catch (e) {
      alert(`${endpoint} failed: ${e instanceof Error ? e.message : 'unknown'}`)
    } finally { setBusy(b => ({ ...b, [r.id]: false })) }
  }
  async function archive(r: Statistic) {
    if (!confirm(`Archive "${r.name}"?`)) return
    setBusy(b => ({ ...b, [r.id]: true }))
    try {
      const res = await fetch(`/api/corporate-marketing/statistics/${r.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText)
      await reload()
    } finally { setBusy(b => ({ ...b, [r.id]: false })) }
  }

  return { rows, loading, error, reload, editing, setEditing, busy, beginEdit, cancelEdit, saveEdit, transition, archive }
}

/** Presentational row used by Company / Series / Event tables. */
export function StatRow({ r, editing, setEditing, busy, me, beginEdit, cancelEdit, saveEdit, transition, archive, onOpenDetail }: {
  r: Statistic
  editing: Record<string, { value: string; unit: string }>
  setEditing: React.Dispatch<React.SetStateAction<Record<string, { value: string; unit: string }>>>
  busy: Record<string, boolean>
  me: Me
  beginEdit: (r: Statistic) => void
  cancelEdit: (id: string) => void
  saveEdit: (r: Statistic) => void
  transition: (r: Statistic, endpoint: 'submit' | 'approve' | 'reject', body?: unknown) => void
  archive: (r: Statistic) => void
  onOpenDetail?: (id: string) => void
}) {
  const isEditing = !!editing[r.id]
  const isBusy    = !!busy[r.id]
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '1.6fr 1.1fr 0.7fr 1fr 130px auto',
      padding: '12px 18px', gap: '10px',
      borderTop: '1px solid var(--border)',
      alignItems: 'center', fontSize: '13px', color: 'var(--ink)',
      opacity: r.approval_status === 'archived' ? 0.55 : 1,
    }}>
      <div>
        <button
          onClick={() => onOpenDetail?.(r.id)}
          disabled={!onOpenDetail}
          style={{
            background: 'none', border: 'none', padding: 0, textAlign: 'left',
            fontFamily: 'inherit', fontSize: '13px', fontWeight: 800, color: 'var(--ink)',
            cursor: onOpenDetail ? 'pointer' : 'default',
          }}>
          {r.name}
        </button>
        {r.description && <div style={{ fontSize: '11px', color: 'var(--ink4)', marginTop: '2px' }}>{r.description}</div>}
      </div>
      <div>
        {isEditing
          ? <input value={editing[r.id].value} onChange={e => setEditing(ed => ({ ...ed, [r.id]: { ...ed[r.id], value: e.target.value } }))} style={INPUT_STYLE} autoFocus />
          : <span style={{ fontFamily: 'var(--font-mono, monospace)' }}>{r.current_value || <span style={{ color: 'var(--ink4)', fontStyle: 'italic' }}>—</span>}</span>}
        {r.previous_value && !isEditing && (
          <div style={{ fontSize: '11px', color: 'var(--ink4)', marginTop: '2px' }}>was <code>{r.previous_value}</code></div>
        )}
      </div>
      <div>
        {isEditing
          ? <input value={editing[r.id].unit} onChange={e => setEditing(ed => ({ ...ed, [r.id]: { ...ed[r.id], unit: e.target.value } }))} style={INPUT_STYLE} placeholder="unit" />
          : <span style={{ color: 'var(--ink3)' }}>{r.unit || '—'}</span>}
      </div>
      <div style={{ fontSize: '11px', color: 'var(--ink4)' }}>{fmtRel(r.updated_at)}</div>
      <div><StatusPill status={r.approval_status} /></div>
      <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        {isEditing ? (
          <>
            <Btn onClick={() => saveEdit(r)} disabled={isBusy} primary>Save</Btn>
            <Btn onClick={() => cancelEdit(r.id)} disabled={isBusy}>Cancel</Btn>
          </>
        ) : (
          <>
            {r.approval_status !== 'archived' && <Btn onClick={() => beginEdit(r)} disabled={isBusy}>Edit</Btn>}
            {r.approval_status === 'draft'          && <Btn onClick={() => transition(r, 'submit')} disabled={isBusy}>Submit</Btn>}
            {r.approval_status === 'pending_review' && me?.adm && (
              <>
                <Btn onClick={() => transition(r, 'approve')} disabled={isBusy} primary>Approve</Btn>
                <Btn onClick={() => {
                  const reason = prompt('Rejection reason (required):')?.trim()
                  if (reason) transition(r, 'reject', { reason })
                }} disabled={isBusy}>Reject</Btn>
              </>
            )}
            {r.approval_status !== 'archived' && <Btn onClick={() => archive(r)} disabled={isBusy} danger>Archive</Btn>}
          </>
        )}
      </div>
    </div>
  )
}

export function TableHeader() {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '1.6fr 1.1fr 0.7fr 1fr 130px auto',
      padding: '12px 18px', gap: '10px',
      background: 'var(--border-light)',
      fontSize: '11px', fontWeight: 800, color: 'var(--ink4)', letterSpacing: '0.5px', textTransform: 'uppercase',
    }}>
      <div>Name</div><div>Value</div><div>Unit</div><div>Updated</div><div>Status</div><div style={{ textAlign: 'right' }}>Actions</div>
    </div>
  )
}
