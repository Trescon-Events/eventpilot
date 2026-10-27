'use client'

import { use, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import PageHeader from '@/app/components/PageHeader'
import CountryPicker, { countryNameOf } from '@/app/components/proposals/CountryPicker'
import { ClientGallery, type GalleryData, type GalleryItem } from '@/app/components/proposals/ClientGallery'
import OwnerBar from '@/app/components/proposals/OwnerBar'
import { OPEN_LINK_EMAIL } from '@/app/lib/proposals/open-link'
import { cleanProfilePaste, richPaste } from '@/app/lib/proposals/paste'
import { Badge, Button, Input, Textarea } from '@/app/components/ui'
import { notify } from '@/app/lib/ui/notify'
import { permissionSetSatisfies } from '@/app/lib/access/permission-match'
import { useBreadcrumbLabel } from '@/app/lib/nav/breadcrumb-labels'
import { countryCode, flagPath } from '@/app/lib/proposals/countries'
import { asksFor } from '@/app/lib/proposals/needs'

/* One drop (batch) of proposed speakers, as a three-step flow with a floating bar that always shows where you are and what comes next:
     1 Review speakers   — add speakers (Excel or typed), research them, check each card, mark it Ready or Exclude it
     2 Preview           — exactly what the client will see (the very same screen, read-only)
     3 Send to client    — reviewers, optional Cc and note, send; afterwards track the answers
   On every card the LEFT side is the clean card the client sees; the RIGHT side is internal findings and never reaches the client. */

type Video = { url: string; title: string; channel: string | null; date: string | null; duration: string | null; thumbnail: string | null; checked: 'watched' | 'named' | null; evidence: string | null }
type Card = { name: string; title: string | null; organization: string | null; nationality_iso2: string | null; linkedin_url: string | null; bio: string | null; videos: Video[]; photo_url: string | null; logo_url: string | null; website_url: string | null }
type Agreement = 'match' | 'differs' | 'unknown'
type Internal = {
  pipeline?: { pages_read: number; rounds: number; reports: { about: string }[] } | null
  status: 'verified' | 'needs_review' | 'not_found'; concerns: string[]; footprint_note: string | null; sources: { url: string; title: string; gave?: string[] }[]
  verification: { pass2_identified: boolean | null; title: Agreement; organization: Agreement; nationality: Agreement; linkedin: Agreement }
  previous?: { at: string | null } | null
  bio_removed: string[]; photo_candidates: { url: string; page_url: string | null; title: string }[]; logo_candidates: { url: string; page_url: string | null; title: string }[]; linkedin_note: string | null
}
type Progress = { stage: 'search' | 'read' | 'merge' | 'fill' | 'write' | 'verify'; label: string; detail: string | null; done: number | null; total: number | null; at: string }
type Input = { name: string; designation: string | null; company: string | null; country: string | null; linkedin: string | null; website?: string | null; extra?: string | null; extra_html?: string | null; links?: string | null; files?: { id: string; name: string; kind: 'photo' | 'text' | 'ignored'; chars: number; note?: string; url?: string }[]; track_text: string }
type Candidate = {
  id: string; position: number; raw: { cells: Record<string, string>; extra: string[]; manual?: boolean }; input: Input
  track_id: string | null; status: 'new' | 'queued' | 'researching' | 'researched' | 'error'; research: Internal | null; card: Card; review_state: 'pending' | 'ready' | 'excluded'; producer_notes: string | null; error: string | null; researched_at: string | null; started_at: string | null; progress: Progress | null
  client_decision: { decision: 'approved' | 'rejected'; reviewer_name: string; decided_at: string } | null; client_comments: { id: string; reviewer_name: string; body: string; created_at: string }[]
}
type Reviewer = { id: string; name: string; email: string; link: string; notified_at: string | null; last_opened_at: string | null; reminder_count: number }
type Track = { id: string; name: string; day_label: string | null; stage: string | null; time_label: string | null }
type Filter = 'all' | 'attention' | 'ready' | 'excluded' | 'unresearched' | 'approved' | 'rejected' | 'awaiting'

const words = (s: string | null | undefined) => (s ?? '').trim().split(/\s+/).filter(Boolean).length
const trackLabel = (t: Track | undefined) => (t ? [t.day_label, t.stage, t.name].filter(Boolean).join(' · ') : null)
const needsAttention = (c: Candidate) => c.status === 'error' || (c.status === 'researched' && c.review_state === 'pending' && (c.research?.status !== 'verified' || asksFor(c).length > 0))
const section: React.CSSProperties = { fontSize: '11.5px', fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--ink3)', margin: '12px 0 4px' }
const STYLES = `
  @keyframes spSpin { to { transform: rotate(360deg); } }
  .sp-spin { width: 16px; height: 16px; border: 2px solid var(--border); border-top-color: var(--teal); border-radius: 50%; animation: spSpin 0.9s linear infinite; display: inline-block; flex-shrink: 0; }
  @keyframes spPulse { 0%, 100% { box-shadow: 0 0 0 0 var(--teal); } 50% { box-shadow: 0 0 0 6px transparent; } }
  .sp-pulse { animation: spPulse 1.6s ease-in-out infinite; border-radius: 8px; }
  @keyframes spSlide { 0% { background-position: 0 0; } 100% { background-position: 40px 0; } }
  .sp-live { background-image: repeating-linear-gradient(45deg, var(--teal) 0 10px, var(--teal-mid) 10px 20px); background-size: 40px 100%; animation: spSlide 0.8s linear infinite; }
  @keyframes spBlink { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
  .sp-dot { width: 9px; height: 9px; border-radius: 50%; background: var(--teal); display: inline-block; animation: spBlink 1.2s ease-in-out infinite; flex-shrink: 0; }
`

async function call(url: string, method: string, body?: unknown): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  const res = await fetch(url, { method, headers: body === undefined ? undefined : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
  return { ok: res.ok, data: await res.json().catch(() => ({})) }
}

export default function ProposalBatchPage({ params }: { params: Promise<{ id: string; batchId: string }> }) {
  const { id: eventId, batchId } = use(params)
  const [permissions, setPermissions] = useState<Set<string>>(new Set())
  const [eventName, setEventName] = useState<string | null>(null)
  const [batch, setBatch] = useState<{ id: string; name: string; shared_at?: string | null } | null>(null)
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [tracks, setTracks] = useState<Track[]>([])
  const [reviewers, setReviewers] = useState<Reviewer[]>([])
  const [sender, setSender] = useState<{ name: string; email: string | null }>({ name: '', email: null })
  const [loadError, setLoadError] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [step, setStep] = useState<1 | 2 | 3 | null>(null)
  const [starting, setStarting] = useState(false)
  const [finished, setFinished] = useState<{ done: number; attention: number; failed: number } | null>(null)
  const wasWorking = useRef(false)
  useBreadcrumbLabel(eventId, eventName)
  useBreadcrumbLabel(batchId, batch?.name ?? null)
  const canEdit = permissionSetSatisfies(permissions, 'sae.stakeholders.edit')

  const fetchBatch = useCallback(async () => {
    const res = await fetch(`/api/events/speaker-proposals/batches/${batchId}`)
    return { ok: res.ok, d: await res.json().catch(() => ({})) as Record<string, unknown> }
  }, [batchId])
  const apply = useCallback((r: { ok: boolean; d: Record<string, unknown> }) => {
    if (!r.ok) { setLoadError(String(r.d.error ?? 'Could not load this drop.')); return }
    const b = r.d.batch as { id: string; name: string; shared_at?: string | null }
    setBatch(b); setCandidates(r.d.candidates as Candidate[]); setTracks(r.d.tracks as Track[]); setReviewers((r.d.reviewers as Reviewer[]) ?? [])
    setSender((r.d.sender as { name: string; email: string | null }) ?? { name: '', email: null })
    setStep(s => s ?? (b.shared_at ? 3 : 1))
  }, [])
  const load = useCallback(async () => { apply(await fetchBatch()) }, [apply, fetchBatch])
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const [r, p, e] = await Promise.all([fetchBatch(), fetch(`/api/events/access/me?event_id=${eventId}`).then(x => x.json()).catch(() => ({})), fetch(`/api/events?id=${eventId}`).then(x => x.json()).catch(() => null)])
      if (cancelled) return
      apply(r); setPermissions(new Set<string>((p as { permissions?: string[] }).permissions ?? []))
      const ev = Array.isArray(e) ? e[0] : e; setEventName(ev?.public_name || ev?.name || null)
    })()
    return () => { cancelled = true }
  }, [fetchBatch, apply, eventId])

  const working = candidates.some(c => c.status === 'queued' || c.status === 'researching')
  // Refresh every 3 s while research is running, and every 12 s otherwise (while the tab is visible) — so a job started from another tab,
  // by a colleague, or in the background shows up here without a reload.
  useEffect(() => {
    const t = setInterval(() => { void (async () => {
      if (document.visibilityState !== 'visible') return
      const r = await fetchBatch(); apply(r)
      // when the last speaker finishes, say so clearly instead of just letting the spinner vanish
      const list = (r.d.candidates as Candidate[] | undefined) ?? []
      const stillWorking = list.some(c => c.status === 'queued' || c.status === 'researching')
      if (!stillWorking && wasWorking.current) setFinished({ done: list.filter(c => c.status === 'researched').length, attention: list.filter(needsAttention).length, failed: list.filter(c => c.status === 'error').length })
      wasWorking.current = stillWorking
    })() }, working ? 3000 : 12000)
    return () => clearInterval(t)
  }, [working, fetchBatch, apply])
  useEffect(() => { wasWorking.current = working }, [working])

  async function startAll() {
    setStarting(true)
    const x = await call(`/api/events/speaker-proposals/batches/${batchId}/research`, 'POST', {})
    setStarting(false)
    if (!x.ok) { notify(String(x.data.error ?? 'Could not start the research.'), 'error'); return }
    notify(`Researching ${x.data.queued} speaker${x.data.queued === 1 ? '' : 's'} — you can leave this page; it keeps going.`)
    await load()
  }

  const shared = !!batch?.shared_at // sent to the client (approvers can be picked before this)
  const notStarted = candidates.filter(c => c.status === 'new' || c.status === 'queued' || c.status === 'error').length
  const counts = {
    done: candidates.filter(c => c.status === 'researched').length, ready: candidates.filter(c => c.review_state === 'ready').length, excluded: candidates.filter(c => c.review_state === 'excluded').length,
    attention: candidates.filter(needsAttention).length, active: candidates.filter(c => c.status === 'researching').length, queued: candidates.filter(c => c.status === 'queued').length,
    approved: candidates.filter(c => c.client_decision?.decision === 'approved').length, rejected: candidates.filter(c => c.client_decision?.decision === 'rejected').length,
    awaiting: candidates.filter(c => c.review_state === 'ready' && !c.client_decision).length,
  }
  const actioned = counts.ready + counts.excluded
  const allActioned = candidates.length > 0 && actioned === candidates.length
  const shown = useMemo(() => candidates.filter(c => filter === 'all' ? true : filter === 'ready' ? c.review_state === 'ready' : filter === 'excluded' ? c.review_state === 'excluded' : filter === 'approved' ? c.client_decision?.decision === 'approved' : filter === 'rejected' ? c.client_decision?.decision === 'rejected' : filter === 'awaiting' ? c.review_state === 'ready' && !c.client_decision : filter === 'attention' ? needsAttention(c) : c.status !== 'researched'), [candidates, filter])

  const previewData = useMemo<GalleryData>(() => {
    const order = new Map(tracks.map((t, i) => [t.id, i]))
    const items: (GalleryItem & { o: number; p: number })[] = candidates.filter(c => c.review_state === 'ready').map(c => ({
      id: c.id, track_label: trackLabel(tracks.find(t => t.id === c.track_id)) ?? null, o: order.get(c.track_id ?? '') ?? 999, p: c.position,
      card: { ...c.card, website_url: c.card.website_url ?? null, videos: c.card.videos.map(v => ({ url: v.url, title: v.title, channel: v.channel, date: v.date, duration: v.duration, thumbnail: v.thumbnail })) }, decision: null, comments: [],
    })).sort((a, b) => a.o - b.o || a.p - b.p)
    const seen = new Map<string, { id: string; label: string | null }>()
    for (const c of candidates.filter(x => x.review_state === 'ready' && x.track_id)) if (!seen.has(c.track_id!)) seen.set(c.track_id!, { id: c.track_id!, label: trackLabel(tracks.find(t => t.id === c.track_id)) ?? null })
    return { event_name: eventName ?? '', batch_name: batch?.name ?? '', shared_by_name: sender.name, message: null, reviewer: { id: 'preview', name: 'Reviewer' }, colleagues: [], actioned_by: [], totals: { total: items.length, approved: 0, rejected: 0 }, tracks: [...seen.values()], items }
  }, [candidates, tracks, eventName, batch, sender])

  if (loadError) return <div style={{ padding: '32px', color: 'var(--red)' }}>{loadError}</div>
  if (!batch || step === null) return <div style={{ padding: '32px', color: 'var(--ink3)' }}>Loading…</div>
  const chip = (f: Filter, label: string, n: number) => (
    <button key={f} onClick={() => setFilter(f)} style={{ padding: '6px 12px', borderRadius: '16px', border: `1px solid ${filter === f ? 'var(--teal)' : 'var(--border)'}`, background: 'transparent', color: filter === f ? 'var(--teal-mid)' : 'var(--ink3)', fontWeight: 700, fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit' }}>{label} ({n})</button>
  )

  // ── the floating step bar ───────────────────────────────────────────────
  const steps: { n: 1 | 2 | 3; label: string; done: boolean; enabled: boolean }[] = [
    { n: 1, label: 'Review speakers', done: allActioned && counts.ready > 0, enabled: true },
    { n: 2, label: 'Preview client view', done: step > 2 || shared, enabled: counts.ready > 0 },
    { n: 3, label: 'Client link', done: shared, enabled: counts.ready > 0 },
  ]
  const nextHint = step === 1
    ? (counts.ready === 0 ? 'Mark speakers Ready to continue' : allActioned ? 'All speakers are actioned — next: preview what the client will see' : `${candidates.length - actioned} speaker${candidates.length - actioned === 1 ? '' : 's'} still need a decision (Ready or Exclude)`)
    : step === 2 ? 'This is exactly what the client will see — next: choose who gets it' : shared ? 'Sent — track the answers below' : 'Create the client link and pass it on'
  const primary = step === 1 ? { label: 'Preview client view →', go: 2 as const, highlight: allActioned && counts.ready > 0, disabled: counts.ready === 0 }
    : step === 2 ? { label: 'Continue to send →', go: 3 as const, highlight: true, disabled: false } : null

  return (
    <div>
      <style>{STYLES}</style>
      <PageHeader eyebrow="Speaker Proposals" title={batch.name} description="Review each card, preview what the client sees, then send it. The left side of a card is what the client sees; the right side is for you only." backHref={`/admin/events/${eventId}/stakeholders/speaker-proposals`} backLabel="All drops" />
      <div style={{ position: 'sticky', top: 0, zIndex: 30, background: 'var(--card)', borderBottom: '1px solid var(--border)', padding: '10px 32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px 18px', flexWrap: 'wrap' }}>
          <div style={{ fontSize: '16px', fontWeight: 900, color: 'var(--ink)' }}>{batch.name}</div>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
            {steps.map(s => (
              <button key={s.n} disabled={!s.enabled} onClick={() => setStep(s.n)} style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '6px 12px', borderRadius: '18px', border: `1.5px solid ${step === s.n ? 'var(--teal)' : 'var(--border)'}`, background: step === s.n ? 'var(--teal)' : 'transparent', color: step === s.n ? 'white' : s.enabled ? 'var(--ink2)' : 'var(--ink4)', fontWeight: 800, fontSize: '13px', cursor: s.enabled ? 'pointer' : 'default', fontFamily: 'inherit', opacity: s.enabled ? 1 : 0.6 }}>
                <span style={{ fontSize: '12px' }}>{s.done && step !== s.n ? '✓' : s.n}</span>{s.label}
              </button>
            ))}
          </div>
          <div style={{ flex: 1 }} />
          {working ? <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 12px', borderRadius: '16px', border: '1px solid var(--teal)', fontSize: '13px', fontWeight: 800, color: 'var(--teal-mid)' }}><span className="sp-dot" />Researching — {counts.done} of {candidates.length} done</div> : null}
          <div style={{ fontSize: '13px', color: 'var(--ink3)' }}>{nextHint}</div>
          {step > 1 && <Button variant="ghost" onClick={() => { setStep((step - 1) as 1 | 2); window.scrollTo({ top: 0 }) }}>← Back</Button>}
          {primary && <span className={primary.highlight ? 'sp-pulse' : undefined}><Button variant={primary.highlight ? 'lime' : 'ghost'} disabled={primary.disabled} onClick={() => { setStep(primary.go); window.scrollTo({ top: 0 }) }}>{primary.label}</Button></span>}
        </div>
        <div style={{ fontSize: '12.5px', color: 'var(--ink3)', marginTop: '6px' }}>
          {candidates.length} speaker{candidates.length === 1 ? '' : 's'} · {counts.done} researched · <strong style={{ color: 'var(--ink2)' }}>{counts.ready} ready</strong> · {counts.excluded} excluded{working ? ` · researching ${counts.active + counts.queued}…` : ''}{shared ? ` · ${counts.approved} approved · ${counts.rejected} rejected · ${counts.awaiting} awaiting the client` : ''}
        </div>
      </div>

      <OwnerBar batchId={batchId} canEdit={canEdit} onChanged={() => void load()} batchName={batch.name} backHref={`/admin/events/${eventId}/stakeholders/speaker-proposals`} />

      <div style={{ padding: '20px 32px 60px' }}>
        {step === 1 && (<>
          {canEdit && <AddSpeakers batchId={batchId} tracks={tracks} empty={candidates.length === 0} onChanged={load} />}
          {candidates.length > 0 && (<>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '12px' }}>
              <div style={{ fontSize: '15px', color: 'var(--ink2)' }}>{counts.attention > 0 && <button onClick={() => setFilter('attention')} style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', fontSize: '15px', color: 'var(--amber)', fontWeight: 700 }}>{counts.attention} speaker{counts.attention === 1 ? '' : 's'} need your input — show them</button>}</div>
              <div style={{ flex: 1 }} />
              {canEdit && notStarted > 0 && !working && <Button variant="teal" onClick={() => void startAll()} disabled={starting}>{`Research ${notStarted} speaker${notStarted === 1 ? '' : 's'}`}</Button>}
            </div>
            {working && <BatchProgress candidates={candidates} total={candidates.length} />}
            {finished && !working && (
              <div style={{ marginBottom: '14px', padding: '12px 16px', border: '1px solid var(--teal)', borderRadius: '12px', background: 'var(--card)', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '18px', color: 'var(--teal-mid)' }}>✓</span>
                <div style={{ flex: 1, minWidth: '240px' }}><div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--ink)' }}>Research finished</div><div style={{ fontSize: '13.5px', color: 'var(--ink3)' }}>{finished.done} researched{finished.attention > 0 ? ` · ${finished.attention} need your attention (check them first)` : ' · nothing needs attention'}{finished.failed > 0 ? ` · ${finished.failed} failed — use Try again` : ''}. Review each card, then mark it Ready.</div></div>
                {finished.attention > 0 && <Button variant="lime" onClick={() => { setFilter('attention'); setFinished(null) }}>Show the ones needing attention</Button>}
                <Button variant="ghost" onClick={() => setFinished(null)}>Dismiss</Button>
              </div>
            )}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '18px' }}>
              {chip('all', 'All', candidates.length)}{chip('attention', 'Needs attention', counts.attention)}{chip('unresearched', 'Not researched', candidates.length - counts.done)}{chip('ready', 'Ready', counts.ready)}{chip('excluded', 'Excluded', counts.excluded)}
              {shared && <>{chip('awaiting', 'Awaiting client', counts.awaiting)}{chip('approved', 'Client approved', counts.approved)}{chip('rejected', 'Client rejected', counts.rejected)}</>}
            </div>
            <div style={{ display: 'grid', gap: '18px' }}>
              {shown.map(c => <CandidateRow key={`${c.id}-${c.researched_at ?? ''}`} cand={c} track={tracks.find(t => t.id === c.track_id)} tracks={tracks} canEdit={canEdit} ahead={candidates.filter(x => x.status === 'queued' && x.position < c.position).length} onChanged={load} />)}
              {shown.length === 0 && <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--ink3)' }}>Nothing here.</div>}
            </div>
          </>)}
        </>)}

        {step === 2 && (<>
          <div style={{ marginBottom: '14px', padding: '12px 16px', border: '1px solid var(--teal)', borderRadius: '10px', background: 'var(--card)', fontSize: '14px', color: 'var(--ink2)', lineHeight: 1.5 }}>
            <strong>Preview.</strong> This is exactly the page the client will see, with only the {counts.ready} speaker{counts.ready === 1 ? '' : 's'} you marked Ready. Approve and reject are switched off here. If something is wrong, go back to step 1 and edit the card.
          </div>
          <ClientGallery data={previewData} preview />
        </>)}

        {step === 3 && <SendStep batchId={batchId} shared={!!batch.shared_at} reviewers={reviewers} ready={counts.ready} approved={counts.approved} rejected={counts.rejected} canEdit={canEdit} onChanged={load} />}
      </div>
    </div>
  )
}

