'use client'

import { useState } from 'react'
import { Button, Input } from '@/app/components/ui'

/* Shared To/Cc/Subject/Preview/Send editor for every SAE-module compose-
   then-send email flow (2026-09-24, per Madhu: every email send in this
   module should default to editable To/Cc, not fire on a single click).
   Originally built inline in CommunicationsTab.tsx for "Request Missing
   Items"/"Send Reminder"/"Send Acknowledgment"; promoted here once a 4th
   call site (announcement external-notify reminders) needed the exact
   same UI — a real, current need, not speculative reuse. Purely
   presentational/controlled — all state lives in the caller, which is
   responsible for its own compose (render, don't send) and send
   (persist + actually email) API calls. */
export default function ComposeEmailFields({
  senderName, senderEmail,
  recipientEmail, setRecipientEmail,
  ccInput, setCcInput,
  subject, setSubject, subjectReadOnly,
  html, setHtml,
  sendError,
  sending,
  sendLabel,
  onSend,
  onBack,
}: {
  senderName: string
  senderEmail: string
  recipientEmail: string
  setRecipientEmail: (v: string) => void
  ccInput: string
  setCcInput: (v: string) => void
  subject: string
  setSubject: (v: string) => void
  /* When true the subject is shown but fixed (e.g. emails that must stay in the speaker's one thread). */
  subjectReadOnly?: boolean
  html: string
  /* When given, the body is editable in place (click into the preview and type). */
  setHtml?: (v: string) => void
  sendError: string | null
  sending: boolean
  sendLabel: string
  onSend: () => void
  onBack?: () => void
}) {
  // srcDoc is pinned to the html the composer handed us; edits flow OUT through
  // setHtml but must not re-load the iframe (that would reset the caret).
  const [srcDoc, setSrcDoc] = useState(html)
  const [lastEmitted, setLastEmitted] = useState<string | null>(null)
  if (html !== srcDoc && html !== lastEmitted) setSrcDoc(html)
  return (
    <div style={{ display: 'grid', gap: '12px' }}>
      <div style={{ fontSize: '14px', color: 'var(--ink3)' }}>
        Sending as <strong style={{ color: 'var(--ink2)' }}>{senderName}</strong> &lt;{senderEmail}&gt;
      </div>
      <div>
        <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '1px', display: 'block', marginBottom: '6px' }}>To</span>
        <Input value={recipientEmail} onChange={e => setRecipientEmail(e.target.value)} placeholder="speaker@example.com" />
      </div>
      <div>
        <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '1px', display: 'block', marginBottom: '6px' }}>Cc</span>
        <Input value={ccInput} onChange={e => setCcInput(e.target.value)} placeholder="assistant@example.com, colleague@example.com" />
        <div style={{ fontSize: '11.5px', color: 'var(--ink4)', marginTop: '4px' }}>Auto-filled from Additional Contacts — comma-separated, editable.</div>
      </div>
      <div>
        <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '1px', display: 'block', marginBottom: '6px' }}>Subject</span>
        <Input value={subject} onChange={e => setSubject(e.target.value)} disabled={subjectReadOnly} />
        {subjectReadOnly && <div style={{ fontSize: '11.5px', color: 'var(--ink4)', marginTop: '4px' }}>Fixed — every email to this speaker uses the same subject so it stays in one thread.</div>}
      </div>
      <div style={{ border: '1px solid var(--border)', borderRadius: '8px', padding: '14px' }}>
        <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '1px', display: 'block', marginBottom: '10px' }}>Preview</span>
        {/* Rendered in a sandboxed iframe, not dangerouslySetInnerHTML directly on
            the page — the raw email HTML has no inline color/spacing of its own
            (correct for a real email client), and injecting it straight into a
            Tailwind-reset page lets Preflight strip paragraph spacing/list
            bullets/link color while the template's own white content box
            inherits the page's light ink text color, producing illegible
            light-grey-on-white (2026-09-24, real bug found live). An iframe
            gets its own browser-default styling, isolated from both.
            pointer-events:none + the note below stop a producer from clicking
            a link in this preview — nothing has actually been persisted/sent
            yet, so any link here (e.g. a submission link) can 404 until Send
            really happens. */}
        <iframe
          srcDoc={srcDoc}
          title="Email preview"
          // allow-same-origin (no allow-scripts) lets us switch the frame to designMode from here so the body is editable; nothing inside it can run script.
          sandbox="allow-same-origin"
          onLoad={e => {
            const doc = e.currentTarget.contentDocument
            if (!doc) return
            if (setHtml) {
              doc.designMode = 'on'
              doc.addEventListener('input', () => {
                const out = '<!DOCTYPE html>' + doc.documentElement.outerHTML.replace(/\sdesignmode="on"/i, '')
                setLastEmitted(out)
                setHtml(out)
              })
            }
            // Links stay inert (an unsent submission link would 404) — still selectable/editable text.
            doc.addEventListener('click', ev => { if ((ev.target as HTMLElement).closest('a')) ev.preventDefault() })
          }}
          // eslint-disable-next-line no-restricted-syntax -- always-white email paper, not a themeable app surface (matches render-template.ts's own literal-color email HTML)
          style={{ width: '100%', height: '480px', border: 'none', borderRadius: '6px', background: '#fff' }}
        />
        <div style={{ fontSize: '11.5px', color: 'var(--ink4)', marginTop: '6px' }}>Click into the message to edit it. Links become active once you click Send.</div>
      </div>
      {sendError && <div style={{ fontSize: '14.5px', color: 'var(--red)' }}>{sendError}</div>}
      <div style={{ display: 'flex', gap: '8px' }}>
        <Button variant="teal" onClick={onSend} disabled={sending}>{sendLabel}</Button>
        {onBack && <Button variant="ghost" onClick={onBack}>Back</Button>}
      </div>
    </div>
  )
}
