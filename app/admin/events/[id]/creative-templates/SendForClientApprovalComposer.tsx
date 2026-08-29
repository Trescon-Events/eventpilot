'use client'

import { useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import Underline from '@tiptap/extension-underline'
import { TextStyle } from '@tiptap/extension-text-style'
import Color from '@tiptap/extension-color'
import { Button, Input, ProcessingOverlay } from '@/app/components/ui'
import RichTextToolbar from '@/app/components/RichTextToolbar'

/* Client Approval round's composer (2026-08-29) — the third layer's own
   send flow, for events Trescon manages on behalf of another client (e.g.
   DFS/DFFW events managed for DIFC). Same two-step stateless-compose/
   write-on-send shape as SendForExternalApprovalComposer.tsx, built
   directly against that precedent (per Madhu: "we will follow the same
   flow as how we do with external approval"). Only real difference: the
   quick-pick toggle defaults to the event's own single client contact
   (name/job title/email, set on the event workspace's own edit page) —
   not the stakeholder's own contact info — vs typing a different
   recipient. Sends a real no-login review link the same way, reusing the
   exact same public review portal external approval already uses (that
   page is layer-agnostic — see send-for-client-approval/compose's own
   doc comment). */

type Props = {
  announcementId: string
  eventName?: string | null
  onClose: () => void
  onSent: () => void
  clientContactName?: string | null
  clientContactJobTitle?: string | null
  clientContactEmail?: string | null
}

export default function SendForClientApprovalComposer({
  announcementId, eventName, onClose, onSent,
  clientContactName = '', clientContactJobTitle = '', clientContactEmail = '',
}: Props) {
  const [useOwnEmail, setUseOwnEmail] = useState(!!clientContactEmail)
  const [step, setStep] = useState<'pick' | 'edit' | 'sending' | 'error'>('pick')
  const [recipientName, setRecipientName] = useState(clientContactName || '')
  const [recipientEmail, setRecipientEmail] = useState(clientContactEmail || '')
  const [ccInput, setCcInput] = useState('')
  const [pickError, setPickError] = useState<string | null>(null)
  const [composing, setComposing] = useState(false)

  const [templateId, setTemplateId] = useState('')
  const [reviewToken, setReviewToken] = useState('')
  const [subject, setSubject] = useState('')
  const [senderName, setSenderName] = useState('')
  const [senderEmail, setSenderEmail] = useState('')
  const [ccEmails, setCcEmails] = useState<string[]>([])
  const [sendError, setSendError] = useState<string | null>(null)

  const editor = useEditor({
    extensions: [StarterKit, Link.configure({ openOnClick: false }), Underline, TextStyle, Color],
    content: '',
    immediatelyRender: false,
  })

  function parseCc(): string[] {
    return ccInput.split(',').map(s => s.trim()).filter(Boolean)
  }

  function chooseOwnEmail() {
    setUseOwnEmail(true)
    setRecipientName(clientContactName || '')
    setRecipientEmail(clientContactEmail || '')
  }
  function chooseManual() {
    setUseOwnEmail(false)
    setRecipientName('')
    setRecipientEmail('')
  }

  async function startCompose() {
    if (!recipientName.trim() || !recipientEmail.trim()) {
      setPickError('Enter a recipient name and email.')
      return
    }
    const cc = parseCc()
    setComposing(true); setPickError(null)
    try {
      const res = await fetch(`/api/events/stakeholders/announcements/${announcementId}/send-for-client-approval/compose`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipient_name: recipientName.trim(), recipient_email: recipientEmail.trim(), cc_emails: cc }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setTemplateId(data.template_id)
      setReviewToken(data.review_token)
      setSubject(data.subject)
      setSenderName(data.sender_name)
      setSenderEmail(data.sender_email)
      setCcEmails(cc)
      editor?.commands.setContent(data.html)
      setStep('edit')
    } catch (e) {
      setPickError(e instanceof Error ? e.message : 'Could not compose email')
    }
    setComposing(false)
  }

  function handleEditorAreaClick(e: React.MouseEvent) {
    if (!editor || !editor.isActive('link')) return
    const href = editor.getAttributes('link').href as string
    if (e.metaKey || e.ctrlKey) {
      window.open(href, '_blank', 'noopener,noreferrer')
      return
    }
    const url = window.prompt('Edit link URL (leave blank to remove the link):', href)
    if (url === null) return
    const trimmed = url.trim()
    if (trimmed === '') editor.chain().focus().extendMarkRange('link').unsetLink().run()
    else editor.chain().focus().extendMarkRange('link').setLink({ href: trimmed }).run()
  }

  async function send() {
    if (!editor) return
    setStep('sending'); setSendError(null)
    try {
      const res = await fetch(`/api/events/stakeholders/announcements/${announcementId}/send-for-client-approval/send`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template_id: templateId, review_token: reviewToken, recipient_name: recipientName.trim(), recipient_email: recipientEmail.trim(),
          cc_emails: ccEmails, subject, html: editor.getHTML(),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      onSent()
      onClose()
    } catch (e) {
      setSendError(e instanceof Error ? e.message : 'Send failed')
      setStep('error')
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'color-mix(in srgb, black 60%, transparent)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div style={{ width: '680px', maxWidth: '95%', maxHeight: '90vh', overflowY: 'auto', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px', padding: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div style={{ fontSize: '17px', fontWeight: 800, color: 'var(--ink)' }}>Send for Client Approval{eventName ? ` — ${eventName}` : ''}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '20px', color: 'var(--ink3)', cursor: 'pointer' }}>×</button>
        </div>

        {step === 'pick' && (
          <div style={{ display: 'grid', gap: '14px' }}>
            {clientContactEmail && (
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <Button variant={useOwnEmail ? 'teal' : 'ghost'} onClick={chooseOwnEmail}>
                  Use {clientContactName || 'the client contact'}&apos;s email{clientContactJobTitle ? ` (${clientContactJobTitle})` : ''} — {clientContactEmail}
                </Button>
                <Button variant={!useOwnEmail ? 'teal' : 'ghost'} onClick={chooseManual}>
                  Send to someone else
                </Button>
              </div>
            )}
            {!useOwnEmail && (
              <>
                <div>
                  <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '1px', display: 'block', marginBottom: '6px' }}>Recipient Name</span>
                  <Input value={recipientName} onChange={e => setRecipientName(e.target.value)} placeholder="e.g. their contact at the client organisation" />
                </div>
                <div>
                  <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '1px', display: 'block', marginBottom: '6px' }}>Recipient Email</span>
                  <Input type="email" value={recipientEmail} onChange={e => setRecipientEmail(e.target.value)} placeholder="contact@client.com" />
                </div>
              </>
            )}
            <div>
              <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '1px', display: 'block', marginBottom: '6px' }}>CC (optional)</span>
              <Input value={ccInput} onChange={e => setCcInput(e.target.value)} placeholder="comma-separated, e.g. colleague@trescon.com" />
            </div>
            {pickError && <div style={{ fontSize: '14.5px', color: 'var(--red)' }}>{pickError}</div>}
            <Button variant="teal" onClick={startCompose}>{composing ? 'Composing…' : 'Compose Email'}</Button>
          </div>
        )}

        {(step === 'edit' || step === 'sending' || step === 'error') && (
          <div style={{ display: 'grid', gap: '12px' }}>
            <div style={{ fontSize: '14px', color: 'var(--ink3)' }}>
              Sending as <strong style={{ color: 'var(--ink2)' }}>{senderName}</strong> &lt;{senderEmail}&gt; to <strong style={{ color: 'var(--ink2)' }}>{recipientEmail}</strong>
              {ccEmails.length > 0 && <> · cc <strong style={{ color: 'var(--ink2)' }}>{ccEmails.join(', ')}</strong></>}
            </div>
            <div>
              <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '1px', display: 'block', marginBottom: '6px' }}>Subject</span>
              <Input value={subject} onChange={e => setSubject(e.target.value)} />
            </div>
            <div style={{ border: '1px solid var(--border)', borderRadius: '8px', padding: '14px' }}>
              <RichTextToolbar editor={editor} />
              <div
                onClick={handleEditorAreaClick}
                style={{ minHeight: '220px', fontSize: '16px', lineHeight: 1.6 }}
              >
                <EditorContent editor={editor} />
              </div>
            </div>
            {sendError && <div style={{ fontSize: '14.5px', color: 'var(--red)' }}>{sendError}</div>}
            <div style={{ display: 'flex', gap: '8px' }}>
              <Button variant="teal" onClick={send}>{step === 'sending' ? 'Sending…' : step === 'error' ? 'Retry Send' : 'Send'}</Button>
              <Button variant="ghost" onClick={() => setStep('pick')}>Back</Button>
            </div>
          </div>
        )}
      </div>
      <ProcessingOverlay
        active={composing || step === 'sending'}
        label={step === 'sending' ? 'Sending…' : 'Composing email…'}
        estimatedMs={step === 'sending' ? 2200 : 1200}
      />
    </div>
  )
}
