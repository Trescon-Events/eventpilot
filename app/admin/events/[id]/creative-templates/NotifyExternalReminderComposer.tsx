'use client'

import { useEffect, useState } from 'react'
import ComposeEmailFields from '@/app/components/EmailComposeFields'

/* "Send Reminder" for an external-notify announcement (2026-09-24, per
   Madhu — every SAE email send should default to an editable To/Cc/
   Subject/Preview popup, same as the Communications tab's own composers).
   Used to fire immediately on a single click straight against notify-
   external/remind with zero edit surface (see NotifyExternalComposer.tsx's
   own now-stale doc comment) — this replaces that. Same compose (render,
   don't send) → send (persist + actually email) split as every other
   composer in this app; seeds To/Cc from whatever notify-external/send
   last recorded, both still editable here. */

type Props = {
  announcementId: string
  stakeholderName: string
  onClose: () => void
  onSent: (patch: Record<string, unknown>) => void
}

export default function NotifyExternalReminderComposer({ announcementId, stakeholderName, onClose, onSent }: Props) {
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [templateId, setTemplateId] = useState('')
  const [recipientEmail, setRecipientEmail] = useState('')
  const [ccInput, setCcInput] = useState('')
  const [subject, setSubject] = useState('')
  const [html, setHtml] = useState('')
  const [senderName, setSenderName] = useState('')
  const [senderEmail, setSenderEmail] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/events/stakeholders/announcements/${announcementId}/notify-external/remind/compose`, { method: 'POST' })
      .then(async res => { const data = await res.json().catch(() => ({})); if (!res.ok) throw new Error(data.error || 'Could not load reminder'); return data })
      .then(data => {
        setTemplateId(data.template_id)
        setRecipientEmail(data.recipient_email)
        setCcInput(((data.cc_emails ?? []) as string[]).join(', '))
        setSubject(data.subject)
        setHtml(data.html)
        setSenderName(data.sender_name)
        setSenderEmail(data.sender_email)
      })
      .catch(e => setLoadError(e instanceof Error ? e.message : 'Could not load reminder'))
      .finally(() => setLoading(false))
  }, [announcementId])

  function parseCc(): string[] {
    return ccInput.split(',').map(s => s.trim()).filter(Boolean)
  }

  async function send() {
    setSending(true); setSendError(null)
    try {
      const res = await fetch(`/api/events/stakeholders/announcements/${announcementId}/notify-external/remind`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template_id: templateId, recipient_email: recipientEmail, cc_emails: parseCc(), subject, html }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Could not send the reminder')
      onSent(data)
      onClose()
    } catch (e) {
      setSendError(e instanceof Error ? e.message : 'Could not send the reminder')
    } finally {
      setSending(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'color-mix(in srgb, black 60%, transparent)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div style={{ width: '680px', maxWidth: '95%', maxHeight: '90vh', overflowY: 'auto', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px', padding: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div style={{ fontSize: '17px', fontWeight: 800, color: 'var(--ink)' }}>Send Reminder — {stakeholderName}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '20px', color: 'var(--ink3)', cursor: 'pointer' }}>×</button>
        </div>
        {loading ? (
          <div style={{ fontSize: '13px', color: 'var(--ink4)' }}>Loading…</div>
        ) : loadError ? (
          <div style={{ fontSize: '14.5px', color: 'var(--red)' }}>{loadError}</div>
        ) : (
          <ComposeEmailFields
            senderName={senderName} senderEmail={senderEmail}
            recipientEmail={recipientEmail} setRecipientEmail={setRecipientEmail}
            ccInput={ccInput} setCcInput={setCcInput}
            subject={subject} setSubject={setSubject}
            html={html}
            sendError={sendError}
            sending={sending}
            sendLabel={sending ? 'Sending…' : 'Send Reminder'}
            onSend={send}
          />
        )}
      </div>
    </div>
  )
}
