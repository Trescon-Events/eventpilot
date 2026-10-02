'use client'

import { useState, useEffect, use } from 'react'
import PageHeader from '@/app/components/PageHeader'
import Link from 'next/link'
import EventDaysCard from '@/app/admin/operations-shared/EventDaysCard'
import { Button, Card } from '@/app/components/ui'

/* Umbrella Event Details (2026-10-02, split out of the old single Overview page): Common Details (now with status and
   cycle dates), Content Approval, the Event Days card and each child event's dates. An umbrella is the top of the
   hierarchy — no "inherit" option for content approval. Platform-admin only. */

const fmt = (iso: string | null) => (iso ? new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : null)
const fmtRange = (a: string | null, b: string | null) => (a && b && a !== b ? `${fmt(a)} – ${fmt(b)}` : fmt(a) ?? 'Dates not set')

type UmbrellaRow = {
  id: string; name: string; client_name: string | null; status: string
  event_date: string | null; end_date: string | null; description: string | null
  type: string | null; requires_client_approval: boolean | null
  children: Array<{ id: string; name: string; type: string | null; status: string; client_name: string | null; event_date: string | null; end_date: string | null }>
}

export default function UmbrellaDetails({ params }: { params: Promise<{ id: string }> }) {
  const { id: umbrellaId } = use(params)
  const [umbrella, setUmbrella] = useState<UmbrellaRow | null>(null)
  const [editForm, setEditForm] = useState({ name: '', client_name: '', status: 'planning', event_date: '', end_date: '', description: '' })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [msgIsError, setMsgIsError] = useState(false)

  // This page is platform-admin only (see details/page.tsx), so every field is editable.
  const canManage = true

  async function loadAll() {
    const umbrellaRes = await fetch(`/api/events/umbrellas?id=${umbrellaId}`).then(r => r.json()).catch(() => null)
    setUmbrella(umbrellaRes?.id ? umbrellaRes : null)
    if (umbrellaRes) {
      setEditForm({
        name: umbrellaRes.name ?? '', client_name: umbrellaRes.client_name ?? '', status: umbrellaRes.status ?? 'planning',
        event_date: umbrellaRes.event_date ?? '', end_date: umbrellaRes.end_date ?? '', description: umbrellaRes.description ?? '',
      })
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-mount, matches the event details page's own pattern
    setLoading(true)
    loadAll().finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadAll is stable for this effect's purpose (mount + umbrellaId change only)
  }, [umbrellaId])

  async function saveDetails() {
    setSaving(true); setMsg(null)
    const res = await fetch(`/api/events/umbrellas?id=${umbrellaId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(editForm),
    })
    const data = await res.json().catch(() => ({}))
    setSaving(false)
    if (res.ok) { setMsg('Saved.'); setMsgIsError(false); await loadAll() }
    else { setMsg(data.error ?? 'Save failed.'); setMsgIsError(true) }
  }

  async function saveRequiresClientApproval(value: boolean) {
    setSaving(true); setMsg(null)
    const res = await fetch(`/api/events/umbrellas?id=${umbrellaId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requires_client_approval: value }),
    })
    setSaving(false)
    if (res.ok) { setMsg('Saved.'); setMsgIsError(false); await loadAll() } else { setMsg('Save failed.'); setMsgIsError(true) }
  }

  if (loading) return <div style={{ padding: '40px', textAlign: 'center', color: 'var(--ink3)' }}>Loading…</div>
  if (!umbrella) return <div style={{ padding: '40px', textAlign: 'center', color: 'var(--red)' }}>Umbrella event not found.</div>

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '24px 32px' }}>
      <PageHeader eyebrow="Umbrella Event" title="Event Details" description={`Basic details, dates and content approval for ${umbrella.name}, and the dates of the events under it.`} backHref={`/admin/umbrellas/${umbrellaId}`} backLabel="Overview" />

      {msg && <div style={{ marginBottom: '12px', fontSize: '13px', color: msgIsError ? 'var(--red)' : 'var(--success)' }}>{msg}</div>}

      <Card padded>
        <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '0.6px', textTransform: 'uppercase', color: 'var(--teal-mid)', marginBottom: '14px' }}>Common Details</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div>
            <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink3)', display: 'block', marginBottom: '4px' }}>Name</label>
            <input disabled={!canManage} value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
              style={{ width: '100%', fontSize: '13px', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--ink)', fontFamily: 'inherit', boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink3)', display: 'block', marginBottom: '4px' }}>Client</label>
            <input disabled={!canManage} value={editForm.client_name} onChange={e => setEditForm(f => ({ ...f, client_name: e.target.value }))}
              style={{ width: '100%', fontSize: '13px', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--ink)', fontFamily: 'inherit', boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink3)', display: 'block', marginBottom: '4px' }}>Status</label>
            <select disabled={!canManage} value={editForm.status} onChange={e => setEditForm(f => ({ ...f, status: e.target.value }))}
              style={{ width: '100%', fontSize: '13px', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--ink)', fontFamily: 'inherit', boxSizing: 'border-box' }}>
              {['planning', 'upcoming', 'active', 'completed', 'cancelled'].map(s => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
            </select>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            {([['event_date', 'Cycle start'], ['end_date', 'Cycle end']] as const).map(([key, label]) => (
              <div key={key}>
                <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink3)', display: 'block', marginBottom: '4px' }}>{label}</label>
                <input type="date" disabled={!canManage} value={editForm[key]} onChange={e => setEditForm(f => ({ ...f, [key]: e.target.value }))}
                  style={{ width: '100%', fontSize: '13px', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--ink)', fontFamily: 'inherit', boxSizing: 'border-box' }} />
              </div>
            ))}
          </div>
          <div style={{ gridColumn: '1/-1' }}>
            <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink3)', display: 'block', marginBottom: '4px' }}>Description / Notes</label>
            <textarea disabled={!canManage} value={editForm.description} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} rows={3}
              style={{ width: '100%', fontSize: '13px', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--ink)', fontFamily: 'inherit', boxSizing: 'border-box', resize: 'vertical' }} />
          </div>
        </div>
        {canManage && (
          <div style={{ marginTop: '14px' }}>
            <Button variant="lime" onClick={saveDetails} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
          </div>
        )}
      </Card>

      <Card padded>
        <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '0.6px', textTransform: 'uppercase', color: 'var(--teal-mid)', marginBottom: '4px' }}>Content Approval</div>
        <div style={{ fontSize: '12px', color: 'var(--ink3)', marginBottom: '14px' }}>
          When on, this becomes the default for every child event that doesn&apos;t explicitly override it — client sign-off is required before internal approval or publish.
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {([['on', 'Require', true], ['off', "Don't require", false]] as const).map(([key, label, value]) => {
            const selected = !!umbrella.requires_client_approval === value && (umbrella.requires_client_approval !== null)
            return (
              <button key={key} disabled={!canManage || saving} onClick={() => saveRequiresClientApproval(value)}
                style={{ padding: '8px 14px', borderRadius: '8px', fontSize: '12.5px', fontWeight: 700, cursor: canManage ? 'pointer' : 'default', fontFamily: 'inherit', border: selected ? '1.5px solid var(--teal-mid)' : '1px solid var(--border)', background: selected ? 'var(--teal-light)' : 'var(--card)', color: selected ? 'var(--teal-mid)' : 'var(--ink2)' }}>
                {label}
              </button>
            )
          })}
        </div>
      </Card>

      <EventDaysCard kind="umbrella" id={umbrella.id} canEdit />

      {umbrella.children.length > 0 && (
        <Card padded>
          <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '0.6px', textTransform: 'uppercase', color: 'var(--teal-mid)', marginBottom: '10px' }}>Events in this umbrella ({umbrella.children.length})</div>
          <div style={{ display: 'grid', gap: '2px' }}>
            {umbrella.children.map(c => (
              <Link key={c.id} href={`/admin/events/${c.id}`} style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', textDecoration: 'none', padding: '9px 0', borderBottom: '1px solid var(--border-light)' }}>
                <span style={{ flex: '1 1 220px', fontSize: '13.5px', fontWeight: 700, color: 'var(--teal-mid)' }}>{c.name}</span>
                <span style={{ fontSize: '13px', color: 'var(--ink2)', minWidth: '170px' }}>{fmtRange(c.event_date, c.end_date)}</span>
                <span style={{ fontSize: '12px', color: 'var(--ink3)', textTransform: 'capitalize' }}>{c.status}</span>
              </Link>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}
