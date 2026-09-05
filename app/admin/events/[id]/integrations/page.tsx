'use client'

import { use, useEffect, useState } from 'react'
import PageHeader from '@/app/components/PageHeader'
import { Card, Button, Input, Select, Badge } from '@/app/components/ui'
import { useBreadcrumbLabel } from '@/app/lib/nav/breadcrumb-labels'

/* Per-event Integrations page (2026-09-05) — consolidates KonfHub config,
   previously buried in Website Builder's Content/Details tab with 3 of
   its ~10 fields SQL-only (no UI at all). HubSpot/Postiz/Client Approval
   Contact are follow-ups (scoped separately) — this first pass is
   KonfHub only. Gated by sae.integrations.manage (see access-permissions.ts's
   own comment — delegatable the same way Producer/Sensitive Documents are).

   KonfHub-specific design, per Madhu (2026-09-04/05 conversation):
   - Event ID / Client ID / Client Secret are the only manually-typed
     fields — everything else is FETCHED from KonfHub on explicit request,
     never auto-run, because only a human knows when KonfHub's own side is
     actually ready (per Madhu: "konfhub platform need to be setup and
     ready before he does that").
   - Speaker/Moderator tags: fetched via GET /event/:id/tags, then a human
     PICKS which fetched tag is which from a dropdown — never auto-matched
     by name. A live probe against WAIS Malaysia's real event confirmed
     why: it has both a lowercase 'speaker' tag AND a separate capitalized
     'Speaker' tag, plus unrelated session-type tags in the same list.
   - Registration field mapping: fetched via GET /event/:id/tickets, which
     (confirmed live) already embeds each ticket's full custom-form field
     list — no reverse-engineering from real attendee data needed, unlike
     how the original Speaker Registration mapping was built. A human
     picks which ticket IS "Speaker Registration," then maps EventPilot's
     own registration-bucket fields to KonfHub's form fields one by one —
     explicit human oversight, since "fields may change" per event and
     KonfHub form field ids aren't guessable from field names alone. */

type Settings = {
  konfhub_event_id: string | null
  konfhub_client_id: string | null
  konfhub_client_secret: string | null
  konfhub_speaker_category_id: string | null
  konfhub_speaker_tag_id: string | null
  konfhub_moderator_tag_id: string | null
  konfhub_speaker_ticket: string | null
  konfhub_partner_ticket: string | null
  konfhub_api_key: string | null
  konfhub_registration_field_map: Record<string, string>
}

type KonfhubTag = { id: string; name: string }
type KonfhubTicketForm = { form_id: number; form_name: string }
type KonfhubTicket = { ticket_id: number; ticket_name: string; forms: KonfhubTicketForm[] }
type KonfhubTicketCategory = { category_id: number; category_name: string; tickets: KonfhubTicket[] }
type RegistrationField = { key: string; label: string }