/* ── research progress ───────────────────────────────────────────────────── */
const STAGES: { k: Progress['stage']; label: string }[] = [
  { k: 'search', label: 'Search the web' }, { k: 'read', label: 'Read the pages' }, { k: 'merge', label: 'Compare the findings' },
  { k: 'fill', label: 'Look for what is missing' }, { k: 'write', label: 'Build the card' }, { k: 'verify', label: 'Independent check' },
]
const stageOrder = (k: Progress['stage']) => STAGES.findIndex(s => k === s.k)
/** 0–1: how far along a speaker is, from its stage and the page count inside it. */
const progressFraction = (p: Progress | null) => (p ? Math.min(0.97, (stageOrder(p.stage) + (p.total ? (p.done ?? 0) / p.total : 0.4)) / STAGES.length) : 0.03)
const mmss = (ms: number) => { const s = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` }
function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [active])
  return now
}

/** The live tracker on a speaker that is being researched: queue position, then the current stage, what it is doing, and how long it has been going. */
function ResearchProgress({ cand, ahead }: { cand: Candidate; ahead: number }) {
  const now = useNow(true)
  if (cand.status === 'queued') {
    return (
      <div style={{ padding: '12px 14px', background: 'var(--card)', borderRadius: '10px', border: '1px solid var(--border-light)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '14px', fontWeight: 800, color: 'var(--ink)' }}><span className="sp-dot" style={{ background: 'var(--ink4)' }} />Waiting in line</div>
        <div style={{ fontSize: '13px', color: 'var(--ink3)', marginTop: '4px' }}>{ahead === 0 ? 'Next up — it starts as soon as a researcher is free.' : `${ahead} speaker${ahead === 1 ? '' : 's'} ahead of this one.`} You can close this tab; it keeps going.</div>
      </div>
    )
  }
  const p = cand.progress
  const cur = p ? stageOrder(p.stage) : 0
  const steps = STAGES.filter(s => s.k !== 'fill' || p?.stage === 'fill')
  const elapsed = cand.started_at ? now - new Date(cand.started_at).getTime() : 0
  return (
    <div style={{ padding: '12px 14px', background: 'var(--card)', borderRadius: '10px', border: '1px solid var(--teal)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
        <span className="sp-spin" /><span style={{ fontSize: '14px', fontWeight: 800, color: 'var(--ink)' }}>Researching</span>
        <span style={{ flex: 1 }} /><span style={{ fontSize: '13px', color: 'var(--ink3)', fontVariantNumeric: 'tabular-nums' }}>{cand.started_at ? mmss(elapsed) : ''}</span>
      </div>
      <div style={{ display: 'grid', gap: '7px' }}>
        {steps.map(st => {
          const i = stageOrder(st.k), state = i < cur ? 'done' : i === cur ? 'now' : 'todo'
          return (
            <div key={st.k} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
              <span style={{ width: '18px', height: '18px', borderRadius: '50%', flexShrink: 0, marginTop: '1px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 900, border: `2px solid ${state === 'todo' ? 'var(--border)' : 'var(--teal)'}`, background: state === 'done' ? 'var(--teal)' : 'transparent', color: state === 'done' ? 'white' : 'var(--teal)' }}>
                {state === 'done' ? '✓' : state === 'now' ? <span className="sp-dot" style={{ width: '7px', height: '7px' }} /> : ''}
              </span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: '13.5px', fontWeight: state === 'now' ? 800 : 600, color: state === 'todo' ? 'var(--ink4)' : 'var(--ink)' }}>{state === 'now' && p ? p.label : st.label}</div>
                {state === 'now' && p?.detail && <div style={{ fontSize: '12.5px', color: 'var(--ink3)', marginTop: '1px' }}>{p.detail}</div>}
                {state === 'now' && p?.total ? <div style={{ height: '4px', borderRadius: '2px', background: 'var(--border-light)', marginTop: '5px' }}><div style={{ height: '4px', borderRadius: '2px', background: 'var(--teal)', width: `${Math.round(100 * (p.done ?? 0) / p.total)}%`, transition: 'width 0.4s' }} /></div> : null}
              </div>
            </div>
          )
        })}
      </div>
      <div style={{ fontSize: '12px', color: 'var(--ink4)', marginTop: '10px' }}>Usually 1–3 minutes. You can close this tab; it keeps going.</div>
    </div>
  )
}

/** The whole drop at a glance: a clear bar, the counts, a time estimate, and what each active researcher is doing right now. */
function BatchProgress({ candidates, total }: { candidates: Candidate[]; total: number }) {
  const now = useNow(true)
  const done = candidates.filter(c => c.status === 'researched').length
  const active = candidates.filter(c => c.status === 'researching'), waiting = candidates.filter(c => c.status === 'queued')
  const frac = total ? (done + active.reduce((n, c) => n + progressFraction(c.progress), 0)) / total : 0
  const samples = candidates.filter(c => c.status === 'researched' && c.started_at && c.researched_at).map(c => new Date(c.researched_at!).getTime() - new Date(c.started_at!).getTime()).filter(ms => ms > 5000 && ms < 30 * 60 * 1000)
  const avg = samples.length >= 2 ? samples.reduce((a, b) => a + b, 0) / samples.length : null
  const remaining = avg ? Math.max(0, ((waiting.length + active.length * 0.5) * avg) / Math.max(1, Math.min(3, active.length + waiting.length)) ) : null
  void now
  return (
    <div style={{ marginBottom: '14px', padding: '14px 16px', border: '1px solid var(--teal)', borderRadius: '12px', background: 'var(--card)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '10px' }}>
        <span className="sp-spin" />
        <span style={{ fontSize: '16px', fontWeight: 900, color: 'var(--ink)' }}>Research in progress</span>
        <span style={{ fontSize: '14px', color: 'var(--ink2)' }}><strong>{done}</strong> of {total} done · <strong>{active.length}</strong> researching · {waiting.length} waiting</span>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--teal-mid)' }}>{remaining === null ? 'Estimating time…' : remaining < 45_000 ? 'Almost done' : `About ${Math.max(1, Math.round(remaining / 60_000))} min left`}</span>
      </div>
      <div style={{ height: '10px', borderRadius: '5px', background: 'var(--border-light)', overflow: 'hidden' }}><div className="sp-live" style={{ height: '10px', borderRadius: '5px', width: `${Math.max(3, Math.round(frac * 100))}%`, transition: 'width 0.6s' }} /></div>
      {active.length > 0 && (
        <div style={{ display: 'grid', gap: '4px', marginTop: '10px' }}>
          {active.map(c => (
            <div key={c.id} style={{ display: 'flex', gap: '10px', alignItems: 'center', fontSize: '13px', color: 'var(--ink2)', flexWrap: 'wrap' }}>
              <span className="sp-dot" /><strong style={{ minWidth: '150px' }}>{c.card.name}</strong>
              <span style={{ color: 'var(--ink3)' }}>{c.progress ? `${c.progress.label}${c.progress.detail ? ` — ${c.progress.detail}` : ''}` : 'Starting…'}</span>
            </div>
          ))}
        </div>
      )}
      <div style={{ fontSize: '12.5px', color: 'var(--ink4)', marginTop: '10px' }}>You can leave this page or close the tab — the research keeps running on the server and your results will be waiting.</div>
    </div>
  )
}

/* ── adding speakers ─────────────────────────────────────────────────────── */
function AddSpeakers({ batchId, tracks, empty, onChanged }: { batchId: string; tracks: Track[]; empty: boolean; onChanged: () => Promise<void> }) {
  const blank = { name: '', designation: '', company: '', website: '', country: null as string | null, linkedin: '', track_id: '', extra: '' }
  const [open, setOpen] = useState(empty)
  const [f, setF] = useState(blank)
  const [busy, setBusy] = useState(false)
  const [imgs, setImgs] = useState<File[]>([])
  const file = useRef<HTMLInputElement>(null)
  const takeImages = (files: FileList | File[]) => { const pics = [...files].filter(x => x.type.startsWith('image/')); if (!pics.length) { notify('Only images can be dropped here. Paste text straight into the box.', 'error'); return } setImgs(prev => [...prev, ...pics].slice(0, 3)) }

  async function add(start: boolean) {
    if (!f.name.trim()) { notify('Type the speaker’s name first.', 'error'); return }
    setBusy(true)
    // Added first without research, so any photo / screenshot dropped in the box is read BEFORE the research starts.
    const x = await call(`/api/events/speaker-proposals/batches/${batchId}/candidates`, 'POST', { speaker: { ...f, country: f.country ? countryNameOf(f.country) : '' }, start: false })
    if (!x.ok) { setBusy(false); notify(String(x.data.error ?? 'Could not add the speaker.'), 'error'); return }
    const newId = String(x.data.id ?? '')
    for (const pic of imgs) {
      const form = new FormData(); form.set('file', pic)
      const res = await fetch(`/api/events/speaker-proposals/candidates/${newId}/drop`, { method: 'POST', body: form })
      const d = await res.json().catch(() => ({}))
      if (!res.ok || (d.kind !== 'portrait' && d.kind !== 'document')) notify(d.error ?? d.note ?? 'One image could not be used (it is neither a photo of the speaker nor a page of text).', 'error')
    }
    if (start) { const r = await call(`/api/events/speaker-proposals/candidates/${newId}/research`, 'POST', {}); if (!r.ok) notify(String(r.data.error ?? 'Added, but the research could not start.'), 'error') }
    setBusy(false)
    notify(start ? `${f.name.trim()} added — researching…` : `${f.name.trim()} added.`)
    setF(blank); setImgs([]); await onChanged()
  }
  async function upload(picked: File) {
    setBusy(true)
    const form = new FormData(); form.set('file', picked)
    const res = await fetch(`/api/events/speaker-proposals/batches/${batchId}/candidates`, { method: 'POST', body: form })
    const d = await res.json().catch(() => ({}))
    setBusy(false); if (file.current) file.current.value = ''
    if (!res.ok) { notify(d.error ?? 'Could not read that spreadsheet.', 'error'); return }
    notify(`${d.added} speaker${d.added === 1 ? '' : 's'} added${d.unmatched_tracks ? ` — ${d.unmatched_tracks} with a track we could not match` : ''}. Press Start research on a row, or Research all.`)
    await onChanged()
  }
  const label: React.CSSProperties = { display: 'block', fontSize: '12.5px', fontWeight: 700, color: 'var(--ink3)', marginBottom: '4px' }
  return (
    <div style={{ marginBottom: '20px', padding: '16px 18px', border: `1px solid ${empty ? 'var(--teal)' : 'var(--border-light)'}`, borderRadius: '12px', background: 'var(--card)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--ink)' }}>{empty ? 'Add the speakers for this drop' : 'Add more speakers'}</div>
        <span style={{ fontSize: '13.5px', color: 'var(--ink3)', flex: 1 }}>Upload a spreadsheet (optional extra columns: Website, and Notes — paste LinkedIn text or a bio there), or type speakers in one by one. Research starts only when you press it.</span>
        <input ref={file} type="file" accept=".xlsx,.xls" hidden onChange={e => { const p = e.target.files?.[0]; if (p) void upload(p) }} />
        <Button variant="ghost" disabled={busy} onClick={() => file.current?.click()}>Upload Excel</Button>
        <Button variant={open ? 'ghost' : 'teal'} onClick={() => setOpen(o => !o)}>{open ? 'Hide the form' : '+ Type in a speaker'}</Button>
      </div>
      {open && (
        <div style={{ marginTop: '14px', display: 'grid', gap: '10px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '10px' }}>
            <div><label style={label}>Name *</label><Input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder="Full name" /></div>
            <div><label style={label}>Job title</label><Input value={f.designation} onChange={e => setF({ ...f, designation: e.target.value })} placeholder="e.g. Director of Enforcement" /></div>
            <div><label style={label}>Company / organisation</label><Input value={f.company} onChange={e => setF({ ...f, company: e.target.value })} placeholder="e.g. Virtual Assets Regulatory Authority" /></div>
            <div><label style={label}>Company website</label><Input value={f.website} onChange={e => setF({ ...f, website: e.target.value })} placeholder="e.g. vara.ae" /></div>
            <div><label style={label}>Nationality</label><CountryPicker value={f.country} onChange={c => setF({ ...f, country: c })} /></div>
            <div><label style={label}>LinkedIn profile</label><Input value={f.linkedin} onChange={e => setF({ ...f, linkedin: e.target.value })} placeholder="https://www.linkedin.com/in/…" /></div>
            {tracks.length > 0 && <div><label style={label}>Track</label>
              <select value={f.track_id} onChange={e => setF({ ...f, track_id: e.target.value })} style={{ width: '100%', padding: '9px 10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--ink)', fontSize: '14px' }}><option value="">No track yet</option>{tracks.map(t => <option key={t.id} value={t.id}>{trackLabel(t)}</option>)}</select></div>}
          </div>
          <div><label style={label}>Paste anything you have about them <span style={{ fontWeight: 600 }}>(strongly recommended — the more here, the better and faster the research)</span></label>
            <Textarea rows={5} value={f.extra} onChange={e => setF({ ...f, extra: e.target.value })}
              onPaste={e => { const files = [...e.clipboardData.files]; if (files.length) { e.preventDefault(); takeImages(files) } }}
              onDrop={e => { e.preventDefault(); takeImages(e.dataTransfer.files) }} onDragOver={e => e.preventDefault()}
              placeholder="Paste or drop anything, no formatting needed: the text of their LinkedIn profile, a bio, links to pages or videos, a photo of them, or a screenshot of a page. The research treats this as trusted information." />
            {imgs.length > 0 && <div style={{ fontSize: '12.5px', color: 'var(--ink3)', marginTop: '4px' }}>{imgs.length} image{imgs.length === 1 ? '' : 's'} attached ({imgs.map(i => i.name || 'pasted image').join(', ')}) — read when you add the speaker. <button onClick={() => setImgs([])} style={{ border: 'none', background: 'none', color: 'var(--red)', cursor: 'pointer', fontFamily: 'inherit' }}>Remove</button></div>}</div>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <Button variant="lime" disabled={busy} onClick={() => void add(true)}>Add and start research</Button>
            <Button variant="ghost" disabled={busy} onClick={() => void add(false)}>Add only</Button>
          </div>
        </div>
      )}
    </div>
  )
}

/* ── one speaker row ─────────────────────────────────────────────────────── */
function CandidateRow({ cand, track, tracks, canEdit, ahead, onChanged }: { cand: Candidate; track: Track | undefined; tracks: Track[]; canEdit: boolean; ahead: number; onChanged: () => Promise<void> }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<Card>(cand.card)
  const [notes, setNotes] = useState(cand.producer_notes ?? '')
  const [again, setAgain] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [newVideo, setNewVideo] = useState('')
  const [fileStatus, setFileStatus] = useState<string | null>(null)
  const filePick = useRef<HTMLInputElement>(null)
  const [paste, setPaste] = useState<{ chars: number; removed: string | null; removedChars: number; leftOut: number; picture: string | null; pictureSure: boolean } | null>(null)
  const richRef = useRef<HTMLDivElement>(null)
  const richReady = useRef(false)
  const [assetUrl, setAssetUrl] = useState('')
  const photoFile = useRef<HTMLInputElement>(null)
  const dropRef = useRef<HTMLDivElement>(null)
  const logoFile = useRef<HTMLInputElement>(null)
  const [inp, setInp] = useState({ name: cand.input.name, designation: cand.input.designation ?? '', company: cand.input.company ?? '', website: cand.input.website ?? cand.card.website_url ?? '', country: countryCode(cand.input.country), linkedin: cand.input.linkedin ?? '', extra: cand.input.extra ?? '', links: cand.input.links ?? '' })
  const r = cand.research
  const card = cand.card
  const dim = cand.review_state === 'excluded'
  const inProgress = cand.status === 'queued' || cand.status === 'researching'
  const editable = cand.status === 'new' || cand.status === 'researched'

  async function patch(body: Record<string, unknown>, label?: string) {
    setBusy(label ?? 'save')
    const x = await call(`/api/events/speaker-proposals/candidates/${cand.id}`, 'PATCH', body)
    setBusy(null)
    if (!x.ok) { notify(String(x.data.error ?? 'Could not save.'), 'error'); return false }
    await onChanged(); return true
  }
  async function setAsset(kind: 'photo' | 'logo', url?: string, file?: File, quiet = false): Promise<boolean> {
    setBusy(kind)
    let res: Response
    if (file) { const f = new FormData(); f.set('kind', kind); f.set('file', file); res = await fetch(`/api/events/speaker-proposals/candidates/${cand.id}/asset`, { method: 'POST', body: f }) }
    else res = await fetch(`/api/events/speaker-proposals/candidates/${cand.id}/asset`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, url }) })
    const d = await res.json().catch(() => ({}))
    setBusy(null)
    if (!res.ok) { if (!quiet) notify(d.error ?? 'Could not set that.', 'error'); return false }
    setDraft(prev => ({ ...prev, [kind === 'logo' ? 'logo_url' : 'photo_url']: d.url })); setAssetUrl('')
    await onChanged(); return true
  }
  /** A picture that came with a LinkedIn paste: your browser can already show it, but LinkedIn refuses downloads from our server. So the browser fetches it and uploads the file; if LinkedIn blocks that too, say how to get it in. */
  async function pickPastedPhoto(url: string) {
    setBusy('photo')
    try {
      const r = await fetch(url, { referrerPolicy: 'no-referrer' })
      const blob = await r.blob()
      if (r.ok && blob.type.startsWith('image/')) {
        const ext = blob.type.includes('png') ? 'png' : blob.type.includes('webp') ? 'webp' : 'jpg'
        if (await setAsset('photo', undefined, new File([blob], `pasted.${ext}`, { type: blob.type }), true)) { notify('Photo added. It is now this speaker’s photo.'); return }
      }
    } catch { /* blocked by the site — fall through */ }
    setBusy(null)
    if (await setAsset('photo', url, undefined, true)) { notify('Photo added. It is now this speaker’s photo.'); return }
    notify('LinkedIn does not let this picture be copied over. Right-click it on LinkedIn → Save image, then drop the file in the Files box.', 'error')
  }
  async function removeAsset(kind: 'photo' | 'logo') {
    if (!window.confirm(`Remove this ${kind}? You can add another one afterwards.`)) return
    const ok = await patch({ card: { [kind === 'logo' ? 'logo_url' : 'photo_url']: null } }, `rm-${kind}`)
    if (ok) setDraft(prev => ({ ...prev, [kind === 'logo' ? 'logo_url' : 'photo_url']: null }))
  }
  async function research(full = false) {
    // No browser pop-up (they can be blocked and then the button looks dead); "Undo last re-run" is the safety net for a replaced card.
    setBusy('research')
    notify(full ? 'Starting over — searching the web again for this speaker…' : 'Research started — this card will show its progress. It reads what you dropped and looks for anything still missing.')
    const x = await call(`/api/events/speaker-proposals/candidates/${cand.id}/research`, 'POST', { full, input: { ...inp, country: inp.country ? countryNameOf(inp.country) : '' } })
    setBusy(null)
    if (!x.ok) { notify(String(x.data.error ?? 'Could not start.'), 'error'); return }
    setAgain(false); await onChanged()
  }
  async function startNow() {
    setBusy('research')
    const x = await call(`/api/events/speaker-proposals/candidates/${cand.id}/research`, 'POST', {})
    setBusy(null)
    if (!x.ok) { notify(String(x.data.error ?? 'Could not start.'), 'error'); return }
    await onChanged()
  }
  async function undoRerun() {
    if (!window.confirm('Go back to the card and findings as they were before the last re-run? Anything you changed since is replaced.')) return
    setBusy('undo')
    const x = await call(`/api/events/speaker-proposals/candidates/${cand.id}/undo`, 'POST')
    setBusy(null)
    if (!x.ok) { notify(String(x.data.error ?? 'Could not go back.'), 'error'); return }
    notify('Back to the earlier version.'); await onChanged()
  }
  async function removeSpeaker() {
    if (!window.confirm(`Remove ${card.name} from this drop?`)) return
    const x = await call(`/api/events/speaker-proposals/candidates/${cand.id}`, 'DELETE')
    if (!x.ok) { notify(String(x.data.error ?? 'Could not remove.'), 'error'); return }
    await onChanged()
  }

  /** The LinkedIn box is a rich box (like Word): what is copied lands as it looks — text, headings, lists and the speaker's own picture. Everything that is not the speaker (the rail of other people, the viewer's photo, logos, post images) is left out. */
  function readRich() {
    const el = richRef.current; if (!el) return { text: '', html: '' }
    return { text: el.innerText.replace(/\u00a0/g, ' ').trim().slice(0, 12000), html: el.innerHTML }
  }
  function saveRich() {
    const { text, html } = readRich()
    setInp(p => ({ ...p, extra: text }))
    if (text !== (cand.input.extra ?? '')) void patch({ extra: text, extra_html: html }, 'extra')
  }
  function handleRichPaste(e: React.ClipboardEvent<HTMLDivElement>) {
    const files = [...e.clipboardData.files]
    if (files.length) { e.preventDefault(); void dropFiles(files); return }
    const html = e.clipboardData.getData('text/html'), text = e.clipboardData.getData('text/plain')
    if (!html && !text.trim()) return
    e.preventDefault()
    if (html) {
      const r = richPaste(html, cand.input.name)
      if (r.text.trim()) {
        document.execCommand('insertHTML', false, r.html)
        const picture = r.speakerPictures[0] ?? r.maybePictures[0] ?? null
        setPaste({ chars: r.text.length, removed: r.removedSection, removedChars: r.removedChars, leftOut: r.leftOutPictures, picture, pictureSure: r.speakerPictures.length > 0 })
        if (picture && r.speakerPictures.length > 0 && !card.photo_url) void pickPastedPhoto(picture) // their own profile photo, named as them, and the card has none yet
        saveRich(); return
      }
    }
    const c = cleanProfilePaste(text)
    document.execCommand('insertText', false, c.text)
    setPaste({ chars: c.text.length, removed: c.removedSection, removedChars: c.removedChars, leftOut: 0, picture: null, pictureSure: false })
    saveRich()
  }

  async function dropFiles(files: FileList | File[]) {
    const list = [...files]; if (!list.length) return
    const room = Math.max(0, 10 - (cand.input.files?.length ?? 0))
    if (!room) { notify('That speaker already has 10 files. Remove one first.', 'error'); return }
    setBusy('drop')
    let n = 0
    for (const f of list.slice(0, room)) {
      n++; setFileStatus(`Reading file ${n} of ${Math.min(list.length, room)}: ${f.name || 'pasted image'}…`)
      const form = new FormData(); form.set('file', f)
      const res = await fetch(`/api/events/speaker-proposals/candidates/${cand.id}/drop`, { method: 'POST', body: form })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) notify(d.error ?? `Could not read ${f.name || 'that file'}.`, 'error')
    }
    if (list.length > room) notify(`Only the first ${room} were taken — 10 files is the limit per speaker.`, 'error')
    setFileStatus(null); setBusy(null); await onChanged()
  }
  async function removeFile(id: string) {
    setBusy('drop'); await call(`/api/events/speaker-proposals/candidates/${cand.id}/drop?file_id=${id}`, 'DELETE'); setBusy(null); await onChanged()
  }
  async function saveLinks() {
    if (inp.links === (cand.input.links ?? '')) return
    setBusy('links')
    const x = await call(`/api/events/speaker-proposals/candidates/${cand.id}`, 'PATCH', { links: inp.links })
    setBusy(null)
    if (!x.ok) { notify(String(x.data.error ?? 'Could not save the links.'), 'error'); return }
    const bad = (x.data.ignored_links as string[] | undefined) ?? []
    if (bad.length) notify(`${bad.length} line${bad.length === 1 ? ' is' : 's are'} not a web address and ${bad.length === 1 ? 'was' : 'were'} left out.`, 'error')
    await onChanged()
  }

  const statusBadge = cand.status === 'new' ? <Badge color="grey">Not researched</Badge> : cand.status === 'queued' ? <Badge color="grey">Waiting in line</Badge> : cand.status === 'researching' ? <Badge color="amber">{cand.progress ? `${cand.progress.label}…` : 'Researching…'}</Badge> : cand.status === 'error' ? <Badge color="red">Failed</Badge>
    : r?.status === 'verified' ? <Badge color="teal">Verified</Badge> : r?.status === 'needs_review' ? <Badge color="amber">Needs review</Badge> : <Badge color="red">Not found</Badge>
  const chipColor = (a: Agreement) => (a === 'match' ? 'var(--teal-mid)' : a === 'differs' ? 'var(--red)' : 'var(--ink4)')
  const flag = flagPath(card.nationality_iso2)
  const asks = asksFor(cand)
  const boxLabel: React.CSSProperties = { fontSize: '13px', fontWeight: 800, color: 'var(--ink)' }
  const boxHelp: React.CSSProperties = { fontSize: '12px', color: 'var(--ink4)', lineHeight: 1.45, margin: '2px 0 4px' }
  const surname = (cand.input.name.split(/\s+/).filter(w => w.replace(/[^\p{L}]/gu, '').length >= 3).pop() ?? '').toLowerCase()
  const linkedinWarning = inp.extra.length > 150 && surname && !inp.extra.toLowerCase().includes(surname) ? `This text never mentions “${surname}” — check it is ${cand.input.name}’s profile and not someone else’s.`
    : inp.extra.length > 600 && !/(experience|education|skills|connections|followers|linkedin|about)/i.test(inp.extra) ? 'This does not look like a LinkedIn profile. For any other website, paste its link in the Links box instead.' : null
  const linkLines = inp.links.split(/\r?\n/).map(t => t.trim()).filter(Boolean).map(t => {
    const ok = /^https?:\/\/\S+\.\S+/i.test(t) || /^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(t)
    return { text: t, ok: ok && !/linkedin\.com/i.test(t), note: !ok ? 'not a web address, will be left out' : /linkedin\.com/i.test(t) ? 'LinkedIn cannot be opened by the system — paste the profile text in box 1' : null }
  })

  return (
    <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: 'minmax(0, 1.25fr) minmax(0, 1fr)', border: `1px solid ${inProgress ? 'var(--teal)' : 'var(--border)'}`, borderRadius: '14px', overflow: 'hidden', background: 'var(--card)', opacity: dim ? 0.55 : 1 }}>
      {inProgress && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '4px', background: 'var(--border-light)', zIndex: 2 }}>{cand.status === 'researching' ? <div className="sp-live" style={{ height: '4px', width: `${Math.round(progressFraction(cand.progress) * 100)}%`, transition: 'width 0.6s' }} /> : null}</div>}
      {/* CLEAN card — what the client sees */}
      <div style={{ padding: '18px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--ink4)' }}>#{cand.position}</span>
          <span style={{ fontSize: '12.5px', color: 'var(--ink3)' }}>{trackLabel(track) ?? <em>No track{cand.input.track_text ? ` (“${cand.input.track_text}” not recognised)` : ''}</em>}</span>
          {canEdit && <select value={cand.track_id ?? ''} onChange={e => void patch({ track_id: e.target.value || null }, 'track')} style={{ fontSize: '12px', padding: '2px 6px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--ink2)', maxWidth: '170px' }}><option value="">Change track…</option>{tracks.map(t => <option key={t.id} value={t.id}>{trackLabel(t)}</option>)}</select>}
        </div>
        {!editing ? (
          <div style={{ display: 'flex', gap: '18px' }}>
            <div style={{ width: '124px', flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
              <div style={{ width: '104px', height: '104px', borderRadius: '50%', background: 'var(--surface)', overflow: 'hidden', border: '1px solid var(--border-light)' }}>
                {card.photo_url ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={card.photo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ fontSize: '11px', color: 'var(--ink4)', textAlign: 'center', paddingTop: '44px' }}>No photo</div>}
              </div>
              {card.logo_url /* eslint-disable-next-line @next/next/no-img-element */ && <img src={card.logo_url} alt="" style={{ width: '120px', height: '60px', objectFit: 'contain', background: 'white', border: '1px solid var(--border-light)', borderRadius: '6px', padding: '4px', boxSizing: 'border-box' }} />}
              {flag /* eslint-disable-next-line @next/next/no-img-element */ && <img src={flag} alt={countryNameOf(card.nationality_iso2)} title={countryNameOf(card.nationality_iso2)} style={{ width: '40px', height: '30px', objectFit: 'cover', borderRadius: '3px', border: '1px solid var(--border-light)' }} />}
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: '19px', fontWeight: 900, color: 'var(--ink)' }}>{card.name}</div>
              <div style={{ fontSize: '14px', color: 'var(--ink2)', marginTop: '2px' }}>{[card.title, card.organization].filter(Boolean).join(' · ') || <em style={{ color: 'var(--ink4)' }}>No title or organisation</em>}</div>
              <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', marginTop: '8px', fontSize: '13.5px' }}>
                {card.website_url && <a href={card.website_url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--teal)' }}>Company website ↗</a>}
                {card.linkedin_url && <a href={card.linkedin_url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--teal)' }}>LinkedIn ↗</a>}
              </div>
              {card.bio ? <p style={{ fontSize: '14px', lineHeight: 1.55, color: 'var(--ink2)', margin: '10px 0 8px' }}>{card.bio}</p> : <p style={{ fontSize: '13.5px', color: 'var(--ink4)', margin: '10px 0 8px' }}><em>No bio.</em></p>}
              {card.videos.length > 0 && (
                <div style={{ marginTop: '8px', display: 'grid', gap: '4px' }}>
                  {card.videos.map(v => <a key={v.url} href={v.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '13.5px', color: 'var(--teal)' }}>▶ {v.title.slice(0, 90)}{v.channel ? ` — ${v.channel}` : ''} ↗</a>)}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '10px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div><div style={section}>Name</div><Input value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} /></div>
              <div><div style={section}>Nationality (flag) — type to search</div><CountryPicker value={draft.nationality_iso2} onChange={c => setDraft({ ...draft, nationality_iso2: c })} /></div>
              <div><div style={section}>Title</div><Input value={draft.title ?? ''} onChange={e => setDraft({ ...draft, title: e.target.value })} /></div>
              <div><div style={section}>Organisation</div><Input value={draft.organization ?? ''} onChange={e => setDraft({ ...draft, organization: e.target.value })} /></div>
            </div>
            <div><div style={section}>Company website</div><Input value={draft.website_url ?? ''} onChange={e => setDraft({ ...draft, website_url: e.target.value })} placeholder="e.g. vara.ae" /></div>
            <div><div style={section}>Bio <span style={{ textTransform: 'none', fontWeight: 600 }}>({words(draft.bio)} words — aim for about 120)</span></div><Textarea value={draft.bio ?? ''} rows={6} onChange={e => setDraft({ ...draft, bio: e.target.value })} /></div>
            <div><div style={section}>LinkedIn</div><Input value={draft.linkedin_url ?? ''} onChange={e => setDraft({ ...draft, linkedin_url: e.target.value })} placeholder="https://www.linkedin.com/in/…" /></div>
            <div><div style={section}>Videos (up to 3, YouTube first)</div>
              {draft.videos.map((v, i) => <div key={v.url} style={{ display: 'flex', gap: '8px', alignItems: 'center', fontSize: '13px', marginBottom: '4px' }}><a href={v.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--teal)', flex: 1, overflowWrap: 'anywhere' }}>{v.title.slice(0, 80)}</a><button onClick={() => setDraft({ ...draft, videos: draft.videos.filter((_, k) => k !== i) })} style={{ border: 'none', background: 'none', color: 'var(--red)', cursor: 'pointer', fontWeight: 800 }}>✕</button></div>)}
              {draft.videos.length < 3 && <div style={{ display: 'flex', gap: '8px' }}><Input value={newVideo} onChange={e => setNewVideo(e.target.value)} placeholder="Paste a video link" /><Button variant="ghost" disabled={!/^https?:\/\//i.test(newVideo)} onClick={() => { setDraft({ ...draft, videos: [...draft.videos, { url: newVideo.trim(), title: newVideo.trim(), channel: null, date: null, duration: null, thumbnail: null, checked: null, evidence: null }] }); setNewVideo('') }}>Add</Button></div>}
            </div>
            <div><div style={section}>Photo</div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                {draft.photo_url /* eslint-disable-next-line @next/next/no-img-element */ && <img src={draft.photo_url} alt="" style={{ width: '56px', height: '56px', objectFit: 'cover', borderRadius: '50%', border: '2px solid var(--teal)' }} />}
                {(r?.photo_candidates ?? []).map(p => /* eslint-disable-next-line @next/next/no-img-element */ <img key={p.url} src={p.url} alt="" title={`Use this photo — ${p.title}`} onClick={() => void setAsset('photo', p.url)} style={{ width: '56px', height: '56px', objectFit: 'cover', borderRadius: '50%', cursor: 'pointer', border: '2px solid var(--border)' }} />)}
                <input ref={photoFile} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={e => { const f = e.target.files?.[0]; if (f) void setAsset('photo', undefined, f) }} />
                <Button variant="ghost" disabled={busy === 'photo'} onClick={() => photoFile.current?.click()}>{busy === 'photo' ? 'Working…' : 'Upload photo'}</Button>
                {draft.photo_url && <Button variant="red" disabled={!!busy} onClick={() => void removeAsset('photo')}>Remove photo</Button>}
              </div></div>
            <div><div style={section}>Logo (cleaned automatically to the standard 600×300)</div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                {draft.logo_url /* eslint-disable-next-line @next/next/no-img-element */ && <img src={draft.logo_url} alt="" style={{ width: '84px', height: '42px', objectFit: 'contain', background: 'white', border: '2px solid var(--teal)', borderRadius: '6px' }} />}
                {(r?.logo_candidates ?? []).map(p => /* eslint-disable-next-line @next/next/no-img-element */ <img key={p.url} src={p.url} alt="" title={`Use this logo — ${p.title}`} onClick={() => void setAsset('logo', p.url)} style={{ width: '84px', height: '42px', objectFit: 'contain', background: 'white', cursor: 'pointer', border: '2px solid var(--border)', borderRadius: '6px' }} />)}
                <input ref={logoFile} type="file" accept="image/*,.svg,.pdf,.ai,.eps" hidden onChange={e => { const f = e.target.files?.[0]; if (f) void setAsset('logo', undefined, f) }} />
                <Button variant="ghost" disabled={busy === 'logo'} onClick={() => logoFile.current?.click()}>{busy === 'logo' ? 'Working…' : 'Upload logo'}</Button>
                {draft.logo_url && <Button variant="red" disabled={!!busy} onClick={() => void removeAsset('logo')}>Remove logo</Button>}
              </div>
              <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}><Input value={assetUrl} onChange={e => setAssetUrl(e.target.value)} placeholder="Or paste an image link" /><Button variant="ghost" disabled={!/^https?:\/\//i.test(assetUrl) || !!busy} onClick={() => void setAsset('logo', assetUrl)}>Use as logo</Button><Button variant="ghost" disabled={!/^https?:\/\//i.test(assetUrl) || !!busy} onClick={() => void setAsset('photo', assetUrl)}>Use as photo</Button></div></div>
            <div style={{ display: 'flex', gap: '8px' }}><Button variant="teal" disabled={busy === 'save'} onClick={async () => { if (await patch({ card: draft })) setEditing(false) }}>Save card</Button><Button variant="ghost" onClick={() => { setDraft(card); setEditing(false) }}>Cancel</Button></div>
          </div>
        )}
        {canEdit && !editing && editable && <div style={{ marginTop: '12px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <Button variant="ghost" onClick={() => { setDraft(card); setEditing(true) }}>Edit card</Button>
          <Button variant={cand.review_state === 'ready' ? 'ghost' : 'lime'} disabled={!!busy} onClick={() => void patch({ review_state: cand.review_state === 'ready' ? 'pending' : 'ready' })}>{cand.review_state === 'ready' ? 'Ready ✓ (undo)' : 'Mark ready'}</Button>
          <Button variant="ghost" disabled={!!busy} onClick={() => void patch({ review_state: dim ? 'pending' : 'excluded' })}>{dim ? 'Include again' : 'Exclude'}</Button>
        </div>}
      </div>

      {/* INTERNAL panel */}
      <div style={{ padding: '18px 20px', background: 'var(--surface)', borderLeft: '1px solid var(--border-light)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
          <span style={{ fontSize: '11.5px', fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--amber)' }}>Internal — never shown to the client</span><span style={{ flex: 1 }} />{statusBadge}
        </div>
        {(cand.client_decision || cand.client_comments.length > 0) && (
          <div style={{ marginBottom: '8px', padding: '8px 10px', borderRadius: '8px', border: `1px solid ${cand.client_decision?.decision === 'rejected' ? 'var(--red)' : 'var(--teal)'}`, background: 'var(--card)', fontSize: '13.5px', lineHeight: 1.45 }}>
            {cand.client_decision && <div style={{ fontWeight: 800, color: cand.client_decision.decision === 'rejected' ? 'var(--red)' : 'var(--teal-mid)' }}>Client {cand.client_decision.decision} — {cand.client_decision.reviewer_name}, {new Date(cand.client_decision.decided_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>}
            {cand.client_comments.map(m => <div key={m.id} style={{ color: 'var(--ink2)', marginTop: '3px' }}>“{m.body}” <span style={{ color: 'var(--ink4)' }}>— {m.reviewer_name}</span></div>)}
          </div>
        )}
        {inProgress && <ResearchProgress cand={cand} ahead={ahead} />}
        {canEdit && !inProgress && asks.length > 0 && (
          <div style={{ marginBottom: '10px', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--amber)', background: 'var(--card)' }}>
            <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--ink)', marginBottom: '4px' }}>To finish this card</div>
            <ul style={{ margin: 0, paddingLeft: '18px', listStyle: 'disc', fontSize: '13px', color: 'var(--ink2)', lineHeight: 1.5 }}>{asks.map(a => <li key={a.key} style={{ marginBottom: '3px' }}><strong>{a.text}</strong> {a.hint}</li>)}</ul>
            <div style={{ marginTop: '8px' }}><Button variant="ghost" onClick={() => { dropRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }); dropRef.current?.querySelector('textarea')?.focus() }}>Add info on the card</Button></div>
          </div>
        )}
        {cand.status === 'new' && !again && <div style={{ fontSize: '13.5px', color: 'var(--ink2)', lineHeight: 1.5 }}>Not researched yet. The card shows what you entered. Press <strong>Start research</strong> to find the profile, bio, videos, photo and logo — or mark it Ready as it is.</div>}
        {cand.status === 'error' && <div style={{ fontSize: '13.5px', color: 'var(--red)' }}>Research failed: {cand.error ?? 'unknown error'}</div>}
        {r?.footprint_note && <div style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--ink)', background: 'var(--card)', border: '1px solid var(--amber)', borderRadius: '8px', padding: '8px 10px', lineHeight: 1.45 }}>{r.footprint_note}</div>}
        {r && r.concerns.length > 0 && (<><div style={section}>Check these</div><ul style={{ margin: 0, paddingLeft: '18px', listStyle: 'disc', fontSize: '13px', color: 'var(--ink2)', lineHeight: 1.5 }}>{r.concerns.map((x, i) => <li key={i}>{x}</li>)}</ul></>)}
        {r && r.status !== 'not_found' && (<><div style={section}>Second check (independent)</div>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', fontSize: '12.5px', fontWeight: 700 }}>
            {(['title', 'organization', 'nationality', 'linkedin'] as const).map(k => <span key={k} style={{ color: chipColor(r.verification[k]), border: `1px solid ${chipColor(r.verification[k])}`, borderRadius: '10px', padding: '1px 8px' }}>{k === 'title' ? 'Role' : k === 'organization' ? 'Organisation' : k === 'linkedin' ? 'LinkedIn' : 'Nationality'}: {r.verification[k]}</span>)}
          </div></>)}
        {card.videos.length > 0 && (<><div style={section}>Videos</div><div style={{ display: 'grid', gap: '2px', fontSize: '12.5px', color: 'var(--ink3)' }}>{card.videos.map(v => <div key={v.url}>{v.checked === 'watched' ? '✓ watched — person confirmed' : v.checked === 'named' ? '• name + role in the text only' : '• added by you'}{v.date ? ` · ${v.date}` : ''}{v.duration ? ` · ${v.duration}` : ''}</div>)}</div></>)}
        {r && r.sources.length > 0 && (<><div style={section}>Sources{r.pipeline ? <span style={{ textTransform: 'none', fontWeight: 600 }}> — read {r.pipeline.pages_read} page{r.pipeline.pages_read === 1 ? '' : 's'} in {r.pipeline.rounds} round{r.pipeline.rounds === 1 ? '' : 's'}; {r.pipeline.reports.filter(x => x.about === 'yes').length} confirmed it is them</span> : null}</div><div style={{ display: 'grid', gap: '2px' }}>{r.sources.slice(0, 8).map(s => <a key={s.url} href={s.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '12.5px', color: 'var(--teal)', overflowWrap: 'anywhere' }}>{(s.title || s.url).slice(0, 70)}{s.gave && s.gave.length ? <span style={{ color: 'var(--ink4)' }}> · gave {s.gave.join(', ')}</span> : null} ↗</a>)}</div></>)}
        {r && r.bio_removed.length > 0 && <details style={{ marginTop: '8px', fontSize: '12.5px', color: 'var(--ink3)' }}><summary style={{ cursor: 'pointer' }}>{r.bio_removed.length} bio sentence{r.bio_removed.length === 1 ? '' : 's'} removed (not supported)</summary><ul style={{ paddingLeft: '18px', listStyle: 'disc' }}>{r.bio_removed.map((x, i) => <li key={i}>{x}</li>)}</ul></details>}
        <div style={section}>{cand.raw.manual ? 'You entered' : 'From the sheet'}</div>
        <div style={{ fontSize: '12.5px', color: 'var(--ink3)', lineHeight: 1.5 }}>{[cand.input.name, cand.input.designation, cand.input.company, cand.input.country].filter(Boolean).join(' · ')}{cand.raw.extra.length > 0 && <div>Notes in the sheet: {cand.raw.extra.join(' · ')}</div>}{cand.input.extra && <div>Extra information supplied: {cand.input.extra.length} characters</div>}</div>
        {canEdit && (<>
          <div style={section}>Producer notes</div>
          <Textarea value={notes} rows={2} onChange={e => setNotes(e.target.value)} onBlur={() => { if (notes !== (cand.producer_notes ?? '')) void patch({ producer_notes: notes }, 'notes') }} placeholder="Only visible to the team" />

          <div style={section}>Give the research more to work with <span style={{ textTransform: 'none', fontWeight: 600 }}>— it reads all three boxes</span></div>
          <div ref={dropRef} style={{ display: 'grid', gap: '12px' }}>
            <div>
              <div style={boxLabel}>1 · LinkedIn profile</div>
              <div style={boxHelp}>Open their LinkedIn profile, press Ctrl+A then Ctrl+C, and paste it here, just like pasting into Word. Only the speaker’s own profile and picture are kept; suggested people, logos and your own photo are left out.</div>
              <div ref={el => {
                richRef.current = el
                if (el && !richReady.current) { richReady.current = true; el.innerHTML = cand.input.extra_html ? richPaste(cand.input.extra_html, cand.input.name).html : (cand.input.extra ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br>') }
              }}
                contentEditable={!inProgress} suppressContentEditableWarning role="textbox" aria-label="LinkedIn profile text" data-placeholder="Paste the LinkedIn profile here"
                onPaste={handleRichPaste} onInput={() => setInp(p => ({ ...p, extra: readRich().text }))} onBlur={saveRich}
                style={{ minHeight: '110px', maxHeight: '320px', overflowY: 'auto', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--ink)', fontSize: '13.5px', lineHeight: 1.5, outline: 'none', opacity: inProgress ? 0.6 : 1 }} className="sp-rich" />
              <style>{'.sp-rich:empty:before{content:attr(data-placeholder);color:var(--ink4)}.sp-rich img{max-width:110px;max-height:110px;border-radius:8px;display:block;margin:6px 0;border:1px solid var(--border)}.sp-rich h1,.sp-rich h2,.sp-rich h3{font-size:14px;font-weight:800;margin:8px 0 2px}.sp-rich ul,.sp-rich ol{padding-left:20px;list-style:revert}.sp-rich a{color:var(--teal)}'}</style>
              {linkedinWarning && <div style={{ fontSize: '12.5px', color: 'var(--amber-text, var(--ink2))', border: '1px solid var(--amber, var(--border))', borderRadius: '8px', padding: '6px 10px', marginTop: '6px' }}>{linkedinWarning}</div>}
              {paste && (
                <div style={{ marginTop: '6px', padding: '8px 10px', border: '1px solid var(--teal)', borderRadius: '8px', background: 'var(--card)', fontSize: '12.5px', color: 'var(--ink2)', lineHeight: 1.5 }}>
                  <div style={{ fontWeight: 800, color: 'var(--teal-mid)' }}>✓ Pasted {paste.chars.toLocaleString('en-GB')} characters{paste.picture ? ' and the speaker’s picture' : ''}</div>
                  {paste.removed && <div>Left out “{paste.removed}” and everything after it ({paste.removedChars.toLocaleString('en-GB')} characters) — that part lists other people.</div>}
                  {paste.leftOut > 0 && <div>Left out {paste.leftOut} other picture{paste.leftOut === 1 ? '' : 's'} (logos, posts, other people, the logged-in person’s own photo).</div>}
                  {paste.picture && !paste.pictureSure && <div style={{ color: 'var(--ink3)' }}>The picture in the box is a profile photo that does not say whose it is — it could be the logged-in person’s. Check before using it.</div>}
                  {paste.picture && !card.photo_url && !paste.pictureSure && <button disabled={!!busy} onClick={() => void pickPastedPhoto(paste.picture!)} style={{ marginTop: '3px', border: 'none', background: 'none', color: 'var(--teal)', cursor: 'pointer', fontSize: '12.5px', fontFamily: 'inherit' }}>Use that picture as the photo</button>}
                  {paste.picture && card.photo_url && <div style={{ color: 'var(--ink3)' }}>This speaker already has a photo, so it was not replaced. Use “Upload photo” above to change it.</div>}
                  <button onClick={() => setPaste(null)} style={{ marginTop: '4px', border: 'none', background: 'none', color: 'var(--ink4)', cursor: 'pointer', fontSize: '12px', fontFamily: 'inherit' }}>Dismiss</button>
                </div>
              )}
              {inp.extra.trim() && <div style={boxHelp}>{inp.extra.length.toLocaleString('en-GB')} characters in this box.</div>}
            </div>

            <div>
              <div style={boxLabel}>2 · Links</div>
              <div style={boxHelp}>Any other website: an article, their company page, a conference page, a video. One link per line — paste the link, not the page. The research opens and reads each one.</div>
              <Textarea rows={3} value={inp.links} disabled={inProgress}
                onChange={e => setInp({ ...inp, links: e.target.value })}
                onBlur={() => void saveLinks()}
                placeholder={'https://…\nhttps://…'} />
              {linkLines.length > 0 && (
                <div style={{ display: 'grid', gap: '2px', marginTop: '4px', fontSize: '12.5px' }}>
                  {linkLines.map((l, i) => <div key={i} style={{ color: l.ok ? 'var(--teal-mid)' : 'var(--red)', overflowWrap: 'anywhere' }}>{l.ok ? '✓' : '✕'} {l.text}{l.note ? <span style={{ color: 'var(--ink3)' }}> — {l.note}</span> : null}</div>)}
                </div>
              )}
            </div>

            <div>
              <div style={boxLabel}>3 · Files</div>
              <div style={boxHelp}>As many as you like (up to 10): a headshot, a screenshot, a PDF, a Word or PowerPoint file, a bio. A headshot becomes their photo; everything else is read for the research.</div>
              <div onDrop={e => { e.preventDefault(); void dropFiles(e.dataTransfer.files) }} onDragOver={e => e.preventDefault()}
                style={{ border: '1.5px dashed var(--border)', borderRadius: '10px', padding: '12px', textAlign: 'center', fontSize: '13px', color: 'var(--ink3)' }}>
                {fileStatus ?? 'Drop files here, paste an image, or'} {!fileStatus && <Button variant="ghost" disabled={inProgress || !!busy} onClick={() => filePick.current?.click()}>Choose files</Button>}
                <input ref={filePick} type="file" multiple accept="image/jpeg,image/png,image/webp,.pdf,.docx,.pptx,.txt,.md" style={{ display: 'none' }} onChange={e => { const f = e.target.files; if (f?.length) void dropFiles(f); e.target.value = '' }} />
              </div>
              {(cand.input.files ?? []).length > 0 && (
                <div style={{ display: 'grid', gap: '3px', marginTop: '6px', fontSize: '12.5px' }}>
                  {(cand.input.files ?? []).map(f => (
                    <div key={f.id} style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', color: f.kind === 'ignored' ? 'var(--ink3)' : 'var(--ink2)' }}>
                      <span style={{ fontWeight: 700, overflowWrap: 'anywhere' }}>{f.name}</span>
                      <span style={{ color: f.kind === 'ignored' ? 'var(--red)' : 'var(--teal-mid)' }}>{f.kind === 'photo' ? '✓ used as the speaker’s photo' : f.kind === 'text' ? `✓ read — ${f.chars.toLocaleString('en-GB')} characters` : `✕ not used — ${f.note ?? 'nothing usable in it'}`}</span>
                      <button disabled={!!busy || inProgress} onClick={() => void removeFile(f.id)} style={{ border: 'none', background: 'none', color: 'var(--ink4)', cursor: 'pointer', fontSize: '12px', fontFamily: 'inherit' }}>Remove</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div style={{ marginTop: '10px', display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
            {!again && <Button variant="teal" disabled={inProgress || !!busy} onClick={() => void research()}>{busy === 'research' ? 'Starting…' : cand.status === 'researched' ? 'Research again' : cand.status === 'error' ? 'Try again' : 'Start research'}</Button>}
            {!again && r?.previous && <Button variant="ghost" disabled={inProgress || !!busy} title="Put the card and findings back to how they were before the last re-run." onClick={() => void undoRerun()}>Undo last re-run</Button>}
            {!again && <Button variant="ghost" disabled={inProgress || !!busy} onClick={() => setAgain(true)}>Edit details</Button>}
            {!again && <button onClick={() => void removeSpeaker()} disabled={inProgress} style={{ border: 'none', background: 'none', color: 'var(--red)', cursor: 'pointer', fontSize: '12.5px', fontFamily: 'inherit' }}>Remove from drop</button>}
          </div>
          {again && (
            <div style={{ display: 'grid', gap: '6px', marginTop: '8px' }}>
              <div style={{ fontSize: '12.5px', color: 'var(--ink3)', lineHeight: 1.5 }}>Correct anything the sheet got wrong. Whatever is in the LinkedIn, Links and Files boxes above is used too.</div>
              <Input value={inp.name} onChange={e => setInp({ ...inp, name: e.target.value })} placeholder="Name" /><Input value={inp.designation} onChange={e => setInp({ ...inp, designation: e.target.value })} placeholder="Job title" />
              <Input value={inp.company} onChange={e => setInp({ ...inp, company: e.target.value })} placeholder="Company / organisation" /><Input value={inp.website} onChange={e => setInp({ ...inp, website: e.target.value })} placeholder="Company website" />
              <CountryPicker value={inp.country} onChange={c => setInp({ ...inp, country: c })} placeholder="Nationality — type to search" />
              <Input value={inp.linkedin} onChange={e => setInp({ ...inp, linkedin: e.target.value })} placeholder="LinkedIn profile link" />
              <div style={{ display: 'flex', gap: '8px' }}><Button variant="teal" disabled={busy === 'research' || inProgress} onClick={() => void research()}>{cand.status === 'researched' ? 'Save and research again' : 'Save and start research'}</Button><Button variant="ghost" onClick={() => setAgain(false)}>Cancel</Button>{cand.status === 'researched' && <Button variant="ghost" disabled={busy === 'research' || inProgress} title="Throw away what was read and search from scratch. Normally a re-run re-uses the pages already read and only adds what you dropped." onClick={() => void research(true)}>Start over (search again)</Button>}</div>
            </div>
          )}
        </>)}
      </div>
    </div>
  )
}

/* ── step 3: the client link, then track ─────────────────────────────────── */
// WPS cannot be reached by email: the drop gets ONE open link, the producer passes it on themselves, and nobody on the client side is identified.
function SendStep({ batchId, shared, reviewers, ready, approved, rejected, canEdit, onChanged }: { batchId: string; shared: boolean; reviewers: Reviewer[]; ready: number; approved: number; rejected: number; canEdit: boolean; onChanged: () => Promise<void> }) {
  const [busy, setBusy] = useState(false)
  const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : null)
  const [copied, setCopied] = useState<string | null>(null)
  async function copy(link: string, id: string) {
    try { await navigator.clipboard.writeText(link) } catch {
      const t = document.createElement('textarea'); t.value = link; document.body.appendChild(t); t.select(); try { document.execCommand('copy') } catch { /* the field next to the button can still be copied by hand */ } t.remove()
    }
    setCopied(id); notify('Link copied to clipboard — paste it into your chat with the client.')
    setTimeout(() => setCopied(c => (c === id ? null : c)), 2500)
  }
  const open = reviewers.find(r => r.email === OPEN_LINK_EMAIL)
  const older = reviewers.filter(r => r.email !== OPEN_LINK_EMAIL) // drops shared by email before the open link existed keep working
  async function create() {
    setBusy(true)
    const x = await call(`/api/events/speaker-proposals/batches/${batchId}/share`, 'POST', { action: 'open_link' })
    setBusy(false)
    if (!x.ok) { notify(String(x.data.error ?? 'That did not work.'), 'error'); return }
    await onChanged()
    if (typeof x.data.link === 'string') await copy(x.data.link, 'new')
  }
  const row = (r: Reviewer, label: string) => (
    <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: '10px 14px', flexWrap: 'wrap', fontSize: '13.5px', color: 'var(--ink2)' }}>
      <span style={{ fontWeight: 700 }}>{label}</span>
      <input readOnly value={r.link} onFocus={e => e.currentTarget.select()} aria-label="Client link" style={{ flex: 1, minWidth: '260px', fontSize: '13px', padding: '6px 8px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--ink2)' }} />
      <span style={{ color: r.last_opened_at ? 'var(--teal)' : 'var(--ink4)', fontSize: '12.5px' }}>{r.last_opened_at ? `Opened ${when(r.last_opened_at)}` : 'Not opened yet'}</span>
      <Button variant={copied === r.id || copied === 'new' ? 'teal' : 'lime'} onClick={() => void copy(r.link, r.id)}>{copied === r.id || copied === 'new' ? '✓ Link copied' : 'Copy link'}</Button>
      {canEdit && <Button variant="red" disabled={busy} onClick={async () => {
        if (!window.confirm('Stop sharing? This link stops working; decisions already made stay.')) return
        setBusy(true); await call(`/api/events/speaker-proposals/batches/${batchId}/share`, 'POST', { action: 'remove', reviewer_id: r.id }); setBusy(false); await onChanged()
      }}>Stop sharing</Button>}
    </div>
  )
  return (
    <div style={{ maxWidth: '980px' }}>
      <div style={{ padding: '16px 18px', border: '1px solid var(--border-light)', borderRadius: '12px', background: 'var(--card)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <div style={{ fontSize: '17px', fontWeight: 800, color: 'var(--ink)' }}>Client link</div>
          {shared ? <Badge color="teal">Shared</Badge> : <Badge color="grey">Not shared yet</Badge>}
          <span style={{ fontSize: '13.5px', color: 'var(--ink3)', flex: 1 }}>{shared ? `${approved} approved · ${rejected} rejected · ${Math.max(ready - approved - rejected, 0)} awaiting. The client sees only speakers marked Ready, so more can be added on the same link.` : `${ready} Ready speaker${ready === 1 ? '' : 's'} will be shared. No email is sent: you get one open link to pass on yourself.`}</span>
        </div>
        <div style={{ fontSize: '13.5px', color: 'var(--ink2)', marginTop: '10px' }}>Anyone who has the link can approve, reject or comment, and nobody is asked who they are. The first decision on a speaker is final unless it is changed from the same link.</div>
        <div style={{ marginTop: '14px', display: 'grid', gap: '8px' }}>
          {open ? row(open, 'Client link') : canEdit ? <div><Button variant="lime" disabled={busy || ready === 0} onClick={() => void create()}>{busy ? 'Creating…' : 'Create client link'}</Button></div> : <div style={{ fontSize: '13.5px', color: 'var(--ink3)' }}>No link has been created yet.</div>}
          {older.map(r => row(r, r.name))}
        </div>
      </div>
    </div>
  )
}
