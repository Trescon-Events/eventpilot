'use client'

import { useEffect, useState } from 'react'
import PageHeader from '@/app/components/PageHeader'
import { Button, Card, Input, Badge } from '@/app/components/ui'

/* Super Admin: Platform-Wide Read-Only AI Access API (2026-09-29, per
   Madhu) — create/manage ep_ai_ tokens for /api/public/v1/knowledge/*.
   See app/lib/platform-api/{auth,queries,handler}.ts for the API itself;
   this page is purely the admin management UI for it.

   Deliberately admin-only (app/lib/platform-api/admin-access.ts) — this
   mints read access to a real slice of EventPilot's data for an external
   AI tool, so unlike most admin_only areas there's no delegated
   permission path. */

type Domain = 'event_overview' | 'speakers_partners' | 'agenda' | 'documents_reports' | 'news_and_intel'

const DOMAIN_INFO: { key: Domain; label: string; description: string }[] = [
  { key: 'event_overview', label: 'Event Overview', description: 'Name, dates, venue, description, status, type for each accessible event. No financial fields.' },
  { key: 'speakers_partners', label: 'Speakers & Partners', description: 'Public, approved speaker and partner profiles — name, role, company, bio, photo. No contact details.' },
  { key: 'agenda', label: 'Agenda', description: 'Public session schedule — day, time, title, description, track.' },
  { key: 'documents_reports', label: 'Documents & Reports', description: 'Post-event reports and other documents explicitly marked public. Never HR policy or BD proposal documents — those default to internal and are never included.' },
  { key: 'news_and_intel', label: 'News & Press Coverage', description: 'Published external coverage of Trescon and its events, from the Knowledge Base Intel pipeline.' },
]

type EventOption = { id: string; name: string }

type TokenRow = {
  id: string
  label: string
  domains: Domain[]
  event_scope: 'all' | 'specific'
  event_ids: string[] | null
  created_at: string
  last_used_at: string | null
  revoked_at: string | null
  created_by: string | null
  staff_members?: { name: string } | null
}

type LogEntry = {
  id: string
  requested_at: string
  domain: string
  event_id: string | null
  query_summary: string | null
  result_count: number | null
  status_code: number
  events?: { name: string } | null
}

