'use client'

import { useState, useEffect } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import Underline from '@tiptap/extension-underline'
import { TextStyle } from '@tiptap/extension-text-style'
import Color from '@tiptap/extension-color'
import { Button, Input, ProcessingOverlay } from '@/app/components/ui'
import RichTextToolbar from '@/app/components/RichTextToolbar'

/* Invite compose flow — Phase 3 of the SAE producer-workflow initiative.
   Two steps: pick a template + recipient (stateless — nothing is written
   to the DB yet, see .../invites/compose/route.ts), then edit the
   rendered content and Send (the ONLY write path, .../invites/send).
   A producer who closes this without sending leaves zero rows behind.

   No header-replace/reset chrome and no AI-rewrite panel — unlike
   EmailBodyEditor.tsx (Phase 2, full template editing), this is a one-off
   send: it never touches the template's stored header, and AI-rewrite is
   an explicit non-goal for v1 (see the Phase 3 plan). */

type FormType = 'speaker' | 'sponsor' | 'media_partner' | 'association_partner'
type TemplateOption = { id: string; name: string; subject: string; variable_hints: { key: string; label?: string }[]; sender_name: string; sender_email: string }

const FORM_TYPE_LABELS: Record<FormType, string> = {
  speaker: 'Speaker', sponsor: 'Sponsor', media_partner: 'Media Partner', association_partner: 'Association Partner',
}

type Props = {
  eventId: string
  // Fixed when opened from a single category tab; omitted when opened from
  // the unified top-level Invites tab, which shows a Category picker
  // instead since it isn't scoped to one form_type.
  formType?: FormType
  onClose: () => void
  onSent: () => void
  // Pre-fills the picker step for a reminder — reopening this same compose
  // flow for someone already invited (2026-08-14, per Madhu: reminders
  // should let the producer add extra text before sending, not silently
  // resend the original verbatim) rather than a separate instant-resend
  // path. Still requires clicking "Compose Email" like any new invite —
  // only the initial field values differ.
  initialTemplateId?: string
  initialRecipientName?: string
  initialRecipientEmail?: string
  title?: string
}

