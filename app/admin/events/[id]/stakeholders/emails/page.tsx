'use client'

import { use, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import PageHeader from '@/app/components/PageHeader'
import { Badge, Button, Input } from '@/app/components/ui'
import { useBreadcrumbLabel } from '@/app/lib/nav/breadcrumb-labels'
import { notify } from '@/app/lib/ui/notify'
import { renderSpeakerEmail } from '@/app/lib/speaker-emails/render'
import { applyTokens, personValues } from '@/app/lib/emails/templates'
import { formatSendTime } from '@/app/lib/emails/schedule'

/* Emails (2026-11-12) — the landing page of the Emails module: every email written, scheduled or sent, like HubSpot's email list. Filter by status, event and umbrella, search by name
   or subject, open one to see what it said, who got it and what happened (and to continue it, duplicate it, follow up on the people who did not reply, or export it). */

type Campaign = {
  id: string; name: string; subject: string; status: string; event_id: string; event_name: string | null; umbrella_name: string | null; recipient_count: number
  created_by_name: string | null; owner_name: string | null; created_at: string; sent_at: string | null; scheduled_for: string | null; timezone: string | null; pace_hours: number | null
  counts: Record<string, number>
}
type Detail = {
  campaign: { id: string; name: string; subject: string; body_html: string; status: string; sender_mode: string; polished: boolean; attachments: { name: string }[]; event_id: string; pace_hours: number | null }
  progress: { status: string; total: number; sent: number; failed: number; skipped: number; queued: number; sending: number } | null
  schedule: { scheduled_for: string; timezone: string | null; send_at_local: string | null; owner_name: string | null; fields: { key: string; label: string; kind: string; value: string }[]; missing: string[] } | null
  recipients: { id: string; contact_id: string | null; bounce_kind: 'hard' | 'soft' | null; stop_requested: boolean; name: string; to_email: string; cc_emails: string[]; mode: string; sender_name: string | null; status: string; skip_reason: string | null; error: string | null; sent_at: string | null; reply_type: string }[]
}

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—')
const STATUS_COLOR: Record<string, 'teal' | 'amber' | 'red' | 'grey' | 'purple'> = { draft: 'grey', scheduled: 'purple', sending: 'amber', sent: 'teal', cancelled: 'grey', failed: 'red', skipped: 'amber', queued: 'grey' }
const REPLY_LABEL: Record<string, string> = { reply: 'replied', bounce: 'bounced', auto_reply: 'auto-reply' }
const STATUSES = ['draft', 'scheduled', 'sending', 'sent', 'cancelled']
const sel: React.CSSProperties = { padding: '9px 10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--ink)', fontSize: '13px' }
const stat: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: '1px', minWidth: '58px', fontSize: '12px', color: 'var(--ink3)' }

