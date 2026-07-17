'use client'

/*
  Access Requests Dashboard.

  Admin-only. Route: /admin/access-requests.

  Lists every /no-access "Request access" click captured in the
  access_requests table. Filter tabs: Pending (default) / Granted /
  Denied / Expired / Revoked / All. Grant modal offers permanent OR
  time-boxed access; time-boxed grants auto-revoke via the cron.
*/

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'

type Status = 'pending' | 'granted' | 'denied' | 'expired' | 'revoked' | 'all'

type Request = {
  id:               string
  staff_id:         string
  requester_name:   string
  requester_email:  string
  requester_role:   string | null
  requester_dept:   string | null
  tool_key:         string
  tool_label:       string
  manual_grant:     boolean
  from_path:        string | null
  requested_at:     string
  status:           Exclude<Status, 'all'>
  handler_name:     string | null
  handled_at:       string | null
  note:             string | null
  granted_until:    string | null
  expires_in_ms:    number | null
  revoked_at:       string | null
  revoked_reason:   string | null
}

type Counts = { pending: number; granted: number; denied: number; expired: number; revoked: number }

// BRAND is alpha-suffixed at runtime (`${BRAND}20` etc.) so it must stay a literal
// hex rather than var(--teal-mid) — kept in sync with that token's value by hand.
// LIME/DARK/MUTED are never alpha-suffixed, so they hold var() strings directly —
// every consumer below picks up the token through the constant with no per-line edits.
const BRAND = '#12C9BD'
const LIME  = 'var(--lime)'
const DARK  = 'var(--ink)'
const MUTED = 'var(--ink3)'

// Categorical status→color map. Bg/text pairs reuse the theme's family -light/bright
// tokens (rule: text-on-family's-own-light-tint) so each clears 5:1+ on the dark card.
const STATUS_STYLES: Record<Exclude<Status, 'all'>, { color: string; bg: string; label: string }> = {
  pending:  { color: 'var(--amber)',   bg: 'var(--amber-light)',   label: 'Pending' },
  granted:  { color: 'var(--success)', bg: 'var(--success-light)', label: 'Granted' },
  denied:   { color: 'var(--red)',     bg: 'var(--red-light)',     label: 'Denied' },
  expired:  { color: 'var(--ink3)',    bg: 'rgba(255,255,255,0.06)', label: 'Expired' },
  revoked:  { color: 'var(--ink3)',    bg: 'rgba(255,255,255,0.06)', label: 'Revoked' },
}

const DURATION_OPTIONS: { label: string; hours: number | null }[] = [
  { label: 'Always (permanent)', hours: null },
  { label: '1 hour',             hours: 1 },
  { label: '4 hours',            hours: 4 },
  { label: '1 day',              hours: 24 },
  { label: '3 days',             hours: 72 },
  { label: '7 days',             hours: 168 },
  { label: '30 days',            hours: 720 },
]

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}
function fmtRelative(ms: number): string {
  const abs = Math.abs(ms)
  const past = ms < 0
  const mins  = Math.round(abs / 60000)
  const hours = Math.round(abs / 3600000)
  const days  = Math.round(abs / 86400000)
  if (mins < 1) return past ? 'just now' : 'in <1 min'
  if (mins < 60) return past ? `${mins} min ago` : `in ${mins} min`
  if (hours < 24) return past ? `${hours}h ago`  : `in ${hours}h`
  return past ? `${days}d ago` : `in ${days}d`
}
function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('')
}

