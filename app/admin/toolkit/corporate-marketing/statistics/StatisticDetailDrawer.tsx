'use client'

/*
  Statistic Detail slide-in drawer (CMOS 2.1 §6 — 4 tabs).
    · General       — value + previous, description, source, owner, approval
    · History       — immutable audit trail (never overwrite)
    · Dependencies  — statistic → assets that use it (add / mark reviewed / delete)
    · Approval      — state-machine actions (Draft/Submit/Approve/Reject/Archive)

  Reads /api/corporate-marketing/statistics/:id which returns the statistic
  plus its history[] and dependencies[] in one round-trip.
*/

import { useCallback, useEffect, useState } from 'react'
import { BRAND, Btn, INPUT_STYLE, fmtRel, useMe, type Statistic } from './_shared'
import { StatusPill } from './OverviewDashboard'

type HistoryRow = {
  id: string
  old_value: string | null
  new_value: string | null
  changed_at: string
  reason: string | null
  status_before: string | null
  status_after:  string | null
  changer: { id: string; name: string } | null
}

type DependencyRow = {
  id: string
  module: string
  asset_name: string
  asset_reference: string | null
  status: string
  linked_at: string
  last_reviewed_at: string | null
  linker:   { id: string; name: string } | null
  reviewer: { id: string; name: string } | null
}

type DetailPayload = {
  statistic:    Statistic & { updater?: { id: string; name: string } | null }
  history:      HistoryRow[]
  dependencies: DependencyRow[]
}

type Tab = 'general' | 'history' | 'dependencies' | 'approval'

const MODULES = [
  { key: 'corporate_deck',    label: 'Corporate Deck' },
  { key: 'knowledge_hub',     label: 'Knowledge Hub' },
  { key: 'proposal_template', label: 'Proposal Template' },
  { key: 'sales_deck',        label: 'Sales Deck' },
  { key: 'brochure',          label: 'Brochure' },
  { key: 'article',           label: 'Article' },
  { key: 'email_template',    label: 'Email Template' },
  { key: 'website',           label: 'Website' },
]

