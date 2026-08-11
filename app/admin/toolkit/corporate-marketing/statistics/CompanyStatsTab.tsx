'use client'

/*
  Company Statistics tab (CMOS 2.1 §4).

  Inline-editable table of every scope='company' statistic. Row-level
  actions: edit inline (Value + Unit), Save, Submit for Review, Approve
  (super-admin), Reject (super-admin), Archive. New rows via + Add stat.
*/

import { useCallback, useEffect, useMemo, useState } from 'react'
import { StatusPill } from './OverviewDashboard'
import StatisticDetailDrawer from './StatisticDetailDrawer'

const BRAND = '#F1667A'

type Statistic = {
  id: string
  scope: 'company' | 'event_series' | 'event'
  name: string
  current_value: string
  previous_value: string | null
  unit: string | null
  description: string | null
  source: string | null
  approval_status: 'draft' | 'pending_review' | 'approved' | 'archived'
  updated_at: string
  owner: { id: string; name: string } | null
}

type Me = { sid: string; adm: boolean } | null

const INPUT: React.CSSProperties = {
  width: '100%', padding: '6px 10px',
  background: 'var(--card)', border: '1px solid var(--border)',
  borderRadius: '6px', color: 'var(--ink)',
  fontFamily: 'inherit', fontSize: '13px',
}

