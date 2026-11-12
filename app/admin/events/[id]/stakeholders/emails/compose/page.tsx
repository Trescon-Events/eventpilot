'use client'

import { Suspense, use, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import PageHeader from '@/app/components/PageHeader'
import { Badge, Button, Card, Input } from '@/app/components/ui'
import { useBreadcrumbLabel } from '@/app/lib/nav/breadcrumb-labels'
import { notify } from '@/app/lib/ui/notify'
import { ReviewPanel, type ReviewInfo } from '../ReviewPanel'
import { hasContent, wordCount, renderSpeakerEmail, MAX_ATTACHMENT_BYTES, MAX_ATTACHMENTS } from '@/app/lib/speaker-emails/render'
import { PERSON_TOKENS, EVENT_TOKENS, applyTokens, applyTokensPlain, dataTokensUsed, personValues, type RequiredField } from '@/app/lib/emails/templates'
import { formatSendTime, localToUtc } from '@/app/lib/emails/schedule'

/* Create email (2026-11-12). Name it, choose the event it belongs to and the LIST it goes to, start from a template (searchable, previewed in a pop-up, then copied into this email so
   your edits never change the template), write, check it per person, then send now, spread a big send over hours, or schedule it. Autosaves as a draft; "Duplicate" and "Follow up"
   on the Emails page open here too. */

type Attachment = { name: string; url: string; size: number; type: string }
type Finding = { message: string; match: string }
type Person = { key: string; name: string; company: string | null; role: string | null; to: string; cc: string[]; mode: 'own' | 'assistant'; producer: string | null; last_emailed: string | null }
type Preview = { summary: { will_receive: number; excluded: number; reasons: Record<string, number>; via_contact: number }; recipients: Person[]; overlap?: { campaign_id: string; name: string; sent_at: string; overlap: number; total: number }[] }
type ListOpt = { id: string; name: string; type: 'static' | 'active'; will_receive: number; event_id: string | null }
type Tpl = { id: string; name: string; description: string | null; subject: string; body_html: string; required_fields: RequiredField[]; default_sender_mode: 'me' | 'speaker_producer' | null; event_id: string | null; review?: ReviewInfo | null }
type Defaults = { timezone: string | null; default_send_at_local: string | null; default_in_past: boolean; owner_staff_id: string | null; staff: { id: string; name: string }[] }
type Progress = { sent: number; failed: number; skipped: number; queued: number; sending: number; total: number }

const CONFIRM_ABOVE = 20
const MAILBOX_WARN = 200
const fmt = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
const kb = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`)
const label: React.CSSProperties = { fontSize: '11px', fontWeight: 800, letterSpacing: '0.5px', textTransform: 'uppercase', color: 'var(--ink3)' }
const sub: React.CSSProperties = { fontSize: '12.5px', fontWeight: 700, color: 'var(--ink3)', marginBottom: '4px' }
const sel: React.CSSProperties = { width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--ink)', fontSize: '14px' }

export default function CreateEmailPage({ params }: { params: Promise<{ id: string }> }) {
  return <Suspense fallback={null}><CreateEmail params={params} /></Suspense>
}

function CreateEmail({ params }: { params: Promise<{ id: string }> }) {
  const { id: workspaceEventId } = use(params)
  const router = useRouter()
  const search = useSearchParams()
  const base = `/admin/events/${workspaceEventId}/stakeholders/emails`
  const [workspaceName, setWorkspaceName] = useState<string | null>(null)
  useBreadcrumbLabel(workspaceEventId, workspaceName)

  const [eventId, setEventId] = useState(workspaceEventId)
  const [events, setEvents] = useState<{ id: string; name: string }[]>([])
  const [ev, setEv] = useState<Record<string, string | null>>({})
  const [name, setName] = useState('')
  const [listId, setListId] = useState(search.get('list') ?? '')
  const [lists, setLists] = useState<ListOpt[]>([])
  const [preview, setPreview] = useState<Preview | null>(null)
  const [tpls, setTpls] = useState<Tpl[]>([])
  const [tplId, setTplId] = useState('')
  const [pickOpen, setPickOpen] = useState(false)
  const [pickQ, setPickQ] = useState('')
  const [pickPreview, setPickPreview] = useState<Tpl | null>(null)
  const [subject, setSubject] = useState('')
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({})
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [uploading, setUploading] = useState(false)
  const [words, setWords] = useState(0)
  const [polishing, setPolishing] = useState(false)
  const [polish, setPolish] = useState<{ before: string; changes: string[]; errors: Finding[]; warnings: Finding[] } | null>(null)
  const [firstOriginal, setFirstOriginal] = useState<string | null>(null)
  const [senderMode, setSenderMode] = useState<'me' | 'speaker_producer'>('me')
  const [when, setWhen] = useState<'now' | 'schedule'>('now')
  const [sendAt, setSendAt] = useState('')
  const [pace, setPace] = useState(0)
  const [defaults, setDefaults] = useState<Defaults | null>(null)
  const [ownerId, setOwnerId] = useState('')
  const [rememberOwner, setRememberOwner] = useState(false)
  const [previewAs, setPreviewAs] = useState(0)
  const [findings, setFindings] = useState<{ errors: Finding[]; warnings: Finding[] } | null>(null)
  const [reviewing, setReviewing] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const [skipLacking, setSkipLacking] = useState(false)
  const [lacking, setLacking] = useState<{ count: number; names: string[]; fields: string[] } | null>(null)
  const [busy, setBusy] = useState<'test' | 'send' | null>(null)
  const [progress, setProgress] = useState<Progress | null>(null)
  const [done, setDone] = useState<{ id: string; progress: Progress | null; scheduled?: { when: string; waiting: string[] }; paced?: number } | null>(null)
  const [myName, setMyName] = useState('')
  const [draftId, setDraftId] = useState<string | null>(search.get('draft'))
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [loadingDraft, setLoadingDraft] = useState(!!search.get('draft'))
  const [ready, setReady] = useState(false)
  const draftRef = useRef<string | null>(draftId)
  useEffect(() => { draftRef.current = draftId }, [draftId])

  const editor = useEditor({
    extensions: [StarterKit.configure({ heading: false, blockquote: false, codeBlock: false, code: false, horizontalRule: false, strike: false, link: { openOnClick: false } })],
    content: '', immediatelyRender: false,
    editorProps: { attributes: { 'aria-label': 'Email message', style: 'min-height:240px;outline:none;' } },
    onUpdate: ({ editor: ed }) => setWords(wordCount(ed.getHTML())),
  })
  const html = () => editor?.getHTML() ?? ''

  // ── loading ────────────────────────────────────────────────────────────────
  useEffect(() => {
    fetch(`/api/events?id=${workspaceEventId}`).then(r => r.json()).then(d => setWorkspaceName((Array.isArray(d) ? d[0] : d)?.name ?? null)).catch(() => {})
    fetch(`/api/events/stakeholders/email-campaigns?event_id=${workspaceEventId}&scope=all`).then(r => r.json()).then(d => setEvents(d.events ?? [])).catch(() => {})
    fetch('/api/events/stakeholders/email-campaigns/sender').then(r => r.json()).then(s => setMyName(s?.name ?? '')).catch(() => {})
  }, [workspaceEventId])
  useEffect(() => {
    fetch(`/api/events?id=${eventId}`).then(r => r.json()).then(d => setEv((Array.isArray(d) ? d[0] : d) ?? {})).catch(() => {})
    fetch(`/api/events/stakeholders/email-lists?event_id=${eventId}`).then(r => r.json()).then(d => setLists(d.lists ?? [])).catch(() => {})
    fetch(`/api/events/stakeholders/email-templates?event_id=${eventId}`).then(r => r.json()).then(d => setTpls(d.templates ?? [])).catch(() => {})
    fetch(`/api/events/stakeholders/email-campaigns/schedule-defaults?event_id=${eventId}`).then(r => r.json()).then((d: Defaults) => { setDefaults(d); setOwnerId(o => o || d.owner_staff_id || '') }).catch(() => {})
  }, [eventId])

  // an existing draft (continue editing, duplicate, follow-up) fills the form
  useEffect(() => {
    const id = search.get('draft')
    // eslint-disable-next-line react-hooks/set-state-in-effect -- nothing to load: the form is ready straight away
    if (!id || !editor) { if (!id) setReady(true); return }
    let live = true
    void (async () => {
      const r = await fetch(`/api/events/stakeholders/email-campaigns/${id}`)
      const d = await r.json().catch(() => null)
      if (!live) return
      if (r.ok && d?.campaign?.status === 'draft') {
        const c = d.campaign
        setEventId(c.event_id); setName(c.name === 'Untitled email' ? '' : c.name); setSubject(c.subject ?? ''); setListId(c.list_id ?? ''); setTplId(c.template_id ?? '')
        setFieldValues(c.field_values ?? {}); setAttachments(c.attachments ?? []); setSenderMode(c.sender_mode === 'speaker_producer' ? 'speaker_producer' : 'me')
        editor.commands.setContent(c.body_html || ''); setWords(wordCount(c.body_html || ''))
        const st = c.draft_state ?? {}
        if (st.when === 'schedule') setWhen('schedule'); if (typeof st.sendAt === 'string') setSendAt(st.sendAt); if (typeof st.pace === 'number') setPace(st.pace); if (st.ownerId) setOwnerId(st.ownerId)
        setDraftId(c.id)
      } else notify('That draft no longer exists.', 'error')
      setLoadingDraft(false); setReady(true)
    })()
    return () => { live = false }
  }, [search, editor])

  // who the chosen list reaches right now
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- no list chosen: nothing to preview
    if (!listId) { setPreview(null); return }
    let live = true
    void (async () => {
      const r = await fetch('/api/events/stakeholders/email-people', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event_id: eventId, list_id: listId, include_overlap: true }) })
      const d = await r.json().catch(() => null)
      if (live && r.ok) { setPreview(d); setPreviewAs(0) }
    })()
    return () => { live = false }
  }, [eventId, listId])

  const tpl = tpls.find(t => t.id === tplId) ?? null
  const scheduling = when === 'schedule'
  const sendAtDate = scheduling ? localToUtc(sendAt, defaults?.timezone) : null
  const count = preview?.summary.will_receive ?? 0
  const fieldsFilled = !tpl || tpl.required_fields.every(f => (fieldValues[f.key] ?? '').trim())

  // ── autosave as a draft ────────────────────────────────────────────────────
  const snapshot = JSON.stringify([eventId, name, subject, listId, tplId, fieldValues, attachments, senderMode, when, sendAt, pace, ownerId, words])
  const lastSaved = useRef('')
  useEffect(() => {
    if (!ready || done || !editor) return
    if (!name.trim() && !subject.trim() && !hasContent(html())) return
    if (snapshot === lastSaved.current) return
    const t = setTimeout(async () => {
      const r = await fetch('/api/events/stakeholders/email-campaigns/draft', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: draftRef.current ?? undefined, event_id: eventId, name, subject, body_html: html(), list_id: listId || undefined, template_id: tplId || undefined, field_values: fieldValues, attachments, sender_mode: senderMode, polished: firstOriginal !== null, original_html: firstOriginal, draft_state: { when, sendAt, pace, ownerId } }),
      })
      const d = await r.json().catch(() => ({}))
      if (r.ok) { lastSaved.current = snapshot; if (!draftRef.current) { setDraftId(d.id); draftRef.current = d.id } setSavedAt(new Date().toISOString()) }
    }, 1800)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `snapshot` summarises every field that is saved
  }, [snapshot, ready, done])

  // ── template picker ────────────────────────────────────────────────────────
  const matches = useMemo(() => tpls.filter(t => `${t.name} ${t.description ?? ''} ${t.subject}`.toLowerCase().includes(pickQ.toLowerCase())), [tpls, pickQ])
  const eventValues = useMemo(() => {
    const v: Record<string, string> = { event_name: (ev.public_name || ev.name || '') as string, ...fieldValues }
    if (ev.public_dates_display) v.event_dates = ev.public_dates_display as string
    if (ev.public_venue_display) v.event_venue = ev.public_venue_display as string
    return v
  }, [ev, fieldValues])
  async function reloadTpls(keepId?: string) {
    const d = await fetch(`/api/events/stakeholders/email-templates?event_id=${eventId}`).then(r => r.json()).catch(() => null)
    const next: Tpl[] = d?.templates ?? []
    setTpls(next)
    if (keepId) setPickPreview(next.find(t => t.id === keepId) ?? null)
  }
  function applyTemplate(t: Tpl) {
    setTplId(t.id); setFieldValues({}); setPolish(null); setFirstOriginal(null)
    setSubject(t.subject); editor?.commands.setContent(t.body_html); setWords(wordCount(t.body_html))
    if (!name.trim()) setName(t.name)
    if (t.default_sender_mode) setSenderMode(t.default_sender_mode)
    if (t.required_fields.length > 0) { setWhen('schedule'); if (!sendAt && defaults?.default_send_at_local) setSendAt(defaults.default_send_at_local) }
    setPickOpen(false); setPickPreview(null)
  }
  function chooseWhen(w: 'now' | 'schedule') { setWhen(w); if (w === 'schedule' && !sendAt && defaults?.default_send_at_local) setSendAt(defaults.default_send_at_local) }
  const insertToken = (key: string) => editor?.chain().focus().insertContent(`{{${key}}}`).run()

  // ── per-person preview and the checks before sending ───────────────────────
  const person = preview?.recipients[previewAs] ?? null
  const personVals = personValues(person?.name ?? 'Speaker name', { company: person?.company ?? 'Company', role: person?.role ?? 'Job title' })
  const bodyNow = html()
  const rendered = useMemo(() => renderSpeakerEmail({ bodyHtml: applyTokens(bodyNow, { ...eventValues, ...personVals }), publicName: person?.name ?? 'Speaker name', producerName: senderMode === 'me' ? (myName || 'Your name') : (person?.producer ?? 'Their producer') }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `words` stands for the editor content
    [words, person, eventValues, senderMode, myName])
  const needData = dataTokensUsed(`${subject}\n${bodyNow}`)
  const lackingPeople = (preview?.recipients ?? []).filter(r => needData.some(k => !(k === 'company' ? r.company : r.role)?.trim()))
  const volume = useMemo(() => {
    const by = new Map<string, number>()
    for (const r of preview?.recipients ?? []) { const k = senderMode === 'me' ? 'me' : (r.producer ?? 'me'); by.set(k, (by.get(k) ?? 0) + 1) }
    const worst = [...by.entries()].sort((a, b) => b[1] - a[1])[0]
    return worst && worst[1] > MAILBOX_WARN ? { who: worst[0] === 'me' ? 'one mailbox' : worst[0], n: worst[1] } : null
  }, [preview, senderMode])
  const problems: string[] = []
  if (!listId) problems.push('Choose the list this email goes to.')
  if (listId && preview && count === 0) problems.push('Nobody on that list would receive it.')
  if (!fieldsFilled && !scheduling) problems.push(`Fill in the ${tpl!.required_fields.map(f => f.label.toLowerCase()).join(' and the ')}.`)
  if (scheduling && !sendAtDate) problems.push('Choose when to send it.')
  const ok = hasContent(bodyNow) && !!subject.trim() && !!name.trim() && problems.length === 0

  // ── attachments, polish ────────────────────────────────────────────────────
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

  // ── test, send, schedule ───────────────────────────────────────────────────
  async function sendTest() {
    setBusy('test'); setFindings(null)
    const res = await fetch('/api/events/stakeholders/email-campaigns/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event_id: eventId, subject, body_html: html(), attachments, sample_name: person?.name ?? '', template_id: tplId || undefined, field_values: fieldValues }) })
    const d = await res.json().catch(() => ({}))
    setBusy(null)
    if (res.ok) notify(`A test copy was sent to ${d.to}. It starts with “[TEST]”.`, 'success')
    else { notify(d.error ?? 'Could not send the test.', 'error'); if (d.errors) setFindings({ errors: d.errors, warnings: [] }) }
  }

  async function send(skip = skipLacking) {
    setBusy('send'); setFindings(null); setLacking(null)
    const res = await fetch('/api/events/stakeholders/email-campaigns', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_id: eventId, name, subject, body_html: html(), attachments, polished: firstOriginal !== null, original_html: firstOriginal, sender_mode: senderMode, confirmed, list_id: listId, draft_id: draftId ?? undefined,
        template_id: tplId || undefined, field_values: fieldValues, skip_unpersonalisable: skip, pace_hours: !scheduling && pace > 0 ? pace : undefined,
        ...(scheduling ? { send_at_local: sendAt, owner_staff_id: ownerId || undefined, remember_owner: rememberOwner } : {}),
      }),
    })
    const d = await res.json().catch(() => ({}))
    if (!res.ok) {
      setBusy(null)
      notify(d.error ?? 'Could not start the send.', 'error')
      if (d.errors) setFindings({ errors: d.errors, warnings: [] })
      if (d.unpersonalisable) setLacking(d.unpersonalisable)
      if (d.needs_confirmation) setConfirmed(false)
      return
    }
    setDraftId(null); draftRef.current = null
    if (d.scheduled && !d.released) {
      setBusy(null); setReviewing(false)
      setDone({ id: d.campaign_id, progress: null, scheduled: { when: formatSendTime(sendAtDate ?? new Date(), defaults?.timezone), waiting: d.waiting_for ?? [] } })
      return
    }
    if (d.paced) { setBusy(null); setReviewing(false); setDone({ id: d.campaign_id, progress: null, paced: pace }); return }
    let p: Progress | null = null
    for (let guard = 0; guard < 400; guard++) {
      const r = await fetch(`/api/events/stakeholders/email-campaigns/${d.campaign_id}/send`, { method: 'POST' })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { notify(j.error ?? 'Sending stopped. Open it under Emails and press Continue.', 'error'); break }
      p = j.progress as Progress; setProgress(p)
      if (!p || (p.queued === 0 && p.sending === 0)) break
    }
    setBusy(null); setReviewing(false); setProgress(null)
    setDone({ id: d.campaign_id, progress: p })
  }

  const needsConfirm = count > CONFIRM_ABOVE
  const listLabel = (l: ListOpt) => `${l.name} · ${l.type === 'active' ? 'Active' : 'Static'} · ${l.will_receive}`

  if (done) {
    const p = done.progress
    return (
      <div>
        <PageHeader eyebrow="Stakeholder Hub" title="Emails" description={done.scheduled ? 'Scheduled.' : done.paced ? 'On its way.' : 'Sent.'} backHref={base} backLabel="Back to Emails" />
        <div style={{ padding: '24px 32px', maxWidth: '720px' }}>
          <Card padded>
            {done.scheduled && <>
              <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--ink)' }}>Scheduled for {done.scheduled.when}</div>
              <div style={{ fontSize: '13.5px', color: 'var(--ink2)', marginTop: '6px', lineHeight: 1.7 }}>“{name}” is saved under Emails. The list is worked out again at that moment, so it reaches whoever is on it by then.
                {done.scheduled.waiting.length > 0 ? <> <strong>It is still waiting for the {done.scheduled.waiting.join(' and the ').toLowerCase()}.</strong> It will not go out until that is added; the owner is reminded, and once it is added after the send time it goes out straight away.</> : ' Everything it needs is in place.'}</div>
            </>}
            {done.paced && <>
              <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--ink)' }}>Going out gradually over {done.paced} hours</div>
              <div style={{ fontSize: '13.5px', color: 'var(--ink2)', marginTop: '6px', lineHeight: 1.7 }}>“{name}” is sent a few at a time so no mailbox is throttled and nothing looks like bulk mail. Follow it under Emails; you can cancel what has not gone yet.</div>
            </>}
            {p && <>
              <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--ink)' }}>{p.sent} sent{p.failed ? ` · ${p.failed} failed` : ''}{p.skipped ? ` · ${p.skipped} skipped` : ''}</div>
              <div style={{ fontSize: '13.5px', color: 'var(--ink2)', marginTop: '6px', lineHeight: 1.6 }}>“{name}” is saved under Emails with every recipient and its outcome.{p.failed ? ' Failed emails list their error there.' : ''}</div>
            </>}
            <div style={{ display: 'flex', gap: '8px', marginTop: '14px' }}>
              <Link href={`${base}?open=${done.id}`}><Button variant="teal">Open it under Emails</Button></Link>
              <Button variant="ghost" onClick={() => router.push(`${base}/compose`)}>Create another</Button>
            </div>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div>
      <PageHeader eyebrow="Stakeholder Hub" title="Create email" description="Name it, pick the list it goes to, start from a template if you like, check it for each person, then send or schedule it." backHref={base} backLabel="Back to Emails" />
      <div style={{ padding: '4px 32px 56px', maxWidth: '900px', display: 'grid', gap: '16px' }}>
        {loadingDraft && <div style={{ color: 'var(--ink3)', fontSize: '13px' }}>Opening your draft…</div>}

        <Card padded>
          <div style={label}>1 · Details</div>
          <div style={{ display: 'grid', gap: '12px', marginTop: '10px' }}>
            <div><div style={sub}>Email name (only you see this: it is how you find it under Emails)</div><Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Invite BSS speakers to DFS 2027" /></div>
            <div style={{ display: 'grid', gap: '12px', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
              <div>
                <div style={sub}>Event this email belongs to</div>
                <select value={eventId} onChange={e => { setEventId(e.target.value); setListId(''); setTplId('') }} style={sel}>
                  {(events.length ? events : [{ id: workspaceEventId, name: workspaceName ?? 'This event' }]).map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
              </div>
              <div>
                <div style={sub}>List: who it goes to</div>
                <select value={listId} onChange={e => { if (e.target.value === '__new') { router.push(`${base}/lists`); return } setListId(e.target.value) }} style={sel}>
                  <option value="">Choose a list…</option>
                  {lists.map(l => <option key={l.id} value={l.id}>{listLabel(l)}</option>)}
                  <option value="__new">+ Create a new list…</option>
                </select>
              </div>
            </div>
            {preview && listId && (
              <div style={{ fontSize: '13.5px', color: 'var(--ink)' }}>
                <strong>{count}</strong> will receive it{preview.summary.excluded > 0 && <span style={{ color: 'var(--ink3)' }}> · {preview.summary.excluded} left out ({Object.entries(preview.summary.reasons).map(([k, n]) => `${n} ${k.toLowerCase()}`).join(', ')})</span>}
                {preview.summary.via_contact > 0 && <span style={{ color: 'var(--ink3)' }}> · {preview.summary.via_contact} go to their additional contacts, addressed to the speaker</span>}
              </div>
            )}
            {!!preview?.overlap?.length && (
              <div role="status" style={{ padding: '10px 12px', borderRadius: '10px', background: 'var(--amber-light)', border: '1px solid var(--amber)', fontSize: '13px', color: 'var(--ink)', lineHeight: 1.6 }}>
                <strong>Some of these people were emailed in the last 30 days:</strong>
                {preview.overlap.map(o => <div key={o.campaign_id}>{o.overlap} of them got “{o.name}” on {fmt(o.sent_at)}.</div>)}
              </div>
            )}
          </div>
        </Card>

        <Card padded>
          <div style={label}>2 · Write</div>
          <div style={{ display: 'grid', gap: '12px', marginTop: '10px' }}>
            <div>
              <div style={sub}>Template</div>
              {tpl ? (
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', padding: '10px 12px', borderRadius: '10px', border: '1px solid var(--teal-mid)', background: 'var(--teal-light)' }}>
                  <div style={{ flex: '1 1 260px', fontSize: '13.5px', color: 'var(--ink)' }}><strong>{tpl.name}</strong><div style={{ fontSize: '12px', color: 'var(--ink2)', marginTop: '2px' }}>This is your own copy of the template. Edit the text below as you like; the template itself never changes.</div></div>
                  <Button variant="ghost" onClick={() => setPickOpen(true)}>Change</Button>
                  <Button variant="ghost" onClick={() => { setTplId(''); setFieldValues({}) }}>Remove</Button>
                </div>
              ) : (
                <Button variant="ghost" onClick={() => setPickOpen(true)}>Choose a template…</Button>
              )}
              {!tpl && <span style={{ fontSize: '12.5px', color: 'var(--ink3)', marginLeft: '8px' }}>or write your own below.</span>}
            </div>

            {tpl && tpl.required_fields.length > 0 && (
              <div style={{ padding: '12px 14px', borderRadius: '10px', background: 'var(--surface)', border: `1px solid ${fieldsFilled ? 'var(--border)' : 'var(--amber)'}` }}>
                <div style={{ fontSize: '12.5px', fontWeight: 800, color: 'var(--ink)', marginBottom: '8px' }}>This template needs {tpl.required_fields.length === 1 ? 'one thing' : 'these'} before it can be sent{scheduling ? ' (you can add it later from Emails)' : ''}</div>
                {tpl.required_fields.map(f => (
                  <div key={f.key} style={{ marginBottom: '8px' }}>
                    <div style={sub}>{f.label}{f.kind === 'url' ? ' (a full link starting with https://)' : ''}</div>
                    <Input value={fieldValues[f.key] ?? ''} onChange={e => setFieldValues(v => ({ ...v, [f.key]: e.target.value }))} placeholder={f.kind === 'url' ? 'https://…' : ''} />
                  </div>
                ))}
              </div>
            )}

            <div><div style={sub}>Subject (what they see)</div><Input value={subject} onChange={e => setSubject(e.target.value)} placeholder="One line. Placeholders such as {{event_name}} work here too." /></div>
            <div>
              <div style={sub}>Message. The greeting and the sender’s sign-off are added for you.</div>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '6px' }}>
                {[...EVENT_TOKENS, ...PERSON_TOKENS, ...(tpl?.required_fields ?? []).map(f => ({ key: f.key, label: f.label }))].map(t => (
                  <button key={t.key} type="button" onClick={() => insertToken(t.key)} title={`Insert {{${t.key}}}`} style={{ fontSize: '11.5px', fontWeight: 700, padding: '3px 9px', borderRadius: '999px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--ink2)', cursor: 'pointer' }}>+ {t.label}</button>
                ))}
              </div>
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
                <span style={sub}>Attachments (PDF, Word, Excel, PowerPoint or images, up to {MAX_ATTACHMENT_BYTES / 1048576} MB in total)</span>
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
          <div style={label}>3 · Check it for each person</div>
          {!listId || !preview || preview.recipients.length === 0 ? <div style={{ fontSize: '13px', color: 'var(--ink3)', marginTop: '8px' }}>Choose a list to preview the email as one of its people.</div> : (
            <div style={{ display: 'grid', gap: '10px', marginTop: '10px' }}>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={sub}>Preview as</span>
                <select value={previewAs} onChange={e => setPreviewAs(Number(e.target.value))} style={{ ...sel, width: 'auto', minWidth: '260px' }}>
                  {preview.recipients.slice(0, 200).map((r, i) => <option key={r.key} value={i}>{r.name}{r.company ? ` · ${r.company}` : ''}</option>)}
                </select>
                {person && <span style={{ fontSize: '12.5px', color: 'var(--ink3)' }}>to {person.to}{person.cc.length ? ` · cc ${person.cc.length}` : ''}{person.mode === 'assistant' ? ' (additional contact)' : ''}</span>}
              </div>
              <div style={{ fontSize: '12.5px', color: 'var(--ink2)' }}>Subject: <strong>{applyTokensPlain(subject, { ...eventValues, ...personVals }) || '(no subject yet)'}</strong></div>
              <iframe title="Email preview" srcDoc={rendered} sandbox="" style={{ width: '100%', height: '300px', border: '1px solid var(--border)', borderRadius: '10px', background: 'white' }} />
              {lackingPeople.length > 0 && (
                <div role="alert" style={{ padding: '10px 12px', borderRadius: '10px', background: 'var(--amber-light)', border: '1px solid var(--amber)', fontSize: '13px', color: 'var(--ink)', lineHeight: 1.6 }}>
                  <strong>{lackingPeople.length} {lackingPeople.length === 1 ? 'person has' : 'people have'} no {needData.map(k => (k === 'company' ? 'company' : 'job title')).join(' or ')} on record</strong>, which this email uses: {lackingPeople.slice(0, 6).map(r => r.name).join(', ')}{lackingPeople.length > 6 ? '…' : ''}. Remove the placeholder, fix their records, or leave them out when you send.
                </div>
              )}
              {volume && (
                <div role="status" style={{ padding: '10px 12px', borderRadius: '10px', background: 'var(--amber-light)', border: '1px solid var(--amber)', fontSize: '13px', color: 'var(--ink)', lineHeight: 1.6 }}>
                  <strong>{volume.n} emails would leave {volume.who} at once.</strong> Microsoft throttles a mailbox and a burst of similar emails can be flagged as spam. Spread it over a few hours below, or send from each speaker’s own producer.
                </div>
              )}
            </div>
          )}
        </Card>

        <Card padded>
          <div style={label}>4 · Send</div>
          <div style={{ display: 'grid', gap: '6px', marginTop: '10px', fontSize: '13.5px', color: 'var(--ink)' }}>
            <div style={sub}>When</div>
            <label style={{ display: 'flex', gap: '8px', alignItems: 'center', cursor: 'pointer' }}><input type="radio" name="when" checked={!scheduling} onChange={() => chooseWhen('now')} /> Send now</label>
            {!scheduling && count > 100 && (
              <div style={{ margin: '0 0 4px 24px', display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '12.5px', color: 'var(--ink2)' }}>Pace:</span>
                <select value={pace} onChange={e => setPace(Number(e.target.value))} style={{ ...sel, width: 'auto' }}>
                  <option value={0}>All at once</option>{[2, 4, 8, 12, 24].map(h => <option key={h} value={h}>Spread over {h} hours</option>)}
                </select>
              </div>
            )}
            <label style={{ display: 'flex', gap: '8px', alignItems: 'center', cursor: 'pointer' }}><input type="radio" name="when" checked={scheduling} onChange={() => chooseWhen('schedule')} /> Schedule it</label>
            {scheduling && (
              <div style={{ margin: '2px 0 8px 24px', padding: '12px 14px', borderRadius: '10px', background: 'var(--surface)', border: '1px solid var(--border)', display: 'grid', gap: '10px' }}>
                <div>
                  <div style={sub}>Send at ({defaults?.timezone ?? 'UTC'} time)</div>
                  <input type="datetime-local" value={sendAt} onChange={e => setSendAt(e.target.value)} style={{ padding: '9px 10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--ink)', fontSize: '14px' }} />
                  <div style={{ fontSize: '12px', color: 'var(--ink3)', marginTop: '4px', lineHeight: 1.6 }}>
                    {defaults?.default_send_at_local ? <>The default is the day after the event’s last day at 09:00. {defaults.default_in_past ? <strong style={{ color: 'var(--amber)' }}>That time has already passed, so it goes out as soon as everything it needs is in place.</strong> : null}</> : <>This event has no event days yet, so there is no default time. Choose one.</>}
                    {' '}If a required field is still empty at that time, it waits and is never sent without it. The list is worked out again when it is sent.
                  </div>
                </div>
                <div>
                  <div style={sub}>Owner: gets the reminders (a missing link, a heads-up, the result)</div>
                  <select value={ownerId} onChange={e => setOwnerId(e.target.value)} style={{ ...sel, width: 'auto', minWidth: '240px' }}><option value="">Me</option>{(defaults?.staff ?? []).map(st => <option key={st.id} value={st.id}>{st.name}</option>)}</select>
                  <label style={{ display: 'flex', gap: '6px', alignItems: 'center', marginTop: '6px', fontSize: '12.5px', color: 'var(--ink2)', cursor: 'pointer' }}><input type="checkbox" checked={rememberOwner} onChange={() => setRememberOwner(v => !v)} /> Remember this person as the owner of post-event emails for this event</label>
                </div>
                {tpl && !fieldsFilled && <div style={{ fontSize: '12.5px', color: 'var(--amber)' }}>The {tpl.required_fields.map(f => f.label.toLowerCase()).join(' and the ')} is not filled yet. You can schedule it now and add it later from Emails.</div>}
              </div>
            )}
            <div style={{ ...sub, marginTop: '6px' }}>From</div>
            <label style={{ display: 'flex', gap: '8px', alignItems: 'center', cursor: 'pointer' }}><input type="radio" name="sender" checked={senderMode === 'me'} onChange={() => setSenderMode('me')} /> Me{myName ? ` (${myName})` : ''}: the producer sending it</label>
            <label style={{ display: 'flex', gap: '8px', alignItems: 'center', cursor: 'pointer' }}><input type="radio" name="sender" checked={senderMode === 'speaker_producer'} onChange={() => setSenderMode('speaker_producer')} /> Each from the speaker’s own producer (me when they have none)</label>
          </div>
          {findings && (
            <div style={{ marginTop: '10px', fontSize: '13px' }}>
              {findings.errors.length > 0 && <div style={{ color: 'var(--red)' }}><strong>This breaks the event’s content rules:</strong> {findings.errors.map(f => `${f.message}${f.match ? ` (“${f.match}”)` : ''}`).join(' · ')}</div>}
              {findings.warnings.length > 0 && <div style={{ color: 'var(--amber)' }}>Worth a look: {findings.warnings.map(f => f.message).join(' · ')}</div>}
            </div>
          )}
          {problems.length > 0 && <div style={{ marginTop: '10px', fontSize: '12.5px', color: 'var(--ink3)' }}>{problems.join(' ')}</div>}
          <div style={{ display: 'flex', gap: '10px', marginTop: '14px', flexWrap: 'wrap', alignItems: 'center' }}>
            <Button variant="ghost" onClick={sendTest} disabled={busy !== null || !hasContent(bodyNow) || !subject.trim() || (!!tpl && !fieldsFilled)}>{busy === 'test' ? 'Sending test…' : 'Send me a test'}</Button>
            <Button variant="teal" onClick={() => { setConfirmed(false); setLacking(null); setSkipLacking(false); setReviewing(true) }} disabled={!ok || busy !== null}>{scheduling ? (count ? `Review and schedule for ${count}` : 'Review and schedule') : (count ? `Review and send to ${count}` : 'Review and send')}</Button>
            <span style={{ fontSize: '12.5px', color: 'var(--ink3)' }}>{savedAt ? `Draft saved ${new Date(savedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : 'Saved automatically as a draft'}</span>
          </div>
        </Card>
      </div>

      {pickOpen && (
        <div role="dialog" aria-modal="true" aria-label="Choose a template" style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'var(--overlay-scrim)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div style={{ width: '100%', maxWidth: '760px', maxHeight: '90vh', overflowY: 'auto', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px', padding: '20px 22px' }}>
            {!pickPreview ? (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}><div style={{ fontSize: '17px', fontWeight: 800, color: 'var(--ink)' }}>Choose a template</div><Button variant="ghost" onClick={() => setPickOpen(false)}>Close</Button></div>
                <Input value={pickQ} onChange={e => setPickQ(e.target.value)} placeholder="Search templates…" autoFocus />
                <div style={{ display: 'grid', gap: '8px', marginTop: '12px' }}>
                  {matches.length === 0 && <div style={{ fontSize: '13px', color: 'var(--ink3)' }}>No template matches. You can write your own instead.</div>}
                  {matches.map(t => (
                    <button key={t.id} type="button" onClick={() => setPickPreview(t)} style={{ textAlign: 'left', padding: '12px 14px', borderRadius: '12px', border: '1px solid var(--border)', background: 'var(--card)', cursor: 'pointer' }}>
                      <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--ink)' }}>{t.name}{t.event_id ? <> <Badge color="purple">this event</Badge></> : null}</div>
                      {t.description && <div style={{ fontSize: '12.5px', color: 'var(--ink3)', marginTop: '2px' }}>{t.description}</div>}
                      <div style={{ fontSize: '12px', color: 'var(--ink3)', marginTop: '4px' }}>Subject: {t.subject}{t.required_fields.length ? ` · needs ${t.required_fields.map(f => f.label.toLowerCase()).join(', ')}` : ''}</div>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: '17px', fontWeight: 800, color: 'var(--ink)' }}>{pickPreview.name}</div>
                {pickPreview.description && <div style={{ fontSize: '13px', color: 'var(--ink3)', marginTop: '2px' }}>{pickPreview.description}</div>}
                <div style={{ fontSize: '13px', color: 'var(--ink2)', margin: '10px 0 6px' }}>Subject: <strong>{applyTokensPlain(pickPreview.subject, { ...eventValues, ...personValues('Asha Rao', { company: 'Company', role: 'Job title' }) })}</strong></div>
                <iframe title="Template preview" sandbox="" srcDoc={renderSpeakerEmail({ bodyHtml: applyTokens(pickPreview.body_html, { ...eventValues, ...personValues('Asha Rao', { company: 'Company', role: 'Job title' }), ...Object.fromEntries(pickPreview.required_fields.map(f => [f.key, f.kind === 'url' ? 'https://example.com/your-link' : `[${f.label}]`])) }), publicName: 'Asha Rao', producerName: 'Sender name' })} style={{ width: '100%', height: '340px', border: '1px solid var(--border)', borderRadius: '10px', background: 'white' }} />
                {pickPreview.required_fields.length > 0 && <div style={{ fontSize: '12.5px', color: 'var(--ink2)', marginTop: '8px' }}>This template needs: {pickPreview.required_fields.map(f => f.label).join(', ')}.</div>}
                <div style={{ marginTop: '10px' }}><ReviewPanel eventId={eventId} templateId={pickPreview.id} review={pickPreview.review ?? null} onChanged={() => { void reloadTpls(pickPreview.id) }} /></div>
                <div style={{ fontSize: '12px', color: 'var(--ink3)', marginTop: '6px' }}>Using it copies the text into your email. Your edits never change the template.</div>
                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '14px' }}><Button variant="ghost" onClick={() => setPickPreview(null)}>Back</Button><Button variant="teal" disabled={pickPreview.review?.state === 'stale'} onClick={() => applyTemplate(pickPreview)}>Use this template</Button></div>
              </>
            )}
          </div>
        </div>
      )}

      {reviewing && (
        <div role="dialog" aria-modal="true" aria-label="Review and send" style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'var(--overlay-scrim)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div style={{ width: '100%', maxWidth: '640px', maxHeight: '90vh', overflowY: 'auto', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px', padding: '20px 22px' }}>
            <div style={{ fontSize: '17px', fontWeight: 800, color: 'var(--ink)' }}>{scheduling ? 'Review and schedule' : 'Review and send'}</div>
            <div style={{ fontSize: '13.5px', color: 'var(--ink2)', marginTop: '8px', lineHeight: 1.7 }}>
              {scheduling && sendAtDate && <><strong>Scheduled for {formatSendTime(sendAtDate, defaults?.timezone)}</strong><br />The list is worked out again at that moment (about {count} people now).<br /></>}
              {!scheduling && <><strong>{count}</strong> people{pace > 0 ? `, spread over ${pace} hours` : ''} · </>}from {senderMode === 'me' ? `you (${myName || 'your mailbox'})` : 'each speaker’s own producer'}<br />
              Subject: <strong>{applyTokensPlain(subject, { ...eventValues, ...personVals })}</strong>{attachments.length ? <><br />{attachments.length} attachment{attachments.length === 1 ? '' : 's'}</> : null}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--ink3)', margin: '12px 0 4px' }}>What {person?.name ?? 'the first person'} will see</div>
            <iframe title="Email preview" srcDoc={rendered} sandbox="" style={{ width: '100%', height: '260px', border: '1px solid var(--border)', borderRadius: '10px', background: 'white' }} />
            {lacking && (
              <div role="alert" style={{ marginTop: '12px', padding: '10px 12px', borderRadius: '10px', background: 'var(--amber-light)', border: '1px solid var(--amber)', fontSize: '13px', color: 'var(--ink)', lineHeight: 1.6 }}>
                {lacking.count} {lacking.count === 1 ? 'person has' : 'people have'} no {lacking.fields.map(k => (k === 'company' ? 'company' : 'job title')).join(' or ')} on record, which this email uses ({lacking.names.join(', ')}{lacking.count > lacking.names.length ? '…' : ''}).
                <div style={{ marginTop: '8px' }}><Button variant="teal" onClick={() => { setSkipLacking(true); void send(true) }} disabled={busy === 'send'}>Leave them out and send to the rest</Button></div>
              </div>
            )}
            {needsConfirm && (
              <label style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', marginTop: '12px', fontSize: '13.5px', color: 'var(--ink)', cursor: 'pointer' }}>
                <input type="checkbox" checked={confirmed} onChange={() => setConfirmed(v => !v)} style={{ marginTop: '3px' }} /> This goes to {count} people. I have checked the list and the email, and sent myself a test.
              </label>
            )}
            {busy === 'send' && progress && <div style={{ marginTop: '12px', fontSize: '13.5px', color: 'var(--ink)' }}>Sending… {progress.sent + progress.failed + progress.skipped} of {progress.total}</div>}
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '16px' }}>
              <Button variant="ghost" onClick={() => setReviewing(false)} disabled={busy === 'send'}>Back</Button>
              <Button variant="teal" onClick={() => send()} disabled={busy === 'send' || (needsConfirm && !confirmed)}>{busy === 'send' ? (scheduling ? 'Scheduling…' : 'Sending…') : (scheduling ? 'Schedule it' : pace > 0 ? `Start sending to ${count}` : `Send to ${count}`)}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
