'use client'

import { use, useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import PageHeader from '@/app/components/PageHeader'
import { Badge, Button, Input } from '@/app/components/ui'
import Toast from '@/app/components/ui/Toast'
import { permissionSetSatisfies } from '@/app/lib/access/permission-match'
import { useBreadcrumbLabel } from '@/app/lib/nav/breadcrumb-labels'
import { MEMENTO_STATE_COLOR, type MementoState } from '@/app/lib/mementos/state-labels'

/* Speaker Mementos (2026-10-20) — same shape as Badges: this page lists batches and creates new ones from the event's speakers; a batch is
   reviewed and pushed to Ops on /mementos/[batchId]. Only speakers' Cleaned Photos are involved. */

type BatchRow = { id: string; name: string; kind: 'shared' | 'legacy'; status: 'draft' | 'pushed'; speakers: number; changed: number; shared_at: string; created_at: string; created_by_name: string | null }
type Candidate = { id: string; name: string; title: string | null; company: string | null; eligible: boolean; state: MementoState; state_label: string; batch_name: string | null }
type Preview = { matched: { input: string; speaker: string }[]; unmatched: string[]; ambiguous: { input: string; candidates: string[] }[]; already_tracked: string[]; will_record: number }

const fmt = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

export default function MementosPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = use(params)
  const router = useRouter()
  const [eventName, setEventName] = useState<string | null>(null)
  const [permissions, setPermissions] = useState<Set<string>>(new Set())
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [batches, setBatches] = useState<BatchRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [legacyOpen, setLegacyOpen] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  useBreadcrumbLabel(eventId, eventName)
  const can = (key: string) => permissionSetSatisfies(permissions, key)

  const load = useCallback(async () => {
    const [res, permRes, eventRes] = await Promise.all([
      fetch(`/api/events/mementos?event_id=${eventId}`),
      fetch(`/api/events/access/me?event_id=${eventId}`),
      fetch(`/api/events?id=${eventId}`),
    ])
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { setError(data.error ?? 'Could not load memento batches.'); setBatches([]); return }
    setEnabled(!!data.enabled); setBatches(data.batches ?? [])
    const perm = await permRes.json().catch(() => ({ permissions: [] }))
    setPermissions(new Set(perm.permissions ?? []))
    const ev = await eventRes.json().catch(() => null)
    setEventName((Array.isArray(ev) ? ev[0] : ev)?.name ?? null)
  }, [eventId])
  // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load
  useEffect(() => { void load() }, [load])

  const canEdit = can('sae.mementos.manage')

  return (
    <div>
      <PageHeader
        eyebrow="Stakeholder Hub" title="Mementos"
        description="Create a batch from your speakers, then push it to Ops. Ops passes the Cleaned Photos on to the memento vendor."
        backHref={`/admin/events/${eventId}/stakeholders`} backLabel="Stakeholders"
        actions={enabled && canEdit ? (
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <Button variant="ghost" onClick={() => setLegacyOpen(true)}>Already shared before EventPilot</Button>
            <Button variant="lime" onClick={() => setCreating(true)}>+ New batch</Button>
          </div>
        ) : undefined}
      />
      <div style={{ padding: '24px 32px' }}>
        {error && <div style={{ color: 'var(--red)', fontSize: '14px', marginBottom: '12px' }}>{error}</div>}
        {enabled === false && <div style={{ color: 'var(--ink3)', fontSize: '14px' }}>Speaker Mementos isn’t switched on for this event. It can be turned on under Event Details → Feature Toggles.</div>}
        {enabled && (batches === null ? (
          <div style={{ color: 'var(--ink3)', fontSize: '14px' }}>Loading…</div>
        ) : batches.length === 0 ? (
          <div style={{ color: 'var(--ink3)', fontSize: '14px', padding: '40px 0', textAlign: 'center' }}>
            No memento batches yet.{canEdit ? ' Click “New batch” to create one from your speakers.' : ''}
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '10px' }}>
            {batches.map(b => (
              <Link key={b.id} href={`/admin/events/${eventId}/stakeholders/mementos/${b.id}`} style={{ textDecoration: 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap', padding: '14px 18px', border: '1px solid var(--border-light)', borderRadius: '10px', background: 'var(--card)' }}>
                  <div style={{ flex: '1 1 240px', minWidth: 0 }}>
                    <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--ink)' }}>{b.name}</div>
                    <div style={{ fontSize: '13px', color: 'var(--ink3)' }}>
                      {b.kind === 'legacy' ? `Shared before EventPilot · ${fmt(b.shared_at)}` : `created ${fmt(b.created_at)}${b.created_by_name ? ` by ${b.created_by_name}` : ''}`}
                    </div>
                  </div>
                  <div style={{ fontSize: '14px', color: 'var(--ink2)' }}>{b.speakers} speaker{b.speakers === 1 ? '' : 's'}</div>
                  {b.changed > 0 && <div style={{ fontSize: '14px', color: 'var(--amber)', fontWeight: 700 }}>{b.changed} photo{b.changed === 1 ? '' : 's'} changed</div>}
                  <Badge color={b.status === 'pushed' ? 'teal' : 'grey'}>{b.status === 'pushed' ? 'Pushed to Ops' : 'Draft'}</Badge>
                </div>
              </Link>
            ))}
          </div>
        ))}
      </div>
      {creating && <NewBatchModal eventId={eventId} onClose={() => setCreating(false)} onCreated={id => router.push(`/admin/events/${eventId}/stakeholders/mementos/${id}`)} onError={message => setToast({ message, type: 'error' })} />}
      {legacyOpen && <LegacyModal eventId={eventId} onClose={() => setLegacyOpen(false)} onDone={message => { setLegacyOpen(false); setToast({ message, type: 'success' }); void load() }} />}
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  )
}

