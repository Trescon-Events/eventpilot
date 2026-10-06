'use client'
import { useRef, useState } from 'react'
import { Button, Badge, Input, Textarea } from '@/app/components/ui'

/* The event's two guest-invite emails (the invite and the reminder). Generate drafts
   one from Event Details + the Messaging Doc (nothing is saved until Save). The editor
   is plain text — a blank line starts a new paragraph; {{placeholders}} are filled
   per speaker at send time. A live preview shows it rendered with sample values and
   the event's content-rule findings. */

export type Finding = { message: string; match: string }
export type TemplateInfo = { id: string; subject: string; body_html: string; updated_at: string; html: string; errors: Finding[]; warnings: Finding[] } | null
type Kind = 'guest_invite' | 'guest_invite_reminder'
type Variable = { key: string; label: string; kinds: Kind[] }

const TITLE: Record<Kind, string> = { guest_invite: 'Invite email', guest_invite_reminder: 'Reminder email' }
const BLURB: Record<Kind, string> = {
  guest_invite: 'Sent first, offering the speaker their personal link.',
  guest_invite_reminder: 'A single kind reminder. Its wording adapts to how many guests have already registered.',
}

const htmlToText = (html: string) => html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>\s*/gi, '\n\n').replace(/<p[^>]*>/gi, '').replace(/<[^>]+>/g, '').replace(/&rarr;/g, '→').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const textToHtml = (text: string) => text.trim().split(/\n{2,}/).map(p => {
  const t = p.trim()
  if (/^\{\{\s*guest_link_button\s*\}\}$/.test(t)) return '{{guest_link_button}}'
  return `<p>${esc(t).replace(/\n/g, '<br/>')}</p>`
}).join('\n')

export default function TemplatesCard({ eventId, templates, variables, canEdit, onSaved, say }: {
  eventId: string
  templates: Record<Kind, TemplateInfo>
  variables: Variable[]
  canEdit: boolean
  onSaved: () => void
  say: (text: string, type?: 'success' | 'error') => void
}) {
  return (
    <div style={{ display: 'grid', gap: '16px' }}>
      {(['guest_invite', 'guest_invite_reminder'] as Kind[]).map(kind => (
        <TemplateEditor key={kind} eventId={eventId} kind={kind} saved={templates[kind]} variables={variables.filter(v => v.kinds.includes(kind))} canEdit={canEdit} onSaved={onSaved} say={say} />
      ))}
    </div>
  )
}

