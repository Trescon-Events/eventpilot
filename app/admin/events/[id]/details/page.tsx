'use client'

import { useState, useEffect, useRef, useMemo, use } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import PageHeader from '@/app/components/PageHeader'
import { permissionSetSatisfies } from '@/app/lib/access/permission-match'
import { Button, Card, Input } from '@/app/components/ui'
import { FORM_TITLES, FormType } from '@/app/lib/forms/types'
import { TRACKED_EVENT_FIELDS, FIELD_LABELS, TrackedEventField } from '@/app/lib/events/detail-fields'
import { useBreadcrumbLabel } from '@/app/lib/nav/breadcrumb-labels'

/* Event Details — the single place a producer manages "everything about
   this event": Overview (Common Details — public name, dates/venue as
   shown publicly, links, socials, per-form-type onboarding page links,
   change history) and the Topline Messaging Doc, as two tabs on one page
   (2026-08-13 redesign — these used to be a page + a link-out to a
   separate /messaging route; consolidated per Madhu's explicit ask so
   there's one destination for both, and the old /messaging route now
   just redirects here). Uploading a PDF auto-derives Overview's fields
   (reviewed/approved on the Messaging Doc tab before it applies); a
   later edit to the live doc's sections (via its own chat) can leave
   Overview stale, so Overview offers "Sync with Messaging Doc" to re-
   derive just the fields that drifted. */

type EventRow = { id: string; name: string } & Record<TrackedEventField, string | null>

type PageLink = { form_type: string; hubspot_form_name: string | null; public_page_url: string | null }

type HistoryRow = {
  id: string; field_key: string; old_value: string | null; new_value: string | null
  change_source: 'manual' | 'ai_extraction'; changed_at: string
  staff: { name: string } | null
}

type SectionKind = 'text' | 'table' | 'facts' | 'rules'
type Section = {
  id: string; order: number; title: string; kind: SectionKind; content: unknown
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

function renderInline(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return parts.map((part, i) =>
    part.startsWith('**') && part.endsWith('**')
      ? <strong key={i} style={{ color: 'var(--ink)', fontWeight: 700 }}>{part.slice(2, -2)}</strong>
      : <span key={i}>{part}</span>
  )
}

function renderMarkdownLite(text: string) {
  const lines = String(text ?? '').split('\n')
  return lines.map((line, i) => {
    if (!line.trim()) return <div key={i} style={{ height: 6 }} />
    if (line.startsWith('- ') || line.startsWith('• ')) {
      return (
        <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 3 }}>
          <div style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--teal-mid)', marginTop: 9, flexShrink: 0 }} />
          <span style={{ fontSize: 13, color: 'var(--ink2)', lineHeight: 1.65 }}>{renderInline(line.replace(/^[-•]\s/, ''))}</span>
        </div>
      )
    }
    return <p key={i} style={{ fontSize: 13, color: 'var(--ink2)', lineHeight: 1.65, margin: '0 0 6px' }}>{renderInline(line)}</p>
  })
}

