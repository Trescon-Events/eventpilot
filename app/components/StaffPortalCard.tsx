'use client'

import { useState } from 'react'
import { Button } from '@/app/components/ui'

/* Staff Portal fields (2026-11-11). Shows what the Staff Portal owns for an event or an umbrella, read-only, with the "Refresh from Staff Portal" button.
   A locked field shows a small bubble on hover or focus saying where to change it. Used by the event Details page and the umbrella page. */

export const LOCK_TEXT = 'This field cannot be edited here. Update it in the Staff Portal.'

/** Wraps any control that is owned by the Staff Portal: hovering or focusing it shows the bubble. The wrapper catches the hover even when the control inside is disabled. */
export function PortalLocked({ children, text = LOCK_TEXT }: { children: React.ReactNode; text?: string }) {
  const [show, setShow] = useState(false)
  return (
    <span style={{ position: 'relative', display: 'block' }} onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)} onFocus={() => setShow(true)} onBlur={() => setShow(false)}>
      {children}
      {show && (
        <span role="tooltip" style={{ position: 'absolute', left: '8px', top: '100%', marginTop: '4px', zIndex: 30, maxWidth: '260px', padding: '6px 10px', borderRadius: '8px', background: 'var(--ink)', color: 'var(--card)', fontSize: '12px', lineHeight: 1.4, fontWeight: 600, pointerEvents: 'none' }}>
          {text}
        </span>
      )}
    </span>
  )
}

export type PortalRow = { label: string; value: string | null; hint?: string }

const dateText = (d: string | null | undefined) => (d ? new Date(d.slice(0, 10) + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : null)
export const fmtPortalDate = dateText
export const prettyWord = (v: string | null | undefined) => (v ? v.replace(/[_-]+/g, ' ').replace(/^\w/, c => c.toUpperCase()) : null)

type Change = { field: string; from: string | null; to: string | null }
type RefreshResult = { refreshed_at?: string; changes: Change[]; notes: string[] }

export default function StaffPortalCard({
  title = 'From the Staff Portal', rows, refreshedAt, refreshUrl, refreshBody, canRefresh = true, linked = true, unlinkedNoun = 'event', onRefreshed,
}: {
  title?: string; rows: PortalRow[]; refreshedAt?: string | null
  refreshUrl?: string; refreshBody?: Record<string, unknown>; canRefresh?: boolean; linked?: boolean; unlinkedNoun?: string; onRefreshed: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<RefreshResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function refresh() {
    if (!refreshUrl) return
    setBusy(true); setError(null); setResult(null)
    const res = await fetch(refreshUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(refreshBody ?? {}) })
    const data = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) { setError(data.error ?? 'Could not refresh from the Staff Portal.'); return }
    setResult({ refreshed_at: data.refreshed_at, changes: data.changes ?? [], notes: data.notes ?? [] })
    onRefreshed()
  }

  // Not linked to a Staff Portal project: nothing here is owned by the Staff Portal, so no locked fields and no refresh. A short note says where the details are managed.
  if (!linked) {
    return (
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px', padding: '14px 20px', marginBottom: '16px' }}>
        <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '0.6px', textTransform: 'uppercase', color: 'var(--teal-mid)' }}>{title}</div>
        <div style={{ fontSize: '12.5px', color: 'var(--ink3)', marginTop: '4px', lineHeight: 1.6 }}>
          This {unlinkedNoun} is not linked to a Staff Portal project, so its name, client, status, type and dates are managed here in EventPilot. The event days are set in the Event Days section below.
        </div>
      </div>
    )
  }

  const stamp = (refreshedAt ?? result?.refreshed_at) ? new Date((refreshedAt ?? result?.refreshed_at)!).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : null

  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px', padding: '18px 20px', marginBottom: '16px' }}>
      <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 300px' }}>
          <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '0.6px', textTransform: 'uppercase', color: 'var(--teal-mid)' }}>{title}</div>
          <div style={{ fontSize: '12px', color: 'var(--ink3)', marginTop: '4px', lineHeight: 1.6 }}>
            These details are managed in the Staff Portal and cannot be edited here. Changed something there? Refresh to bring it in.
          </div>
        </div>
        {refreshUrl && canRefresh && (
          <div style={{ textAlign: 'right' }}>
            <Button variant="teal" onClick={refresh} disabled={busy}>{busy ? 'Refreshing…' : 'Refresh from Staff Portal'}</Button>
            <div style={{ fontSize: '11.5px', color: 'var(--ink3)', marginTop: '4px' }}>{stamp ? `Last refreshed ${stamp}` : 'Not refreshed from here yet'}</div>
          </div>
        )}
      </div>

      {error && <div role="alert" style={{ marginTop: '12px', padding: '10px 12px', borderRadius: '10px', background: 'var(--amber-light)', border: '1px solid var(--amber)', fontSize: '13px', color: 'var(--ink)' }}>{error}</div>}
      {result && (
        <div style={{ marginTop: '12px', padding: '10px 12px', borderRadius: '10px', background: 'var(--surface)', border: '1px solid var(--border-light)', fontSize: '13px', color: 'var(--ink)', lineHeight: 1.6 }}>
          {result.changes.length === 0 ? 'Already up to date. Nothing changed.' : (
            <>
              <strong>Refreshed. {result.changes.length} field{result.changes.length === 1 ? '' : 's'} changed:</strong>
              <ul style={{ margin: '4px 0 0', paddingLeft: '18px' }}>
                {result.changes.map((c, i) => <li key={i}>{c.field}: {c.from ?? 'blank'} → {c.to ?? 'blank'}</li>)}
              </ul>
            </>
          )}
          {result.notes.map((n, i) => <div key={i} style={{ marginTop: '6px', color: 'var(--amber)', fontWeight: 600 }}>{n}</div>)}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: '12px', marginTop: '14px' }}>
        {rows.map(r => (
          <div key={r.label}>
            <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink3)', display: 'block', marginBottom: '4px' }}>{r.label}</label>
            <PortalLocked text={r.hint ?? LOCK_TEXT}>
              <div tabIndex={0} aria-readonly="true" style={{ padding: '9px 12px', borderRadius: '10px', background: 'var(--surface)', border: '1px solid var(--border-light)', fontSize: '13.5px', color: r.value ? 'var(--ink)' : 'var(--ink3)', cursor: 'not-allowed', minHeight: '38px', overflowWrap: 'anywhere' }}>
                {r.value ?? 'Not set'}
              </div>
            </PortalLocked>
          </div>
        ))}
      </div>
    </div>
  )
}
