'use client'

import { use, useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import PageHeader from '@/app/components/PageHeader'
import { Badge, Button, Input, Select } from '@/app/components/ui'
import { useBreadcrumbLabel } from '@/app/lib/nav/breadcrumb-labels'
import { notify } from '@/app/lib/ui/notify'
import { hasContent, wordCount, MAX_ATTACHMENT_BYTES, MAX_ATTACHMENTS } from '@/app/lib/speaker-emails/render'
import SpeakerEmailSendDialog, { type Attachment } from './SpeakerEmailSendDialog'

/* Speaker Emails (2026-10-23) — a calm, large-type place for producers to write a general email to speakers. Left tabs: Speakers (pick), Write (compose + Polish),
   Drafts, Sent. The producer writes only the middle; the greeting and sign-off are added per speaker, and each email goes out as that speaker's own producer into the
   speaker's one Outlook thread. "Polish" rewrites the draft to the event's guidelines in one click; the producer can keep it, undo it, or keep editing. */

type SpeakerRow = {
  speaker_id: string; name: string; company: string | null; role: string | null; country: string | null; producer: string | null; producer_id: string | null
  email_state: 'own' | 'contact' | 'none'; last_emailed: string | null; emailed_count: number
}
type Draft = { id: string; title: string; recipient_speaker_ids: string[]; body_html: string; attachments: Attachment[]; updated_at: string }
type HistoryRow = { id: string; batch_id: string; speaker_id: string; speaker: string; subject: string | null; to: string; cc: string[]; from: string; status: 'sent' | 'failed'; error: string | null; sent_at: string; polished: boolean; attachments: number }
type Finding = { message: string; match: string }
type Tab = 'speakers' | 'write' | 'drafts' | 'sent'

const fmtDate = (s: string | null) => s ? new Date(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : ''
const fmtDateTime = (s: string) => new Date(s).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const kb = (n: number) => n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`
const EMAIL_TONE = { own: { label: 'Has email', color: 'teal' }, contact: { label: 'Via contact', color: 'amber' }, none: { label: 'No email', color: 'red' } } as const

export default function SpeakerEmailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = use(params)
  const search = useSearchParams()
  const fromHub = (search.get('speakers') ?? '').split(',').filter(Boolean) // speakers chosen in the Hub arrive in the address
  const [tab, setTab] = useState<Tab>(fromHub.length ? 'write' : 'speakers')
  const [rows, setRows] = useState<SpeakerRow[] | null>(null)
  const [canSend, setCanSend] = useState(false)
  const [me, setMe] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [eventName, setEventName] = useState<string | null>(null)
  const [picked, setPicked] = useState<Set<string>>(() => new Set(fromHub))
  const [find, setFind] = useState('')
  const [producer, setProducer] = useState('')
  const [onlyMine, setOnlyMine] = useState(false)
  const [notYet, setNotYet] = useState(false)
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [uploading, setUploading] = useState(false)
  const [drafts, setDrafts] = useState<Draft[] | null>(null)
  const [draftId, setDraftId] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [history, setHistory] = useState<HistoryRow[] | null>(null)
  const [historyFind, setHistoryFind] = useState('')
  const [viewing, setViewing] = useState<{ row: HistoryRow; html: string | null } | null>(null)
  const [sending, setSending] = useState(false)
  const [polishing, setPolishing] = useState(false)
  const [polish, setPolish] = useState<{ before: string; changes: string[]; errors: Finding[]; warnings: Finding[]; showOriginal: boolean } | null>(null)
  const [firstOriginal, setFirstOriginal] = useState<string | null>(null)
  const [polishedUsed, setPolishedUsed] = useState(false)
  const [words, setWords] = useState(0)
  const [tick, setTick] = useState(0)
  useBreadcrumbLabel(eventId, eventName)
  const reload = useCallback(() => setTick(t => t + 1), [])

  const editor = useEditor({
    extensions: [StarterKit.configure({ heading: false, blockquote: false, codeBlock: false, code: false, horizontalRule: false, strike: false, link: { openOnClick: false } })],
    content: '',
    immediatelyRender: false,
    editorProps: { attributes: { 'aria-label': 'Email message', style: 'min-height:260px;outline:none;' } },
    onUpdate: ({ editor: ed }) => { setDirty(true); setWords(wordCount(ed.getHTML())) },
  })

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const [a, e] = await Promise.all([fetch(`/api/events/stakeholders/speaker-emails/speakers?event_id=${eventId}`), fetch(`/api/events?id=${eventId}`)])
      const d = await a.json().catch(() => ({})), ed = await e.json().catch(() => ({}))
      if (cancelled) return
      if (!a.ok) { setError(d.error ?? 'Could not load the speakers.'); setRows([]); return }
      setRows(d.rows); setCanSend(!!d.can_send); setMe(d.me ?? null)
      const ev = Array.isArray(ed) ? ed[0] : ed; setEventName(ev?.public_name || ev?.name || null)
    })()
    return () => { cancelled = true }
  }, [eventId, tick])

  useEffect(() => {
    if (tab !== 'drafts' || !canSend) return
    fetch(`/api/events/stakeholders/speaker-emails/drafts?event_id=${eventId}`).then(r => r.json()).then(d => setDrafts(d.drafts ?? [])).catch(() => setDrafts([]))
  }, [tab, eventId, canSend])
  useEffect(() => {
    if (tab !== 'sent') return
    fetch(`/api/events/stakeholders/speaker-emails/history?event_id=${eventId}`).then(r => r.json()).then(d => setHistory(d.rows ?? [])).catch(() => setHistory([]))
  }, [tab, eventId, tick])
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (dirty) { e.preventDefault() } }
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const producers = useMemo(() => [...new Set((rows ?? []).map(r => r.producer).filter((p): p is string => !!p))].sort(), [rows])
  const shown = useMemo(() => (rows ?? []).filter(r =>
    (!producer || (producer === '__none' ? !r.producer : r.producer === producer)) && (!onlyMine || r.producer_id === me) && (!notYet || r.emailed_count === 0) &&
    (!find.trim() || `${r.name} ${r.company ?? ''} ${r.role ?? ''}`.toLowerCase().includes(find.trim().toLowerCase()))), [rows, producer, onlyMine, notYet, find, me])
  const pickedRows = (rows ?? []).filter(r => picked.has(r.speaker_id))
  const reachable = pickedRows.filter(r => r.email_state !== 'none')
  const toggle = (id: string) => setPicked(p => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n })

  function addLink() {
    if (!editor) return
    const prev = editor.getAttributes('link').href as string | undefined
    const url = window.prompt('Link address (leave blank to remove the link):', prev ?? 'https://')
    if (url === null) return
    const t = url.trim()
    if (!t || t === 'https://') editor.chain().focus().extendMarkRange('link').unsetLink().run()
    else editor.chain().focus().extendMarkRange('link').setLink({ href: t }).run()
  }

  async function runPolish() {
    if (!editor) return
    const before = editor.getHTML()
    if (!hasContent(before)) { notify('Write something first — Polish tidies what you have written.', 'error'); return }
    setPolishing(true)
    try {
      const res = await fetch('/api/events/stakeholders/speaker-emails/polish', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event_id: eventId, body_html: before, speaker_ids: [...picked] }) })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { notify(d.error ?? 'Polish didn’t work. Your text is untouched.', 'error'); return }
      if (firstOriginal === null) setFirstOriginal(before)
      editor.commands.setContent(d.polished_html); setWords(wordCount(d.polished_html)); setDirty(true); setPolishedUsed(true)
      setPolish({ before, changes: d.changes ?? [], errors: d.errors ?? [], warnings: d.warnings ?? [], showOriginal: false })
    } finally { setPolishing(false) }
  }
  function undoPolish() {
    if (!editor || !polish) return
    editor.commands.setContent(polish.before); setWords(wordCount(polish.before)); setPolish(null)
    if (polish.before === firstOriginal) { setFirstOriginal(null); setPolishedUsed(false) }
  }

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
        list = [...list, d as Attachment]; setAttachments(list); setDirty(true)
      }
    } finally { setUploading(false) }
  }

  async function saveDraft() {
    if (!editor) return
    const html = editor.getHTML()
    const title = (hasContent(html) ? html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60) : '') || 'Untitled draft'
    const res = await fetch('/api/events/stakeholders/speaker-emails/drafts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event_id: eventId, id: draftId ?? undefined, title, recipient_speaker_ids: [...picked], body_html: html, attachments }) })
    const d = await res.json().catch(() => ({}))
    if (!res.ok) { notify(d.error ?? 'Could not save the draft.', 'error'); return }
    setDraftId(d.id); setDirty(false); setSavedAt(new Date().toISOString()); notify('Draft saved.')
  }
  function openDraft(d: Draft) {
    editor?.commands.setContent(d.body_html); setWords(wordCount(d.body_html))
    setPicked(new Set(d.recipient_speaker_ids.filter(i => rows?.some(r => r.speaker_id === i)))); setAttachments(d.attachments ?? [])
    setDraftId(d.id); setPolish(null); setFirstOriginal(null); setPolishedUsed(false); setDirty(false); setTab('write')
  }
  async function deleteDraft(id: string) {
    await fetch(`/api/events/stakeholders/speaker-emails/drafts?event_id=${eventId}&id=${id}`, { method: 'DELETE' })
    setDrafts(prev => (prev ?? []).filter(d => d.id !== id)); if (draftId === id) setDraftId(null)
  }
  function newEmail() {
    if (dirty && !window.confirm('Start a new email? Your current text has not been saved as a draft.')) return
    editor?.commands.setContent(''); setWords(0); setAttachments([]); setDraftId(null); setPolish(null); setFirstOriginal(null); setPolishedUsed(false); setDirty(false); setSavedAt(null); setTab('write')
  }
  async function afterSend(sentAny: boolean) {
    if (!sentAny) return
    if (draftId) await fetch(`/api/events/stakeholders/speaker-emails/drafts?event_id=${eventId}&id=${draftId}`, { method: 'DELETE' }).catch(() => {})
    editor?.commands.setContent(''); setWords(0); setAttachments([]); setDraftId(null); setPolish(null); setFirstOriginal(null); setPolishedUsed(false); setDirty(false); setSavedAt(null)
    setPicked(new Set()); reload(); setTab('sent')
  }
  async function openSent(row: HistoryRow) {
    setViewing({ row, html: null })
    const res = await fetch(`/api/events/stakeholders/speaker-emails/history?event_id=${eventId}&send_id=${row.id}`)
    const d = await res.json().catch(() => ({}))
    setViewing({ row, html: res.ok ? d.body_html : '<p>Could not load this email.</p>' })
  }

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: 'speakers', label: 'Speakers', count: picked.size || undefined }, { key: 'write', label: 'Write' },
    ...(canSend ? [{ key: 'drafts' as Tab, label: 'Drafts' }] : []), { key: 'sent', label: 'Sent' },
  ]
  const meter = words === 0 ? null : words <= 150 ? { color: 'var(--teal-mid)', text: 'Good length' } : words <= 220 ? { color: 'var(--amber)', text: 'A bit long — shorter emails get read' } : { color: 'var(--red)', text: 'Too long — most people will skim this' }
  const label: React.CSSProperties = { fontSize: '13px', fontWeight: 800, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em' }
  const th: React.CSSProperties = { textAlign: 'left', padding: '10px 12px', fontSize: '12px', fontWeight: 800, letterSpacing: '0.04em', color: 'var(--ink3)', textTransform: 'uppercase', position: 'sticky', top: 0, background: 'var(--card)' }
  const td: React.CSSProperties = { padding: '12px', fontSize: '15px', color: 'var(--ink)', borderTop: '1px solid var(--border-light)', verticalAlign: 'top' }
  const tbtn = (on: boolean): React.CSSProperties => ({ padding: '8px 14px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '15px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', background: on ? 'var(--teal-mid)' : 'var(--card)', color: on ? '#fff' : 'var(--ink2)' }) // eslint-disable-line no-restricted-syntax -- white on the active teal button

  return (
    <div style={{ minHeight: '100vh', background: 'var(--surface)' }}>
      <PageHeader eyebrow="Stakeholder Hub · Speakers" title="Speaker Emails" backHref={`/admin/events/${eventId}/stakeholders`} backLabel="Stakeholder Hub"
        description="Write a short email to one or many speakers. Each one goes out from that speaker’s own producer, in their one Outlook thread." />
      <div style={{ padding: '24px 32px 80px', display: 'grid', gridTemplateColumns: '220px 1fr', gap: '24px', alignItems: 'flex-start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {tabs.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', padding: '10px 12px', borderRadius: '8px', border: 'none', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', fontSize: '16px', fontWeight: 700, background: tab === t.key ? 'var(--card)' : 'transparent', color: tab === t.key ? 'var(--ink)' : 'var(--ink3)' }}>
              <span>{t.label}</span>{t.count ? <span style={{ fontSize: '13px', color: 'var(--teal-mid)', fontWeight: 800 }}>{t.count} chosen</span> : null}
            </button>
          ))}
          {canSend && <div style={{ marginTop: '10px' }}><Button variant="ghost" onClick={newEmail}>+ New email</Button></div>}
        </div>

        <div style={{ minWidth: 0 }}>
          {error && <div style={{ color: 'var(--red)', fontSize: '15px', marginBottom: '12px' }}>{error}</div>}
          {!canSend && rows && <div style={{ marginBottom: '14px', padding: '12px 14px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--card)', fontSize: '14px' }}>You can view this page but not send emails — that needs edit access to the Stakeholder Hub.</div>}

          {tab === 'speakers' && (
            <>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '14px' }}>
                <div style={{ fontSize: '22px', fontWeight: 900, color: 'var(--ink)' }}>Who is this email for?</div>
                <div style={{ flex: 1 }} />
                <Select value={producer} onChange={e => setProducer(e.target.value)} style={{ width: '190px' }}>
                  <option value="">All producers</option>
                  {producers.map(p => <option key={p} value={p}>{p}</option>)}
                  <option value="__none">No producer set</option>
                </Select>
                <Input value={find} onChange={e => setFind(e.target.value)} placeholder="Search speaker or company" style={{ width: '230px' }} />
              </div>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '12px' }}>
                {canSend && <>
                  <Button variant="ghost" onClick={() => setPicked(new Set([...picked, ...shown.filter(r => r.email_state !== 'none').map(r => r.speaker_id)]))}>Select all shown</Button>
                  <Button variant="ghost" onClick={() => setPicked(new Set())} disabled={picked.size === 0}>Clear</Button>
                </>}
                <label style={{ display: 'flex', gap: '6px', alignItems: 'center', fontSize: '14.5px', cursor: 'pointer' }}><input type="checkbox" checked={onlyMine} onChange={e => setOnlyMine(e.target.checked)} /> Only my speakers</label>
                <label style={{ display: 'flex', gap: '6px', alignItems: 'center', fontSize: '14.5px', cursor: 'pointer' }}><input type="checkbox" checked={notYet} onChange={e => setNotYet(e.target.checked)} /> Not emailed from here yet</label>
                <div style={{ flex: 1 }} />
                {canSend && <Button variant="teal" onClick={() => setTab('write')} disabled={picked.size === 0}>{picked.size ? `Write email to ${picked.size} →` : 'Choose speakers'}</Button>}
              </div>
              {rows === null ? <div style={{ color: 'var(--ink3)' }}>Loading…</div> : shown.length === 0 ? <div style={{ color: 'var(--ink3)', fontSize: '15px' }}>Nobody matches.</div> : (
                <div style={{ overflowX: 'auto', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '760px' }}>
                    <thead><tr><th style={{ ...th, width: '44px' }} /><th style={th}>Speaker</th><th style={th}>Producer</th><th style={th}>Email</th><th style={th}>Last emailed here</th></tr></thead>
                    <tbody>
                      {shown.map(r => (
                        <tr key={r.speaker_id} onClick={() => canSend && r.email_state !== 'none' && toggle(r.speaker_id)} style={{ cursor: canSend && r.email_state !== 'none' ? 'pointer' : 'default', background: picked.has(r.speaker_id) ? 'color-mix(in srgb, var(--teal) 8%, transparent)' : 'transparent' }}>
                          <td style={td}><input type="checkbox" checked={picked.has(r.speaker_id)} disabled={!canSend || r.email_state === 'none'} onChange={() => toggle(r.speaker_id)} onClick={e => e.stopPropagation()} style={{ width: '18px', height: '18px' }} title={r.email_state === 'none' ? 'No email address on file' : ''} /></td>
                          <td style={td}><div style={{ fontWeight: 700 }}>{r.name}</div><div style={{ fontSize: '13.5px', color: 'var(--ink3)' }}>{[r.role, r.company].filter(Boolean).join(' · ')}</div></td>
                          <td style={{ ...td, color: r.producer ? 'var(--ink2)' : 'var(--ink4)' }}>{r.producer ?? 'None set'}</td>
                          <td style={td}><Badge color={EMAIL_TONE[r.email_state].color}>{EMAIL_TONE[r.email_state].label}</Badge></td>
                          <td style={{ ...td, color: 'var(--ink3)', fontSize: '14px' }}>{r.last_emailed ? `${fmtDate(r.last_emailed)}${r.emailed_count > 1 ? ` · ${r.emailed_count} emails` : ''}` : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {/* The editor stays mounted (hidden on other tabs) so unsaved text survives switching tabs. */}
          <div style={{ display: tab === 'write' ? 'block' : 'none', maxWidth: '800px' }}>
            <div style={{ fontSize: '22px', fontWeight: 900, color: 'var(--ink)', marginBottom: '14px' }}>Write your email</div>

            <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '14px 16px', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <span style={label}>To</span>
                {pickedRows.length === 0 ? <span style={{ color: 'var(--ink3)', fontSize: '15px' }}>No speakers chosen yet</span> : (
                  <>
                    {pickedRows.slice(0, 6).map(r => <span key={r.speaker_id} style={{ padding: '4px 10px', borderRadius: '999px', background: 'var(--card-hi)', border: '1px solid var(--border)', fontSize: '14.5px', fontWeight: 600 }}>{r.name}</span>)}
                    {pickedRows.length > 6 && <span style={{ fontSize: '14.5px', color: 'var(--ink3)' }}>+ {pickedRows.length - 6} more</span>}
                  </>
                )}
                <div style={{ flex: 1 }} />
                <Button variant="ghost" onClick={() => setTab('speakers')}>{pickedRows.length ? 'Change' : 'Choose speakers'}</Button>
              </div>
              {pickedRows.some(r => r.email_state === 'none') && <div style={{ fontSize: '13.5px', color: 'var(--red)', marginTop: '8px' }}>{pickedRows.filter(r => r.email_state === 'none').length} chosen speaker(s) have no email and will be skipped.</div>}
              <div style={{ fontSize: '13.5px', color: 'var(--ink3)', marginTop: '8px', lineHeight: 1.5 }}>Subject: <strong style={{ color: 'var(--ink2)' }}>“Speaker name @ {eventName ?? 'Event'}”</strong> — fixed, so every email joins that speaker’s one Outlook thread.</div>
            </div>

            <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', padding: '10px 14px', borderBottom: '1px solid var(--border-light)', background: 'var(--card-hi)' }}>
                <button type="button" style={tbtn(!!editor?.isActive('bold'))} onClick={() => editor?.chain().focus().toggleBold().run()}>Bold</button>
                <button type="button" style={tbtn(!!editor?.isActive('italic'))} onClick={() => editor?.chain().focus().toggleItalic().run()}>Italic</button>
                <button type="button" style={tbtn(!!editor?.isActive('bulletList'))} onClick={() => editor?.chain().focus().toggleBulletList().run()}>• List</button>
                <button type="button" style={tbtn(!!editor?.isActive('orderedList'))} onClick={() => editor?.chain().focus().toggleOrderedList().run()}>1. List</button>
                <button type="button" style={tbtn(!!editor?.isActive('link'))} onClick={addLink}>Link</button>
                <div style={{ flex: 1 }} />
                <Button variant="teal" onClick={runPolish} disabled={polishing || !canSend}>{polishing ? 'Polishing…' : '✨ Polish'}</Button>
              </div>
              <div style={{ padding: '18px 22px 4px', fontSize: '18px', lineHeight: 1.7, color: 'var(--ink)' }}>
                <div style={{ color: 'var(--ink3)', marginBottom: '10px' }} title="Added automatically for each speaker">Dear <em>{pickedRows[0]?.name ?? 'Speaker name'}</em>,</div>
                <EditorContent editor={editor} />
                <div style={{ color: 'var(--ink3)', margin: '14px 0 16px' }} title="Added automatically — the speaker’s own producer">Warm regards,<br /><strong>{pickedRows[0]?.producer ?? 'Their producer'}</strong></div>
              </div>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center', padding: '8px 16px 12px', fontSize: '13.5px', color: 'var(--ink3)', flexWrap: 'wrap' }}>
                <span>{words} word{words === 1 ? '' : 's'}</span>{meter && <span style={{ color: meter.color, fontWeight: 700 }}>{meter.text}</span>}
                <span style={{ marginLeft: 'auto' }}>The greeting and sign-off are added for you.</span>
              </div>
            </div>

            {polish && (
              <div style={{ marginTop: '14px', padding: '14px 16px', borderRadius: '12px', border: '1px solid var(--teal)', background: 'color-mix(in srgb, var(--teal) 6%, var(--card))' }}>
                <div style={{ fontSize: '16px', fontWeight: 800, marginBottom: '6px' }}>✨ Polished — here’s what changed</div>
                {polish.changes.length > 0 ? <ul style={{ margin: '0 0 8px 20px', padding: 0, fontSize: '15px', lineHeight: 1.6 }}>{polish.changes.map((c, i) => <li key={i}>{c}</li>)}</ul> : <div style={{ fontSize: '15px', marginBottom: '8px' }}>The wording was tidied.</div>}
                {polish.errors.length > 0 && <div style={{ color: 'var(--red)', fontSize: '14.5px', marginBottom: '6px' }}><strong>Still breaks the event’s content rules:</strong> {polish.errors.map(f => `${f.message}${f.match ? ` (“${f.match}”)` : ''}`).join('; ')}. Edit it before sending.</div>}
                {polish.warnings.length > 0 && <div style={{ color: 'var(--amber)', fontSize: '14.5px', marginBottom: '6px' }}>Worth a look: {polish.warnings.map(f => `${f.message}${f.match ? ` (“${f.match}”)` : ''}`).join('; ')}</div>}
                <div style={{ fontSize: '14px', color: 'var(--ink3)', marginBottom: '10px' }}>Happy with it? Carry on, or keep editing — it’s your email. Not right? Undo brings back exactly what you wrote.</div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <Button variant="teal" onClick={() => setPolish(null)}>Keep this version</Button>
                  <Button variant="ghost" onClick={undoPolish}>Undo — back to mine</Button>
                  <Button variant="ghost" onClick={() => setPolish({ ...polish, showOriginal: !polish.showOriginal })}>{polish.showOriginal ? 'Hide my original' : 'Show my original'}</Button>
                </div>
                {polish.showOriginal && <div style={{ marginTop: '10px', padding: '10px 14px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--card)', fontSize: '15px', lineHeight: 1.6 }} dangerouslySetInnerHTML={{ __html: polish.before }} />}
              </div>
            )}

            <div style={{ marginTop: '16px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '14px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <span style={label}>Attachments</span>
                <span style={{ fontSize: '13.5px', color: 'var(--ink3)' }}>PDF, Word, Excel, PowerPoint or images · up to {MAX_ATTACHMENT_BYTES / 1048576} MB in total</span>
                <div style={{ flex: 1 }} />
                <label style={{ cursor: canSend && !uploading ? 'pointer' : 'default' }}>
                  <input type="file" multiple hidden disabled={!canSend || uploading} onChange={e => { void addFiles(e.target.files); e.target.value = '' }} />
                  <span style={{ display: 'inline-block', padding: '8px 14px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '15px', fontWeight: 700, background: 'var(--card)', color: 'var(--ink2)' }}>{uploading ? 'Uploading…' : '+ Attach files'}</span>
                </label>
              </div>
              {attachments.length > 0 && (
                <div style={{ marginTop: '10px', display: 'grid', gap: '6px' }}>
                  {attachments.map(a => (
                    <div key={a.url} style={{ display: 'flex', gap: '10px', alignItems: 'center', fontSize: '15px' }}>
                      <span>📎 {a.name}</span><span style={{ color: 'var(--ink3)', fontSize: '13.5px' }}>{kb(a.size)}</span>
                      <button type="button" onClick={() => { setAttachments(attachments.filter(x => x.url !== a.url)); setDirty(true) }} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--ink3)', fontSize: '18px', cursor: 'pointer' }} aria-label={`Remove ${a.name}`}>×</button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '18px', alignItems: 'center', flexWrap: 'wrap' }}>
              <Button variant="teal" onClick={() => setSending(true)} disabled={!canSend || reachable.length === 0 || !hasContent(editor?.getHTML() ?? '')}>{reachable.length ? `Review & send to ${reachable.length}` : 'Review & send'}</Button>
              {canSend && <Button variant="ghost" onClick={saveDraft} disabled={!hasContent(editor?.getHTML() ?? '')}>Save draft</Button>}
              <span style={{ fontSize: '13.5px', color: 'var(--ink3)' }}>{dirty ? 'Unsaved changes' : savedAt ? `Draft saved ${fmtDateTime(savedAt)}` : ''}</span>
            </div>
          </div>

          {tab === 'drafts' && (
            <>
              <div style={{ fontSize: '22px', fontWeight: 900, color: 'var(--ink)', marginBottom: '14px' }}>Your drafts</div>
              {drafts === null ? <div style={{ color: 'var(--ink3)' }}>Loading…</div> : drafts.length === 0 ? <div style={{ color: 'var(--ink3)', fontSize: '15px' }}>No saved drafts. Use “Save draft” while writing.</div> : (
                <div style={{ display: 'grid', gap: '10px', maxWidth: '800px' }}>
                  {drafts.map(d => (
                    <div key={d.id} style={{ display: 'flex', gap: '12px', alignItems: 'center', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '14px 16px' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '16px', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.title || 'Untitled draft'}</div>
                        <div style={{ fontSize: '13.5px', color: 'var(--ink3)' }}>{d.recipient_speaker_ids.length} speaker{d.recipient_speaker_ids.length === 1 ? '' : 's'}{d.attachments?.length ? ` · ${d.attachments.length} attachment${d.attachments.length === 1 ? '' : 's'}` : ''} · saved {fmtDateTime(d.updated_at)}</div>
                      </div>
                      <Button variant="teal" onClick={() => openDraft(d)}>Open</Button>
                      <Button variant="ghost" onClick={() => deleteDraft(d.id)}>Delete</Button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {tab === 'sent' && (
            <>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap' }}>
                <div style={{ fontSize: '22px', fontWeight: 900, color: 'var(--ink)' }}>Sent from here</div>
                <div style={{ flex: 1 }} />
                <Input value={historyFind} onChange={e => setHistoryFind(e.target.value)} placeholder="Search speaker" style={{ width: '230px' }} />
              </div>
              {history === null ? <div style={{ color: 'var(--ink3)' }}>Loading…</div> : history.length === 0 ? <div style={{ color: 'var(--ink3)', fontSize: '15px' }}>Nothing sent from here yet.</div> : (
                <div style={{ overflowX: 'auto', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '760px' }}>
                    <thead><tr><th style={th}>When</th><th style={th}>Speaker</th><th style={th}>From</th><th style={th}>Result</th><th style={th} /></tr></thead>
                    <tbody>
                      {history.filter(h => !historyFind.trim() || h.speaker.toLowerCase().includes(historyFind.trim().toLowerCase())).map(h => (
                        <tr key={h.id}>
                          <td style={{ ...td, whiteSpace: 'nowrap', color: 'var(--ink2)' }}>{fmtDateTime(h.sent_at)}</td>
                          <td style={td}><div style={{ fontWeight: 700 }}>{h.speaker}</div><div style={{ fontSize: '13px', color: 'var(--ink3)', overflowWrap: 'anywhere' }}>{h.to}{h.cc.length ? ` · cc ${h.cc.join(', ')}` : ''}</div></td>
                          <td style={{ ...td, color: 'var(--ink2)' }}>{h.from}</td>
                          <td style={td}>
                            {h.status === 'sent' ? <Badge color="teal">Sent</Badge> : <><Badge color="red">Failed</Badge><div style={{ fontSize: '12.5px', color: 'var(--red)', marginTop: '4px', maxWidth: '260px' }}>{h.error}</div></>}
                            <div style={{ fontSize: '12.5px', color: 'var(--ink3)', marginTop: '4px' }}>{[h.polished ? 'Polished' : '', h.attachments ? `${h.attachments} attachment${h.attachments === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · ')}</div>
                          </td>
                          <td style={td}><Button variant="ghost" onClick={() => openSent(h)}>View</Button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {sending && editor && <SpeakerEmailSendDialog eventId={eventId} speakerIds={reachable.map(r => r.speaker_id)} bodyHtml={editor.getHTML()} polished={polishedUsed} originalHtml={firstOriginal} attachments={attachments} onClose={() => setSending(false)} onFinished={afterSend} />}
      {viewing && (
        <div role="dialog" aria-modal="true" style={{ position: 'fixed', inset: 0, background: 'var(--overlay-scrim)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px', padding: '22px', width: 'min(720px, 100%)', maxHeight: '92vh', overflowY: 'auto' }}>
            <div style={{ fontSize: '18px', fontWeight: 900, marginBottom: '4px' }}>{viewing.row.speaker}</div>
            <div style={{ fontSize: '13.5px', color: 'var(--ink3)', marginBottom: '12px', lineHeight: 1.5 }}>{fmtDateTime(viewing.row.sent_at)} · from {viewing.row.from} · to {viewing.row.to}{viewing.row.cc.length ? ` · cc ${viewing.row.cc.join(', ')}` : ''}<br />Subject: {viewing.row.subject ?? '—'}</div>
            {viewing.html === null ? <div style={{ color: 'var(--ink3)' }}>Loading…</div> : <iframe title="Sent email" srcDoc={viewing.html} sandbox="" style={{ width: '100%', height: '420px', border: '1px solid var(--border)', borderRadius: '8px', background: 'white' }} />}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '14px' }}><Button variant="ghost" onClick={() => setViewing(null)}>Close</Button></div>
          </div>
        </div>
      )}
    </div>
  )
}
