'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Button, Card } from '@/app/components/ui'
import { notify } from '@/app/lib/ui/notify'

/* Messaging document: the "Statistics" part of the document. The numbers are NOT kept in the document's sections: they live in the Stats tab (pre-event and post-event versions, approved
   per number, used by every tool). This card shows them here, read-only, so the document still reads as one place, and moves any statistics that are still inside the sections out to Stats
   (preview first: nothing changes until you confirm, and every row removed is recorded). */

type StatItem = { id: string; label: string; group_label: string | null; kind: string; status: string; working_payload: { display?: string; text?: string; rows?: Array<{ label: string; display: string }> }; approved_payload: { display?: string; text?: string; rows?: Array<{ label: string; display: string }> } | null; approved_version: number }
type Plan = { items: Array<{ section_id: string; section_title: string; at: unknown; label: string; kind: 'figure' | 'breakdown'; category: string; group_label: string | null; phase: 'pre' | 'post'; display: string; rows?: Array<{ label: string; display: string }>; removed_text: string }>; rejected: Array<{ section_id: string; reason: string }> }
type Lifted = { at: string; items: Array<{ label: string; phase: string }> }
type Conflict = { label: string; doc_value: string; stats_value: string; phase: string }

const val = (i: StatItem) => { const p = i.approved_payload ?? i.working_payload; return i.kind === 'figure' ? (p.display ?? '–') : i.kind === 'outcome' ? (p.text ?? '–') : (p.rows ?? []).map(r => `${r.label} ${r.display}`).join(' · ') || '–' }

