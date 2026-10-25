'use client'

import { useMemo, useRef, useState } from 'react'
import { Button } from '@/app/components/ui'
import { defaultMiddle, reviewEmailHtml, type ReviewEmailKind } from '@/app/lib/proposals/review-email'

/* The producer's look at the email before it goes to the client. The greeting (personal to each reviewer), the "Review the speakers" button and the sign-off are LOCKED; the wording between them can be edited in place.
   One edited wording goes to every reviewer in this send; each still gets their own greeting and their own private link. */
type Props = {
  kind: ReviewEmailKind; eventName: string; batchName: string; count: number; message: string | null
  recipients: string[]; senderName: string; senderEmail: string | null; cc: string[]
  sending: boolean; onSend: (middleHtml: string) => void; onCancel: () => void
}

// Email paper is always white, like every other email preview in the app.
/* eslint-disable no-restricted-syntax */
const PAGE = (inner: string) => `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
body{font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:#1a2433;margin:16px;background:#fff}
#editable{outline:2px dashed #00A5A3;outline-offset:4px;border-radius:4px;padding:2px 4px;margin:10px 0}
#editable:focus{outline-style:solid}
[id^=locked]{opacity:.6;user-select:none;cursor:not-allowed}
a{color:#00A5A3}
</style></head><body>${inner}</body></html>`
/* eslint-enable no-restricted-syntax */

export default function ReviewEmailComposer(p: Props) {
  const first = p.recipients[0] ?? 'Reviewer'
  const initial = useMemo(() => defaultMiddle({ eventName: p.eventName, batchName: p.batchName, count: p.count, kind: p.kind, message: p.message }), [p.eventName, p.batchName, p.count, p.kind, p.message])
  const [middle, setMiddle] = useState(initial)
  const [resetKey, setResetKey] = useState(0)
  const frame = useRef<HTMLIFrameElement>(null)
  const srcDoc = useMemo(() => PAGE(reviewEmailHtml({ name: first, link: '#', senderName: p.senderName, middle: initial })), [first, p.senderName, initial])
  const label: React.CSSProperties = { fontSize: '12px', fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--ink3)', marginBottom: '4px' }
  const subject = `Speaker proposals @ ${p.eventName}`

  return (
    <div role="dialog" aria-modal="true" aria-label="Preview email" onClick={p.onCancel} style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'var(--overlay-scrim)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: '720px', maxHeight: '92vh', overflowY: 'auto', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px', padding: '22px', display: 'grid', gap: '12px' }}>
        <div style={{ fontSize: '19px', fontWeight: 900, color: 'var(--ink)' }}>Preview the email</div>
        <div style={{ fontSize: '13.5px', color: 'var(--ink3)' }}>Click into the dashed area to reword the message. The greeting, the button and the sign-off are fixed — each reviewer gets their own greeting and their own private link.</div>

        <div style={{ fontSize: '14px', color: 'var(--ink2)', display: 'grid', gap: '4px' }}>
          <div><span style={label}>From </span>{p.senderEmail ? <><strong>{p.senderName}</strong> &lt;{p.senderEmail}&gt;</> : 'Trescon Events (system sender)'}</div>
          <div><span style={label}>To </span>{p.recipients.join(', ')}{p.recipients.length > 1 ? ' — each gets their own email' : ''}</div>
          <div><span style={label}>Cc </span>{p.cc.length ? p.cc.join(', ') : 'none'}</div>
          <div><span style={label}>Subject </span>{subject} <span style={{ color: 'var(--ink4)' }}>(fixed, so it stays in one thread)</span></div>
        </div>

        <iframe
          ref={frame}
          key={resetKey}
          srcDoc={srcDoc}
          title="Email preview"
          sandbox="allow-same-origin"
          onLoad={e => {
            const doc = e.currentTarget.contentDocument
            const ed = doc?.getElementById('editable')
            if (!doc || !ed) return
            ed.contentEditable = 'true'
            ed.addEventListener('input', () => setMiddle(ed.innerHTML))
            doc.addEventListener('click', ev => { if ((ev.target as HTMLElement).closest('a')) ev.preventDefault() })
          }}
          // eslint-disable-next-line no-restricted-syntax -- always-white email paper, not a themeable app surface
          style={{ width: '100%', height: '380px', border: '1px solid var(--border)', borderRadius: '8px', background: '#fff' }}
        />

        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <Button variant="ghost" disabled={p.sending} onClick={() => { setMiddle(initial); setResetKey(k => k + 1) }}>Reset wording</Button>
          <Button variant="ghost" disabled={p.sending} onClick={p.onCancel}>Cancel</Button>
          <Button variant="lime" disabled={p.sending || !middle.replace(/<[^>]*>/g, '').trim()} onClick={() => p.onSend(middle)}>{p.sending ? 'Sending…' : p.recipients.length > 1 ? `Send to ${p.recipients.length} reviewers` : 'Send'}</Button>
        </div>
      </div>
    </div>
  )
}
