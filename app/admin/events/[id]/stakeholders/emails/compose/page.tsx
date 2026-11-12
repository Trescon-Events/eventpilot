'use client'

import { use, useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import PageHeader from '@/app/components/PageHeader'
import { Button, Card, Input } from '@/app/components/ui'
import { useBreadcrumbLabel } from '@/app/lib/nav/breadcrumb-labels'
import { notify } from '@/app/lib/ui/notify'
import { hasContent, wordCount, renderSpeakerEmail, MAX_ATTACHMENT_BYTES, MAX_ATTACHMENTS } from '@/app/lib/speaker-emails/render'
import EmailsTabs from '../EmailsTabs'

/* Emails → Compose (2026-11-12, phase 2). Choose who (a saved list, or everyone confirmed / who spoke at this event), write the email (Polish and attachments as on the old
   Speaker Emails page), send yourself a test, then review and send. The audience is frozen when you press Send; each person gets the body with their own greeting and the
   sender's sign-off, from the sender's own mailbox, as a new conversation with your subject. Named and saved under Sent with its numbers. */

type Attachment = { name: string; url: string; size: number; type: string }
type Finding = { message: string; match: string }
type Preview = {
  summary: { will_receive: number; excluded: number; reasons: Record<string, number>; via_assistant: number }
  recipients: { key: string; name: string; to: string; cc: string[]; mode: 'own' | 'assistant'; company: string | null }[]
  overlap?: { campaign_id: string; name: string; sent_at: string; overlap: number; total: number }[]
}
type SavedList = { id: string; name: string; event_id: string | null }
type Progress = { status: string; total: number; sent: number; failed: number; skipped: number; queued: number; sending: number }

const CONFIRM_ABOVE = 20
const QUICK: Record<string, { label: string; statuses: string[] }> = {
  confirmed: { label: 'Everyone confirmed at this event', statuses: ['Confirmed', 'New Confirmed', 'Reconfirmed'] },
  spoke: { label: 'Everyone who spoke at this event', statuses: ['Spoke'] },
}
const kb = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`)
const fmt = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
const label: React.CSSProperties = { fontSize: '11px', fontWeight: 800, letterSpacing: '0.5px', textTransform: 'uppercase', color: 'var(--ink3)' }

export default function ComposePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = use(params)
  const [eventName, setEventName] = useState<string | null>(null)
  useBreadcrumbLabel(eventId, eventName)
  const [lists, setLists] = useState<SavedList[]>([])
  const [audience, setAudience] = useState('quick:confirmed')
  const [allowAssistant, setAllowAssistant] = useState(false)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [name, setName] = useState('')
  const [subject, setSubject] = useState('')
  const [senderMode, setSenderMode] = useState<'me' | 'speaker_producer'>('me')
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [uploading, setUploading] = useState(false)
  const [words, setWords] = useState(0)
  const [polishing, setPolishing] = useState(false)
  const [polish, setPolish] = useState<{ before: string; changes: string[]; errors: Finding[]; warnings: Finding[] } | null>(null)
  const [firstOriginal, setFirstOriginal] = useState<string | null>(null)
  const [findings, setFindings] = useState<{ errors: Finding[]; warnings: Finding[] } | null>(null)
  const [reviewing, setReviewing] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState<'test' | 'send' | null>(null)
  const [progress, setProgress] = useState<Progress | null>(null)
  const [done, setDone] = useState<{ id: string; progress: Progress } | null>(null)
  const [myName, setMyName] = useState('')

  const editor = useEditor({
    extensions: [StarterKit.configure({ heading: false, blockquote: false, codeBlock: false, code: false, horizontalRule: false, strike: false, link: { openOnClick: false } })],
    content: '', immediatelyRender: false,
    editorProps: { attributes: { 'aria-label': 'Email message', style: 'min-height:240px;outline:none;' } },
    onUpdate: ({ editor: ed }) => setWords(wordCount(ed.getHTML())),
  })

  useEffect(() => {
    fetch(`/api/events?id=${eventId}`).then(r => r.json()).then(d => setEventName((Array.isArray(d) ? d[0] : d)?.name ?? null)).catch(() => {})
    fetch(`/api/events/stakeholders/email-lists?event_id=${eventId}`).then(r => r.json()).then(d => setLists(d.lists ?? [])).catch(() => {})
    fetch('/api/events/stakeholders/email-campaigns/sender').then(r => r.json()).then(s => setMyName(s?.name ?? '')).catch(() => {})
  }, [eventId])

  const audienceBody = useCallback(() => (audience.startsWith('list:')
    ? { list_id: audience.slice(5) }
    : { filters: { event_ids: [eventId], statuses: QUICK[audience.slice(6)]?.statuses ?? [] }, allow_assistant: allowAssistant }), [audience, allowAssistant, eventId])

  useEffect(() => {
    let live = true
    void (async () => {
      const r = await fetch('/api/events/stakeholders/email-people', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event_id: eventId, include_overlap: true, ...audienceBody() }) })
      const d = await r.json().catch(() => null)
      if (live && r.ok) setPreview(d)
    })()
    return () => { live = false }
  }, [eventId, audienceBody])

  const count = preview?.summary.will_receive ?? 0
  const html = () => editor?.getHTML() ?? ''
  const ready = hasContent(html()) && !!subject.trim() && !!name.trim() && count > 0

  async function addFiles(files: FileList | null) {
    if (!files?.length) return
    setUploading(true)
    try {
      let list = attachments
      for (const f of Array.from(files)) {
        if (list.length >= MAX_ATTACHMENTS) { notify(`Attach at most ${MAX_ATTACHMENTS} files.`, 'error'); break }
        if (list.reduce((n, a) => n + a.size, 0) + f.size > MAX_ATTACHMENT_BYTES) { notify(`“${f.name}” would take the attachments over ${MAX_ATTACHMENT_BYTES / 1048576} MB in total.`, 'error'); continue }
        const fd = new FormData(); fd.append('event_id', eventId); fd.append('file', f)
        const res = await fetch('/api/events/stakeholders/speaker-emails/upload', { method: 'POST', body: fd })
        const d = await res.json().catch(() => ({}))
        if (!res.ok) { notify(d.error ?? `Could not attach “${f.name}”.`, 'error'); continue }
        list = [...list, d as Attachment]; setAttachments(list)
      }
    } finally { setUploading(false) }
  }

  async function runPolish() {
    if (!editor) return
    const before = editor.getHTML()
    if (!hasContent(before)) { notify('Write something first. Polish tidies what you have written.', 'error'); return }
    setPolishing(true)
    try {
      const res = await fetch('/api/events/stakeholders/speaker-emails/polish', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event_id: eventId, body_html: before }) })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { notify(d.error ?? 'Polish did not work. Your text is untouched.', 'error'); return }
      if (firstOriginal === null) setFirstOriginal(before)
      editor.commands.setContent(d.polished_html); setWords(wordCount(d.polished_html))
      setPolish({ before, changes: d.changes ?? [], errors: d.errors ?? [], warnings: d.warnings ?? [] })
    } finally { setPolishing(false) }
  }
  function undoPolish() {
    if (!editor || !polish) return
    editor.commands.setContent(polish.before); setWords(wordCount(polish.before))
    if (polish.before === firstOriginal) setFirstOriginal(null)
    setPolish(null)
  }

  async function sendTest() {
    setBusy('test'); setFindings(null)
    const res = await fetch('/api/events/stakeholders/email-campaigns/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event_id: eventId, subject, body_html: html(), attachments, sample_name: preview?.recipients[0]?.name ?? '' }) })
    const d = await res.json().catch(() => ({}))
    setBusy(null)
    if (res.ok) notify(`A test copy was sent to ${d.to}. It starts with “[TEST]”.`, 'success')
    else { notify(d.error ?? 'Could not send the test.', 'error'); if (d.errors) setFindings({ errors: d.errors, warnings: [] }) }
  }

  async function send() {
    setBusy('send'); setFindings(null)
    const res = await fetch('/api/events/stakeholders/email-campaigns', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_id: eventId, name, subject, body_html: html(), attachments, polished: firstOriginal !== null, original_html: firstOriginal, sender_mode: senderMode, confirmed, ...audienceBody() }),
    })
    const d = await res.json().catch(() => ({}))
    if (!res.ok) { setBusy(null); notify(d.error ?? 'Could not start the send.', 'error'); if (d.errors) setFindings({ errors: d.errors, warnings: [] }); if (d.needs_confirmation) setConfirmed(false); return }
    setFindings(d.warnings?.length ? { errors: [], warnings: d.warnings } : null)
    let p: Progress | null = null
    for (let guard = 0; guard < 400; guard++) {
      const r = await fetch(`/api/events/stakeholders/email-campaigns/${d.campaign_id}/send`, { method: 'POST' })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { notify(j.error ?? 'Sending stopped. Open it under Sent and press Continue.', 'error'); break }
      p = j.progress as Progress; setProgress(p)
      if (!p || (p.queued === 0 && p.sending === 0)) break
    }
    setBusy(null); setReviewing(false); setProgress(null)
    if (p) setDone({ id: d.campaign_id, progress: p })
  }

  const rendered = useMemo(() => renderSpeakerEmail({ bodyHtml: html(), publicName: preview?.recipients[0]?.name ?? 'Speaker name', producerName: senderMode === 'me' ? (myName || 'Your name') : 'Their producer' }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the editor content changes with `words`
    [words, preview, senderMode, myName, reviewing])
  const needsConfirm = count > CONFIRM_ABOVE

  if (done) {
    const p = done.progress
    return (
      <div>
        <PageHeader eyebrow="Stakeholder Hub" title="Emails" description="Sent." backHref={`/admin/events/${eventId}/stakeholders`} backLabel="Back to Stakeholder Hub" />
        <EmailsTabs eventId={eventId} />
        <div style={{ padding: '24px 32px', maxWidth: '720px' }}>
          <Card padded>
            <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--ink)' }}>{p.sent} sent{p.failed ? ` · ${p.failed} failed` : ''}{p.skipped ? ` · ${p.skipped} skipped` : ''}</div>
            <div style={{ fontSize: '13.5px', color: 'var(--ink2)', marginTop: '6px', lineHeight: 1.6 }}>“{name}” is saved under Sent with every recipient and its outcome.{p.failed ? ' Failed emails list their error there.' : ''}</div>
            <div style={{ display: 'flex', gap: '8px', marginTop: '14px' }}>
              <Link href={`/admin/events/${eventId}/stakeholders/emails/sent?open=${done.id}`}><Button variant="teal">See it under Sent</Button></Link>
              <Button variant="ghost" onClick={() => { setDone(null); setName(''); setSubject(''); editor?.commands.setContent(''); setWords(0); setAttachments([]); setPolish(null); setFirstOriginal(null) }}>Write another</Button>
            </div>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div>
      <PageHeader eyebrow="Stakeholder Hub" title="Emails" description="Write one email to a group of speakers. Each person gets their own greeting and your sign-off, from your mailbox, as a new conversation." backHref={`/admin/events/${eventId}/stakeholders`} backLabel="Back to Stakeholder Hub" />
      <EmailsTabs eventId={eventId} />
      <div style={{ padding: '20px 32px 56px', maxWidth: '900px', display: 'grid', gap: '16px' }}>
        <Card padded>
          <div style={label}>1 · Who</div>
          <select value={audience} onChange={e => setAudience(e.target.value)} style={{ width: '100%', marginTop: '8px', padding: '10px 12px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--ink)', fontSize: '14px' }}>
            {Object.entries(QUICK).map(([k, q]) => <option key={k} value={`quick:${k}`}>{q.label}</option>)}
            {lists.length > 0 && <optgroup label="Saved lists">{lists.map(l => <option key={l.id} value={`list:${l.id}`}>{l.name}{l.event_id === null ? ' (any event)' : ''}</option>)}</optgroup>}
          </select>
          {audience.startsWith('quick:') && (
            <label style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '8px', fontSize: '13px', color: 'var(--ink2)', cursor: 'pointer' }}>
              <input type="checkbox" checked={allowAssistant} onChange={() => setAllowAssistant(v => !v)} /> Reach people without their own email through an assistant or office contact (greeted as “Dear {'<'}their name{'>'}”)
            </label>
          )}
          <div style={{ marginTop: '10px', fontSize: '14px', color: 'var(--ink)' }}>
            <strong>{count}</strong> will receive it{preview && preview.summary.excluded > 0 ? <span style={{ color: 'var(--ink3)' }}> · {preview.summary.excluded} left out ({Object.entries(preview.summary.reasons).map(([k, n]) => `${n} ${k.toLowerCase()}`).join(', ')})</span> : null}
            {' · '}<Link href={`/admin/events/${eventId}/stakeholders/emails`} style={{ color: 'var(--teal-mid)', fontWeight: 700 }}>Build or change a list</Link>
          </div>
          {!!preview?.overlap?.length && (
            <div role="status" style={{ marginTop: '10px', padding: '10px 12px', borderRadius: '10px', background: 'var(--amber-light)', border: '1px solid var(--amber)', fontSize: '13px', color: 'var(--ink)', lineHeight: 1.6 }}>
              <strong>Some of these people were emailed in the last 30 days:</strong>
              {preview.overlap.map(o => <div key={o.campaign_id}>{o.overlap} of them got “{o.name}” on {fmt(o.sent_at)}.</div>)}
            </div>
          )}
        </Card>

        <Card padded>
          <div style={label}>2 · Write</div>
          <div style={{ display: 'grid', gap: '10px', marginTop: '10px' }}>
            <div>
              <div style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--ink3)', marginBottom: '4px' }}>Name (only you see this, it is how you find the email under Sent)</div>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Invite BSS speakers to DFS 2027" />
            </div>
            <div>
              <div style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--ink3)', marginBottom: '4px' }}>Subject (what they see)</div>
              <Input value={subject} onChange={e => setSubject(e.target.value)} placeholder="One line" />
            </div>
            <div>
              <div style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--ink3)', marginBottom: '4px' }}>Message. The greeting and your sign-off are added for you.</div>
              <div style={{ border: '1px solid var(--border)', borderRadius: '10px', background: 'var(--card)', padding: '12px 14px', fontSize: '15px', lineHeight: 1.65 }}><EditorContent editor={editor} /></div>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginTop: '8px', flexWrap: 'wrap' }}>
                <Button variant="teal" onClick={runPolish} disabled={polishing}>{polishing ? 'Polishing…' : '✨ Polish'}</Button>
                <span style={{ fontSize: '12.5px', color: 'var(--ink3)' }}>{words} words</span>
              </div>
            </div>
            {polish && (
              <div style={{ padding: '12px 14px', borderRadius: '10px', background: 'var(--teal-light)', border: '1px solid var(--teal-mid)' }}>
                <div style={{ fontWeight: 800, fontSize: '14px', marginBottom: '4px' }}>✨ Polished: here is what changed</div>
                <ul style={{ margin: '0 0 6px 18px', padding: 0, fontSize: '13px', lineHeight: 1.6 }}>{polish.changes.map((c, i) => <li key={i}>{c}</li>)}</ul>
                {polish.errors.length > 0 && <div style={{ color: 'var(--red)', fontSize: '13px' }}><strong>Still breaks the event’s content rules:</strong> {polish.errors.map(f => f.message).join(' · ')}</div>}
                {polish.warnings.length > 0 && <div style={{ color: 'var(--amber)', fontSize: '13px' }}>Worth a look: {polish.warnings.map(f => f.message).join(' · ')}</div>}
                <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}><Button variant="teal" onClick={() => setPolish(null)}>Keep this version</Button><Button variant="ghost" onClick={undoPolish}>Undo, back to mine</Button></div>
              </div>
            )}
            <div>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--ink3)' }}>Attachments (PDF, Word, Excel, PowerPoint or images, up to {MAX_ATTACHMENT_BYTES / 1048576} MB in total)</span>
                <label style={{ cursor: uploading ? 'default' : 'pointer' }}>
                  <input type="file" multiple hidden disabled={uploading} onChange={e => { void addFiles(e.target.files); e.target.value = '' }} />
                  <span style={{ display: 'inline-block', padding: '6px 12px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px', fontWeight: 700, background: 'var(--card)', color: 'var(--ink2)' }}>{uploading ? 'Uploading…' : '+ Add files'}</span>
                </label>
              </div>
              {attachments.map(a => (
                <div key={a.url} style={{ display: 'flex', gap: '10px', alignItems: 'center', fontSize: '13.5px', marginTop: '6px' }}>
                  <span>📎 {a.name}</span><span style={{ color: 'var(--ink3)' }}>{kb(a.size)}</span>
                  <button type="button" onClick={() => setAttachments(attachments.filter(x => x.url !== a.url))} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--ink3)', cursor: 'pointer' }}>Remove</button>
                </div>
              ))}
            </div>
          </div>
        </Card>

        <Card padded>
          <div style={label}>3 · Send</div>
          <div style={{ display: 'grid', gap: '6px', marginTop: '10px', fontSize: '13.5px', color: 'var(--ink)' }}>
            <label style={{ display: 'flex', gap: '8px', alignItems: 'center', cursor: 'pointer' }}><input type="radio" name="sender" checked={senderMode === 'me'} onChange={() => setSenderMode('me')} /> From me{myName ? ` (${myName})` : ''}: the producer sending it</label>
            <label style={{ display: 'flex', gap: '8px', alignItems: 'center', cursor: 'pointer' }}><input type="radio" name="sender" checked={senderMode === 'speaker_producer'} onChange={() => setSenderMode('speaker_producer')} /> Each from the speaker’s own producer (me when they have none)</label>
          </div>
          {findings && (
            <div style={{ marginTop: '10px', fontSize: '13px' }}>
              {findings.errors.length > 0 && <div style={{ color: 'var(--red)' }}><strong>This breaks the event’s content rules:</strong> {findings.errors.map(f => `${f.message}${f.match ? ` (“${f.match}”)` : ''}`).join(' · ')}</div>}
              {findings.warnings.length > 0 && <div style={{ color: 'var(--amber)' }}>Worth a look: {findings.warnings.map(f => f.message).join(' · ')}</div>}
            </div>
          )}
          <div style={{ display: 'flex', gap: '10px', marginTop: '14px', flexWrap: 'wrap' }}>
            <Button variant="ghost" onClick={sendTest} disabled={busy !== null || !hasContent(html()) || !subject.trim()}>{busy === 'test' ? 'Sending test…' : 'Send me a test'}</Button>
            <Button variant="teal" onClick={() => { setConfirmed(false); setReviewing(true) }} disabled={!ready || busy !== null}>{count ? `Review and send to ${count}` : 'Review and send'}</Button>
          </div>
        </Card>
      </div>

      {reviewing && (
        <div role="dialog" aria-modal="true" aria-label="Review and send" style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'var(--overlay-scrim)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div style={{ width: '100%', maxWidth: '640px', maxHeight: '90vh', overflowY: 'auto', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px', padding: '20px 22px' }}>
            <div style={{ fontSize: '17px', fontWeight: 800, color: 'var(--ink)' }}>Review and send</div>
            <div style={{ fontSize: '13.5px', color: 'var(--ink2)', marginTop: '8px', lineHeight: 1.7 }}>
              <strong>{count}</strong> people · from {senderMode === 'me' ? `you (${myName || 'your mailbox'})` : 'each speaker’s own producer'}<br />
              Subject: <strong>{subject}</strong>{attachments.length ? <><br />{attachments.length} attachment{attachments.length === 1 ? '' : 's'}</> : null}
              {preview && preview.summary.via_assistant > 0 && <><br />{preview.summary.via_assistant} reached through an assistant (greeted by the assistant’s name)</>}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--ink3)', margin: '12px 0 4px' }}>What {preview?.recipients[0]?.name ?? 'the first person'} will see</div>
            <iframe title="Email preview" srcDoc={rendered} sandbox="" style={{ width: '100%', height: '280px', border: '1px solid var(--border)', borderRadius: '10px', background: 'white' }} />
            {needsConfirm && (
              <label style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', marginTop: '12px', fontSize: '13.5px', color: 'var(--ink)', cursor: 'pointer' }}>
                <input type="checkbox" checked={confirmed} onChange={() => setConfirmed(v => !v)} style={{ marginTop: '3px' }} /> This goes to {count} people. I have checked the list and the email, and sent myself a test.
              </label>
            )}
            {busy === 'send' && progress && <div style={{ marginTop: '12px', fontSize: '13.5px', color: 'var(--ink)' }}>Sending… {progress.sent + progress.failed + progress.skipped} of {progress.total}</div>}
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '16px' }}>
              <Button variant="ghost" onClick={() => setReviewing(false)} disabled={busy === 'send'}>Back</Button>
              <Button variant="teal" onClick={send} disabled={busy === 'send' || (needsConfirm && !confirmed)}>{busy === 'send' ? 'Sending…' : `Send to ${count}`}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
