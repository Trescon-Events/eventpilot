'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button, Card, Input } from '@/app/components/ui'
import ComposeEmailFields from '@/app/components/EmailComposeFields'

/* A speaker's "Guest Invite" tab: their personal KonfHub registration link and — read from KonfHub the
   moment the link is saved — what that code is: the pass type, how many passes it was allotted, how many
   are available now. The delegate team creates the codes and sets their limits on KonfHub; nothing about
   limits is typed here. Then sending the event's invite and a usage-aware reminder as the speaker's
   producer, into their one email thread. The emails (wording, deadline) are set up once per event on the
   Guest Invites page. */

type Registrant = { name: string | null; email: string | null; registeredAt: string | null; ticket: string | null }
type Details = { found: boolean | null; ticket_name: string | null; limit: number | null; used: number | null; available: number | null; opens_at: string | null; expires_at: string | null; checked_at: string | null }
type State = {
  speaker: { id: string; name: string }; settings: { pass_name: string; deadline: string | null }
  url: string | null; code: string | null; details: Details | null; warnings: string[]; error: string | null; registrants: Registrant[] | null
  sent_at: string | null; sent_count: number; reminder_sent_at: string | null; reminder_count: number
}

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : null)
const fmtDay = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—')
const deadlineText = (d: string | null) => (d ? new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : 'not set')

