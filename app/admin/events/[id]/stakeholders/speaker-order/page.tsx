'use client'

import { use, useEffect, useState } from 'react'
import { DndContext, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import PageHeader from '@/app/components/PageHeader'
import { Button, Input } from '@/app/components/ui'
import { useBreadcrumbLabel } from '@/app/lib/nav/breadcrumb-labels'

/* Speaker Order (2026-09-09) — drag-to-reorder for speakers already live
   on KonfHub. Built because producers had to manually drag every speaker
   into position on KonfHub's own dashboard — fine for a handful, painful
   for the hundreds a large event like DFS runs, per Madhu. KonfHub stays
   the only source of truth for order (see the API route's own doc
   comment) — this page loads the CURRENT live order, lets a producer
   rearrange it locally, and pushes the whole new arrangement back in one
   call only once they click Update. Reload discards any unsaved drag
   without needing a page refresh.

   Deliberately just name + company, one column, dense (2026-09-09, per
   Madhu — "big enough" to read at a glance, nothing else, so hundreds of
   cards stay navigable). Reorder uses @dnd-kit/sortable, same library/
   pattern already used for form-schema field reordering
   (app/components/forms/FormSchemaEditor.tsx) — not a new dependency.

   Reset to Previous Order (2026-09-09, per Madhu) — an instant, local
   undo back to whatever was loaded THIS session (originalOrder, snapshot
   taken once per load()), distinct from Reload: Reload re-fetches the
   CURRENT live order from KonfHub (useful if it changed elsewhere since
   this page was opened), Reset just discards unsaved local drags/moves
   with no network round trip.

   Move to [x] (2026-09-09, per Madhu) — a numeric jump per speaker, for
   moving someone a long distance in a list of hundreds without a slow/
   error-prone drag. Reuses the exact same arrayMove the drag handler
   already does — a move is just a drag with a typed destination instead
   of a pointer gesture. */

type SpeakerRow = { id: string; name: string; company: string | null; konfhub_speaker_id: string; speaker_order: number }

export default function SpeakerOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = use(params)
  const [eventName, setEventName] = useState('')
  const [speakers, setSpeakers] = useState<SpeakerRow[]>([])
  const [originalOrder, setOriginalOrder] = useState<SpeakerRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [msgIsError, setMsgIsError] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [search, setSearch] = useState('')

  useBreadcrumbLabel(eventId, eventName)

  async function load() {
    setLoading(true)
    setError(null)
    const [speakersRes, eventRes] = await Promise.all([
      fetch(`/api/events/stakeholders/speaker-order?event_id=${eventId}`),
      fetch(`/api/events?id=${eventId}`),
    ])
    const speakersData = await speakersRes.json().catch(() => ({}))
    if (!speakersRes.ok) { setError(speakersData.error ?? 'Could not load speaker order.'); setLoading(false); return }
    setSpeakers(speakersData.speakers ?? [])
    setOriginalOrder(speakersData.speakers ?? [])
    setDirty(false)
    const eventData = await eventRes.json().catch(() => null)
    const ev = Array.isArray(eventData) ? eventData[0] : eventData
    setEventName(ev?.public_name || ev?.name || '')
    setLoading(false)
  }

  function resetToPreviousOrder() {
    setSpeakers(originalOrder)
    setDirty(false)
    setMsg(null)
  }

  function moveSpeakerTo(speakerId: string, targetPosition: number) {
    setSpeakers(prev => {
      const oldIdx = prev.findIndex(s => s.id === speakerId)
      if (oldIdx === -1) return prev
      const newIdx = Math.min(Math.max(targetPosition - 1, 0), prev.length - 1)
      if (newIdx === oldIdx) return prev
      return arrayMove(prev, oldIdx, newIdx)
    })
    setDirty(true)
    setMsg(null)
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-mount, matches this app's other top-level fetchAll effects
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refetch only when the event itself changes
  }, [eventId])

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  function onDragEnd(e: DragEndEvent) {
    if (!e.over || e.active.id === e.over.id) return
    const oldIdx = speakers.findIndex(s => s.id === e.active.id)
    const newIdx = speakers.findIndex(s => s.id === e.over!.id)
    if (oldIdx === -1 || newIdx === -1) return
    setSpeakers(prev => arrayMove(prev, oldIdx, newIdx))
    setDirty(true)
    setMsg(null)
  }

  async function saveOrder() {
    setSaving(true)
    setMsg(null)
    try {
      const res = await fetch('/api/events/stakeholders/speaker-order', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_id: eventId, order: speakers.map(s => s.id) }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setMsg(data.error ?? 'Could not update order on KonfHub.'); setMsgIsError(true); return }
      setMsg('Order updated on KonfHub.')
      setMsgIsError(false)
      setDirty(false)
    } catch {
      setMsg('Could not update order on KonfHub — check your connection and try again.')
      setMsgIsError(true)
    } finally {
      setSaving(false)
    }
  }

  const searchLower = search.trim().toLowerCase()
  const matchedId = searchLower
    ? speakers.find(s => s.name.toLowerCase().includes(searchLower) || (s.company ?? '').toLowerCase().includes(searchLower))?.id
    : null

  return (
    <div style={{ minHeight: '100vh', background: 'var(--surface)' }}>
      <PageHeader
        eyebrow="Stakeholder Hub"
        title="Speaker Order"
        backHref={`/admin/events/${eventId}/stakeholders`}
        backLabel="Back to Stakeholder Hub"
      />

      <div style={{ maxWidth: '640px', margin: '0 auto', padding: '20px 28px 60px' }}>
        {error && (
          <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'var(--red-light)', border: '1px solid var(--red-border)', color: 'var(--red)', fontSize: '14.5px', marginBottom: '16px' }}>
            {error}
          </div>
        )}

        <div style={{ fontSize: '12.5px', color: 'var(--ink3)', lineHeight: 1.6, marginBottom: '18px' }}>
          Drag speakers to set the order they appear in on KonfHub&apos;s own event page. This loads the order actually live on KonfHub right now — only speakers already pushed there show up below. Nothing changes on KonfHub until you click <strong>Update Order on KonfHub</strong>.
        </div>

        <div style={{ position: 'sticky', top: 0, background: 'var(--surface)', zIndex: 5, padding: '4px 0 14px', display: 'flex', gap: '10px', alignItems: 'center' }}>
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Find a speaker…" style={{ flex: 1 }} />
          <Button variant="ghost" onClick={resetToPreviousOrder} disabled={!dirty || saving || loading} title="Discard unsaved drags/moves — instant, no reload">
            Reset to Previous Order
          </Button>
          <Button variant="ghost" onClick={load} disabled={loading || saving} title="Re-fetch the order actually live on KonfHub right now">Reload</Button>
          <Button variant="lime" onClick={saveOrder} disabled={!dirty || saving || loading}>
            {saving ? 'Updating…' : 'Update Order on KonfHub'}
          </Button>
        </div>

        {msg && (
          <div style={{
            padding: '10px 14px', borderRadius: '8px', marginBottom: '14px', fontSize: '12.5px',
            background: msgIsError ? 'var(--red-light)' : 'var(--success-light)',
            border: `1px solid ${msgIsError ? 'var(--red-border)' : 'color-mix(in srgb, var(--success) 40%, transparent)'}`,
            color: msgIsError ? 'var(--red)' : 'var(--success)',
          }}>
            {msg}
          </div>
        )}

        {loading ? (
          <div style={{ fontSize: '13px', color: 'var(--ink4)', padding: '40px', textAlign: 'center' }}>Loading…</div>
        ) : speakers.length === 0 ? (
          <div style={{ fontSize: '13px', color: 'var(--ink4)', padding: '40px', textAlign: 'center' }}>
            No speakers are on KonfHub yet for this event — push at least one from a speaker&apos;s Details page first.
          </div>
        ) : (
          <DndContext sensors={sensors} onDragEnd={onDragEnd}>
            <SortableContext items={speakers.map(s => s.id)} strategy={verticalListSortingStrategy}>
              <div style={{ display: 'grid', gap: '6px' }}>
                {speakers.map((s, i) => (
                  <SpeakerCard key={s.id} index={i + 1} total={speakers.length} speaker={s} highlighted={s.id === matchedId} onMoveTo={pos => moveSpeakerTo(s.id, pos)} />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>
    </div>
  )
}

function SpeakerCard({ index, total, speaker, highlighted, onMoveTo }: {
  index: number; total: number; speaker: SpeakerRow; highlighted: boolean; onMoveTo: (position: number) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: speaker.id })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }
  const [moveValue, setMoveValue] = useState('')

  function submitMove() {
    const n = parseInt(moveValue, 10)
    if (!Number.isFinite(n)) return
    onMoveTo(n)
    setMoveValue('')
  }

  return (
    <div ref={setNodeRef} style={style}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px', borderRadius: '10px',
        background: highlighted ? 'var(--teal-light)' : 'var(--card)',
        border: `1px solid ${highlighted ? 'var(--teal-border)' : 'var(--border-light)'}`,
      }}>
        <span {...attributes} {...listeners} title="Drag to reorder" style={{ cursor: 'grab', color: 'var(--ink4)', fontSize: '18px', lineHeight: 1, touchAction: 'none' }}>⠿</span>
        <span style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--ink4)', minWidth: '28px', textAlign: 'right' }}>{index}</span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{speaker.name}</div>
          {speaker.company && (
            <div style={{ fontSize: '12px', color: 'var(--ink4)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{speaker.company}</div>
          )}
        </div>
        {/* Move to [x] (2026-09-09, per Madhu) — a direct numeric jump,
            for moving someone a long way in a list of hundreds without a
            slow drag. Same arrayMove the drag handler uses, just driven
            by a typed destination instead of a pointer gesture. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }} onClick={e => e.stopPropagation()}>
          <span style={{ fontSize: '11px', color: 'var(--ink4)', whiteSpace: 'nowrap' }}>Move to</span>
          <input
            type="number" min={1} max={total} value={moveValue}
            onChange={e => setMoveValue(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') submitMove() }}
            placeholder={String(index)}
            style={{
              width: '48px', padding: '5px 6px', borderRadius: '6px', border: '1px solid var(--border)',
              background: 'var(--surface)', color: 'var(--ink)', fontSize: '12.5px', textAlign: 'center', fontFamily: 'inherit',
            }}
          />
          <Button variant="ghost" onClick={submitMove} disabled={!moveValue.trim()}>Go</Button>
        </div>
      </div>
    </div>
  )
}