type Filter = 'all' | 'ready' | 'not_pushed'

function NewBatchModal({ eventId, onClose, onCreated, onError }: { eventId: string; onClose: () => void; onCreated: (id: string) => void; onError: (m: string) => void }) {
  const [loading, setLoading] = useState(true)
  const [speakers, setSpeakers] = useState<Candidate[]>([])
  const [name, setName] = useState('')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const res = await fetch(`/api/events/mementos?event_id=${eventId}&candidates=1`)
      const data = await res.json().catch(() => ({}))
      if (cancelled) return
      if (!res.ok) { onError(data.error ?? 'Could not load speakers.'); onClose(); return }
      setSpeakers(data.speakers ?? []); setLoading(false)
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once when the modal opens
  }, [])

  const shown = useMemo(() => speakers.filter(s => {
    if (search.trim() && !`${s.name} ${s.company ?? ''}`.toLowerCase().includes(search.trim().toLowerCase())) return false
    if (filter === 'ready') return s.eligible
    if (filter === 'not_pushed') return s.state === 'not_shared' || s.state === 'photo_changed'
    return true
  }), [speakers, search, filter])
  const toggle = (id: string) => setPicked(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const selectable = (list: Candidate[]) => list.filter(s => s.eligible).map(s => s.id)
  const pickedAlready = speakers.filter(s => picked.has(s.id) && (s.state !== 'not_shared' && s.state !== 'photo_changed')).length

  async function create() {
    setSaving(true)
    const res = await fetch('/api/events/mementos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event_id: eventId, name, speaker_ids: [...picked] }) })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { setSaving(false); onError(data.error ?? 'Could not create the batch.'); return }
    // Stay "Creating…" until the batch page opens — a second click while it loads would create a duplicate batch.
    onCreated(data.id)
  }

  const th: React.CSSProperties = { textAlign: 'left', padding: '10px 12px', fontSize: '12px', fontWeight: 800, letterSpacing: '0.04em', color: 'var(--ink3)', textTransform: 'uppercase', position: 'sticky', top: 0, background: 'var(--card)', borderBottom: '1px solid var(--border)' }
  const td: React.CSSProperties = { padding: '9px 12px', fontSize: '14px', color: 'var(--ink)', borderBottom: '1px solid var(--border-light)', verticalAlign: 'middle' }
  const chip = (k: Filter, label: string) => (
    <button key={k} onClick={() => setFilter(k)} style={{ padding: '6px 14px', borderRadius: '20px', border: '1.5px solid var(--border)', background: filter === k ? 'var(--ink)' : 'transparent', color: filter === k ? 'var(--card)' : 'var(--ink2)', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>{label}</button>
  )

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--card)', zIndex: 60, display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
        <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--ink)' }}>New memento batch</div>
        <div style={{ flex: 1 }} />
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
      </div>
      {loading ? <div style={{ padding: '30px 24px', color: 'var(--ink3)' }}>Loading speakers…</div> : (<>
        <div style={{ padding: '14px 24px', borderBottom: '1px solid var(--border-light)', maxWidth: '520px' }}>
          <label style={{ fontSize: '13px', color: 'var(--ink3)' }}>Batch name
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Mementos — first batch" style={{ marginTop: '4px' }} />
          </label>
        </div>
        <div style={{ padding: '12px 24px', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', borderBottom: '1px solid var(--border-light)' }}>
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search speakers…" style={{ flex: '1 1 220px', maxWidth: '320px' }} />
          {chip('all', 'All')}{chip('ready', 'Has Cleaned Photo')}{chip('not_pushed', 'Not pushed yet')}
          <div style={{ flex: 1 }} />
          <Button variant="ghost" onClick={() => setPicked(prev => new Set([...prev, ...selectable(shown)]))}>Select shown</Button>
          <Button variant="ghost" onClick={() => setPicked(new Set())}>None</Button>
        </div>
        <div style={{ flex: 1, overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '760px' }}>
            <thead><tr><th style={{ ...th, width: '44px' }} /><th style={th}>Speaker</th><th style={{ ...th, textAlign: 'center' }}>Cleaned Photo</th><th style={th}>Memento</th></tr></thead>
            <tbody>
              {shown.map(s => (
                <tr key={s.id} style={{ background: picked.has(s.id) ? 'color-mix(in srgb, var(--teal) 8%, transparent)' : 'transparent', opacity: s.eligible ? 1 : 0.6 }}>
                  <td style={td}><input type="checkbox" checked={picked.has(s.id)} disabled={!s.eligible} onChange={() => toggle(s.id)} title={s.eligible ? '' : 'No Cleaned Photo yet'} style={{ width: '17px', height: '17px', cursor: s.eligible ? 'pointer' : 'not-allowed' }} /></td>
                  <td style={td}>
                    <div style={{ fontWeight: 700 }}>{s.name}</div>
                    <div style={{ fontSize: '12.5px', color: 'var(--ink3)' }}>{[s.title, s.company].filter(Boolean).join(' · ') || '—'}</div>
                  </td>
                  <td style={{ ...td, textAlign: 'center' }}>{s.eligible ? <span style={{ color: 'var(--teal)', fontWeight: 700 }}>✓</span> : <span style={{ color: 'var(--amber)', fontWeight: 800, fontSize: '12.5px' }}>Missing</span>}</td>
                  <td style={td}>{s.state === 'not_shared' ? <span style={{ color: 'var(--ink4)' }}>—</span> : <Badge color={MEMENTO_STATE_COLOR[s.state]}>{s.state_label}</Badge>}{s.batch_name && s.state !== 'not_shared' && <span style={{ fontSize: '12px', color: 'var(--ink4)', marginLeft: '8px' }}>{s.batch_name}</span>}</td>
                </tr>
              ))}
              {shown.length === 0 && <tr><td colSpan={4} style={{ ...td, color: 'var(--ink3)', padding: '24px' }}>Nothing matches.</td></tr>}
            </tbody>
          </table>
        </div>
        <div style={{ padding: '14px 24px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
          <div style={{ fontSize: '14px', color: 'var(--ink2)' }}>
            <strong>{picked.size}</strong> selected
            {pickedAlready > 0 && <span style={{ color: 'var(--ink3)' }}> · {pickedAlready} already in a batch</span>}
            <div style={{ fontSize: '12.5px', color: 'var(--ink3)', marginTop: '2px' }}>Only speakers with a Cleaned Photo can be added.</div>
          </div>
          <div style={{ flex: 1 }} />
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="lime" disabled={saving || !name.trim() || picked.size === 0} onClick={() => void create()}>{saving ? 'Creating…' : `Create batch (${picked.size})`}</Button>
        </div>
      </>)}
    </div>
  )
}

function LegacyModal({ eventId, onClose, onDone }: { eventId: string; onClose: () => void; onDone: (message: string) => void }) {
  const [namesText, setNamesText] = useState('')
  const [sharedOn, setSharedOn] = useState('')
  const [preview, setPreview] = useState<Preview | null>(null)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const names = () => namesText.split('\n').map(n => n.trim()).filter(Boolean)

  async function run(dryRun: boolean) {
    setWorking(true); setError(null)
    const res = await fetch('/api/events/mementos/legacy', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event_id: eventId, names: names(), shared_at: sharedOn, dry_run: dryRun }) })
    const data = await res.json().catch(() => ({}))
    setWorking(false)
    if (!res.ok) { setError(data.error ?? 'Could not process the list.'); if (data.will_record !== undefined) setPreview(data); return }
    if (dryRun) { setPreview(data); return }
    onDone(`Recorded ${data.recorded} speaker${data.recorded === 1 ? '' : 's'} as already pushed to Ops.`)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'color-mix(in srgb, black 60%, transparent)', zIndex: 70, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ width: '560px', maxWidth: '100%', maxHeight: '90vh', overflow: 'auto', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px', padding: '22px' }}>
        <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--ink)', marginBottom: '6px' }}>Already shared before EventPilot</div>
        <div style={{ fontSize: '12.5px', color: 'var(--ink3)', lineHeight: 1.6, marginBottom: '12px' }}>
          Paste the producers’ list of speakers whose photos were already given to Ops — one name per line. Names are matched to this event’s speakers and you see exactly what matched before anything is recorded. They then show as “Pushed to Ops”. This is a one-time mark and doesn’t touch any photo.
        </div>
        <textarea value={namesText} onChange={e => { setNamesText(e.target.value); setPreview(null) }} rows={7} placeholder="One speaker name per line"
          style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--ink)', fontSize: '13px', fontFamily: 'inherit', resize: 'vertical' }} />
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginTop: '10px', flexWrap: 'wrap' }}>
          <label style={{ fontSize: '12.5px', color: 'var(--ink3)' }}>Date shared&nbsp;
            <Input type="date" value={sharedOn} onChange={e => { setSharedOn(e.target.value); setPreview(null) }} style={{ width: '170px', display: 'inline-block' }} />
          </label>
          <Button variant="ghost" onClick={() => void run(true)} disabled={working || names().length === 0 || !sharedOn}>{working ? 'Checking…' : 'Preview matches'}</Button>
        </div>
        {error && <div style={{ fontSize: '12.5px', color: 'var(--red)', marginTop: '10px' }}>{error}</div>}
        {preview && (
          <div style={{ marginTop: '12px', fontSize: '13px', display: 'grid', gap: '6px' }}>
            <div style={{ color: 'var(--ink)' }}><strong>{preview.matched.length}</strong> matched{preview.will_record !== preview.matched.length ? ` (${preview.will_record} new)` : ''}</div>
            {preview.already_tracked.length > 0 && <div style={{ color: 'var(--ink3)' }}>Already tracked, will be skipped: {preview.already_tracked.join(', ')}</div>}
            {preview.ambiguous.length > 0 && <div style={{ color: 'var(--amber)' }}>More than one speaker matches — fix the spelling: {preview.ambiguous.map(a => `${a.input} (${(a.candidates ?? []).join(' / ')})`).join('; ')}</div>}
            {preview.unmatched.length > 0 && <div style={{ color: 'var(--red)' }}>Not found in this event’s speakers: {preview.unmatched.join(', ')}</div>}
          </div>
        )}
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '16px' }}>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="lime" onClick={() => void run(false)} disabled={working || !preview || preview.will_record === 0}>Record {preview?.will_record ?? 0} as pushed</Button>
        </div>
      </div>
    </div>
  )
}
