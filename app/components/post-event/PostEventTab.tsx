'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Button, Card } from '@/app/components/ui'
import { notify } from '@/app/lib/ui/notify'
import { categoryLabel } from '@/app/lib/content/public-figures-catalogue'

/* Event Details → Post-event (docs/build_suggestions/public-figures.md §8). Public figures: the figures and facts this event may say in public documents, each approved
   (and, when the event requires it, approved by the client) before any tool reads it. Internal actuals and targets are NOT kept here. */

type Row = { label: string; display: string; percent?: number }
type Payload = { display?: string; title?: string; rows?: Row[]; text?: string }
type Finding = { message: string; match?: string }
type Decision = { decision: 'approve' | 'reject' | 'suggest'; suggested_label: string | null; suggested_payload: Payload | null; comment: string | null; audience: 'internal' | 'client'; reviewer_name: string | null; resolved_at: string | null }
type Item = {
  id: string; kind: 'figure' | 'breakdown' | 'outcome'; catalogue_key: string | null; category: string; group_label: string | null; label: string; working_payload: Payload; approved_payload: Payload | null
  approved_version: number; status: string; source: string | null; evidence_file_name: string | null; evidence_file_path: string | null; basis: 'measured' | 'estimate'; notes: string | null
  errors: Finding[]; warnings: Finding[]; decision: Decision | null; update_available: number; usage_count: number
}
type CopyItem = { id: string; asset_key: string; variant_length: string; variant_phase: string; status: string; approved_version: number }
type Payloadd = {
  items: Item[]; requires_client_approval: boolean; can_edit: boolean; categories: Array<{ key: string; label: string }>; catalogue: Array<{ key: string; category: string; kind: string; label: string; help: string }>
  groupable: string[]; event_name: string | null; copy_post_items: CopyItem[]
}

