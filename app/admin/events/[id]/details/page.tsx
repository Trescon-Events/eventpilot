'use client'

import { useState, useEffect, use } from 'react'
import Link from 'next/link'
import PageHeader from '@/app/components/PageHeader'
import { Button, Card, Input } from '@/app/components/ui'
import { FORM_TITLES, FormType } from '@/app/lib/forms/types'
import { TRACKED_EVENT_FIELDS, FIELD_LABELS, TrackedEventField } from '@/app/lib/events/detail-fields'

/* Event Details — the single place a producer manages "everything about
   this event" that's frequently referenced and fetched elsewhere (invite
   emails, announcement copy, brand generation, the public onboarding
   form): the Common Details (public name, dates/venue as shown publicly,
   links, socials, per-form-type onboarding page links) plus the Topline
   Messaging Doc, which is the initial source those Common Details get
   proposed from (2026-08-11 Event Details Page plan). Absorbs and
   replaces the inline Public-Facing Details/Digital Presence/Social
   Channels/Venue Map sections that used to live on the main workspace
   page's Edit mode. */

type EventRow = { id: string; name: string } & Record<TrackedEventField, string | null>

type PageLink = { form_type: string; hubspot_form_name: string | null; public_page_url: string | null }

type HistoryRow = {
  id: string; field_key: string; old_value: string | null; new_value: string | null
  change_source: 'manual' | 'ai_extraction'; changed_at: string
  staff: { name: string } | null
}

type Section = {
  id: string; order: number; title: string; kind: 'text' | 'table' | 'facts' | 'rules'; content: unknown
  updated_at?: string; updated_by?: string | null; change_note?: string | null
}

type MessagingDoc = {
  id: string; event_id: string; version: number; title: string
  status: 'draft' | 'live' | 'superseded'
  structured_json: { sections: Section[]; default_fields?: Record<string, string | null> } | null
  source_url: string | null; updated_at: string; created_at: string
}

type Proposal = {
  target_type: 'section' | 'default_field'
  target_key: string
  target_label: string
  current_excerpt: string
  proposed_content: unknown
  rationale: string
  conflict: string | null
  status: 'pending' | 'approved' | 'discarded'
}
type ChatMessage = { role: 'user' | 'assistant'; text: string; instruction?: string; proposals?: Proposal[] }

function getSession() {
  if (typeof document === 'undefined') return null
  const raw = document.cookie.split('; ').find(c => c.startsWith('tcs_session='))?.split('=')[1]
  if (!raw) return null
  try { return JSON.parse(atob(raw)) as { sid: string } } catch { return null }
}

