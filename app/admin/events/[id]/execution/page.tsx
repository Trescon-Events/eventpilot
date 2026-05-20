'use client'

import { useState, useEffect, use } from 'react'
import Link from 'next/link'

// ── Types ─────────────────────────────────────────────────────────────────────
type Checkpoint = {
  id: string
  event_id: string
  master_id: string
  phase: number
  phase_name: string
  name: string
  timeline_type: 'fixed_duration' | 'fixed_pre_event' | 'cycle_dependent'
  cycle_track: string | null
  cycle_milestone_pct: number | null
  cycle_phase_label: string | null
  responsible_roles: string[]
  accountable_roles: string[]
  consulted_roles: string[]
  informed_roles: string[]
  approval_required: boolean
  approver_roles: string[]
  depends_on_names: string[]
  due_date: string | null
  status: 'not_started' | 'in_progress' | 'complete' | 'pending_approval' | 'approved' | 'rejected' | 'overdue'
  completion_notes: string | null
  completed_at: string | null
  sort_order: number
  latest_approval: {
    id: string; version: number; status: string;
    requested_at: string; reviewed_at: string | null;
    reviewer_role: string | null; review_note: string | null
  } | null
  overrides: { id: string; field_overridden: string; default_value: string; overridden_value: string; override_reason: string; overridden_at: string }[]
}

type CycleConfig = {
  id: string; event_id: string
  total_cycle_days: number
  cycle_start_date: string
  configured_at: string
}

type Event = {
  id: string; name: string; event_date: string | null; city: string | null; status: string
}

// ── Design ────────────────────────────────────────────────────────────────────
const BG      = '#E8EEF4'
const SURFACE = '#FFFFFF'
const DARK    = '#0F1923'
const MUTED   = '#5B7080'
const BORDER  = '#DDE8EE'
const ACCENT  = '#C0F43C'

const PHASE_COLORS = ['#6366F1','#0EA5E9','#EC4899','#F59E0B','#10B981']

const TRACK_META: Record<string, { label: string; color: string }> = {
  speaker_acquisition: { label: 'Speaker Acquisition',     color: '#6366F1' },
  sponsorship_sales:   { label: 'Sponsorship / Exhibitor Sales', color: '#0EA5E9' },
  delegate_sales:      { label: 'Delegate Sales',           color: '#EC4899' },
  marketing:           { label: 'Marketing Campaign',       color: '#F59E0B' },
  operations:          { label: 'Operations / Logistics',   color: '#10B981' },
  partnerships:        { label: 'Partnerships Cycle',       color: '#8B5CF6' },
  media_partners:      { label: 'Media Partners Cycle',     color: '#14B8A6' },
}

const STATUS_COLOR: Record<string, string> = {
  not_started:      '#94A3B8',
  in_progress:      '#D97706',
  complete:         '#16A34A',
  pending_approval: '#7C3AED',
  approved:         '#059669',
  rejected:         '#DC2626',
  overdue:          '#DC2626',
}
const STATUS_LABEL: Record<string, string> = {
  not_started:      'Not Started',
  in_progress:      'In Progress',
  complete:         'Done',
  pending_approval: 'Pending Approval',
  approved:         'Approved',
  rejected:         'Rejected',
  overdue:          'Overdue',
}

const TIMELINE_BADGE: Record<string, { label: string; color: string }> = {
  fixed_duration:   { label: 'Fixed Duration',    color: '#6366F1' },
  fixed_pre_event:  { label: 'Pre-Event Deadline', color: '#D97706' },
  cycle_dependent:  { label: 'Cycle Dependent',   color: '#0EA5E9' },
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function daysUntil(iso: string) {
  const diff = new Date(iso + 'T00:00:00').getTime() - Date.now()
  return Math.ceil(diff / 86400000)
}

function isRedFlag(cp: Checkpoint): boolean {
  const today = new Date().toISOString().slice(0, 10)
  return !!(cp.due_date && cp.due_date < today && !['complete','approved'].includes(cp.status))
}

// ── Role Pill ─────────────────────────────────────────────────────────────────
function RolePill({ role, type }: { role: string; type: 'R' | 'A' | 'C' | 'I' }) {
  const colors = { R: '#DC2626', A: '#D97706', C: '#2563EB', I: '#94A3B8' }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: '6px', background: colors[type] + '18', color: colors[type], whiteSpace: 'nowrap', marginRight: '3px', marginBottom: '3px' }}>
      <span style={{ fontSize: '9px', background: colors[type], color: '#fff', borderRadius: '3px', padding: '0 3px', fontWeight: 800 }}>{type}</span>
      {role}
    </span>
  )
}

// ── Status badge ──────────────────────────────────────────────────────────────
function StatusBadge({ s }: { s: string }) {
  const c = STATUS_COLOR[s] ?? MUTED
  return (
    <span style={{ fontSize: '11px', fontWeight: 700, padding: '3px 9px', borderRadius: '8px', background: c + '20', color: c, whiteSpace: 'nowrap' }}>
      {STATUS_LABEL[s] ?? s}
    </span>
  )
}