const STATUS: Record<string, { label: string; color: string }> = {
  draft: { label: 'Draft', color: 'var(--ink3)' }, in_internal_review: { label: 'Approved internally', color: 'var(--amber)' }, pending_client: { label: 'With the client', color: 'var(--amber)' },
  client_suggested: { label: 'Suggestion received', color: 'var(--red)' }, client_rejected: { label: 'Rejected', color: 'var(--red)' }, approved: { label: 'Approved', color: 'var(--teal-mid)' }, edited_since_approval: { label: 'Reopened', color: 'var(--amber)' },
}
const fieldStyle: React.CSSProperties = { width: '100%', padding: '7px 9px', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '13px', fontFamily: 'inherit', background: 'var(--card)', color: 'var(--ink)', boxSizing: 'border-box' }
const linkBtn: React.CSSProperties = { border: 'none', background: 'none', color: 'var(--teal-mid)', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', padding: 0, fontSize: '12.5px' }

export default function PostEventTab({ eventId }: { eventId: string }) {
  const [data, setData] = useState<Payloadd | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [link, setLink] = useState<{ url: string; audience: string; count: number } | null>(null)
  const [reload, setReload] = useState(0)
  const load = useCallback(() => setReload(k => k + 1), [])

  useEffect(() => {
    fetch(`/api/events/public-figures?event_id=${eventId}`, { cache: 'no-store' })
      .then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j.error || 'Could not load.'); setData(j); setError(null) })
      .catch(e => setError(e instanceof Error ? e.message : 'Could not load.'))
  }, [eventId, reload])

  async function act(action: string, extra: Record<string, unknown> = {}, label = action) {
    setBusy(label)
    try {
      const r = await fetch('/api/events/public-figures', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, event_id: eventId, ...extra }) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { notify(j.error || 'That did not work.', 'error'); return null }
      load(); return j
    } finally { setBusy(null) }
  }

  const groups = useMemo(() => {
    const out: Array<{ key: string; category: string; group: string | null; items: Item[] }> = []
    const order = new Map((data?.categories ?? []).map((c, i) => [c.key, i]))
    const sorted = [...(data?.items ?? [])].sort((a, b) => (order.get(a.category) ?? 99) - (order.get(b.category) ?? 99))
    for (const it of sorted) {
      const k = `${it.category}|${it.group_label ?? ''}`
      const g = out.find(x => x.key === k)
      if (g) g.items.push(it); else out.push({ key: k, category: it.category, group: it.group_label, items: [it] })
    }
    return out
  }, [data])

  if (error) return <Card padded><div style={{ color: 'var(--red)', fontSize: '13px' }}>{error}</div></Card>
  if (!data) return <Card padded><div style={{ fontSize: '13px', color: 'var(--ink3)' }}>Loading…</div></Card>

  const can = data.can_edit
  const items = data.items
  const count = (f: (i: Item) => boolean) => items.filter(f).length
  const awaiting = items.filter(i => i.status === 'client_suggested' || i.status === 'client_rejected')
  const draftReady = count(i => (i.status === 'draft' || i.status === 'edited_since_approval') && isFilled(i))
  const inReview = count(i => i.status === 'in_internal_review' || i.status === 'pending_client')
  const approved = count(i => i.status === 'approved')

  return (
    <div style={{ display: 'grid', gap: '16px' }}>
      <Card padded>
        <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '0.6px', textTransform: 'uppercase', color: 'var(--teal-mid)' }}>Post-event</div>
        <div style={{ fontSize: '17px', fontWeight: 800, marginTop: '2px' }}>Public figures: approved for use in public documents</div>
        <div style={{ fontSize: '12.5px', color: 'var(--ink3)', marginTop: '2px' }}>Internal actuals and targets are not kept here. Tools only ever read the approved value of an item; a draft, an item in review or a reopened item never goes out.</div>
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', margin: '12px 0', fontSize: '12.5px' }}>
          <Counter n={count(i => i.status === 'draft' || i.status === 'edited_since_approval')} label="draft" /><Counter n={inReview} label="in review" />
          <Counter n={awaiting.length} label="awaiting you" hot /><Counter n={approved} label="approved" />
          <span style={{ color: 'var(--ink3)' }}>{data.requires_client_approval ? 'Client approval is required for this event.' : 'Client approval is not required for this event.'} <Link href={`/admin/events/${eventId}/details?tab=copy`} style={{ color: 'var(--teal-mid)', fontWeight: 800 }}>Change in Copy Library</Link></span>
        </div>
        {can && (
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
            {items.length === 0 && <Button disabled={!!busy} onClick={async () => { const j = await act('start_from_template', {}, 'tpl'); if (j) notify(`Created ${j.created} empty items from the starter template.`, 'success') }}>{busy === 'tpl' ? 'Creating…' : 'Start from template'}</Button>}
            {items.length > 0 && <Button variant="ghost" disabled={!!busy} onClick={async () => { const j = await act('remove_all_empty', {}, 'empty'); if (j) notify(`Removed ${j.removed} empty item${j.removed === 1 ? '' : 's'}.`, 'success') }}>Remove all empty</Button>}
            <Button variant="ghost" disabled={!!busy || draftReady === 0} onClick={async () => { const j = await act('send_review', { audience: 'internal' }, 'int'); if (j) setLink({ url: j.url, audience: 'colleagues', count: j.count }) }}>Send for internal review{draftReady ? ` (${draftReady})` : ''}</Button>
            <Button variant="ghost" disabled={!!busy || draftReady === 0} onClick={async () => {
              const j = await act('approve', {}, 'appr')
              if (j) notify(`${j.approved} approved${j.moved_to_client ? `, ${j.moved_to_client} ready for the client` : ''}${j.blocked.length ? `. ${j.blocked.length} blocked: ${j.blocked[0].label} (${j.blocked[0].reason})` : ''}.`, j.blocked.length ? 'error' : 'success')
            }}>Approve internally{draftReady ? ` (${draftReady})` : ''}</Button>
            {data.requires_client_approval && <Button disabled={!!busy || count(i => i.status === 'in_internal_review') === 0} onClick={async () => { const j = await act('send_review', { audience: 'client' }, 'cli'); if (j) setLink({ url: j.url, audience: 'the client', count: j.count }) }}>Send for client approval{count(i => i.status === 'in_internal_review') ? ` (${count(i => i.status === 'in_internal_review')})` : ''}</Button>}
          </div>
        )}
        {can && <AddBar data={data} act={act} busy={busy} />}
        {link && (
          <div style={{ marginTop: '10px', fontSize: '12.5px', background: 'var(--surface)', border: '1px solid var(--border-light)', borderRadius: '8px', padding: '8px 10px' }}>
            Review link for {link.audience} ({link.count} item{link.count === 1 ? '' : 's'}; it works without a login): <a href={link.url} target="_blank" rel="noreferrer" style={{ wordBreak: 'break-all' }}>{link.url}</a>
            <button onClick={() => { navigator.clipboard?.writeText(link.url); notify('Link copied.') }} style={{ ...linkBtn, marginLeft: '8px' }}>Copy</button>
          </div>
        )}
      </Card>

      {awaiting.length > 0 && can && (
        <Card padded>
          <div style={{ fontSize: '13px', fontWeight: 800, marginBottom: '8px', color: 'var(--red)' }}>Awaiting you ({awaiting.length})</div>
          <div style={{ display: 'grid', gap: '12px' }}>{awaiting.map(i => <AwaitingCard key={i.id} item={i} act={act} busy={busy} />)}</div>
        </Card>
      )}

      {items.length === 0 && <Card padded><div style={{ fontSize: '13px', color: 'var(--ink3)' }}>No items yet.{can ? ' “Start from template” creates the standard set as empty drafts; keep what applies, fill in the values and remove the rest.' : ''}</div></Card>}

      {groups.map(g => (
        <details key={g.key} open={g.items.some(i => isFilled(i) || i.status !== 'draft')} style={{ background: 'var(--card)', border: '1px solid var(--border-light)', borderRadius: '12px', padding: '10px 14px' }}>
          <summary style={{ cursor: 'pointer', fontSize: '12px', fontWeight: 800, letterSpacing: '0.5px', textTransform: 'uppercase', color: 'var(--ink3)' }}>{categoryLabel(g.category)}{g.group ? ` · ${g.group}` : ''} <span style={{ fontWeight: 600 }}>({g.items.length})</span></summary>
          <div style={{ display: 'grid', gap: '10px', marginTop: '10px' }}>{g.items.map(i => <ItemCard key={`${i.id}-${i.status}-${i.approved_version}`} item={i} act={act} busy={busy} canEdit={can} eventId={eventId} />)}</div>
        </details>
      ))}

      <Card padded>
        <div style={{ fontSize: '12px', fontWeight: 800, letterSpacing: '0.5px', textTransform: 'uppercase', color: 'var(--ink3)', marginBottom: '6px' }}>Post-event copy (read-only)</div>
        {data.copy_post_items.length === 0
          ? <div style={{ fontSize: '12.5px', color: 'var(--ink3)' }}>No after-event copy in the Copy Library yet.</div>
          : <div style={{ display: 'grid', gap: '3px', fontSize: '12.5px' }}>{data.copy_post_items.map(c => <div key={c.id}>{c.asset_key.replace(/_/g, ' ')}{c.variant_length !== 'n/a' ? ` · ${c.variant_length.replace('_', '-')}` : ''} — <span style={{ color: STATUS[c.status]?.color ?? 'var(--ink3)', fontWeight: 700 }}>{c.status === 'needs_review' ? 'Needs review' : c.status.replace(/_/g, ' ')}</span></div>)}</div>}
        <div style={{ marginTop: '6px', fontSize: '12px' }}>Managed in the <Link href={`/admin/events/${eventId}/details?tab=copy`} style={{ color: 'var(--teal-mid)', fontWeight: 800 }}>Copy Library</Link>. It is not copied here.</div>
      </Card>
    </div>
  )
}

