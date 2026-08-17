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

/* Self Promo's "Send to Speaker" flow — same two-step stateless-compose /
   write-on-send shape as InviteComposer.tsx (stakeholders/InviteComposer.tsx),
   built directly against that precedent. Differs in exactly two ways: no
   category/template picker (a self_promo announcement always sends the
   fixed "Speaker Self Promo Request Email" template, resolved server-side),
   and CC support (producer may want a copy or to loop in a colleague —
   plain comma-separated input, parsed on submit; no chip-input complexity
   needed for what's typically 0-2 extra addresses). */

type Props = {
  announcementId: string
  speakerName: string
  onClose: () => void
  onSent: () => void
  initialRecipientName?: string
  initialRecipientEmail?: string
}

export default function SendToSpeakerComposer({
  announcementId, speakerName, onClose, onSent,
  initialRecipientName = '', initialRecipientEmail = '',
}: Props) {
  const [step, setStep] = useState<'pick' | 'edit' | 'sending' | 'error'>('pick')
  const [recipientName, setRecipientName] = useState(initialRecipientName)
  const [recipientEmail, setRecipientEmail] = useState(initialRecipientEmail)
  const [ccInput, setCcInput] = useState('')
  const [pickError, setPickError] = useState<string | null>(null)
  const [composing, setComposing] = useState(false)

  const [templateId, setTemplateId] = useState('')
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

  async function startCompose() {
    if (!recipientName.trim() || !recipientEmail.trim()) {
      setPickError('Enter the speaker’s name and email.')
      return
    }
    const cc = parseCc()
    setComposing(true); setPickError(null)
    try {
      const res = await fetch(`/api/events/stakeholders/announcements/${announcementId}/send-to-speaker/compose`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipient_name: recipientName.trim(), recipient_email: recipientEmail.trim(), cc_emails: cc }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setTemplateId(data.template_id)
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

  // Same click-to-edit-link behavior as InviteComposer's own handler —
  // matches the established convention rather than introducing a second one.
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
      const res = await fetch(`/api/events/stakeholders/announcements/${announcementId}/send-to-speaker/send`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template_id: templateId, recipient_name: recipientName.trim(), recipient_email: recipientEmail.trim(),
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
          <div style={{ fontSize: '17px', fontWeight: 800, color: 'var(--ink)' }}>Send to {speakerName}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '20px', color: 'var(--ink3)', cursor: 'pointer' }}>×</button>
        </div>

        {step === 'pick' && (
          <div style={{ display: 'grid', gap: '14px' }}>
            <div>
              <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '1px', display: 'block', marginBottom: '6px' }}>Recipient Name</span>
              <Input value={recipientName} onChange={e => setRecipientName(e.target.value)} placeholder="e.g. Ahmad Khalid Khairi" />
            </div>
            <div>
              <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '1px', display: 'block', marginBottom: '6px' }}>Recipient Email</span>
              <Input type="email" value={recipientEmail} onChange={e => setRecipientEmail(e.target.value)} placeholder="speaker@example.com" />
            </div>
            <div>
              <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '1px', display: 'block', marginBottom: '6px' }}>CC (optional)</span>
              <Input value={ccInput} onChange={e => setCcInput(e.target.value)} placeholder="comma-separated, e.g. colleague@trescon.com, apeksha@trescon.com" />
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
