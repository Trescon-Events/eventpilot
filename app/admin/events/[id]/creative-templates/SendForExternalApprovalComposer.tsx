'use client'

import { useEffect, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import Underline from '@tiptap/extension-underline'
import { TextStyle } from '@tiptap/extension-text-style'
import Color from '@tiptap/extension-color'
import { Button, Input, ProcessingOverlay } from '@/app/components/ui'
import RichTextToolbar from '@/app/components/RichTextToolbar'

/* External approval round's composer (2026-08-26) — the two-layer approval
   feature's second layer, sent to the speaker/their office for sign-off
   before publishing. Same two-step stateless-compose/write-on-send shape
   as SendForClientApprovalComposer.tsx, and — since 2026-09-22 — the exact
   same per-CC-recipient architecture: a quick-pick toggle for the
   speaker's own email vs typing a different main recipient, plus a
   checkbox list of the speaker's saved Additional Contacts (an assistant,
   their office — see AdditionalContactsCard.tsx), pre-checked.

   First-responder-wins (2026-09-22, per Madhu) — previously CC was just a
   comma-separated email list riding along on the speaker's own shared
   link (real gap: an assistant CC'd that way had no way to independently
   act — clicking the link and submitting a decision would have silently
   acted AS the speaker). Rebuilt to match SendForClientApprovalComposer's
   shape exactly: each checked contact gets their OWN review_token and OWN
   personalized email (see compose/send routes' own doc comments) — and
   per approval-round.ts, whichever person (speaker or any CC) responds
   FIRST is the decision for the whole round, with every other pending
   link then showing "already handled by X" the moment it's opened. */

type AdditionalContact = { id: string; first_name: string | null; last_name: string | null; email: string }
type ComposedCc = { name: string; email: string; review_token: string; subject: string; html: string }

type Props = {
  announcementId: string
  stakeholderName: string
  speakerId?: string
  onClose: () => void
  onSent: () => void
  initialRecipientName?: string
  initialRecipientEmail?: string
}

export default function SendForExternalApprovalComposer({
  announcementId, stakeholderName, speakerId, onClose, onSent,
  initialRecipientName = '', initialRecipientEmail = '',
}: Props) {
  const [recipientMode, setRecipientMode] = useState<'own' | 'manual'>(initialRecipientEmail ? 'own' : 'manual')
  const [step, setStep] = useState<'pick' | 'edit' | 'sending' | 'error'>('pick')
  const [recipientName, setRecipientName] = useState(initialRecipientName)
  const [recipientEmail, setRecipientEmail] = useState(initialRecipientEmail)
  const [additionalContacts, setAdditionalContacts] = useState<AdditionalContact[]>([])
  const [selectedCcIds, setSelectedCcIds] = useState<Set<string>>(new Set())
  const [extraCcName, setExtraCcName] = useState('')
  const [extraCcEmail, setExtraCcEmail] = useState('')
  const [pickError, setPickError] = useState<string | null>(null)
  const [composing, setComposing] = useState(false)

  useEffect(() => {
    if (!speakerId) return
    fetch(`/api/events/stakeholders/speakers/${speakerId}/additional-contacts`)
      .then(res => res.json())
      .then(data => {
        const contacts = (data.contacts ?? []) as AdditionalContact[]
        setAdditionalContacts(contacts)
        // Pre-checked, like Client Approval's own CC list — the producer
        // narrows down, doesn't build up from nothing.
        setSelectedCcIds(new Set(contacts.map(c => c.id)))
      })
      .catch(() => {})
  }, [speakerId])

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

  function chooseOwnEmail() {
    setRecipientMode('own')
    setRecipientName(initialRecipientName)
    setRecipientEmail(initialRecipientEmail)
  }
  function chooseManual() {
    setRecipientMode('manual')
    setRecipientName('')
    setRecipientEmail('')
  }

  function contactName(c: AdditionalContact): string {
    return [c.first_name, c.last_name].filter(Boolean).join(' ') || c.email
  }

  async function startCompose() {
    if (!recipientName.trim() || !recipientEmail.trim()) {
      setPickError('Enter a recipient name and email.')
      return
    }
    const ccRecipients: { name: string; email: string }[] = additionalContacts
      .filter(c => selectedCcIds.has(c.id))
      .map(c => ({ name: contactName(c), email: c.email }))
    if (extraCcName.trim() && extraCcEmail.trim()) ccRecipients.push({ name: extraCcName.trim(), email: extraCcEmail.trim() })

    setComposing(true); setPickError(null)
    try {
      const res = await fetch(`/api/events/stakeholders/announcements/${announcementId}/send-for-external-approval/compose`, {
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
      const res = await fetch(`/api/events/stakeholders/announcements/${announcementId}/send-for-external-approval/send`, {
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
          <div style={{ fontSize: '17px', fontWeight: 800, color: 'var(--ink)' }}>Send for External Approval — {stakeholderName}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '20px', color: 'var(--ink3)', cursor: 'pointer' }}>×</button>
        </div>

        {step === 'pick' && (
          <div style={{ display: 'grid', gap: '14px' }}>
            <div>
              <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '1px', display: 'block', marginBottom: '6px' }}>
                Main Recipient {additionalContacts.length > 0 && <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(whoever responds first — this or a CC below — decides)</span>}
              </span>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {initialRecipientEmail && (
                  <Button variant={recipientMode === 'own' ? 'teal' : 'ghost'} onClick={chooseOwnEmail}>
                    Send to {stakeholderName} ({initialRecipientEmail})
                  </Button>
                )}
                <Button variant={recipientMode === 'manual' ? 'teal' : 'ghost'} onClick={chooseManual}>
                  Send to someone else
                </Button>
              </div>
              {recipientMode === 'manual' && (
                <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                  <Input value={recipientName} onChange={e => setRecipientName(e.target.value)} placeholder="Recipient name" style={{ flex: 1 }} />
                  <Input type="email" value={recipientEmail} onChange={e => setRecipientEmail(e.target.value)} placeholder="e.g. their assistant or office" style={{ flex: 1 }} />
                </div>
              )}
            </div>

            {additionalContacts.length > 0 && (
              <div>
                <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '1px', display: 'block', marginBottom: '6px' }}>
                  CC (each gets their own link, can act independently)
                </span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {additionalContacts.map(c => {
                    const checked = selectedCcIds.has(c.id)
                    return (
                      <label key={c.id} style={{
                        display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 10px', borderRadius: '8px',
                        border: `1.5px solid ${checked ? 'var(--teal-mid)' : 'var(--border)'}`,
                        background: checked ? 'var(--teal-light)' : 'transparent',
                        color: 'var(--ink2)', fontSize: '12px', fontWeight: 700, cursor: 'pointer',
                      }}>
                        <input type="checkbox" checked={checked} onChange={() => toggleCc(c.id)} style={{ margin: 0 }} />
                        {contactName(c)} <span style={{ color: 'var(--ink4)', fontWeight: 400 }}>({c.email})</span>
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
            {/* 2026-09-21, Madhu — the review link above is real, clickable
                HTML the moment this draft renders, but its token isn't
                written to the database until Send actually runs (crash-
                safety: the row is created right before the email goes out,
                never before). Clicking it from here 404s with "Approval
                request not found," confirmed live against a real test —
                nothing was broken, the link just isn't live yet at this
                step. */}
            <div style={{ fontSize: '12px', color: 'var(--amber)', background: 'var(--amber-light)', border: '1px solid var(--amber-border)', borderRadius: '8px', padding: '8px 12px' }}>
              Heads up: the review link above won&apos;t work yet — it only goes live once you click Send below.
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