export default function GuestInviteTab({ speakerId, eventId, stakeholderName, canEdit }: { speakerId: string; eventId: string; stakeholderName: string; canEdit: boolean }) {
  const [s, setS] = useState<State | null>(null)
  const [link, setLink] = useState('')
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [loadingGuests, setLoadingGuests] = useState(false)
  const [composer, setComposer] = useState<'invite' | 'reminder' | null>(null)

  const load = useCallback(async (query = '') => {
    const res = await fetch(`/api/events/stakeholders/speakers/${speakerId}/guest-invite${query}`)
    const d = await res.json().catch(() => null)
    if (!res.ok || !d) { setMsg({ text: d?.error ?? 'Could not load.', ok: false }); return null }
    setS(d); setLink(cur => cur || d.url || ''); setWarnings(d.warnings ?? [])
    if (d.error) setMsg({ text: d.error, ok: false })
    return d as State
  }, [speakerId])
  // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load
  useEffect(() => { void load() }, [load])

  async function saveLink(value: string | null, done: string) {
    setBusy(true); setMsg(null)
    const res = await fetch(`/api/events/stakeholders/speakers/${speakerId}/guest-invite`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ link: value }) })
    const d = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) { setMsg({ text: d.error ?? 'Could not save.', ok: false }); return }
    setMsg(d.lookup_error ? { text: d.lookup_error, ok: false } : { text: done, ok: true })
    await load()
    setWarnings(d.warnings ?? [])
  }

  async function refresh() {
    setRefreshing(true); setMsg(null)
    await load('?refresh=1')
    setRefreshing(false)
  }

  async function showGuests() {
    setLoadingGuests(true)
    await load('?guests=1')
    setLoadingGuests(false)
  }

  if (!s) return <div style={{ padding: '24px 32px', color: 'var(--ink3)' }}>{msg?.text ?? 'Loading…'}</div>
  const d = s.details
  const linkChanged = link.trim() !== (s.url ?? '')
  const allUsed = !!d && d.available === 0
  const stat: React.CSSProperties = { padding: '12px 14px', borderRadius: '10px', background: 'var(--card-hi)', display: 'grid', gap: '4px', minWidth: 0 }
  const statLabel: React.CSSProperties = { fontSize: '11px', fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.4px' }

  return (
    <div style={{ maxWidth: '980px', padding: '24px 32px', display: 'grid', gap: '18px' }}>
      {msg && <div style={{ padding: '10px 14px', borderRadius: '8px', fontSize: '14px', background: msg.ok ? 'var(--teal-light)' : 'var(--red-light)', border: `1px solid ${msg.ok ? 'var(--teal-border)' : 'var(--red-border)'}`, color: msg.ok ? 'var(--teal-mid)' : 'var(--red)' }}>{msg.text}</div>}

      <Card padded>
        <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--ink)', marginBottom: '4px' }}>Registration link</div>
        <div style={{ fontSize: '12.5px', color: 'var(--ink3)', marginBottom: '12px', lineHeight: 1.6 }}>
          The personal KonfHub link the delegate team created for {stakeholderName}, who also set its limit on KonfHub. Guests who register through it get a {s.settings.pass_name}; registration closes {deadlineText(s.settings.deadline)}.
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <Input value={link} disabled={!canEdit || busy} onChange={e => setLink(e.target.value)} placeholder="https://konfhub.com/checkout/…?selectedCode=…" />
          {canEdit && <Button variant="teal" onClick={() => saveLink(link, 'Link saved and read from KonfHub.')} disabled={busy || !link.trim() || !linkChanged}>{busy ? 'Saving…' : 'Save'}</Button>}
          {canEdit && s.url && <Button variant="ghost" onClick={() => { setLink(''); void saveLink(null, 'Link removed.') }} disabled={busy}>Remove</Button>}
        </div>

        {s.code && (
          <div style={{ marginTop: '16px', display: 'grid', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
              <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--ink)' }}>From KonfHub <span style={{ fontWeight: 500, color: 'var(--ink4)' }}>· code <code style={{ color: 'var(--ink2)' }}>{s.code}</code></span></div>
              <button onClick={refresh} disabled={refreshing || busy} title="Refresh from KonfHub" aria-label="Refresh from KonfHub"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'none', border: '1px solid var(--border)', borderRadius: '999px', padding: '4px 10px', color: 'var(--ink2)', fontSize: '12px', fontWeight: 700, cursor: refreshing ? 'default' : 'pointer', opacity: refreshing ? 0.6 : 1 }}>
                <span style={{ display: 'inline-block', fontSize: '15px', lineHeight: 1, animation: refreshing ? 'gi-spin 0.8s linear infinite' : 'none' }}>↻</span>{refreshing ? 'Reading…' : d?.checked_at ? `as of ${new Date(d.checked_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}` : 'Refresh'}
              </button>
              <style>{'@keyframes gi-spin { to { transform: rotate(360deg) } }'}</style>
            </div>

            {d?.found ? (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.5fr) minmax(0, 1fr) minmax(0, 1fr)', gap: '10px' }}>
                  <div style={stat}><span style={statLabel}>Pass type</span><span style={{ fontSize: '15px', fontWeight: 800, color: 'var(--ink)' }}>{d.ticket_name ?? '—'}</span></div>
                  <div style={stat}><span style={statLabel}>Passes allotted</span><span style={{ fontSize: '22px', fontWeight: 800, color: 'var(--ink)' }}>{d.limit ?? '—'}</span></div>
                  <div style={stat}><span style={statLabel}>Available now</span>
                    <span style={{ fontSize: '22px', fontWeight: 800, color: allUsed ? 'var(--amber)' : 'var(--teal-mid)' }}>{d.available ?? '—'}</span>
                    {d.used !== null && <span style={{ fontSize: '11.5px', color: 'var(--ink4)' }}>{d.used} used</span>}</div>
                </div>
                <div style={{ fontSize: '12px', color: 'var(--ink4)' }}>Code open {fmtDay(d.opens_at)} to {fmtDay(d.expires_at)} · limits are managed by the delegate team on KonfHub{d.checked_at ? ` · read ${fmt(d.checked_at)}` : ''}</div>
              </>
            ) : d?.found === false ? (
              <div style={{ fontSize: '13px', color: 'var(--red)' }}>This code wasn’t found on KonfHub, so there are no pass details to show.</div>
            ) : <div style={{ fontSize: '13px', color: 'var(--ink3)' }}>Not read from KonfHub yet — use the refresh icon.</div>}

            {warnings.length > 0 && (
              <div style={{ display: 'grid', gap: '4px', padding: '10px 12px', borderRadius: '8px', background: 'var(--amber-light)', border: '1px solid var(--amber-border)', fontSize: '12.5px', color: 'var(--amber)', lineHeight: 1.5 }}>
                {warnings.map((w, i) => <div key={i}>⚠ {w}</div>)}
              </div>
            )}

            <div>
              {s.registrants === null ? (
                <Button variant="ghost" onClick={showGuests} disabled={loadingGuests}>{loadingGuests ? 'Loading guests… (about 15 seconds)' : 'Show who has registered'}</Button>
              ) : s.registrants.length === 0 ? <div style={{ fontSize: '12.5px', color: 'var(--ink3)' }}>No confirmed registrations yet.</div> : (
                <div style={{ display: 'grid', gap: '4px' }}>
                  {s.registrants.map((r, i) => (
                    <div key={i} style={{ fontSize: '12.5px', color: 'var(--ink2)', padding: '6px 10px', borderRadius: '8px', background: 'var(--card-hi)' }}>{r.name ?? '(no name)'} <span style={{ color: 'var(--ink4)' }}>· {r.email ?? '—'}{r.registeredAt ? ` · ${r.registeredAt.slice(0, 10)}` : ''}</span></div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </Card>

      <Card padded>
        <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--ink)', marginBottom: '4px' }}>Emails</div>
        <div style={{ fontSize: '12.5px', color: 'var(--ink3)', marginBottom: '12px', lineHeight: 1.6 }}>
          Sent as the speaker’s producer, in their one thread. The email quotes this code’s real limit from KonfHub, and the reminder reflects how many places are left. You can edit the message and recipients before sending.
        </div>
        <div style={{ display: 'grid', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <Button variant="teal" onClick={() => setComposer('invite')} disabled={!canEdit || !s.url || d?.found === false}>{s.sent_at ? 'Send invite again' : 'Send invite'}</Button>
            <span style={{ fontSize: '12.5px', color: 'var(--ink3)' }}>{s.sent_at ? `Sent ${fmt(s.sent_at)}${s.sent_count > 1 ? ` (${s.sent_count} times)` : ''}` : s.url ? 'Not sent yet' : 'Needs a link first'}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <Button variant="ghost" onClick={() => setComposer('reminder')} disabled={!canEdit || !s.sent_at || allUsed}>Send reminder</Button>
            <span style={{ fontSize: '12.5px', color: 'var(--ink3)' }}>{!s.sent_at ? 'Available after the invite is sent' : allUsed ? 'All places are used — no reminder needed' : s.reminder_sent_at ? `Last reminder ${fmt(s.reminder_sent_at)}${s.reminder_count > 1 ? ` (${s.reminder_count} times)` : ''}` : 'Reads KonfHub first, then words the reminder to match how many guests have registered'}</span>
          </div>
        </div>
      </Card>

      {composer && (
        <Composer kind={composer} speakerId={speakerId} eventId={eventId} stakeholderName={stakeholderName} onClose={() => setComposer(null)} onSent={() => { setMsg({ text: composer === 'invite' ? 'Invite sent.' : 'Reminder sent.', ok: true }); void load() }} />
      )}
    </div>
  )
}

function Composer({ kind, speakerId, stakeholderName, onClose, onSent }: { kind: 'invite' | 'reminder'; speakerId: string; eventId: string; stakeholderName: string; onClose: () => void; onSent: () => void }) {
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [recipientEmail, setRecipientEmail] = useState('')
  const [ccInput, setCcInput] = useState('')
  const [subject, setSubject] = useState('')
  const [html, setHtml] = useState('')
  const [senderName, setSenderName] = useState('')
  const [senderEmail, setSenderEmail] = useState('')
  const [info, setInfo] = useState<{ used: number; cap: number } | null>(null)
  const [toIsContact, setToIsContact] = useState(false)
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/events/stakeholders/speakers/${speakerId}/guest-invite/compose`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind }) })
      .then(async res => { const d = await res.json().catch(() => ({})); if (!res.ok) throw new Error(d.error || 'Could not compose the email'); return d })
      .then(d => { setRecipientEmail(d.recipient_email); setCcInput(d.cc_emails.join(', ')); setToIsContact(!!d.to_is_contact); setSubject(d.subject); setHtml(d.html); setSenderName(d.sender_name); setSenderEmail(d.sender_email); setInfo({ used: d.used, cap: d.cap }) })
      .catch(e => setLoadError(e instanceof Error ? e.message : 'Could not compose the email'))
      .finally(() => setLoading(false))
  }, [speakerId, kind])

  async function send() {
    setSending(true); setSendError(null)
    try {
      const res = await fetch(`/api/events/stakeholders/speakers/${speakerId}/guest-invite/send`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, recipient_email: recipientEmail, cc_emails: ccInput.split(',').map(x => x.trim()).filter(Boolean), subject, html }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error([d.error, ...(d.errors ?? []).map((e: { message: string }) => `• ${e.message}`)].filter(Boolean).join('\n') || 'Send failed')
      onSent(); onClose()
    } catch (e) { setSendError(e instanceof Error ? e.message : 'Send failed') } finally { setSending(false) }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--overlay-scrim)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ width: '640px', maxWidth: '95%', maxHeight: '90vh', overflowY: 'auto', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px', padding: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <div style={{ fontSize: '17px', fontWeight: 800, color: 'var(--ink)' }}>{kind === 'invite' ? 'Send guest invite' : 'Send reminder'} — {stakeholderName}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '20px', color: 'var(--ink3)', cursor: 'pointer' }}>×</button>
        </div>
        {kind === 'reminder' && info && <div style={{ fontSize: '12.5px', color: 'var(--ink3)', marginBottom: '12px' }}>KonfHub shows <strong>{info.used}</strong> of {info.cap} places used — the reminder is worded to match.</div>}
        {toIsContact && <div style={{ fontSize: '12.5px', color: 'var(--amber)', marginBottom: '12px' }}>No email on file for the speaker — addressed to their first additional contact instead.</div>}
        {loading ? <div style={{ fontSize: '13px', color: 'var(--ink4)' }}>{kind === 'reminder' ? 'Checking KonfHub for registrations…' : 'Loading…'}</div>
          : loadError ? <div style={{ fontSize: '14.5px', color: 'var(--red)' }}>{loadError}</div>
          : <ComposeEmailFields senderName={senderName} senderEmail={senderEmail} recipientEmail={recipientEmail} setRecipientEmail={setRecipientEmail} ccInput={ccInput} setCcInput={setCcInput} subject={subject} setSubject={setSubject} subjectReadOnly html={html} setHtml={setHtml} sendError={sendError} sending={sending} sendLabel={sending ? 'Sending…' : kind === 'invite' ? 'Send invite' : 'Send reminder'} onSend={send} />}
      </div>
    </div>
  )
}