export default function StatisticDetailDrawer({ statisticId, onClose, onChanged }: {
  statisticId: string | null
  onClose: () => void
  onChanged?: () => void
}) {
  const [data, setData]     = useState<DetailPayload | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]   = useState<string | null>(null)
  const [tab, setTab]       = useState<Tab>('general')
  const [busy, setBusy]     = useState(false)
  const me = useMe()

  const load = useCallback(async (id: string) => {
    setLoading(true); setError(null)
    try {
      const r = await fetch(`/api/corporate-marketing/statistics/${id}`, { cache: 'no-store' })
      if (!r.ok) throw new Error(`${r.status} ${r.statusText}`)
      setData(await r.json())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load statistic')
    } finally { setLoading(false) }
  }, [])
  useEffect(() => { if (statisticId) load(statisticId) }, [statisticId, load])

  if (!statisticId) return null

  const stat = data?.statistic

  async function savePatch(patch: Partial<Statistic> & { reason?: string }) {
    if (!statisticId) return
    setBusy(true)
    try {
      const r = await fetch(`/api/corporate-marketing/statistics/${statisticId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || r.statusText)
      await load(statisticId); onChanged?.()
    } catch (e) {
      alert(`Save failed: ${e instanceof Error ? e.message : 'unknown'}`)
    } finally { setBusy(false) }
  }
  async function transition(endpoint: 'submit' | 'approve' | 'reject', body?: unknown) {
    if (!statisticId) return
    setBusy(true)
    try {
      const r = await fetch(`/api/corporate-marketing/statistics/${statisticId}/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      })
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || r.statusText)
      await load(statisticId); onChanged?.()
    } catch (e) {
      alert(`${endpoint} failed: ${e instanceof Error ? e.message : 'unknown'}`)
    } finally { setBusy(false) }
  }
  async function archive() {
    if (!statisticId) return
    if (!confirm('Archive this statistic? History stays intact.')) return
    setBusy(true)
    try {
      await fetch(`/api/corporate-marketing/statistics/${statisticId}`, { method: 'DELETE' })
      await load(statisticId); onChanged?.()
    } finally { setBusy(false) }
  }

  return (
    <>
      {/* Scrim */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(15,25,35,0.55)', zIndex: 40,
        }}
      />
      {/* Drawer */}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: '640px', maxWidth: '92vw',
        background: 'var(--surface)', borderLeft: '1px solid var(--border)',
        boxShadow: '-10px 0 30px rgba(15,25,35,0.15)',
        zIndex: 50, display: 'flex', flexDirection: 'column',
        fontFamily: 'var(--font-manrope)',
      }}>
        {/* Header */}
        <div style={{
          padding: '18px 22px', borderBottom: '1px solid var(--border)',
          display: 'flex', gap: '12px', alignItems: 'flex-start',
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '11px', color: 'var(--ink4)', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase' }}>
              {stat?.scope === 'company' ? 'Company Statistic'
                : stat?.scope === 'event_series' ? `Event Series · ${stat?.scope_ref_label ?? ''}`
                : stat?.scope === 'event' ? 'Event Statistic' : ''}
            </div>
            <div style={{ fontSize: '22px', fontWeight: 900, color: 'var(--ink)', marginTop: '2px' }}>
              {stat?.name ?? 'Loading…'}
            </div>
            {stat && <div style={{ marginTop: '6px' }}><StatusPill status={stat.approval_status} /></div>}
          </div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', fontSize: '24px', color: 'var(--ink3)',
            cursor: 'pointer', padding: '4px 10px', lineHeight: 1,
          }}>×</button>
        </div>

        {/* Tab strip */}
        <div style={{ display: 'flex', gap: '2px', padding: '0 22px', borderBottom: '1px solid var(--border)' }}>
          {(['general','history','dependencies','approval'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                padding: '10px 14px',
                background: 'none', border: 'none',
                borderBottom: `2px solid ${tab === t ? BRAND : 'transparent'}`,
                color: tab === t ? BRAND : 'var(--ink3)',
                fontFamily: 'inherit', fontSize: '12px',
                fontWeight: tab === t ? 800 : 600,
                cursor: 'pointer', textTransform: 'capitalize',
              }}>
              {t}
            </button>
          ))}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '22px' }}>
          {loading && <div style={{ color: 'var(--ink3)', fontSize: '13px' }}>Loading…</div>}
          {error   && <div style={{ padding: '12px 16px', background: 'var(--red-light)', border: '1px solid var(--red-border)', color: 'var(--red)', borderRadius: '10px', fontSize: '13px', fontWeight: 700 }}>{error}</div>}

          {data && tab === 'general'      && <GeneralTab stat={data.statistic} onPatch={savePatch} busy={busy} />}
          {data && tab === 'history'      && <HistoryTab rows={data.history} />}
          {data && tab === 'dependencies' && <DependenciesTab statisticId={data.statistic.id} deps={data.dependencies} onChanged={() => load(data.statistic.id)} />}
          {data && tab === 'approval'     && (
            <ApprovalTab
              stat={data.statistic} me={me} busy={busy}
              onSubmit={() => transition('submit')}
              onApprove={() => transition('approve')}
              onReject={() => {
                const reason = prompt('Rejection reason (required):')?.trim()
                if (reason) transition('reject', { reason })
              }}
              onArchive={archive}
            />
          )}
        </div>
      </div>
    </>
  )
}

