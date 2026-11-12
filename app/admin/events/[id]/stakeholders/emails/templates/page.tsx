'use client'

import { use, useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import PageHeader from '@/app/components/PageHeader'
import { Badge, Button, Card, Input } from '@/app/components/ui'
import { useBreadcrumbLabel } from '@/app/lib/nav/breadcrumb-labels'
import { notify } from '@/app/lib/ui/notify'
import { ReviewPanel, type ReviewInfo } from '../ReviewPanel'
import { renderSpeakerEmail } from '@/app/lib/speaker-emails/render'
import { EVENT_TOKENS, PERSON_TOKENS, applyTokens, applyTokensPlain, personValues, type RequiredField } from '@/app/lib/emails/templates'

/* Emails → Templates (2026-11-12, phase 3). A template is the BODY of an email with {{placeholders}}; the greeting and sign-off are added per person. Shared templates are edited
   by admins; a producer customises a copy for this event, or makes a new one. A required field (for example the photo gallery link) blocks sending until it is filled. */

type Template = {
  id: string; name: string; description: string | null; subject: string; body_html: string; required_fields: RequiredField[]; allow_assistant: boolean
  default_sender_mode: 'me' | 'speaker_producer' | null; default_audience: 'confirmed' | 'spoke' | 'confirmed_or_spoke' | null; event_id: string | null; parent_template_id: string | null; is_shared: boolean; review?: ReviewInfo | null
}
type Other = { id: string; name: string; category: string; description: string | null }
type Draft = Omit<Template, 'id'> & { id: string | null }

const blank = (shared: boolean): Draft => ({ id: null, name: '', description: '', subject: '', body_html: '', required_fields: [], allow_assistant: false, default_sender_mode: null, default_audience: null, event_id: null, parent_template_id: null, is_shared: shared })
const label: React.CSSProperties = { fontSize: '12.5px', fontWeight: 700, color: 'var(--ink3)', marginBottom: '4px' }
const select: React.CSSProperties = { width: '100%', padding: '9px 10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--ink)', fontSize: '13px' }

export default function TemplatesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = use(params)
  const [eventName, setEventName] = useState<string | null>(null)
  useBreadcrumbLabel(eventId, eventName)
  const [ev, setEv] = useState<Record<string, string | null>>({})
  const [templates, setTemplates] = useState<Template[]>([])
  const [others, setOthers] = useState<Other[]>([])
  const [canShared, setCanShared] = useState(false)
  const [canEvent, setCanEvent] = useState(false)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [saving, setSaving] = useState(false)
  const [tick, setTick] = useState(0)

  const editor = useEditor({
    extensions: [StarterKit.configure({ heading: false, blockquote: false, codeBlock: false, code: false, horizontalRule: false, strike: false, link: { openOnClick: false } })],
    content: '', immediatelyRender: false,
    editorProps: { attributes: { 'aria-label': 'Template body', style: 'min-height:220px;outline:none;' } },
    onUpdate: () => setTick(t => t + 1),
  })

  const load = useCallback(async () => {
    const r = await fetch(`/api/events/stakeholders/email-templates?event_id=${eventId}`)
    const d = await r.json().catch(() => ({}))
    if (r.ok) { setTemplates(d.templates ?? []); setOthers(d.others ?? []); setCanShared(!!d.can_edit_shared); setCanEvent(!!d.can_edit_event) }
  }, [eventId])
  // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch on mount
  useEffect(() => { void load() }, [load])
  useEffect(() => {
    fetch(`/api/events?id=${eventId}`).then(r => r.json()).then(d => { const e = Array.isArray(d) ? d[0] : d; setEventName(e?.name ?? null); setEv(e ?? {}) }).catch(() => {})
  }, [eventId])

  function open(t: Draft) { setDraft(t); editor?.commands.setContent(t.body_html || ''); setTick(x => x + 1) }
  const readOnly = !!draft && (draft.id ? (draft.event_id ? !canEvent : !canShared) : (draft.is_shared ? !canShared : !canEvent))
  const html = () => editor?.getHTML() ?? ''

  const set = (patch: Partial<Draft>) => setDraft(d => (d ? { ...d, ...patch } : d))
  const setField = (i: number, patch: Partial<RequiredField>) => setDraft(d => (d ? { ...d, required_fields: d.required_fields.map((f, j) => (j === i ? { ...f, ...patch } : f)) } : d))
  const insert = (key: string) => editor?.chain().focus().insertContent(`{{${key}}}`).run()

  async function save() {
    if (!draft) return
    setSaving(true)
    const payload = { event_id: eventId, name: draft.name, description: draft.description, subject: draft.subject, body_html: html(), required_fields: draft.required_fields, allow_assistant: draft.allow_assistant, default_sender_mode: draft.default_sender_mode, default_audience: draft.default_audience, shared: draft.is_shared }
    const r = await fetch(draft.id ? `/api/events/stakeholders/email-templates?id=${draft.id}` : '/api/events/stakeholders/email-templates', { method: draft.id ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    const d = await r.json().catch(() => ({}))
    setSaving(false)
    if (!r.ok) { notify(d.error ?? 'Could not save the template.', 'error'); return }
    notify('Template saved.', 'success'); await load(); open(d.template as Draft)
  }
  async function copy(t: Template) {
    const r = await fetch('/api/events/stakeholders/email-templates', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event_id: eventId, copy_of: t.id }) })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { notify(d.error ?? 'Could not make a copy.', 'error'); return }
    notify('A copy for this event was made. Edit it as you like; the shared one is untouched.', 'success'); await load(); open(d.template as Draft)
  }
  async function archive() {
    if (!draft?.id) return
    const r = await fetch(`/api/events/stakeholders/email-templates?id=${draft.id}`, { method: 'DELETE' })
    notify(r.ok ? 'Template archived. Emails already sent keep their record.' : 'Could not archive it.', r.ok ? 'success' : 'error')
    if (r.ok) { setDraft(null); void load() }
  }

  const sample = useMemo(() => {
    const dates = ev.public_dates_display || null
    const vals: Record<string, string> = { event_name: (ev.public_name || ev.name || 'Your event') as string, event_dates: dates ?? '[event dates]', event_venue: (ev.public_venue_display as string) || '[venue]', ...personValues('Asha Rao') }
    for (const f of draft?.required_fields ?? []) vals[f.key] = f.kind === 'url' ? 'https://example.com/your-link' : `[${f.label}]`
    return vals
  }, [ev, draft?.required_fields])
  const preview = useMemo(() => renderSpeakerEmail({ bodyHtml: applyTokens(html(), sample), publicName: 'Asha Rao', producerName: 'Sender name' }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the editor content changes with `tick`
    [tick, sample])

  const shared = templates.filter(t => !t.event_id), mine = templates.filter(t => t.event_id)

  return (
    <div>
      <PageHeader eyebrow="Stakeholder Hub" title="Emails" description="Reusable emails with placeholders. In Create email, search for one, preview it, and use it as the starting point: your edits there never change the template." backHref={`/admin/events/${eventId}/stakeholders`} backLabel="Back to Stakeholder Hub" />
      <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start', padding: '20px 32px 56px', maxWidth: '1300px', flexWrap: 'wrap' }}>
        <div style={{ width: '300px', flexShrink: 0, display: 'grid', gap: '12px' }}>
          <Card padded>
            <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '0.6px', textTransform: 'uppercase', color: 'var(--teal-mid)', marginBottom: '8px' }}>Shared templates</div>
            {shared.map(t => (
              <button key={t.id} type="button" onClick={() => open(t)} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px', borderRadius: '8px', border: `1px solid ${draft?.id === t.id ? 'var(--teal-mid)' : 'transparent'}`, background: draft?.id === t.id ? 'var(--teal-light)' : 'none', cursor: 'pointer', marginBottom: '2px' }}>
                <div style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--ink)' }}>{t.name} {t.review?.state === 'stale' && <Badge color="amber">Needs review</Badge>}</div>
                {t.required_fields.length > 0 && <div style={{ fontSize: '11.5px', color: 'var(--ink3)' }}>Needs: {t.required_fields.map(f => f.label).join(', ')}</div>}
              </button>
            ))}
            {canShared && <Button variant="ghost" onClick={() => open(blank(true))}>+ New shared template</Button>}
          </Card>
          <Card padded>
            <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '0.6px', textTransform: 'uppercase', color: 'var(--teal-mid)', marginBottom: '8px' }}>For this event</div>
            {mine.length === 0 && <div style={{ fontSize: '12.5px', color: 'var(--ink3)', marginBottom: '8px' }}>None yet. Customise a shared one, or start your own.</div>}
            {mine.map(t => (
              <button key={t.id} type="button" onClick={() => open(t)} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px', borderRadius: '8px', border: `1px solid ${draft?.id === t.id ? 'var(--teal-mid)' : 'transparent'}`, background: draft?.id === t.id ? 'var(--teal-light)' : 'none', cursor: 'pointer', marginBottom: '2px' }}>
                <div style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--ink)' }}>{t.name} {t.review?.state === 'stale' && <Badge color="amber">Needs review</Badge>}</div>
              </button>
            ))}
            {canEvent && <Button variant="ghost" onClick={() => open(blank(false))}>+ New template for this event</Button>}
          </Card>
          {others.length > 0 && (
            <Card padded>
              <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '0.6px', textTransform: 'uppercase', color: 'var(--ink3)', marginBottom: '6px' }}>Other templates</div>
              <div style={{ fontSize: '12px', color: 'var(--ink3)', lineHeight: 1.5, marginBottom: '6px' }}>These send automatically from other parts of EventPilot (onboarding invites, announcements, approvals). They are managed in Admin → Email Templates.</div>
              {others.map(o => <div key={o.id} style={{ fontSize: '12.5px', color: 'var(--ink2)', padding: '3px 0' }}>{o.name} <span style={{ color: 'var(--ink3)' }}>· {o.category}</span></div>)}
            </Card>
          )}
        </div>

        <div style={{ flex: '1 1 560px', minWidth: 0 }}>
          {!draft ? (
            <Card padded><div style={{ fontSize: '14px', color: 'var(--ink2)', lineHeight: 1.7 }}>Choose a template on the left to read or edit it. To use one, go to <Link href={`/admin/events/${eventId}/stakeholders/emails/compose`} style={{ color: 'var(--teal-mid)', fontWeight: 700 }}>Create email</Link> and choose it under “Template”.</div></Card>
          ) : (
            <Card padded>
              {draft.id && !draft.event_id && !canShared && (
                <div style={{ marginBottom: '12px', padding: '10px 12px', borderRadius: '10px', background: 'var(--amber-light)', border: '1px solid var(--amber)', fontSize: '13px', color: 'var(--ink)' }}>
                  This is a shared template, edited by admins. <button type="button" onClick={() => copy(draft as Template)} style={{ background: 'none', border: 'none', padding: 0, color: 'var(--teal-mid)', fontWeight: 800, cursor: 'pointer' }}>Customise a copy for this event</button> to change the wording for this event only.
                </div>
              )}
              {draft.id && !draft.event_id && canShared && (
                <div style={{ marginBottom: '12px', fontSize: '12.5px', color: 'var(--ink3)' }}>Shared: changes here apply to every event that uses it from now on. <button type="button" onClick={() => copy(draft as Template)} style={{ background: 'none', border: 'none', padding: 0, color: 'var(--teal-mid)', fontWeight: 700, cursor: 'pointer' }}>Customise a copy for this event instead</button></div>
              )}
              {draft.id && <div style={{ marginBottom: '12px' }}><ReviewPanel eventId={eventId} templateId={draft.id} review={templates.find(t => t.id === draft.id)?.review ?? null} onChanged={() => { void load() }} onApply={h => { editor?.commands.setContent(h); setTick(x => x + 1) }} /></div>}
              <div style={{ display: 'grid', gap: '12px' }}>
                <div><div style={label}>Name</div><Input value={draft.name} disabled={readOnly} onChange={e => set({ name: e.target.value })} placeholder="e.g. Thank you after the event" /></div>
                <div><div style={label}>What it is for (only producers see this)</div><Input value={draft.description ?? ''} disabled={readOnly} onChange={e => set({ description: e.target.value })} /></div>
                <div><div style={label}>Subject</div><Input value={draft.subject} disabled={readOnly} onChange={e => set({ subject: e.target.value })} placeholder="One line. Placeholders such as {{event_name}} work here too." /></div>
                <div>
                  <div style={label}>Message. The greeting and the sender’s sign-off are added for you.</div>
                  {!readOnly && (
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '6px' }}>
                      {[...EVENT_TOKENS, ...PERSON_TOKENS, ...draft.required_fields.filter(f => f.key).map(f => ({ key: f.key, label: f.label }))].map(t => (
                        <button key={t.key} type="button" onClick={() => insert(t.key)} title={`Insert {{${t.key}}}`} style={{ fontSize: '11.5px', fontWeight: 700, padding: '3px 9px', borderRadius: '999px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--ink2)', cursor: 'pointer' }}>+ {t.label}</button>
                      ))}
                    </div>
                  )}
                  <div style={{ border: '1px solid var(--border)', borderRadius: '10px', background: 'var(--card)', padding: '12px 14px', fontSize: '15px', lineHeight: 1.65, opacity: readOnly ? 0.75 : 1 }}><EditorContent editor={editor} /></div>
                </div>

                <div>
                  <div style={label}>Required fields. Sending is blocked until each one is filled.</div>
                  {draft.required_fields.map((f, i) => (
                    <div key={i} style={{ display: 'flex', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
                      <div style={{ flex: '1 1 140px' }}><Input value={f.key} disabled={readOnly} onChange={e => setField(i, { key: e.target.value })} placeholder="field_name" /></div>
                      <div style={{ flex: '2 1 180px' }}><Input value={f.label} disabled={readOnly} onChange={e => setField(i, { label: e.target.value })} placeholder="What the producer sees, e.g. Photo gallery link" /></div>
                      <select value={f.kind} disabled={readOnly} onChange={e => setField(i, { kind: e.target.value as 'url' | 'text' })} style={{ ...select, width: '110px' }}><option value="url">Link</option><option value="text">Text</option></select>
                      {!readOnly && <Button variant="ghost" onClick={() => set({ required_fields: draft.required_fields.filter((_, j) => j !== i) })}>Remove</Button>}
                    </div>
                  ))}
                  {!readOnly && draft.required_fields.length < 5 && <Button variant="ghost" onClick={() => set({ required_fields: [...draft.required_fields, { key: '', label: '', kind: 'text' }] })}>+ Add a required field</Button>}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px' }}>
                  <div><div style={label}>Create email starts with this sender</div>
                    <select value={draft.default_sender_mode ?? ''} disabled={readOnly} onChange={e => set({ default_sender_mode: (e.target.value || null) as Draft['default_sender_mode'] })} style={select}>
                      <option value="">No preference</option><option value="me">The producer sending it</option><option value="speaker_producer">Each speaker’s own producer</option>
                    </select></div>
                </div>

                <div>
                  <div style={label}>How it will look (sample name and values)</div>
                  <div style={{ fontSize: '12.5px', color: 'var(--ink2)', marginBottom: '6px' }}>Subject: <strong>{applyTokensPlain(draft.subject, sample)}</strong></div>
                  <iframe title="Template preview" srcDoc={preview} sandbox="" style={{ width: '100%', height: '300px', border: '1px solid var(--border)', borderRadius: '10px', background: 'white' }} />
                </div>

                {!readOnly && (
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                    <Button variant="teal" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save template'}</Button>
                    {draft.id && <Button variant="ghost" onClick={archive}>Archive</Button>}
                    <Button variant="ghost" onClick={() => setDraft(null)}>Close</Button>
                    <Badge color={draft.event_id || !draft.is_shared ? 'purple' : 'teal'}>{draft.event_id || !draft.is_shared ? 'For this event' : 'Shared'}</Badge>
                  </div>
                )}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
