'use client'

import { use, useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import PageHeader from '@/app/components/PageHeader'
import { Badge, Button, Input, Select } from '@/app/components/ui'
import Toast from '@/app/components/ui/Toast'
import { permissionSetSatisfies } from '@/app/lib/access/permission-match'
import { useBreadcrumbLabel } from '@/app/lib/nav/breadcrumb-labels'

/* Speaker Badges (2026-10-02) — batches of PVC speaker badges for an event. This page lists them and creates new ones
   from the event's confirmed speakers; the review/approve/print work happens on /badges/[batchId]. */

type BatchRow = { id: string; name: string; status: 'draft' | 'review' | 'approved'; template_name: string; badges: number; approved: number; flagged: number; pdf_count: number; created_at: string }
type Has = { name: boolean; title: boolean; company: boolean; country: boolean; photo: boolean }
type Candidate = { id: string; name: string; title: string | null; company: string | null; country: string | null; has: Has; confirmation_status: string | null; blocked: boolean; pending: Array<'title' | 'company' | 'country'>; badge_status: 'created' | 'sent' | 'printed' | null }
type TemplateOption = { id: string; name: string; print: { width_mm: number; height_mm: number; bleed_mm: number } }

const STATUS_COLOR = { draft: 'grey', review: 'amber', approved: 'teal' } as const
const STATUS_LABEL = { draft: 'Draft', review: 'In review', approved: 'Approved' } as const

export default function BadgesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = use(params)
  const router = useRouter()
  const [eventName, setEventName] = useState<string | null>(null)
  const [permissions, setPermissions] = useState<Set<string>>(new Set())
  const [batches, setBatches] = useState<BatchRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  useBreadcrumbLabel(eventId, eventName)
  const can = (key: string) => permissionSetSatisfies(permissions, key)

  const load = useCallback(async () => {
    const [res, permRes, eventRes] = await Promise.all([
      fetch(`/api/events/badges/batches?event_id=${eventId}`),
      fetch(`/api/events/access/me?event_id=${eventId}`),
      fetch(`/api/events?id=${eventId}`),
    ])
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { setError(data.error ?? 'Could not load badge batches.'); setBatches([]); return }
    setBatches(data.batches ?? [])
    const perm = await permRes.json().catch(() => ({ permissions: [] }))
    setPermissions(new Set(perm.permissions ?? []))
    setEventName((await eventRes.json().catch(() => null))?.name ?? null)
  }, [eventId])
  // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load
  useEffect(() => { void load() }, [load])

  return (
    <div>
      <PageHeader
        eyebrow="Stakeholder Hub" title="Speaker badges"
        description="Create a batch from your confirmed speakers, review every badge, approve, then download one print file for the vendor."
        backHref={`/admin/events/${eventId}/stakeholders`} backLabel="Stakeholders"
        actions={can('sae.badges.manage') ? <Button variant="lime" onClick={() => setCreating(true)}>+ New batch</Button> : undefined}
      />
      <div style={{ padding: '24px 32px' }}>
        {error && <div style={{ color: 'var(--red)', fontSize: '14px', marginBottom: '12px' }}>{error}</div>}
        {batches === null ? (
          <div style={{ color: 'var(--ink3)', fontSize: '14px' }}>Loading…</div>
        ) : batches.length === 0 && !error ? (
          <div style={{ color: 'var(--ink3)', fontSize: '14px', padding: '40px 0', textAlign: 'center' }}>
            No badge batches yet.{can('sae.badges.manage') ? ' Click “New batch” to create one from your confirmed speakers.' : ''}
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '10px' }}>
            {batches.map(b => (
              <Link key={b.id} href={`/admin/events/${eventId}/stakeholders/badges/${b.id}`} style={{ textDecoration: 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap', padding: '14px 18px', border: '1px solid var(--border-light)', borderRadius: '10px', background: 'var(--card)' }}>
                  <div style={{ flex: '1 1 240px', minWidth: 0 }}>
                    <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--ink)' }}>{b.name}</div>
                    <div style={{ fontSize: '13px', color: 'var(--ink3)' }}>{b.template_name} · created {new Date(b.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
                  </div>
                  <div style={{ fontSize: '14px', color: 'var(--ink2)' }}>{b.badges} badge{b.badges === 1 ? '' : 's'}</div>
                  <div style={{ fontSize: '14px', color: 'var(--ink2)' }}>{b.approved}/{b.badges} approved</div>
                  {b.flagged > 0 && <div style={{ fontSize: '14px', color: 'var(--amber)', fontWeight: 700 }}>{b.flagged} flagged</div>}
                  {b.pdf_count > 0 && <div style={{ fontSize: '13px', color: 'var(--ink3)' }}>{b.pdf_count} print file{b.pdf_count === 1 ? '' : 's'}</div>}
                  <Badge color={STATUS_COLOR[b.status]}>{STATUS_LABEL[b.status]}</Badge>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
      {creating && (
        <NewBatchModal eventId={eventId} onClose={() => setCreating(false)}
          onCreated={id => router.push(`/admin/events/${eventId}/stakeholders/badges/${id}?render=1`)}
          onError={message => setToast({ message, type: 'error' })} />
      )}
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  )
}

const BADGE_LABEL = { created: 'Created', sent: 'Sent to Printer', printed: 'Printed' } as const
const BADGE_COLOR = { created: 'grey', sent: 'purple', printed: 'teal' } as const
type Filter = 'all' | 'confirmed' | 'pending' | 'no_badge'

function NewBatchModal({ eventId, onClose, onCreated, onError }: { eventId: string; onClose: () => void; onCreated: (id: string) => void; onError: (m: string) => void }) {
  const [loading, setLoading] = useState(true)
  const [templates, setTemplates] = useState<TemplateOption[]>([])
  const [speakers, setSpeakers] = useState<Candidate[]>([])
  const [confirmed, setConfirmed] = useState<string[]>([])
  const [variantId, setVariantId] = useState('')
  const [name, setName] = useState('')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const res = await fetch(`/api/events/badges/batches?event_id=${eventId}&candidates=1`)
      const data = await res.json().catch(() => ({}))
      if (cancelled) return
      if (!res.ok) { onError(data.error ?? 'Could not load speakers.'); onClose(); return }
      setTemplates(data.variants ?? []); setSpeakers(data.speakers ?? []); setConfirmed(data.confirmed_statuses ?? [])
      setVariantId(data.variants?.[0]?.id ?? '')
      setLoading(false)
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once when the modal opens
  }, [])

  const isConfirmed = (s: Candidate) => confirmed.includes(s.confirmation_status ?? '')
  const shown = useMemo(() => speakers.filter(s => {
    if (search.trim() && !`${s.name} ${s.company ?? ''}`.toLowerCase().includes(search.trim().toLowerCase())) return false
    if (filter === 'confirmed') return isConfirmed(s)
    if (filter === 'pending') return s.pending.length > 0 || s.blocked
    if (filter === 'no_badge') return !s.badge_status
    return true
    // eslint-disable-next-line react-hooks/exhaustive-deps -- isConfirmed closes over `confirmed`
  }), [speakers, search, filter, confirmed])
  const toggle = (id: string) => setPicked(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const selectable = (list: Candidate[]) => list.filter(s => !s.blocked).map(s => s.id)
  const pickedWithGaps = speakers.filter(s => picked.has(s.id) && s.pending.length > 0).length
  const pickedAlready = speakers.filter(s => picked.has(s.id) && s.badge_status).length

  async function create() {
    setSaving(true)
    const res = await fetch('/api/events/badges/batches', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_id: eventId, variant_id: variantId, name, speaker_ids: speakers.filter(s => picked.has(s.id)).map(s => s.id) }),
    })
    const data = await res.json().catch(() => ({}))
    setSaving(false)
    if (!res.ok) { onError(data.error ?? 'Could not create the batch.'); return }
    onCreated(data.id)
  }

  const th: React.CSSProperties = { textAlign: 'left', padding: '10px 12px', fontSize: '12px', fontWeight: 800, letterSpacing: '0.04em', color: 'var(--ink3)', textTransform: 'uppercase', position: 'sticky', top: 0, background: 'var(--card)', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap', zIndex: 1 }
  const td: React.CSSProperties = { padding: '9px 12px', fontSize: '14px', color: 'var(--ink)', borderBottom: '1px solid var(--border-light)', verticalAlign: 'middle' }
  const gap = (ok: boolean) => ok ? <span style={{ color: 'var(--teal)', fontWeight: 700 }}>✓</span> : <span style={{ color: 'var(--amber)', fontWeight: 800, fontSize: '12.5px' }}>Missing</span>
  const chip = (k: Filter, label: string) => (
    <button key={k} onClick={() => setFilter(k)} style={{ padding: '6px 14px', borderRadius: '20px', border: '1.5px solid var(--border)', background: filter === k ? 'var(--ink)' : 'transparent', color: filter === k ? 'var(--card)' : 'var(--ink2)', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>{label}</button>
  )

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--card)', zIndex: 60, display: 'flex', flexDirection: 'column' }}>
      {/* header */}
      <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
        <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--ink)' }}>New badge batch</div>
        <div style={{ flex: 1 }} />
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
      </div>
      {loading ? <div style={{ padding: '30px 24px', color: 'var(--ink3)' }}>Loading speakers…</div> : templates.length === 0 ? (
        <div style={{ padding: '30px 24px', color: 'var(--ink2)', fontSize: '14px', lineHeight: 1.5 }}>This event has no Speaker Badge template yet. Create one in Creative Templates (New Variant, Speaker Badge) first.</div>
      ) : (<>
        <div style={{ padding: '14px 24px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px', borderBottom: '1px solid var(--border-light)' }}>
          <label style={{ fontSize: '13px', color: 'var(--ink3)' }}>Batch name
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Speakers — first print run" style={{ marginTop: '4px' }} />
          </label>
          <label style={{ fontSize: '13px', color: 'var(--ink3)' }}>Template
            <Select value={variantId} onChange={e => setVariantId(e.target.value)} style={{ marginTop: '4px', width: '100%' }}>
              {templates.map(t => <option key={t.id} value={t.id}>{t.name} ({t.print.width_mm}×{t.print.height_mm} mm)</option>)}
            </Select>
          </label>
        </div>
        <div style={{ padding: '12px 24px', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', borderBottom: '1px solid var(--border-light)' }}>
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search speakers…" style={{ flex: '1 1 220px', maxWidth: '320px' }} />
          {chip('all', 'All')}{chip('confirmed', 'Confirmed')}{chip('pending', 'Has pending items')}{chip('no_badge', 'No badge yet')}
          <div style={{ flex: 1 }} />
          <Button variant="ghost" onClick={() => setPicked(new Set(selectable(speakers.filter(isConfirmed))))}>Select confirmed</Button>
          <Button variant="ghost" onClick={() => setPicked(prev => new Set([...prev, ...selectable(shown)]))}>Select shown</Button>
          <Button variant="ghost" onClick={() => setPicked(new Set())}>None</Button>
        </div>
        {/* table */}
        <div style={{ flex: 1, overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '980px' }}>
            <thead>
              <tr>
                <th style={{ ...th, width: '44px' }} />
                <th style={th}>Speaker</th>
                <th style={th}>Status</th>
                <th style={{ ...th, textAlign: 'center' }} colSpan={4}>Details on the badge</th>
                <th style={th}>Badge</th>
              </tr>
              <tr>
                <th style={{ ...th, top: '37px' }} /><th style={{ ...th, top: '37px' }} /><th style={{ ...th, top: '37px' }} />
                {['Photo', 'Job title', 'Company', 'Country'].map(h => <th key={h} style={{ ...th, top: '37px', textAlign: 'center', fontSize: '11px' }}>{h}</th>)}
                <th style={{ ...th, top: '37px' }} />
              </tr>
            </thead>
            <tbody>
              {shown.map(s => (
                <tr key={s.id} style={{ background: picked.has(s.id) ? 'color-mix(in srgb, var(--teal) 8%, transparent)' : 'transparent', opacity: s.blocked ? 0.6 : 1 }}>
                  <td style={td}>
                    <input type="checkbox" checked={picked.has(s.id)} disabled={s.blocked} onChange={() => toggle(s.id)}
                      title={s.blocked ? `Can't make a badge: ${[!s.has.name && 'no name', !s.has.photo && 'no cleaned photo'].filter(Boolean).join(' and ')}` : ''}
                      style={{ width: '17px', height: '17px', cursor: s.blocked ? 'not-allowed' : 'pointer' }} />
                  </td>
                  <td style={td}>
                    <div style={{ fontWeight: 700 }}>{s.name || <span style={{ color: 'var(--red)' }}>(no name)</span>}</div>
                    <div style={{ fontSize: '12.5px', color: 'var(--ink3)' }}>{[s.title, s.company].filter(Boolean).join(' · ') || '—'}</div>
                  </td>
                  <td style={{ ...td, color: isConfirmed(s) ? 'var(--teal)' : 'var(--ink3)', whiteSpace: 'nowrap' }}>{s.confirmation_status ?? 'No status'}</td>
                  <td style={{ ...td, textAlign: 'center' }}>{s.has.photo ? gap(true) : <span style={{ color: 'var(--red)', fontWeight: 800, fontSize: '12.5px' }}>No photo</span>}</td>
                  <td style={{ ...td, textAlign: 'center' }}>{gap(s.has.title)}</td>
                  <td style={{ ...td, textAlign: 'center' }}>{gap(s.has.company)}</td>
                  <td style={{ ...td, textAlign: 'center' }}>{gap(s.has.country)}</td>
                  <td style={td}>{s.badge_status ? <Badge color={BADGE_COLOR[s.badge_status]}>{BADGE_LABEL[s.badge_status]}</Badge> : <span style={{ color: 'var(--ink4)' }}>—</span>}</td>
                </tr>
              ))}
              {shown.length === 0 && <tr><td colSpan={8} style={{ ...td, color: 'var(--ink3)', padding: '24px' }}>No speakers match.</td></tr>}
            </tbody>
          </table>
        </div>
        {/* footer */}
        <div style={{ padding: '14px 24px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
          <div style={{ fontSize: '14px', color: 'var(--ink2)' }}>
            <strong>{picked.size}</strong> selected
            {pickedWithGaps > 0 && <span style={{ color: 'var(--amber)' }}> · {pickedWithGaps} with missing details (flagged in review)</span>}
            {pickedAlready > 0 && <span style={{ color: 'var(--ink3)' }}> · {pickedAlready} already in a batch</span>}
            <div style={{ fontSize: '12.5px', color: 'var(--ink3)', marginTop: '2px' }}>A name and a cleaned photo are required; speakers without them can&apos;t be selected.</div>
          </div>
          <div style={{ flex: 1 }} />
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="lime" disabled={saving || !name.trim() || picked.size === 0 || !variantId} onClick={() => void create()}>{saving ? 'Creating…' : `Create batch (${picked.size})`}</Button>
        </div>
      </>)}
    </div>
  )
}