/* ─── Tab: General ─────────────────────────────────────────────────── */
function GeneralTab({ stat, onPatch, busy }: {
  stat: Statistic & { updater?: { id: string; name: string } | null }
  onPatch: (p: Partial<Statistic> & { reason?: string }) => void
  busy: boolean
}) {
  const [draft, setDraft] = useState<Partial<Statistic> & { reason?: string }>({
    current_value: stat.current_value ?? '',
    unit:          stat.unit ?? '',
    description:   stat.description ?? '',
    source:        stat.source ?? '',
    name:          stat.name,
  })
  const dirty =
    draft.current_value !== (stat.current_value ?? '') ||
    (draft.unit ?? '') !== (stat.unit ?? '') ||
    (draft.description ?? '') !== (stat.description ?? '') ||
    (draft.source ?? '') !== (stat.source ?? '') ||
    (draft.name ?? '') !== stat.name

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <Field label="Name">
        <input value={draft.name ?? ''} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} style={INPUT_STYLE} />
      </Field>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '10px' }}>
        <Field label="Current value">
          <input value={draft.current_value ?? ''} onChange={e => setDraft(d => ({ ...d, current_value: e.target.value }))} style={INPUT_STYLE} />
        </Field>
        <Field label="Unit">
          <input value={draft.unit ?? ''} onChange={e => setDraft(d => ({ ...d, unit: e.target.value ?? '' }))} style={INPUT_STYLE} />
        </Field>
      </div>
      {stat.previous_value && (
        <div style={{ fontSize: '11px', color: 'var(--ink4)' }}>
          Previous value: <code style={{ background: 'var(--border-light)', padding: '1px 6px', borderRadius: '3px' }}>{stat.previous_value}</code>
        </div>
      )}
      <Field label="Description">
        <textarea value={draft.description ?? ''} onChange={e => setDraft(d => ({ ...d, description: e.target.value }))}
          rows={2} style={{ ...INPUT_STYLE, resize: 'vertical' }} />
      </Field>
      <Field label="Source (where does this number come from?)">
        <input value={draft.source ?? ''} onChange={e => setDraft(d => ({ ...d, source: e.target.value }))} style={INPUT_STYLE} placeholder="e.g. FY24 audited report" />
      </Field>
      <Field label="Change reason (optional)">
        <input value={draft.reason ?? ''} onChange={e => setDraft(d => ({ ...d, reason: e.target.value }))} style={INPUT_STYLE} placeholder="e.g. quarterly refresh" />
      </Field>
      <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
        <button
          onClick={() => onPatch(draft)}
          disabled={!dirty || busy}
          style={{
            background: dirty && !busy ? BRAND : 'var(--border-light)',
            color:      dirty && !busy ? 'var(--red-light)' : 'var(--ink4)',
            border: 'none', padding: '9px 20px', borderRadius: '8px',
            fontSize: '12px', fontWeight: 800, fontFamily: 'inherit',
            cursor: dirty && !busy ? 'pointer' : 'not-allowed',
          }}>
          {busy ? 'Saving…' : dirty ? 'Save changes' : 'Saved'}
        </button>
        {stat.approval_status === 'approved' && dirty && (
          <div style={{ fontSize: '11px', color: '#B87400', alignSelf: 'center' }}>
            Saving will drop status back to Draft — new value needs re-approval.
          </div>
        )}
      </div>
      <div style={{ marginTop: '18px', paddingTop: '14px', borderTop: '1px solid var(--border)', fontSize: '11px', color: 'var(--ink4)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
        <div>Owner: <strong style={{ color: 'var(--ink3)' }}>{stat.owner?.name ?? '—'}</strong></div>
        <div>Last updated by: <strong style={{ color: 'var(--ink3)' }}>{stat.updater?.name ?? '—'}</strong> · {fmtRel(stat.updated_at)}</div>
      </div>
    </div>
  )
}

