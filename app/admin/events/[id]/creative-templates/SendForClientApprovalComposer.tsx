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

/* Client Approval round's composer (2026-08-29, rebuilt 2026-09-06 for
   multi-contact tracking) — the third layer's own send flow, for events
   Trescon manages on behalf of another client (e.g. DFS/DFFW events
   managed for DIFC). Same two-step stateless-compose/write-on-send shape
   as SendForExternalApprovalComposer.tsx.

   Primary vs CC, per Madhu (2026-09-06): the PRIMARY contact (configured
   on the event's Integrations page) is the recipient whose decision
   actually gates publishing — unchanged from the original single-contact
   design, still the exact same announcement_approvals layer='client' row
   and public review portal. Everyone else configured for this event is
   offered as a CC, pre-checked (the producer narrows down, doesn't build
   up from nothing — same pattern as this session's other fetch-and-select
   features). Each checked CC gets their OWN unique review link and their
   OWN independently-tracked (but non-gating) status — never a shared
   email cc: header, which would give every CC'd person the SAME link and
   make it impossible to know who actually responded. See the compose/send
   routes' own doc comments for the full mechanics.

   Note: CC emails are rendered once at compose time (personalized with
   each person's own name) and sent as-is — if the producer edits the
   subject/body in the rich-text step below, those edits only apply to the
   primary's copy, not retroactively to already-composed CC copies. */

type Contact = { id: string; name: string; email: string }

type Props = {
  announcementId: string
  eventName?: string | null
  onClose: () => void
  onSent: () => void
  primaryContact?: Contact | null
  ccContacts?: Contact[]
}

type ComposedCc = { name: string; email: string; review_token: string; subject: string; html: string }

export default function SendForClientApprovalComposer({
  announcementId, eventName, onClose, onSent, primaryContact = null, ccContacts = [],
}: Props) {
  const [step, setStep] = useState<'pick' | 'edit' | 'sending' | 'error'>('pick')
  const [recipientName, setRecipientName] = useState(primaryContact?.name ?? '')
  const [recipientEmail, setRecipientEmail] = useState(primaryContact?.email ?? '')
  const [selectedCcIds, setSelectedCcIds] = useState<Set<string>>(new Set(ccContacts.map(c => c.id)))
  const [extraCcName, setExtraCcName] = useState('')
  const [extraCcEmail, setExtraCcEmail] = useState('')
  const [pickError, setPickError] = useState<string | null>(null)
  const [composing, setComposing] = useState(false)

  const [templateId, setTemplateId] = useState('')
  const [reviewToken, setReviewToken] = useState('')
  const [subject, setSubject] = useState('')
  const [senderName, setSenderName] = useState('')
  const [senderEmail, setSenderEmail] = useState('')
  const [ccComposed, setCcComposed] = useState<ComposedCc[]>([])
  const [sendError, setSendError] = useState<string | null>(null)

  const editor = useEditor({
    extensions: [StarterKit, Link.configure({ openOnClick: false }), Underline, TextStyle, Color],
    content: '',
    immediatelyRender: false,
  })

  function toggleCc(id: string) {
    setSelectedCcIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  async function startCompose() {
    if (!recipientName.trim() || !recipientEmail.trim()) {
      setPickError('Enter a recipient name and email.')
      return
    }
    const ccRecipients: { name: string; email: string }[] = ccContacts
      .filter(c => selectedCcIds.has(c.id))
      .map(c => ({ name: c.name, email: c.email }))
    if (extraCcName.trim() && extraCcEmail.trim()) ccRecipients.push({ name: extraCcName.trim(), email: extraCcEmail.trim() })

    setComposing(true); setPickError(null)
    try {
      const res = await fetch(`/api/events/stakeholders/announcements/${announcementId}/send-for-client-approval/compose`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipient_name: recipientName.trim(), recipient_email: recipientEmail.trim(), cc_recipients: ccRecipients }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setTemplateId(data.template_id)
      setReviewToken(data.review_token)
      setSubject(data.subject)
      setSenderName(data.sender_name)
      setSenderEmail(data.sender_email)
      setCcComposed(data.cc_recipients ?? [])
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
          cc_recipients: ccComposed, subject, html: editor.getHTML(),
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
            <div>
              <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '1px', display: 'block', marginBottom: '6px' }}>
                Primary Recipient {primaryContact && <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(only their decision gates publishing)</span>}
              </span>
              <div style={{ display: 'flex', gap: '8px' }}>
                <Input value={recipientName} onChange={e => setRecipientName(e.target.value)} placeholder="Recipient name" style={{ flex: 1 }} />
                <Input type="email" value={recipientEmail} onChange={e => setRecipientEmail(e.target.value)} placeholder="contact@client.com" style={{ flex: 1 }} />
              </div>
              {!primaryContact && (
                <div style={{ fontSize: '11.5px', color: 'var(--ink4)', marginTop: '4px' }}>No primary contact configured on this event&apos;s Integrations page — enter one manually.</div>
              )}
            </div>

            {ccContacts.length > 0 && (
              <div>
                <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '1px', display: 'block', marginBottom: '6px' }}>
                  CC (each gets their own link, tracked individually — informational only)
                </span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {ccContacts.map(c => {
                    const checked = selectedCcIds.has(c.id)
                    return (
                      <label key={c.id} style={{
                        display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 10px', borderRadius: '8px',
                        border: `1.5px solid ${checked ? 'var(--teal-mid)' : 'var(--border)'}`,
                        background: checked ? 'var(--teal-light)' : 'transparent',
                        color: 'var(--ink2)', fontSize: '12px', fontWeight: 700, cursor: 'pointer',
                      }}>
                        <input type="checkbox" checked={checked} onChange={() => toggleCc(c.id)} style={{ margin: 0 }} />
                        {c.name} <span style={{ color: 'var(--ink4)', fontWeight: 400 }}>({c.email})</span>
                      </label>
                    )
                  })}
                </div>
              </div>
            )}

            <div>
              <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '1px', display: 'block', marginBottom: '6px' }}>Add someone else to CC (optional)</span>
              <div style={{ display: 'flex', gap: '8px' }}>
                <Input value={extraCcName} onChange={e => setExtraCcName(e.target.value)} placeholder="Name" style={{ flex: 1 }} />
                <Input type="email" value={extraCcEmail} onChange={e => setExtraCcEmail(e.target.value)} placeholder="Email" style={{ flex: 1 }} />
              </div>
            </div>

            {pickError && <div style={{ fontSize: '14.5px', color: 'var(--red)' }}>{pickError}</div>}
            <Button variant="teal" onClick={startCompose}>{composing ? 'Composing…' : 'Compose Email'}</Button>
          </div>
        )}

        {(step === 'edit' || step === 'sending' || step === 'error') && (
          <div style={{ display: 'grid', gap: '12px' }}>
            <div style={{ fontSize: '14px', color: 'var(--ink3)' }}>
              Sending as <strong style={{ color: 'var(--ink2)' }}>{senderName}</strong> &lt;{senderEmail}&gt; to <strong style={{ color: 'var(--ink2)' }}>{recipientEmail}</strong>
              {ccComposed.length > 0 && <> · cc (separate emails, own links) <strong style={{ color: 'var(--ink2)' }}>{ccComposed.map(c => c.email).join(', ')}</strong></>}
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