export default function StatsInDoc({ eventId, docId, lifted, conflicts, canManage, onChanged }: { eventId: string; docId: string; lifted: Lifted[]; conflicts: Conflict[]; canManage: boolean; onChanged: () => void }) {
  const [phase, setPhase] = useState<'pre' | 'post'>('pre')
  const [items, setItems] = useState<StatItem[] | null>(null)
  const [counts, setCounts] = useState<{ pre: number; post: number } | null>(null)
  const [plan, setPlan] = useState<Plan | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [open, setOpen] = useState(false)

  const load = useCallback(async (ph: 'pre' | 'post') => {
    const r = await fetch(`/api/events/public-figures?event_id=${eventId}&phase=${ph}`, { cache: 'no-store' })
    const j = await r.json().catch(() => null)
    if (r.ok && j) { setItems(j.items as StatItem[]); setCounts(j.counts); if (j.content_phase === 'post' && ph === 'pre' && !open) { /* shown on the event's own phase below */ } }
  }, [eventId, open])
  // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load
  useEffect(() => { void load(phase) }, [load, phase])

  async function previewMove() {
    setBusy('preview')
    try {
      const r = await fetch(`/api/events/stakeholders/messaging/${docId}/lift-stats`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'preview' }) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { notify(j.error || 'Could not check the document.', 'error'); return }
      setPlan(j.plan as Plan)
    } finally { setBusy(null) }
  }
  async function applyMove() {
    if (!plan?.items.length) return
    setBusy('apply')
    try {
      const r = await fetch(`/api/events/stakeholders/messaging/${docId}/lift-stats`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'apply', items: plan.items }) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { notify(j.error || 'Could not move the statistics.', 'error'); return }
      notify(`Moved ${j.removed} statistic${j.removed === 1 ? '' : 's'} to the Stats tab (${j.created} new drafts${j.moved_same ? `, ${j.moved_same} already there` : ''}${j.kept_conflicts?.length ? `; ${j.kept_conflicts.length} differ and stayed in the document` : ''}).`, 'success')
      setPlan(null); await load(phase); onChanged()
    } finally { setBusy(null) }
  }

  const last = lifted[lifted.length - 1]
  return (
    <Card padded>
      <div style={{ display: 'flex', gap: '10px', alignItems: 'baseline', flexWrap: 'wrap', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '0.6px', textTransform: 'uppercase', color: 'var(--teal-mid)' }}>Statistics</div>
          <div style={{ fontSize: '12.5px', color: 'var(--ink3)', marginTop: '2px' }}>Managed in the <Link href={`/admin/events/${eventId}/details?tab=postevent`} style={{ color: 'var(--teal-mid)', fontWeight: 800 }}>Stats tab</Link>, not in the sections below. Every tool reads them from there. This is a read-only view.</div>
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          {(['pre', 'post'] as const).map(ph => <button key={ph} type="button" onClick={() => setPhase(ph)} style={{ border: `1.5px solid ${phase === ph ? 'var(--teal-mid)' : 'var(--border-light)'}`, background: phase === ph ? 'var(--surface)' : 'transparent', color: phase === ph ? 'var(--teal-mid)' : 'var(--ink2)', borderRadius: '999px', padding: '3px 12px', fontSize: '12px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>{ph === 'pre' ? 'Pre-event' : 'Post-event'} {counts ? counts[ph] : ''}</button>)}
        </div>
      </div>
      <div style={{ marginTop: '8px' }}>
        <button type="button" onClick={() => setOpen(o => !o)} style={{ border: 'none', background: 'none', color: 'var(--teal-mid)', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', padding: 0, fontSize: '12.5px' }}>{open ? 'Hide' : 'Show'} the {items?.length ?? 0} {phase === 'pre' ? 'pre-event' : 'post-event'} statistic{items?.length === 1 ? '' : 's'}</button>
        {open && <div style={{ display: 'grid', gap: '3px', marginTop: '6px', fontSize: '12.5px' }}>
          {(items ?? []).length === 0 && <span style={{ color: 'var(--ink3)' }}>None yet.</span>}
          {(items ?? []).map(i => <div key={i.id}><strong>{i.group_label ? `${i.group_label}: ` : ''}{i.label}</strong> · {val(i)} <span style={{ color: i.status === 'approved' ? 'var(--teal-mid)' : 'var(--ink3)', fontWeight: 700 }}>{i.status === 'approved' ? 'approved' : i.status === 'draft' ? 'draft' : i.status.replace(/_/g, ' ')}</span></div>)}
        </div>}
      </div>
      {last && <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--ink3)' }}>{last.items.length} statistic{last.items.length === 1 ? '' : 's'} moved out of this document to Stats on {new Date(last.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}.</div>}
      {conflicts.length > 0 && <div style={{ marginTop: '8px', fontSize: '12.5px', border: '1px solid var(--amber)', borderRadius: '8px', padding: '6px 10px' }}><strong style={{ color: 'var(--amber)' }}>These differ from the Stats tab and stayed in the document:</strong> {conflicts.map(c => `${c.label} (document ${c.doc_value}, Stats ${c.stats_value})`).join('; ')}. Decide which is right in the Stats tab, then edit the document line.</div>}
      {canManage && !plan && <div style={{ marginTop: '10px' }}><Button variant="ghost" disabled={!!busy} onClick={previewMove}>{busy === 'preview' ? 'Checking the document…' : 'Check this document for statistics to move out'}</Button></div>}
      {canManage && plan && (
        <div style={{ marginTop: '10px', border: '1.5px solid var(--amber)', borderRadius: '10px', padding: '10px 12px', display: 'grid', gap: '8px', fontSize: '12.5px' }}>
          <div style={{ fontWeight: 800 }}>{plan.items.length === 0 ? 'No statistics to move: the sections hold none.' : `Move these ${plan.items.length} statistic${plan.items.length === 1 ? '' : 's'} to the Stats tab?`}</div>
          {plan.items.length > 0 && <div style={{ color: 'var(--ink2)' }}>Each one becomes a Stats draft (pre-event unless it reports a result) that you approve there. The row is then removed from the document; what was removed is recorded. Narrative sentences are never touched.</div>}
          <div style={{ maxHeight: '260px', overflow: 'auto', display: 'grid', gap: '4px', border: '1px solid var(--border-light)', borderRadius: '8px', padding: '6px 8px' }}>
            {plan.items.map((i, k) => <div key={k}><strong>{i.label}</strong> <span style={{ color: 'var(--ink3)' }}>({i.section_title}, {i.phase === 'pre' ? 'pre-event' : 'post-event'})</span>: {i.kind === 'breakdown' ? (i.rows ?? []).map(r => `${r.label} ${r.display}`).join(' · ') : i.display}</div>)}
          </div>
          {plan.rejected.length > 0 && <div style={{ color: 'var(--ink3)' }}>{plan.rejected.length} suggestion{plan.rejected.length === 1 ? ' was' : 's were'} not used because they did not match the document exactly.</div>}
          <div style={{ display: 'flex', gap: '8px' }}>
            {plan.items.length > 0 && <Button variant="teal" disabled={!!busy} onClick={applyMove}>{busy === 'apply' ? 'Moving…' : `Move ${plan.items.length} to Stats`}</Button>}
            <Button variant="ghost" disabled={!!busy} onClick={() => setPlan(null)}>{plan.items.length ? 'Cancel' : 'Close'}</Button>
          </div>
        </div>
      )}
    </Card>
  )
}
