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
type Answer = { id: string; reviewer_id: string | null; reviewer_name: string; decision: 'approve' | 'reject' | 'suggest'; suggested_label: string | null; suggested_payload: Payload | null; comment: string | null; seen_label: string | null; seen_payload: Payload | null; decided_at: string; resolved_at: string | null }
type ItemRound = { round_id: string; audience: 'internal' | 'client'; status: 'open' | 'closed'; closed_at: string | null; answers: Answer[]; waiting: string[] }
type Item = {
  id: string; kind: 'figure' | 'breakdown' | 'outcome'; catalogue_key: string | null; category: string; group_label: string | null; label: string; working_payload: Payload; approved_payload: Payload | null
  approved_version: number; status: string; updated_at: string; source: string | null; evidence_file_name: string | null; evidence_file_path: string | null; basis: 'measured' | 'estimate'; notes: string | null
  errors: Finding[]; warnings: Finding[]; feedback: ItemRound[]; update_available: number; usage_count: number
}
type CopyItem = { id: string; asset_key: string; variant_length: string; variant_phase: string; status: string; approved_version: number }
type Person = { id: string; name: string; email: string }
type RoundSummary = { id: string; audience: 'internal' | 'client'; status: 'open' | 'closed'; sent_at: string; closed_at: string | null; items: number; reviewers: Array<{ id: string; name: string; email: string; kind: string; done: boolean; answered: number; last_opened_at: string | null; notified_at: string | null }> }
type Payloadd = {
  items: Item[]; requires_client_approval: boolean; can_edit: boolean; categories: Array<{ key: string; label: string }>; catalogue: Array<{ key: string; category: string; kind: string; label: string; help: string }>
  groupable: string[]; event_name: string | null; copy_post_items: CopyItem[]; approvers: Person[]; staff_choices: Person[]; rounds: { internal: RoundSummary | null; client: RoundSummary | null }
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
  const [sending, setSending] = useState<'internal' | 'client' | null>(null)
  const [sent, setSent] = useState<{ audience: string; reviewers: Array<{ name: string; email: string; link: string; emailed: boolean }> } | null>(null)
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
  // the client round counts only while the item is as it was when the round closed (a revision needs a new round)
  const clientClosed = (i: Item) => i.feedback.some(f => f.audience === 'client' && f.status === 'closed' && !!f.closed_at && new Date(i.updated_at).getTime() <= new Date(f.closed_at).getTime() + 1000)
  const needsDecision = items.filter(i => ['in_internal_review', 'client_suggested', 'client_rejected'].includes(i.status) && clientClosed(i))
  const draftReady = count(i => (i.status === 'draft' || i.status === 'edited_since_approval') && isFilled(i))
  const readyForClient = count(i => i.status === 'in_internal_review' && !clientClosed(i))
  const inReview = count(i => i.status === 'in_internal_review' || i.status === 'pending_client')
  const approved = count(i => i.status === 'approved')
  const internalRound = data.rounds.internal, clientRound = data.rounds.client
  const finalisable = needsDecision.filter(i => i.status === 'in_internal_review')

  return (
    <div style={{ display: 'grid', gap: '16px' }}>
      <Card padded>
        <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '0.6px', textTransform: 'uppercase', color: 'var(--teal-mid)' }}>Post-event</div>
        <div style={{ fontSize: '17px', fontWeight: 800, marginTop: '2px' }}>Public figures: approved for use in public documents</div>
        <div style={{ fontSize: '12.5px', color: 'var(--ink3)', marginTop: '2px' }}>Internal actuals and targets are not kept here. Tools only ever read the approved value of an item; a draft, an item in review or a reopened item never goes out.</div>
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', margin: '12px 0', fontSize: '12.5px' }}>
          <Counter n={count(i => i.status === 'draft' || i.status === 'edited_since_approval')} label="draft" /><Counter n={inReview} label="in review" />
          <Counter n={needsDecision.length} label="need your decision" hot /><Counter n={approved} label="approved" />
          <span style={{ color: 'var(--ink3)' }}>{data.requires_client_approval ? 'Client approval is required for this event.' : 'Client approval is not required for this event.'} <Link href={`/admin/events/${eventId}/details?tab=copy`} style={{ color: 'var(--teal-mid)', fontWeight: 800 }}>Change in Copy Library</Link></span>
        </div>
        <Steps requires={data.requires_client_approval} draft={count(i => i.status === 'draft' || i.status === 'edited_since_approval')} internal={internalRound} client={clientRound} ready={readyForClient} deciding={needsDecision.length} approved={approved} />
        {can && (
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', marginTop: '12px' }}>
            {items.length === 0 && <Button disabled={!!busy} onClick={async () => { const j = await act('start_from_template', {}, 'tpl'); if (j) notify(`Created ${j.created} empty items from the starter template.`, 'success') }}>{busy === 'tpl' ? 'Creating…' : 'Start from template'}</Button>}
            {items.length > 0 && <Button variant="ghost" disabled={!!busy} onClick={async () => { const j = await act('remove_all_empty', {}, 'empty'); if (j) notify(`Removed ${j.removed} empty item${j.removed === 1 ? '' : 's'}.`, 'success') }}>Remove all empty</Button>}
            <Button variant="ghost" disabled={!!busy || draftReady === 0 || internalRound?.status === 'open'} onClick={() => setSending(sending === 'internal' ? null : 'internal')}>Send for internal review{draftReady ? ` (${draftReady})` : ''}</Button>
            <Button variant="ghost" disabled={!!busy || draftReady === 0} onClick={async () => {
              const j = await act('approve', {}, 'appr')
              if (j) notify(`${j.approved} approved${j.moved_to_client ? `, ${j.moved_to_client} ready for the client` : ''}${j.blocked.length ? `. ${j.blocked.length} blocked: ${j.blocked[0].label} (${j.blocked[0].reason})` : ''}.`, j.blocked.length ? 'error' : 'success')
            }}>Approve internally{draftReady ? ` (${draftReady})` : ''}</Button>
            {data.requires_client_approval && <Button disabled={!!busy || readyForClient === 0 || clientRound?.status === 'open'} onClick={() => setSending(sending === 'client' ? null : 'client')}>Send for client approval{readyForClient ? ` (${readyForClient})` : ''}</Button>}
            {finalisable.length > 0 && <Button disabled={!!busy} onClick={async () => {
              const j = await act('final_approve', { ids: finalisable.map(i => i.id) }, 'final')
              if (j) notify(`${j.approved} approved${j.blocked.length ? `. ${j.blocked.length} held back: ${j.blocked[0].label} (${j.blocked[0].reason})` : ''}.`, j.blocked.length ? 'error' : 'success')
            }}>Approve what the client approved ({finalisable.length})</Button>}
          </div>
        )}
        {can && sending && <SendPanel key={sending} audience={sending} data={data} act={act} busy={busy} onDone={r => { setSending(null); setSent(r) }} onCancel={() => setSending(null)} />}
        {can && internalRound?.status === 'open' && <RoundBar round={internalRound} act={act} busy={busy} />}
        {can && clientRound?.status === 'open' && <RoundBar round={clientRound} act={act} busy={busy} />}
        {sent && (
          <div style={{ marginTop: '10px', fontSize: '12.5px', background: 'var(--surface)', border: '1px solid var(--border-light)', borderRadius: '8px', padding: '8px 10px', display: 'grid', gap: '4px' }}>
            <div><strong>Sent to {sent.audience}.</strong> {sent.reviewers.every(r => r.emailed) ? 'Each person has been emailed their link.' : 'Some emails could not be sent. Copy those links and send them yourself.'} <button onClick={() => setSent(null)} style={{ ...linkBtn, marginLeft: '6px' }}>Dismiss</button></div>
            {sent.reviewers.map(r => <div key={r.email}>{r.name} · {r.emailed ? 'emailed' : <strong style={{ color: 'var(--red)' }}>not emailed</strong>} <button onClick={() => { navigator.clipboard?.writeText(r.link); notify('Link copied.') }} style={linkBtn}>Copy link</button></div>)}
          </div>
        )}
        {can && items.length > 0 && <AddBar data={data} act={act} busy={busy} />}
      </Card>

      {can && <ApproversCard data={data} act={act} busy={busy} />}

      {needsDecision.length > 0 && can && (
        <Card padded>
          <div style={{ fontSize: '13px', fontWeight: 800, marginBottom: '8px', color: 'var(--red)' }}>Need your decision ({needsDecision.length})</div>
          <div style={{ display: 'grid', gap: '12px' }}>{needsDecision.map(i => <DecisionCard key={i.id} item={i} act={act} busy={busy} />)}</div>
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

const VERBS = { approve: ['approved', 'var(--teal-mid)'], reject: ['rejected', 'var(--red)'], suggest: ['suggested', 'var(--amber)'] } as const
const shown = (kind: Item['kind'], p: Payload) => (kind === 'figure' ? (p.display || '–') : kind === 'outcome' ? (p.text || '–') : (p.rows ?? []).map(r => `${r.label} ${r.display}`).join(' · ') || '–')

/** Every reviewer's answer on one item, in one place: who said what, the value they saw, and who has not answered yet. */
function FeedbackList({ item, act, busy, canEdit }: { item: Item; act: Act; busy: string | null; canEdit: boolean }) {
  if (!item.feedback.length) return null
  return (
    <div style={{ display: 'grid', gap: '8px' }}>
      {item.feedback.map(fr => (
        <div key={fr.round_id} style={{ borderLeft: '3px solid var(--border)', paddingLeft: '10px', display: 'grid', gap: '4px', fontSize: '12.5px' }}>
          <div style={{ fontSize: '11.5px', fontWeight: 800, color: 'var(--ink3)' }}>{fr.audience === 'internal' ? 'Colleagues' : 'Client'} · round {fr.status === 'open' ? 'open' : 'closed'}</div>
          {fr.answers.map(a => {
            const stale = !!a.seen_payload && JSON.stringify(a.seen_payload) !== JSON.stringify(item.working_payload)
            const canUse = canEdit && a.decision === 'suggest' && !a.resolved_at && (fr.audience === 'internal' ? !['approved', 'pending_client'].includes(item.status) : fr.status === 'closed' && item.status === 'client_suggested')
            return (
              <div key={a.id} style={{ lineHeight: 1.5, opacity: a.resolved_at ? 0.6 : 1 }}>
                <strong>{a.reviewer_name}</strong> <span style={{ color: VERBS[a.decision][1], fontWeight: 700 }}>{VERBS[a.decision][0]}</span>
                {a.decision === 'suggest' && a.suggested_payload && <>: <strong>{shown(item.kind, a.suggested_payload)}</strong>{a.suggested_label && a.suggested_label !== item.label ? ` (as “${a.suggested_label}”)` : ''}</>}
                {a.comment && <span style={{ color: 'var(--ink2)' }}> — “{a.comment}”</span>}
                {stale && a.seen_payload && <span style={{ color: 'var(--ink3)' }}> · saw “{shown(item.kind, a.seen_payload)}”</span>}
                {canUse && <> <button type="button" disabled={!!busy} onClick={() => act('accept_suggestion', { figure_id: item.id, decision_id: a.id }, 'acc')} style={linkBtn}>{fr.audience === 'internal' ? 'Use this value' : 'Accept (approves it)'}</button></>}
              </div>
            )
          })}
          {fr.status === 'open' && fr.waiting.length > 0 && <div style={{ color: 'var(--ink3)' }}>Waiting on {fr.waiting.join(', ')}</div>}
        </div>
      ))}
    </div>
  )
}

function DecisionCard({ item, act, busy }: { item: Item; act: Act; busy: string | null }) {
  const [counter, setCounter] = useState(false)
  const [label, setLabel] = useState(item.label)
  const [payload, setPayload] = useState<Payload>(item.working_payload)
  const [needsOverride, setNeedsOverride] = useState<string | null>(null)
  const state = item.status === 'client_rejected' ? 'was rejected' : item.status === 'client_suggested' ? 'has a suggestion' : 'was reviewed by the client'
  async function approve(override: boolean) {
    const j = await act('final_approve', { ids: [item.id], override }, 'final')
    if (j?.blocked?.length) { const b = j.blocked[0]; if (b.needs_override) setNeedsOverride(b.reason); else notify(b.reason, 'error') }
  }
  return (
    <div style={{ border: '1px solid var(--border-light)', borderRadius: '10px', padding: '10px 12px', display: 'grid', gap: '8px', fontSize: '13px' }}>
      <div style={{ fontWeight: 800 }}>{item.label} <span style={{ fontWeight: 600, color: 'var(--ink3)' }}>· {state}</span></div>
      <div><div style={{ fontSize: '11.5px', color: 'var(--ink3)' }}>Ours</div><ValueView kind={item.kind} payload={item.working_payload} /></div>
      <FeedbackList item={item} act={act} busy={busy} canEdit />
      {needsOverride && <div style={{ color: 'var(--red)', fontSize: '12.5px' }}>{needsOverride} <button type="button" onClick={() => { setNeedsOverride(null); void approve(true) }} style={linkBtn}>Approve anyway</button></div>}
      {counter ? (
        <div style={{ display: 'grid', gap: '6px' }}>
          <PayloadEditor kind={item.kind} label={label} setLabel={setLabel} payload={payload} setPayload={setPayload} />
          <div style={{ display: 'flex', gap: '6px' }}>
            <Button disabled={!!busy} onClick={async () => { if (await act('revise', { figure_id: item.id, label, payload }, 'rev')) setCounter(false) }}>{busy === 'rev' ? 'Saving…' : 'Save for the next client round'}</Button>
            <Button variant="ghost" onClick={() => setCounter(false)}>Cancel</Button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          <Button disabled={!!busy} onClick={() => approve(false)}>{busy === 'final' ? 'Approving…' : 'Approve as it stands'}</Button>
          {item.status !== 'in_internal_review' && <Button variant="ghost" disabled={!!busy} onClick={() => setCounter(true)}>{item.status === 'client_rejected' ? 'Revise' : 'Counter'}</Button>}
          <Button variant="ghost" disabled={!!busy} onClick={() => act('remove_after_review', { figure_id: item.id }, 'rm')}>Remove from public set</Button>
        </div>
      )}
    </div>
  )
}

/** Where the event is in the sequence: draft, internal review, ready for the client, client review, final. */
function Steps({ requires, draft, internal, client, ready, deciding, approved }: { requires: boolean; draft: number; internal: RoundSummary | null; client: RoundSummary | null; ready: number; deciding: number; approved: number }) {
  const roundText = (r: RoundSummary | null) => (!r ? 'not sent' : r.status === 'open' ? `open · ${r.reviewers.filter(v => v.done).length} of ${r.reviewers.length} done` : 'closed')
  const steps: Array<{ n: number; title: string; text: string; on: boolean }> = [
    { n: 1, title: 'Draft', text: `${draft} to finish`, on: draft > 0 && internal?.status !== 'open' },
    { n: 2, title: 'Internal review', text: roundText(internal), on: internal?.status === 'open' },
    ...(requires ? [
      { n: 3, title: 'Ready for client', text: `${ready} item${ready === 1 ? '' : 's'}`, on: ready > 0 && client?.status !== 'open' },
      { n: 4, title: 'Client review', text: roundText(client), on: client?.status === 'open' },
      { n: 5, title: 'Your decision', text: `${deciding} to decide`, on: deciding > 0 },
    ] : []),
    { n: requires ? 6 : 3, title: 'Approved', text: `${approved} approved`, on: false },
  ]
  return (
    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
      {steps.map(s => (
        <div key={s.n} style={{ border: `1px solid ${s.on ? 'var(--teal-mid)' : 'var(--border-light)'}`, background: s.on ? 'var(--surface)' : 'transparent', borderRadius: '8px', padding: '6px 10px', fontSize: '12px', minWidth: '110px' }}>
          <div style={{ fontWeight: 800, color: s.on ? 'var(--teal-mid)' : 'var(--ink2)' }}>{s.n}. {s.title}</div>
          <div style={{ color: 'var(--ink3)' }}>{s.text}</div>
        </div>
      ))}
    </div>
  )
}

/** Who has answered, live, and the button that closes the round. */
function RoundBar({ round, act, busy }: { round: RoundSummary; act: Act; busy: string | null }) {
  return (
    <div style={{ marginTop: '10px', border: '1px solid var(--border-light)', borderRadius: '8px', padding: '8px 10px', fontSize: '12.5px', display: 'grid', gap: '6px' }}>
      <div style={{ fontWeight: 800 }}>{round.audience === 'internal' ? 'Internal review is open' : 'Client review is open'} · {round.items} item{round.items === 1 ? '' : 's'}</div>
      {round.reviewers.map(v => <div key={v.id}>{v.name} · {v.answered} of {round.items} answered{v.done ? ' · done' : ''}{!v.last_opened_at ? <span style={{ color: 'var(--ink3)' }}> · not opened yet</span> : ''}</div>)}
      <div><Button variant="ghost" disabled={!!busy} onClick={async () => {
        const j = await act('close_round', { round_id: round.id }, 'close')
        if (j) notify(round.audience === 'client' ? `Round closed. ${j.ready} ready for your decision${j.suggested ? `, ${j.suggested} with a suggestion` : ''}${j.rejected ? `, ${j.rejected} rejected` : ''}.` : 'Internal round closed. Everyone’s answers stay on each item.', 'success')
      }}>{busy === 'close' ? 'Closing…' : 'Close this round'}</Button></div>
    </div>
  )
}

/** Choose who to send the round to. Colleagues are the event's assigned staff; the client side are the post-event approvers. */
function SendPanel({ audience, data, act, busy, onDone, onCancel }: { audience: 'internal' | 'client'; data: Payloadd; act: Act; busy: string | null; onDone: (r: { audience: string; reviewers: Array<{ name: string; email: string; link: string; emailed: boolean }> }) => void; onCancel: () => void }) {
  const pool = audience === 'internal' ? data.staff_choices : data.approvers
  const [picked, setPicked] = useState<string[]>([])
  const [message, setMessage] = useState('')
  return (
    <div style={{ marginTop: '10px', border: '1px solid var(--border-light)', borderRadius: '8px', padding: '10px 12px', display: 'grid', gap: '8px', fontSize: '12.5px' }}>
      <div style={{ fontWeight: 800 }}>{audience === 'internal' ? 'Send for internal review to:' : 'Send for client approval to:'}</div>
      {pool.length === 0 && <div style={{ color: 'var(--ink3)' }}>{audience === 'internal' ? 'No staff are assigned to this event yet.' : 'No client approvers yet. Add them under Post-event approvers below.'}</div>}
      <div style={{ display: 'grid', gap: '4px' }}>
        {pool.map(p => (
          <label key={p.id} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <input type="checkbox" checked={picked.includes(p.id)} onChange={e => setPicked(e.target.checked ? [...picked, p.id] : picked.filter(x => x !== p.id))} /> {p.name} <span style={{ color: 'var(--ink3)' }}>{p.email}</span>
          </label>
        ))}
      </div>
      <textarea value={message} onChange={e => setMessage(e.target.value)} rows={2} placeholder="A note for them (optional)" style={fieldStyle} />
      <div style={{ display: 'flex', gap: '6px' }}>
        <Button disabled={!!busy || picked.length === 0} onClick={async () => { const j = await act('send_review', { audience, reviewer_ids: picked, message }, 'send'); if (j) onDone({ audience: audience === 'internal' ? 'your colleagues' : 'the client approvers', reviewers: j.reviewers }) }}>{busy === 'send' ? 'Sending…' : `Send to ${picked.length || ''} ${picked.length === 1 ? 'person' : 'people'}`}</Button>
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  )
}

/** The client people who approve this event's post-event figures. Separate from the badge and announcement contacts, but they can be copied in. */
function ApproversCard({ data, act, busy }: { data: Payloadd; act: Act; busy: string | null }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  if (!data.requires_client_approval && data.approvers.length === 0) return null
  return (
    <Card padded>
      <div style={{ fontSize: '12px', fontWeight: 800, letterSpacing: '0.5px', textTransform: 'uppercase', color: 'var(--ink3)', marginBottom: '6px' }}>Post-event approvers (client)</div>
      {data.approvers.length === 0 && <div style={{ fontSize: '12.5px', color: 'var(--ink3)', marginBottom: '6px' }}>No approvers yet. Each person you add gets their own personal link when you send the figures to the client.</div>}
      <div style={{ display: 'grid', gap: '4px', fontSize: '12.5px' }}>
        {data.approvers.map(a => <div key={a.id}>{a.name} <span style={{ color: 'var(--ink3)' }}>{a.email}</span> <button type="button" disabled={!!busy} onClick={() => act('remove_approver', { approver_id: a.id }, 'rmapp')} style={{ ...linkBtn, color: 'var(--red)' }}>Remove</button></div>)}
      </div>
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '8px', alignItems: 'center' }}>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Name" style={{ ...fieldStyle, width: '180px' }} />
        <input value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" style={{ ...fieldStyle, width: '240px' }} />
        <Button variant="ghost" disabled={!!busy || !name.trim() || !email.trim()} onClick={async () => { if (await act('add_approver', { name, email }, 'addapp')) { setName(''); setEmail('') } }}>Add approver</Button>
        <Button variant="ghost" disabled={!!busy} onClick={async () => { const j = await act('import_approvers', {}, 'impapp'); if (j) notify(j.added ? `Copied ${j.added} from the client approval contacts.` : 'Nothing new to copy.', 'success') }}>Copy from client approval contacts</Button>
      </div>
    </Card>
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
      <FeedbackList item={item} act={act} busy={busy} canEdit={canEdit} />
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
