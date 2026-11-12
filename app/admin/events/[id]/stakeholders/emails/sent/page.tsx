'use client'

import { use, useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import PageHeader from '@/app/components/PageHeader'
import { Badge, Button, Card } from '@/app/components/ui'
import { useBreadcrumbLabel } from '@/app/lib/nav/breadcrumb-labels'
import { notify } from '@/app/lib/ui/notify'
import { renderSpeakerEmail } from '@/app/lib/speaker-emails/render'
import { applyTokens, personValues } from '@/app/lib/emails/templates'
import { formatSendTime } from '@/app/lib/emails/schedule'
import { Input } from '@/app/components/ui'
import EmailsTabs from '../EmailsTabs'

/* Emails → Sent (2026-11-12, phase 2). Every email sent from this event as a named record: its subject, content, sender, the numbers (sent / failed / skipped, and later bounced
   and replied) and one row per person. An email that is still sending can be continued or cancelled. Sends made on the older Speaker Emails page show underneath, read-only. */

type Campaign = {
  id: string; name: string; subject: string; status: string; recipient_count: number; created_by_name: string | null; created_at: string; sent_at: string | null; sender_mode: string; polished: boolean; scheduled_for: string | null; timezone: string | null
  counts: Record<string, number>
}
type Detail = {
  campaign: { id: string; name: string; subject: string; body_html: string; status: string; sender_mode: string; polished: boolean; attachments: { name: string }[]; created_at: string; sent_at: string | null; allow_assistant: boolean }
  progress: { status: string; total: number; sent: number; failed: number; skipped: number; queued: number; sending: number } | null
  schedule: { scheduled_for: string; timezone: string | null; send_at_local: string | null; owner_name: string | null; fields: { key: string; label: string; kind: string; value: string }[]; missing: string[] } | null
  recipients: { id: string; contact_id: string | null; bounce_kind: 'hard' | 'soft' | null; stop_requested: boolean; name: string; to_email: string; cc_emails: string[]; mode: string; sender_name: string | null; status: string; skip_reason: string | null; error: string | null; sent_at: string | null; reply_type: string }[]
}
type Legacy = { id: string; speaker: string; subject: string | null; to: string; from: string; status: 'sent' | 'failed'; error: string | null; sent_at: string; polished: boolean; attachments: number }

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—')
const STATUS_COLOR: Record<string, 'teal' | 'amber' | 'red' | 'grey' | 'purple'> = { scheduled: 'purple', sent: 'teal', sending: 'amber', cancelled: 'grey', failed: 'red', skipped: 'amber', queued: 'grey' }
const REPLY_LABEL: Record<string, string> = { reply: 'replied', bounce: 'bounced', auto_reply: 'auto-reply' }
const stat: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: '2px', minWidth: '84px' }