export default function AccessRequestsPage() {
  const [status,   setStatus]   = useState<Status>('pending')
  const [requests, setRequests] = useState<Request[]>([])
  const [counts,   setCounts]   = useState<Counts>({ pending: 0, granted: 0, denied: 0, expired: 0, revoked: 0 })
  const [loading,  setLoading]  = useState(true)
  const [search,   setSearch]   = useState('')

  const [grantTarget, setGrantTarget] = useState<Request | null>(null)
  const [denyTarget,  setDenyTarget]  = useState<Request | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/admin/access-requests?status=${status}`, { cache: 'no-store' })
    if (res.ok) {
      const d = await res.json()
      setRequests(d.requests ?? [])
      setCounts(d.counts ?? counts)
    }
    setLoading(false)
  }, [status])

  useEffect(() => { load() }, [load])

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase()
    if (!s) return requests
    return requests.filter(r =>
      r.requester_name.toLowerCase().includes(s)
      || r.requester_email.toLowerCase().includes(s)
      || r.tool_label.toLowerCase().includes(s)
      || (r.from_path ?? '').toLowerCase().includes(s),
    )
  }, [requests, search])

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--surface)',
      fontFamily: 'var(--font-manrope), Manrope, sans-serif',
      color: DARK,
    }}>
      {/* Breadcrumb */}
      <div style={{
        background: 'var(--card)',
        borderBottom: '1px solid var(--border)',
        padding: '0 32px',
        height: '52px',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
      }}>
        <Link href="/admin" style={{ display: 'flex', alignItems: 'center', gap: '6px', color: MUTED, fontSize: '13px', fontWeight: 600, textDecoration: 'none' }}>
          <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>
          Admin
        </Link>
        <span style={{ color: 'var(--border)', fontSize: '13px' }}>/</span>
        <span style={{ fontSize: '13px', fontWeight: 800, color: DARK }}>Access Requests</span>
      </div>

      {/* Header */}
      <div style={{ padding: '28px 40px 20px', background: 'var(--card)', borderBottom: '1px solid var(--border-light)' }}>
        <div style={{ fontSize: '24px', fontWeight: 900, letterSpacing: '-0.3px', marginBottom: '6px' }}>
          Access Requests
        </div>
        <div style={{ fontSize: '14px', color: MUTED, lineHeight: 1.6, maxWidth: '720px' }}>
          Grant or deny tool access, permanent or time-boxed. Time-boxed grants auto-revoke when the window ends.
        </div>
      </div>

      {/* Tabs */}
      <div style={{
        background: 'var(--card)', borderBottom: '1px solid var(--border-light)',
        padding: '0 40px', display: 'flex', gap: '4px', overflowX: 'auto',
      }}>
        {(['pending','granted','denied','expired','revoked','all'] as Status[]).map(s => {
          const active = s === status
          const badge = s !== 'all' ? counts[s as keyof Counts] : (counts.pending + counts.granted + counts.denied + counts.expired + counts.revoked)
          return (
            <button key={s} onClick={() => setStatus(s)}
              style={{
                border: 'none', background: 'transparent',
                padding: '14px 16px',
                fontSize: '13px', fontWeight: active ? 800 : 600,
                color: active ? BRAND : MUTED,
                borderBottom: `2px solid ${active ? BRAND : 'transparent'}`,
                cursor: 'pointer', fontFamily: 'inherit',
                display: 'flex', alignItems: 'center', gap: '8px',
                textTransform: 'capitalize',
              }}>
              {s}
              <span style={{
                background: active ? `${BRAND}20` : 'var(--border-light)',
                color: active ? BRAND : MUTED,
                padding: '1px 8px',
                borderRadius: '10px',
                fontSize: '11px', fontWeight: 800,
              }}>{badge}</span>
            </button>
          )
        })}
      </div>

      {/* Search */}
      <div style={{ padding: '20px 40px 0' }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search name, email, tool, path…"
          style={{
            width: '100%', maxWidth: '440px',
            padding: '10px 14px',
            borderRadius: '10px', border: '1px solid var(--border)',
            fontSize: '13px', fontFamily: 'inherit', color: DARK,
            outline: 'none', background: 'var(--card)',
          }}
        />
      </div>

      {/* List */}
      <div style={{ padding: '20px 40px 40px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {loading ? (
          <Card><span style={{ fontSize: '13px', color: MUTED }}>Loading…</span></Card>
        ) : filtered.length === 0 ? (
          <Card><span style={{ fontSize: '13px', color: MUTED }}>No {status} requests.</span></Card>
        ) : filtered.map(r => (
          <RequestCard
            key={r.id} r={r}
            onGrant={() => setGrantTarget(r)}
            onDeny={() => setDenyTarget(r)}
            onRevoke={async () => {
              if (!confirm(`Revoke ${r.tool_label} access from ${r.requester_name}?`)) return
              await fetch(`/api/admin/access-requests/${r.id}/revoke`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
              await load()
            }}
          />
        ))}
      </div>

      {grantTarget && (
        <GrantModal
          request={grantTarget}
          onClose={() => setGrantTarget(null)}
          onDone={async () => { setGrantTarget(null); await load() }}
        />
      )}
      {denyTarget && (
        <DenyModal
          request={denyTarget}
          onClose={() => setDenyTarget(null)}
          onDone={async () => { setDenyTarget(null); await load() }}
        />
      )}
    </div>
  )
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      background: 'var(--card)', border: '1px solid var(--border)',
      borderRadius: '14px', padding: '20px 22px',
      boxShadow: '0 2px 12px rgba(0,0,0,0.03)',
    }}>{children}</div>
  )
}

function RequestCard({ r, onGrant, onDeny, onRevoke }: {
  r: Request
  onGrant: () => void
  onDeny: () => void
  onRevoke: () => void
}) {
  const style = STATUS_STYLES[r.status]
  return (
    <Card>
      <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
        {/* Avatar */}
        <div style={{
          width: '44px', height: '44px', borderRadius: '50%',
          background: `${BRAND}12`, color: BRAND,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '13px', fontWeight: 800, flexShrink: 0,
        }}>{initials(r.requester_name)}</div>

        {/* Body */}
        <div style={{ flex: 1, minWidth: '280px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '4px' }}>
            <span style={{ fontSize: '15px', fontWeight: 800, color: DARK }}>{r.requester_name}</span>
            <span style={{
              fontSize: '10px', fontWeight: 800, letterSpacing: '0.5px',
              color: style.color, background: style.bg,
              padding: '3px 10px', borderRadius: '10px',
            }}>{style.label}</span>
            {r.manual_grant && r.status === 'pending' && (
              <span style={{ fontSize: '10px', fontWeight: 800, color: 'var(--amber)', background: 'var(--amber-light)', padding: '3px 10px', borderRadius: '10px' }}>
                Manual escalation
              </span>
            )}
          </div>
          <div style={{ fontSize: '12px', color: MUTED, marginBottom: '10px' }}>
            {r.requester_email}
            {(r.requester_role || r.requester_dept) && (
              <> · {[r.requester_role, r.requester_dept].filter(Boolean).join(' · ')}</>
            )}
          </div>

          <div style={{ fontSize: '13px', color: DARK, marginBottom: '6px' }}>
            wanted to open <strong>{r.tool_label}</strong>{' '}
            <span style={{ color: MUTED, fontSize: '11px' }}>({r.tool_key})</span>
          </div>
          {r.from_path && (
            <div style={{
              fontSize: '12px', color: DARK, background: 'var(--card-hi)',
              padding: '6px 10px', borderRadius: '8px',
              fontFamily: 'ui-monospace, monospace', display: 'inline-block',
              marginBottom: '10px', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>{r.from_path}</div>
          )}

          <div style={{ fontSize: '11px', color: MUTED }}>
            Requested {fmtDate(r.requested_at)}
            {r.handled_at && (<> · handled {fmtDate(r.handled_at)}{r.handler_name ? ` by ${r.handler_name}` : ''}</>)}
          </div>

          {r.status === 'granted' && r.granted_until && r.expires_in_ms !== null && (
            <div style={{ marginTop: '8px', fontSize: '12px', fontWeight: 700, color: r.expires_in_ms > 0 ? 'var(--amber)' : 'var(--red)' }}>
              {r.expires_in_ms > 0 ? `Expires ${fmtRelative(r.expires_in_ms)} (${fmtDate(r.granted_until)})` : `Expired ${fmtRelative(r.expires_in_ms)}`}
            </div>
          )}
          {r.status === 'granted' && !r.granted_until && (
            <div style={{ marginTop: '8px', fontSize: '12px', fontWeight: 700, color: 'var(--success)' }}>
              Permanent grant
            </div>
          )}
          {r.note && (
            <div style={{ marginTop: '8px', fontSize: '12px', color: MUTED, fontStyle: 'italic' }}>
              Note: {r.note}
            </div>
          )}
        </div>

        {/* Actions */}
        {r.status === 'pending' && (
          <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
            <button onClick={onGrant}
              style={{ background: BRAND, color: 'var(--teal-light)', border: 'none', borderRadius: '10px', padding: '9px 18px', fontSize: '12px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
              Grant
            </button>
            <button onClick={onDeny}
              style={{ background: 'transparent', color: 'var(--red)', border: '1px solid var(--red-border)', borderRadius: '10px', padding: '9px 16px', fontSize: '12px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
              Deny
            </button>
          </div>
        )}
        {r.status === 'granted' && (
          <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
            <button onClick={onRevoke}
              style={{ background: 'transparent', color: 'var(--red)', border: '1px solid var(--red-border)', borderRadius: '10px', padding: '9px 16px', fontSize: '12px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
              Revoke now
            </button>
          </div>
        )}
      </div>
    </Card>
  )
}

/* ────────── Grant modal ────────── */

function GrantModal({ request, onClose, onDone }: {
  request: Request
  onClose: () => void
  onDone: () => Promise<void>
}) {
  const [durationHours, setDurationHours] = useState<number | null>(null)   // null = always
  const [customHours,   setCustomHours]   = useState<string>('')
  const [note,          setNote]          = useState('')
  const [saving,        setSaving]        = useState(false)
  const [err,           setErr]           = useState<string | null>(null)
  const [selectedIdx,   setSelectedIdx]   = useState(0)   // 0 = Always
  const [customMode,    setCustomMode]    = useState(false)

  async function submit() {
    setSaving(true)
    setErr(null)
    try {
      let hours: number | null = durationHours
      if (customMode) {
        const n = Number(customHours)
        if (!Number.isFinite(n) || n <= 0) throw new Error('Custom hours must be a positive number')
        hours = n
      }
      const res = await fetch(`/api/admin/access-requests/${request.id}/grant`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ duration_hours: hours, note: note.trim() || null, force_manual: request.manual_grant }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d?.error ?? 'Grant failed')
      }
      await onDone()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalShell onClose={saving ? () => {} : onClose}>
      <div style={{ fontSize: '11px', fontWeight: 800, color: BRAND, letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '6px' }}>Grant access</div>
      <div style={{ fontSize: '20px', fontWeight: 900, color: DARK, marginBottom: '4px', letterSpacing: '-0.3px' }}>
        {request.requester_name} → {request.tool_label}
      </div>
      <div style={{ fontSize: '13px', color: MUTED, marginBottom: '20px' }}>
        {request.requester_email}
      </div>

      {request.manual_grant && (
        <div style={{ background: 'var(--amber-light)', border: '1px solid var(--amber-border)', color: 'var(--amber)', padding: '10px 14px', borderRadius: '10px', fontSize: '12px', fontWeight: 700, marginBottom: '18px' }}>
          Manual escalation — this tool ({request.tool_key}) requires a super-admin decision. Granting here confirms the escalation but doesn&apos;t auto-apply the role; adjust in the admin panel afterwards.
        </div>
      )}

      <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, marginBottom: '8px' }}>How long?</label>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '8px', marginBottom: '10px' }}>
        {DURATION_OPTIONS.map((opt, i) => {
          const active = !customMode && i === selectedIdx
          return (
            <button key={i}
              onClick={() => { setSelectedIdx(i); setDurationHours(opt.hours); setCustomMode(false) }}
              style={{
                border: active ? `2px solid ${BRAND}` : '1px solid var(--border)',
                background: active ? `${BRAND}0a` : 'var(--card)',
                color: active ? BRAND : DARK,
                padding: '10px 12px', borderRadius: '10px',
                fontSize: '12px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
              }}>
              {opt.label}
            </button>
          )
        })}
        <button onClick={() => setCustomMode(true)}
          style={{
            border: customMode ? `2px solid ${BRAND}` : '1px solid var(--border)',
            background: customMode ? `${BRAND}0a` : 'var(--card)',
            color: customMode ? BRAND : DARK,
            padding: '10px 12px', borderRadius: '10px',
            fontSize: '12px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
          }}>
          Custom…
        </button>
      </div>
      {customMode && (
        <div style={{ marginBottom: '14px' }}>
          <input type="number" placeholder="Hours (e.g. 12)"
            value={customHours} onChange={e => setCustomHours(e.target.value)}
            style={{
              width: '100%', padding: '10px 14px', borderRadius: '10px',
              border: '1px solid var(--border)', fontSize: '13px', fontFamily: 'inherit', outline: 'none',
            }} />
        </div>
      )}

      <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, margin: '10px 0 6px' }}>Reason / task context (optional)</label>
      <textarea value={note} onChange={e => setNote(e.target.value)}
        placeholder="e.g. Q3 payroll review — needs Finance Portal until Friday"
        style={{
          width: '100%', padding: '10px 14px', borderRadius: '10px',
          border: '1px solid var(--border)', fontSize: '13px', fontFamily: 'inherit',
          minHeight: '68px', resize: 'vertical', outline: 'none', boxSizing: 'border-box',
        }} />

      {err && (
        <div style={{ marginTop: '12px', padding: '10px 14px', borderRadius: '10px', background: 'var(--red-light)', border: '1px solid var(--red-border)', color: 'var(--red)', fontSize: '12px', fontWeight: 700 }}>
          {err}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '22px' }}>
        <button onClick={saving ? undefined : onClose}
          style={{ background: 'transparent', border: '1px solid var(--border)', color: DARK, borderRadius: '10px', padding: '10px 20px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
          Cancel
        </button>
        <button onClick={submit} disabled={saving}
          style={{ background: LIME, color: 'var(--lime-dark)', border: 'none', borderRadius: '10px', padding: '10px 22px', fontSize: '13px', fontWeight: 800, cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.7 : 1, fontFamily: 'inherit' }}>
          {saving ? 'Granting…' : 'Grant access'}
        </button>
      </div>
    </ModalShell>
  )
}

/* ────────── Deny modal ────────── */

function DenyModal({ request, onClose, onDone }: {
  request: Request
  onClose: () => void
  onDone: () => Promise<void>
}) {
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function submit() {
    setSaving(true)
    setErr(null)
    try {
      const res = await fetch(`/api/admin/access-requests/${request.id}/deny`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ note: note.trim() || null }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d?.error ?? 'Deny failed')
      }
      await onDone()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalShell onClose={saving ? () => {} : onClose}>
      <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--red)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '6px' }}>Deny access</div>
      <div style={{ fontSize: '20px', fontWeight: 900, color: DARK, marginBottom: '4px', letterSpacing: '-0.3px' }}>
        {request.requester_name} → {request.tool_label}
      </div>
      <div style={{ fontSize: '13px', color: MUTED, marginBottom: '20px' }}>
        {request.requester_email}
      </div>

      <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, marginBottom: '6px' }}>Reason (optional)</label>
      <textarea value={note} onChange={e => setNote(e.target.value)}
        placeholder="e.g. Not their department — talk to your manager"
        style={{
          width: '100%', padding: '10px 14px', borderRadius: '10px',
          border: '1px solid var(--border)', fontSize: '13px', fontFamily: 'inherit',
          minHeight: '68px', resize: 'vertical', outline: 'none', boxSizing: 'border-box',
        }} />

      {err && (
        <div style={{ marginTop: '12px', padding: '10px 14px', borderRadius: '10px', background: 'var(--red-light)', border: '1px solid var(--red-border)', color: 'var(--red)', fontSize: '12px', fontWeight: 700 }}>
          {err}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '22px' }}>
        <button onClick={saving ? undefined : onClose}
          style={{ background: 'transparent', border: '1px solid var(--border)', color: DARK, borderRadius: '10px', padding: '10px 20px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
          Cancel
        </button>
        <button onClick={submit} disabled={saving}
          style={{ background: 'var(--red)', color: 'var(--red-light)', border: 'none', borderRadius: '10px', padding: '10px 22px', fontSize: '13px', fontWeight: 800, cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.7 : 1, fontFamily: 'inherit' }}>
          {saving ? 'Denying…' : 'Deny request'}
        </button>
      </div>
    </ModalShell>
  )
}

/* ────────── Shared modal shell ────────── */

function ModalShell({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0,
      background: 'rgba(15,25,35,0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '20px', zIndex: 1000,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--card)', borderRadius: '18px',
        padding: '28px 32px', width: '100%', maxWidth: '480px',
        boxShadow: '0 24px 64px rgba(0,0,0,0.2)',
      }}>
        {children}
      </div>
    </div>
  )
}