export default function CompanyStatsTab() {
  const [rows, setRows]         = useState<Statistic[]>([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)
  const [editing, setEditing]   = useState<Record<string, { value: string; unit: string }>>({})
  const [busy, setBusy]         = useState<Record<string, boolean>>({})
  const [me, setMe]             = useState<Me>(null)
  const [showArchived, setShowArchived] = useState(false)
  const [showNewRow, setShowNewRow]     = useState(false)
  const [newRow, setNewRow]     = useState({ name: '', current_value: '', unit: '', description: '' })
  const [detailId, setDetailId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const r = await fetch('/api/corporate-marketing/statistics?scope=company', { cache: 'no-store' })
      if (!r.ok) throw new Error(`${r.status} ${r.statusText}`)
      const d = await r.json()
      setRows(d.statistics ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load Company statistics')
    } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])
  useEffect(() => {
    fetch('/api/me').then(r => r.ok ? r.json() : null).then(d => d && setMe({ sid: d.sid, adm: !!d.adm })).catch(() => {})
  }, [])

  const visible = useMemo(() => showArchived ? rows : rows.filter(r => r.approval_status !== 'archived'), [rows, showArchived])

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
      cancelEdit(r.id)
      await load()
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
      await load()
    } catch (e) {
      alert(`${endpoint} failed: ${e instanceof Error ? e.message : 'unknown'}`)
    } finally { setBusy(b => ({ ...b, [r.id]: false })) }
  }

  async function archive(r: Statistic) {
    if (!confirm(`Archive "${r.name}"? It stays in history but hides from the list. Un-archive from the Archived filter.`)) return
    setBusy(b => ({ ...b, [r.id]: true }))
    try {
      const res = await fetch(`/api/corporate-marketing/statistics/${r.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText)
      await load()
    } finally { setBusy(b => ({ ...b, [r.id]: false })) }
  }

  async function addNew() {
    if (!newRow.name.trim()) { alert('Name is required.'); return }
    try {
      const res = await fetch('/api/corporate-marketing/statistics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope: 'company', ...newRow, current_value: newRow.current_value }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText)
      setNewRow({ name: '', current_value: '', unit: '', description: '' })
      setShowNewRow(false)
      await load()
    } catch (e) {
      alert(`Add failed: ${e instanceof Error ? e.message : 'unknown'}`)
    }
  }

  if (loading) return <div style={{ padding: '40px', textAlign: 'center', color: 'var(--ink3)' }}>Loading Company Statistics…</div>
  if (error)   return <div style={{ padding: '14px 18px', background: 'var(--red-light)', border: '1px solid var(--red-border)', color: 'var(--red)', borderRadius: '10px', fontSize: '13px', fontWeight: 700 }}>{error}</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
        <button
          onClick={() => setShowNewRow(v => !v)}
          style={{
            background: BRAND, color: 'var(--red-light)', border: 'none',
            padding: '8px 16px', borderRadius: '8px',
            fontSize: '12px', fontWeight: 800, fontFamily: 'inherit', cursor: 'pointer',
          }}>
          {showNewRow ? '× Cancel' : '+ Add stat'}
        </button>
        <label style={{ fontSize: '12px', color: 'var(--ink3)', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} />
          Show archived
        </label>
        <div style={{ marginLeft: 'auto', fontSize: '12px', color: 'var(--ink4)' }}>
          {visible.length} {visible.length === 1 ? 'statistic' : 'statistics'}
        </div>
      </div>

      {/* Add-new inline row */}
      {showNewRow && (
        <div style={{
          background: 'var(--card)', border: `1px dashed ${BRAND}`, borderRadius: '12px',
          padding: '14px 16px',
          display: 'grid', gridTemplateColumns: '1.4fr 1fr 0.7fr 1.5fr auto', gap: '10px', alignItems: 'center',
        }}>
          <input placeholder="Name (e.g. Delegates Trained)" value={newRow.name}    onChange={e => setNewRow(n => ({ ...n, name: e.target.value }))}    style={INPUT} />
          <input placeholder="Value"                          value={newRow.current_value} onChange={e => setNewRow(n => ({ ...n, current_value: e.target.value }))} style={INPUT} />
          <input placeholder="Unit"                           value={newRow.unit}    onChange={e => setNewRow(n => ({ ...n, unit: e.target.value }))}    style={INPUT} />
          <input placeholder="Description (optional)"          value={newRow.description} onChange={e => setNewRow(n => ({ ...n, description: e.target.value }))} style={INPUT} />
          <button onClick={addNew} style={{ background: BRAND, color: 'var(--red-light)', border: 'none', padding: '7px 14px', borderRadius: '6px', fontSize: '12px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
            Create draft
          </button>
        </div>
      )}

      {/* Table */}
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px', overflow: 'hidden' }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1.6fr 1.1fr 0.7fr 1fr 130px auto',
          padding: '12px 18px', gap: '10px',
          background: 'var(--border-light)',
          fontSize: '11px', fontWeight: 800, color: 'var(--ink4)', letterSpacing: '0.5px', textTransform: 'uppercase',
        }}>
          <div>Name</div><div>Value</div><div>Unit</div><div>Updated</div><div>Status</div><div style={{ textAlign: 'right' }}>Actions</div>
        </div>
        {visible.map(r => {
          const isEditing = !!editing[r.id]
          const isBusy = !!busy[r.id]
          return (
            <div key={r.id} style={{
              display: 'grid',
              gridTemplateColumns: '1.6fr 1.1fr 0.7fr 1fr 130px auto',
              padding: '12px 18px', gap: '10px',
              borderTop: '1px solid var(--border)',
              alignItems: 'center', fontSize: '13px', color: 'var(--ink)',
              opacity: r.approval_status === 'archived' ? 0.55 : 1,
            }}>
              {/* Name + description */}
              <div>
                <button
                  onClick={() => setDetailId(r.id)}
                  style={{
                    background: 'none', border: 'none', padding: 0, textAlign: 'left',
                    fontFamily: 'inherit', fontSize: '13px', fontWeight: 800,
                    color: 'var(--ink)', cursor: 'pointer',
                  }}>
                  {r.name}
                </button>
                {r.description && <div style={{ fontSize: '11px', color: 'var(--ink4)', marginTop: '2px' }}>{r.description}</div>}
              </div>
              {/* Value */}
              <div>
                {isEditing
                  ? <input value={editing[r.id].value} onChange={e => setEditing(ed => ({ ...ed, [r.id]: { ...ed[r.id], value: e.target.value } }))} style={INPUT} autoFocus />
                  : <span style={{ fontFamily: 'var(--font-mono, monospace)' }}>{r.current_value || <span style={{ color: 'var(--ink4)', fontStyle: 'italic' }}>—</span>}</span>}
                {r.previous_value && !isEditing && (
                  <div style={{ fontSize: '11px', color: 'var(--ink4)', marginTop: '2px' }}>was <code>{r.previous_value}</code></div>
                )}
              </div>
              {/* Unit */}
              <div>
                {isEditing
                  ? <input value={editing[r.id].unit} onChange={e => setEditing(ed => ({ ...ed, [r.id]: { ...ed[r.id], unit: e.target.value } }))} style={INPUT} placeholder="unit" />
                  : <span style={{ color: 'var(--ink3)' }}>{r.unit || '—'}</span>}
              </div>
              {/* Updated */}
              <div style={{ fontSize: '11px', color: 'var(--ink4)' }}>
                {fmtRel(r.updated_at)}
              </div>
              {/* Status */}
              <div><StatusPill status={r.approval_status} /></div>
              {/* Actions */}
              <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                {isEditing ? (
                  <>
                    <Btn onClick={() => saveEdit(r)} disabled={isBusy} primary>Save</Btn>
                    <Btn onClick={() => cancelEdit(r.id)} disabled={isBusy}>Cancel</Btn>
                  </>
                ) : (
                  <>
                    {r.approval_status !== 'archived' && (
                      <Btn onClick={() => beginEdit(r)} disabled={isBusy}>Edit</Btn>
                    )}
                    {r.approval_status === 'draft' && (
                      <Btn onClick={() => transition(r, 'submit')} disabled={isBusy}>Submit</Btn>
                    )}
                    {r.approval_status === 'pending_review' && me?.adm && (
                      <>
                        <Btn onClick={() => transition(r, 'approve')} disabled={isBusy} primary>Approve</Btn>
                        <Btn onClick={() => {
                          const reason = prompt('Rejection reason (required):')?.trim()
                          if (reason) transition(r, 'reject', { reason })
                        }} disabled={isBusy}>Reject</Btn>
                      </>
                    )}
                    {r.approval_status !== 'archived' && (
                      <Btn onClick={() => archive(r)} disabled={isBusy} danger>Archive</Btn>
                    )}
                  </>
                )}
              </div>
            </div>
          )
        })}
        {visible.length === 0 && (
          <div style={{ padding: '32px 18px', textAlign: 'center', color: 'var(--ink4)', fontSize: '13px' }}>
            {showArchived ? 'No statistics.' : 'No active statistics. Click + Add stat above or enable Show archived.'}
          </div>
        )}
      </div>

      {/* Approval workflow hint */}
      <div style={{ fontSize: '11px', color: 'var(--ink4)', lineHeight: 1.55, marginTop: '4px' }}>
        <strong style={{ color: 'var(--ink3)' }}>Workflow:</strong>&nbsp;
        Draft → Submit for Review → Super-admin Approves (or Rejects) → other EventPilot modules consume the value.
        Editing an approved value drops it back to draft automatically. Click a name to see history + dependencies.
      </div>
      <StatisticDetailDrawer statisticId={detailId} onClose={() => setDetailId(null)} onChanged={load} />
    </div>
  )
}

function Btn({ onClick, disabled, primary, danger, children }: {
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

function fmtRel(iso: string): string {
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