function SectionBody({ section }: { section: Section }) {
  if (section.kind === 'table') {
    const t = section.content as { columns: string[]; rows: string[][] }
    if (!t?.columns) return null
    return (
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
          <thead>
            <tr>{t.columns.map((c, i) => (
              <th key={i} style={{ textAlign: 'left', padding: '6px 10px', borderBottom: '1px solid var(--border)', color: 'var(--ink3)', fontWeight: 700, textTransform: 'uppercase', fontSize: 10.5, letterSpacing: '0.4px' }}>{c}</th>
            ))}</tr>
          </thead>
          <tbody>
            {t.rows?.map((row, ri) => (
              <tr key={ri}>{row.map((cell, ci) => (
                <td key={ci} style={{ padding: '6px 10px', borderBottom: '1px solid var(--border-light)', color: 'var(--ink2)', verticalAlign: 'top' }}>{cell}</td>
              ))}</tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  if (section.kind === 'facts') {
    const facts = section.content as Array<{ fact: string; detail: string; source?: string }>
    if (!Array.isArray(facts)) return null
    return (
      <div style={{ display: 'grid', gap: 8 }}>
        {facts.map((f, i) => (
          <div key={i} style={{ padding: '8px 12px', background: 'var(--surface)', border: '1px solid var(--border-light)', borderRadius: 8 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink)' }}>{f.fact}</div>
            <div style={{ fontSize: 12.5, color: 'var(--ink2)', marginTop: 2 }}>{f.detail}</div>
            {f.source && <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 3 }}>Source: {f.source}</div>}
          </div>
        ))}
      </div>
    )
  }

  return <div>{renderMarkdownLite(String(section.content ?? ''))}</div>
}

export default function EventDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = use(params)
  const session = getSession()
  const searchParams = useSearchParams()
  const router = useRouter()

  const [tab, setTabState] = useState<'overview' | 'messaging'>(searchParams.get('tab') === 'messaging' ? 'messaging' : 'overview')
  function setTab(t: 'overview' | 'messaging') {
    setTabState(t)
    router.replace(`/admin/events/${eventId}/details${t === 'messaging' ? '?tab=messaging' : ''}`, { scroll: false })
  }

  const [permissions, setPermissions] = useState<Set<string>>(new Set())
  const [event, setEvent] = useState<EventRow | null>(null)
  // Breadcrumb trail (GlobalShell) has no way to know this event's real
  // name on its own — see breadcrumb-labels.tsx.
  useBreadcrumbLabel(eventId, event?.name ?? null)
  const [editForm, setEditForm] = useState<Record<TrackedEventField, string>>(
    Object.fromEntries(TRACKED_EVENT_FIELDS.map(k => [k, ''])) as Record<TrackedEventField, string>
  )
  const [pageLinks, setPageLinks] = useState<PageLink[]>([])
  const [pageLinkDrafts, setPageLinkDrafts] = useState<Record<string, string>>({})
  const [history, setHistory] = useState<HistoryRow[] | null>(null)
  const [showHistory, setShowHistory] = useState(false)

  const [docs, setDocs] = useState<MessagingDoc[]>([])
  const [versions, setVersions] = useState<MessagingDoc[]>([])
  const [showVersions, setShowVersions] = useState(false)

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [msgIsError, setMsgIsError] = useState(false)

  const [syncProposals, setSyncProposals] = useState<Proposal[] | null>(null)
  const [syncReply, setSyncReply] = useState<string | null>(null)
  const [syncLoading, setSyncLoading] = useState(false)

  const can = (key: string) => permissionSetSatisfies(permissions, key)
  const canManage = can('sae.forms.manage')

  const liveDoc = docs.find(d => d.status === 'live') ?? null
  const draftDoc = docs.filter(d => d.status === 'draft').sort((a, b) => b.version - a.version)[0] ?? null

  const lastAiSyncAt = useMemo(() => {
    const rows = (history ?? []).filter(h => h.change_source === 'ai_extraction')
    return rows.length === 0 ? null : rows.reduce((max, h) => (h.changed_at > max ? h.changed_at : max), rows[0].changed_at)
  }, [history])
  const needsSync = !!liveDoc && (!lastAiSyncAt || new Date(liveDoc.updated_at) > new Date(lastAiSyncAt))

  async function loadAll() {
    const [permRes, eventRes, linksRes, docsRes, historyRes] = await Promise.all([
      fetch(`/api/events/access/me?event_id=${eventId}`).then(r => r.json()).catch(() => ({ permissions: [] })),
      fetch(`/api/events?id=${eventId}`).then(r => r.json()).catch(() => null),
      fetch(`/api/events/stakeholders/hubspot/public-page-link?event_id=${eventId}`).then(r => r.json()).catch(() => []),
      fetch(`/api/events/stakeholders/messaging?event_id=${eventId}&all=true`).then(r => r.json()).catch(() => []),
      fetch(`/api/events/stakeholders/details-history?event_id=${eventId}`).then(r => r.json()).catch(() => []),
    ])
    setPermissions(new Set(permRes.permissions ?? []))
    const ev = Array.isArray(eventRes) ? eventRes[0] : eventRes
    setEvent(ev ?? null)
    if (ev) setEditForm(Object.fromEntries(TRACKED_EVENT_FIELDS.map(k => [k, ev[k] ?? ''])) as Record<TrackedEventField, string>)
    setPageLinks(Array.isArray(linksRes) ? linksRes : [])
    setPageLinkDrafts(Object.fromEntries((Array.isArray(linksRes) ? linksRes : []).map((l: PageLink) => [l.form_type, l.public_page_url ?? ''])))
    setDocs(Array.isArray(docsRes) ? docsRes : [])
    setHistory(Array.isArray(historyRes) ? historyRes : [])
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-mount; matches other event pages' fetchAll effect
    setLoading(true)
    loadAll().finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadAll is stable for this effect's purpose (mount + eventId change only)
  }, [eventId])

  async function fetchVersions() {
    const res = await fetch(`/api/events/stakeholders/messaging?event_id=${eventId}&all=true`)
    const data = await res.json().catch(() => [])
    setVersions(Array.isArray(data) ? data : [])
  }

  async function makeLive(target: MessagingDoc) {
    const currentLive = docs.find(d => d.status === 'live')
    if (currentLive && currentLive.id !== target.id) {
      await fetch(`/api/events/stakeholders/messaging/${currentLive.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'superseded' }),
      })
    }
    await fetch(`/api/events/stakeholders/messaging/${target.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'live' }),
    })
    await loadAll()
    await fetchVersions()
  }

  async function saveCommonDetails() {
    setSaving(true); setMsg(null)
    const res = await fetch(`/api/events?id=${eventId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(editForm),
    })
    const data = await res.json().catch(() => ({}))
    setSaving(false)
    if (res.ok) { setEvent(data); setMsg('Saved.'); setMsgIsError(false); await loadAll() }
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
      await loadAll()
    } else { setMsg(data.error ?? 'Save failed.'); setMsgIsError(true) }
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

  async function checkSync() {
    if (!liveDoc) return
    setSyncLoading(true); setSyncProposals(null); setSyncReply(null); setMsg(null)
    const res = await fetch(`/api/events/stakeholders/messaging/${liveDoc.id}/propose-edit`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sync: true }),
    })
    const data = await res.json().catch(() => ({}))
    setSyncLoading(false)
    if (res.ok) {
      setSyncReply(data.reply ?? null)
      setSyncProposals((data.proposals ?? []).map((p: Omit<Proposal, 'status'>) => ({ ...p, status: 'pending' as const })))
    } else { setMsg(data.error ?? 'Sync check failed.'); setMsgIsError(true) }
  }

  async function applySyncProposal(idx: number) {
    if (!liveDoc) return
    const p = syncProposals?.[idx]
    if (!p) return
    const res = await fetch(`/api/events/stakeholders/messaging/${liveDoc.id}/apply-edit`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        target_type: 'default_field', target_key: p.target_key, new_content: p.proposed_content,
        instruction: 'Synced from Messaging Doc', applied_by: session?.sid ?? null,
      }),
    })
    if (!res.ok) return
    setSyncProposals(prev => prev?.map((pp, i) => i === idx ? { ...pp, status: 'approved' } : pp) ?? null)
    await loadAll()
  }

  function discardSyncProposal(idx: number) {
    setSyncProposals(prev => prev?.map((pp, i) => i === idx ? { ...pp, status: 'discarded' } : pp) ?? null)
  }

  if (loading) return <div style={{ padding: '32px', fontSize: '13px', color: 'var(--ink3)' }}>Loading…</div>
  if (!event) return <div style={{ padding: '32px', fontSize: '13px', color: 'var(--red)' }}>Event not found.</div>

  return (
    <div style={{ minHeight: '100vh', background: 'var(--surface)' }}>
      <PageHeader
        eyebrow="Event Workspace / Event Details"
        title={event.name}
        description="Everything the rest of EventPilot reads for external content — invite emails, announcement copy, brand generation, the public onboarding form — plus the Topline Messaging Doc it's derived from."
        backHref={`/admin/events/${eventId}`}
        backLabel="Back to Workspace"
      />

      <div style={{ padding: '20px 32px 0', display: 'flex', gap: '4px', borderBottom: '1px solid var(--border-light)' }}>
        {([['overview', 'Overview'], ['messaging', 'Messaging Doc']] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            style={{
              padding: '10px 18px', border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit',
              fontSize: '13px', fontWeight: 800, color: tab === key ? 'var(--teal-mid)' : 'var(--ink3)',
              borderBottom: tab === key ? '2px solid var(--teal-mid)' : '2px solid transparent', marginBottom: '-1px',
            }}>
            {label}
            {key === 'messaging' && (draftDoc || needsSync) && (
              <span style={{ marginLeft: '6px', width: '6px', height: '6px', borderRadius: '50%', background: 'var(--amber)', display: 'inline-block' }} />
            )}
          </button>
        ))}
      </div>

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

        {tab === 'overview' && (
          <>
            {needsSync && !syncProposals && (
              <Card padded color="amber">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                  <div style={{ fontSize: '12.5px', color: 'var(--ink2)' }}>The Messaging Doc has been updated since Common Details was last synced from it.</div>
                  <Button variant="lime" onClick={checkSync} disabled={syncLoading}>{syncLoading ? 'Checking…' : 'Sync with Messaging Doc'}</Button>
                </div>
              </Card>
            )}
            {syncProposals && (
              <Card padded color="amber">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '0.6px', textTransform: 'uppercase', color: 'var(--amber)' }}>Sync with Messaging Doc</div>
                  <button onClick={() => setSyncProposals(null)} style={{ background: 'none', border: 'none', fontSize: '11.5px', fontWeight: 700, color: 'var(--ink3)', cursor: 'pointer' }}>Close</button>
                </div>
                {syncReply && <div style={{ fontSize: '12px', color: 'var(--ink3)', marginBottom: '10px' }}>{syncReply}</div>}
                {syncProposals.length === 0 ? (
                  <div style={{ fontSize: '12px', color: 'var(--ink3)' }}>Everything still matches — no changes proposed.</div>
                ) : (
                  <div style={{ display: 'grid', gap: '8px' }}>
                    {syncProposals.map((p, i) => (
                      <div key={i} style={{
                        border: `1px solid ${p.status === 'approved' ? 'var(--teal-mid)' : p.status === 'discarded' ? 'var(--border)' : 'var(--lime)'}`,
                        borderRadius: '8px', padding: '8px 10px', opacity: p.status === 'discarded' ? 0.5 : 1,
                      }}>
                        <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--ink)' }}>{p.target_label}</div>
                        <div style={{ fontSize: '11.5px', color: 'var(--ink3)', margin: '4px 0' }}>
                          {p.current_excerpt || '(blank)'} → <strong style={{ color: 'var(--ink2)' }}>{String(p.proposed_content ?? '(blank)')}</strong>
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--ink3)', marginBottom: '6px' }}>{p.rationale}</div>
                        {p.status === 'pending' ? (
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <Button variant="lime" onClick={() => applySyncProposal(i)}>Apply</Button>
                            <Button variant="ghost" onClick={() => discardSyncProposal(i)}>Discard</Button>
                          </div>
                        ) : (
                          <div style={{ fontSize: '11px', fontWeight: 700, color: p.status === 'approved' ? 'var(--teal-mid)' : 'var(--ink3)' }}>
                            {p.status === 'approved' ? 'Applied ✓' : 'Discarded'}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            )}

            <Card padded>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '0.6px', textTransform: 'uppercase', color: 'var(--teal-mid)' }}>Common Details</div>
                <button onClick={() => setShowHistory(v => !v)}
                  style={{ background: 'none', border: 'none', fontSize: '11.5px', fontWeight: 700, color: 'var(--teal-mid)', cursor: 'pointer' }}>
                  {showHistory ? 'Hide history' : 'History'}
                </button>
              </div>
              <div style={{ fontSize: '12px', color: 'var(--ink3)', marginBottom: '14px' }}>
                What invite emails, announcement copy, brand generation, and the public onboarding form use — separate from the internal reference name/dates/venue used for reporting. Auto-derived when a Messaging Doc is approved; editable directly here after that.
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
          </>
        )}

        {tab === 'messaging' && (
          <>
            <Card padded>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '0.6px', textTransform: 'uppercase', color: 'var(--teal-mid)' }}>Topline Messaging Doc</div>
                  {liveDoc ? (
                    <div style={{ fontSize: '12px', color: 'var(--ink3)', marginTop: '4px' }}>v{liveDoc.version} · Live · Last updated {fmtDate(liveDoc.updated_at)}</div>
                  ) : (
                    <div style={{ fontSize: '12px', color: 'var(--ink3)', marginTop: '4px' }}>No live version yet</div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                  <Button variant="ghost" onClick={() => { const v = !showVersions; setShowVersions(v); if (v) fetchVersions() }}>
                    {showVersions ? 'Hide versions' : 'Version history'}
                  </Button>
                  {canManage && (
                    <label style={{ padding: '9px 16px', borderRadius: '8px', border: 'none', background: 'var(--lime)', color: 'var(--lime-dark)', fontSize: '13px', fontWeight: 800, cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.6 : 1 }}>
                      {saving ? 'Uploading…' : liveDoc || draftDoc ? 'Upload replacement PDF ▲' : 'Upload PDF ▲'}
                      <input type="file" accept="application/pdf" disabled={saving} style={{ display: 'none' }}
                        onChange={e => { const f = e.target.files?.[0]; if (f) uploadMessagingDoc(f); e.target.value = '' }} />
                    </label>
                  )}
                </div>
              </div>
              <div style={{ fontSize: '11px', color: 'var(--ink4)', marginTop: '6px' }}>
                Uploading a PDF automatically pulls out the public name, dates, venue, and links (reviewed below before it applies), plus a structured write-up split into sections.
              </div>

              {showVersions && (
                <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--border-light)', display: 'grid', gap: '6px' }}>
                  {versions.length === 0 && <div style={{ fontSize: '12.5px', color: 'var(--ink3)' }}>No versions yet.</div>}
                  {versions.map(v => (
                    <div key={v.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderRadius: '8px', background: v.status === 'live' ? 'var(--teal-light)' : 'transparent' }}>
                      <div style={{ fontSize: '12.5px', color: 'var(--ink)' }}>
                        v{v.version} · {v.title} · {fmtDate(v.created_at)}
                        <span style={{ marginLeft: '8px', fontSize: '10.5px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', color: v.status === 'live' ? 'var(--teal-mid)' : v.status === 'draft' ? 'var(--amber)' : 'var(--ink3)' }}>{v.status}</span>
                      </div>
                      {v.status === 'superseded' && (
                        <Button variant="ghost" onClick={() => makeLive(v)}>Make live</Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {draftDoc && (
              <Card padded color="amber">
                <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--amber)', letterSpacing: '0.6px', textTransform: 'uppercase', marginBottom: '8px' }}>
                  Draft v{draftDoc.version} — review before it goes live
                </div>
                <DraftReview doc={draftDoc} canManage={canManage} session={session} onApproved={loadAll} />
              </Card>
            )}

            {!draftDoc && !liveDoc && (
              <Card padded>
                <div style={{ padding: '10px', fontSize: '13px', color: 'var(--ink3)', textAlign: 'center' }}>
                  Upload the event&apos;s topline messaging PDF to get started. It&apos;ll be split into sections here, ready for post-copy generation and conversational updates — and Common Details on the Overview tab will populate automatically.
                </div>
              </Card>
            )}

            {liveDoc && !draftDoc && (
              <LiveDocView doc={liveDoc} canManage={canManage} session={session} onUpdated={loadAll} />
            )}
          </>
        )}
      </div>
    </div>
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
    onApproved()
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

// The live doc's own ongoing view — full section rendering + chat, ported
// from the old standalone /messaging page. Chat here only ever targets
// sections (target_type 'section') — default_field changes on a live doc
// go through Overview's "Sync with Messaging Doc" instead, not ad-hoc chat.
function LiveDocView({ doc, canManage, session, onUpdated }: {
  doc: MessagingDoc
  canManage: boolean
  session: { sid: string } | null
  onUpdated: () => void
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, chatLoading])

  const sections = (doc.structured_json?.sections ?? []).slice().sort((a, b) => a.order - b.order)
  const selectedSection = sections.find(s => s.id === selectedSectionId) ?? null

  function selectSection(id: string) {
    setSelectedSectionId(prev => prev === id ? null : id)
    setMessages([])
    setInput('')
  }

  async function send() {
    const question = input.trim()
    if (!question || chatLoading || !selectedSectionId) return
    setInput('')
    setMessages(prev => [...prev, { role: 'user', text: question }])
    setChatLoading(true)
    try {
      const res = await fetch(`/api/events/stakeholders/messaging/${doc.id}/propose-edit`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: question, section_id: selectedSectionId, history: messages.slice(-8).map(m => ({ role: m.role, text: m.text })) }),
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
    onUpdated()
    setMessages(prev => prev.map((mm, i) => i !== msgIndex ? mm : {
      ...mm, proposals: mm.proposals?.map((p, pi) => pi === propIndex ? { ...p, status: 'approved' } : p),
    }))
  }

  function discardProposal(msgIndex: number, propIndex: number) {
    setMessages(prev => prev.map((mm, i) => i !== msgIndex ? mm : {
      ...mm, proposals: mm.proposals?.map((p, pi) => pi === propIndex ? { ...p, status: 'discarded' } : p),
    }))
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.6fr) minmax(280px, 1fr)', gap: '16px', alignItems: 'start' }}>
      <div style={{ display: 'grid', gap: '10px' }}>
        {sections.map(section => {
          const isSelected = section.id === selectedSectionId
          return (
            <div key={section.id}
              onClick={() => canManage && selectSection(section.id)}
              style={{
                background: 'var(--card)', borderRadius: '12px', padding: '16px',
                border: `1.5px solid ${isSelected ? 'var(--teal-mid)' : 'var(--border)'}`,
                boxShadow: isSelected ? '0 0 0 3px color-mix(in srgb, var(--teal-mid) 18%, transparent)' : 'none',
                cursor: canManage ? 'pointer' : 'default', transition: 'border-color 0.15s, box-shadow 0.15s',
              }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', gap: '8px', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--ink)' }}>{section.title}</span>
                  {section.kind === 'rules' && (
                    <span style={{ fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--red)', background: 'var(--red-light)', padding: '2px 8px', borderRadius: '20px' }}>Hard rule</span>
                  )}
                  {isSelected && (
                    <span style={{ fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--teal-mid)', background: 'var(--teal-light)', padding: '2px 8px', borderRadius: '20px' }}>Editing</span>
                  )}
                </div>
                <div style={{ fontSize: '10.5px', color: 'var(--ink3)' }}>
                  Updated {fmtDate(section.updated_at)}
                  {section.change_note && <span title={section.change_note}> · edited via chat</span>}
                </div>
              </div>
              <SectionBody section={section} />
              {canManage && !isSelected && (
                <div style={{ fontSize: '11px', color: 'var(--ink4)', marginTop: '8px' }}>Click to edit this section via chat →</div>
              )}
            </div>
          )
        })}
      </div>

      {canManage && (
        <div style={{ position: 'sticky', top: '24px', background: 'var(--card)', border: `1.5px solid ${selectedSection ? 'var(--teal-mid)' : 'var(--border)'}`, borderRadius: '12px', display: 'flex', flexDirection: 'column', maxHeight: '600px' }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border-light)' }}>
            <div style={{ fontSize: '16px', fontWeight: 800, color: selectedSection ? 'var(--teal-mid)' : 'var(--ink)' }}>
              {selectedSection ? `Editing: ${selectedSection.title}` : 'Select a section to edit'}
            </div>
            <div style={{ fontSize: '14px', color: 'var(--ink3)', marginTop: '4px', lineHeight: 1.5 }}>
              {selectedSection
                ? 'Describe what changed in this section — a new partner, a stat update, a corrected fact. Nothing changes until you approve it.'
                : 'Click any section on the left, then chat here to update just that section — never the whole document at once.'}
            </div>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '14px 18px' }}>
            {messages.length === 0 && selectedSection && (
              <div style={{ fontSize: '14px', color: 'var(--ink3)', lineHeight: 1.6 }}>
                Example: &ldquo;We&apos;ve signed CyberSecurity Malaysia as an association partner&rdquo;
              </div>
            )}
            {messages.map((m, mi) => (
              <div key={mi} style={{ marginBottom: '14px' }}>
                <div style={{
                  padding: '10px 14px', borderRadius: '10px', fontSize: '15px', lineHeight: 1.55,
                  background: m.role === 'user' ? 'var(--teal-light)' : 'var(--surface)',
                  border: m.role === 'user' ? 'none' : '1px solid var(--border-light)',
                }}>
                  {m.text}
                </div>
                {m.proposals?.map((p, pi) => (
                  <div key={pi} style={{
                    marginTop: '8px', border: `1px solid ${p.status === 'approved' ? 'var(--teal-mid)' : p.status === 'discarded' ? 'var(--border)' : p.conflict ? 'var(--amber)' : 'var(--lime)'}`,
                    borderRadius: '8px', padding: '10px 12px', opacity: p.status === 'discarded' ? 0.5 : 1,
                  }}>
                    <div style={{ fontSize: '13.5px', fontWeight: 800, color: 'var(--ink)' }}>{p.target_label}</div>
                    <div style={{ fontSize: '13.5px', color: 'var(--ink3)', margin: '5px 0', lineHeight: 1.5 }}>{p.rationale}</div>
                    {p.conflict && (
                      <div style={{ marginBottom: '8px', padding: '8px 12px', borderRadius: '6px', background: 'var(--amber-light)', border: '1px solid var(--amber-border)' }}>
                        <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--amber)' }}>⚠ Rule check: </span>
                        <span style={{ fontSize: '13px', color: 'var(--ink2)' }}>{p.conflict}</span>
                      </div>
                    )}
                    {p.status === 'pending' ? (
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <Button variant="lime" onClick={() => approveProposal(mi, pi)}>Approve</Button>
                        <Button variant="ghost" onClick={() => discardProposal(mi, pi)}>Discard</Button>
                      </div>
                    ) : (
                      <div style={{ fontSize: '13px', fontWeight: 700, color: p.status === 'approved' ? 'var(--teal-mid)' : 'var(--ink3)' }}>
                        {p.status === 'approved' ? 'Applied ✓' : 'Discarded'}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ))}
            {chatLoading && <div style={{ fontSize: '14px', color: 'var(--ink3)' }}>Thinking…</div>}
            <div ref={bottomRef} />
          </div>
          <div style={{ padding: '12px 14px', borderTop: '1px solid var(--border-light)', display: 'flex', gap: '8px' }}>
            <textarea
              className="tfield" rows={2} value={input}
              disabled={!selectedSection}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
              placeholder={selectedSection ? 'Describe what changed…' : 'Select a section above first'}
              style={{ flex: 1, resize: 'none', fontSize: '15px' }}
            />
            <Button variant="teal" onClick={send} disabled={chatLoading || !input.trim() || !selectedSection}>{chatLoading ? '…' : 'Send'}</Button>
          </div>
        </div>
      )}
    </div>
  )
}
