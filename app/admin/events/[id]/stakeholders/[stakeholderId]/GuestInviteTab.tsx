'use client'

import { useCallback, useEffect, useState } from 'react'
import { Badge, Button, Card, Input } from '@/app/components/ui'
import ComposeEmailFields from '@/app/components/EmailComposeFields'

/* A speaker's "Guest Invite" tab: their personal KonfHub registration link, how many guests
   have registered with it (read from KonfHub on demand), and sending the event's invite and
   a usage-aware reminder as their producer — into the speaker's one email thread. The emails
   themselves (wording, deadline, cap) are set up once per event on the Guest Invites page. */

type Registrant = { name: string | null; email: string | null; registeredAt: string | null; ticket: string | null }
type State = {
  speaker: { id: string; name: string }; settings: { pass_name: string; cap: number; deadline: string | null }
  url: string | null; code: string | null; cap: number; cap_override: number | null
  used: number | null; usage_checked_at: string | null; registrants: Registrant[] | null; usage_error: string | null
  sent_at: string | null; sent_count: number; reminder_sent_at: string | null; reminder_count: number
}

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : null)
const deadlineText = (d: string | null) => (d ? new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : 'not set')

export default function GuestInviteTab({ speakerId, eventId, stakeholderName, canEdit }: { speakerId: string; eventId: string; stakeholderName: string; canEdit: boolean }) {
  const [s, setS] = useState<State | null>(null)
  const [link, setLink] = useState('')
  const [capText, setCapText] = useState('')
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [busy, setBusy] = useState(false)
  const [checking, setChecking] = useState(false)
  const [composer, setComposer] = useState<'invite' | 'reminder' | null>(null)

  const load = useCallback(async (refresh = false) => {
    const res = await fetch(`/api/events/stakeholders/speakers/${speakerId}/guest-invite${refresh ? '?refresh=1' : ''}`)
    const d = await res.json().catch(() => null)
    if (!res.ok || !d) { setMsg({ text: d?.error ?? 'Could not load.', ok: false }); return }
    setS(d); setLink(cur => cur || d.url || ''); setCapText(d.cap_override === null ? '' : String(d.cap_override))
    if (d.usage_error) setMsg({ text: d.usage_error, ok: false })
  }, [speakerId])
  // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load
  useEffect(() => { void load() }, [load])

  async function patch(body: Record<string, unknown>, done: string) {
    setBusy(true); setMsg(null)
    const res = await fetch(`/api/events/stakeholders/speakers/${speakerId}/guest-invite`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const d = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) { setMsg({ text: d.error ?? 'Could not save.', ok: false }); return }
    setMsg({ text: done, ok: true }); await load()
  }

  async function check() {
    setChecking(true); setMsg(null)
    await load(true)
    setChecking(false)
  }

  if (!s) return <div style={{ padding: '24px 32px', color: 'var(--ink3)' }}>{msg?.text ?? 'Loading…'}</div>
  const linkChanged = link.trim() !== (s.url ?? '')
  const left = s.used === null ? null : Math.max(s.cap - s.used, 0)
  const allUsed = s.used !== null && s.cap > 0 && s.used >= s.cap

  return (
    <div style={{ maxWidth: '980px', padding: '24px 32px', display: 'grid', gap: '18px' }}>
      {msg && <div style={{ padding: '10px 14px', borderRadius: '8px', fontSize: '14px', background: msg.ok ? 'var(--teal-light)' : 'var(--red-light)', border: `1px solid ${msg.ok ? 'var(--teal-border)' : 'var(--red-border)'}`, color: msg.ok ? 'var(--teal-mid)' : 'var(--red)' }}>{msg.text}</div>}

      <Card padded>
        <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--ink)', marginBottom: '4px' }}>Registration link</div>
        <div style={{ fontSize: '12.5px', color: 'var(--ink3)', marginBottom: '12px', lineHeight: 1.6 }}>
          The personal KonfHub link the delegate team created for {stakeholderName}. Guests who register through it get a {s.settings.pass_name}; registration closes {deadlineText(s.settings.deadline)}.
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <Input value={link} disabled={!canEdit || busy} onChange={e => setLink(e.target.value)} placeholder="https://konfhub.com/checkout/…?selectedCode=…" />
          {canEdit && <Button variant="teal" onClick={() => patch({ link }, 'Link saved.')} disabled={busy || !link.trim() || !linkChanged}>Save</Button>}
          {canEdit && s.url && <Button variant="ghost" onClick={() => { setLink(''); void patch({ link: null }, 'Link removed.') }} disabled={busy}>Remove</Button>}
        </div>
        {s.code && <div style={{ fontSize: '12.5px', color: 'var(--ink3)', marginTop: '8px' }}>Code <code style={{ color: 'var(--ink)' }}>{s.code}</code></div>}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '12px', fontSize: '12.5px', color: 'var(--ink3)' }}>
          Guests allowed
          <Input type="number" min={0} max={50} value={capText} disabled={!canEdit || busy} placeholder={String(s.settings.cap)} onChange={e => setCapText(e.target.value)} style={{ width: '90px' }} />
          <span>(empty = the event default of {s.settings.cap})</span>
          {canEdit && <Button variant="ghost" onClick={() => patch({ cap: capText.trim() === '' ? null : Number(capText) }, 'Guest limit saved.')} disabled={busy || (capText.trim() === '' ? s.cap_override === null : Number(capText) === s.cap_override)}>Save limit</Button>}
        </div>
      </Card>

      <Card padded>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', marginBottom: '8px' }}>
          <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--ink)' }}>Registered through this link</div>
          {s.code && <Button variant="ghost" onClick={check} disabled={checking}>{checking ? 'Checking KonfHub… (about 15 seconds)' : 'Check KonfHub now'}</Button>}
        </div>
        {!s.code ? <div style={{ fontSize: '13px', color: 'var(--ink3)' }}>Add the link first.</div> : s.used === null ? (
          <div style={{ fontSize: '13px', color: 'var(--ink3)' }}>Not checked yet. “Check KonfHub now” counts the guests who have registered with this code.</div>
        ) : (
          <div style={{ display: 'grid', gap: '8px' }}>
            <div style={{ fontSize: '14px', color: 'var(--ink)' }}><strong>{s.used}</strong> of {s.cap} places used{left !== null && !allUsed ? `, ${left} left` : ''} {allUsed && <Badge color="teal">All used</Badge>} <span style={{ fontSize: '12px', color: 'var(--ink4)' }}>· checked {fmt(s.usage_checked_at)}</span></div>
            {s.registrants && s.registrants.length > 0 && (
              <div style={{ display: 'grid', gap: '4px' }}>
                {s.registrants.map((r, i) => (
                  <div key={i} style={{ fontSize: '12.5px', color: 'var(--ink2)', padding: '6px 10px', borderRadius: '8px', background: 'var(--card-hi)' }}>{r.name ?? '(no name)'} <span style={{ color: 'var(--ink4)' }}>· {r.email ?? '—'} · {r.ticket ?? ''}{r.registeredAt ? ` · ${r.registeredAt.slice(0, 10)}` : ''}</span></div>
                ))}
              </div>
            )}
          </div>
        )}
      </Card>

      <Card padded>
        <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--ink)', marginBottom: '4px' }}>Emails</div>
        <div style={{ fontSize: '12.5px', color: 'var(--ink3)', marginBottom: '12px', lineHeight: 1.6 }}>
          Sent as the speaker’s producer, in their one thread. You can edit the message and recipients before sending. Wording is set per event on the Guest Invites page.
        </div>
        <div style={{ display: 'grid', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <Button variant="teal" onClick={() => setComposer('invite')} disabled={!canEdit || !s.url}>{s.sent_at ? 'Send invite again' : 'Send invite'}</Button>
            <span style={{ fontSize: '12.5px', color: 'var(--ink3)' }}>{s.sent_at ? `Sent ${fmt(s.sent_at)}${s.sent_count > 1 ? ` (${s.sent_count} times)` : ''}` : s.url ? 'Not sent yet' : 'Needs a link first'}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <Button variant="ghost" onClick={() => setComposer('reminder')} disabled={!canEdit || !s.sent_at || allUsed}>Send reminder</Button>
            <span style={{ fontSize: '12.5px', color: 'var(--ink3)' }}>{!s.sent_at ? 'Available after the invite is sent' : allUsed ? 'All places are used — no reminder needed' : s.reminder_sent_at ? `Last reminder ${fmt(s.reminder_sent_at)}${s.reminder_count > 1 ? ` (${s.reminder_count} times)` : ''}` : 'Checks KonfHub first, then words the reminder to match how many guests have registered'}</span>
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
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/events/stakeholders/speakers/${speakerId}/guest-invite/compose`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind }) })
      .then(async res => { const d = await res.json().catch(() => ({})); if (!res.ok) throw new Error(d.error || 'Could not compose the email'); return d })
      .then(d => { setRecipientEmail(d.recipient_email); setSubject(d.subject); setHtml(d.html); setSenderName(d.sender_name); setSenderEmail(d.sender_email); setInfo({ used: d.used, cap: d.cap }) })
      .catch(e => setLoadError(e instanceof Error ? e.message : 'Could not compose the email'))
      .finally(() => setLoading(false))
  }, [speakerId, kind])

  useEffect(() => {
    fetch(`/api/events/stakeholders/speakers/${speakerId}/additional-contacts`).then(r => r.json())
      .then(d => { const cs = (d.contacts ?? []) as { email: string }[]; setCcInput(prev => prev || cs.map(c => c.email).join(', ')) }).catch(() => {})
  }, [speakerId])

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
        {loading ? <div style={{ fontSize: '13px', color: 'var(--ink4)' }}>{kind === 'reminder' ? 'Checking KonfHub for registrations…' : 'Loading…'}</div>
          : loadError ? <div style={{ fontSize: '14.5px', color: 'var(--red)' }}>{loadError}</div>
          : <ComposeEmailFields senderName={senderName} senderEmail={senderEmail} recipientEmail={recipientEmail} setRecipientEmail={setRecipientEmail} ccInput={ccInput} setCcInput={setCcInput} subject={subject} setSubject={setSubject} html={html} setHtml={setHtml} sendError={sendError} sending={sending} sendLabel={sending ? 'Sending…' : kind === 'invite' ? 'Send invite' : 'Send reminder'} onSend={send} />}
      </div>
    </div>
  )
}
