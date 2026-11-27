'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/app/components/ui'

/* Session videos Step 7 (YouTube + approval) and Step 8 (publish). State and actions: /api/events/session-videos/[id]/publish (lib: app/lib/session-videos/publish.ts).
   The page owns the step cards; this file owns what is inside them, plus the hook that loads and polls the state. */

type Recipient = { id: string; name: string; email: string; status: string; comment: string | null; actioned_at: string | null; last_opened_at: string | null }
type Round = { id: string; status: string; sent_at: string; sent_by_name: string | null; resolved_at: string | null; resolved_by_name: string | null; message: string | null; current: boolean; recipients: Recipient[] }
type LayerState = { exempt: { at: string; by: string | null } | null; round: Round | null; satisfied: boolean }
type JobLite = { id: string; status: string; started_at: string | null; log: Array<{ at: string; line: string }> | null }
export type PublishState = {
  channel: { title: string; playlistId: string | null; playlistTitle: string | null } | null; channelError: string | null; metaError: string | null
  playlist: { id: string; title: string | null; source: 'session' | 'stage' | 'event' } | null; playlistMismatch: boolean
  youtube: { status: string | null; videoId: string | null; watchUrl: string | null; studioUrl: string | null; privacy: string | null; lockedPrivate: boolean; error: string | null
    uploadedAt: string | null; publishedAt: string | null; publishAt: string | null; uploaded: boolean; upToDate: boolean; needsReupload: boolean; playlistId: string | null; jobs: JobLite[] }
  internal: LayerState; client: LayerState; canSendClient: boolean; canPublish: boolean; published: boolean; scheduled: boolean
  staff: Array<{ id: string; name: string; email: string }>; defaultReviewerIds: string[]
  clientContacts: Array<{ id: string; name: string; email: string; is_primary: boolean }>
}

export function usePublishState(eventId: string, videoId: string | null, enabled: boolean) {
  const [st, setSt] = useState<PublishState | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const load = useCallback(async () => {
    if (!videoId) return
    const r = await fetch(`/api/events/session-videos/${videoId}/publish?event_id=${eventId}`, { cache: 'no-store' }).catch(() => null)
    const j = r ? await r.json().catch(() => ({})) : {}
    if (r?.ok) { setSt(j as PublishState); setErr(null) } else setErr((j as { error?: string }).error ?? 'Could not load the YouTube state.')
  }, [eventId, videoId])
  // eslint-disable-next-line react-hooks/set-state-in-effect -- initial load
  useEffect(() => { if (enabled) void load() }, [enabled, load])
  // Poll while something is happening elsewhere: an upload on the worker, or reviewers answering.
  const busy = st?.youtube.status === 'uploading' || st?.internal.round?.status === 'pending' || st?.client.round?.status === 'pending'
  useEffect(() => {
    if (!enabled || !busy) return
    const t = setInterval(() => { void load() }, st?.youtube.status === 'uploading' ? 4000 : 20000)
    return () => clearInterval(t)
  }, [enabled, busy, load, st?.youtube.status])
  const act = useCallback(async (body: Record<string, unknown>) => {
    const r = await fetch(`/api/events/session-videos/${videoId}/publish`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event_id: eventId, ...body }) })
    const j = await r.json().catch(() => ({}))
    await load()
    if (!r.ok) throw new Error((j as { error?: string }).error ?? 'Failed.')
    return j as Record<string, unknown>
  }, [eventId, videoId, load])
  return { st, err, load, act }
}

const STATUS: Record<string, string> = { pending: 'Waiting', approved: 'Approved', approved_with_comments: 'Approved with comments', changes_requested: 'Changes requested', withdrawn: 'Withdrawn' }
const TONE: Record<string, string> = { pending: 'var(--amber)', approved: 'var(--success)', approved_with_comments: 'var(--success)', changes_requested: 'var(--red)', withdrawn: 'var(--ink3)' }
const when = (s: string | null) => s ? new Date(s).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : ''
const box = { border: '1px solid var(--border-light)', borderRadius: 10, padding: '12px 14px', display: 'grid', gap: 10 } as const
const h = { fontSize: 13.5, fontWeight: 800 } as const
const note = { fontSize: 12.5, color: 'var(--ink3)', lineHeight: 1.55 } as const

