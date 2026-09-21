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
   as SendToSpeakerComposer.tsx, built directly against that precedent, but
   differs in two ways: a quick-pick toggle for the speaker's own email
   (per Madhu — "by default let there be an option to quickly select the
   available email id from this specific speaker's record") vs typing a
   different To name/email (an assistant, their office), and the resulting
   email carries a real no-login review link rather than just informing —
   see the compose route's own doc comment for how the token survives
   compose → edit → send without ever being regenerated mid-flow.

   Additional Contacts (2026-09-20, Madhu) — speaker-only (speakerId is
   undefined for a partner announcement, so this is a no-op there): the
   quick-pick step above now also offers each of the speaker's own saved
   Additional Contacts (an assistant, their office — see
   AdditionalContactsCard.tsx) as its own "To" option, and CC defaults to
   every one of THEM automatically the moment they load, rather than a
   producer retyping the same assistant's email on every single send.
   Still fully editable/removable before sending — this is a default, not
   a lock. */

type AdditionalContact = { id: string; first_name: string | null; last_name: string | null; email: string }

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
  const [recipientMode, setRecipientMode] = useState<'own' | 'manual' | string>(initialRecipientEmail ? 'own' : 'manual')
  const [step, setStep] = useState<'pick' | 'edit' | 'sending' | 'error'>('pick')
  const [recipientName, setRecipientName] = useState(initialRecipientName)
  const [recipientEmail, setRecipientEmail] = useState(initialRecipientEmail)
  const [ccInput, setCcInput] = useState('')
  const [additionalContacts, setAdditionalContacts] = useState<AdditionalContact[]>([])
  const [pickError, setPickError] = useState<string | null>(null)
  const [composing, setComposing] = useState(false)

  useEffect(() => {
    if (!speakerId) return
    fetch(`/api/events/stakeholders/speakers/${speakerId}/additional-contacts`)
      .then(res => res.json())
      .then(data => {
        const contacts = (data.contacts ?? []) as AdditionalContact[]
        setAdditionalContacts(contacts)
        // Only default CC on first load, before anyone's touched it —
        // never clobber a producer's own edit made while this was loading.
        setCcInput(prev => prev || contacts.map(c => c.email).join(', '))
      })
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetch once per composer open, keyed on the speaker
  }, [speakerId])

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
    setRecipientMode('own')
    setRecipientName(initialRecipientName)
    setRecipientEmail(initialRecipientEmail)
  }
  function chooseManual() {
    setRecipientMode('manual')
    setRecipientName('')
    setRecipientEmail('')
  }
  function chooseContact(c: AdditionalContact) {
    setRecipientMode(c.id)
    setRecipientName([c.first_name, c.last_name].filter(Boolean).join(' ') || c.email)
    setRecipientEmail(c.email)
  }

  async function startCompose() {
    if (!recipientName.trim() || !recipientEmail.trim()) {
      setPickError('Enter a recipient name and email.')
      return
    }
    const cc = parseCc()
    setComposing(true); setPickError(null)
    try {
      const res = await fetch(`/api/events/stakeholders/announcements/${announcementId}/send-for-external-approval/compose`, {
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
      const res = await fetch(`/api/events/stakeholders/announcements/${announcementId}/send-for-external-approval/send`, {
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
          <div style={{ fontSize: '17px', fontWeight: 800, color: 'var(--ink)' }}>Send for External Approval — {stakeholderName}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '20px', color: 'var(--ink3)', cursor: 'pointer' }}>×</button>
        </div>

        {step === 'pick' && (
          <div style={{ display: 'grid', gap: '14px' }}>
            {(initialRecipientEmail || additionalContacts.length > 0) && (
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {initialRecipientEmail && (
                  <Button variant={recipientMode === 'own' ? 'teal' : 'ghost'} onClick={chooseOwnEmail}>
                    Use {stakeholderName}&apos;s email ({initialRecipientEmail})
                  </Button>
                )}
                {additionalContacts.map(c => (
                  <Button key={c.id} variant={recipientMode === c.id ? 'teal' : 'ghost'} onClick={() => chooseContact(c)}>
                    Send to {[c.first_name, c.last_name].filter(Boolean).join(' ') || c.email}
                  </Button>
                ))}
                <Button variant={recipientMode === 'manual' ? 'teal' : 'ghost'} onClick={chooseManual}>
                  Send to someone else
                </Button>
              </div>
            )}
            {recipientMode === 'manual' && (
              <>
                <div>
                  <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '1px', display: 'block', marginBottom: '6px' }}>Recipient Name</span>
                  <Input value={recipientName} onChange={e => setRecipientName(e.target.value)} placeholder="e.g. their assistant or office" />
                </div>
                <div>
                  <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '1px', display: 'block', marginBottom: '6px' }}>Recipient Email</span>
                  <Input type="email" value={recipientEmail} onChange={e => setRecipientEmail(e.target.value)} placeholder="office@example.com" />
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
