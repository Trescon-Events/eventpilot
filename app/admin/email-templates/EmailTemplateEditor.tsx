'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Card } from '@/app/components/ui'
import { Input, Textarea } from '@/app/components/ui'
import EmailBodyEditor from './EmailBodyEditor'
import SenderPicker from './SenderPicker'

export type EmailTemplate = {
  id: string; slug: string; name: string; description: string | null; category: string
  subject: string; body_html: string; variable_hints: { key: string; label?: string }[]
  header_image_url: string | null; header_alt_text: string | null
  header_overlay_text: string | null
  sender_name: string; sender_email: string; sender_staff_id: string | null
}

const EMPTY: Omit<EmailTemplate, 'id'> = {
  slug: '', name: '', description: null, category: 'general', subject: '', body_html: '',
  variable_hints: [], header_image_url: null, header_alt_text: 'Trescon', header_overlay_text: null,
  sender_name: '', sender_email: '', sender_staff_id: null,
}

function slugify(name: string) {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

export default function EmailTemplateEditor({ template }: { template?: EmailTemplate }) {
  const router = useRouter()
  const isNew = !template
  const [form, setForm] = useState<Omit<EmailTemplate, 'id'>>(template ?? EMPTY)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [headerBusy, setHeaderBusy] = useState(false)

  const [aiOpen, setAiOpen] = useState(false)
  const [instruction, setInstruction] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [undoSnapshot, setUndoSnapshot] = useState<string | null>(null)

  const [testTo, setTestTo] = useState('')
  const [testing, setTesting] = useState(false)

  function set<K extends keyof typeof form>(key: K, value: typeof form[K]) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  async function save() {
    if (!form.name.trim() || !form.subject.trim() || !form.body_html.trim() || !form.sender_name.trim() || !form.sender_email.trim()) {
      setMsg({ text: 'Name, subject, body, and sender are required.', ok: false })
      return
    }
    setSaving(true); setMsg(null)
    try {
      if (isNew) {
        const res = await fetch('/api/admin/email-templates', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...form, slug: slugify(form.name) }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error)
        router.push(`/admin/email-templates/${data.id}`)
      } else {
        const res = await fetch(`/api/admin/email-templates/${template!.id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error)
        setMsg({ text: 'Saved.', ok: true })
      }
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : 'Save failed', ok: false })
    }
    setSaving(false)
  }

  async function replaceHeader(file: File) {
    if (isNew) { setMsg({ text: 'Save the template first, then replace its header.', ok: false }); return }
    setHeaderBusy(true)
    const fd = new FormData()
    fd.append('file', file)
    const res = await fetch(`/api/admin/email-templates/${template!.id}/header`, { method: 'POST', body: fd })
    const data = await res.json()
    if (res.ok) syncHeaderFields(data)
    setHeaderBusy(false)
  }

  async function resetHeader() {
    if (isNew) { setMsg({ text: 'Save the template first, then reset its header.', ok: false }); return }
    setHeaderBusy(true)
    const res = await fetch(`/api/admin/email-templates/${template!.id}/header`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'reset' }),
    })
    const data = await res.json()
    if (res.ok) syncHeaderFields(data)
    setHeaderBusy(false)
  }

  function syncHeaderFields(data: { header_image_url: string | null; header_base_image_url?: string | null; header_overlay_text: string | null }) {
    setForm(prev => ({ ...prev, header_image_url: data.header_image_url, header_overlay_text: data.header_overlay_text }))
  }

  async function updateHeaderLabel(text: string) {
    if (isNew) { setMsg({ text: 'Save the template first, then set a header label.', ok: false }); return }
    setHeaderBusy(true)
    const res = await fetch(`/api/admin/email-templates/${template!.id}/header`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'set_overlay_text', text }),
    })
    const data = await res.json()
    if (res.ok) syncHeaderFields(data)
    setHeaderBusy(false)
  }

  async function runAiRewrite() {
    if (!instruction.trim()) return
    setAiLoading(true)
    try {
      const res = await fetch('/api/admin/email-templates/ai-rewrite', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ html: form.body_html, instruction }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setUndoSnapshot(form.body_html)
      set('body_html', data.proposed_html)
      setMsg({ text: `AI: ${data.reply}`, ok: true })
      setInstruction('')
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : 'AI rewrite failed', ok: false })
    }
    setAiLoading(false)
  }

  function undoAiRewrite() {
    if (undoSnapshot !== null) { set('body_html', undoSnapshot); setUndoSnapshot(null) }
  }

  async function sendTest() {
    if (isNew) { setMsg({ text: 'Save the template first, then send a test.', ok: false }); return }
    setTesting(true); setMsg(null)
    const res = await fetch(`/api/admin/email-templates/${template!.id}/send-test`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(testTo ? { to: testTo } : {}),
    })
    const data = await res.json()
    setMsg(res.ok ? { text: `Test sent to ${data.to}.`, ok: true } : { text: data.error ?? 'Send failed', ok: false })
    setTesting(false)
  }

  return (
    <div style={{ display: 'grid', gap: '20px', maxWidth: '860px' }}>
      <Card padded>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
          <div>
            <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '1px', display: 'block', marginBottom: '6px' }}>Name</span>
            <Input value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Speaker Onboarding Invite" />
          </div>
          <div>
            <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '1px', display: 'block', marginBottom: '6px' }}>Category</span>
            <Input value={form.category} onChange={e => set('category', e.target.value)} placeholder="e.g. sae" />
          </div>
        </div>
        <div style={{ marginBottom: '14px' }}>
          <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '1px', display: 'block', marginBottom: '6px' }}>Description (optional)</span>
          <Input value={form.description ?? ''} onChange={e => set('description', e.target.value)} placeholder="What is this template used for?" />
        </div>
        <div style={{ marginBottom: '14px' }}>
          <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '1px', display: 'block', marginBottom: '6px' }}>Subject</span>
          <Input value={form.subject} onChange={e => set('subject', e.target.value)} placeholder="You're invited to speak at {{event_name}}" />
        </div>
        <SenderPicker
          senderStaffId={form.sender_staff_id} senderName={form.sender_name} senderEmail={form.sender_email}
          onChange={v => setForm(prev => ({ ...prev, ...v }))}
        />
      </Card>

      <Card padded>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
          <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--ink)' }}>Body</div>
          <Button variant="ghost" onClick={() => setAiOpen(v => !v)}>{aiOpen ? 'Close AI Rewrite' : '✨ Rewrite with AI'}</Button>
        </div>

        {aiOpen && (
          <div style={{ padding: '12px', borderRadius: '8px', background: 'var(--card-hi)', border: '1px solid var(--border)', marginBottom: '14px' }}>
            <Textarea value={instruction} onChange={e => setInstruction(e.target.value)} rows={2}
              placeholder="e.g. Make this warmer and more concise, or: write an invite for a keynote speaker" style={{ marginBottom: '8px' }} />
            <div style={{ display: 'flex', gap: '8px' }}>
              <Button variant="teal" onClick={runAiRewrite}>{aiLoading ? 'Rewriting…' : 'Generate'}</Button>
              {undoSnapshot !== null && <Button variant="ghost" onClick={undoAiRewrite}>Undo AI Rewrite</Button>}
            </div>
          </div>
        )}

        <EmailBodyEditor
          value={form.body_html} onChange={html => set('body_html', html)}
          headerImageUrl={form.header_image_url} headerAltText={form.header_alt_text ?? 'Trescon'}
          headerOverlayText={form.header_overlay_text} onUpdateHeaderLabel={updateHeaderLabel}
          subject={form.subject} onReplaceHeader={replaceHeader} onResetHeader={resetHeader} headerBusy={headerBusy}
        />
      </Card>

      {(form.variable_hints?.length ?? 0) > 0 && (
        <Card padded>
          <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--ink)', marginBottom: '8px' }}>Available Variables</div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {form.variable_hints.map(v => (
              <span key={v.key} style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--teal-mid)', background: 'var(--card-hi)', border: '1px solid var(--border)', borderRadius: '999px', padding: '3px 10px' }}>
                {`{{${v.key}}}`}{v.label ? ` — ${v.label}` : ''}
              </span>
            ))}
          </div>
        </Card>
      )}

      {msg && <div style={{ fontSize: '13px', color: msg.ok ? 'var(--teal-mid)' : 'var(--red)' }}>{msg.text}</div>}

      <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
        <Button variant="teal" onClick={save}>{saving ? 'Saving…' : 'Save'}</Button>
        {!isNew && (
          <>
            <Input value={testTo} onChange={e => setTestTo(e.target.value)} placeholder="Send test to (defaults to you)" style={{ width: '240px' }} />
            <Button variant="ghost" onClick={sendTest}>{testing ? 'Sending…' : 'Send Test'}</Button>
          </>
        )}
      </div>
    </div>
  )
}