/** Summary line for the Step 7 card header. */
export function approvalSummary(st: PublishState | null): string {
  if (!st) return 'Loading…'
  if (!st.youtube.uploaded) return st.youtube.status === 'uploading' ? 'Uploading to YouTube…' : 'Upload to YouTube (unlisted), then send for approval'
  if (!st.youtube.upToDate) return 'Changed since upload — update YouTube'
  const part = (l: LayerState, name: string) => l.exempt ? `${name}: not required` : l.satisfied ? `${name}: approved` : l.round?.status === 'pending' && l.round.current ? `${name}: waiting` : l.round?.status === 'changes_requested' && l.round.current ? `${name}: changes requested` : `${name}: to send`
  return `${part(st.internal, 'Internal')} · ${part(st.client, 'Client')}`
}

// ── Step 7 ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

export function ApprovalStep({ eventId, st, act }: { eventId: string; st: PublishState; act: (b: Record<string, unknown>) => Promise<Record<string, unknown>> }) {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const run = async (body: Record<string, unknown>, ok?: string) => {
    setBusy(true); setMsg(null)
    try { await act(body); if (ok) setMsg({ text: ok, ok: true }) } catch (e) { setMsg({ text: e instanceof Error ? e.message : 'Failed.', ok: false }) } finally { setBusy(false) }
  }
  const yt = st.youtube
  const uploadJob = yt.jobs[0]
  const pctLine = [...(uploadJob?.log ?? [])].reverse().find(l => /^Uploaded \d+%/.test(l.line))
  const pct = yt.status === 'uploading' ? (pctLine ? Number(pctLine.line.match(/\d+/)?.[0] ?? 0) : 0) : 0
  const lastLine = uploadJob?.log?.[uploadJob.log.length - 1]?.line ?? (uploadJob?.status === 'queued' ? 'Waiting for the video worker…' : 'Starting…')

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {msg && <div style={{ fontSize: 13, color: msg.ok ? 'var(--success)' : 'var(--red)' }}>{msg.text}</div>}

      {/* 1 — YouTube copy */}
      <div style={box}>
        <div style={h}>1 · On YouTube (unlisted)</div>
        {st.channelError ? (
          <div style={{ fontSize: 13, color: 'var(--amber)' }}>{st.channelError.replace('the event’s Integrations page', 'the YouTube tab')} <a href={`/admin/events/${eventId}/session-videos?tab=youtube`} style={{ color: 'var(--teal)', fontWeight: 700 }}>Open the YouTube tab</a></div>
        ) : (
          <>
            <div style={note}>Channel <strong>{st.channel?.title}</strong> · playlist {st.playlist ? <><strong>{st.playlist.title ?? st.playlist.id}</strong> ({st.playlist.source === 'session' ? 'set for this session' : st.playlist.source === 'stage' ? 'from its day and stage' : 'event fallback'})</> : <strong>none</strong>} (<a href={`/admin/events/${eventId}/session-videos?tab=youtube`} style={{ color: 'var(--teal)' }}>change in the YouTube tab</a>). Uploaded with the approved title, description, tags and thumbnail; it joins the playlist when it&apos;s published (an unlisted video in a public playlist would be visible).</div>
            {st.playlistMismatch && st.youtube.uploaded && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', fontSize: 12.5, color: 'var(--amber)' }}>The playlist mapping changed after it was published.<Button variant="ghost" disabled={busy} onClick={() => void run({ action: 'youtube_playlist' }, 'Added to the playlist.')}>Add it to “{st.playlist?.title}”</Button></div>}
            {st.metaError && <div style={{ fontSize: 12.5, color: 'var(--amber)' }}>{st.metaError}</div>}
            {yt.status === 'uploading' ? (
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}><strong>Uploading to YouTube — {pct}%</strong><span style={{ color: 'var(--ink3)' }}>{lastLine}</span></div>
                <div style={{ height: 8, borderRadius: 999, background: 'var(--border-light)', overflow: 'hidden' }}><div style={{ height: '100%', width: `${Math.max(2, pct)}%`, background: 'var(--teal-mid)', transition: 'width 1s linear' }} /></div>
                <div style={note}>You can leave this page — it keeps going.</div>
              </div>
            ) : yt.uploaded ? (
              <div style={{ display: 'grid', gap: 8 }}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: yt.upToDate ? 'var(--success)' : 'var(--amber)' }}>{yt.upToDate ? '✓ Up to date on YouTube' : '⚠ Changed since it was uploaded'}</span>
                  {yt.watchUrl && <Button variant="ghost" href={yt.watchUrl} target="_blank">Watch on YouTube</Button>}
                  {yt.studioUrl && <Button variant="ghost" href={yt.studioUrl} target="_blank">YouTube Studio</Button>}
                </div>
                {yt.lockedPrivate && <div style={{ fontSize: 12.5, color: 'var(--amber)' }}>YouTube is keeping this upload <strong>private</strong> (we asked for unlisted). That is expected until Google approves EventPilot&apos;s YouTube app. Reviewers watch it on the EventPilot review page instead, so approvals still work.</div>}
                {!yt.upToDate && <div><Button variant="teal" disabled={busy} onClick={() => void run({ action: 'youtube_sync' }, yt.needsReupload ? 'Uploading the new version…' : 'YouTube updated.')}>{yt.needsReupload ? 'Upload the new final' : 'Update on YouTube'}</Button>
                  <div style={{ ...note, marginTop: 6 }}>{yt.needsReupload ? 'The final video was rendered again. The new one replaces the unpublished upload.' : 'The title, description, tags or thumbnail changed. YouTube is updated in place.'} Approvals given for the old version no longer count.</div></div>}
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 6 }}>
                <div><Button variant="teal" disabled={busy || !!st.metaError} onClick={() => void run({ action: 'youtube_sync' }, 'Upload started.')}>Upload to YouTube (unlisted)</Button></div>
                <div style={note}>Unlisted = only people with the link can watch; it doesn&apos;t appear on the channel or in search until you publish (Step 8).</div>
              </div>
            )}
            {yt.error && yt.status !== 'uploading' && <div style={{ fontSize: 12.5, color: yt.status === 'failed' ? 'var(--red)' : 'var(--amber)' }}>{yt.error}</div>}
          </>
        )}
      </div>

      {/* 2 — Internal */}
      <LayerBox layer="internal" title="2 · Internal approval" st={st} busy={busy} run={run}
        rule="Everyone you pick must approve. Any “changes requested” stops the round."
        people={st.staff.map(s => ({ id: s.id, label: s.name, sub: s.email }))} defaults={st.defaultReviewerIds}
        emptyNote="No colleagues are assigned to this event yet." />

      {/* 3 — Client */}
      <LayerBox layer="client" title="3 · Client approval" st={st} busy={busy} run={run}
        rule="Sent to the client's approvers; the first one to answer settles it."
        people={st.clientContacts.map(c => ({ id: c.id, label: c.name + (c.is_primary ? ' (primary)' : ''), sub: c.email }))} defaults={st.clientContacts.map(c => c.id)}
        lockedNote={!st.canSendClient && !st.client.exempt ? (st.youtube.upToDate ? 'Opens once internal approval is done (or marked not required).' : 'Opens once the current version is on YouTube and internally approved.') : null}
        emptyNote={<>No client approval contacts for this event. Add them on the event&apos;s <a href={`/admin/events/${eventId}/integrations`} style={{ color: 'var(--teal)', fontWeight: 700 }}>Integrations</a> page, or mark client approval not required.</>} />
    </div>
  )
}