export default function AiAccessPage() {
  const [tokens, setTokens] = useState<TokenRow[]>([])
  const [events, setEvents] = useState<EventOption[]>([])
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState<string | null>(null)
  const [msgIsError, setMsgIsError] = useState(false)

  const [showCreate, setShowCreate] = useState(false)
  const [label, setLabel] = useState('')
  const [selectedDomains, setSelectedDomains] = useState<Set<Domain>>(new Set())
  const [eventScope, setEventScope] = useState<'all' | 'specific'>('all')
  const [selectedEventIds, setSelectedEventIds] = useState<Set<string>>(new Set())
  const [creating, setCreating] = useState(false)
  const [newToken, setNewToken] = useState<string | null>(null)

  const [logForTokenId, setLogForTokenId] = useState<string | null>(null)
  const [logEntries, setLogEntries] = useState<LogEntry[]>([])
  const [logLoading, setLogLoading] = useState(false)

  async function load() {
    setLoading(true)
    const [tokensRes, eventsRes] = await Promise.all([
      fetch('/api/admin/platform-api-tokens'),
      fetch('/api/events'),
    ])
    setTokens(await tokensRes.json().catch(() => []))
    const evData = await eventsRes.json().catch(() => [])
    setEvents((Array.isArray(evData) ? evData : []).map((e: { id: string; name: string }) => ({ id: e.id, name: e.name })))
    setLoading(false)
  }
  // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-mount
  useEffect(() => { load() }, [])

  function toggleDomain(d: Domain) {
    setSelectedDomains(prev => {
      const next = new Set(prev)
      if (next.has(d)) next.delete(d); else next.add(d)
      return next
    })
  }
  function toggleEvent(id: string) {
    setSelectedEventIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  async function createToken() {
    if (!label.trim()) { setMsg('Give this token a label first.'); setMsgIsError(true); return }
    if (selectedDomains.size === 0) { setMsg('Pick at least one data domain.'); setMsgIsError(true); return }
    if (eventScope === 'specific' && selectedEventIds.size === 0) { setMsg('Pick at least one event, or choose "All events".'); setMsgIsError(true); return }

    setCreating(true)
    setMsg(null)
    const res = await fetch('/api/admin/platform-api-tokens', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        label: label.trim(),
        domains: [...selectedDomains],
        event_scope: eventScope,
        event_ids: eventScope === 'specific' ? [...selectedEventIds] : undefined,
      }),
    })
    const data = await res.json().catch(() => ({}))
    setCreating(false)
    if (!res.ok) { setMsg(data.error ?? 'Could not create token.'); setMsgIsError(true); return }
    setNewToken(data.token)
    setLabel(''); setSelectedDomains(new Set()); setEventScope('all'); setSelectedEventIds(new Set())
    await load()
  }

  async function revokeToken(id: string) {
    if (!confirm('Revoke this token? Anything using it will stop working immediately — this can\'t be undone.')) return
    const res = await fetch(`/api/admin/platform-api-tokens/${id}/revoke`, { method: 'POST' })
    if (!res.ok) { setMsg('Could not revoke token.'); setMsgIsError(true); return }
    await load()
  }

  async function viewLog(id: string) {
    setLogForTokenId(id)
    setLogLoading(true)
    const res = await fetch(`/api/admin/platform-api-tokens/${id}/log`)
    const data = await res.json().catch(() => ({ entries: [] }))
    setLogEntries(data.entries ?? [])
    setLogLoading(false)
  }

  function eventName(id: string | null) {
    if (!id) return '—'
    return events.find(e => e.id === id)?.name ?? id
  }

  return (
    <div>
      <PageHeader
        eyebrow="Super Admin"
        title="AI Access"
        description="Scoped, read-only API tokens for external AI tools — event data, public documents, speakers/partners, press coverage. Never staff or financial data, and never anything about how EventPilot itself is built."
        actions={<Button variant="lime" onClick={() => setShowCreate(v => !v)}>{showCreate ? 'Cancel' : '+ New Token'}</Button>}
      />

      <div style={{ padding: '24px', maxWidth: '960px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '18px' }}>
        {msg && <div style={{ fontSize: '13px', color: msgIsError ? 'var(--red)' : 'var(--teal)' }}>{msg}</div>}

        {newToken && (
          <Card padded color="amber">
            <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--ink)', marginBottom: '8px' }}>Token created — copy it now</div>
            <div style={{ fontSize: '12.5px', color: 'var(--ink3)', marginBottom: '10px' }}>
              This is shown once and never stored in plaintext — if it&apos;s lost, revoke it here and create a new one.
            </div>
            <div style={{ fontFamily: 'monospace', fontSize: '13px', background: 'var(--surface)', border: '1px solid var(--border-light)', borderRadius: '8px', padding: '10px 12px', wordBreak: 'break-all', marginBottom: '10px' }}>
              {newToken}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--ink3)', marginBottom: '10px' }}>
              <strong>How to use it</strong> — send it as a bearer token, e.g.:
              <pre style={{ fontFamily: 'monospace', fontSize: '11.5px', background: 'var(--surface)', border: '1px solid var(--border-light)', borderRadius: '8px', padding: '10px 12px', marginTop: '6px', overflowX: 'auto' }}>
{`curl -H "Authorization: Bearer ${newToken}" \\
  https://eventpilot.tresconglobal.com/api/public/v1/knowledge/events`}
              </pre>
              Available paths (only the domains enabled on this token will work): <code>/events</code>, <code>/events/{'{id}'}</code>, <code>/events/{'{id}'}/speakers</code>, <code>/events/{'{id}'}/partners</code>, <code>/events/{'{id}'}/agenda</code>, <code>/events/{'{id}'}/documents</code>, <code>/documents?q=</code>, <code>/intel?q=&amp;event=</code>.
            </div>
            <Button variant="ghost" onClick={() => setNewToken(null)}>Done</Button>
          </Card>
        )}

        {showCreate && (
          <Card padded>
            <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--ink)', marginBottom: '14px' }}>New Token</div>
            <div style={{ marginBottom: '14px' }}>
              <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink3)', display: 'block', marginBottom: '4px' }}>Label</label>
              <Input value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. Marketing GPT — World AI Show" />
            </div>

            <div style={{ marginBottom: '14px' }}>
              <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink3)', display: 'block', marginBottom: '8px' }}>Data domains</label>
              <div style={{ display: 'grid', gap: '8px' }}>
                {DOMAIN_INFO.map(d => (
                  <label key={d.key} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border-light)', cursor: 'pointer' }}>
                    <input type="checkbox" checked={selectedDomains.has(d.key)} onChange={() => toggleDomain(d.key)} style={{ marginTop: '3px' }} />
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink)' }}>{d.label}</div>
                      <div style={{ fontSize: '11.5px', color: 'var(--ink3)' }}>{d.description}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: '14px' }}>
              <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink3)', display: 'block', marginBottom: '8px' }}>Events</label>
              <div style={{ display: 'flex', gap: '16px', marginBottom: '10px' }}>
                <label style={{ display: 'flex', gap: '6px', alignItems: 'center', fontSize: '13px', cursor: 'pointer' }}>
                  <input type="radio" checked={eventScope === 'all'} onChange={() => setEventScope('all')} /> All events (current and future)
                </label>
                <label style={{ display: 'flex', gap: '6px', alignItems: 'center', fontSize: '13px', cursor: 'pointer' }}>
                  <input type="radio" checked={eventScope === 'specific'} onChange={() => setEventScope('specific')} /> Specific events
                </label>
              </div>
              {eventScope === 'specific' && (
                <div style={{ maxHeight: '220px', overflowY: 'auto', border: '1px solid var(--border-light)', borderRadius: '8px', padding: '8px' }}>
                  {events.map(e => (
                    <label key={e.id} style={{ display: 'flex', gap: '8px', alignItems: 'center', padding: '5px 6px', fontSize: '13px', cursor: 'pointer' }}>
                      <input type="checkbox" checked={selectedEventIds.has(e.id)} onChange={() => toggleEvent(e.id)} />
                      {e.name}
                    </label>
                  ))}
                </div>
              )}
            </div>

            <Button variant="lime" onClick={createToken} disabled={creating}>{creating ? 'Creating…' : 'Generate Token'}</Button>
          </Card>
        )}

        {loading ? (
          <div style={{ color: 'var(--ink3)', fontSize: '13px' }}>Loading…</div>
        ) : tokens.length === 0 ? (
          <div style={{ color: 'var(--ink3)', fontSize: '13px' }}>No tokens yet.</div>
        ) : (
          <div style={{ display: 'grid', gap: '10px' }}>
            {tokens.map(t => (
              <Card key={t.id} padded>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {t.label}
                      {t.revoked_at && <Badge color="grey">Revoked</Badge>}
                    </div>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '6px' }}>
                      {t.domains.map(d => <Badge key={d} color="teal">{DOMAIN_INFO.find(di => di.key === d)?.label ?? d}</Badge>)}
                    </div>
                    <div style={{ fontSize: '11.5px', color: 'var(--ink3)', marginTop: '6px' }}>
                      {t.event_scope === 'all' ? 'All events' : `${t.event_ids?.length ?? 0} specific event(s)`}
                      {' · '}Created {new Date(t.created_at).toLocaleDateString()}
                      {' · '}Last used {t.last_used_at ? new Date(t.last_used_at).toLocaleString() : 'never'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <Button variant="ghost" onClick={() => viewLog(t.id)}>View Log</Button>
                    {!t.revoked_at && <Button variant="ghost" onClick={() => revokeToken(t.id)}>Revoke</Button>}
                  </div>
                </div>

                {logForTokenId === t.id && (
                  <div style={{ marginTop: '14px', paddingTop: '14px', borderTop: '1px solid var(--border-light)' }}>
                    {logLoading ? (
                      <div style={{ fontSize: '12px', color: 'var(--ink3)' }}>Loading…</div>
                    ) : logEntries.length === 0 ? (
                      <div style={{ fontSize: '12px', color: 'var(--ink3)' }}>No requests logged yet.</div>
                    ) : (
                      <div style={{ display: 'grid', gap: '4px', maxHeight: '260px', overflowY: 'auto' }}>
                        {logEntries.map(l => (
                          <div key={l.id} style={{ fontSize: '11.5px', color: 'var(--ink3)', display: 'flex', gap: '8px' }}>
                            <span style={{ color: l.status_code >= 400 ? 'var(--red)' : 'var(--ink4)', width: '36px', flexShrink: 0 }}>{l.status_code}</span>
                            <span style={{ width: '120px', flexShrink: 0 }}>{new Date(l.requested_at).toLocaleString()}</span>
                            <span style={{ width: '140px', flexShrink: 0, color: 'var(--ink2)' }}>{l.domain}</span>
                            <span style={{ width: '160px', flexShrink: 0 }}>{l.events?.name ?? eventName(l.event_id)}</span>
                            <span>{l.query_summary ?? ''}{l.result_count !== null ? ` (${l.result_count} result${l.result_count === 1 ? '' : 's'})` : ''}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