function isFilled(i: Pick<Item, 'kind' | 'working_payload'>): boolean {
  const p = i.working_payload
  return i.kind === 'figure' ? !!p.display?.trim() : i.kind === 'outcome' ? !!p.text?.trim() : (p.rows ?? []).some(r => r.label.trim() && r.display.trim())
}

function Counter({ n, label, hot }: { n: number; label: string; hot?: boolean }) { return <span><strong style={{ color: hot && n > 0 ? 'var(--red)' : 'var(--ink)' }}>{n}</strong> <span style={{ color: 'var(--ink3)' }}>{label}</span></span> }

type Act = (a: string, x?: Record<string, unknown>, l?: string) => Promise<any> // eslint-disable-line @typescript-eslint/no-explicit-any

function AddBar({ data, act, busy }: { data: Payloadd; act: Act; busy: string | null }) {
  const [key, setKey] = useState('')
  const [group, setGroup] = useState('')
  const [customLabel, setCustomLabel] = useState('')
  const [customKind, setCustomKind] = useState('figure')
  const [customCat, setCustomCat] = useState('at_a_glance')
  const [grpCat, setGrpCat] = useState(data.groupable[0] ?? 'competitions')
  const [grpName, setGrpName] = useState('')
  const sel: React.CSSProperties = { ...fieldStyle, width: 'auto' }
  return (
    <div style={{ display: 'grid', gap: '8px', marginTop: '12px', fontSize: '12.5px' }}>
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ minWidth: '110px', fontWeight: 700 }}>Add from catalogue</span>
        <select value={key} onChange={e => setKey(e.target.value)} style={sel}><option value="">Choose…</option>{data.categories.map(c => <optgroup key={c.key} label={c.label}>{data.catalogue.filter(e => e.category === c.key).map(e => <option key={e.key} value={e.key}>{e.label}</option>)}</optgroup>)}</select>
        <input value={group} onChange={e => setGroup(e.target.value)} placeholder="Group (optional)" style={{ ...sel, width: '150px' }} />
        <Button variant="ghost" disabled={!!busy || !key} onClick={async () => { if (await act('add_from_catalogue', { key, group_label: group }, 'cat')) setKey('') }}>Add</Button>
      </div>
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ minWidth: '110px', fontWeight: 700 }}>Add custom item</span>
        <select value={customKind} onChange={e => setCustomKind(e.target.value)} style={sel}><option value="figure">Figure</option><option value="breakdown">Breakdown</option><option value="outcome">Outcome / fact</option></select>
        <select value={customCat} onChange={e => setCustomCat(e.target.value)} style={sel}>{data.categories.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}</select>
        <input value={customLabel} onChange={e => setCustomLabel(e.target.value)} placeholder="Name, e.g. Delegations" style={{ ...sel, width: '190px' }} />
        <Button variant="ghost" disabled={!!busy || !customLabel.trim()} onClick={async () => { if (await act('add_custom', { kind: customKind, category: customCat, label: customLabel, group_label: group }, 'cus')) setCustomLabel('') }}>Add</Button>
      </div>
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ minWidth: '110px', fontWeight: 700 }}>Add group</span>
        <select value={grpCat} onChange={e => setGrpCat(e.target.value)} style={sel}>{data.categories.filter(c => data.groupable.includes(c.key)).map(c => <option key={c.key} value={c.key}>{c.label}</option>)}</select>
        <input value={grpName} onChange={e => setGrpName(e.target.value)} placeholder="Group name, e.g. Skillathon 2026" style={{ ...sel, width: '230px' }} />
        <Button variant="ghost" disabled={!!busy || !grpName.trim()} onClick={async () => { const j = await act('add_group', { category: grpCat, group_label: grpName }, 'grp'); if (j) { notify(`Added ${j.created} items under “${grpName}”.`, 'success'); setGrpName('') } }}>Add group</Button>
      </div>
    </div>
  )
}