function LayerBox({ layer, title, rule, st, busy, run, people, defaults, emptyNote, lockedNote }: {
  layer: 'internal' | 'client'; title: string; rule: string; st: PublishState; busy: boolean
  run: (b: Record<string, unknown>, ok?: string) => Promise<void>
  people: Array<{ id: string; label: string; sub: string }>; defaults: string[]; emptyNote: React.ReactNode; lockedNote?: string | null
}) {
  const l = st[layer]
  const round = l.round
  const [picking, setPicking] = useState(false)
  const [ids, setIds] = useState<string[]>([])
  const [message, setMessage] = useState('')
  const [saveDefault, setSaveDefault] = useState(false)
  const canSend = layer === 'internal' ? st.youtube.upToDate : st.canSendClient
  const openPicker = () => { setIds(defaults.filter(d => people.some(p => p.id === d))); setMessage(''); setSaveDefault(layer === 'internal' && defaults.length === 0); setPicking(true) }
  const roundIsCurrent = !!round && round.current && st.youtube.upToDate
  const statusLine = l.exempt ? <span style={{ color: 'var(--teal)', fontWeight: 700 }}>Not required — marked by {l.exempt.by ?? 'a producer'}, {when(l.exempt.at)}</span>
    : l.satisfied ? <span style={{ color: 'var(--success)', fontWeight: 700 }}>✓ {STATUS[round!.status]}{round?.resolved_by_name ? ` by ${round.resolved_by_name}` : ''}</span>
    : round && roundIsCurrent ? <span style={{ color: TONE[round.status], fontWeight: 700 }}>{STATUS[round.status]}</span>
    : round && !roundIsCurrent ? <span style={{ color: 'var(--amber)', fontWeight: 700 }}>The last round was for an older version — send again</span>
    : <span style={{ color: 'var(--red)', fontWeight: 700 }}>Not sent yet</span>

  return (
    <div style={{ ...box, opacity: lockedNote ? 0.75 : 1 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={h}>{title}</div>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12.5, cursor: busy ? 'default' : 'pointer' }}>
          <input type="checkbox" checked={!!l.exempt} disabled={busy} onChange={e => void run({ action: 'exempt', layer, on: e.target.checked }, e.target.checked ? 'Marked not required.' : 'Approval required again.')} />
          Not required
        </label>
      </div>
      <div style={{ fontSize: 13 }}>{statusLine}</div>
      <div style={note}>{rule} You can mark it not required at any time — even while a round is out — to go ahead without it.</div>

      {round && (
        <div style={{ display: 'grid', gap: 4 }}>
          <div style={note}>Sent {when(round.sent_at)}{round.sent_by_name ? ` by ${round.sent_by_name}` : ''}{round.message ? ` — “${round.message}”` : ''}</div>
          {round.recipients.map(r => (
            <div key={r.id} style={{ fontSize: 12.5 }}>
              <strong>{r.name}</strong> <span style={{ color: 'var(--ink3)' }}>{r.email}</span> — <span style={{ color: TONE[r.status] ?? 'var(--ink3)', fontWeight: 700 }}>{STATUS[r.status] ?? r.status}</span>
              {r.status === 'pending' && r.last_opened_at ? <span style={{ color: 'var(--ink3)' }}> (opened {when(r.last_opened_at)})</span> : null}
              {r.comment ? <div style={{ margin: '2px 0 0 12px', color: 'var(--ink2)' }}>“{r.comment}”</div> : null}
            </div>
          ))}
        </div>
      )}

      {lockedNote ? <div style={note}>{lockedNote}</div> : !l.exempt && (
        picking ? (
          people.length === 0 ? <div style={note}>{emptyNote}</div> : (
            <div style={{ display: 'grid', gap: 8 }}>
              <div style={{ display: 'grid', gap: 4, maxHeight: 220, overflow: 'auto' }}>
                {people.map(p => (
                  <label key={p.id} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, cursor: 'pointer' }}>
                    <input type="checkbox" checked={ids.includes(p.id)} onChange={e => setIds(prev => e.target.checked ? [...prev, p.id] : prev.filter(x => x !== p.id))} />
                    <span><strong>{p.label}</strong> <span style={{ color: 'var(--ink3)' }}>{p.sub}</span></span>
                  </label>
                ))}
              </div>
              <textarea value={message} onChange={e => setMessage(e.target.value)} placeholder="Optional note for the email" rows={2}
                style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border-light)', background: 'var(--surface)', color: 'var(--ink1)', fontFamily: 'inherit', fontSize: 13 }} />
              {layer === 'internal' && <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12.5 }}><input type="checkbox" checked={saveDefault} onChange={e => setSaveDefault(e.target.checked)} />Save these as this event&apos;s default reviewers</label>}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Button variant="teal" disabled={busy || ids.length === 0} onClick={() => void run({ action: 'send_round', layer, ids, message, save_default: saveDefault }, `Sent to ${ids.length} ${ids.length === 1 ? 'person' : 'people'}.`).then(() => setPicking(false))}>Send for approval ({ids.length})</Button>
                <Button variant="ghost" disabled={busy} onClick={() => setPicking(false)}>Cancel</Button>
              </div>
              {round?.status === 'pending' && <div style={note}>Sending again replaces the round that is out (its links stop working).</div>}
            </div>
          )
        ) : (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {!l.satisfied && <Button variant={round && roundIsCurrent && round.status === 'pending' ? 'ghost' : 'teal'} disabled={busy || !canSend} onClick={openPicker}>{round ? 'Send again…' : 'Choose people & send…'}</Button>}
            {round?.status === 'pending' && <Button variant="ghost" disabled={busy} onClick={() => void run({ action: 'withdraw', layer }, 'Withdrawn.')}>Withdraw</Button>}
          </div>
        )
      )}
    </div>
  )
}