export default function SentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = use(params)
  const openParam = useSearchParams().get('open')
  const [eventName, setEventName] = useState<string | null>(null)
  useBreadcrumbLabel(eventId, eventName)
  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null)
  const [legacy, setLegacy] = useState<Legacy[]>([])
  const [openId, setOpenId] = useState<string | null>(openParam)
  const [detail, setDetail] = useState<Detail | null>(null)
  const [busy, setBusy] = useState(false)
  const [showLegacy, setShowLegacy] = useState(false)
  const [sched, setSched] = useState<{ send_at_local: string; fields: Record<string, string> }>({ send_at_local: '', fields: {} })

  const loadList = useCallback(async () => {
    const r = await fetch(`/api/events/stakeholders/email-campaigns?event_id=${eventId}`)
    const d = await r.json().catch(() => ({}))
    setCampaigns(r.ok ? d.campaigns ?? [] : [])
  }, [eventId])
  const loadDetail = useCallback(async (id: string) => {
    const r = await fetch(`/api/events/stakeholders/email-campaigns/${id}`)
    setDetail(r.ok ? await r.json() : null)
  }, [])

  // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch on mount
  useEffect(() => { void loadList() }, [loadList])
  useEffect(() => {
    fetch(`/api/events?id=${eventId}`).then(r => r.json()).then(d => setEventName((Array.isArray(d) ? d[0] : d)?.name ?? null)).catch(() => {})
    fetch(`/api/events/stakeholders/speaker-emails/history?event_id=${eventId}`).then(r => r.json()).then(d => setLegacy(d.rows ?? [])).catch(() => {})
  }, [eventId])
  // eslint-disable-next-line react-hooks/set-state-in-effect -- load the opened email
  useEffect(() => { if (openId) void loadDetail(openId); else setDetail(null) }, [openId, loadDetail])
  // eslint-disable-next-line react-hooks/set-state-in-effect -- seed the edit boxes when a scheduled email is opened
  useEffect(() => { if (detail?.schedule) setSched({ send_at_local: detail.schedule.send_at_local ?? '', fields: Object.fromEntries(detail.schedule.fields.map(f => [f.key, f.value])) }) }, [detail?.schedule])

  async function cont() {
    if (!openId) return
    setBusy(true)
    for (let guard = 0; guard < 400; guard++) {
      const r = await fetch(`/api/events/stakeholders/email-campaigns/${openId}/send`, { method: 'POST' })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { notify(j.error ?? 'Sending stopped.', 'error'); break }
      await loadDetail(openId)
      if (!j.progress || (j.progress.queued === 0 && j.progress.sending === 0)) break
    }
    setBusy(false); void loadList()
  }
  async function saveSchedule() {
    if (!openId || !detail?.schedule) return
    setBusy(true)
    const r = await fetch(`/api/events/stakeholders/email-campaigns/${openId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ field_values: sched.fields, send_at_local: sched.send_at_local || undefined }) })
    const d = await r.json().catch(() => ({}))
    setBusy(false)
    if (!r.ok) { notify(d.error ?? 'Could not save.', 'error'); return }
    notify(d.released ? 'Saved. Everything is in place and the time has passed, so it is being sent now.' : 'Saved.', 'success')
    await loadDetail(openId); void loadList()
    if (d.released) void cont()
  }
  async function checkReplies() {
    if (!openId) return
    setBusy(true)
    const r = await fetch(`/api/events/stakeholders/email-campaigns/${openId}/replies`, { method: 'POST' })
    const d = await r.json().catch(() => ({}))
    setBusy(false)
    if (!r.ok) { notify(d.error ?? 'Could not read the mailbox.', 'error'); return }
    const x = d.result
    notify(x.problems?.length ? `Could not read: ${x.problems[0]}` : `Checked ${x.messages} messages: ${x.replies} replies, ${x.bounces_hard + x.bounces_soft} bounces, ${x.auto_replies} auto-replies${x.stop_requests ? `, ${x.stop_requests} asking to stop` : ''}.`, x.problems?.length ? 'error' : 'success')
    await loadDetail(openId); void loadList()
  }
  async function confirmStop(contactId: string) {
    const r = await fetch('/api/events/stakeholders/email-people/do-not-email', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contact_id: contactId, on: true, reason: 'asked_to_stop', from_reply: true }) })
    const d = await r.json().catch(() => ({}))
    notify(r.ok ? 'Marked do not email. They will be left out of every list.' : d.error ?? 'Could not save.', r.ok ? 'success' : 'error')
  }
  async function cancel() {
    if (!openId) return
    setBusy(true)
    const r = await fetch(`/api/events/stakeholders/email-campaigns/${openId}/cancel`, { method: 'POST' })
    setBusy(false)
    notify(r.ok ? 'Cancelled. What was already sent stays sent.' : 'Could not cancel.', r.ok ? 'success' : 'error')
    void loadDetail(openId); void loadList()
  }

  const legacyBatches = legacy.length

  return (
    <div>
      <PageHeader eyebrow="Stakeholder Hub" title="Emails" description="Every email sent from this event: what it said, who it went to, and what happened." backHref={`/admin/events/${eventId}/stakeholders`} backLabel="Back to Stakeholder Hub" />
      <EmailsTabs eventId={eventId} />
      <div style={{ padding: '20px 32px 56px', maxWidth: '1000px', display: 'grid', gap: '14px' }}>
        {campaigns === null && <div style={{ color: 'var(--ink3)', fontSize: '13px' }}>Loading…</div>}
        {campaigns && campaigns.length === 0 && <Card padded><div style={{ fontSize: '14px', color: 'var(--ink2)' }}>Nothing sent from here yet. Write one under Compose.</div></Card>}

        {(campaigns ?? []).map(c => {
          const isScheduled = c.status === 'scheduled'
          const sent = c.counts.sent ?? 0, failed = c.counts.failed ?? 0, skipped = c.counts.skipped ?? 0, queued = (c.counts.queued ?? 0) + (c.counts.sending ?? 0)
          const open = openId === c.id
          return (
            <Card key={c.id} padded>
              <button type="button" onClick={() => setOpenId(open ? null : c.id)} aria-expanded={open}
                style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', gap: '14px', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap' }}>
                <div style={{ minWidth: 0, flex: '1 1 320px' }}>
                  <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--ink)' }}>{c.name} <Badge color={STATUS_COLOR[c.status] ?? 'grey'}>{c.status}</Badge></div>
                  <div style={{ fontSize: '12.5px', color: 'var(--ink3)', marginTop: '3px' }}>Subject: {c.subject} · {isScheduled && c.scheduled_for ? `scheduled for ${formatSendTime(c.scheduled_for, c.timezone)}` : when(c.created_at)}{c.created_by_name ? ` · by ${c.created_by_name}` : ''}</div>
                </div>
                <div style={{ display: 'flex', gap: '18px', fontSize: '13px', color: 'var(--ink2)' }}>
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
              </button>

              {open && detail && detail.campaign.id === c.id && (
                <div style={{ marginTop: '14px', paddingTop: '14px', borderTop: '1px solid var(--border-light)' }}>
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
                          <input type="datetime-local" value={sched.send_at_local} onChange={e => setSched(v => ({ ...v, send_at_local: e.target.value }))} style={{ padding: '9px 10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--ink)', fontSize: '14px' }} />
                        </div>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                          <Button variant="teal" onClick={saveSchedule} disabled={busy}>Save</Button>
                          <Button variant="ghost" onClick={cancel} disabled={busy}>Cancel this email</Button>
                        </div>
                      </div>
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
                    {detail.progress && (detail.progress.queued > 0 || detail.progress.sending > 0) && detail.campaign.status === 'sending' && (
                      <>
                        <Button variant="teal" onClick={cont} disabled={busy}>{busy ? 'Sending…' : `Continue sending (${detail.progress.queued + detail.progress.sending} waiting)`}</Button>
                        <Button variant="ghost" onClick={cancel} disabled={busy}>Cancel the rest</Button>
                      </>
                    )}
                    {detail.campaign.status !== 'scheduled' && <Button variant="ghost" onClick={checkReplies} disabled={busy}>{busy ? 'Checking…' : 'Check for replies'}</Button>}
                    <span style={{ fontSize: '12.5px', color: 'var(--ink3)' }}>
                      {detail.campaign.sender_mode === 'me' ? 'Sent from the producer who sent it' : 'Sent from each speaker’s own producer'}{detail.campaign.polished ? ' · Polished' : ''}{detail.campaign.attachments?.length ? ` · ${detail.campaign.attachments.length} attachment(s)` : ''}
                    </span>
                  </div>

                  <div style={{ fontSize: '12px', fontWeight: 800, letterSpacing: '0.5px', textTransform: 'uppercase', color: 'var(--ink3)', marginBottom: '6px' }}>The email</div>
                  <iframe title="What was sent" sandbox="" srcDoc={renderSpeakerEmail({ bodyHtml: applyTokens(detail.campaign.body_html, personValues(detail.recipients[0]?.name ?? 'Name')), publicName: detail.recipients[0]?.name ?? 'Name', producerName: detail.recipients[0]?.sender_name ?? 'Sender' })} style={{ width: '100%', height: '260px', border: '1px solid var(--border)', borderRadius: '10px', background: 'white' }} />

                  {!detail.schedule && <div style={{ fontSize: '12px', fontWeight: 800, letterSpacing: '0.5px', textTransform: 'uppercase', color: 'var(--ink3)', margin: '16px 0 6px' }}>People ({detail.recipients.length})</div>}
                  <div style={{ maxHeight: '380px', overflowY: 'auto' }}>
                    {detail.recipients.map(r => (
                      <div key={r.id} style={{ display: 'flex', gap: '10px', alignItems: 'baseline', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--border-light)', flexWrap: 'wrap' }}>
                        <div style={{ minWidth: 0, flex: '1 1 280px' }}>
                          <span style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--ink)' }}>{r.name}</span>
                          <span style={{ fontSize: '12.5px', color: 'var(--ink3)' }}> · {r.to_email}{r.cc_emails.length ? ` · cc ${r.cc_emails.length}` : ''}{r.mode === 'assistant' ? ' · via assistant' : ''}</span>
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
                </div>
              )}
            </Card>
          )
        })}

        {legacyBatches > 0 && (
          <Card padded>
            <button type="button" onClick={() => setShowLegacy(v => !v)} aria-expanded={showLegacy} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: '14px', fontWeight: 800, color: 'var(--ink)' }}>
              Earlier sends from the Speaker Emails page ({legacyBatches}) {showLegacy ? '▾' : '▸'}
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
          </Card>
        )}
      </div>
    </div>
  )
}