/* ─── Tab: History ─────────────────────────────────────────────────── */
function HistoryTab({ rows }: { rows: HistoryRow[] }) {
  if (rows.length === 0) return <div style={{ color: 'var(--ink4)', fontSize: '13px', fontStyle: 'italic' }}>No history yet.</div>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {rows.map(h => (
        <div key={h.id} style={{
          padding: '12px 14px', border: '1px solid var(--border)', borderRadius: '10px',
          background: 'var(--card)', fontSize: '13px',
        }}>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ fontWeight: 700, color: 'var(--ink)' }}>{h.reason ?? 'Update'}</div>
            <div style={{ fontSize: '11px', color: 'var(--ink4)' }}>{fmtRel(h.changed_at)}</div>
          </div>
          {(h.old_value != null && h.new_value != null && h.old_value !== h.new_value) && (
            <div style={{ marginTop: '6px', fontSize: '12px', color: 'var(--ink3)' }}>
              <code style={{ background: 'var(--border-light)', padding: '1px 5px', borderRadius: '3px' }}>{h.old_value || '∅'}</code>
              {' → '}
              <code style={{ background: 'var(--border-light)', padding: '1px 5px', borderRadius: '3px' }}>{h.new_value || '∅'}</code>
            </div>
          )}
          {(h.status_before && h.status_after && h.status_before !== h.status_after) && (
            <div style={{ marginTop: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <StatusPill status={h.status_before} />
              <span style={{ color: 'var(--ink4)' }}>→</span>
              <StatusPill status={h.status_after} />
            </div>
          )}
          <div style={{ marginTop: '6px', fontSize: '11px', color: 'var(--ink4)' }}>By {h.changer?.name ?? 'unknown'}</div>
        </div>
      ))}
    </div>
  )
}