function fmtDate(iso?: string) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function EventDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = use(params)
  const session = getSession()

  const [permissions, setPermissions] = useState<Set<string>>(new Set())
  const [event, setEvent] = useState<EventRow | null>(null)
  const [editForm, setEditForm] = useState<Record<TrackedEventField, string>>(
    Object.fromEntries(TRACKED_EVENT_FIELDS.map(k => [k, ''])) as Record<TrackedEventField, string>
  )
  const [pageLinks, setPageLinks] = useState<PageLink[]>([])
  const [pageLinkDrafts, setPageLinkDrafts] = useState<Record<string, string>>({})
  const [history, setHistory] = useState<HistoryRow[] | null>(null)
  const [showHistory, setShowHistory] = useState(false)

  const [docs, setDocs] = useState<MessagingDoc[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [msgIsError, setMsgIsError] = useState(false)

  const can = (key: string) => permissions.has('*') || permissions.has(key)
  const canManage = can('sae.forms.manage')

  const liveDoc = docs.find(d => d.status === 'live') ?? null
  const draftDoc = docs.filter(d => d.status === 'draft').sort((a, b) => b.version - a.version)[0] ?? null

  async function loadAll() {
    const [permRes, eventRes, linksRes, docsRes] = await Promise.all([
      fetch(`/api/events/access/me?event_id=${eventId}`).then(r => r.json()).catch(() => ({ permissions: [] })),
      fetch(`/api/events?id=${eventId}`).then(r => r.json()).catch(() => null),
      fetch(`/api/events/stakeholders/hubspot/public-page-link?event_id=${eventId}`).then(r => r.json()).catch(() => []),
      fetch(`/api/events/stakeholders/messaging?event_id=${eventId}&all=true`).then(r => r.json()).catch(() => []),
    ])
    setPermissions(new Set(permRes.permissions ?? []))
    const ev = Array.isArray(eventRes) ? eventRes[0] : eventRes
    setEvent(ev ?? null)
    if (ev) setEditForm(Object.fromEntries(TRACKED_EVENT_FIELDS.map(k => [k, ev[k] ?? ''])) as Record<TrackedEventField, string>)
    setPageLinks(Array.isArray(linksRes) ? linksRes : [])
    setPageLinkDrafts(Object.fromEntries((Array.isArray(linksRes) ? linksRes : []).map((l: PageLink) => [l.form_type, l.public_page_url ?? ''])))
    setDocs(Array.isArray(docsRes) ? docsRes : [])
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-mount; matches other event pages' fetchAll effect
    setLoading(true)
    loadAll().finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadAll is stable for this effect's purpose (mount + eventId change only)
  }, [eventId])

  async function saveCommonDetails() {
    setSaving(true); setMsg(null)
    const res = await fetch(`/api/events?id=${eventId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(editForm),
    })
    const data = await res.json().catch(() => ({}))
    setSaving(false)
    if (res.ok) { setEvent(data); setMsg('Saved.'); setMsgIsError(false); if (showHistory) loadHistory() }
    else { setMsg(data.error ?? 'Save failed.'); setMsgIsError(true) }
  }

  async function savePageLink(formType: string) {
    setSaving(true); setMsg(null)
    const res = await fetch('/api/events/stakeholders/hubspot/public-page-link', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_id: eventId, form_type: formType, public_page_url: pageLinkDrafts[formType] || null }),
    })
    const data = await res.json().catch(() => ({}))
    setSaving(false)
    if (res.ok) {
      setPageLinks(prev => prev.map(l => l.form_type === formType ? data : l))
      setMsg('Saved.'); setMsgIsError(false)
      if (showHistory) loadHistory()
    } else { setMsg(data.error ?? 'Save failed.'); setMsgIsError(true) }
  }

  async function loadHistory() {
    const res = await fetch(`/api/events/stakeholders/details-history?event_id=${eventId}`)
    const data = await res.json().catch(() => [])
    setHistory(Array.isArray(data) ? data : [])
  }

  async function uploadMessagingDoc(file: File) {
    setSaving(true); setMsg(null)
    const form = new FormData()
    form.append('event_id', eventId)
    form.append('file', file)
    if (session?.sid) form.append('uploaded_by', session.sid)
    const res = await fetch('/api/events/stakeholders/messaging', { method: 'POST', body: form })
    setSaving(false)
    if (res.ok) { await loadAll(); setMsg('Uploaded — review the draft below before it goes live.'); setMsgIsError(false) }
    else { const data = await res.json().catch(() => ({})); setMsg(data.error ?? 'Upload failed.'); setMsgIsError(true) }
  }

  if (loading) return <div style={{ padding: '32px', fontSize: '13px', color: 'var(--ink3)' }}>Loading…</div>
  if (!event) return <div style={{ padding: '32px', fontSize: '13px', color: 'var(--red)' }}>Event not found.</div>

  return (
    <div style={{ minHeight: '100vh', background: 'var(--surface)' }}>
      <PageHeader
        eyebrow="Event Workspace / Event Details"
        title={event.name}
        description="Everything the rest of EventPilot reads for external content — invite emails, announcement copy, brand generation, the public onboarding form — plus the Topline Messaging Doc it's derived from."
        actions={<Link href={`/admin/events/${eventId}`}><Button variant="ghost">← Back to Workspace</Button></Link>}
      />

      <div style={{ padding: '24px 32px', maxWidth: '980px', display: 'grid', gap: '20px' }}>
        {msg && (
          <div style={{
            padding: '10px 14px', borderRadius: '8px', fontSize: '12.5px',
            background: msgIsError ? 'var(--red-light)' : 'var(--success-light)',
            border: `1px solid ${msgIsError ? 'var(--red-border)' : 'color-mix(in srgb, var(--success) 40%, transparent)'}`,
            color: msgIsError ? 'var(--red)' : 'var(--success)',
          }}>
            {msg}
          </div>
        )}

        {/* ── Common Details ── */}
        <Card padded>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
            <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '0.6px', textTransform: 'uppercase', color: 'var(--teal-mid)' }}>Common Details</div>
            <button onClick={() => { const v = !showHistory; setShowHistory(v); if (v && !history) loadHistory() }}
              style={{ background: 'none', border: 'none', fontSize: '11.5px', fontWeight: 700, color: 'var(--teal-mid)', cursor: 'pointer' }}>
              {showHistory ? 'Hide history' : 'History'}
            </button>
          </div>
          <div style={{ fontSize: '12px', color: 'var(--ink3)', marginBottom: '14px' }}>
            What invite emails, announcement copy, brand generation, and the public onboarding form use — separate from the internal reference name/dates/venue used for reporting.
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            {TRACKED_EVENT_FIELDS.map(key => (
              <div key={key} style={key === 'public_name' || key === 'public_dates_display' || key === 'public_venue_display' ? { gridColumn: '1/-1' } : undefined}>
                <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink3)', display: 'block', marginBottom: '4px' }}>{FIELD_LABELS[key]}</label>
                <Input
                  disabled={!canManage}
                  value={editForm[key]}
                  onChange={e => setEditForm(f => ({ ...f, [key]: e.target.value }))}
                  placeholder={key === 'public_name' ? event.name : undefined}
                />
              </div>
            ))}
          </div>
          {canManage && (
            <div style={{ marginTop: '14px' }}>
              <Button variant="lime" onClick={saveCommonDetails} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
            </div>
          )}

          {showHistory && (
            <div style={{ marginTop: '16px', paddingTop: '14px', borderTop: '1px solid var(--border-light)' }}>
              {!history ? (
                <div style={{ fontSize: '12px', color: 'var(--ink3)' }}>Loading…</div>
              ) : history.length === 0 ? (
                <div style={{ fontSize: '12px', color: 'var(--ink3)' }}>No changes logged yet.</div>
              ) : (
                <div style={{ display: 'grid', gap: '6px' }}>
                  {history.map(h => (
                    <div key={h.id} style={{ fontSize: '11.5px', color: 'var(--ink3)' }}>
                      <strong style={{ color: 'var(--ink2)' }}>{h.field_key}</strong>: {h.old_value ?? '(blank)'} → {h.new_value ?? '(blank)'}
                      {' · '}{h.change_source === 'ai_extraction' ? 'from messaging doc' : (h.staff?.name ?? 'unknown')}
                      {' · '}{fmtDate(h.changed_at)}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </Card>

        {/* ── Public Onboarding Pages ── */}
        {pageLinks.length > 0 && (
          <Card padded>
            <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '0.6px', textTransform: 'uppercase', color: 'var(--teal-mid)', marginBottom: '4px' }}>Public Onboarding Pages</div>
            <div style={{ fontSize: '12px', color: 'var(--ink3)', marginBottom: '14px' }}>
              The officially branded page hosting each form type&apos;s embedded HubSpot form (e.g. worldaishow.com/malaysia/speaker-onboarding). Invite emails link here instead of EventPilot&apos;s own hosted page when set.
            </div>
            <div style={{ display: 'grid', gap: '10px' }}>
              {pageLinks.map(l => (
                <div key={l.form_type} style={{ display: 'grid', gridTemplateColumns: '160px 1fr auto', gap: '8px', alignItems: 'center' }}>
                  <div style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--ink)' }}>{FORM_TITLES[l.form_type as FormType] ?? l.form_type}</div>
                  <Input
                    disabled={!canManage}
                    value={pageLinkDrafts[l.form_type] ?? ''}
                    onChange={e => setPageLinkDrafts(d => ({ ...d, [l.form_type]: e.target.value }))}
                    placeholder="https://worldaishow.com/malaysia/speaker-onboarding"
                  />
                  {canManage && <Button variant="ghost" onClick={() => savePageLink(l.form_type)} disabled={saving}>Save</Button>}
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* ── Messaging Doc ── */}
        <MessagingDocSection
          eventId={eventId}
          canManage={canManage}
          liveDoc={liveDoc}
          draftDoc={draftDoc}
          session={session}
          onUpload={uploadMessagingDoc}
          uploading={saving}
          onApproved={loadAll}
        />
      </div>
    </div>
  )
}

function MessagingDocSection({ eventId, canManage, liveDoc, draftDoc, session, onUpload, uploading, onApproved }: {
  eventId: string
  canManage: boolean
  liveDoc: MessagingDoc | null
  draftDoc: MessagingDoc | null
  session: { sid: string } | null
  onUpload: (file: File) => void
  uploading: boolean
  onApproved: () => void
}) {
  return (
    <Card padded>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '4px' }}>
        <div>
          <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '0.6px', textTransform: 'uppercase', color: 'var(--teal-mid)' }}>Topline Messaging Doc</div>
          {liveDoc ? (
            <div style={{ fontSize: '12px', color: 'var(--ink3)', marginTop: '4px' }}>v{liveDoc.version} · Live · Last updated {fmtDate(liveDoc.updated_at)}</div>
          ) : (
            <div style={{ fontSize: '12px', color: 'var(--ink3)', marginTop: '4px' }}>No live version yet</div>
          )}
        </div>
        <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
          {liveDoc && <Link href={`/admin/events/${eventId}/messaging`}><Button variant="ghost">Open Messaging Doc →</Button></Link>}
          {canManage && (
            <label style={{ padding: '9px 16px', borderRadius: '8px', border: 'none', background: 'var(--lime)', color: 'var(--lime-dark)', fontSize: '13px', fontWeight: 800, cursor: uploading ? 'default' : 'pointer', opacity: uploading ? 0.6 : 1 }}>
              {uploading ? 'Uploading…' : liveDoc || draftDoc ? 'Upload replacement PDF ▲' : 'Upload PDF ▲'}
              <input type="file" accept="application/pdf" disabled={uploading} style={{ display: 'none' }}
                onChange={e => { const f = e.target.files?.[0]; if (f) onUpload(f); e.target.value = '' }} />
            </label>
          )}
        </div>
      </div>

      {draftDoc && (
        <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--border-light)' }}>
          <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--amber)', letterSpacing: '0.6px', textTransform: 'uppercase', marginBottom: '8px' }}>
            Draft v{draftDoc.version} — review before it goes live
          </div>
          <DraftReview doc={draftDoc} canManage={canManage} session={session} onApproved={onApproved} />
        </div>
      )}
    </Card>
  )
}

function DraftReview({ doc, canManage, session, onApproved }: {
  doc: MessagingDoc
  canManage: boolean
  session: { sid: string } | null
  onApproved: () => void
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [approving, setApproving] = useState(false)

  const sections = (doc.structured_json?.sections ?? []).slice().sort((a, b) => a.order - b.order)
  const defaultFields = doc.structured_json?.default_fields ?? {}

  async function send() {
    const question = input.trim()
    if (!question || chatLoading) return
    setInput('')
    setMessages(prev => [...prev, { role: 'user', text: question }])
    setChatLoading(true)
    try {
      const res = await fetch(`/api/events/stakeholders/messaging/${doc.id}/propose-edit`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: question, history: messages.slice(-8).map(m => ({ role: m.role, text: m.text })) }),
      })
      const data = await res.json()
      if (!res.ok || data.error) {
        setMessages(prev => [...prev, { role: 'assistant', text: data.error ?? 'Something went wrong. Please try again.' }])
      } else {
        const proposals: Proposal[] = (data.proposals ?? []).map((p: Omit<Proposal, 'status'>) => ({ ...p, status: 'pending' as const }))
        setMessages(prev => [...prev, { role: 'assistant', text: data.reply, instruction: question, proposals }])
      }
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', text: 'Connection error. Please check your network and try again.' }])
    } finally {
      setChatLoading(false)
    }
  }

  async function approveProposal(msgIndex: number, propIndex: number) {
    const m = messages[msgIndex]
    const proposal = m.proposals?.[propIndex]
    if (!proposal) return
    const res = await fetch(`/api/events/stakeholders/messaging/${doc.id}/apply-edit`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        target_type: proposal.target_type, target_key: proposal.target_key,
        new_content: proposal.proposed_content,
        instruction: m.instruction ?? proposal.rationale,
        applied_by: session?.sid ?? null,
      }),
    })
    if (!res.ok) return
    setMessages(prev => prev.map((mm, i) => i !== msgIndex ? mm : {
      ...mm, proposals: mm.proposals?.map((p, pi) => pi === propIndex ? { ...p, status: 'approved' } : p),
    }))
    onApproved() // refetch docs so the preview below reflects the applied change
  }

  function discardProposal(msgIndex: number, propIndex: number) {
    setMessages(prev => prev.map((mm, i) => i !== msgIndex ? mm : {
      ...mm, proposals: mm.proposals?.map((p, pi) => pi === propIndex ? { ...p, status: 'discarded' } : p),
    }))
  }

  async function approveDraft() {
    if (!window.confirm('Approve this version? It will go live, superseding the current live doc, and its default fields will be written into Common Details above.')) return
    setApproving(true)
    const res = await fetch(`/api/events/stakeholders/messaging/${doc.id}/approve`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ approved_by: session?.sid ?? null }),
    })
    setApproving(false)
    if (res.ok) onApproved()
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(280px, 380px)', gap: '16px', alignItems: 'start' }}>
      <div>
        <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink3)', marginBottom: '6px' }}>Default fields found</div>
        <div style={{ display: 'grid', gap: '4px', marginBottom: '14px' }}>
          {TRACKED_EVENT_FIELDS.map(key => (
            <div key={key} style={{ fontSize: '12px', color: 'var(--ink2)' }}>
              <strong style={{ color: 'var(--ink3)' }}>{FIELD_LABELS[key]}:</strong> {defaultFields[key] || <span style={{ color: 'var(--ink4)' }}>not found</span>}
            </div>
          ))}
        </div>
        <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink3)', marginBottom: '6px' }}>Sections ({sections.length})</div>
        <div style={{ display: 'grid', gap: '4px', marginBottom: '14px' }}>
          {sections.map(s => (
            <div key={s.id} style={{ fontSize: '12px', color: 'var(--ink2)' }}>{s.title} <span style={{ fontSize: '10px', color: 'var(--ink4)', textTransform: 'uppercase' }}>{s.kind}</span></div>
          ))}
        </div>
        {canManage && (
          <Button variant="lime" onClick={approveDraft} disabled={approving}>{approving ? 'Approving…' : 'Approve — make this version live'}</Button>
        )}
      </div>

      {canManage && (
        <div style={{ border: '1px solid var(--border-light)', borderRadius: '10px', padding: '12px', maxHeight: '520px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ flex: 1, overflowY: 'auto', marginBottom: '8px' }}>
            {messages.length === 0 && (
              <div style={{ fontSize: '12px', color: 'var(--ink3)', lineHeight: 1.5 }}>
                Chat to adjust anything before approving — e.g. &ldquo;the public name should be Dubai FinTech Summit, not DFS 2026&rdquo;.
              </div>
            )}
            {messages.map((m, mi) => (
              <div key={mi} style={{ marginBottom: '12px' }}>
                <div style={{
                  padding: '8px 10px', borderRadius: '10px', fontSize: '12px', lineHeight: 1.5,
                  background: m.role === 'user' ? 'var(--teal-light)' : 'var(--surface)',
                  border: m.role === 'user' ? 'none' : '1px solid var(--border-light)',
                }}>
                  {m.text}
                </div>
                {m.proposals?.map((p, pi) => (
                  <div key={pi} style={{
                    marginTop: '6px', border: `1px solid ${p.status === 'approved' ? 'var(--teal-mid)' : p.status === 'discarded' ? 'var(--border)' : 'var(--lime)'}`,
                    borderRadius: '8px', padding: '8px 10px', opacity: p.status === 'discarded' ? 0.5 : 1,
                  }}>
                    <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--ink)' }}>{p.target_label}</div>
                    <div style={{ fontSize: '11px', color: 'var(--ink3)', margin: '4px 0' }}>{p.rationale}</div>
                    {p.status === 'pending' ? (
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <Button variant="lime" onClick={() => approveProposal(mi, pi)}>Apply</Button>
                        <Button variant="ghost" onClick={() => discardProposal(mi, pi)}>Discard</Button>
                      </div>
                    ) : (
                      <div style={{ fontSize: '11px', fontWeight: 700, color: p.status === 'approved' ? 'var(--teal-mid)' : 'var(--ink3)' }}>
                        {p.status === 'approved' ? 'Applied ✓' : 'Discarded'}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '6px' }}>
            <textarea
              className="tfield" rows={2} value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
              placeholder="Describe a change…"
              style={{ flex: 1, resize: 'none' }}
            />
            <Button variant="teal" onClick={send} disabled={chatLoading || !input.trim()}>{chatLoading ? '…' : 'Send'}</Button>
          </div>
        </div>
      )}
    </div>
  )
}