// ── Checkpoint Row ────────────────────────────────────────────────────────────
function CheckpointRow({
  cp, doneNames, onAction, phaseColor,
}: {
  cp: Checkpoint
  doneNames: Set<string>
  onAction: (action: 'update' | 'approve' | 'override', cp: Checkpoint) => void
  phaseColor: string
}) {
  const [expanded, setExpanded] = useState(false)
  const flag  = isRedFlag(cp)
  const tl    = TIMELINE_BADGE[cp.timeline_type]
  const blocked = cp.depends_on_names.some(n => !doneNames.has(n))
  const daysLeft = cp.due_date ? daysUntil(cp.due_date) : null
  const isApproved = cp.status === 'approved'

  return (
    <div style={{
      background: SURFACE,
      border: `1px solid ${flag ? '#DC262640' : BORDER}`,
      borderLeft: `3px solid ${flag ? '#DC2626' : isApproved ? '#059669' : phaseColor}`,
      borderRadius: '10px',
      marginBottom: '8px',
      overflow: 'hidden',
    }}>
      {/* Main row */}
      <div
        onClick={() => setExpanded(e => !e)}
        style={{ padding: '14px 18px', cursor: 'pointer', display: 'flex', alignItems: 'flex-start', gap: '14px' }}
      >
        {/* Left: status indicator */}
        <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: STATUS_COLOR[cp.status] ?? MUTED, flexShrink: 0, marginTop: '2px' }} />

        {/* Center: content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '6px' }}>
            {flag && (
              <span style={{ fontSize: '10px', fontWeight: 800, color: '#DC2626', background: '#DC262618', padding: '2px 6px', borderRadius: '5px' }}>
                RED FLAG
              </span>
            )}
            {blocked && !['approved','complete'].includes(cp.status) && (
              <span style={{ fontSize: '10px', fontWeight: 700, color: '#7C3AED', background: '#7C3AED15', padding: '2px 6px', borderRadius: '5px' }}>
                BLOCKED
              </span>
            )}
            {cp.approval_required && (
              <span style={{ fontSize: '9px', fontWeight: 800, color: '#7C3AED', background: '#7C3AED18', padding: '2px 6px', borderRadius: '5px', letterSpacing: '0.5px' }}>
                APPROVAL REQUIRED
              </span>
            )}
            <span style={{ fontSize: '13px', fontWeight: 700, color: DARK }}>{cp.name}</span>
          </div>

          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: '5px', background: tl.color + '18', color: tl.color }}>
              {tl.label}
              {cp.timeline_type === 'fixed_duration' ? '' :
               cp.timeline_type === 'fixed_pre_event' ? '' :
               cp.cycle_milestone_pct ? ` · ${cp.cycle_milestone_pct}%` : ''}
            </span>
            {cp.cycle_phase_label && (
              <span style={{ fontSize: '10px', color: MUTED, fontWeight: 600 }}>{cp.cycle_phase_label}</span>
            )}
            <StatusBadge s={cp.status} />
          </div>
        </div>

        {/* Right: due date + toggle */}
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          {cp.due_date ? (
            <>
              <div style={{ fontSize: '12px', fontWeight: 700, color: flag ? '#DC2626' : DARK }}>{fmtDate(cp.due_date)}</div>
              <div style={{ fontSize: '10px', color: daysLeft !== null && daysLeft < 0 ? '#DC2626' : MUTED, fontWeight: 600 }}>
                {daysLeft !== null ? (daysLeft < 0 ? `${Math.abs(daysLeft)}d overdue` : daysLeft === 0 ? 'Today' : `${daysLeft}d left`) : ''}
              </div>
            </>
          ) : (
            <div style={{ fontSize: '11px', color: MUTED }}>No date set</div>
          )}
          {cp.overrides.length > 0 && (
            <div style={{ fontSize: '9px', color: '#D97706', fontWeight: 700, marginTop: '2px' }}>OVERRIDDEN</div>
          )}
        </div>

        <div style={{ color: MUTED, fontSize: '16px', flexShrink: 0, marginTop: '1px' }}>
          {expanded ? '▲' : '▼'}
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div style={{ padding: '0 18px 16px', borderTop: `1px solid ${BORDER}` }}>

          {/* RACI */}
          <div style={{ marginTop: '14px' }}>
            <div style={{ fontSize: '10px', fontWeight: 800, color: MUTED, letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '8px' }}>RACI</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
              {cp.responsible_roles.map(r  => <RolePill key={r}  role={r} type="R" />)}
              {cp.accountable_roles.map(r  => <RolePill key={r}  role={r} type="A" />)}
              {cp.consulted_roles.map(r    => <RolePill key={r}  role={r} type="C" />)}
              {cp.informed_roles.map(r     => <RolePill key={r}  role={r} type="I" />)}
            </div>
          </div>

          {/* Approvers */}
          {cp.approval_required && (
            <div style={{ marginTop: '10px' }}>
              <div style={{ fontSize: '10px', fontWeight: 800, color: MUTED, letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '6px' }}>Approvers</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                {cp.approver_roles.map(r => (
                  <span key={r} style={{ fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '6px', background: '#7C3AED18', color: '#7C3AED' }}>{r}</span>
                ))}
              </div>
            </div>
          )}

          {/* Dependencies */}
          {cp.depends_on_names.length > 0 && (
            <div style={{ marginTop: '10px' }}>
              <div style={{ fontSize: '10px', fontWeight: 800, color: MUTED, letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '6px' }}>Depends On</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                {cp.depends_on_names.map(n => (
                  <span key={n} style={{ fontSize: '10px', fontWeight: 600, padding: '2px 8px', borderRadius: '6px', background: doneNames.has(n) ? '#05996918' : '#DC262618', color: doneNames.has(n) ? '#059669' : '#DC2626' }}>
                    {doneNames.has(n) ? '✓ ' : '⏳ '}{n}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Latest approval */}
          {cp.latest_approval && (
            <div style={{ marginTop: '10px', padding: '10px 12px', borderRadius: '8px', background: BG }}>
              <div style={{ fontSize: '10px', fontWeight: 800, color: MUTED, letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '4px' }}>Latest Approval (v{cp.latest_approval.version})</div>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                <StatusBadge s={cp.latest_approval.status} />
                {cp.latest_approval.reviewer_role && <span style={{ fontSize: '11px', color: MUTED }}>by {cp.latest_approval.reviewer_role}</span>}
                {cp.latest_approval.reviewed_at && <span style={{ fontSize: '11px', color: MUTED }}>{fmtDate(cp.latest_approval.reviewed_at.slice(0,10))}</span>}
                {cp.latest_approval.review_note && <span style={{ fontSize: '11px', color: DARK, fontStyle: 'italic' }}>"{cp.latest_approval.review_note}"</span>}
              </div>
            </div>
          )}

          {/* Override history */}
          {cp.overrides.length > 0 && (
            <div style={{ marginTop: '10px' }}>
              <div style={{ fontSize: '10px', fontWeight: 800, color: '#D97706', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '6px' }}>Override History</div>
              {cp.overrides.map(o => (
                <div key={o.id} style={{ fontSize: '11px', color: MUTED, marginBottom: '4px' }}>
                  <strong style={{ color: DARK }}>{o.field_overridden}</strong>: {o.default_value ?? 'none'} → <strong style={{ color: '#D97706' }}>{o.overridden_value}</strong> — "{o.override_reason}" ({fmtDate(o.overridden_at.slice(0,10))})
                </div>
              ))}
            </div>
          )}

          {/* Completion notes */}
          {cp.completion_notes && (
            <div style={{ marginTop: '10px', fontSize: '12px', color: MUTED, fontStyle: 'italic' }}>Notes: {cp.completion_notes}</div>
          )}

          {/* Actions */}
          <div style={{ marginTop: '14px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {!['approved'].includes(cp.status) && (
              <button
                onClick={e => { e.stopPropagation(); onAction('update', cp) }}
                style={{ padding: '7px 16px', borderRadius: '8px', background: ACCENT, color: DARK, fontSize: '12px', fontWeight: 700, border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
                Update Status
              </button>
            )}
            {cp.approval_required && ['complete','rejected'].includes(cp.status) && (
              <button
                onClick={e => { e.stopPropagation(); onAction('approve', cp) }}
                style={{ padding: '7px 16px', borderRadius: '8px', background: '#7C3AED', color: '#fff', fontSize: '12px', fontWeight: 700, border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
                {cp.status === 'rejected' ? 'Re-submit for Approval' : 'Submit for Approval'}
              </button>
            )}
            {cp.approval_required && cp.status === 'pending_approval' && (
              <button
                onClick={e => { e.stopPropagation(); onAction('approve', cp) }}
                style={{ padding: '7px 16px', borderRadius: '8px', background: '#059669', color: '#fff', fontSize: '12px', fontWeight: 700, border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
                Review & Decide
              </button>
            )}
            <button
              onClick={e => { e.stopPropagation(); onAction('override', cp) }}
              style={{ padding: '7px 16px', borderRadius: '8px', background: 'transparent', color: '#D97706', fontSize: '12px', fontWeight: 700, border: `1px solid #D97706`, cursor: 'pointer', fontFamily: 'inherit' }}>
              COO Override
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Cycle Track Card (Phase 4) ────────────────────────────────────────────────
function CycleTrackCard({
  track, checkpoints, doneNames, onAction,
}: {
  track: string
  checkpoints: Checkpoint[]
  doneNames: Set<string>
  onAction: (action: 'update' | 'approve' | 'override', cp: Checkpoint) => void
}) {
  const meta  = TRACK_META[track] ?? { label: track, color: '#64748B' }
  const total = checkpoints.length
  const done  = checkpoints.filter(c => ['complete','approved'].includes(c.status)).length
  const pct   = total > 0 ? Math.round((done / total) * 100) : 0
  const flags = checkpoints.filter(isRedFlag).length
  const [open, setOpen] = useState(false)

  return (
    <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: '12px', overflow: 'hidden', marginBottom: '12px' }}>
      <div
        onClick={() => setOpen(o => !o)}
        style={{ padding: '16px 20px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '14px' }}
      >
        <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: meta.color, flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
            <span style={{ fontSize: '14px', fontWeight: 800, color: DARK }}>{meta.label}</span>
            {flags > 0 && <span style={{ fontSize: '10px', fontWeight: 800, color: '#DC2626', background: '#DC262618', padding: '2px 6px', borderRadius: '5px' }}>{flags} RED FLAG{flags > 1 ? 'S' : ''}</span>}
            <span style={{ fontSize: '11px', fontWeight: 700, color: MUTED }}>{done}/{total}</span>
          </div>
          <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
            {checkpoints.map((cp, i) => {
              const isDone  = ['complete','approved'].includes(cp.status)
              const isCurr  = !isDone && i === checkpoints.findIndex(c => !['complete','approved'].includes(c.status))
              const isFlag  = isRedFlag(cp)
              return (
                <div key={cp.id} style={{
                  flex: 1, height: '8px', borderRadius: '4px',
                  background: isFlag ? '#DC2626' : isDone ? meta.color : isCurr ? meta.color + '60' : BORDER,
                  transition: 'background 0.2s',
                }} title={cp.name} />
              )
            })}
            <span style={{ fontSize: '12px', fontWeight: 800, color: meta.color, marginLeft: '6px', flexShrink: 0 }}>{pct}%</span>
          </div>
        </div>
        <span style={{ color: MUTED, fontSize: '16px' }}>{open ? '▲' : '▼'}</span>
      </div>

      {open && (
        <div style={{ padding: '0 16px 16px', borderTop: `1px solid ${BORDER}` }}>
          <div style={{ paddingTop: '12px' }}>
            {checkpoints.map(cp => (
              <CheckpointRow key={cp.id} cp={cp} doneNames={doneNames} onAction={onAction} phaseColor={meta.color} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function ExecutionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = use(params)

  const [event,       setEvent]       = useState<Event | null>(null)
  const [config,      setConfig]      = useState<CycleConfig | null>(null)
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([])
  const [redFlags,    setRedFlags]    = useState(0)
  const [phase,       setPhase]       = useState(1)
  const [loading,     setLoading]     = useState(true)

  // Modals
  const [updateModal,   setUpdateModal]   = useState<Checkpoint | null>(null)
  const [approveModal,  setApproveModal]  = useState<Checkpoint | null>(null)
  const [overrideModal, setOverrideModal] = useState<Checkpoint | null>(null)
  const [configModal,   setConfigModal]   = useState(false)

  // Form states
  const [newStatus, setNewStatus]   = useState('')
  const [newNotes,  setNewNotes]    = useState('')
  const [aprRole,   setAprRole]     = useState('')
  const [aprNote,   setAprNote]     = useState('')
  const [aprDecision, setAprDecision] = useState<'approved'|'rejected'>('approved')
  const [ovrField,  setOvrField]    = useState('due_date')
  const [ovrValue,  setOvrValue]    = useState('')
  const [ovrReason, setOvrReason]   = useState('')
  const [cfgDays,   setCfgDays]     = useState('')
  const [cfgStart,  setCfgStart]    = useState('')
  const [saving,    setSaving]      = useState(false)

  async function load() {
    setLoading(true)
    const [evRes, cfgRes, cpRes] = await Promise.all([
      fetch(`/api/events?id=${eventId}`),
      fetch(`/api/events/raci/config?event_id=${eventId}`),
      fetch(`/api/events/raci?event_id=${eventId}`),
    ])
    const ev  = await evRes.json().catch(() => null)
    const cfg = await cfgRes.json().catch(() => null)
    const cp  = await cpRes.json().catch(() => null)

    setEvent(ev?.event ?? ev ?? null)
    setConfig(cfg)
    setCheckpoints(cp?.checkpoints ?? [])
    setRedFlags(cp?.red_flag_count ?? 0)
    setLoading(false)
  }

  useEffect(() => { load() }, [eventId])

  // Derived
  const doneNames = new Set(
    checkpoints.filter(c => ['complete','approved'].includes(c.status)).map(c => c.name)
  )

  const phaseCheckpoints = checkpoints.filter(c => c.phase === phase)
  const phaseTabs = [1,2,3,4,5].map(p => ({
    id: p,
    label: ['Concept', 'Planning', 'Assets', 'Cycle Tracks', 'Pre-Event Lock'][p-1],
    total: checkpoints.filter(c => c.phase === p).length,
    done:  checkpoints.filter(c => c.phase === p && ['complete','approved'].includes(c.status)).length,
    flags: checkpoints.filter(c => c.phase === p && isRedFlag(c)).length,
    color: PHASE_COLORS[p-1],
  }))

  // Phase 4 — group by cycle track
  const tracks = phase === 4
    ? Object.keys(TRACK_META).filter(t => phaseCheckpoints.some(c => c.cycle_track === t))
    : []

  function handleAction(action: 'update' | 'approve' | 'override', cp: Checkpoint) {
    if (action === 'update') {
      setNewStatus(cp.status)
      setNewNotes(cp.completion_notes ?? '')
      setUpdateModal(cp)
    } else if (action === 'approve') {
      setAprRole('')
      setAprNote('')
      setAprDecision('approved')
      setApproveModal(cp)
    } else {
      setOvrField('due_date')
      setOvrValue(cp.due_date ?? '')
      setOvrReason('')
      setOverrideModal(cp)
    }
  }

  async function submitUpdate() {
    if (!updateModal) return
    setSaving(true)
    await fetch(`/api/events/raci?id=${updateModal.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus, completion_notes: newNotes || null }),
    })
    setSaving(false)
    setUpdateModal(null)
    load()
  }

  async function submitApproval() {
    if (!approveModal) return
    setSaving(true)

    if (approveModal.status === 'pending_approval') {
      // Reviewer action
      const { id: appId } = await fetch('/api/events/raci/approve', {
        method: 'GET',
      }).then(r => r.json()).then((arr: { id: string; checkpoint_id: string }[]) =>
        arr.find(a => a.checkpoint_id === approveModal.id) ?? { id: '' }
      )
      await fetch('/api/events/raci/approve', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          approval_id:   appId,
          checkpoint_id: approveModal.id,
          decision:      aprDecision,
          reviewer_role: aprRole || null,
          review_note:   aprNote  || null,
        }),
      })
    } else {
      // Submit for approval
      await fetch('/api/events/raci/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checkpoint_id: approveModal.id, event_id: eventId }),
      })
    }

    setSaving(false)
    setApproveModal(null)
    load()
  }

  async function submitOverride() {
    if (!overrideModal || !ovrReason.trim()) return
    setSaving(true)
    await fetch('/api/events/raci/override', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        checkpoint_id: overrideModal.id,
        event_id:      eventId,
        field:         ovrField,
        new_value:     ovrValue,
        reason:        ovrReason,
      }),
    })
    setSaving(false)
    setOverrideModal(null)
    load()
  }

  async function submitConfig() {
    if (!cfgDays || !cfgStart) return
    setSaving(true)
    await fetch('/api/events/raci/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_id:         eventId,
        total_cycle_days: parseInt(cfgDays),
        cycle_start_date: cfgStart,
      }),
    })
    setSaving(false)
    setConfigModal(false)
    load()
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', background: BG, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui, sans-serif', color: MUTED }}>
      Loading execution flow…
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: BG, fontFamily: 'system-ui, sans-serif' }}>

      {/* Header */}
      <div style={{ background: SURFACE, borderBottom: `1px solid ${BORDER}`, padding: '0 32px' }}>
        <div style={{ maxWidth: '1280px', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '60px', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <Link href={`/admin/events/${eventId}`} style={{ fontSize: '13px', color: MUTED, textDecoration: 'none', fontWeight: 600 }}>← Event</Link>
            <div style={{ width: '1px', height: '20px', background: BORDER }} />
            <div style={{ fontSize: '15px', fontWeight: 800, color: DARK }}>Execution Flow</div>
            {event?.name && <div style={{ fontSize: '13px', color: MUTED }}>· {event.name}</div>}
          </div>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            {redFlags > 0 && (
              <div style={{ fontSize: '12px', fontWeight: 800, color: '#DC2626', background: '#DC262618', padding: '6px 14px', borderRadius: '8px' }}>
                ⚠ {redFlags} Red Flag{redFlags > 1 ? 's' : ''}
              </div>
            )}
            {event?.event_date && (
              <div style={{ fontSize: '12px', color: MUTED, fontWeight: 600 }}>Event: {fmtDate(event.event_date)}</div>
            )}
            <button
              onClick={() => { setCfgDays(String(config?.total_cycle_days ?? '')); setCfgStart(config?.cycle_start_date ?? ''); setConfigModal(true) }}
              style={{ padding: '8px 16px', borderRadius: '10px', background: config ? SURFACE : ACCENT, color: config ? DARK : DARK, fontSize: '12px', fontWeight: 700, border: `1px solid ${BORDER}`, cursor: 'pointer', fontFamily: 'inherit' }}>
              {config ? 'Edit COO Config' : 'Set Up Execution'}
            </button>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '28px 32px' }}>

        {/* COO Config Banner — shown when not yet configured */}
        {!config && (
          <div style={{ background: '#7C3AED18', border: `1px solid #7C3AED40`, borderRadius: '12px', padding: '20px 24px', marginBottom: '24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
            <div>
              <div style={{ fontSize: '14px', fontWeight: 800, color: '#7C3AED', marginBottom: '4px' }}>COO Execution Setup Required</div>
              <div style={{ fontSize: '13px', color: MUTED }}>Set the total event cycle duration and start date. This calculates all milestone and deadline dates across the 5 phases. All fixed-duration, cycle-dependent, and pre-event deadline items will be dated automatically.</div>
            </div>
            <button
              onClick={() => setConfigModal(true)}
              style={{ padding: '10px 22px', borderRadius: '10px', background: '#7C3AED', color: '#fff', fontSize: '13px', fontWeight: 700, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit' }}>
              Configure Now
            </button>
          </div>
        )}

        {/* Config summary bar */}
        {config && (
          <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: '10px', padding: '12px 20px', marginBottom: '20px', display: 'flex', gap: '24px', flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ fontSize: '11px', color: MUTED, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px' }}>Execution Config</div>
            <div style={{ fontSize: '13px', fontWeight: 700, color: DARK }}>Cycle Start: <span style={{ color: '#6366F1' }}>{fmtDate(config.cycle_start_date)}</span></div>
            <div style={{ fontSize: '13px', fontWeight: 700, color: DARK }}>Cycle Duration: <span style={{ color: '#6366F1' }}>{config.total_cycle_days} days</span></div>
            {event?.event_date && <div style={{ fontSize: '13px', fontWeight: 700, color: DARK }}>Event Date: <span style={{ color: '#10B981' }}>{fmtDate(event.event_date)}</span></div>}
            <div style={{ fontSize: '11px', color: MUTED }}>Configured {fmtDate(config.configured_at.slice(0,10))}</div>
          </div>
        )}

        {/* RACI Legend */}
        <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap', alignItems: 'center' }}>
          {[['R','#DC2626','Responsible'],['A','#D97706','Accountable'],['C','#2563EB','Consulted'],['I','#94A3B8','Informed']].map(([t,c,l]) => (
            <div key={t} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: MUTED, fontWeight: 600 }}>
              <span style={{ width: '18px', height: '18px', borderRadius: '4px', background: c as string, color: '#fff', fontSize: '10px', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{t}</span>
              {l}
            </div>
          ))}
          <div style={{ width: '1px', height: '20px', background: BORDER, margin: '0 4px' }} />
          <div style={{ fontSize: '11px', color: MUTED, fontWeight: 600 }}>Purple badge = approval required</div>
        </div>

        {/* Phase navigation */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', flexWrap: 'wrap' }}>
          {phaseTabs.map(pt => (
            <button
              key={pt.id}
              onClick={() => setPhase(pt.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                padding: '10px 18px', borderRadius: '10px',
                background: phase === pt.id ? pt.color : SURFACE,
                color: phase === pt.id ? '#fff' : DARK,
                border: `2px solid ${phase === pt.id ? pt.color : BORDER}`,
                fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                transition: 'all 0.15s',
              }}>
              <span style={{ fontSize: '10px', fontWeight: 800, opacity: 0.7 }}>Phase {pt.id}</span>
              {pt.label}
              {pt.flags > 0 && (
                <span style={{ background: '#DC2626', color: '#fff', borderRadius: '8px', fontSize: '10px', fontWeight: 800, padding: '1px 5px' }}>{pt.flags}</span>
              )}
              <span style={{
                fontSize: '10px', fontWeight: 700,
                background: phase === pt.id ? 'rgba(255,255,255,0.3)' : BG,
                color: phase === pt.id ? '#fff' : MUTED,
                borderRadius: '6px', padding: '1px 6px'
              }}>{pt.done}/{pt.total}</span>
            </button>
          ))}
        </div>

        {/* Phase 4: Cycle Tracks grouped */}
        {phase === 4 && (
          <>
            <div style={{ fontSize: '12px', color: MUTED, marginBottom: '16px', fontWeight: 600 }}>
              These tracks are milestone-driven. No formal approval required — the system flags missed milestones as red flags. Visibility is automatic for Accountable and Consulted roles.
            </div>
            {tracks.map(track => (
              <CycleTrackCard
                key={track}
                track={track}
                checkpoints={phaseCheckpoints.filter(c => c.cycle_track === track)}
                doneNames={doneNames}
                onAction={handleAction}
              />
            ))}
          </>
        )}

        {/* Phases 1, 2, 3, 5: flat list */}
        {phase !== 4 && (
          <>
            {phaseCheckpoints.length === 0 && (
              <div style={{ textAlign: 'center', padding: '60px', color: MUTED, background: SURFACE, borderRadius: '12px', border: `1px solid ${BORDER}` }}>
                {!config ? 'Configure the COO execution setup above to seed checkpoints.' : 'No checkpoints for this phase.'}
              </div>
            )}
            {phaseCheckpoints.map(cp => (
              <CheckpointRow key={cp.id} cp={cp} doneNames={doneNames} onAction={handleAction} phaseColor={PHASE_COLORS[phase-1]} />
            ))}
          </>
        )}
      </div>

      {/* ── MODALS ─────────────────────────────────────────────────────────── */}
      {(updateModal || approveModal || overrideModal || configModal) && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px' }}
          onClick={e => { if (e.target === e.currentTarget) { setUpdateModal(null); setApproveModal(null); setOverrideModal(null); setConfigModal(false) } }}>
          <div style={{ background: SURFACE, borderRadius: '16px', padding: '28px', width: '100%', maxWidth: '480px', maxHeight: '90vh', overflowY: 'auto' }}>

            {/* Update Status Modal */}
            {updateModal && (
              <>
                <div style={{ fontSize: '16px', fontWeight: 800, color: DARK, marginBottom: '4px' }}>Update Checkpoint</div>
                <div style={{ fontSize: '13px', color: MUTED, marginBottom: '20px' }}>{updateModal.name}</div>
                <label style={{ fontSize: '11px', fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '1px', display: 'block', marginBottom: '6px' }}>Status</label>
                <select value={newStatus} onChange={e => setNewStatus(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: `1px solid ${BORDER}`, fontSize: '13px', marginBottom: '16px', fontFamily: 'inherit', outline: 'none' }}>
                  <option value="not_started">Not Started</option>
                  <option value="in_progress">In Progress</option>
                  <option value="complete">Complete</option>
                </select>
                <label style={{ fontSize: '11px', fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '1px', display: 'block', marginBottom: '6px' }}>Completion Notes</label>
                <textarea value={newNotes} onChange={e => setNewNotes(e.target.value)} rows={3}
                  placeholder="Add notes about this completion…"
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: `1px solid ${BORDER}`, fontSize: '13px', fontFamily: 'inherit', outline: 'none', resize: 'vertical', boxSizing: 'border-box' }} />
                {updateModal.approval_required && newStatus === 'complete' && (
                  <div style={{ marginTop: '12px', padding: '10px 14px', borderRadius: '8px', background: '#7C3AED18', border: '1px solid #7C3AED30', fontSize: '12px', color: '#7C3AED', fontWeight: 600 }}>
                    This checkpoint requires formal approval. After saving, use "Submit for Approval" to trigger the approval workflow.
                  </div>
                )}
                <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                  <button onClick={submitUpdate} disabled={saving}
                    style={{ flex: 1, padding: '11px', borderRadius: '10px', background: ACCENT, color: DARK, fontSize: '13px', fontWeight: 700, border: 'none', cursor: 'pointer', fontFamily: 'inherit', opacity: saving ? 0.6 : 1 }}>
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                  <button onClick={() => setUpdateModal(null)}
                    style={{ padding: '11px 18px', borderRadius: '10px', background: BG, color: MUTED, fontSize: '13px', fontWeight: 700, border: `1px solid ${BORDER}`, cursor: 'pointer', fontFamily: 'inherit' }}>
                    Cancel
                  </button>
                </div>
              </>
            )}

            {/* Approve / Review Modal */}
            {approveModal && (
              <>
                <div style={{ fontSize: '16px', fontWeight: 800, color: DARK, marginBottom: '4px' }}>
                  {approveModal.status === 'pending_approval' ? 'Review Approval' : 'Submit for Approval'}
                </div>
                <div style={{ fontSize: '13px', color: MUTED, marginBottom: '6px' }}>{approveModal.name}</div>
                {approveModal.approver_roles.length > 0 && (
                  <div style={{ fontSize: '12px', color: MUTED, marginBottom: '20px' }}>
                    Approver roles: {approveModal.approver_roles.join(', ')}
                  </div>
                )}
                {approveModal.status === 'pending_approval' && (
                  <>
                    <label style={{ fontSize: '11px', fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '1px', display: 'block', marginBottom: '6px' }}>Decision</label>
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                      {(['approved','rejected'] as const).map(d => (
                        <button key={d} onClick={() => setAprDecision(d)}
                          style={{ flex: 1, padding: '10px', borderRadius: '8px', background: aprDecision === d ? (d === 'approved' ? '#059669' : '#DC2626') : BG, color: aprDecision === d ? '#fff' : MUTED, fontSize: '13px', fontWeight: 700, border: `1px solid ${BORDER}`, cursor: 'pointer', fontFamily: 'inherit' }}>
                          {d === 'approved' ? 'Approve' : 'Reject'}
                        </button>
                      ))}
                    </div>
                    <label style={{ fontSize: '11px', fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '1px', display: 'block', marginBottom: '6px' }}>Your Role</label>
                    <select value={aprRole} onChange={e => setAprRole(e.target.value)}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: `1px solid ${BORDER}`, fontSize: '13px', marginBottom: '16px', fontFamily: 'inherit', outline: 'none' }}>
                      <option value="">Select role…</option>
                      {approveModal.approver_roles.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                    <label style={{ fontSize: '11px', fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '1px', display: 'block', marginBottom: '6px' }}>Review Note</label>
                    <textarea value={aprNote} onChange={e => setAprNote(e.target.value)} rows={3}
                      placeholder="Add a review note (required for rejections)…"
                      style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: `1px solid ${BORDER}`, fontSize: '13px', fontFamily: 'inherit', outline: 'none', resize: 'vertical', boxSizing: 'border-box' }} />
                  </>
                )}
                {approveModal.status !== 'pending_approval' && (
                  <div style={{ padding: '14px', borderRadius: '10px', background: '#7C3AED10', border: '1px solid #7C3AED30', fontSize: '13px', color: MUTED, marginBottom: '16px' }}>
                    This will submit the checkpoint to the approval queue. Approvers: <strong>{approveModal.approver_roles.join(', ')}</strong>.
                  </div>
                )}
                <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                  <button onClick={submitApproval} disabled={saving}
                    style={{ flex: 1, padding: '11px', borderRadius: '10px', background: '#7C3AED', color: '#fff', fontSize: '13px', fontWeight: 700, border: 'none', cursor: 'pointer', fontFamily: 'inherit', opacity: saving ? 0.6 : 1 }}>
                    {saving ? 'Saving…' : approveModal.status === 'pending_approval' ? 'Submit Decision' : 'Submit for Approval'}
                  </button>
                  <button onClick={() => setApproveModal(null)}
                    style={{ padding: '11px 18px', borderRadius: '10px', background: BG, color: MUTED, fontSize: '13px', fontWeight: 700, border: `1px solid ${BORDER}`, cursor: 'pointer', fontFamily: 'inherit' }}>
                    Cancel
                  </button>
                </div>
              </>
            )}

            {/* Override Modal */}
            {overrideModal && (
              <>
                <div style={{ fontSize: '16px', fontWeight: 800, color: DARK, marginBottom: '4px' }}>COO Override</div>
                <div style={{ fontSize: '13px', color: MUTED, marginBottom: '4px' }}>{overrideModal.name}</div>
                <div style={{ fontSize: '12px', color: '#D97706', marginBottom: '20px', fontWeight: 600 }}>All overrides are logged with a mandatory reason for audit purposes.</div>
                <label style={{ fontSize: '11px', fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '1px', display: 'block', marginBottom: '6px' }}>Override Field</label>
                <select value={ovrField} onChange={e => setOvrField(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: `1px solid ${BORDER}`, fontSize: '13px', marginBottom: '16px', fontFamily: 'inherit', outline: 'none' }}>
                  <option value="due_date">Due Date</option>
                </select>
                <label style={{ fontSize: '11px', fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '1px', display: 'block', marginBottom: '6px' }}>New Value</label>
                <input type="date" value={ovrValue} onChange={e => setOvrValue(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: `1px solid ${BORDER}`, fontSize: '13px', marginBottom: '16px', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
                <label style={{ fontSize: '11px', fontWeight: 700, color: '#D97706', textTransform: 'uppercase', letterSpacing: '1px', display: 'block', marginBottom: '6px' }}>Reason * (required)</label>
                <textarea value={ovrReason} onChange={e => setOvrReason(e.target.value)} rows={3}
                  placeholder="Explain why this override is necessary…"
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: `1px solid ${ovrReason.trim() ? BORDER : '#D97706'}`, fontSize: '13px', fontFamily: 'inherit', outline: 'none', resize: 'vertical', boxSizing: 'border-box' }} />
                <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                  <button onClick={submitOverride} disabled={saving || !ovrReason.trim()}
                    style={{ flex: 1, padding: '11px', borderRadius: '10px', background: '#D97706', color: '#fff', fontSize: '13px', fontWeight: 700, border: 'none', cursor: ovrReason.trim() ? 'pointer' : 'not-allowed', fontFamily: 'inherit', opacity: (saving || !ovrReason.trim()) ? 0.6 : 1 }}>
                    {saving ? 'Saving…' : 'Apply Override'}
                  </button>
                  <button onClick={() => setOverrideModal(null)}
                    style={{ padding: '11px 18px', borderRadius: '10px', background: BG, color: MUTED, fontSize: '13px', fontWeight: 700, border: `1px solid ${BORDER}`, cursor: 'pointer', fontFamily: 'inherit' }}>
                    Cancel
                  </button>
                </div>
              </>
            )}

            {/* COO Config Modal */}
            {configModal && (
              <>
                <div style={{ fontSize: '16px', fontWeight: 800, color: DARK, marginBottom: '4px' }}>{config ? 'Edit Execution Config' : 'COO Execution Setup'}</div>
                <div style={{ fontSize: '13px', color: MUTED, marginBottom: '20px' }}>
                  Set the event cycle duration and start date. All fixed-duration item deadlines, cycle-based milestone dates, and pre-event window dates are calculated from these values.
                </div>
                <label style={{ fontSize: '11px', fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '1px', display: 'block', marginBottom: '6px' }}>Cycle Start Date</label>
                <input type="date" value={cfgStart} onChange={e => setCfgStart(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: `1px solid ${BORDER}`, fontSize: '13px', marginBottom: '16px', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
                <label style={{ fontSize: '11px', fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '1px', display: 'block', marginBottom: '6px' }}>Total Cycle Duration (days)</label>
                <input type="number" value={cfgDays} onChange={e => setCfgDays(e.target.value)} min="30" max="730"
                  placeholder="e.g. 180 for a 6-month event cycle"
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: `1px solid ${BORDER}`, fontSize: '13px', marginBottom: '8px', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
                <div style={{ fontSize: '11px', color: MUTED, marginBottom: '20px' }}>
                  Phase 1–3 fixed-duration items are scheduled from cycle start. Phase 4 cycle milestones are distributed across the cycle. Phase 5 pre-event deadlines count back from the event date.
                </div>
                {config && (
                  <div style={{ padding: '10px 14px', borderRadius: '8px', background: '#D9770618', border: '1px solid #D9770630', fontSize: '12px', color: '#D97706', fontWeight: 600, marginBottom: '16px' }}>
                    Reconfiguring will recalculate all un-overridden due dates. Manually overridden dates are preserved.
                  </div>
                )}
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button onClick={submitConfig} disabled={saving || !cfgDays || !cfgStart}
                    style={{ flex: 1, padding: '11px', borderRadius: '10px', background: ACCENT, color: DARK, fontSize: '13px', fontWeight: 700, border: 'none', cursor: 'pointer', fontFamily: 'inherit', opacity: (saving || !cfgDays || !cfgStart) ? 0.6 : 1 }}>
                    {saving ? 'Saving…' : config ? 'Update Config' : 'Configure & Seed Checkpoints'}
                  </button>
                  <button onClick={() => setConfigModal(false)}
                    style={{ padding: '11px 18px', borderRadius: '10px', background: BG, color: MUTED, fontSize: '13px', fontWeight: 700, border: `1px solid ${BORDER}`, cursor: 'pointer', fontFamily: 'inherit' }}>
                    Cancel
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
