'use client'

import { use, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import PageHeader from '@/app/components/PageHeader'
import ExtraCcField from '@/app/components/ExtraCcField'
import CountryPicker, { countryNameOf } from '@/app/components/proposals/CountryPicker'
import { ClientGallery, type GalleryData, type GalleryItem } from '@/app/components/proposals/ClientGallery'
import { Badge, Button, Input, Textarea } from '@/app/components/ui'
import { notify } from '@/app/lib/ui/notify'
import { permissionSetSatisfies } from '@/app/lib/access/permission-match'
import { useBreadcrumbLabel } from '@/app/lib/nav/breadcrumb-labels'
import { parseExtraCc } from '@/app/lib/email/extra-cc'
import { countryCode, flagPath } from '@/app/lib/proposals/countries'

/* One drop (batch) of proposed speakers, as a three-step flow with a floating bar that always shows where you are and what comes next:
     1 Review speakers   — add speakers (Excel or typed), research them, check each card, mark it Ready or Exclude it
     2 Preview           — exactly what the client will see (the very same screen, read-only)
     3 Send to client    — reviewers, optional Cc and note, send; afterwards track the answers
   On every card the LEFT side is the clean card the client sees; the RIGHT side is internal findings and never reaches the client. */

type Video = { url: string; title: string; channel: string | null; date: string | null; duration: string | null; thumbnail: string | null; checked: 'watched' | 'named' | null; evidence: string | null }
type Card = { name: string; title: string | null; organization: string | null; nationality_iso2: string | null; linkedin_url: string | null; bio: string | null; videos: Video[]; photo_url: string | null; logo_url: string | null; website_url: string | null }
type Agreement = 'match' | 'differs' | 'unknown'
type Internal = {
  status: 'verified' | 'needs_review' | 'not_found'; concerns: string[]; footprint_note: string | null; sources: { url: string; title: string }[]
  verification: { pass2_identified: boolean | null; title: Agreement; organization: Agreement; nationality: Agreement; linkedin: Agreement }
  bio_removed: string[]; photo_candidates: { url: string; page_url: string | null; title: string }[]; logo_candidates: { url: string; page_url: string | null; title: string }[]; linkedin_note: string | null
}
type Input = { name: string; designation: string | null; company: string | null; country: string | null; linkedin: string | null; website?: string | null; extra?: string | null; track_text: string }
type Candidate = {
  id: string; position: number; raw: { cells: Record<string, string>; extra: string[]; manual?: boolean }; input: Input
  track_id: string | null; status: 'new' | 'queued' | 'researching' | 'researched' | 'error'; research: Internal | null; card: Card; review_state: 'pending' | 'ready' | 'excluded'; producer_notes: string | null; error: string | null; researched_at: string | null
  client_decision: { decision: 'approved' | 'rejected'; reviewer_name: string; decided_at: string } | null; client_comments: { id: string; reviewer_name: string; body: string; created_at: string }[]
}
type Reviewer = { id: string; name: string; email: string; link: string; notified_at: string | null; last_opened_at: string | null; reminder_count: number }
type Track = { id: string; name: string; day_label: string | null; stage: string | null; time_label: string | null }
type Filter = 'all' | 'attention' | 'ready' | 'excluded' | 'unresearched' | 'approved' | 'rejected' | 'awaiting'

const words = (s: string | null | undefined) => (s ?? '').trim().split(/\s+/).filter(Boolean).length
const trackLabel = (t: Track | undefined) => (t ? [t.day_label, t.stage, t.time_label, t.name].filter(Boolean).join(' · ') : null)
const needsAttention = (c: Candidate) => c.status === 'error' || (c.status === 'researched' && c.review_state === 'pending' && (c.research?.status !== 'verified' || !c.card.photo_url))
const section: React.CSSProperties = { fontSize: '11.5px', fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--ink3)', margin: '12px 0 4px' }
const STYLES = `
  @keyframes spSpin { to { transform: rotate(360deg); } }
  .sp-spin { width: 16px; height: 16px; border: 2px solid var(--border); border-top-color: var(--teal); border-radius: 50%; animation: spSpin 0.9s linear infinite; display: inline-block; flex-shrink: 0; }
  @keyframes spPulse { 0%, 100% { box-shadow: 0 0 0 0 var(--teal); } 50% { box-shadow: 0 0 0 6px transparent; } }
  .sp-pulse { animation: spPulse 1.6s ease-in-out infinite; border-radius: 8px; }
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
  const [previous, setPrevious] = useState<{ name: string; email: string }[]>([])
  const [sender, setSender] = useState<{ name: string; email: string | null }>({ name: '', email: null })
  const [loadError, setLoadError] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [step, setStep] = useState<1 | 2 | 3 | null>(null)
  const [starting, setStarting] = useState(false)
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
    setPrevious((r.d.previous_reviewers as { name: string; email: string }[]) ?? []); setSender((r.d.sender as { name: string; email: string | null }) ?? { name: '', email: null })
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
  useEffect(() => {
    if (!working) return
    const t = setInterval(() => void load(), 3500)
    return () => clearInterval(t)
  }, [working, load])

  async function startAll() {
    setStarting(true)
    const x = await call(`/api/events/speaker-proposals/batches/${batchId}/research`, 'POST', {})
    setStarting(false)
    if (!x.ok) { notify(String(x.data.error ?? 'Could not start the research.'), 'error'); return }
    notify(`Researching ${x.data.queued} speaker${x.data.queued === 1 ? '' : 's'} — you can leave this page; it keeps going.`)
    await load()
  }

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
  const shared = reviewers.length > 0
  const chip = (f: Filter, label: string, n: number) => (
    <button key={f} onClick={() => setFilter(f)} style={{ padding: '6px 12px', borderRadius: '16px', border: `1px solid ${filter === f ? 'var(--teal)' : 'var(--border)'}`, background: 'transparent', color: filter === f ? 'var(--teal-mid)' : 'var(--ink3)', fontWeight: 700, fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit' }}>{label} ({n})</button>
  )

  // ── the floating step bar ───────────────────────────────────────────────
  const steps: { n: 1 | 2 | 3; label: string; done: boolean; enabled: boolean }[] = [
    { n: 1, label: 'Review speakers', done: allActioned && counts.ready > 0, enabled: true },
    { n: 2, label: 'Preview client view', done: step > 2 || shared, enabled: counts.ready > 0 },
    { n: 3, label: 'Send to client', done: shared, enabled: counts.ready > 0 },
  ]
  const nextHint = step === 1
    ? (counts.ready === 0 ? 'Mark speakers Ready to continue' : allActioned ? 'All speakers are actioned — next: preview what the client will see' : `${candidates.length - actioned} speaker${candidates.length - actioned === 1 ? '' : 's'} still need a decision (Ready or Exclude)`)
    : step === 2 ? 'This is exactly what the client will see — next: choose who gets it' : shared ? 'Sent — track the answers below' : 'Add the reviewers and send the links'
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
          <div style={{ fontSize: '13px', color: 'var(--ink3)' }}>{nextHint}</div>
          {step > 1 && <Button variant="ghost" onClick={() => { setStep((step - 1) as 1 | 2); window.scrollTo({ top: 0 }) }}>← Back</Button>}
          {primary && <span className={primary.highlight ? 'sp-pulse' : undefined}><Button variant={primary.highlight ? 'lime' : 'ghost'} disabled={primary.disabled} onClick={() => { setStep(primary.go); window.scrollTo({ top: 0 }) }}>{primary.label}</Button></span>}
        </div>
        <div style={{ fontSize: '12.5px', color: 'var(--ink3)', marginTop: '6px' }}>
          {candidates.length} speaker{candidates.length === 1 ? '' : 's'} · {counts.done} researched · <strong style={{ color: 'var(--ink2)' }}>{counts.ready} ready</strong> · {counts.excluded} excluded{working ? ` · researching ${counts.active + counts.queued}…` : ''}{shared ? ` · ${counts.approved} approved · ${counts.rejected} rejected · ${counts.awaiting} awaiting the client` : ''}
        </div>
      </div>

      <div style={{ padding: '20px 32px 60px' }}>
        {step === 1 && (<>
          {canEdit && <AddSpeakers batchId={batchId} tracks={tracks} empty={candidates.length === 0} onChanged={load} />}
          {candidates.length > 0 && (<>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '12px' }}>
              <div style={{ fontSize: '15px', color: 'var(--ink2)' }}>{counts.attention > 0 && <span style={{ color: 'var(--amber)', fontWeight: 700 }}>{counts.attention} need your attention</span>}</div>
              <div style={{ flex: 1 }} />
              {canEdit && notStarted > 0 && !working && <Button variant="teal" onClick={() => void startAll()} disabled={starting}>{`Research ${notStarted} speaker${notStarted === 1 ? '' : 's'}`}</Button>}
            </div>
            {working && (
              <div style={{ marginBottom: '14px', padding: '12px 14px', border: '1px solid var(--border-light)', borderRadius: '10px', background: 'var(--card)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '14px', color: 'var(--ink2)', marginBottom: '6px' }}><span className="sp-spin" />Researching… {counts.done} done, {counts.active} in progress, {counts.queued} waiting. You can close this tab; it keeps going.</div>
                <div style={{ height: '6px', borderRadius: '3px', background: 'var(--border-light)' }}><div style={{ height: '6px', borderRadius: '3px', background: 'var(--teal)', width: `${candidates.length ? (100 * counts.done) / candidates.length : 0}%`, transition: 'width 0.3s' }} /></div>
              </div>
            )}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '18px' }}>
              {chip('all', 'All', candidates.length)}{chip('attention', 'Needs attention', counts.attention)}{chip('unresearched', 'Not researched', candidates.length - counts.done)}{chip('ready', 'Ready', counts.ready)}{chip('excluded', 'Excluded', counts.excluded)}
              {shared && <>{chip('awaiting', 'Awaiting client', counts.awaiting)}{chip('approved', 'Client approved', counts.approved)}{chip('rejected', 'Client rejected', counts.rejected)}</>}
            </div>
            <div style={{ display: 'grid', gap: '18px' }}>
              {shown.map(c => <CandidateRow key={`${c.id}-${c.researched_at ?? ''}`} cand={c} track={tracks.find(t => t.id === c.track_id)} tracks={tracks} canEdit={canEdit} onChanged={load} />)}
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

        {step === 3 && <SendStep batchId={batchId} reviewers={reviewers} previous={previous} sender={sender} ready={counts.ready} approved={counts.approved} rejected={counts.rejected} canEdit={canEdit} onChanged={load} />}
      </div>
    </div>
  )
}

/* ── adding speakers ─────────────────────────────────────────────────────── */
function AddSpeakers({ batchId, tracks, empty, onChanged }: { batchId: string; tracks: Track[]; empty: boolean; onChanged: () => Promise<void> }) {
  const blank = { name: '', designation: '', company: '', website: '', country: null as string | null, linkedin: '', track_id: '', extra: '' }
  const [open, setOpen] = useState(empty)
  const [f, setF] = useState(blank)
  const [busy, setBusy] = useState(false)
  const file = useRef<HTMLInputElement>(null)

  async function add(start: boolean) {
    if (!f.name.trim()) { notify('Type the speaker’s name first.', 'error'); return }
    setBusy(true)
    const x = await call(`/api/events/speaker-proposals/batches/${batchId}/candidates`, 'POST', { speaker: { ...f, country: f.country ? countryNameOf(f.country) : '' }, start })
    setBusy(false)
    if (!x.ok) { notify(String(x.data.error ?? 'Could not add the speaker.'), 'error'); return }
    notify(start ? `${f.name.trim()} added — researching…` : `${f.name.trim()} added.`)
    setF(blank); await onChanged()
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
        <span style={{ fontSize: '13.5px', color: 'var(--ink3)', flex: 1 }}>Upload a spreadsheet, or type speakers in one by one — whichever is quicker. Research starts only when you press it.</span>
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
          <div><label style={label}>Anything else you know (optional)</label>
            <Textarea rows={3} value={f.extra} onChange={e => setF({ ...f, extra: e.target.value })} placeholder="Paste text from their LinkedIn profile, a bio, or links to pages about them. The research treats this as trusted information." /></div>
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
function CandidateRow({ cand, track, tracks, canEdit, onChanged }: { cand: Candidate; track: Track | undefined; tracks: Track[]; canEdit: boolean; onChanged: () => Promise<void> }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<Card>(cand.card)
  const [notes, setNotes] = useState(cand.producer_notes ?? '')
  const [again, setAgain] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [newVideo, setNewVideo] = useState('')
  const [assetUrl, setAssetUrl] = useState('')
  const photoFile = useRef<HTMLInputElement>(null)
  const logoFile = useRef<HTMLInputElement>(null)
  const [inp, setInp] = useState({ name: cand.input.name, designation: cand.input.designation ?? '', company: cand.input.company ?? '', website: cand.input.website ?? cand.card.website_url ?? '', country: countryCode(cand.input.country), linkedin: cand.input.linkedin ?? '', extra: cand.input.extra ?? '' })
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
  async function setAsset(kind: 'photo' | 'logo', url?: string, file?: File) {
    setBusy(kind)
    let res: Response
    if (file) { const f = new FormData(); f.set('kind', kind); f.set('file', file); res = await fetch(`/api/events/speaker-proposals/candidates/${cand.id}/asset`, { method: 'POST', body: f }) }
    else res = await fetch(`/api/events/speaker-proposals/candidates/${cand.id}/asset`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, url }) })
    const d = await res.json().catch(() => ({}))
    setBusy(null)
    if (!res.ok) { notify(d.error ?? 'Could not set that.', 'error'); return }
    setDraft(prev => ({ ...prev, [kind === 'logo' ? 'logo_url' : 'photo_url']: d.url })); setAssetUrl('')
    await onChanged()
  }
  async function removeAsset(kind: 'photo' | 'logo') {
    if (!window.confirm(`Remove this ${kind}? You can add another one afterwards.`)) return
    const ok = await patch({ card: { [kind === 'logo' ? 'logo_url' : 'photo_url']: null } }, `rm-${kind}`)
    if (ok) setDraft(prev => ({ ...prev, [kind === 'logo' ? 'logo_url' : 'photo_url']: null }))
  }
  async function research() {
    if (cand.status === 'researched' && !window.confirm('Research this speaker again? It replaces the card and any edits you made to it.')) return
    setBusy('research')
    const x = await call(`/api/events/speaker-proposals/candidates/${cand.id}/research`, 'POST', { input: { ...inp, country: inp.country ? countryNameOf(inp.country) : '' } })
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
  async function removeSpeaker() {
    if (!window.confirm(`Remove ${card.name} from this drop?`)) return
    const x = await call(`/api/events/speaker-proposals/candidates/${cand.id}`, 'DELETE')
    if (!x.ok) { notify(String(x.data.error ?? 'Could not remove.'), 'error'); return }
    await onChanged()
  }

  async function dropFiles(files: FileList | File[]) {
    const imgs = [...files].filter(f => f.type.startsWith('image/'))
    if (!imgs.length) { notify('Only images can be dropped here. Paste text straight into the box.', 'error'); return }
    setBusy('drop')
    for (const f of imgs.slice(0, 3)) {
      const form = new FormData(); form.set('file', f)
      const res = await fetch(`/api/events/speaker-proposals/candidates/${cand.id}/drop`, { method: 'POST', body: form })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { notify(d.error ?? 'Could not read that image.', 'error'); continue }
      if (d.kind === 'portrait') notify('Photo added. It is now this speaker’s photo.')
      else if (d.kind === 'document') { setInp(p => ({ ...p, extra: d.extra })); notify('Read the text in that image and added it to the box. Press Research again to use it.') }
      else notify(d.note ?? 'That does not look like a photo of the speaker or a page of text.', 'error')
    }
    setBusy(null); await onChanged()
  }

  const statusBadge = cand.status === 'new' ? <Badge color="grey">Not researched</Badge> : cand.status === 'queued' ? <Badge color="grey">Waiting</Badge> : cand.status === 'researching' ? <Badge color="amber">Researching…</Badge> : cand.status === 'error' ? <Badge color="red">Failed</Badge>
    : r?.status === 'verified' ? <Badge color="teal">Verified</Badge> : r?.status === 'needs_review' ? <Badge color="amber">Needs review</Badge> : <Badge color="red">Not found</Badge>
  const chipColor = (a: Agreement) => (a === 'match' ? 'var(--teal-mid)' : a === 'differs' ? 'var(--red)' : 'var(--ink4)')
  const flag = flagPath(card.nationality_iso2)

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.25fr) minmax(0, 1fr)', border: '1px solid var(--border)', borderRadius: '14px', overflow: 'hidden', background: 'var(--card)', opacity: dim ? 0.55 : 1 }}>
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
        {inProgress && <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '14px', color: 'var(--ink2)', padding: '10px 12px', background: 'var(--card)', borderRadius: '8px' }}><span className="sp-spin" />{cand.status === 'queued' ? 'Waiting to be researched…' : 'Researching this speaker…'} <span style={{ color: 'var(--ink4)' }}>It keeps going if you close this tab.</span></div>}
        {cand.status === 'new' && !again && <div style={{ fontSize: '13.5px', color: 'var(--ink2)', lineHeight: 1.5 }}>Not researched yet. The card shows what you entered. Press <strong>Start research</strong> to find the profile, bio, videos, photo and logo — or mark it Ready as it is.</div>}
        {cand.status === 'error' && <div style={{ fontSize: '13.5px', color: 'var(--red)' }}>Research failed: {cand.error ?? 'unknown error'}</div>}
        {r?.footprint_note && <div style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--ink)', background: 'var(--card)', border: '1px solid var(--amber)', borderRadius: '8px', padding: '8px 10px', lineHeight: 1.45 }}>{r.footprint_note}</div>}
        {r && r.concerns.length > 0 && (<><div style={section}>Check these</div><ul style={{ margin: 0, paddingLeft: '18px', listStyle: 'disc', fontSize: '13px', color: 'var(--ink2)', lineHeight: 1.5 }}>{r.concerns.map((x, i) => <li key={i}>{x}</li>)}</ul></>)}
        {r && r.status !== 'not_found' && (<><div style={section}>Second check (independent)</div>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', fontSize: '12.5px', fontWeight: 700 }}>
            {(['title', 'organization', 'nationality', 'linkedin'] as const).map(k => <span key={k} style={{ color: chipColor(r.verification[k]), border: `1px solid ${chipColor(r.verification[k])}`, borderRadius: '10px', padding: '1px 8px' }}>{k === 'title' ? 'Role' : k === 'organization' ? 'Organisation' : k === 'linkedin' ? 'LinkedIn' : 'Nationality'}: {r.verification[k]}</span>)}
          </div></>)}
        {card.videos.length > 0 && (<><div style={section}>Videos</div><div style={{ display: 'grid', gap: '2px', fontSize: '12.5px', color: 'var(--ink3)' }}>{card.videos.map(v => <div key={v.url}>{v.checked === 'watched' ? '✓ watched — person confirmed' : v.checked === 'named' ? '• name + role in the text only' : '• added by you'}{v.date ? ` · ${v.date}` : ''}{v.duration ? ` · ${v.duration}` : ''}</div>)}</div></>)}
        {r && r.sources.length > 0 && (<><div style={section}>Sources</div><div style={{ display: 'grid', gap: '2px' }}>{r.sources.slice(0, 6).map(s => <a key={s.url} href={s.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '12.5px', color: 'var(--teal)', overflowWrap: 'anywhere' }}>{(s.title || s.url).slice(0, 80)} ↗</a>)}</div></>)}
        {r && r.bio_removed.length > 0 && <details style={{ marginTop: '8px', fontSize: '12.5px', color: 'var(--ink3)' }}><summary style={{ cursor: 'pointer' }}>{r.bio_removed.length} bio sentence{r.bio_removed.length === 1 ? '' : 's'} removed (not supported)</summary><ul style={{ paddingLeft: '18px', listStyle: 'disc' }}>{r.bio_removed.map((x, i) => <li key={i}>{x}</li>)}</ul></details>}
        <div style={section}>{cand.raw.manual ? 'You entered' : 'From the sheet'}</div>
        <div style={{ fontSize: '12.5px', color: 'var(--ink3)', lineHeight: 1.5 }}>{[cand.input.name, cand.input.designation, cand.input.company, cand.input.country].filter(Boolean).join(' · ')}{cand.raw.extra.length > 0 && <div>Notes in the sheet: {cand.raw.extra.join(' · ')}</div>}{cand.input.extra && <div>Extra information supplied: {cand.input.extra.length} characters</div>}</div>
        {canEdit && (<>
          <div style={section}>Producer notes</div>
          <Textarea value={notes} rows={2} onChange={e => setNotes(e.target.value)} onBlur={() => { if (notes !== (cand.producer_notes ?? '')) void patch({ producer_notes: notes }, 'notes') }} placeholder="Only visible to the team" />

          <div style={section}>Drop more info <span style={{ textTransform: 'none', fontWeight: 600 }}>— the research reads this</span></div>
          <Textarea rows={5} value={inp.extra} disabled={inProgress}
            onChange={e => setInp({ ...inp, extra: e.target.value })}
            onBlur={() => { if (inp.extra !== (cand.input.extra ?? '')) void patch({ extra: inp.extra }, 'extra') }}
            onPaste={e => { const files = [...e.clipboardData.files]; if (files.length) { e.preventDefault(); void dropFiles(files) } }}
            onDrop={e => { e.preventDefault(); void dropFiles(e.dataTransfer.files) }} onDragOver={e => e.preventDefault()}
            placeholder="Paste or drop anything here, no formatting needed: text copied from their LinkedIn page, a bio, notes, links to pages or videos, or an image (a photo of them, or a screenshot of a page)." />
          <div style={{ fontSize: '12px', color: 'var(--ink4)', lineHeight: 1.45, marginTop: '4px' }}>{busy === 'drop' ? 'Reading the image…' : 'Links are opened and read. A pasted photo of the speaker becomes their photo; a screenshot of text is read and added here. Then press the button below.'}</div>
          <div style={{ marginTop: '10px', display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
            {!again && <Button variant="teal" disabled={inProgress || !!busy} onClick={() => void research()}>{cand.status === 'researched' ? 'Research again' : cand.status === 'error' ? 'Try again' : 'Start research'}</Button>}
            {!again && <Button variant="ghost" disabled={inProgress || !!busy} onClick={() => setAgain(true)}>Edit details</Button>}
            {!again && <button onClick={() => void removeSpeaker()} disabled={inProgress} style={{ border: 'none', background: 'none', color: 'var(--red)', cursor: 'pointer', fontSize: '12.5px', fontFamily: 'inherit' }}>Remove from drop</button>}
          </div>
          {again && (
            <div style={{ display: 'grid', gap: '6px', marginTop: '8px' }}>
              <div style={{ fontSize: '12.5px', color: 'var(--ink3)', lineHeight: 1.5 }}>Correct anything the sheet got wrong. Whatever is in the “Drop more info” box above is used too.</div>
              <Input value={inp.name} onChange={e => setInp({ ...inp, name: e.target.value })} placeholder="Name" /><Input value={inp.designation} onChange={e => setInp({ ...inp, designation: e.target.value })} placeholder="Job title" />
              <Input value={inp.company} onChange={e => setInp({ ...inp, company: e.target.value })} placeholder="Company / organisation" /><Input value={inp.website} onChange={e => setInp({ ...inp, website: e.target.value })} placeholder="Company website" />
              <CountryPicker value={inp.country} onChange={c => setInp({ ...inp, country: c })} placeholder="Nationality — type to search" />
              <Input value={inp.linkedin} onChange={e => setInp({ ...inp, linkedin: e.target.value })} placeholder="LinkedIn profile link" />
              <div style={{ display: 'flex', gap: '8px' }}><Button variant="teal" disabled={busy === 'research' || inProgress} onClick={() => void research()}>{cand.status === 'researched' ? 'Save and research again' : 'Save and start research'}</Button><Button variant="ghost" onClick={() => setAgain(false)}>Cancel</Button></div>
            </div>
          )}
        </>)}
      </div>
    </div>
  )
}

/* ── step 3: send to the client, then track ──────────────────────────────── */
function SendStep({ batchId, reviewers, previous, sender, ready, approved, rejected, canEdit, onChanged }: { batchId: string; reviewers: Reviewer[]; previous: { name: string; email: string }[]; sender: { name: string; email: string | null }; ready: number; approved: number; rejected: number; canEdit: boolean; onChanged: () => Promise<void> }) {
  const blank = { name: '', email: '' }
  const [rows, setRows] = useState<{ name: string; email: string }[]>(() => (previous.length ? previous.slice(0, 3) : [blank, blank, blank]).map(r => ({ ...r })))
  const [message, setMessage] = useState('')
  const [ccText, setCcText] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const shared = reviewers.length > 0
  const extra = parseExtraCc(ccText)
  const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : null)

  async function send(body: Record<string, unknown>, label: string) {
    if ('error' in extra) { notify(extra.error, 'error'); return false }
    setBusy(label)
    const x = await call(`/api/events/speaker-proposals/batches/${batchId}/share`, 'POST', { ...body, extra_cc: extra.emails })
    setBusy(null)
    if (!x.ok) { notify(String(x.data.error ?? 'That did not work.'), 'error'); return false }
    const results = (x.data.results as { email: string; sent: boolean }[] | undefined) ?? []
    const failed = results.filter(r => !r.sent)
    if (failed.length) notify(`${results.length - failed.length} of ${results.length} emails sent. Not delivered: ${failed.map(f => f.email).join(', ')}. You can still copy each link below and send it yourself.`, 'error')
    else notify(results.length ? `Sent to ${results.length} reviewer${results.length === 1 ? '' : 's'}.` : 'Done.')
    await onChanged(); return true
  }
  const field: React.CSSProperties = { flex: 1, minWidth: '180px' }
  return (
    <div style={{ maxWidth: '980px' }}>
      <div style={{ padding: '16px 18px', border: '1px solid var(--border-light)', borderRadius: '12px', background: 'var(--card)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <div style={{ fontSize: '17px', fontWeight: 800, color: 'var(--ink)' }}>Send to the client</div>
          {shared ? <Badge color="teal">Sent</Badge> : <Badge color="grey">Not sent yet</Badge>}
          <span style={{ fontSize: '13.5px', color: 'var(--ink3)', flex: 1 }}>{shared ? `${approved} approved · ${rejected} rejected · ${Math.max(ready - approved - rejected, 0)} awaiting. Reviewers see only speakers marked Ready, so more can be added on the same links.` : `${ready} Ready speaker${ready === 1 ? '' : 's'} will be shared. Each reviewer gets a private link; a decision from any one of them settles that speaker.`}</span>
          {shared && canEdit && <Button variant="ghost" disabled={!!busy} onClick={() => void send({ resend: true }, 'update')}>Email everyone again</Button>}
        </div>

        <div style={{ fontSize: '13.5px', color: 'var(--ink2)', marginTop: '10px' }}>{sender.email ? <>Sent from your Outlook: <strong>{sender.name}</strong> &lt;{sender.email}&gt;, in one email thread per reviewer.</> : <>Your account has no Outlook mailbox, so emails go from the Trescon system sender.</>}</div>

        {!shared && canEdit && (
          <div style={{ marginTop: '14px', display: 'grid', gap: '8px' }}>
            <div style={section}>Reviewers (up to 6)</div>
            {rows.map((r, i) => (
              <div key={i} style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <div style={field}><Input value={r.name} onChange={e => setRows(rows.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)))} placeholder="Reviewer name" /></div>
                <div style={field}><Input value={r.email} onChange={e => setRows(rows.map((x, k) => (k === i ? { ...x, email: e.target.value } : x)))} placeholder="email@example.com" /></div>
              </div>
            ))}
            <div><Button variant="ghost" onClick={() => setRows([...rows, { ...blank }])} disabled={rows.length >= 6}>+ Add another reviewer</Button></div>
            <ExtraCcField value={ccText} onChange={setCcText} />
            <div><div style={section}>Optional note</div><Textarea value={message} rows={2} onChange={e => setMessage(e.target.value)} placeholder="Included in the email and at the top of the page" /></div>
            <div><Button variant="lime" disabled={!!busy || ready === 0 || 'error' in extra || rows.every(r => !r.email.trim())} onClick={() => void send({ reviewers: rows, message }, 'send')}>{busy === 'send' ? 'Sending…' : 'Send links'}</Button></div>
          </div>
        )}

        {shared && (
          <div style={{ marginTop: '14px', display: 'grid', gap: '8px' }}>
            {reviewers.map(r => (
              <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: '10px 14px', flexWrap: 'wrap', fontSize: '13.5px', color: 'var(--ink2)' }}>
                <span style={{ fontWeight: 700 }}>{r.name}</span><span style={{ color: 'var(--ink3)' }}>{r.email}</span>
                <span style={{ color: r.last_opened_at ? 'var(--teal)' : 'var(--ink4)', fontSize: '12.5px' }}>{r.last_opened_at ? `Opened ${when(r.last_opened_at)}` : 'Not opened yet'}{r.notified_at ? '' : ' · email not delivered'}{r.reminder_count ? ` · ${r.reminder_count} reminder${r.reminder_count === 1 ? '' : 's'}` : ''}</span>
                <span style={{ flex: 1 }} />
                <Button variant="ghost" onClick={() => { void navigator.clipboard.writeText(r.link); notify('Link copied.') }}>Copy link</Button>
                {canEdit && <Button variant="ghost" disabled={!!busy} onClick={() => void send({ action: 'remind', reviewer_id: r.id }, 'remind')}>Remind</Button>}
                {canEdit && <Button variant="red" disabled={!!busy} onClick={() => { if (window.confirm(`Remove ${r.name}? Their link stops working; decisions they made stay.`)) void send({ action: 'remove', reviewer_id: r.id }, 'remove') }}>Remove</Button>}
              </div>
            ))}
            {canEdit && <ExtraCcField value={ccText} onChange={setCcText} />}
            {canEdit && (adding ? (
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <div style={field}><Input value={rows[0].name} onChange={e => setRows([{ ...rows[0], name: e.target.value }])} placeholder="Reviewer name" /></div>
                <div style={field}><Input value={rows[0].email} onChange={e => setRows([{ ...rows[0], email: e.target.value }])} placeholder="email@example.com" /></div>
                <Button variant="lime" disabled={!!busy} onClick={async () => { if (await send({ reviewers: [rows[0]] }, 'add')) { setAdding(false); setRows([{ ...blank }]) } }}>Send link</Button>
                <Button variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
              </div>
            ) : <div><Button variant="ghost" disabled={reviewers.length >= 6} onClick={() => { setRows([{ ...blank }]); setAdding(true) }}>+ Add a reviewer</Button></div>)}
          </div>
        )}
      </div>
    </div>
  )
}