function ValueView({ kind, payload }: { kind: Item['kind']; payload: Payload }) {
  if (kind === 'figure') return <strong>{payload.display || '–'}</strong>
  if (kind === 'outcome') return <span style={{ whiteSpace: 'pre-wrap' }}>{payload.text || '–'}</span>
  return <span>{(payload.rows ?? []).map(r => `${r.label} ${r.display}`).join(' · ') || '–'}</span>
}

function AwaitingCard({ item, act, busy }: { item: Item; act: Act; busy: string | null }) {
  const d = item.decision
  const [counter, setCounter] = useState(false)
  const base = d?.decision === 'suggest' && d.suggested_payload ? d.suggested_payload : item.working_payload
  const [label, setLabel] = useState(d?.suggested_label || item.label)
  const [payload, setPayload] = useState<Payload>(base)
  return (
    <div style={{ border: '1px solid var(--border-light)', borderRadius: '10px', padding: '10px 12px', display: 'grid', gap: '8px', fontSize: '13px' }}>
      <div style={{ fontWeight: 800 }}>{item.label} <span style={{ fontWeight: 600, color: 'var(--ink3)' }}>· {d?.audience === 'internal' ? 'colleague' : 'client'}{d?.reviewer_name ? ` (${d.reviewer_name})` : ''} {item.status === 'client_rejected' ? 'rejected it' : 'suggested a change'}</span></div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '10px' }}>
        <div><div style={{ fontSize: '11.5px', color: 'var(--ink3)' }}>Ours</div><ValueView kind={item.kind} payload={item.working_payload} /></div>
        {d?.decision === 'suggest' && d.suggested_payload && <div><div style={{ fontSize: '11.5px', color: 'var(--ink3)' }}>Their suggestion{d.suggested_label && d.suggested_label !== item.label ? ` (“${d.suggested_label}”)` : ''}</div><ValueView kind={item.kind} payload={d.suggested_payload} /></div>}
      </div>
      {d?.comment && <div style={{ color: 'var(--ink2)' }}>“{d.comment}”</div>}
      {counter ? (
        <div style={{ display: 'grid', gap: '6px' }}>
          <PayloadEditor kind={item.kind} label={label} setLabel={setLabel} payload={payload} setPayload={setPayload} />
          <div style={{ display: 'flex', gap: '6px' }}>
            <Button disabled={!!busy} onClick={async () => { if (await act('revise', { figure_id: item.id, label, payload }, 'rev')) setCounter(false) }}>{busy === 'rev' ? 'Saving…' : item.status === 'client_rejected' ? 'Save revision' : 'Send counter'}</Button>
            <Button variant="ghost" onClick={() => setCounter(false)}>Cancel</Button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {item.status === 'client_suggested' && <Button disabled={!!busy} onClick={() => act('accept_suggestion', { figure_id: item.id }, 'acc')}>{busy === 'acc' ? 'Approving…' : 'Accept as suggested'}</Button>}
          <Button variant="ghost" disabled={!!busy} onClick={() => setCounter(true)}>{item.status === 'client_rejected' ? 'Revise' : 'Counter'}</Button>
          <Button variant="ghost" disabled={!!busy} onClick={() => act('remove_after_review', { figure_id: item.id }, 'rm')}>Remove from public set</Button>
        </div>
      )}
    </div>
  )
}