export default function EmailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = use(params)
  const router = useRouter()
  const openParam = useSearchParams().get('open')
  const base = `/admin/events/${eventId}/stakeholders/emails`
  const [eventName, setEventName] = useState<string | null>(null)
  useBreadcrumbLabel(eventId, eventName)
  const [scope, setScope] = useState<'event' | 'all'>('event')
  const [status, setStatus] = useState('')
  const [filterEvent, setFilterEvent] = useState('')
  const [umbrella, setUmbrella] = useState('')
  const [q, setQ] = useState('')
  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null)
  const [events, setEvents] = useState<{ id: string; name: string }[]>([])
  const [umbrellas, setUmbrellas] = useState<{ id: string; name: string }[]>([])
  const [openId, setOpenId] = useState<string | null>(openParam)
  const [detail, setDetail] = useState<Detail | null>(null)
  const [busy, setBusy] = useState(false)
  const [sched, setSched] = useState<{ send_at_local: string; fields: Record<string, string> }>({ send_at_local: '', fields: {} })
  const [legacy, setLegacy] = useState<{ id: string; speaker: string; subject: string | null; to: string; from: string; status: 'sent' | 'failed'; error: string | null; sent_at: string }[]>([])
  const [showLegacy, setShowLegacy] = useState(false)

  const load = useCallback(async () => {
    const p = new URLSearchParams({ event_id: eventId, scope })
    if (status) p.set('status', status); if (filterEvent) p.set('filter_event_id', filterEvent); if (umbrella) p.set('umbrella_id', umbrella); if (q.trim()) p.set('q', q.trim())
    const r = await fetch(`/api/events/stakeholders/email-campaigns?${p}`)
    const d = await r.json().catch(() => ({}))
    if (r.ok) { setCampaigns(d.campaigns ?? []); setEvents(d.events ?? []); setUmbrellas(d.umbrellas ?? []) } else setCampaigns([])
  }, [eventId, scope, status, filterEvent, umbrella, q])
  const loadDetail = useCallback(async (id: string) => {
    const r = await fetch(`/api/events/stakeholders/email-campaigns/${id}`)
    setDetail(r.ok ? await r.json() : null)
  }, [])

  useEffect(() => { const t = setTimeout(() => { void load() }, q ? 250 : 0); return () => clearTimeout(t) }, [load, q])
  useEffect(() => {
    fetch(`/api/events?id=${eventId}`).then(r => r.json()).then(d => setEventName((Array.isArray(d) ? d[0] : d)?.name ?? null)).catch(() => {})
    fetch(`/api/events/stakeholders/speaker-emails/history?event_id=${eventId}`).then(r => r.json()).then(d => setLegacy(d.rows ?? [])).catch(() => {})
  }, [eventId])
  // eslint-disable-next-line react-hooks/set-state-in-effect -- load the opened email
  useEffect(() => { if (openId) void loadDetail(openId); else setDetail(null) }, [openId, loadDetail])
  // eslint-disable-next-line react-hooks/set-state-in-effect -- seed the edit boxes when a scheduled email is opened
  useEffect(() => { if (detail?.schedule) setSched({ send_at_local: detail.schedule.send_at_local ?? '', fields: Object.fromEntries(detail.schedule.fields.map(f => [f.key, f.value])) }) }, [detail?.schedule])

  const act = async (fn: () => Promise<void>) => { setBusy(true); try { await fn() } finally { setBusy(false) } }
  const post = async (url: string, body?: unknown) => { const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); return { ok: r.ok, d: await r.json().catch(() => ({})) } }

  const cont = () => act(async () => {
    if (!openId) return
    for (let guard = 0; guard < 400; guard++) {
      const { ok, d } = await post(`/api/events/stakeholders/email-campaigns/${openId}/send`)
      if (!ok) { notify(d.error ?? 'Sending stopped.', 'error'); break }
      await loadDetail(openId)
      if (!d.progress || (d.progress.queued === 0 && d.progress.sending === 0)) break
    }
    void load()
  })
  const cancel = () => act(async () => {
    if (!openId) return
    const { ok } = await post(`/api/events/stakeholders/email-campaigns/${openId}/cancel`)
    notify(ok ? 'Cancelled. What was already sent stays sent.' : 'Could not cancel.', ok ? 'success' : 'error')
    await loadDetail(openId); void load()
  })
  const saveSchedule = () => act(async () => {
    if (!openId || !detail?.schedule) return
    const r = await fetch(`/api/events/stakeholders/email-campaigns/${openId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ field_values: sched.fields, send_at_local: sched.send_at_local || undefined }) })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { notify(d.error ?? 'Could not save.', 'error'); return }
    notify(d.released ? 'Saved. Everything is in place and the time has passed, so it is being sent now.' : 'Saved.', 'success')
    await loadDetail(openId); void load()
    if (d.released) void cont()
  })
  const checkReplies = () => act(async () => {
    if (!openId) return
    const { ok, d } = await post(`/api/events/stakeholders/email-campaigns/${openId}/replies`)
    if (!ok) { notify(d.error ?? 'Could not read the mailbox.', 'error'); return }
    const x = d.result
    notify(x.problems?.length ? `Could not read: ${x.problems[0]}` : `Checked ${x.messages} messages: ${x.replies} replies, ${x.bounces_hard + x.bounces_soft} bounces, ${x.auto_replies} auto-replies${x.stop_requests ? `, ${x.stop_requests} asking to stop` : ''}.`, x.problems?.length ? 'error' : 'success')
    await loadDetail(openId); void load()
  })
  const duplicate = () => act(async () => {
    if (!openId) return
    const { ok, d } = await post(`/api/events/stakeholders/email-campaigns/${openId}/duplicate`)
    if (!ok) { notify(d.error ?? 'Could not duplicate.', 'error'); return }
    router.push(`${base}/compose?draft=${d.id}`)
  })
  const followUp = () => act(async () => {
    if (!openId) return
    const { ok, d } = await post(`/api/events/stakeholders/email-campaigns/${openId}/follow-up`)
    if (!ok) { notify(d.error ?? 'Could not make the follow-up.', 'error'); return }
    notify(`A draft follow-up for ${d.people} ${d.people === 1 ? 'person' : 'people'} who have not replied is ready to edit.`, 'success')
    router.push(`${base}/compose?draft=${d.draft_id}`)
  })
  const deleteDraft = () => act(async () => {
    if (!openId) return
    const r = await fetch(`/api/events/stakeholders/email-campaigns/${openId}`, { method: 'DELETE' })
    notify(r.ok ? 'Draft deleted.' : 'Could not delete it.', r.ok ? 'success' : 'error')
    if (r.ok) { setOpenId(null); void load() }
  })
  const confirmStop = async (contactId: string) => {
    const { ok, d } = await post('/api/events/stakeholders/email-people/do-not-email', { contact_id: contactId, on: true, reason: 'asked_to_stop', from_reply: true })
    notify(ok ? 'Marked do not email. They will be left out of every list.' : d.error ?? 'Could not save.', ok ? 'success' : 'error')
  }

  const quietCount = detail ? detail.recipients.filter(r => r.status === 'sent' && r.reply_type === 'none' && !r.stop_requested).length : 0

  return (
    <div>
      <PageHeader
        eyebrow="Stakeholder Hub"
        title="Emails"
        description="Every email written, scheduled or sent to speakers. Open one to see who got it and what happened, or create a new one."
        backHref={`/admin/events/${eventId}/stakeholders`}
        backLabel="Back to Stakeholder Hub"
      />
      <div style={{ padding: '4px 32px 56px', maxWidth: '1100px', display: 'grid', gap: '12px' }}>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ display: 'flex', borderRadius: '8px', border: '1px solid var(--border)', overflow: 'hidden' }}>
            {([['event', 'This event'], ['all', 'All my events']] as const).map(([k, l]) => (
              <button key={k} type="button" onClick={() => { setScope(k); setFilterEvent(''); setUmbrella('') }} style={{ padding: '8px 14px', border: 'none', fontSize: '13px', fontWeight: 700, cursor: 'pointer', background: scope === k ? 'var(--teal-mid)' : 'var(--card)', color: scope === k ? 'var(--card)' : 'var(--ink2)' }}>{l}</button>
            ))}
          </div>
          <select value={status} onChange={e => setStatus(e.target.value)} style={sel} aria-label="Status"><option value="">All statuses</option>{STATUSES.map(s => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}</select>
          {scope === 'all' && <select value={filterEvent} onChange={e => setFilterEvent(e.target.value)} style={sel} aria-label="Event"><option value="">Any event</option>{events.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select>}
          {scope === 'all' && umbrellas.length > 0 && <select value={umbrella} onChange={e => setUmbrella(e.target.value)} style={sel} aria-label="Umbrella"><option value="">Any umbrella</option>{umbrellas.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select>}
          <div style={{ flex: '1 1 220px', maxWidth: '320px' }}><Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search by name or subject…" /></div>
        </div>

        {campaigns === null && <div style={{ color: 'var(--ink3)', fontSize: '13px' }}>Loading…</div>}
        {campaigns && campaigns.length === 0 && (
          <div style={{ padding: '28px', borderRadius: '14px', border: '1px solid var(--border)', background: 'var(--card)', fontSize: '14px', color: 'var(--ink2)', lineHeight: 1.7 }}>
            No emails match. <Link href={`${base}/compose`} style={{ color: 'var(--teal-mid)', fontWeight: 700 }}>Create your first email</Link>, or <Link href={`${base}/lists`} style={{ color: 'var(--teal-mid)', fontWeight: 700 }}>build a list</Link> to send it to.
          </div>
        )}

        {(campaigns ?? []).map(c => {
          const open = openId === c.id
          const isDraft = c.status === 'draft', isScheduled = c.status === 'scheduled'
          const sent = c.counts.sent ?? 0, failed = c.counts.failed ?? 0, skipped = c.counts.skipped ?? 0, queued = (c.counts.queued ?? 0) + (c.counts.sending ?? 0)
          return (
            <div key={c.id} style={{ borderRadius: '14px', border: '1px solid var(--border)', background: 'var(--card)', padding: '14px 18px' }}>
              <button type="button" onClick={() => setOpenId(open ? null : c.id)} aria-expanded={open} style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', gap: '14px', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap' }}>
                <div style={{ minWidth: 0, flex: '1 1 320px' }}>
                  <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--ink)' }}>{c.name} <Badge color={STATUS_COLOR[c.status] ?? 'grey'}>{c.status}</Badge>{c.pace_hours && c.status === 'sending' ? <Badge color="amber">spread over {c.pace_hours}h</Badge> : null}</div>
                  <div style={{ fontSize: '12.5px', color: 'var(--ink3)', marginTop: '3px', overflowWrap: 'anywhere' }}>{c.subject || <em>No subject yet</em>}</div>
                  <div style={{ fontSize: '12px', color: 'var(--ink3)', marginTop: '3px' }}>
                    {c.event_name}{c.umbrella_name ? ` · ${c.umbrella_name}` : ''} · {isScheduled && c.scheduled_for ? `scheduled for ${formatSendTime(c.scheduled_for, c.timezone)}` : isDraft ? `edited ${when(c.created_at)}` : when(c.sent_at ?? c.created_at)}{c.owner_name || c.created_by_name ? ` · ${c.owner_name ?? c.created_by_name}` : ''}
                  </div>
                </div>
                {!isDraft && (
                  <div style={{ display: 'flex', gap: '14px' }}>
                    <div style={stat}><strong style={{ fontSize: '16px', color: 'var(--ink)' }}>{isScheduled ? `~${c.recipient_count}` : c.recipient_count}</strong>people</div>
                    <div style={stat}><strong style={{ fontSize: '16px', color: 'var(--ink)' }}>{sent}</strong>sent</div>
                    {failed > 0 && <div style={stat}><strong style={{ fontSize: '16px', color: 'var(--red)' }}>{failed}</strong>failed</div>}
                    {skipped > 0 && <div style={stat}><strong style={{ fontSize: '16px', color: 'var(--amber)' }}>{skipped}</strong>skipped</div>}
                    {(c.counts.reply_bounce ?? 0) > 0 && <div style={stat}><strong style={{ fontSize: '16px', color: 'var(--red)' }}>{c.counts.reply_bounce}</strong>bounced</div>}
                    {(c.counts.reply_reply ?? 0) > 0 && <div style={stat}><strong style={{ fontSize: '16px', color: 'var(--ink)' }}>{c.counts.reply_reply}</strong>replied</div>}
                    {(c.counts.reply_auto_reply ?? 0) > 0 && <div style={stat}><strong style={{ fontSize: '16px', color: 'var(--ink)' }}>{c.counts.reply_auto_reply}</strong>auto-reply</div>}
                    {(c.counts.stop_requested ?? 0) > 0 && <div style={stat}><strong style={{ fontSize: '16px', color: 'var(--amber)' }}>{c.counts.stop_requested}</strong>asked to stop</div>}
                    {queued > 0 && <div style={stat}><strong style={{ fontSize: '16px', color: 'var(--ink)' }}>{queued}</strong>waiting</div>}
                  </div>
                )}
              </button>

              {open && detail && detail.campaign.id === c.id && (
                <div style={{ marginTop: '14px', paddingTop: '14px', borderTop: '1px solid var(--border-light)' }}>
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
                    {isDraft && <><Link href={`${base}/compose?draft=${c.id}`}><Button variant="teal">Continue editing</Button></Link><Button variant="ghost" onClick={deleteDraft} disabled={busy}>Delete draft</Button></>}
                    {!isDraft && detail.progress && (detail.progress.queued > 0 || detail.progress.sending > 0) && detail.campaign.status === 'sending' && !detail.campaign.pace_hours && (
                      <><Button variant="teal" onClick={cont} disabled={busy}>{busy ? 'Sending…' : `Continue sending (${detail.progress.queued + detail.progress.sending} waiting)`}</Button><Button variant="ghost" onClick={cancel} disabled={busy}>Cancel the rest</Button></>
                    )}
                    {detail.campaign.status === 'sending' && detail.campaign.pace_hours && <Button variant="ghost" onClick={cancel} disabled={busy}>Cancel the rest</Button>}
                    {!isDraft && !isScheduled && <Button variant="ghost" onClick={checkReplies} disabled={busy}>{busy ? 'Checking…' : 'Check for replies'}</Button>}
                    {!isDraft && <Button variant="ghost" onClick={duplicate} disabled={busy}>Duplicate</Button>}
                    {(c.status === 'sent' || c.status === 'sending') && quietCount > 0 && <Button variant="ghost" onClick={followUp} disabled={busy}>Follow up with the {quietCount} who have not replied</Button>}
                    {!isDraft && <a href={`/api/events/stakeholders/email-campaigns/${c.id}/export`} style={{ textDecoration: 'none' }}><Button variant="ghost">Export CSV</Button></a>}
                    <span style={{ fontSize: '12.5px', color: 'var(--ink3)' }}>
                      {detail.campaign.sender_mode === 'me' ? 'Sent from the producer who sent it' : 'Sent from each speaker’s own producer'}{detail.campaign.polished ? ' · Polished' : ''}{detail.campaign.attachments?.length ? ` · ${detail.campaign.attachments.length} attachment(s)` : ''}
                    </span>
                  </div>

                  {detail.schedule && (
                    <div style={{ marginBottom: '14px', padding: '12px 14px', borderRadius: '10px', background: 'var(--surface)', border: `1px solid ${detail.schedule.missing.length ? 'var(--amber)' : 'var(--border)'}` }}>
                      <div style={{ fontSize: '13.5px', color: 'var(--ink)', lineHeight: 1.7 }}>
                        <strong>Scheduled for {formatSendTime(detail.schedule.scheduled_for, detail.schedule.timezone)}</strong>{detail.schedule.owner_name ? ` · owner: ${detail.schedule.owner_name}` : ''}<br />
                        The list is worked out again at that moment (about {c.recipient_count} people now).
                        {detail.schedule.missing.length > 0 && <> <strong style={{ color: 'var(--amber)' }}>Waiting for: {detail.schedule.missing.join(', ')}. It will not be sent without it; once you add it after the send time it goes out straight away.</strong></>}
                      </div>
                      <div style={{ display: 'grid', gap: '8px', marginTop: '10px' }}>
                        {detail.schedule.fields.map(f => (
                          <div key={f.key}>
                            <div style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--ink3)', marginBottom: '4px' }}>{f.label}{f.kind === 'url' ? ' (a full link starting with https://)' : ''}</div>
                            <Input value={sched.fields[f.key] ?? ''} onChange={e => setSched(v => ({ ...v, fields: { ...v.fields, [f.key]: e.target.value } }))} placeholder={f.kind === 'url' ? 'https://…' : ''} />
                          </div>
                        ))}
                        <div>
                          <div style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--ink3)', marginBottom: '4px' }}>Send at ({detail.schedule.timezone ?? 'UTC'} time)</div>
                          <input type="datetime-local" value={sched.send_at_local} onChange={e => setSched(v => ({ ...v, send_at_local: e.target.value }))} style={{ ...sel, fontSize: '14px' }} />
                        </div>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}><Button variant="teal" onClick={saveSchedule} disabled={busy}>Save</Button><Button variant="ghost" onClick={cancel} disabled={busy}>Cancel this email</Button></div>
                      </div>
                    </div>
                  )}

                  {!isDraft && (
                    <>
                      <div style={{ fontSize: '12px', fontWeight: 800, letterSpacing: '0.5px', textTransform: 'uppercase', color: 'var(--ink3)', marginBottom: '6px' }}>The email</div>
                      <iframe title="What was sent" sandbox="" srcDoc={renderSpeakerEmail({ bodyHtml: applyTokens(detail.campaign.body_html, personValues(detail.recipients[0]?.name ?? 'Speaker name')), publicName: detail.recipients[0]?.name ?? 'Speaker name', producerName: detail.recipients[0]?.sender_name ?? 'The sender' })} style={{ width: '100%', height: '260px', border: '1px solid var(--border)', borderRadius: '10px', background: 'white' }} />
                    </>
                  )}

                  {!detail.schedule && !isDraft && (
                    <>
                      <div style={{ fontSize: '12px', fontWeight: 800, letterSpacing: '0.5px', textTransform: 'uppercase', color: 'var(--ink3)', margin: '16px 0 6px' }}>People ({detail.recipients.length})</div>
                      <div style={{ maxHeight: '380px', overflowY: 'auto' }}>
                        {detail.recipients.map(r => (
                          <div key={r.id} style={{ display: 'flex', gap: '10px', alignItems: 'baseline', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--border-light)', flexWrap: 'wrap' }}>
                            <div style={{ minWidth: 0, flex: '1 1 280px' }}>
                              <span style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--ink)' }}>{r.name}</span>
                              <span style={{ fontSize: '12.5px', color: 'var(--ink3)' }}> · {r.to_email}{r.cc_emails.length ? ` · cc ${r.cc_emails.length}` : ''}{r.mode === 'assistant' ? ' · via additional contact' : ''}</span>
                              {(r.error || r.skip_reason) && <div style={{ fontSize: '12px', color: r.error ? 'var(--red)' : 'var(--amber)', marginTop: '2px', overflowWrap: 'anywhere' }}>{r.error ?? r.skip_reason}</div>}
                            </div>
                            <div style={{ fontSize: '12px', color: 'var(--ink3)', display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                              {r.reply_type !== 'none' && <Badge color={r.reply_type === 'bounce' ? (r.bounce_kind === 'hard' ? 'red' : 'amber') : r.reply_type === 'reply' ? 'purple' : 'grey'}>{r.reply_type === 'bounce' ? `bounced (${r.bounce_kind === 'hard' ? 'bad address' : 'temporary'})` : REPLY_LABEL[r.reply_type]}</Badge>}
                              {r.stop_requested && r.contact_id && <Button variant="ghost" onClick={() => confirmStop(r.contact_id!)}>Asked to stop: confirm do not email</Button>}
                              <Badge color={STATUS_COLOR[r.status] ?? 'grey'}>{r.status}</Badge> {r.sent_at ? when(r.sent_at) : ''}
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          )
        })}

        {legacy.length > 0 && scope === 'event' && (
          <div style={{ borderRadius: '14px', border: '1px solid var(--border)', background: 'var(--card)', padding: '14px 18px' }}>
            <button type="button" onClick={() => setShowLegacy(v => !v)} aria-expanded={showLegacy} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: '14px', fontWeight: 800, color: 'var(--ink)' }}>
              Earlier sends from the old Speaker Emails page ({legacy.length}) {showLegacy ? '▾' : '▸'}
            </button>
            {showLegacy && (
              <div style={{ marginTop: '10px', maxHeight: '420px', overflowY: 'auto' }}>
                {legacy.map(r => (
                  <div key={r.id} style={{ display: 'flex', gap: '10px', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--border-light)', flexWrap: 'wrap' }}>
                    <div style={{ minWidth: 0, flex: '1 1 300px', fontSize: '13px', color: 'var(--ink)' }}>
                      <strong>{r.speaker}</strong> <span style={{ color: 'var(--ink3)' }}>· {r.to} · from {r.from}{r.subject ? ` · ${r.subject}` : ''}</span>
                      {r.error && <div style={{ fontSize: '12px', color: 'var(--red)' }}>{r.error}</div>}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--ink3)' }}><Badge color={r.status === 'sent' ? 'teal' : 'red'}>{r.status}</Badge> {when(r.sent_at)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