export default function IntegrationsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = use(params)
  const [eventName, setEventName] = useState('')
  const [loading, setLoading] = useState(true)
  const [canManage, setCanManage] = useState(false)
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)

  const [settings, setSettings] = useState<Settings | null>(null)
  const [manualFields, setManualFields] = useState({ konfhub_event_id: '', konfhub_client_id: '', konfhub_client_secret: '', konfhub_speaker_category_id: '', konfhub_api_key: '', konfhub_partner_ticket: '' })
  const [savingManual, setSavingManual] = useState(false)

  const [fetchedTags, setFetchedTags] = useState<KonfhubTag[] | null>(null)
  const [fetchingTags, setFetchingTags] = useState(false)
  const [selectedSpeakerTagId, setSelectedSpeakerTagId] = useState('')
  const [selectedModeratorTagId, setSelectedModeratorTagId] = useState('')
  const [savingTags, setSavingTags] = useState(false)

  const [fetchedCategories, setFetchedCategories] = useState<KonfhubTicketCategory[] | null>(null)
  const [fetchingTickets, setFetchingTickets] = useState(false)
  const [selectedTicketId, setSelectedTicketId] = useState('')
  const [savingTicket, setSavingTicket] = useState(false)

  const [registrationFields, setRegistrationFields] = useState<RegistrationField[]>([])
  const [fieldMapSelections, setFieldMapSelections] = useState<Record<string, string>>({})
  const [savingFieldMap, setSavingFieldMap] = useState(false)

  async function load() {
    setLoading(true)
    const [settingsRes, eventRes, permRes, fieldsRes] = await Promise.all([
      fetch(`/api/events/konfhub/settings?event_id=${eventId}`),
      fetch(`/api/events?id=${eventId}`),
      fetch(`/api/events/access/me?event_id=${eventId}`),
      fetch(`/api/events/konfhub/registration-fields?event_id=${eventId}`),
    ])
    const settingsData = await settingsRes.json().catch(() => null)
    if (settingsRes.ok && settingsData) {
      setSettings(settingsData)
      setManualFields({
        konfhub_event_id: settingsData.konfhub_event_id ?? '',
        konfhub_client_id: settingsData.konfhub_client_id ?? '',
        konfhub_client_secret: settingsData.konfhub_client_secret ?? '',
        konfhub_speaker_category_id: settingsData.konfhub_speaker_category_id ?? '',
        konfhub_api_key: settingsData.konfhub_api_key ?? '',
        konfhub_partner_ticket: settingsData.konfhub_partner_ticket ?? '',
      })
      setSelectedSpeakerTagId(settingsData.konfhub_speaker_tag_id ?? '')
      setSelectedModeratorTagId(settingsData.konfhub_moderator_tag_id ?? '')
      setSelectedTicketId(settingsData.konfhub_speaker_ticket ?? '')
      setFieldMapSelections(settingsData.konfhub_registration_field_map ?? {})
    }
    const eventData = await eventRes.json().catch(() => null)
    const ev = Array.isArray(eventData) ? eventData[0] : eventData
    setEventName(ev?.public_name || ev?.name || '')
    const permData = await permRes.json().catch(() => ({ permissions: [] }))
    const perms: string[] = permData.permissions ?? []
    setCanManage(perms.includes('*') || perms.some(p => p === 'sae.integrations.manage' || p === 'sae.*'))
    const fieldsData = await fieldsRes.json().catch(() => ({ fields: [] }))
    setRegistrationFields(fieldsData.fields ?? [])
    setLoading(false)
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-mount, matches this app's other top-level fetchAll effects
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refetch only when the event itself changes
  }, [eventId])

  useBreadcrumbLabel(eventId, eventName)

  async function saveManualFields() {
    setSavingManual(true)
    setMsg(null)
    const res = await fetch(`/api/events/konfhub/settings?event_id=${eventId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(manualFields),
    })
    const data = await res.json().catch(() => ({}))
    setSavingManual(false)
    if (!res.ok) { setMsg({ text: data.error ?? 'Could not save.', ok: false }); return }
    setSettings(prev => prev ? { ...prev, ...manualFields } : prev)
    setMsg({ text: 'Saved.', ok: true })
  }

  async function fetchTags() {
    setFetchingTags(true)
    setMsg(null)
    const res = await fetch(`/api/events/konfhub/fetch-tags?event_id=${eventId}`)
    const data = await res.json().catch(() => ({}))
    setFetchingTags(false)
    if (!res.ok) { setMsg({ text: data.error ?? 'Could not fetch tags.', ok: false }); return }
    setFetchedTags(data.tags ?? [])
  }

  async function saveTags() {
    setSavingTags(true)
    setMsg(null)
    const res = await fetch(`/api/events/konfhub/settings?event_id=${eventId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ konfhub_speaker_tag_id: selectedSpeakerTagId || null, konfhub_moderator_tag_id: selectedModeratorTagId || null }),
    })
    const data = await res.json().catch(() => ({}))
    setSavingTags(false)
    if (!res.ok) { setMsg({ text: data.error ?? 'Could not save tags.', ok: false }); return }
    setSettings(prev => prev ? { ...prev, konfhub_speaker_tag_id: data.konfhub_speaker_tag_id, konfhub_moderator_tag_id: data.konfhub_moderator_tag_id } : prev)
    setMsg({ text: 'Tags saved.', ok: true })
  }

  async function fetchTickets() {
    setFetchingTickets(true)
    setMsg(null)
    const res = await fetch(`/api/events/konfhub/fetch-tickets?event_id=${eventId}`)
    const data = await res.json().catch(() => ({}))
    setFetchingTickets(false)
    if (!res.ok) { setMsg({ text: data.error ?? 'Could not fetch registration types.', ok: false }); return }
    setFetchedCategories(data.categories ?? [])
  }

  async function saveTicket() {
    setSavingTicket(true)
    setMsg(null)
    const res = await fetch(`/api/events/konfhub/settings?event_id=${eventId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ konfhub_speaker_ticket: selectedTicketId || null }),
    })
    const data = await res.json().catch(() => ({}))
    setSavingTicket(false)
    if (!res.ok) { setMsg({ text: data.error ?? 'Could not save the ticket.', ok: false }); return }
    setSettings(prev => prev ? { ...prev, konfhub_speaker_ticket: data.konfhub_speaker_ticket } : prev)
    setMsg({ text: 'Registration ticket saved.', ok: true })
  }

  async function saveFieldMap() {
    setSavingFieldMap(true)
    setMsg(null)
    const map = Object.fromEntries(Object.entries(fieldMapSelections).filter(([, v]) => v))
    const res = await fetch(`/api/events/konfhub/settings?event_id=${eventId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ konfhub_registration_field_map: map }),
    })
    const data = await res.json().catch(() => ({}))
    setSavingFieldMap(false)
    if (!res.ok) { setMsg({ text: data.error ?? 'Could not save the field mapping.', ok: false }); return }
    setSettings(prev => prev ? { ...prev, konfhub_registration_field_map: data.konfhub_registration_field_map } : prev)
    setMsg({ text: 'Field mapping saved.', ok: true })
  }

  const selectedTicket: KonfhubTicket | null = fetchedCategories && selectedTicketId
    ? fetchedCategories.flatMap(c => c.tickets).find(t => String(t.ticket_id) === selectedTicketId) ?? null
    : null

  if (loading) return <div style={{ minHeight: '100vh', background: 'var(--surface)', padding: '32px', color: 'var(--ink3)' }}>Loading…</div>

  return (
    <div style={{ minHeight: '100vh', background: 'var(--surface)' }}>
      <PageHeader eyebrow="Event Workspace" title="Integrations" backHref={`/admin/events/${eventId}`} backLabel="Back to Event Overview" />

      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '20px 28px 60px' }}>
        {msg && (
          <div style={{
            padding: '10px 14px', borderRadius: '8px', marginBottom: '16px', fontSize: '14px',
            background: msg.ok ? 'var(--teal-light)' : 'var(--red-light)',
            border: `1px solid ${msg.ok ? 'var(--teal-border)' : 'var(--red-border)'}`,
            color: msg.ok ? 'var(--ink)' : 'var(--red)',
          }}>
            {msg.text} <button onClick={() => setMsg(null)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontWeight: 700, marginLeft: '8px' }}>×</button>
          </div>
        )}

        {!canManage && (
          <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'var(--amber-light)', border: '1px solid var(--amber-border)', color: 'var(--amber)', fontSize: '13.5px', marginBottom: '16px' }}>
            View only — you don&apos;t have permission to change these settings.
          </div>
        )}

        <Card padded>
          <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--ink)', marginBottom: '4px' }}>KonfHub — Credentials</div>
          <div style={{ fontSize: '12.5px', color: 'var(--ink3)', marginBottom: '16px' }}>The only manually-entered KonfHub fields — everything below this is fetched from KonfHub, never typed in.</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '14px', marginBottom: '16px' }}>
            <div>
              <label style={labelStyle}>KonfHub Event ID</label>
              <Input value={manualFields.konfhub_event_id} disabled={!canManage} onChange={e => setManualFields(p => ({ ...p, konfhub_event_id: e.target.value }))} />
            </div>
            <div>
              <label style={labelStyle}>Client ID</label>
              <Input value={manualFields.konfhub_client_id} disabled={!canManage} onChange={e => setManualFields(p => ({ ...p, konfhub_client_id: e.target.value }))} />
            </div>
            <div>
              <label style={labelStyle}>Client Secret</label>
              <Input type="password" value={manualFields.konfhub_client_secret} disabled={!canManage} onChange={e => setManualFields(p => ({ ...p, konfhub_client_secret: e.target.value }))} />
            </div>
            <div>
              <label style={labelStyle}>Speaker Category ID <span style={{ fontWeight: 400, color: 'var(--ink4)' }}>(shared/umbrella KonfHub events only)</span></label>
              <Input value={manualFields.konfhub_speaker_category_id} disabled={!canManage} onChange={e => setManualFields(p => ({ ...p, konfhub_speaker_category_id: e.target.value }))} />
            </div>
          </div>
          {canManage && <Button variant="teal" onClick={saveManualFields} disabled={savingManual}>{savingManual ? 'Saving…' : 'Save Credentials'}</Button>}
        </Card>

        <div style={{ marginTop: '16px' }}><Card padded>
          <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--ink)', marginBottom: '4px' }}>Speaker Listing Tags</div>
          <div style={{ fontSize: '12.5px', color: 'var(--ink3)', marginBottom: '14px' }}>
            Decides which of this speaker&apos;s tags (Speaker / Moderator) get sent to KonfHub&apos;s Speakers listing. Fetch only once KonfHub&apos;s tags are actually set up — this never runs automatically.
          </div>
          {!fetchedTags ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              {settings?.konfhub_speaker_tag_id || settings?.konfhub_moderator_tag_id ? (
                <div style={{ fontSize: '12.5px', color: 'var(--ink3)' }}>
                  Currently saved — Speaker: <code>{settings.konfhub_speaker_tag_id ?? '—'}</code>, Moderator: <code>{settings.konfhub_moderator_tag_id ?? '—'}</code>
                </div>
              ) : (
                <Badge color="grey">Not set</Badge>
              )}
              {canManage && <Button variant="ghost" onClick={fetchTags} disabled={fetchingTags}>{fetchingTags ? 'Fetching…' : 'Fetch Tags from KonfHub'}</Button>}
            </div>
          ) : (
            <div style={{ display: 'grid', gap: '12px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
                <div>
                  <label style={labelStyle}>Speaker Tag</label>
                  <Select value={selectedSpeakerTagId} disabled={!canManage} onChange={e => setSelectedSpeakerTagId(e.target.value)}>
                    <option value="">— Select —</option>
                    {fetchedTags.map(t => <option key={t.id} value={t.id}>{t.name} ({t.id.slice(0, 8)}…)</option>)}
                  </Select>
                </div>
                <div>
                  <label style={labelStyle}>Moderator Tag</label>
                  <Select value={selectedModeratorTagId} disabled={!canManage} onChange={e => setSelectedModeratorTagId(e.target.value)}>
                    <option value="">— Select —</option>
                    {fetchedTags.map(t => <option key={t.id} value={t.id}>{t.name} ({t.id.slice(0, 8)}…)</option>)}
                  </Select>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                {canManage && <Button variant="teal" onClick={saveTags} disabled={savingTags}>{savingTags ? 'Saving…' : 'Save Tags'}</Button>}
                {canManage && <Button variant="ghost" onClick={fetchTags} disabled={fetchingTags}>{fetchingTags ? 'Fetching…' : 'Re-fetch'}</Button>}
              </div>
            </div>
          )}
        </Card></div>

        <div style={{ marginTop: '16px' }}><Card padded>
          <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--ink)', marginBottom: '4px' }}>Speaker Registration — Field Mapping</div>
          <div style={{ fontSize: '12.5px', color: 'var(--ink3)', marginBottom: '14px' }}>
            Which KonfHub ticket is Speaker Registration, and how this event&apos;s own registration fields map onto that ticket&apos;s custom form fields. Every event&apos;s KonfHub form can differ — always review this per event, don&apos;t assume it carries over.
          </div>
          {!fetchedCategories ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              {settings?.konfhub_speaker_ticket ? (
                <div style={{ fontSize: '12.5px', color: 'var(--ink3)' }}>Currently saved ticket ID: <code>{settings.konfhub_speaker_ticket}</code></div>
              ) : (
                <Badge color="grey">Not set</Badge>
              )}
              {canManage && <Button variant="ghost" onClick={fetchTickets} disabled={fetchingTickets}>{fetchingTickets ? 'Fetching…' : 'Fetch Registration Types from KonfHub'}</Button>}
            </div>
          ) : (
            <div style={{ display: 'grid', gap: '16px' }}>
              <div>
                <label style={labelStyle}>Which ticket is Speaker Registration?</label>
                <Select value={selectedTicketId} disabled={!canManage} onChange={e => setSelectedTicketId(e.target.value)} style={{ maxWidth: '420px' }}>
                  <option value="">— Select —</option>
                  {fetchedCategories.map(cat => (
                    <optgroup key={cat.category_id} label={cat.category_name}>
                      {cat.tickets.map(t => <option key={t.ticket_id} value={t.ticket_id}>{t.ticket_name}</option>)}
                    </optgroup>
                  ))}
                </Select>
                <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                  {canManage && <Button variant="teal" onClick={saveTicket} disabled={savingTicket || !selectedTicketId}>{savingTicket ? 'Saving…' : 'Save Ticket'}</Button>}
                  {canManage && <Button variant="ghost" onClick={fetchTickets} disabled={fetchingTickets}>{fetchingTickets ? 'Fetching…' : 'Re-fetch'}</Button>}
                </div>
              </div>

              {selectedTicket && (
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', color: 'var(--ink3)', marginBottom: '10px' }}>
                    Field Mapping — {selectedTicket.ticket_name}
                  </div>
                  {registrationFields.length === 0 ? (
                    <div style={{ fontSize: '13px', color: 'var(--ink4)' }}>No registration-specific fields on this event&apos;s speaker form to map.</div>
                  ) : (
                    <div style={{ display: 'grid', gap: '8px' }}>
                      {registrationFields.map(f => (
                        <div key={f.key} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', alignItems: 'center' }}>
                          <div style={{ fontSize: '13px', color: 'var(--ink)', fontWeight: 600 }}>{f.label}</div>
                          <Select
                            value={fieldMapSelections[f.key] ?? ''}
                            disabled={!canManage}
                            onChange={e => setFieldMapSelections(prev => ({ ...prev, [f.key]: e.target.value }))}
                          >
                            <option value="">Not mapped</option>
                            {selectedTicket.forms.map(form => (
                              <option key={form.form_id} value={String(form.form_id)}>{form.form_name.slice(0, 70)}</option>
                            ))}
                          </Select>
                        </div>
                      ))}
                    </div>
                  )}
                  {registrationFields.length > 0 && canManage && (
                    <div style={{ marginTop: '12px' }}>
                      <Button variant="teal" onClick={saveFieldMap} disabled={savingFieldMap}>
                        {savingFieldMap ? 'Saving…' : 'Save Field Mapping'}
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </Card></div>

        <div style={{ marginTop: '16px' }}><Card padded>
          <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--ink)', marginBottom: '4px' }}>Legacy / Other</div>
          <div style={{ fontSize: '12.5px', color: 'var(--ink3)', marginBottom: '14px' }}>Older ticket-based fields, kept for events still configured against them.</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '14px', marginBottom: '16px' }}>
            <div>
              <label style={labelStyle}>KonfHub API Key <span style={{ fontWeight: 400, color: 'var(--ink4)' }}>(legacy ticketing)</span></label>
              <Input type="password" value={manualFields.konfhub_api_key} disabled={!canManage} onChange={e => setManualFields(p => ({ ...p, konfhub_api_key: e.target.value }))} />
            </div>
            <div>
              <label style={labelStyle}>Partner Ticket ID</label>
              <Input value={manualFields.konfhub_partner_ticket} disabled={!canManage} onChange={e => setManualFields(p => ({ ...p, konfhub_partner_ticket: e.target.value }))} />
            </div>
          </div>
          {canManage && <Button variant="ghost" onClick={saveManualFields} disabled={savingManual}>{savingManual ? 'Saving…' : 'Save'}</Button>}
        </Card></div>
      </div>
    </div>
  )
}

const labelStyle: React.CSSProperties = { fontSize: '12px', fontWeight: 700, color: 'var(--ink3)', display: 'block', marginBottom: '6px' }