function TemplateEditor({ eventId, kind, saved, variables, canEdit, onSaved, say }: {
  eventId: string; kind: Kind; saved: TemplateInfo; variables: Variable[]; canEdit: boolean; onSaved: () => void; say: (t: string, ty?: 'success' | 'error') => void
}) {
  const [draft, setDraft] = useState<{ subject: string; text: string; html: string; errors: Finding[]; warnings: Finding[]; source?: string; notes?: string[] } | null>(null)
  const [busy, setBusy] = useState(false)
  const shown = draft ?? (saved ? { subject: saved.subject, text: htmlToText(saved.body_html), html: saved.html, errors: saved.errors, warnings: saved.warnings } : null)

  async function generate() {
    setBusy(true)
    const res = await fetch('/api/events/guest-invites/template', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event_id: eventId, kind }) })
    const d = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) { say(d.error ?? 'Could not generate.', 'error'); return }
    setDraft({ subject: d.subject, text: htmlToText(d.body_html), html: d.html, errors: d.errors ?? [], warnings: d.warnings ?? [], source: d.source, notes: d.notes })
  }

  // Live preview + rule check of the wording being edited, ~0.5 s after the last keystroke.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const seq = useRef(0)
  function refreshPreview(text: string, subject: string) {
    setDraft(d => ({ subject, text, html: d?.html ?? shown?.html ?? '', errors: d?.errors ?? shown?.errors ?? [], warnings: d?.warnings ?? shown?.warnings ?? [], source: d?.source, notes: d?.notes }))
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      const mine = ++seq.current
      const res = await fetch('/api/events/guest-invites/template', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event_id: eventId, kind, preview: { subject, body_html: textToHtml(text) } }) })
      const d = await res.json().catch(() => null)
      if (mine !== seq.current || !res.ok || !d) return
      setDraft(cur => cur ? { ...cur, html: d.html, errors: d.errors ?? [], warnings: d.warnings ?? [] } : cur)
    }, 500)
  }

  async function save() {
    if (!shown) return
    setBusy(true)
    const res = await fetch('/api/events/guest-invites/template', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event_id: eventId, kind, subject: shown.subject, body_html: textToHtml(shown.text) }) })
    const d = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) {
      setDraft({ ...shown, errors: d.errors ?? [{ message: d.error ?? 'Could not save.', match: '' }], warnings: d.warnings ?? [] })
      say(d.error ?? 'Could not save.', 'error'); return
    }
    setDraft(null); say(`${TITLE[kind]} saved.`); onSaved()
  }

  function insert(key: string) {
    if (!shown) return
    const el = document.getElementById(`tpl-${kind}`) as HTMLTextAreaElement | null
    const token = `{{${key}}}`
    if (!el) { refreshPreview(`${shown.text} ${token}`, shown.subject); return }
    const s = el.selectionStart ?? shown.text.length, e = el.selectionEnd ?? s
    refreshPreview(shown.text.slice(0, s) + token + shown.text.slice(e), shown.subject)
  }

  const dirty = !!draft
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: '12px', background: 'var(--card)', padding: '16px 18px', display: 'grid', gap: '12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--ink)' }}>{TITLE[kind]} {saved ? <Badge color="teal">Saved</Badge> : <Badge color="amber">Not created</Badge>} {dirty && <Badge color="grey">Unsaved changes</Badge>}</div>
          <div style={{ fontSize: '12.5px', color: 'var(--ink3)', marginTop: '2px' }}>{BLURB[kind]}</div>
        </div>
        {canEdit && (
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button variant="ghost" onClick={generate} disabled={busy}>{busy && !dirty ? 'Working…' : saved || draft ? 'Regenerate with AI' : 'Generate with AI'}</Button>
            {dirty && <Button variant="teal" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</Button>}
            {dirty && <Button variant="ghost" onClick={() => setDraft(null)} disabled={busy}>Discard</Button>}
          </div>
        )}
      </div>

      {!shown ? (
        <div style={{ fontSize: '13px', color: 'var(--ink3)', lineHeight: 1.6 }}>
          Nothing yet. <strong>Generate with AI</strong> drafts it from this event’s Event Details and its approved Messaging Doc, checked against the event’s content rules. You can edit it before saving.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '16px', alignItems: 'start' }}>
          <div style={{ display: 'grid', gap: '8px' }}>
            <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink3)' }}>Subject (used only if no thread exists yet — sends normally reply in the speaker’s thread)</label>
            <Input value={shown.subject} disabled={!canEdit} onChange={e => refreshPreview(shown.text, e.target.value)} />
            <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink3)' }}>Wording — blank line = new paragraph</label>
            <Textarea id={`tpl-${kind}`} rows={16} value={shown.text} disabled={!canEdit} onChange={e => refreshPreview(e.target.value, shown.subject)} style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: '12.5px', lineHeight: 1.55 }} />
            {canEdit && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {variables.map(v => (
                  <button key={v.key} title={v.label} onClick={() => insert(v.key)} style={{ padding: '3px 9px', fontSize: '11.5px', border: '1px dashed var(--border)', borderRadius: '999px', background: 'none', color: 'var(--ink2)', cursor: 'pointer' }}>{`{{${v.key}}}`}</button>
                ))}
              </div>
            )}
          </div>
          <div style={{ display: 'grid', gap: '8px' }}>
            <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink3)' }}>Preview with sample values (updates as you type)</label>
            <iframe title={`${kind} preview`} srcDoc={shown.html} sandbox="" style={{ width: '100%', height: '430px', border: '1px solid var(--border)', borderRadius: '8px', background: 'white' }} />
          </div>
        </div>
      )}

      {shown && (shown.errors.length > 0 || shown.warnings.length > 0 || (draft?.notes?.length ?? 0) > 0 || draft?.source === 'fallback') && (
        <div style={{ display: 'grid', gap: '4px', fontSize: '12.5px' }}>
          {draft?.source === 'fallback' && <div style={{ color: 'var(--amber)' }}>The AI draft didn’t pass the content rules, so this is the standard wording.</div>}
          {draft?.notes?.map((n, i) => <div key={i} style={{ color: 'var(--ink4)' }}>{n}</div>)}
          {shown.errors.map((f, i) => <div key={`e${i}`} style={{ color: 'var(--red)' }}>✕ {f.message} {f.match && <em>“{f.match}”</em>}</div>)}
          {shown.warnings.map((f, i) => <div key={`w${i}`} style={{ color: 'var(--amber)' }}>⚠ {f.message} {f.match && <em>“{f.match}”</em>}</div>)}
        </div>
      )}
    </div>
  )
}