function PayloadEditor({ kind, label, setLabel, payload, setPayload, disabled }: { kind: Item['kind']; label: string; setLabel: (v: string) => void; payload: Payload; setPayload: (p: Payload) => void; disabled?: boolean }) {
  return (
    <div style={{ display: 'grid', gap: '6px' }}>
      <input value={label} disabled={disabled} onChange={e => setLabel(e.target.value)} style={fieldStyle} aria-label="Label" placeholder="Label, the event’s own wording" />
      {kind === 'figure' && <input value={payload.display ?? ''} disabled={disabled} onChange={e => setPayload({ display: e.target.value })} style={fieldStyle} aria-label="Value" placeholder="Exactly as it should appear, e.g. 6,500+" />}
      {kind === 'outcome' && <textarea value={payload.text ?? ''} disabled={disabled} onChange={e => setPayload({ text: e.target.value })} rows={3} style={fieldStyle} aria-label="Wording" placeholder="The wording to publish" />}
      {kind === 'breakdown' && (
        <>
          <input value={payload.title ?? ''} disabled={disabled} onChange={e => setPayload({ ...payload, title: e.target.value })} style={fieldStyle} aria-label="Title" placeholder="Title, e.g. Industry representation" />
          {(payload.rows ?? []).map((r, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr auto', gap: '6px' }}>
              <input value={r.label} disabled={disabled} onChange={e => setPayload({ ...payload, rows: (payload.rows ?? []).map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} style={fieldStyle} aria-label="Row label" />
              <input value={r.display} disabled={disabled} onChange={e => setPayload({ ...payload, rows: (payload.rows ?? []).map((x, j) => (j === i ? { label: x.label, display: e.target.value } : x)) })} style={fieldStyle} aria-label="Row value" placeholder="20%" />
              {!disabled && <button type="button" onClick={() => setPayload({ ...payload, rows: (payload.rows ?? []).filter((_, j) => j !== i) })} style={linkBtn}>Remove</button>}
            </div>
          ))}
          {!disabled && <div><button type="button" onClick={() => setPayload({ ...payload, rows: [...(payload.rows ?? []), { label: '', display: '' }] })} style={linkBtn}>+ Add a row</button></div>}
        </>
      )}
    </div>
  )
}

function ItemCard({ item, act, busy, canEdit, eventId }: { item: Item; act: Act; busy: string | null; canEdit: boolean; eventId: string }) {
  const locked = item.status === 'approved' || item.status === 'pending_client'
  const [label, setLabel] = useState(item.label)
  const [payload, setPayload] = useState<Payload>(item.working_payload)
  const [source, setSource] = useState(item.source ?? '')
  const [basis, setBasis] = useState(item.basis)
  const [notes, setNotes] = useState(item.notes ?? '')
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState<string | null>(null)
  const st = STATUS[item.status] ?? STATUS.draft
  const dirty = label !== item.label || JSON.stringify(payload) !== JSON.stringify(item.working_payload) || source !== (item.source ?? '') || basis !== item.basis || notes !== (item.notes ?? '')
  const editable = canEdit && !locked

  async function save() {
    const wordingChanged = label !== item.label || JSON.stringify(payload) !== JSON.stringify(item.working_payload)
    await act('update', { figure_id: item.id, patch: { ...(wordingChanged ? { label, payload } : {}), source, basis, notes } }, 'save')
  }
  async function upload(file: File) {
    const fd = new FormData(); fd.append('figure_id', item.id); fd.append('file', file)
    const r = await fetch('/api/events/public-figures/evidence', { method: 'POST', body: fd }); const j = await r.json().catch(() => ({}))
    if (!r.ok) notify(j.error || 'Upload failed.', 'error'); else { notify('Evidence attached.', 'success'); await act('update', { figure_id: item.id, patch: {} }, 'refresh') }
  }
  async function download() {
    const r = await fetch(`/api/events/public-figures/evidence?figure_id=${item.id}`); const j = await r.json().catch(() => ({}))
    if (!r.ok) notify(j.error || 'Could not open the file.', 'error'); else window.open(j.url, '_blank', 'noopener')
  }

  return (
    <div style={{ border: '1px solid var(--border-light)', borderRadius: '10px', padding: '10px 12px', display: 'grid', gap: '8px' }}>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'baseline', flexWrap: 'wrap', justifyContent: 'space-between' }}>
        <button type="button" onClick={() => setOpen(o => !o)} style={{ ...linkBtn, color: 'var(--ink)', fontSize: '13.5px', textAlign: 'left' }}>{item.label} <span style={{ fontWeight: 500, color: 'var(--ink2)' }}>· <ValueView kind={item.kind} payload={item.status === 'approved' ? (item.approved_payload ?? item.working_payload) : item.working_payload} /></span></button>
        <span style={{ display: 'flex', gap: '8px', fontSize: '11.5px', fontWeight: 800, flexWrap: 'wrap' }}>
          {item.basis === 'estimate' && <span style={{ color: 'var(--amber)' }}>Estimate</span>}
          {item.update_available > 0 && <span style={{ color: 'var(--red)' }}>Update available · {item.update_available} live use{item.update_available === 1 ? '' : 's'}</span>}
          {item.approved_version > 0 && <span style={{ color: 'var(--ink3)' }}>v{item.approved_version}</span>}
          <span style={{ color: st.color }}>{st.label}</span>
        </span>
      </div>
      {item.errors.map((f, i) => <div key={i} style={{ fontSize: '12px' }}><strong style={{ color: 'var(--red)' }}>error</strong> · {f.match ? `“${f.match}” — ` : ''}{f.message}</div>)}
      {item.warnings.map((f, i) => <div key={i} style={{ fontSize: '12px' }}><strong style={{ color: 'var(--amber)' }}>warning</strong> · {f.match ? `“${f.match}” — ` : ''}{f.message}</div>)}
      {open && (
        <div style={{ display: 'grid', gap: '8px' }}>
          {item.status === 'edited_since_approval' && item.approved_payload && <div style={{ fontSize: '12px', color: 'var(--ink3)' }}>Reopened. Tools keep using version {item.approved_version} (<ValueView kind={item.kind} payload={item.approved_payload} />) until the new wording is approved.</div>}
          <PayloadEditor kind={item.kind} label={label} setLabel={setLabel} payload={payload} setPayload={setPayload} disabled={!editable} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '6px' }}>
            <input value={source} disabled={!canEdit} onChange={e => setSource(e.target.value)} style={fieldStyle} aria-label="Source" placeholder="Source, e.g. Konfhub check-in export" />
            <select value={basis} disabled={!canEdit} onChange={e => setBasis(e.target.value as 'measured' | 'estimate')} style={fieldStyle} aria-label="Basis"><option value="measured">Measured</option><option value="estimate">Estimate (agency or potential reach)</option></select>
          </div>
          <textarea value={notes} disabled={!canEdit} onChange={e => setNotes(e.target.value)} rows={2} style={fieldStyle} aria-label="Internal notes" placeholder="Internal notes (never shown to the client)" />
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', fontSize: '12.5px' }}>
            {item.evidence_file_name ? <><button type="button" onClick={download} style={linkBtn}>Evidence: {item.evidence_file_name}</button>{canEdit && <button type="button" style={{ ...linkBtn, color: 'var(--red)' }} onClick={async () => { await fetch(`/api/events/public-figures/evidence?figure_id=${item.id}`, { method: 'DELETE' }); await act('update', { figure_id: item.id, patch: {} }, 'refresh') }}>Remove file</button>}</> : <span style={{ color: 'var(--ink3)' }}>No evidence file.</span>}
            {canEdit && <label style={{ ...linkBtn, cursor: 'pointer' }}>{item.evidence_file_name ? 'Replace' : 'Attach evidence'}<input type="file" hidden onChange={e => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = '' }} /></label>}
          </div>
          {item.decision && <div style={{ fontSize: '12px', color: 'var(--ink3)' }}>Last decision: {item.decision.decision === 'approve' ? 'approved' : item.decision.decision === 'reject' ? 'rejected' : 'suggested a change'} by {item.decision.audience === 'internal' ? 'a colleague' : 'the client'}{item.decision.reviewer_name ? ` (${item.decision.reviewer_name})` : ''}{item.decision.comment ? `: “${item.decision.comment}”` : ''}</div>}
          {canEdit && (
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
              {!locked && <Button disabled={!!busy || !dirty} onClick={save}>{busy === 'save' ? 'Saving…' : 'Save'}</Button>}
              {item.status === 'approved' && reason === null && <Button variant="ghost" disabled={!!busy} onClick={() => setReason('')}>Reopen</Button>}
              {item.status === 'approved' && reason !== null && (
                <>
                  <input value={reason} onChange={e => setReason(e.target.value)} placeholder="Why are you reopening it? (required)" style={{ ...fieldStyle, width: '260px' }} />
                  <Button disabled={!!busy || !reason.trim()} onClick={async () => { if (await act('reopen', { figure_id: item.id, reason }, 'reopen')) setReason(null) }}>Reopen</Button>
                  <Button variant="ghost" onClick={() => setReason(null)}>Cancel</Button>
                </>
              )}
              {item.status !== 'pending_client' && <Button variant="ghost" disabled={!!busy} onClick={() => act('remove', { figure_id: item.id }, 'rm')}>Remove</Button>}
              <span style={{ fontSize: '11.5px', color: 'var(--ink3)' }}>{eventId && item.usage_count > 0 ? `Read by ${item.usage_count} tool use${item.usage_count === 1 ? '' : 's'}.` : ''}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