/* ─── Tab: Dependencies ────────────────────────────────────────────── */
function DependenciesTab({ statisticId, deps, onChanged }: { statisticId: string; deps: DependencyRow[]; onChanged: () => void }) {
  const [module, setModule] = useState('corporate_deck')
  const [assetName, setAssetName] = useState('')
  const [assetRef, setAssetRef] = useState('')
  const [busy, setBusy] = useState(false)

  async function add() {
    if (!assetName.trim()) { alert('Asset name is required.'); return }
    setBusy(true)
    try {
      const r = await fetch('/api/corporate-marketing/statistics/dependencies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ statistic_id: statisticId, module, asset_name: assetName.trim(), asset_reference: assetRef.trim() || null }),
      })
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || r.statusText)
      setAssetName(''); setAssetRef('')
      onChanged()
    } catch (e) {
      alert(`Add failed: ${e instanceof Error ? e.message : 'unknown'}`)
    } finally { setBusy(false) }
  }
  async function markReviewed(id: string) {
    await fetch(`/api/corporate-marketing/statistics/dependencies?id=${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'reviewed' }),
    })
    onChanged()
  }
  async function remove(id: string) {
    if (!confirm('Remove this dependency link?')) return
    await fetch(`/api/corporate-marketing/statistics/dependencies?id=${id}`, { method: 'DELETE' })
    onChanged()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      {/* Add form */}
      <div style={{ padding: '14px', border: `1px dashed ${BRAND}`, borderRadius: '10px', display: 'grid', gap: '8px', gridTemplateColumns: '1fr 1.4fr 1fr auto' }}>
        <select value={module} onChange={e => setModule(e.target.value)} style={INPUT_STYLE}>
          {MODULES.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
        </select>
        <input placeholder="Asset name (e.g. Corporate Deck)" value={assetName} onChange={e => setAssetName(e.target.value)} style={INPUT_STYLE} />
        <input placeholder="Reference (e.g. slide-6)" value={assetRef} onChange={e => setAssetRef(e.target.value)} style={INPUT_STYLE} />
        <Btn onClick={add} disabled={busy} primary>Link</Btn>
      </div>

      {/* List */}
      {deps.length === 0 ? (
        <div style={{ color: 'var(--ink4)', fontSize: '13px', fontStyle: 'italic' }}>
          No linked assets yet. When this statistic changes, linked assets get flagged as <strong>needs_review</strong>.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {deps.map(d => (
            <div key={d.id} style={{
              padding: '10px 14px', border: '1px solid var(--border)', borderRadius: '10px',
              background: 'var(--card)', display: 'grid', gap: '10px',
              gridTemplateColumns: '1fr auto', alignItems: 'center', fontSize: '13px',
            }}>
              <div>
                <div style={{ fontWeight: 700, color: 'var(--ink)' }}>
                  {MODULES.find(m => m.key === d.module)?.label ?? d.module} · {d.asset_name}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--ink4)', marginTop: '2px' }}>
                  {d.asset_reference && <>ref: <code>{d.asset_reference}</code> · </>}
                  linked {fmtRel(d.linked_at)}{d.linker?.name && ` by ${d.linker.name}`}
                  {d.last_reviewed_at && <> · last reviewed {fmtRel(d.last_reviewed_at)}</>}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                <DepStatusPill status={d.status} />
                {d.status === 'needs_review' && <Btn onClick={() => markReviewed(d.id)} primary>Mark reviewed</Btn>}
                <Btn onClick={() => remove(d.id)} danger>Remove</Btn>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function DepStatusPill({ status }: { status: string }) {
  const map: Record<string, { bg: string; fg: string }> = {
    active:       { bg: 'var(--success-light)', fg: 'var(--success)' },
    needs_review: { bg: '#F5B94D22',            fg: '#B87400' },
    reviewed:     { bg: 'var(--border-light)',  fg: 'var(--ink3)' },
    obsolete:     { bg: 'var(--red-light)',     fg: 'var(--red)' },
  }
  const s = map[status] ?? map.active
  return (
    <span style={{
      fontSize: '10px', fontWeight: 800, letterSpacing: '0.5px',
      background: s.bg, color: s.fg, padding: '3px 8px', borderRadius: '10px',
    }}>{status.replace('_', ' ')}</span>
  )
}

/* ─── Tab: Approval ────────────────────────────────────────────────── */
function ApprovalTab({ stat, me, busy, onSubmit, onApprove, onReject, onArchive }: {
  stat: Statistic
  me: ReturnType<typeof useMe>
  busy: boolean
  onSubmit: () => void
  onApprove: () => void
  onReject: () => void
  onArchive: () => void
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      <WorkflowDiagram current={stat.approval_status} />
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
        {stat.approval_status === 'draft'          && <Btn onClick={onSubmit} disabled={busy} primary>Submit for Review</Btn>}
        {stat.approval_status === 'pending_review' && me?.adm && (
          <>
            <Btn onClick={onApprove} disabled={busy} primary>Approve</Btn>
            <Btn onClick={onReject}  disabled={busy}>Reject</Btn>
          </>
        )}
        {stat.approval_status === 'pending_review' && !me?.adm && (
          <div style={{ fontSize: '12px', color: 'var(--ink4)' }}>Waiting on a super-admin to review + approve.</div>
        )}
        {stat.approval_status !== 'archived' && <Btn onClick={onArchive} disabled={busy} danger>Archive</Btn>}
      </div>
      <div style={{ fontSize: '11px', color: 'var(--ink4)', lineHeight: 1.55 }}>
        Only <strong>Approved</strong> statistics are consumed by other EventPilot modules
        (Corporate Deck, Knowledge Hub, Proposal Templates, Sales Decks). Approvers are
        super-admins only.
      </div>
    </div>
  )
}

function WorkflowDiagram({ current }: { current: string }) {
  const steps = [
    { key: 'draft',          label: 'Draft' },
    { key: 'pending_review', label: 'Pending Review' },
    { key: 'approved',       label: 'Approved' },
    { key: 'archived',       label: 'Archived' },
  ]
  return (
    <div style={{ display: 'flex', gap: '4px', alignItems: 'center', flexWrap: 'wrap' }}>
      {steps.map((s, i) => (
        <span key={s.key} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{
            padding: '5px 10px', borderRadius: '999px',
            fontSize: '11px', fontWeight: 800, letterSpacing: '0.5px',
            background: current === s.key ? BRAND             : 'var(--border-light)',
            color:      current === s.key ? 'var(--red-light)' : 'var(--ink3)',
          }}>
            {s.label}
          </span>
          {i < steps.length - 1 && <span style={{ color: 'var(--ink4)' }}>→</span>}
        </span>
      ))}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--ink4)', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '4px' }}>
        {label}
      </div>
      {children}
    </div>
  )
}