export default function InviteComposer({
  eventId, formType: fixedFormType, onClose, onSent,
  initialTemplateId = '', initialRecipientName = '', initialRecipientEmail = '', title,
}: Props) {
  const [step, setStep] = useState<'pick' | 'edit' | 'sending' | 'error'>('pick')
  const [templates, setTemplates] = useState<TemplateOption[]>([])
  const [templateId, setTemplateId] = useState(initialTemplateId)
  const [recipientName, setRecipientName] = useState(initialRecipientName)
  const [recipientEmail, setRecipientEmail] = useState(initialRecipientEmail)
  const [pickedFormType, setPickedFormType] = useState<FormType | ''>(fixedFormType ?? '')
  const [pickError, setPickError] = useState<string | null>(null)
  const [composing, setComposing] = useState(false)

  const [inviteToken, setInviteToken] = useState('')
  const [subject, setSubject] = useState('')
  const [senderName, setSenderName] = useState('')
  const [senderEmail, setSenderEmail] = useState('')
  const [sendError, setSendError] = useState<string | null>(null)

  const editor = useEditor({
    extensions: [StarterKit, Link.configure({ openOnClick: false }), Underline, TextStyle, Color],
    content: '',
    immediatelyRender: false,
  })

  useEffect(() => {
    fetch(`/api/events/stakeholders/invites/templates?event_id=${eventId}`)
      .then(r => r.json())
      .then(d => setTemplates(Array.isArray(d) ? d : []))
      .catch(() => {})
  }, [eventId])

  async function startCompose() {
    if (!pickedFormType || !templateId || !recipientName.trim() || !recipientEmail.trim()) {
      setPickError('Pick a category, a template, and enter the recipient’s name and email.')
      return
    }
    setComposing(true); setPickError(null)
    try {
      const res = await fetch('/api/events/stakeholders/invites/compose', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_id: eventId, form_type: pickedFormType, template_id: templateId, recipient_name: recipientName.trim(), recipient_email: recipientEmail.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setInviteToken(data.invite_token)
      setSubject(data.subject)
      setSenderName(data.sender_name)
      setSenderEmail(data.sender_email)
      editor?.commands.setContent(data.html)
      setStep('edit')
    } catch (e) {
      setPickError(e instanceof Error ? e.message : 'Could not compose invite')
    }
    setComposing(false)
  }

  // Standard email-builder link behavior (2026-08-14, per Madhu): a plain
  // click on already-linked text should never navigate away mid-edit — it
  // should let the producer view/change the URL instead. Only cmd/ctrl+click
  // actually opens it, to verify the link works. `Link.configure({
  // openOnClick: false })` above already blocks the extension's own
  // navigate-on-click behavior; this adds the edit-on-click / open-on-
  // modifier-click behavior standard editors have on top of that.
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
      const res = await fetch('/api/events/stakeholders/invites/send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invite_token: inviteToken, event_id: eventId, form_type: pickedFormType, template_id: templateId,
          recipient_name: recipientName.trim(), recipient_email: recipientEmail.trim(),
          subject, html: editor.getHTML(),
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
          <div style={{ fontSize: '17px', fontWeight: 800, color: 'var(--ink)' }}>{title ?? (fixedFormType === 'speaker' ? 'Invite a Speaker' : fixedFormType ? 'Invite a Partner' : 'Send an Invite')}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '20px', color: 'var(--ink3)', cursor: 'pointer' }}>×</button>
        </div>

        {step === 'pick' && (
          <div style={{ display: 'grid', gap: '14px' }}>
            {!fixedFormType && (
              <div>
                <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '1px', display: 'block', marginBottom: '6px' }}>Category</span>
                <select value={pickedFormType} onChange={e => setPickedFormType(e.target.value as FormType)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '15px', fontFamily: 'inherit' }}>
                  <option value="">Select a category…</option>
                  {(Object.keys(FORM_TYPE_LABELS) as FormType[]).map(ft => <option key={ft} value={ft}>{FORM_TYPE_LABELS[ft]}</option>)}
                </select>
              </div>
            )}
            <div>
              <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '1px', display: 'block', marginBottom: '6px' }}>Template</span>
              <select value={templateId} onChange={e => setTemplateId(e.target.value)}
                style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '15px', fontFamily: 'inherit' }}>
                <option value="">Select a template…</option>
                {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              {templates.length === 0 && <div style={{ fontSize: '13.5px', color: 'var(--ink4)', marginTop: '6px' }}>No email templates available yet — create one under Email Templates first.</div>}
            </div>
            <div>
              <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '1px', display: 'block', marginBottom: '6px' }}>Recipient Name</span>
              <Input value={recipientName} onChange={e => setRecipientName(e.target.value)} placeholder="e.g. Amara Okafor" />
            </div>
            <div>
              <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '1px', display: 'block', marginBottom: '6px' }}>Recipient Email</span>
              <Input type="email" value={recipientEmail} onChange={e => setRecipientEmail(e.target.value)} placeholder="amara@example.com" />
            </div>
            {pickError && <div style={{ fontSize: '14.5px', color: 'var(--red)' }}>{pickError}</div>}
            <Button variant="teal" onClick={startCompose}>{composing ? 'Composing…' : 'Compose Email'}</Button>
          </div>
        )}

        {(step === 'edit' || step === 'sending' || step === 'error') && (
          <div style={{ display: 'grid', gap: '12px' }}>
            <div style={{ fontSize: '14px', color: 'var(--ink3)' }}>Sending as <strong style={{ color: 'var(--ink2)' }}>{senderName}</strong> &lt;{senderEmail}&gt; to <strong style={{ color: 'var(--ink2)' }}>{recipientEmail}</strong></div>
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
        label={step === 'sending' ? 'Sending invite…' : 'Composing email…'}
        estimatedMs={step === 'sending' ? 2200 : 1200}
      />
    </div>
  )
}