// ── Step 8 ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

export function PublishStep({ st, act }: { st: PublishState; act: (b: Record<string, unknown>) => Promise<Record<string, unknown>> }) {
  const [mode, setMode] = useState<'now' | 'schedule'>('now')
  const [at, setAt] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const run = async (body: Record<string, unknown>, ok: string) => {
    setBusy(true); setMsg(null)
    try { await act(body); setMsg({ text: ok, ok: true }); setConfirm(false) } catch (e) { setMsg({ text: e instanceof Error ? e.message : 'Failed.', ok: false }) } finally { setBusy(false) }
  }
  const yt = st.youtube
  if (st.published) return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--success)' }}>✓ Public on YouTube{yt.publishedAt ? ` since ${when(yt.publishedAt)}` : ''}</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{yt.watchUrl && <Button variant="teal" href={yt.watchUrl} target="_blank">Watch on YouTube</Button>}{yt.studioUrl && <Button variant="ghost" href={yt.studioUrl} target="_blank">YouTube Studio</Button>}</div>
    </div>
  )
  if (st.scheduled) return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--success)' }}>✓ Scheduled — goes public {when(yt.publishAt)}</div>
      {msg && <div style={{ fontSize: 13, color: msg.ok ? 'var(--success)' : 'var(--red)' }}>{msg.text}</div>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {yt.studioUrl && <Button variant="ghost" href={yt.studioUrl} target="_blank">YouTube Studio</Button>}
        <Button variant="ghost" disabled={busy} onClick={() => void run({ action: 'unschedule' }, 'Schedule cancelled — back to unlisted.')}>Cancel the schedule</Button>
        <Button variant="ghost" disabled={busy} onClick={() => void run({ action: 'youtube_refresh' }, 'Checked YouTube.')}>Check if it&apos;s live</Button>
      </div>
    </div>
  )
  const missing = [
    !yt.uploaded && 'Upload it to YouTube (Step 7).',
    yt.uploaded && !yt.upToDate && 'Update YouTube with the latest changes (Step 7).',
    !st.internal.satisfied && 'Internal approval (or mark it not required).',
    !st.client.satisfied && 'Client approval (or mark it not required).',
  ].filter(Boolean) as string[]
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {missing.length > 0 ? (
        <div style={{ display: 'grid', gap: 4 }}><div style={{ fontSize: 13, fontWeight: 700 }}>Before publishing:</div>{missing.map(m => <div key={m} style={{ fontSize: 13, color: 'var(--red)' }}>• {m}</div>)}</div>
      ) : (
        <>
          {yt.lockedPrivate && <div style={{ fontSize: 12.5, color: 'var(--amber)' }}>YouTube is keeping API uploads private until Google approves EventPilot&apos;s app, so publishing from here will be refused for now. Until then, open the video in YouTube Studio and set it to Public there.</div>}
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 13 }}>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="radio" checked={mode === 'now'} onChange={() => setMode('now')} />Publish now (public)</label>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="radio" checked={mode === 'schedule'} onChange={() => setMode('schedule')} />Schedule</label>
            {mode === 'schedule' && <input type="datetime-local" value={at} onChange={e => setAt(e.target.value)} style={{ padding: '6px 8px', borderRadius: 8, border: '1px solid var(--border-light)', background: 'var(--surface)', color: 'var(--ink1)', fontFamily: 'inherit' }} />}
          </div>
          {!confirm ? (
            <div><Button variant="lime" disabled={busy || (mode === 'schedule' && !at)} onClick={() => setConfirm(true)}>{mode === 'now' ? 'Publish on YouTube…' : 'Schedule on YouTube…'}</Button></div>
          ) : (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: 13 }}>{mode === 'now' ? 'Make this video public on YouTube now? Subscribers may be notified.' : `Schedule it to go public ${at ? new Date(at).toLocaleString() : ''}?`}</span>
              <Button variant="lime" disabled={busy} onClick={() => void run({ action: 'publish', publish_at: mode === 'schedule' ? new Date(at).toISOString() : null }, mode === 'now' ? 'Published.' : 'Scheduled.')}>{busy ? 'Working…' : 'Yes, go ahead'}</Button>
              <Button variant="ghost" disabled={busy} onClick={() => setConfirm(false)}>Cancel</Button>
            </div>
          )}
        </>
      )}
      {msg && <div style={{ fontSize: 13, color: msg.ok ? 'var(--success)' : 'var(--red)' }}>{msg.text}</div>}
    </div>
  )
}
