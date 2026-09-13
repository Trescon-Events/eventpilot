'use client'

import { use, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import PageHeader from '@/app/components/PageHeader'
import { Card, Button, Input, Select, Badge } from '@/app/components/ui'
import { useBreadcrumbLabel } from '@/app/lib/nav/breadcrumb-labels'
import { FORM_TYPES, FORM_TITLES, type FormType } from '@/app/lib/forms/types'

// Left-panel section nav (2026-09-07, per Madhu) — this page used to be one
// long scroll of cards with no way to jump between them. Sections are
// scroll-spied (IntersectionObserver) rather than routed, since KonfHub/
// HubSpot/Postiz/Client Approval all genuinely live on this one page/one
// fetch — only HubSpot's own "Manage" link leaves the page.
//
// Site Registry added 2026-09-13 (Site Operations module, Phase 1).
// Health Checks added 2026-09-13 (Phase 3). Remaining sections from that
// spec (Google Analytics, Search Console, SEO & Discovery, Off-site
// Presence) land in their own later phases per the spec's build order —
// not added here yet so the nav never points at an unbuilt section. See
// docs/EventPilot-SiteOps-Build-Spec-v1.1.md.
const NAV_SECTIONS = [
  { id: 'konfhub', label: 'KonfHub' },
  { id: 'hubspot', label: 'HubSpot Forms' },
  { id: 'postiz', label: 'Postiz' },
  { id: 'client-approval', label: 'Client Approval Contacts' },
  { id: 'site-registry', label: 'Site Registry' },
  { id: 'health-checks', label: 'Health Checks' },
] as const

function IntegrationsSideNav({ active }: { active: string }) {
  return (
    <nav style={{ width: '188px', flexShrink: 0, position: 'sticky', top: '20px' }}>
      <div style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--ink4)', marginBottom: '10px', paddingLeft: '12px' }}>
        Sections
      </div>
      <div style={{ display: 'grid', gap: '2px' }}>
        {NAV_SECTIONS.map(s => {
          const isActive = active === s.id
          return (
            <a
              key={s.id}
              href={`#${s.id}`}
              onClick={e => {
                e.preventDefault()
                document.getElementById(s.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                history.replaceState(null, '', `#${s.id}`)
              }}
              style={{
                display: 'block', padding: '9px 12px', borderRadius: '8px', fontSize: '13px', fontWeight: 700,
                textDecoration: 'none', color: isActive ? 'var(--teal-mid)' : 'var(--ink3)',
                background: isActive ? 'var(--teal-light)' : 'transparent',
                borderLeft: `2.5px solid ${isActive ? 'var(--teal-mid)' : 'transparent'}`,
              }}
            >
              {s.label}
            </a>
          )
        })}
      </div>
    </nav>
  )
}

/* Per-event Integrations page (2026-09-05/06) — consolidates KonfHub,
   HubSpot Forms, and Postiz config, previously scattered across Website
   Builder's Content tab (KonfHub, 3 of its ~10 fields SQL-only, no UI at
   all) and the event hub's inline Edit panel (Postiz Customer ID + channel
   defaults). Client Approval Contact is a still-pending follow-up. Gated
   by sae.integrations.manage (see access-permissions.ts's own comment —
   delegatable the same way Producer/Sensitive Documents are).

   Postiz design, per Madhu (2026-09-06 conversation):
   - The Postiz "Customer" (called a "group" in their own API — kept as
     "group" here too, matching their terminology) is fetch-and-select
     ONLY, same principle as KonfHub's tags/tickets — never a free-typed
     id. Confirmed live: the real endpoint is bare GET /groups, not
     /integrations/groups as the docs site's own URL slug implies.
   - Selecting a group immediately fetches that group's channels, all
     pre-checked by default — the producer narrows down from there, never
     starts from nothing.
   - Whatever's checked here is meant to be the ONLY thing the SAE
     announcement composer can select from — before this, postiz_default_
     channel_ids was purely cosmetic (pre-checked boxes, never actually
     restricting what's selectable in either the event-hub settings form
     or the composer, and never enforced server-side at publish time) —
     confirmed by reading AnnouncementDetailPanel.tsx's selectablePostizChannels
     and postiz-publish.ts directly. This page's job is the settings side;
     the composer-side filter is a separate, small follow-up edit to that
     same derivation.

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

type PostizGroup = { id: string; name: string }
type PostizChannel = { id: string; name: string; identifier: string; disabled: boolean }
type ClientApprovalContact = { id: string; name: string; email: string; is_primary: boolean }

type EventSite = {
  id: string
  live_url: string | null
  repo_url: string | null
  preview_url: string | null
  hosting_provider: string | null
  commissioning_state: 'registered' | 'in_progress' | 'commissioned' | 'archived'
  registrable_domain: string | null
  launch_scenario: 'new_domain_new_series' | 'new_domain_existing_series' | 'existing_domain_new_edition' | null
}

type HealthCheck = { check_key: string; status: 'pass' | 'warn' | 'fail'; detail: string; checked_at: string }

const HEALTH_CHECK_LABELS: Record<string, string> = {
  site_reachable: 'Site reachable',
  ga4_receiving: 'GA4 receiving',
  search_console_verified: 'Search Console verified',
  schema_valid: 'Structured data valid',
  private_routes_excluded: 'Private routes excluded (partial)',
}

type SiteConnection = { provider: string; account_ref: string | null; property_ref: string | null; stream_ref: string | null; status: string; last_verified_at: string | null; last_error: string | null }
type ClassifyResult = {
  registrableDomain: string
  scenario: 'new_domain_new_series' | 'not_new_domain'
  evidence: { siblingEvents: { eventId: string; eventName: string; liveUrl: string | null }[]; matchingGscSites: string[]; googleConnected: boolean }
}
type Ga4Account = { id: string; name: string; properties: { id: string; name: string }[] }
type GscSite = { url: string; permissionLevel: string; verified: boolean }

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

  // HubSpot Forms — status/launcher only, the real connect + field-mapping
  // UI stays at its existing dedicated page per form type (see this file's
  // top comment for why: that page is a whole feature on its own, not
  // worth re-building here). 'unknown' covers a 403 (gated on
  // sae.forms.manage, a different permission than this page's own
  // sae.integrations.manage) so one missing grant doesn't break the card.
  const [hubspotStatus, setHubspotStatus] = useState<Record<FormType, { connected: boolean; formName?: string } | 'unknown' | null>>(
    Object.fromEntries(FORM_TYPES.map(t => [t, null])) as Record<FormType, null>
  )

  // Postiz
  const [postizGroupId, setPostizGroupId] = useState<string | null>(null)
  const [postizDefaultChannelIds, setPostizDefaultChannelIds] = useState<string[]>([])
  const [fetchedGroups, setFetchedGroups] = useState<PostizGroup[] | null>(null)
  const [fetchingGroups, setFetchingGroups] = useState(false)
  const [selectedGroupId, setSelectedGroupId] = useState('')
  const [fetchedChannels, setFetchedChannels] = useState<PostizChannel[] | null>(null)
  const [fetchingChannels, setFetchingChannels] = useState(false)
  const [selectedChannelIds, setSelectedChannelIds] = useState<Set<string>>(new Set())
  const [savingPostiz, setSavingPostiz] = useState(false)

  // Client Approval Contacts
  const [contacts, setContacts] = useState<ClientApprovalContact[]>([])
  const [newContactName, setNewContactName] = useState('')
  const [newContactEmail, setNewContactEmail] = useState('')
  const [addingContact, setAddingContact] = useState(false)
  const [contactBusyId, setContactBusyId] = useState<string | null>(null)

  // Site Registry
  const [site, setSite] = useState<EventSite | null>(null)
  const [siteFields, setSiteFields] = useState({ live_url: '', repo_url: '', preview_url: '', hosting_provider: '' })
  const [savingSite, setSavingSite] = useState(false)

  // Health Checks
  const [healthChecks, setHealthChecks] = useState<HealthCheck[]>([])
  const [runningHealthCheck, setRunningHealthCheck] = useState(false)

  // Commissioning Orchestrator (Phase 4) — Scenario A only for now
  const [siteConnections, setSiteConnections] = useState<SiteConnection[]>([])
  const [classifyResult, setClassifyResult] = useState<ClassifyResult | null>(null)
  const [classifying, setClassifying] = useState(false)
  const [scenarioOverride, setScenarioOverride] = useState<ClassifyResult['scenario'] | ''>('')

  const [ga4Accounts, setGa4Accounts] = useState<Ga4Account[] | null>(null)
  const [fetchingGa4Accounts, setFetchingGa4Accounts] = useState(false)
  const [selectedGa4AccountId, setSelectedGa4AccountId] = useState('')
  const [selectedGa4PropertyId, setSelectedGa4PropertyId] = useState('')
  const [newGa4Name, setNewGa4Name] = useState('')
  const [creatingGa4Property, setCreatingGa4Property] = useState(false)
  const [savingGa4Connection, setSavingGa4Connection] = useState(false)

  const [gscSites, setGscSites] = useState<GscSite[] | null>(null)
  const [fetchingGscSites, setFetchingGscSites] = useState(false)
  const [selectedGscSite, setSelectedGscSite] = useState('')
  const [savingGscConnection, setSavingGscConnection] = useState(false)

  const [verifying, setVerifying] = useState(false)

  const [activeSection, setActiveSection] = useState<string>(NAV_SECTIONS[0].id)
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({})

  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        const visible = entries.filter(e => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (visible[0]) setActiveSection(visible[0].target.id)
      },
      { rootMargin: '-20% 0px -70% 0px' }
    )
    NAV_SECTIONS.forEach(s => {
      const el = sectionRefs.current[s.id]
      if (el) observer.observe(el)
    })
    return () => observer.disconnect()
  }, [loading])

  async function load() {
    setLoading(true)
    const [settingsRes, eventRes, permRes, fieldsRes, postizRes, contactsRes, siteRes, healthRes, connRes] = await Promise.all([
      fetch(`/api/events/konfhub/settings?event_id=${eventId}`),
      fetch(`/api/events?id=${eventId}`),
      fetch(`/api/events/access/me?event_id=${eventId}`),
      fetch(`/api/events/konfhub/registration-fields?event_id=${eventId}`),
      fetch(`/api/events/postiz/settings?event_id=${eventId}`),
      fetch(`/api/events/client-approval-contacts?event_id=${eventId}`),
      fetch(`/api/events/site-registry?event_id=${eventId}`),
      fetch(`/api/events/site-registry/health-check?event_id=${eventId}`),
      fetch(`/api/events/site-registry/connections?event_id=${eventId}`),
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

    const hubspotResults = await Promise.all(
      FORM_TYPES.map(async formType => {
        try {
          const res = await fetch(`/api/events/stakeholders/hubspot/connection?event_id=${eventId}&form_type=${formType}`)
          if (res.status === 403) return [formType, 'unknown'] as const
          const data = await res.json().catch(() => ({ connected: false }))
          return [formType, data?.id ? { connected: true, formName: data.hubspot_form_name } : { connected: false }] as const
        } catch {
          return [formType, 'unknown'] as const
        }
      })
    )
    setHubspotStatus(Object.fromEntries(hubspotResults) as Record<FormType, { connected: boolean; formName?: string } | 'unknown'>)

    const postizData = await postizRes.json().catch(() => null)
    if (postizRes.ok && postizData) {
      setPostizGroupId(postizData.postiz_profile_key ?? null)
      setPostizDefaultChannelIds(postizData.postiz_default_channel_ids ?? [])
      setSelectedGroupId(postizData.postiz_profile_key ?? '')
      setSelectedChannelIds(new Set(postizData.postiz_default_channel_ids ?? []))
    }

    const contactsData = await contactsRes.json().catch(() => ({ contacts: [] }))
    setContacts(contactsData.contacts ?? [])

    const siteData = await siteRes.json().catch(() => ({ site: null }))
    setSite(siteData.site ?? null)
    setSiteFields({
      live_url: siteData.site?.live_url ?? '',
      repo_url: siteData.site?.repo_url ?? '',
      preview_url: siteData.site?.preview_url ?? '',
      hosting_provider: siteData.site?.hosting_provider ?? '',
    })

    const healthData = await healthRes.json().catch(() => ({ checks: [] }))
    setHealthChecks(healthData.checks ?? [])

    const connData = await connRes.json().catch(() => ({ connections: [] }))
    setSiteConnections(connData.connections ?? [])

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

  async function fetchGroups() {
    setFetchingGroups(true)
    setMsg(null)
    const res = await fetch(`/api/events/postiz/fetch-groups?event_id=${eventId}`)
    const data = await res.json().catch(() => ({}))
    setFetchingGroups(false)
    if (!res.ok) { setMsg({ text: data.error ?? 'Could not fetch groups from Postiz.', ok: false }); return }
    setFetchedGroups(data.groups ?? [])
  }

  // Selecting a group immediately fetches its channels, all pre-checked —
  // per Madhu: never start the producer from an empty selection, they
  // narrow down from "everything" rather than build up from nothing.
  async function onSelectGroup(groupId: string) {
    setSelectedGroupId(groupId)
    setFetchedChannels(null)
    if (!groupId) return
    setFetchingChannels(true)
    setMsg(null)
    const res = await fetch(`/api/events/postiz/fetch-channels?event_id=${eventId}&group_id=${groupId}`)
    const data = await res.json().catch(() => ({}))
    setFetchingChannels(false)
    if (!res.ok) { setMsg({ text: data.error ?? 'Could not fetch channels for this group.', ok: false }); return }
    const channels: PostizChannel[] = data.channels ?? []
    setFetchedChannels(channels)
    setSelectedChannelIds(new Set(channels.map(c => c.id)))
  }

  function toggleChannel(id: string) {
    setSelectedChannelIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  async function savePostiz() {
    setSavingPostiz(true)
    setMsg(null)
    const res = await fetch(`/api/events/postiz/settings?event_id=${eventId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ postiz_profile_key: selectedGroupId || null, postiz_default_channel_ids: Array.from(selectedChannelIds) }),
    })
    const data = await res.json().catch(() => ({}))
    setSavingPostiz(false)
    if (!res.ok) { setMsg({ text: data.error ?? 'Could not save Postiz settings.', ok: false }); return }
    setPostizGroupId(data.postiz_profile_key)
    setPostizDefaultChannelIds(data.postiz_default_channel_ids ?? [])
    setMsg({ text: 'Postiz settings saved.', ok: true })
  }

  async function addContact() {
    if (!newContactName.trim() || !newContactEmail.trim()) return
    setAddingContact(true)
    setMsg(null)
    const res = await fetch(`/api/events/client-approval-contacts?event_id=${eventId}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newContactName.trim(), email: newContactEmail.trim(), is_primary: contacts.length === 0 }),
    })
    const data = await res.json().catch(() => ({}))
    setAddingContact(false)
    if (!res.ok) { setMsg({ text: data.error ?? 'Could not add contact.', ok: false }); return }
    setContacts(prev => [...prev, data])
    setNewContactName(''); setNewContactEmail('')
  }

  async function makePrimary(contactId: string) {
    setContactBusyId(contactId)
    setMsg(null)
    const res = await fetch(`/api/events/client-approval-contacts/${contactId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_primary: true }),
    })
    setContactBusyId(null)
    if (!res.ok) { const d = await res.json().catch(() => ({})); setMsg({ text: d.error ?? 'Could not update contact.', ok: false }); return }
    setContacts(prev => prev.map(c => ({ ...c, is_primary: c.id === contactId })))
  }

  async function removeContact(contactId: string) {
    setContactBusyId(contactId)
    setMsg(null)
    const res = await fetch(`/api/events/client-approval-contacts/${contactId}`, { method: 'DELETE' })
    setContactBusyId(null)
    if (!res.ok) { const d = await res.json().catch(() => ({})); setMsg({ text: d.error ?? 'Could not remove contact.', ok: false }); return }
    setContacts(prev => prev.filter(c => c.id !== contactId))
  }

  async function saveSite() {
    setSavingSite(true)
    setMsg(null)
    const res = await fetch(`/api/events/site-registry?event_id=${eventId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(siteFields),
    })
    const data = await res.json().catch(() => ({}))
    setSavingSite(false)
    if (!res.ok) { setMsg({ text: data.error ?? 'Could not save site registry.', ok: false }); return }
    setSite(data.site)
    setMsg({ text: 'Site registered.', ok: true })
  }

  async function runHealthCheck() {
    setRunningHealthCheck(true)
    setMsg(null)
    const res = await fetch(`/api/events/site-registry/health-check?event_id=${eventId}`, { method: 'POST' })
    const data = await res.json().catch(() => ({}))
    setRunningHealthCheck(false)
    if (!res.ok) { setMsg({ text: data.error ?? 'Could not run health checks.', ok: false }); return }
    setHealthChecks((data.results ?? []).map((r: { checkKey: string; status: string; detail: string }) => ({
      check_key: r.checkKey, status: r.status, detail: r.detail, checked_at: new Date().toISOString(),
    })))
    setMsg({ text: 'Health checks run.', ok: true })
  }

  async function loadConnections() {
    const res = await fetch(`/api/events/site-registry/connections?event_id=${eventId}`)
    const data = await res.json().catch(() => ({ connections: [] }))
    setSiteConnections(data.connections ?? [])
  }

  async function classifyDomain() {
    setClassifying(true)
    setMsg(null)
    const res = await fetch(`/api/events/site-registry/classify?event_id=${eventId}`, { method: 'POST' })
    const data = await res.json().catch(() => ({}))
    setClassifying(false)
    if (!res.ok) { setMsg({ text: data.error ?? 'Could not classify domain.', ok: false }); return }
    setClassifyResult(data)
  }

  async function confirmClassification(scenario: ClassifyResult['scenario']) {
    if (!classifyResult) return
    const res = await fetch(`/api/events/site-registry?event_id=${eventId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        registrable_domain: classifyResult.registrableDomain,
        launch_scenario: scenario === 'new_domain_new_series' ? 'new_domain_new_series' : 'existing_domain_new_edition',
        commissioning_state: 'in_progress',
      }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { setMsg({ text: data.error ?? 'Could not save classification.', ok: false }); return }
    setSite(data.site)
    setMsg({ text: 'Classification saved.', ok: true })
  }

  async function fetchGa4Accounts() {
    setFetchingGa4Accounts(true)
    setMsg(null)
    const res = await fetch('/api/connect/google-org/ga4-accounts')
    const data = await res.json().catch(() => ({}))
    setFetchingGa4Accounts(false)
    if (!res.ok) { setMsg({ text: data.error ?? 'Could not fetch GA4 accounts.', ok: false }); return }
    setGa4Accounts(data.accounts ?? [])
  }

  async function fetchGscSites() {
    setFetchingGscSites(true)
    setMsg(null)
    const res = await fetch('/api/connect/google-org/search-console-sites')
    const data = await res.json().catch(() => ({}))
    setFetchingGscSites(false)
    if (!res.ok) { setMsg({ text: data.error ?? 'Could not fetch Search Console sites.', ok: false }); return }
    setGscSites(data.sites ?? [])
  }

  async function createGa4Property() {
    if (!selectedGa4AccountId || !newGa4Name.trim() || !site?.live_url) return
    setCreatingGa4Property(true)
    setMsg(null)
    const res = await fetch(`/api/events/site-registry/ga4-property?event_id=${eventId}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountId: selectedGa4AccountId, displayName: newGa4Name.trim(), liveUrl: site.live_url }),
    })
    const data = await res.json().catch(() => ({}))
    setCreatingGa4Property(false)
    if (!res.ok) { setMsg({ text: data.error ?? 'Could not create GA4 property.', ok: false }); return }
    await fetchGa4Accounts()
    setSelectedGa4PropertyId(data.propertyId)
    setMsg({ text: `GA4 property created${data.measurementId ? ` — measurement ID ${data.measurementId}` : ''}.`, ok: true })
  }

  async function saveGa4Connection() {
    if (!selectedGa4AccountId || !selectedGa4PropertyId) return
    setSavingGa4Connection(true)
    setMsg(null)
    const selectedAccount = ga4Accounts?.find(a => a.id === selectedGa4AccountId)
    const selectedProperty = selectedAccount?.properties.find(p => p.id === selectedGa4PropertyId)
    const res = await fetch(`/api/events/site-registry/connections?event_id=${eventId}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: 'ga4', account_ref: selectedGa4AccountId, property_ref: selectedGa4PropertyId, stream_ref: selectedProperty?.id ?? null }),
    })
    const data = await res.json().catch(() => ({}))
    setSavingGa4Connection(false)
    if (!res.ok) { setMsg({ text: data.error ?? 'Could not save GA4 connection.', ok: false }); return }
    await loadConnections()
    setMsg({ text: 'GA4 connection saved.', ok: true })
  }

  async function saveGscConnection() {
    if (!selectedGscSite) return
    setSavingGscConnection(true)
    setMsg(null)
    const res = await fetch(`/api/events/site-registry/connections?event_id=${eventId}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: 'search_console', property_ref: selectedGscSite }),
    })
    const data = await res.json().catch(() => ({}))
    setSavingGscConnection(false)
    if (!res.ok) { setMsg({ text: data.error ?? 'Could not save Search Console connection.', ok: false }); return }
    await loadConnections()
    setMsg({ text: 'Search Console connection saved.', ok: true })
  }

  async function runVerify() {
    setVerifying(true)
    setMsg(null)
    const res = await fetch(`/api/events/site-registry/verify?event_id=${eventId}`, { method: 'POST' })
    const data = await res.json().catch(() => ({}))
    setVerifying(false)
    if (!res.ok) { setMsg({ text: data.error ?? 'Could not verify connections.', ok: false }); return }
    await loadConnections()
    setMsg({ text: `GA4: ${data.ga4?.status} — Search Console: ${data.searchConsole?.status}`, ok: data.ga4?.status === 'pass' && data.searchConsole?.status === 'pass' })
  }

  async function markCommissioned() {
    const res = await fetch(`/api/events/site-registry?event_id=${eventId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ commissioning_state: 'commissioned' }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { setMsg({ text: data.error ?? 'Could not mark as commissioned.', ok: false }); return }
    setSite(data.site)
    setMsg({ text: 'Site marked commissioned.', ok: true })
  }

  const ga4Connection = siteConnections.find(c => c.provider === 'ga4')
  const gscConnection = siteConnections.find(c => c.provider === 'search_console')

  const selectedTicket: KonfhubTicket | null = fetchedCategories && selectedTicketId
    ? fetchedCategories.flatMap(c => c.tickets).find(t => String(t.ticket_id) === selectedTicketId) ?? null
    : null

  if (loading) return <div style={{ minHeight: '100vh', background: 'var(--surface)', padding: '32px', color: 'var(--ink3)' }}>Loading…</div>

  return (
    <div style={{ minHeight: '100vh', background: 'var(--surface)' }}>
      <PageHeader eyebrow="Event Workspace" title="Integrations" backHref={`/admin/events/${eventId}`} backLabel="Back to Event Overview" />

      <div style={{ maxWidth: '1140px', margin: '0 auto', padding: '20px 28px 60px', display: 'flex', gap: '32px', alignItems: 'flex-start' }}>
        <IntegrationsSideNav active={activeSection} />

        <div style={{ flex: 1, minWidth: 0, maxWidth: '900px' }}>
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

        <section id="konfhub" ref={el => { sectionRefs.current.konfhub = el }} style={{ scrollMarginTop: '20px' }}>
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
        </section>

        <section id="hubspot" ref={el => { sectionRefs.current.hubspot = el }} style={{ scrollMarginTop: '20px' }}>
        <div style={{ marginTop: '16px' }}><Card padded>
          <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--ink)', marginBottom: '4px' }}>HubSpot Forms</div>
          <div style={{ fontSize: '12.5px', color: 'var(--ink3)', marginBottom: '14px' }}>
            Status only — connecting a form and mapping its fields happens on each form type&apos;s own dedicated page (field-mapping is involved enough to deserve its own screen, not squeezed in here).
          </div>
          <div style={{ display: 'grid', gap: '8px' }}>
            {FORM_TYPES.map(formType => {
              const status = hubspotStatus[formType]
              return (
                <div key={formType} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', borderRadius: '8px', background: 'var(--card-hi)' }}>
                  <div>
                    <div style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--ink)' }}>{FORM_TITLES[formType]}</div>
                    <div style={{ fontSize: '12px', color: 'var(--ink4)', marginTop: '2px' }}>
                      {status === null ? 'Checking…'
                        : status === 'unknown' ? 'Status unavailable (needs Forms permission)'
                        : status.connected ? `Connected — ${status.formName ?? 'HubSpot form'}`
                        : 'Not connected'}
                    </div>
                  </div>
                  <Link href={`/admin/events/${eventId}/stakeholders/hubspot-form/${formType}?from=integrations`}
                    style={{ padding: '6px 12px', borderRadius: '7px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--ink2)', fontSize: '12.5px', fontWeight: 700, textDecoration: 'none' }}>
                    {status !== null && status !== 'unknown' && status.connected ? 'Manage →' : 'Connect →'}
                  </Link>
                </div>
              )
            })}
          </div>
        </Card></div>
        </section>

        <section id="postiz" ref={el => { sectionRefs.current.postiz = el }} style={{ scrollMarginTop: '20px' }}>
        <div style={{ marginTop: '16px' }}><Card padded>
          <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--ink)', marginBottom: '4px' }}>Postiz</div>
          <div style={{ fontSize: '12.5px', color: 'var(--ink3)', marginBottom: '14px' }}>
            Which Postiz group (Customer) this event belongs to, and which of its channels are available in SAE. The group is fetch-and-select only — Postiz has no way to type one in, groups are created in Postiz&apos;s own dashboard. Whatever&apos;s checked below is the ONLY thing that shows up when composing an announcement.
          </div>
          {!fetchedGroups ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              {postizGroupId ? (
                <div style={{ fontSize: '12.5px', color: 'var(--ink3)' }}>
                  Currently saved group: <code>{postizGroupId}</code> · {postizDefaultChannelIds.length} channel{postizDefaultChannelIds.length === 1 ? '' : 's'} selected
                </div>
              ) : (
                <Badge color="grey">Not set</Badge>
              )}
              {canManage && <Button variant="ghost" onClick={fetchGroups} disabled={fetchingGroups}>{fetchingGroups ? 'Fetching…' : 'Fetch Groups from Postiz'}</Button>}
            </div>
          ) : (
            <div style={{ display: 'grid', gap: '14px' }}>
              <div>
                <label style={labelStyle}>Postiz Group (Customer)</label>
                <Select value={selectedGroupId} disabled={!canManage} onChange={e => onSelectGroup(e.target.value)} style={{ maxWidth: '360px' }}>
                  <option value="">— Select —</option>
                  {fetchedGroups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                </Select>
                <div style={{ marginTop: '8px' }}>
                  {canManage && <Button variant="ghost" onClick={fetchGroups} disabled={fetchingGroups}>{fetchingGroups ? 'Fetching…' : 'Re-fetch Groups'}</Button>}
                </div>
              </div>

              {fetchingChannels && <div style={{ fontSize: '12.5px', color: 'var(--ink4)' }}>Fetching channels…</div>}

              {fetchedChannels && (
                <div>
                  <label style={labelStyle}>Channels available in SAE for this event</label>
                  {fetchedChannels.length === 0 ? (
                    <div style={{ fontSize: '13px', color: 'var(--ink4)' }}>No channels under this group.</div>
                  ) : (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                      {fetchedChannels.map(ch => {
                        const checked = selectedChannelIds.has(ch.id)
                        return (
                          <label key={ch.id} title={ch.disabled ? 'Disconnected in Postiz' : undefined}
                            style={{
                              display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 10px', borderRadius: '8px',
                              border: `1.5px solid ${checked ? 'var(--teal-mid)' : 'var(--border)'}`,
                              background: checked ? 'var(--teal-light)' : 'transparent',
                              color: ch.disabled ? 'var(--ink4)' : 'var(--ink2)', fontSize: '12px', fontWeight: 700, cursor: canManage ? 'pointer' : 'default',
                            }}>
                            <input type="checkbox" checked={checked} disabled={!canManage} onChange={() => toggleChannel(ch.id)} style={{ margin: 0 }} />
                            {ch.name} <span style={{ color: 'var(--ink4)', fontWeight: 400 }}>({ch.identifier})</span>
                          </label>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}

              {canManage && (
                <div>
                  <Button variant="teal" onClick={savePostiz} disabled={savingPostiz || !selectedGroupId}>{savingPostiz ? 'Saving…' : 'Save Postiz Settings'}</Button>
                </div>
              )}
            </div>
          )}
        </Card></div>
        </section>

        <section id="client-approval" ref={el => { sectionRefs.current['client-approval'] = el }} style={{ scrollMarginTop: '20px' }}>
        <div style={{ marginTop: '16px' }}><Card padded>
          <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--ink)', marginBottom: '4px' }}>Client Approval Contacts</div>
          <div style={{ fontSize: '12.5px', color: 'var(--ink3)', marginBottom: '14px' }}>
            For events managed on behalf of another client — adds a third approval round to announcements. Exactly one contact is <strong>Primary</strong>: only their decision actually clears an announcement for publishing. Everyone else is CC&apos;d — each gets their own link and their own tracked status, but it&apos;s informational only.
          </div>
          {contacts.length === 0 ? (
            <div style={{ fontSize: '13px', color: 'var(--ink4)', marginBottom: '14px' }}>No contacts yet — announcements skip the Client Approval layer entirely until one is added.</div>
          ) : (
            <div style={{ display: 'grid', gap: '8px', marginBottom: '14px' }}>
              {contacts.map(c => (
                <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', borderRadius: '8px', background: 'var(--card-hi)' }}>
                  <div>
                    <div style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--ink)' }}>
                      {c.name} {c.is_primary && <Badge color="teal">Primary</Badge>}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--ink4)', marginTop: '2px' }}>{c.email}</div>
                  </div>
                  {canManage && (
                    <div style={{ display: 'flex', gap: '6px' }}>
                      {!c.is_primary && (
                        <button onClick={() => makePrimary(c.id)} disabled={contactBusyId === c.id}
                          style={{ padding: '6px 12px', borderRadius: '7px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--ink2)', fontSize: '12px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                          Make Primary
                        </button>
                      )}
                      <button onClick={() => removeContact(c.id)} disabled={contactBusyId === c.id}
                        style={{ padding: '6px 12px', borderRadius: '7px', border: '1px solid var(--red-border)', background: 'transparent', color: 'var(--red)', fontSize: '12px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                        Remove
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          {canManage && (
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div>
                <label style={labelStyle}>Name</label>
                <Input value={newContactName} onChange={e => setNewContactName(e.target.value)} style={{ width: '200px' }} />
              </div>
              <div>
                <label style={labelStyle}>Email</label>
                <Input type="email" value={newContactEmail} onChange={e => setNewContactEmail(e.target.value)} style={{ width: '220px' }} />
              </div>
              <Button variant="teal" onClick={addContact} disabled={addingContact || !newContactName.trim() || !newContactEmail.trim()}>
                {addingContact ? 'Adding…' : '+ Add Contact'}
              </Button>
            </div>
          )}
        </Card></div>
        </section>

        <section id="site-registry" ref={el => { sectionRefs.current['site-registry'] = el }} style={{ scrollMarginTop: '20px' }}>
        <div style={{ marginTop: '16px' }}><Card padded>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
            <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--ink)' }}>Site Registry</div>
            {site && (
              <Badge color={site.commissioning_state === 'commissioned' ? 'teal' : 'grey'}>
                {site.commissioning_state.replace('_', ' ')}
              </Badge>
            )}
          </div>
          <div style={{ fontSize: '12.5px', color: 'var(--ink3)', marginBottom: '14px' }}>
            Registers this event&apos;s website as a record EventPilot knows about — the first step before anything else in the Site Operations module (analytics, search, health checks) can exist. Everything else about the site — Cloudflare account/zone, deploy status, domain classification — is derived or fetched in later phases, not entered here.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '14px', marginBottom: '16px' }}>
            <div>
              <label style={labelStyle}>Live URL</label>
              <Input value={siteFields.live_url} disabled={!canManage} onChange={e => setSiteFields(p => ({ ...p, live_url: e.target.value }))} placeholder="https://example.com" />
            </div>
            <div>
              <label style={labelStyle}>Repo URL</label>
              <Input value={siteFields.repo_url} disabled={!canManage} onChange={e => setSiteFields(p => ({ ...p, repo_url: e.target.value }))} placeholder="https://github.com/Trescon-Events/..." />
            </div>
            <div>
              <label style={labelStyle}>Preview URL</label>
              <Input value={siteFields.preview_url} disabled={!canManage} onChange={e => setSiteFields(p => ({ ...p, preview_url: e.target.value }))} />
            </div>
            <div>
              <label style={labelStyle}>Hosting Provider</label>
              <Input value={siteFields.hosting_provider} disabled={!canManage} onChange={e => setSiteFields(p => ({ ...p, hosting_provider: e.target.value }))} placeholder="e.g. Cloudflare Pages, Railway" />
            </div>
          </div>
          {canManage && <Button variant="teal" onClick={saveSite} disabled={savingSite}>{savingSite ? 'Saving…' : site ? 'Save Changes' : 'Register Site'}</Button>}
        </Card></div>

        {site && site.commissioning_state !== 'commissioned' && (
          <div style={{ marginTop: '16px' }}><Card padded>
            <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--ink)', marginBottom: '4px' }}>Commissioning</div>
            <div style={{ fontSize: '12.5px', color: 'var(--ink3)', marginBottom: '14px' }}>
              Classifies the domain, connects GA4 and Search Console, and verifies both before marking this site live. Scenario A (new domain, new series) only for now — an existing domain is detected and flagged, not auto-handled.
            </div>

            {!site.registrable_domain ? (
              <div>
                {!classifyResult ? (
                  <Button variant="ghost" onClick={classifyDomain} disabled={classifying}>{classifying ? 'Classifying…' : 'Classify Domain'}</Button>
                ) : (
                  <div style={{ display: 'grid', gap: '12px' }}>
                    <div style={{ padding: '10px 12px', borderRadius: '8px', background: 'var(--card-hi)', fontSize: '12.5px', color: 'var(--ink2)' }}>
                      <div style={{ fontWeight: 700, marginBottom: '4px' }}>Domain: {classifyResult.registrableDomain}</div>
                      <div>Sibling events on this domain: {classifyResult.evidence.siblingEvents.length === 0 ? 'none' : classifyResult.evidence.siblingEvents.map(s => s.eventName).join(', ')}</div>
                      <div>Matching Search Console properties: {classifyResult.evidence.matchingGscSites.length === 0 ? 'none' : classifyResult.evidence.matchingGscSites.join(', ')}</div>
                      {!classifyResult.evidence.googleConnected && <div style={{ color: 'var(--amber)', marginTop: '4px' }}>Google account not connected — evidence is incomplete.</div>}
                    </div>
                    <div>
                      <label style={labelStyle}>Detected scenario (override if wrong)</label>
                      <Select value={scenarioOverride || classifyResult.scenario} onChange={e => setScenarioOverride(e.target.value as ClassifyResult['scenario'])} style={{ maxWidth: '320px' }}>
                        <option value="new_domain_new_series">New domain, new series</option>
                        <option value="not_new_domain">Existing domain (manual handling — Scenario B/C not built yet)</option>
                      </Select>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <Button variant="teal" onClick={() => confirmClassification(scenarioOverride || classifyResult.scenario)}>Confirm Classification</Button>
                      <Button variant="ghost" onClick={classifyDomain} disabled={classifying}>{classifying ? 'Re-classifying…' : 'Re-classify'}</Button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ display: 'grid', gap: '16px' }}>
                <div style={{ fontSize: '12.5px', color: 'var(--ink3)' }}>
                  Domain <strong>{site.registrable_domain}</strong> — {site.launch_scenario === 'new_domain_new_series' ? 'new domain, new series' : 'existing domain (manual)'}
                </div>

                <div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink)', marginBottom: '6px' }}>
                    Google Analytics {ga4Connection && <Badge color={ga4Connection.status === 'verified' ? 'teal' : 'amber'}>{ga4Connection.status}</Badge>}
                  </div>
                  {ga4Connection ? (
                    <div style={{ fontSize: '12.5px', color: 'var(--ink3)' }}>Property {ga4Connection.property_ref} (account {ga4Connection.account_ref}){ga4Connection.last_error && <div style={{ color: 'var(--amber)' }}>{ga4Connection.last_error}</div>}</div>
                  ) : !ga4Accounts ? (
                    <Button variant="ghost" onClick={fetchGa4Accounts} disabled={fetchingGa4Accounts}>{fetchingGa4Accounts ? 'Fetching…' : 'Fetch GA4 Accounts'}</Button>
                  ) : (
                    <div style={{ display: 'grid', gap: '10px' }}>
                      <Select value={selectedGa4AccountId} onChange={e => { setSelectedGa4AccountId(e.target.value); setSelectedGa4PropertyId('') }} style={{ maxWidth: '360px' }}>
                        <option value="">— Select GA4 account —</option>
                        {ga4Accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                      </Select>
                      {selectedGa4AccountId && (
                        <>
                          <Select value={selectedGa4PropertyId} onChange={e => setSelectedGa4PropertyId(e.target.value)} style={{ maxWidth: '360px' }}>
                            <option value="">— Select existing property —</option>
                            {ga4Accounts.find(a => a.id === selectedGa4AccountId)?.properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                          </Select>
                          {site.launch_scenario === 'new_domain_new_series' && (
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                              <Input value={newGa4Name} onChange={e => setNewGa4Name(e.target.value)} placeholder="New property name" style={{ maxWidth: '240px' }} />
                              <Button variant="ghost" onClick={createGa4Property} disabled={creatingGa4Property || !newGa4Name.trim()}>{creatingGa4Property ? 'Creating…' : 'Create New Property'}</Button>
                            </div>
                          )}
                          {selectedGa4PropertyId && (
                            <Button variant="teal" onClick={saveGa4Connection} disabled={savingGa4Connection}>{savingGa4Connection ? 'Saving…' : 'Save GA4 Connection'}</Button>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>

                <div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink)', marginBottom: '6px' }}>
                    Search Console {gscConnection && <Badge color={gscConnection.status === 'verified' ? 'teal' : 'amber'}>{gscConnection.status}</Badge>}
                  </div>
                  {gscConnection ? (
                    <div style={{ fontSize: '12.5px', color: 'var(--ink3)' }}>{gscConnection.property_ref}{gscConnection.last_error && <div style={{ color: 'var(--amber)' }}>{gscConnection.last_error}</div>}</div>
                  ) : !gscSites ? (
                    <Button variant="ghost" onClick={fetchGscSites} disabled={fetchingGscSites}>{fetchingGscSites ? 'Fetching…' : 'Fetch Search Console Sites'}</Button>
                  ) : (
                    <div style={{ display: 'grid', gap: '10px' }}>
                      <Select value={selectedGscSite} onChange={e => setSelectedGscSite(e.target.value)} style={{ maxWidth: '360px' }}>
                        <option value="">— Select site —</option>
                        {gscSites.map(s => <option key={s.url} value={s.url}>{s.url}{s.verified ? '' : ' (unverified)'}</option>)}
                      </Select>
                      {selectedGscSite && (
                        <Button variant="teal" onClick={saveGscConnection} disabled={savingGscConnection}>{savingGscConnection ? 'Saving…' : 'Save Search Console Connection'}</Button>
                      )}
                    </div>
                  )}
                </div>

                {ga4Connection && gscConnection && (
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <Button variant="ghost" onClick={runVerify} disabled={verifying}>{verifying ? 'Verifying…' : 'Verify Connections'}</Button>
                    {ga4Connection.status === 'verified' && gscConnection.status === 'verified' && (
                      <Button variant="teal" onClick={markCommissioned}>Mark Commissioned</Button>
                    )}
                  </div>
                )}
              </div>
            )}
          </Card></div>
        )}
        </section>

        <section id="health-checks" ref={el => { sectionRefs.current['health-checks'] = el }} style={{ scrollMarginTop: '20px' }}>
        <div style={{ marginTop: '16px' }}><Card padded>
          <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--ink)', marginBottom: '4px' }}>Health Checks</div>
          <div style={{ fontSize: '12.5px', color: 'var(--ink3)', marginBottom: '14px' }}>
            Runs daily automatically; run on demand any time. A site with no GA4/Search Console connection yet shows those checks as amber, not red — that&apos;s expected mid-commissioning, not a failure.
          </div>
          {!site ? (
            <div style={{ fontSize: '13px', color: 'var(--ink4)' }}>Register the site above first.</div>
          ) : (
            <div style={{ display: 'grid', gap: '8px' }}>
              {healthChecks.length === 0 ? (
                <div style={{ fontSize: '13px', color: 'var(--ink4)', marginBottom: '4px' }}>No checks run yet.</div>
              ) : (
                healthChecks.map(c => {
                  const color = c.status === 'pass' ? 'teal' : c.status === 'warn' ? 'amber' : 'red'
                  return (
                    <div key={c.check_key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', borderRadius: '8px', background: 'var(--card-hi)' }}>
                      <div>
                        <div style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--ink)' }}>{HEALTH_CHECK_LABELS[c.check_key] ?? c.check_key}</div>
                        <div style={{ fontSize: '12px', color: 'var(--ink4)', marginTop: '2px' }}>{c.detail}</div>
                      </div>
                      <Badge color={color}>{c.status}</Badge>
                    </div>
                  )
                })
              )}
              {canManage && (
                <div style={{ marginTop: '4px' }}>
                  <Button variant="ghost" onClick={runHealthCheck} disabled={runningHealthCheck}>{runningHealthCheck ? 'Running…' : 'Run Health Check Now'}</Button>
                </div>
              )}
            </div>
          )}
        </Card></div>
        </section>

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
    </div>
  )
}

const labelStyle: React.CSSProperties = { fontSize: '12px', fontWeight: 700, color: 'var(--ink3)', display: 'block', marginBottom: '6px' }
