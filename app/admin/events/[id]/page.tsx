'use client'

import { useState, useEffect, useRef, use } from 'react'
import Link from 'next/link'
import { useBreadcrumbLabel } from '@/app/lib/nav/breadcrumb-labels'
import { FEATURE_REGISTRY, type FeatureKey } from '@/app/lib/registry/feature-flags'

// Event workspace (2026-10-18, per Madhu): only the modules that are built, tested and in real use are shown here: Event Details, Stakeholder Hub,
// Agenda Manager, Press Release Studio and Operations Hub, then the Settings pages as cards at the bottom. Everything else built earlier
// (planning board, commercial P&L, brand studio, brief, execution flow, website builder, content campaigns, checklist, report) is hidden from this
// page, not deleted: the routes still work. Each card shows only when the caller has access to that module on this event
// (/api/events/access/my-events -> toolKeys) and the event has the feature switched on.
type WorkspaceCard = { toolKey: string; featureKey?: FeatureKey; label: string; description: string; href: string }

const MODULE_CARDS = (eventId: string): WorkspaceCard[] => [
  { toolKey: 'admin-event-stakeholders', label: 'Stakeholder Hub', description: 'Speakers, sponsors and partners: onboarding, approvals, photos, KonfHub.', href: `/admin/events/${eventId}/stakeholders` },
  { toolKey: 'agenda-builder', featureKey: 'agenda-builder', label: 'Agenda Manager', description: 'Day timeline of stages and sessions, speakers with roles, publish and push to KonfHub.', href: `/admin/events/${eventId}/agenda` },
  { toolKey: 'press-releases', featureKey: 'press-releases', label: 'Press Release Studio', description: 'Research, generate and refine press releases that follow the content rules.', href: `/admin/events/${eventId}/press-releases` },
  { toolKey: 'operations', featureKey: 'operations', label: 'Operations Hub', description: 'Vendors, licences, badges and speaker document requests for this event.', href: `/admin/events/${eventId}/operations` },
]

const SETTINGS_CARDS = (eventId: string): WorkspaceCard[] => [
  { toolKey: 'admin-event-integrations', label: 'Integrations', description: 'KonfHub, HubSpot, Postiz, agenda mapping and the other connections for this event.', href: `/admin/events/${eventId}/integrations` },
  { toolKey: 'admin-event-access', label: 'Access', description: 'Who can open which modules on this event.', href: `/admin/events/${eventId}/access` },
  { toolKey: 'admin-event-integrations', label: 'Event Properties', description: 'The fields this event keeps about itself.', href: `/admin/events/${eventId}/settings/event-properties` },
  { toolKey: 'admin-event-integrations', label: 'Speaker Properties', description: 'The speaker form and record fields.', href: `/admin/events/${eventId}/stakeholders/form-builder/speaker` },
  { toolKey: 'admin-event-integrations', label: 'Sponsor Properties', description: 'The sponsor form and record fields.', href: `/admin/events/${eventId}/stakeholders/form-builder/sponsor` },
  { toolKey: 'admin-event-integrations', label: 'Media Partner Properties', description: 'The media partner form and record fields.', href: `/admin/events/${eventId}/stakeholders/form-builder/media_partner` },
  { toolKey: 'admin-event-integrations', label: 'Association Partner Properties', description: 'The association partner form and record fields.', href: `/admin/events/${eventId}/stakeholders/form-builder/association_partner` },
]

const visibleCards = (cards: WorkspaceCard[], toolKeys: Set<string>, features: Set<FeatureKey>) =>
  cards.filter(c => toolKeys.has(c.toolKey) && (!c.featureKey || features.has(c.featureKey)))

function navLinkStyle(): React.CSSProperties {
  return { display: 'block', padding: '9px 12px', borderRadius: '8px', fontSize: '13px', fontWeight: 700, textDecoration: 'none', color: 'var(--ink2)', borderLeft: '2.5px solid transparent', cursor: 'pointer' }
}

function WorkspaceLeftNav({ eventId, modules, settings }: { eventId: string; modules: WorkspaceCard[]; settings: WorkspaceCard[] }) {
  const [settingsOpen, setSettingsOpen] = useState(false)
  return (
    <nav style={{ width: '212px', flexShrink: 0, position: 'sticky', top: '20px' }}>
      <div style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--ink4)', marginBottom: '10px', paddingLeft: '12px' }}>Event Workspace</div>
      <div style={{ display: 'grid', gap: '2px', marginBottom: '14px' }}>
        <Link href={`/admin/events/${eventId}/details`} style={navLinkStyle()}>Event Details</Link>
        {modules.map(m => <Link key={m.label} href={m.href} style={navLinkStyle()}>{m.label}</Link>)}
        {settings.length > 0 && (
          <div>
            <a href="#settings" onClick={e => { e.preventDefault(); setSettingsOpen(v => !v) }} style={{ ...navLinkStyle(), display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              Settings
              <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" style={{ transform: settingsOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}><polyline points="9 18 15 12 9 6" /></svg>
            </a>
            {settingsOpen && (
              <div style={{ paddingLeft: '14px', marginTop: '2px', display: 'grid', gap: '1px' }}>
                {settings.map(l => <Link key={l.label} href={l.href} style={{ display: 'block', padding: '6px 10px', borderRadius: '6px', fontSize: '12.5px', fontWeight: 600, color: 'var(--ink3)', textDecoration: 'none' }}>{l.label}</Link>)}
              </div>
            )}
          </div>
        )}
      </div>
    </nav>
  )
}

function CardGrid({ title, id, cards }: { title: string; id?: string; cards: WorkspaceCard[] }) {
  if (cards.length === 0) return null
  return (
    <div id={id} style={{ marginBottom: '24px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '16px', padding: '24px 28px', scrollMarginTop: '20px' }}>
      <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--ink)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '16px' }}>{title}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '12px' }}>
        {cards.map(c => (
          <Link key={c.label} href={c.href} style={{ display: 'block', textDecoration: 'none', border: '1px solid var(--border)', borderRadius: '12px', padding: '14px 16px', background: 'var(--surface)' }}>
            <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--ink)', marginBottom: '4px' }}>{c.label}</div>
            <div style={{ fontSize: '12px', color: 'var(--ink3)', lineHeight: 1.45 }}>{c.description}</div>
          </Link>
        ))}
      </div>
    </div>
  )
}

type ChecklistItem = {
  id: string
  department: string
  title: string
  status: 'not_started' | 'in_progress' | 'done' | 'overdue'
  due_date: string | null
  completed_at: string | null
  notes: string | null
  sort_order: number
  owner: { id: string; name: string; department: string } | null
}

type Event = {
  id: string
  name: string
  type: string
  status: string
  event_date: string | null
  end_date: string | null
  venue: string | null
  city: string | null
  client_name: string | null
  description: string | null
  expected_attendance: number | null
  // Public-facing overrides — what emails/announcements/other external
  // content use instead of the internal reference name/venue/dates above.
  public_name: string | null
  public_dates_display: string | null
  public_venue_display: string | null
  // Digital presence (Stakeholder Announcement Engine)
  event_format: string | null
  country: string | null
  website_url: string | null
  event_hashtag: string | null
  registration_url: string | null
  social_linkedin: string | null
  social_x: string | null
  social_instagram: string | null
  social_facebook: string | null
  social_youtube: string | null
  venue_map_url: string | null
  postiz_profile_key: string | null
  postiz_default_channel_ids: string[] | null
  // Client Approval's single contact (2026-08-29) — for events Trescon
  // manages on behalf of another client (e.g. DFS/DFFW events managed for
  // DIFC). Whether client_contact_email is set is what decides whether the
  // Client Approval layer even shows in the Announcement panel.
  client_contact_name: string | null
  client_contact_job_title: string | null
  client_contact_email: string | null
  // Per-event feature toggles (2026-09-27) — see app/lib/registry/feature-flags.ts.
  enabled_features: Record<string, boolean> | null
}

type StaffMember = { id: string; name: string; department: string }

type ExpenseCategory = { id: string; name: string; sort_order: number }

type Deal = {
  id: string; deal_type: string; company_name: string; contact_name: string | null
  description: string | null; amount: number; deal_currency: string
  exchange_rate: number; converted_amount: number; status: string
  deal_date: string | null; notes: string | null; created_at: string
  logged_by: { id: string; name: string } | null
}

type Expense = {
  id: string; description: string; amount: number; expense_currency: string
  exchange_rate: number; converted_amount: number; expense_date: string | null
  receipt_ref: string | null; notes: string | null; created_at: string
  logged_by: { id: string; name: string } | null
  category: { id: string; name: string } | null
}

type Delegate = {
  id: string; full_name: string; company: string | null; job_title: string | null
  industry: string | null; seniority_tier: string; status: string
  invite_date: string | null; notes: string | null; created_at: string
  invited_by: { id: string; name: string } | null
}

type PnlSummary = {
  currency: string; exchange_rate: number; approved_budget: number
  revenue: { confirmed: number; pending: number; by_type: Record<string, number> }
  expenses: { total: number }
  finance_overhead: { allocated: number; total_hours: number; months: Array<{ month: string; hours: number; pct: number; cost: number }>; note: string | null }
  hr_overhead: { allocated: number; total_hours: number; months: Array<{ month: string; hours: number; pct: number; cost: number }>; note: string | null }
  total_cost: number
  net_pnl: number; budget_variance: number
  planner: {
    total_planned: number; unallocated: number
    categories: Array<{
      category_id: string; category_name: string; sort_order: number
      planned: number; actual: number; remaining: number; status: string
    }>
  }
  delegates: { invited: number; confirmed: number; declined: number; attended: number; by_tier: Record<string, number> }
}

type DraftReport = {
  id: string
  title: string
  extracted_text: string
  status: 'draft' | 'live'
  created_at: string
}

type Comment = {
  id: string
  comment: string
  resolved: boolean
  created_at: string
  staff: { id: string; name: string; department: string } | null
}

type EventStaffMember = {
  id: string; role: string | null; assigned_at: string | null
  staff_members: { id: string; name: string; email: string; department: string | null; role: string | null } | null
}

// Department accent colors — kept as literal hex (not var()) because dColor is
// used at runtime to build an rgba() tint string (see the department-header
// background below) and as a solid button fill; CSS custom properties can't be
// decomposed into rgb components that way. Values below are the dark-theme
// equivalents of each family token (var(--teal-mid), var(--purple),
// var(--amber), var(--success), var(--info)); HR has no family token so it
// keeps the already-brightened literal pink used elsewhere in the app.
const DEPT_COLORS: Record<string, string> = {
  Operations: '#12C9BD', // var(--teal-mid)
  Marketing:  '#A78BFA', // var(--purple)
  Sales:      '#F5B94D', // var(--amber)
  Finance:    '#34D399', // var(--success)
  Content:    '#5AA9F2', // var(--info)
  HR:         '#F472B6', // brightened pink, no family token
}

const STATUS_CONFIG = {
  // Bespoke gray tint tuned for the dark card — no family maps to "not started".
  not_started: { label: 'Not Started', color: 'var(--ink2)',    bg: 'rgba(255,255,255,0.06)' },
  in_progress: { label: 'In Progress', color: 'var(--amber)',   bg: 'var(--amber-light)' },
  done:        { label: 'Done',        color: 'var(--lime)',    bg: 'var(--lime-light)' },
  overdue:     { label: 'Overdue',     color: 'var(--red)',     bg: 'var(--red-light)' },
}

export default function EventWorkspacePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = use(params)

  const [event,         setEvent]         = useState<Event | null>(null)
  // Breadcrumb trail (GlobalShell) has no way to know this event's real
  // name on its own — see breadcrumb-labels.tsx.
  useBreadcrumbLabel(eventId, event?.name ?? null)
  const [checklist,     setChecklist]     = useState<ChecklistItem[]>([])
  const [staffList,     setStaffList]     = useState<StaffMember[]>([])
  const [loading,       setLoading]       = useState(true)
  const [generating,    setGenerating]    = useState(false)
  const [editingId,     setEditingId]     = useState<string | null>(null)
  const [editDraft,     setEditDraft]     = useState<Partial<ChecklistItem>>({})
  const [addingDept,    setAddingDept]    = useState<string | null>(null)
  const [newItemTitle,  setNewItemTitle]  = useState('')
  const [msg,           setMsg]           = useState('')
  const [report,        setReport]        = useState<DraftReport | null>(null)
  const [comments,      setComments]      = useState<Comment[]>([])
  const [commentText,   setCommentText]   = useState('')
  const [reportBusy,    setReportBusy]    = useState(false)
  const [commentSaving, setCommentSaving] = useState(false)

  const [toolKeys, setToolKeys] = useState<Set<string>>(new Set())
  useEffect(() => {
    fetch('/api/events/access/my-events').then(r => r.ok ? r.json() : null).then(j => {
      const ev = j?.events?.find((e: { id: string }) => e.id === eventId)
      setToolKeys(new Set<string>(ev?.toolKeys ?? []))
    }).catch(() => {})
  }, [eventId])

  // Event editing
  const [editing,        setEditing]        = useState(false)
  const [editForm,       setEditForm]       = useState({
    name: '', type: '', status: '', event_date: '', end_date: '', venue: '', city: '', client_name: '', description: '', expected_attendance: '',
    event_format: '', country: '', postiz_profile_key: '',
    client_contact_name: '', client_contact_job_title: '', client_contact_email: '',
  })
  const [savingEdit,     setSavingEdit]     = useState(false)
  // Postiz's own channel selection now lives on the Integrations page
  // (2026-09-06) — defaultChannelIds stays here only because saveEventEdit
  // still round-trips it as part of the same whole-event PATCH; nothing
  // on this page reads or edits it anymore.
  const [defaultChannelIds, setDefaultChannelIds] = useState<string[]>([])

  // Topline Messaging Doc
  type MessagingDoc = {
    id: string; version: number; title: string; source_url: string | null
    structured_json: Record<string, unknown> | null; status: string; updated_at: string
  }
  const [messagingDoc,       setMessagingDoc]       = useState<MessagingDoc | null>(null)

  // Team tab
  const [eventStaff,     setEventStaff]     = useState<EventStaffMember[]>([])
  const [teamSearch,     setTeamSearch]     = useState('')
  const [addingStaff,    setAddingStaff]    = useState(false)
  const [staffRole,      setStaffRole]      = useState('')

  // P&L state
  const [pnlTab,         setPnlTab]         = useState<'overview'|'planner'|'deals'|'expenses'|'delegates'|'finance'|'team'|'hr'|'social'|'content'>('overview')
  // Social accounts tab
  type SocialAccount = { id: string; platform: string; page_name: string; page_url: string; page_id: string; access_token: string; updated_at: string }
  const [socialAccounts,   setSocialAccounts]   = useState<SocialAccount[]>([])
  const [socialLoading,    setSocialLoading]    = useState(false)
  const [socialForm,       setSocialForm]       = useState({ platform: 'Facebook', page_name: '', page_url: '', page_id: '', access_token: '' })
  const [socialSaving,     setSocialSaving]     = useState(false)
  const [socialMsg,        setSocialMsg]        = useState('')
  // Content campaigns tab
  type ContentCampaign = { id: string; name: string; phase: string; status: string; platforms: string[]; created_at: string; content_posts: { count: number }[] | null }
  const [contentCampaigns, setContentCampaigns] = useState<ContentCampaign[]>([])
  const [contentLoading,   setContentLoading]   = useState(false)
  const [pnl,            setPnl]            = useState<PnlSummary | null>(null)
  const [deals,          setDeals]          = useState<Deal[]>([])
  const [expenses,       setExpenses]       = useState<Expense[]>([])
  const [delegates,      setDelegates]      = useState<Delegate[]>([])
  const [categories,     setCategories]     = useState<ExpenseCategory[]>([])
  const [budget,         setBudget]         = useState<{ budget: { currency: string; approved_budget: number; exchange_rate_to_usd: number; notes?: string | null } | null; allocations: Array<{ category_id: string; planned_amount: number; category: ExpenseCategory }> } | null>(null)
  const [pnlLoading,     setPnlLoading]     = useState(false)
  const [pnlMsg,         setPnlMsg]         = useState('')

  // Budget form
  const [budgetForm,     setBudgetForm]     = useState({ currency: 'USD', approved_budget: '', exchange_rate_to_usd: '84', notes: '' })
  const [allocations,    setAllocations]    = useState<Record<string, string>>({})
  const [savingBudget,   setSavingBudget]   = useState(false)

  // Deal form
  const [dealForm,       setDealForm]       = useState({ deal_type: 'sponsorship', company_name: '', contact_name: '', description: '', amount: '', deal_currency: 'USD', exchange_rate: '1', status: 'pending', deal_date: '', notes: '', inventory_item_id: '' })
  const [inventoryItems, setInventoryItems] = useState<Array<{ id: string; name: string; category: string; quantity: number; sold: number; reserved: number }>>([])
  const [inventoryLoaded, setInventoryLoaded] = useState(false)
  const [savingDeal,     setSavingDeal]     = useState(false)
  const [showDealForm,   setShowDealForm]   = useState(false)

  // Expense form
  const [expForm,        setExpForm]        = useState({ category_id: '', description: '', amount: '', expense_currency: 'USD', exchange_rate: '1', expense_date: '', receipt_ref: '', notes: '' })
  const [savingExp,      setSavingExp]      = useState(false)
  const [showExpForm,    setShowExpForm]    = useState(false)

  // Finance work log state
  const [finLogs,        setFinLogs]        = useState<Array<{ id: string; hours: number; description: string; log_date: string; event: { id: string; name: string } | null; staff: { id: string; name: string } | null }>>([])
  const [finForm,        setFinForm]        = useState({ hours: '', description: '', log_date: new Date().toISOString().slice(0, 10) })
  const [savingFin,      setSavingFin]      = useState(false)
  const [showFinForm,    setShowFinForm]    = useState(false)

  // Delegate form
  const [delForm,        setDelForm]        = useState({ full_name: '', company: '', job_title: '', industry: '', seniority_tier: 'other', status: 'pending', invite_date: '', notes: '' })
  const [savingDel,      setSavingDel]      = useState(false)
  const [showDelForm,    setShowDelForm]    = useState(false)

  // 2026-08-16 fix: navigating here via the "Workspace" link on the Events
  // list (app/admin/page.tsx) was landing scrolled partway down the page
  // instead of at the top — the browser was restoring this URL's last
  // scroll position from history rather than treating the Link click as a
  // fresh visit. Force scroll-to-top on mount regardless of cause.
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [])

  useEffect(() => {
    fetchAll()
    fetchPnlData()
    fetchFinanceLogs()
    fetchEventStaff()
    fetchMessagingDoc()
  }, [eventId])

  async function fetchMessagingDoc() {
    const res  = await fetch(`/api/events/stakeholders/messaging?event_id=${eventId}`)
    const data = await res.json().catch(() => null)
    setMessagingDoc(data ?? null)
  }

  async function fetchEventStaff() {
    const res  = await fetch(`/api/events/staff?event_id=${eventId}`)
    const data = await res.json().catch(() => [])
    setEventStaff(Array.isArray(data) ? data : [])
  }

  async function saveEventEdit() {
    setSavingEdit(true)
    const body: Record<string, string | number | null | string[]> = {
      name:        editForm.name,
      type:        editForm.type,
      status:      editForm.status,
      event_date:  editForm.event_date || null,
      end_date:    editForm.end_date || null,
      venue:       editForm.venue || null,
      city:        editForm.city || null,
      client_name: editForm.client_name || null,
      description: editForm.description || null,
      expected_attendance: editForm.expected_attendance ? Number(editForm.expected_attendance) : null,
      event_format:      editForm.event_format || null,
      country:           editForm.country || null,
      postiz_profile_key: editForm.postiz_profile_key || null,
      postiz_default_channel_ids: defaultChannelIds,
      client_contact_name:      editForm.client_contact_name || null,
      client_contact_job_title: editForm.client_contact_job_title || null,
      client_contact_email:     editForm.client_contact_email || null,
    }
    const res  = await fetch(`/api/events?id=${eventId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    if (res.ok) { setEditing(false); fetchAll() }
    setSavingEdit(false)
  }

  async function assignStaff(staffId: string) {
    setAddingStaff(true)
    await fetch('/api/events/staff', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_id: eventId, staff_id: staffId, role: staffRole || null }),
    })
    setTeamSearch(''); setStaffRole(''); setAddingStaff(false)
    fetchEventStaff()
  }

  async function removeStaff(staffId: string) {
    await fetch(`/api/events/staff?event_id=${eventId}&staff_id=${staffId}`, { method: 'DELETE' })
    fetchEventStaff()
  }

  async function fetchAll() {
    setLoading(true)
    const [evRes, clRes, stRes, rpRes] = await Promise.all([
      fetch(`/api/events?id=${eventId}`),
      fetch(`/api/events/checklist?event_id=${eventId}`),
      fetch('/api/staff-list'),
      fetch(`/api/documents/generate-report?event_id=${eventId}`),
    ])
    const evData = await evRes.json().catch(() => null)
    const clData = await clRes.json().catch(() => [])
    const stData = await stRes.json().catch(() => [])
    const rpData = await rpRes.json().catch(() => null)

    const ev = Array.isArray(evData) ? evData[0] : evData
    setEvent(ev)
    if (ev) {
      setEditForm({
        name:                ev.name ?? '',
        type:                ev.type ?? '',
        status:              ev.status ?? '',
        event_date:          ev.event_date?.slice(0, 10) ?? '',
        end_date:            ev.end_date?.slice(0, 10) ?? '',
        venue:               ev.venue ?? '',
        city:                ev.city ?? '',
        client_name:         ev.client_name ?? '',
        description:         ev.description ?? '',
        expected_attendance: ev.expected_attendance ? String(ev.expected_attendance) : '',
        event_format:        ev.event_format ?? '',
        country:             ev.country ?? '',
        postiz_profile_key:  ev.postiz_profile_key ?? '',
        client_contact_name:      ev.client_contact_name ?? '',
        client_contact_job_title: ev.client_contact_job_title ?? '',
        client_contact_email:     ev.client_contact_email ?? '',
      })
      setDefaultChannelIds(ev.postiz_default_channel_ids ?? [])
    }
    setChecklist(Array.isArray(clData) ? clData : [])
    setStaffList(Array.isArray(stData) ? stData : [])
    const rp = rpData?.id ? rpData : null
    setReport(rp)
    if (rp) fetchComments(rp.id)
    setLoading(false)
  }

  async function fetchPnlData() {
    setPnlLoading(true)
    const [pnlRes, dealsRes, expRes, delRes, catRes, budRes] = await Promise.all([
      fetch(`/api/events/pnl?event_id=${eventId}`),
      fetch(`/api/events/deals?event_id=${eventId}`),
      fetch(`/api/events/expenses?event_id=${eventId}`),
      fetch(`/api/events/delegates?event_id=${eventId}`),
      fetch('/api/expense-categories'),
      fetch(`/api/events/budget?event_id=${eventId}`),
    ])
    const [pnlData, dealsData, expData, delData, catData, budData] = await Promise.all([
      pnlRes.json().catch(() => null),
      dealsRes.json().catch(() => []),
      expRes.json().catch(() => []),
      delRes.json().catch(() => []),
      catRes.json().catch(() => []),
      budRes.json().catch(() => null),
    ])
    if (pnlData && !pnlData.error) setPnl(pnlData)
    setDeals(Array.isArray(dealsData) ? dealsData : [])
    setExpenses(Array.isArray(expData) ? expData : [])
    setDelegates(Array.isArray(delData) ? delData : [])
    setCategories(Array.isArray(catData) ? catData.filter((c: ExpenseCategory & { is_active: boolean }) => c.is_active) : [])
    if (budData && !budData.error) {
      setBudget(budData)
      if (budData.budget) {
        setBudgetForm(f => ({ ...f, currency: budData.budget.currency, approved_budget: String(budData.budget.approved_budget), exchange_rate_to_usd: String(budData.budget.exchange_rate_to_usd), notes: budData.budget.notes ?? '' }))
        const allocMap: Record<string, string> = {}
        for (const a of budData.allocations ?? []) allocMap[a.category_id] = String(a.planned_amount)
        setAllocations(allocMap)
      }
    }
    setPnlLoading(false)
  }

  const fmt = (n: number, currency?: string) => {
    const cur = currency ?? budget?.budget?.currency ?? 'USD'
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: cur, maximumFractionDigits: 0 }).format(n)
  }

  async function saveBudget() {
    setSavingBudget(true); setPnlMsg('')
    const allocationRows = categories.map(c => ({ category_id: c.id, planned_amount: Number(allocations[c.id] ?? 0) }))
    const res = await fetch('/api/events/budget', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_id: eventId, ...budgetForm, approved_budget: Number(budgetForm.approved_budget), exchange_rate_to_usd: Number(budgetForm.exchange_rate_to_usd), allocations: allocationRows }),
    })
    const data = await res.json()
    if (res.ok) { setPnlMsg('Budget saved.'); fetchPnlData() } else { setPnlMsg(data.error ?? 'Failed to save budget.') }
    setSavingBudget(false)
  }

  async function saveDeal() {
    setSavingDeal(true); setPnlMsg('')
    const res = await fetch('/api/events/deals', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_id: eventId, ...dealForm, amount: Number(dealForm.amount), exchange_rate: Number(dealForm.exchange_rate), inventory_item_id: dealForm.inventory_item_id || null }),
    })
    const data = await res.json()
    if (res.ok) { setShowDealForm(false); setDealForm({ deal_type: 'sponsorship', company_name: '', contact_name: '', description: '', amount: '', deal_currency: 'USD', exchange_rate: '1', status: 'pending', deal_date: '', notes: '', inventory_item_id: '' }); fetchPnlData() }
    else { setPnlMsg(data.error ?? 'Failed to save deal.') }
    setSavingDeal(false)
  }

  async function updateDealStatus(id: string, status: string) {
    await fetch('/api/events/deals', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, status }) })
    fetchPnlData()
  }

  async function deleteDeal(id: string) {
    await fetch(`/api/events/deals?id=${id}`, { method: 'DELETE' })
    fetchPnlData()
  }

  async function saveExpense() {
    setSavingExp(true); setPnlMsg('')
    const res = await fetch('/api/events/expenses', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_id: eventId, ...expForm, amount: Number(expForm.amount), exchange_rate: Number(expForm.exchange_rate), category_id: expForm.category_id || null }),
    })
    const data = await res.json()
    if (res.ok) { setShowExpForm(false); setExpForm({ category_id: '', description: '', amount: '', expense_currency: 'USD', exchange_rate: '1', expense_date: '', receipt_ref: '', notes: '' }); fetchPnlData() }
    else { setPnlMsg(data.error ?? 'Failed to save expense.') }
    setSavingExp(false)
  }

  async function deleteExpense(id: string) {
    await fetch(`/api/events/expenses?id=${id}`, { method: 'DELETE' })
    fetchPnlData()
  }

  async function fetchFinanceLogs() {
    const res  = await fetch(`/api/finance/work-logs?event_id=${eventId}`)
    const data = await res.json().catch(() => [])
    setFinLogs(Array.isArray(data) ? data : [])
  }

  async function saveFinLog() {
    setSavingFin(true); setPnlMsg('')
    const res = await fetch('/api/finance/work-logs', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_id: eventId, hours: Number(finForm.hours), description: finForm.description, log_date: finForm.log_date }),
    })
    const data = await res.json()
    if (res.ok) {
      setShowFinForm(false)
      setFinForm({ hours: '', description: '', log_date: new Date().toISOString().slice(0, 10) })
      fetchFinanceLogs(); fetchPnlData()
    } else { setPnlMsg(data.error ?? 'Failed to log hours.') }
    setSavingFin(false)
  }

  async function deleteFinLog(id: string) {
    await fetch(`/api/finance/work-logs?id=${id}`, { method: 'DELETE' })
    fetchFinanceLogs(); fetchPnlData()
  }

  async function saveDelegate() {
    setSavingDel(true); setPnlMsg('')
    const res = await fetch('/api/events/delegates', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_id: eventId, ...delForm }),
    })
    const data = await res.json()
    if (res.ok) { setShowDelForm(false); setDelForm({ full_name: '', company: '', job_title: '', industry: '', seniority_tier: 'other', status: 'pending', invite_date: '', notes: '' }); fetchPnlData() }
    else { setPnlMsg(data.error ?? 'Failed to save delegate.') }
    setSavingDel(false)
  }

  async function updateDelegateStatus(id: string, status: string) {
    await fetch('/api/events/delegates', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, status }) })
    fetchPnlData()
  }

  async function deleteDelegate(id: string) {
    await fetch(`/api/events/delegates?id=${id}`, { method: 'DELETE' })
    fetchPnlData()
  }

  async function fetchComments(docId: string) {
    const res  = await fetch(`/api/documents/comments?document_id=${docId}`)
    const data = await res.json().catch(() => [])
    setComments(Array.isArray(data) ? data : [])
  }

  async function generateReport() {
    setReportBusy(true)
    setMsg('')
    const res  = await fetch('/api/documents/generate-report', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ event_id: eventId }),
    })
    const data = await res.json()
    if (res.ok) {
      setReport(data)
      setComments([])
      setMsg('Draft report generated. Review it, add comments, then conclude when ready.')
    } else {
      setMsg(data.error ?? 'Failed to generate report.')
    }
    setReportBusy(false)
  }

  async function addComment() {
    if (!commentText.trim() || !report) return
    setCommentSaving(true)
    await fetch('/api/documents/comments', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ document_id: report.id, comment: commentText.trim() }),
    })
    setCommentText('')
    fetchComments(report.id)
    setCommentSaving(false)
  }

  async function resolveComment(id: string, resolved: boolean) {
    await fetch(`/api/documents/comments?id=${id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ resolved }),
    })
    fetchComments(report!.id)
  }

  async function deleteComment(id: string) {
    await fetch(`/api/documents/comments?id=${id}`, { method: 'DELETE' })
    fetchComments(report!.id)
  }

  async function concludeReport() {
    if (!report) return
    setReportBusy(true)
    const res  = await fetch(`/api/documents/generate-report?id=${report.id}`, { method: 'PATCH' })
    const data = await res.json()
    if (res.ok) {
      setReport(data)
      setMsg('Report concluded. It is now live in the knowledge base — Pilot can answer questions from it.')
    } else {
      setMsg(data.error ?? 'Failed to conclude report.')
    }
    setReportBusy(false)
  }

  async function generateChecklist() {
    setGenerating(true)
    setMsg('')
    const res  = await fetch('/api/events/checklist', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ event_id: eventId, generate: true, regenerate: checklist.length > 0 }),
    })
    const data = await res.json()
    if (res.ok) {
      setMsg(`Checklist generated — ${data.count} items across departments.`)
      fetchAll()
    } else {
      setMsg(data.error ?? 'Failed to generate checklist.')
    }
    setGenerating(false)
  }

  async function updateItem(id: string, patch: Partial<ChecklistItem>) {
    await fetch(`/api/events/checklist?id=${id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(patch),
    })
    fetchAll()
  }

  async function deleteItem(id: string) {
    await fetch(`/api/events/checklist?id=${id}`, { method: 'DELETE' })
    fetchAll()
  }

  async function addItem(department: string) {
    if (!newItemTitle.trim()) return
    await fetch('/api/events/checklist', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ event_id: eventId, department, title: newItemTitle.trim() }),
    })
    setNewItemTitle('')
    setAddingDept(null)
    fetchAll()
  }

  function saveEdit(id: string) {
    updateItem(id, editDraft)
    setEditingId(null)
    setEditDraft({})
  }

  // Group by department
  const byDept = checklist.reduce<Record<string, ChecklistItem[]>>((acc, item) => {
    if (!acc[item.department]) acc[item.department] = []
    acc[item.department].push(item)
    return acc
  }, {})

  // Stats
  const total   = checklist.length
  const done    = checklist.filter(i => i.status === 'done').length
  const overdue = checklist.filter(i => i.status === 'overdue' || (i.due_date && new Date(i.due_date) < new Date() && i.status !== 'done')).length
  const inProg  = checklist.filter(i => i.status === 'in_progress').length
  const pct     = total > 0 ? Math.round((done / total) * 100) : 0

  if (loading) return (
    <div style={{ fontFamily: 'var(--font-manrope), Manrope, sans-serif', background: 'var(--surface)', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: 'var(--ink)', fontSize: '13px' }}>Loading event workspace…</div>
    </div>
  )

  if (!event) return (
    <div style={{ fontFamily: 'var(--font-manrope), Manrope, sans-serif', background: 'var(--surface)', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: 'var(--red)', fontSize: '13px' }}>Event not found.</div>
    </div>
  )

  // Per-event feature toggles (2026-09-27) — see app/lib/registry/feature-flags.ts.
  const storedFeatures = (event.enabled_features ?? {}) as Record<string, boolean>
  const enabledFeatures = new Set<FeatureKey>(
    FEATURE_REGISTRY.filter(f => storedFeatures[f.key] ?? f.defaultForNewEvent({ country: event.country })).map(f => f.key)
  )

  const moduleCards = visibleCards(MODULE_CARDS(eventId), toolKeys, enabledFeatures)
  const settingsCards = visibleCards(SETTINGS_CARDS(eventId), toolKeys, enabledFeatures)

  return (
    <div style={{ fontFamily: 'var(--font-manrope), Manrope, sans-serif', background: 'var(--surface)', minHeight: '100vh', color: 'var(--ink)' }}>

      <div style={{ maxWidth: '1460px', margin: '0 auto', padding: '40px 32px', display: 'flex', gap: '32px', alignItems: 'flex-start' }}>
        <WorkspaceLeftNav eventId={eventId} modules={moduleCards} settings={settingsCards} />

      <div style={{ flex: 1, minWidth: 0, maxWidth: '1200px' }}>

        {/* Event header */}
        <div style={{ marginBottom: '32px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '24px', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                <div style={{ fontSize: '13px', fontWeight: 800, letterSpacing: '2px', textTransform: 'uppercase', color: 'var(--teal)' }}>Event Workspace</div>
                <div style={{ fontSize: '13px', fontWeight: 700, padding: '2px 10px', borderRadius: '16px', background: event.status === 'active' ? 'rgba(192,244,60,0.15)' : 'var(--card)', color: event.status === 'active' ? 'var(--teal)' : 'var(--ink2)' }}>
                  {event.status}
                </div>
                <button onClick={() => setEditing(e => !e)}
                  style={{ marginLeft: '4px', padding: '3px 10px', borderRadius: '8px', border: '1px solid var(--border)', background: editing ? 'var(--surface)' : 'var(--card)', color: editing ? 'var(--lime)' : 'var(--ink3)', fontSize: '11px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                  {editing ? 'Cancel' : 'Edit'}
                </button>
                {/* 2026-08-16 fix — this per-event Access page (roles +
                    assignments) existed since Phase 1 of the RBAC
                    redesign but had no entry point from the workspace
                    itself, only reachable via direct URL. Madhu couldn't
                    find it from here, confirming the gap. */}
                <Link href={`/admin/events/${eventId}/access`}
                  style={{ padding: '3px 10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--ink3)', fontSize: '11px', fontWeight: 700, textDecoration: 'none', fontFamily: 'inherit' }}>
                  Access →
                </Link>
                {/* 2026-09-05 — KonfHub config used to live only inside
                    Website Builder's Content tab (3 of its fields had no
                    UI at all, SQL-only); this is its new home, same
                    "workspace couldn't find it" gap Access → above notes. */}
                <Link href={`/admin/events/${eventId}/integrations`}
                  style={{ padding: '3px 10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--ink3)', fontSize: '11px', fontWeight: 700, textDecoration: 'none', fontFamily: 'inherit' }}>
                  Integrations →
                </Link>
              </div>

              {!editing ? (
                <>
                  <h1 style={{ fontSize: '36px', fontWeight: 900, color: 'var(--ink)', margin: '0 0 6px', letterSpacing: '-0.5px' }}>{event.name}</h1>
                  {event.public_name && event.public_name !== event.name && (
                    <div style={{ fontSize: '12.5px', color: 'var(--teal-mid)', margin: '-2px 0 8px' }}>Public name: {event.public_name}</div>
                  )}
                  <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
                    {event.city && <span style={{ fontSize: '13px', color: 'var(--ink2)' }}>{event.city}</span>}
                    {event.event_date && <span style={{ fontSize: '13px', color: 'var(--ink2)' }}>{new Date(event.event_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</span>}
                    {event.venue && <span style={{ fontSize: '13px', color: 'var(--ink2)' }}>{event.venue}</span>}
                    {event.client_name && <span style={{ fontSize: '13px', color: 'var(--ink2)' }}>{event.client_name}</span>}
                    {event.expected_attendance && <span style={{ fontSize: '13px', color: 'var(--ink2)' }}>{event.expected_attendance.toLocaleString()} expected</span>}
                  </div>
                </>
              ) : (
                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px', padding: '20px', marginTop: '4px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div style={{ gridColumn: '1/-1' }}>
                      <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink3)', display: 'block', marginBottom: '4px' }}>EVENT NAME</label>
                      <input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                        style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '15px', fontWeight: 700, fontFamily: 'inherit', color: 'var(--ink)', boxSizing: 'border-box' }} />
                    </div>
                    {([
                      ['STATUS', 'status', null, ['planning','upcoming','active','completed','cancelled']],
                      ['TYPE',   'type',   null, ['conference','summit','forum','awards','workshop','flagship','managed','bespoke','corporate','other']],
                      ['START DATE', 'event_date', 'date', null],
                      ['END DATE',   'end_date',   'date', null],
                      ['VENUE',  'venue',  null, null],
                      ['CITY',   'city',   null, null],
                      ['CLIENT', 'client_name', null, null],
                      ['EXPECTED ATTENDANCE', 'expected_attendance', 'number', null],
                    ] as [string, string, string | null, string[] | null][]).map(([label, key, type, opts]) => (
                      <div key={key}>
                        <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink3)', display: 'block', marginBottom: '4px' }}>{label}</label>
                        {opts ? (
                          <select value={editForm[key as keyof typeof editForm]} onChange={e => setEditForm(f => ({ ...f, [key]: e.target.value }))}
                            style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px', fontFamily: 'inherit', color: 'var(--ink)' }}>
                            {opts.map(o => <option key={o} value={o}>{o}</option>)}
                          </select>
                        ) : (
                          <input type={type ?? 'text'} value={editForm[key as keyof typeof editForm]} onChange={e => setEditForm(f => ({ ...f, [key]: e.target.value }))}
                            style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px', fontFamily: 'inherit', color: 'var(--ink)', boxSizing: 'border-box' }} />
                        )}
                      </div>
                    ))}
                    <div style={{ gridColumn: '1/-1' }}>
                      <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink3)', display: 'block', marginBottom: '4px' }}>DESCRIPTION</label>
                      <textarea value={editForm.description} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} rows={3}
                        style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px', fontFamily: 'inherit', color: 'var(--ink)', resize: 'vertical', boxSizing: 'border-box' }} />
                    </div>
                  </div>

                  {/* ── Digital Presence — event_format/country stay here (internal
                      classification); public_name/dates/venue/website/registration/
                      hashtag/socials/venue_map_url moved to the Event Details page
                      (2026-08-11), which also owns the Topline Messaging Doc and a
                      change history for those fields. */}
                  <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '0.8px', color: 'var(--teal-mid)', margin: '20px 0 10px', textTransform: 'uppercase' }}>Digital Presence</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    {([
                      ['EVENT FORMAT', 'event_format', ['physical', 'virtual', 'hybrid']],
                      ['COUNTRY', 'country', null],
                    ] as [string, string, string[] | null][]).map(([label, key, opts]) => (
                      <div key={key}>
                        <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink3)', display: 'block', marginBottom: '4px' }}>{label}</label>
                        {opts ? (
                          <select value={editForm[key as keyof typeof editForm]} onChange={e => setEditForm(f => ({ ...f, [key]: e.target.value }))}
                            style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px', fontFamily: 'inherit', color: 'var(--ink)' }}>
                            <option value="">—</option>
                            {opts.map(o => <option key={o} value={o}>{o}</option>)}
                          </select>
                        ) : (
                          <input type="text" value={editForm[key as keyof typeof editForm]} onChange={e => setEditForm(f => ({ ...f, [key]: e.target.value }))}
                            style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px', fontFamily: 'inherit', color: 'var(--ink)', boxSizing: 'border-box' }} />
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Social Publishing / Postiz — moved to the Integrations
                      page (2026-09-06): Customer ID is now fetch-and-select
                      only (Postiz "groups", confirmed live against a real
                      account — no way to type one in, and picking a group
                      pre-fetches its channels), and whatever's selected
                      there is now enforced as the ONLY channel set the
                      announcement composer can pick from (previously this
                      was cosmetic, see AnnouncementDetailPanel.tsx's
                      selectablePostizChannels). Kept as a pointer rather
                      than duplicating the fields, same reasoning as
                      KonfHub's own move. */}
                  <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '0.8px', color: 'var(--teal-mid)', margin: '20px 0 10px', textTransform: 'uppercase' }}>Social Publishing</div>
                  <div style={{ fontSize: '12.5px', color: 'var(--ink3)', marginBottom: '10px' }}>
                    Postiz group and channel selection now live on this event&apos;s Integrations page.
                  </div>
                  <Link href={`/admin/events/${eventId}/integrations`}
                    style={{ display: 'inline-block', padding: '8px 14px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--ink2)', fontSize: '12.5px', fontWeight: 700, textDecoration: 'none' }}>
                    Open Integrations →
                  </Link>

                  {/* Client Approval Contact(s) — moved to the Integrations
                      page (2026-09-06), now a real multi-person list
                      (primary gates publishing, others are CC'd with their
                      own tracked status) rather than this single name/job
                      title/email. The "Open Integrations →" link above
                      covers this too, same as KonfHub/Postiz's own moves. */}

                  {/* ── Creative Templates (Sharp compositing, PRD v1.4 Phase C v3) ──
                      Owns its own save path (PUT /api/events/templates/variants) via
                      a dedicated layer editor — deliberately not duplicated into this
                      form's PATCH, so editing one never risks clobbering the other. */}
                  <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '0.8px', color: 'var(--teal-mid)', margin: '20px 0 10px', textTransform: 'uppercase' }}>Stakeholder Announcement Engine</div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderRadius: '10px', border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: '12.5px', color: 'var(--ink2)' }}>Layer-based editor for speaker/partner announcement creatives — backgrounds, photo/logo placement, and text, in any stacking order.</div>
                    <Link href={`/admin/events/${eventId}/creative-templates`} style={{ padding: '7px 14px', borderRadius: '8px', border: '1.5px solid var(--border)', color: 'var(--ink2)', fontSize: '12px', fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0 }}>
                      Open →
                    </Link>
                  </div>

                  <div style={{ display: 'flex', gap: '8px', marginTop: '14px' }}>
                    <button onClick={saveEventEdit} disabled={savingEdit || !editForm.name}
                      style={{ padding: '10px 22px', borderRadius: '8px', border: 'none', background: 'var(--lime)', color: 'var(--lime-dark)', fontSize: '13px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', opacity: savingEdit ? 0.6 : 1 }}>
                      {savingEdit ? 'Saving…' : 'Save Changes'}
                    </button>
                    <button onClick={() => setEditing(false)}
                      style={{ padding: '10px 16px', borderRadius: '8px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--ink3)', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit' }}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Generate checklist button */}
            {!editing && (
              <button
                onClick={generateChecklist}
                disabled={generating}
                style={{ padding: '14px 26px', borderRadius: '12px', border: 'none', background: generating ? 'var(--card-hi)' : 'var(--lime)', color: generating ? 'var(--ink3)' : 'var(--lime-dark)', fontSize: '13px', fontWeight: 800, cursor: generating ? 'not-allowed' : 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '8px', whiteSpace: 'nowrap', flexShrink: 0 }}>
                <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                {generating ? 'AI generating checklist…' : checklist.length > 0 ? 'Regenerate Checklist' : 'Generate Checklist with AI'}
              </button>
            )}
          </div>

          {msg && (
            <div style={{ marginTop: '16px', padding: '10px 16px', borderRadius: '10px', background: msg.includes('generated') || msg.includes('Generated') ? 'rgba(192,244,60,0.08)' : 'rgba(241,102,122,0.08)', border: `1px solid ${msg.includes('generated') || msg.includes('Generated') ? 'rgba(192,244,60,0.25)' : 'rgba(241,102,122,0.25)'}`, color: msg.includes('generated') || msg.includes('Generated') ? 'var(--teal)' : 'var(--red)', fontSize: '13px' }}>
              {msg}
            </div>
          )}
        </div>

        {/* Event Details — Common Details (public name/dates/venue/links/
            socials, per-form-type onboarding page links, a change history)
            plus the Topline Messaging Doc, one destination since 2026-08-11
            (previously two separate cards/pages for these). Moved above
            the Event Lifecycle flow 2026-08-16 per Madhu — it's a
            top-level item, not a sub-step of the phase flow. */}
        <div style={{ marginBottom: '16px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '16px', padding: '18px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
            <div>
              <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--teal-mid)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '4px' }}>Event Details</div>
              {messagingDoc ? (
                <div style={{ fontSize: '12px', color: 'var(--ink3)' }}>
                  Messaging doc v{messagingDoc.version} · Last updated: {new Date(messagingDoc.updated_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                </div>
              ) : (
                <div style={{ fontSize: '12px', color: 'var(--ink3)' }}>No messaging doc uploaded yet — public name, dates, venue, links, and more, all in one place.</div>
              )}
            </div>
            <Link href={`/admin/events/${eventId}/details`} style={{ textDecoration: 'none', padding: '7px 14px', borderRadius: '8px', border: 'none', background: 'var(--lime)', color: 'var(--lime-dark)', fontSize: '12px', fontWeight: 800, fontFamily: 'inherit', display: 'flex', alignItems: 'center' }}>
              Edit Event Details →
            </Link>
          </div>
        </div>

        <CardGrid title="Modules" cards={moduleCards} />
        <CardGrid title="Settings" id="settings" cards={settingsCards} />

      </div>

      {/* ── SOCIAL ACCOUNTS TAB ── */}
      {pnlTab === 'social' && (
        <div style={{ padding: '24px 28px' }}>
          <div style={{ marginBottom: '24px' }}>
            {/* #0A66C2 (LinkedIn blue) only measured 2.81:1 as plain text on --card; brightened via HSL-lightness bump to clear 4.5:1 (actual 4.67:1) */}
            <div style={{ fontSize: '13px', fontWeight: 800, letterSpacing: '2px', textTransform: 'uppercase', color: '#258CF4', marginBottom: '4px' }}>Social Accounts</div>
            <div style={{ fontSize: '14px', color: 'var(--ink3)' }}>Connect the social media pages for this event. Paste the page URL and access token once — used for all publishing.</div>
          </div>

          {/* Connected accounts */}
          {socialLoading ? (
            <div style={{ padding: '32px', textAlign: 'center', color: 'var(--ink3)', fontSize: '13px' }}>Loading…</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '28px' }}>
              {(['Facebook', 'Instagram', 'LinkedIn'] as const).map(platform => {
                const acc = socialAccounts.find(a => a.platform === platform)
                // Real-world platform brand colors — kept literal (industry-standard icon/button
                // colors, not part of our teal/lime/etc. token families) and used at runtime with
                // concatenated alpha suffixes (`color + '30'`, `${color}15`) which var() can't do.
                const colors: Record<string, string> = { Facebook: '#1877F2', Instagram: '#E1306C', LinkedIn: '#0A66C2' }
                const color = colors[platform]
                return (
                  <div key={platform} style={{ background: 'var(--card)', border: `1px solid ${acc ? color + '30' : 'var(--border)'}`, borderRadius: '14px', padding: '18px 20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: acc ? '12px' : '0' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: `${color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <svg width="16" height="16" fill={color} viewBox="0 0 24 24">
                            {platform === 'Facebook' && <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/>}
                            {platform === 'Instagram' && <><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" fill="white"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5" stroke="white" strokeWidth="2"/></>}
                            {platform === 'LinkedIn' && <><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/></>}
                          </svg>
                        </div>
                        <div>
                          <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--ink)' }}>{platform}</div>
                          {acc?.page_name && <div style={{ fontSize: '11px', color: 'var(--ink3)' }}>{acc.page_name}</div>}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {acc ? (
                          <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--lime)', background: 'rgba(192,244,60,0.12)', padding: '3px 10px', borderRadius: '8px' }}>Connected</span>
                        ) : (
                          <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink3)', background: 'var(--border-light)', padding: '3px 10px', borderRadius: '8px' }}>Not connected</span>
                        )}
                        {acc && (
                          <button onClick={async () => {
                            await fetch(`/api/events/social-accounts?id=${acc.id}`, { method: 'DELETE' })
                            setSocialAccounts(prev => prev.filter(a => a.id !== acc.id))
                          }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', fontSize: '11px', fontWeight: 700, padding: '3px 8px', borderRadius: '6px' }}>
                            Remove
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Inline form — always shown for quick edit */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '10px', fontWeight: 700, color: 'var(--ink3)', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '4px' }}>Page Name</label>
                        <input defaultValue={acc?.page_name ?? ''} id={`${platform}-name`}
                          placeholder="e.g. World AI Show Dubai"
                          style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px', fontFamily: 'inherit', color: 'var(--ink)', boxSizing: 'border-box' }} />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '10px', fontWeight: 700, color: 'var(--ink3)', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '4px' }}>Page URL</label>
                        <input defaultValue={acc?.page_url ?? ''} id={`${platform}-url`}
                          placeholder="https://facebook.com/worldaishow"
                          style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px', fontFamily: 'inherit', color: 'var(--ink)', boxSizing: 'border-box' }} />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '10px', fontWeight: 700, color: 'var(--ink3)', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '4px' }}>Page ID</label>
                        <input defaultValue={acc?.page_id ?? ''} id={`${platform}-id`}
                          placeholder="Numeric page ID"
                          style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px', fontFamily: 'inherit', color: 'var(--ink)', boxSizing: 'border-box' }} />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '10px', fontWeight: 700, color: 'var(--ink3)', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '4px' }}>
                          Access Token <span style={{ color: 'var(--ink4)', fontWeight: 500 }}>(paste from Meta/LinkedIn)</span>
                        </label>
                        <input defaultValue={acc?.access_token ?? ''} id={`${platform}-token`}
                          type="password"
                          placeholder={acc ? '••••••••' : 'Paste token here — or type DUMMY to test'}
                          style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px', fontFamily: 'inherit', color: 'var(--ink)', boxSizing: 'border-box' }} />
                      </div>
                    </div>
                    <button
                      onClick={async () => {
                        const name  = (document.getElementById(`${platform}-name`)  as HTMLInputElement).value
                        const url   = (document.getElementById(`${platform}-url`)   as HTMLInputElement).value
                        const pid   = (document.getElementById(`${platform}-id`)    as HTMLInputElement).value
                        const token = (document.getElementById(`${platform}-token`) as HTMLInputElement).value
                        if (!token) return
                        setSocialSaving(true)
                        const res  = await fetch('/api/events/social-accounts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event_id: eventId, platform, page_name: name, page_url: url, page_id: pid, access_token: token }) })
                        const data = await res.json()
                        if (res.ok) setSocialAccounts(prev => { const next = prev.filter(a => a.platform !== platform); return [...next, data] })
                        setSocialSaving(false)
                        setSocialMsg(res.ok ? `${platform} saved.` : data.error ?? 'Error')
                        setTimeout(() => setSocialMsg(''), 3000)
                      }}
                      // White text on a solid brand-platform button is the industry-standard
                      // treatment for Facebook/Instagram/LinkedIn buttons — exempted from the
                      // family-token text rule since these aren't our design-system colors.
                      style={{ marginTop: '10px', padding: '8px 18px', borderRadius: '8px', background: color, color: '#FFFFFF', fontSize: '12px', fontWeight: 800, border: 'none', cursor: 'pointer', fontFamily: 'inherit', opacity: socialSaving ? 0.7 : 1 }}>
                      {socialSaving ? 'Saving…' : `Save ${platform}`}
                    </button>
                  </div>
                )
              })}
            </div>
          )}

          {socialMsg && <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'rgba(192,244,60,0.08)', border: '1px solid rgba(192,244,60,0.2)', color: 'var(--lime)', fontSize: '13px', fontWeight: 600 }}>{socialMsg}</div>}

          <div style={{ marginTop: '20px', padding: '14px 16px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', fontSize: '12px', color: 'var(--ink3)', lineHeight: 1.65 }}>
            <strong style={{ color: 'var(--ink)' }}>Where to get your access token:</strong><br />
            <strong>Facebook / Instagram:</strong> Meta Business Manager → Settings → Page Access Tokens<br />
            <strong>LinkedIn:</strong> LinkedIn Developer Portal → Your App → Auth → OAuth Tokens<br />
            Type <code style={{ background: 'var(--border-light)', padding: '1px 5px', borderRadius: '4px' }}>DUMMY</code> in the token field to test publishing in simulation mode.
          </div>
        </div>
      )}

      {/* ── CONTENT CAMPAIGNS TAB ── */}
      {pnlTab === 'content' && (
        <div style={{ padding: '24px 28px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 800, letterSpacing: '2px', textTransform: 'uppercase', color: 'var(--purple)', marginBottom: '4px' }}>Content Campaigns</div>
              <div style={{ fontSize: '14px', color: 'var(--ink3)' }}>All social media campaigns linked to this event.</div>
            </div>
            <a href={`/content?event_id=${eventId}`}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '9px 18px', borderRadius: '10px', background: 'var(--purple)', color: 'var(--purple-light)', fontSize: '13px', fontWeight: 800, textDecoration: 'none' }}>
              + New Campaign
            </a>
          </div>

          {contentLoading ? (
            <div style={{ padding: '32px', textAlign: 'center', color: 'var(--ink3)', fontSize: '13px' }}>Loading…</div>
          ) : contentCampaigns.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px' }}>
              <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--ink)', marginBottom: '8px' }}>No campaigns yet</div>
              <div style={{ fontSize: '13px', color: 'var(--ink3)', marginBottom: '20px' }}>Create your first campaign for this event.</div>
              <a href={`/content?event_id=${eventId}`} style={{ display: 'inline-block', padding: '10px 24px', borderRadius: '10px', background: 'var(--purple)', color: 'var(--purple-light)', fontSize: '13px', fontWeight: 800, textDecoration: 'none' }}>
                Create Campaign
              </a>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {contentCampaigns.map((c: ContentCampaign) => {
                // Kept literal (not var()) — these get concatenated with a runtime alpha suffix
                // (`${PHASE_COLOR[...]}15` below), which CSS custom properties can't do. Values are
                // the dark-theme equivalents of var(--purple)/var(--lime)/var(--teal)/var(--amber).
                const PHASE_COLOR: Record<string, string> = { pre_event: '#A78BFA', live_week: '#C0F43C', post_event: '#0EA79D', always_on: '#F5B94D' }
                const PHASE_LABEL: Record<string, string> = { pre_event: 'Pre-Event', live_week: 'Live Week', post_event: 'Post-Event', always_on: 'Always On' }
                const postCount = c.content_posts?.[0]?.count ?? 0
                return (
                  <a key={c.id} href={`/content/campaigns/${c.id}`}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px', textDecoration: 'none', gap: '12px' }}>
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--ink)', marginBottom: '4px' }}>{c.name}</div>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '11px', fontWeight: 700, color: PHASE_COLOR[c.phase] ?? '#7E93A1', background: `${PHASE_COLOR[c.phase] ?? '#7E93A1'}15`, padding: '2px 8px', borderRadius: '6px' }}>{PHASE_LABEL[c.phase] ?? c.phase}</span>
                        <span style={{ fontSize: '11px', color: 'var(--ink3)' }}>{postCount} posts</span>
                        {c.platforms?.map((p: string) => <span key={p} style={{ fontSize: '11px', color: 'var(--ink3)', background: 'var(--border-light)', padding: '2px 7px', borderRadius: '5px' }}>{p}</span>)}
                      </div>
                    </div>
                    <svg width="14" height="14" fill="none" stroke="var(--purple)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>
                  </a>
                )
              })}
            </div>
          )}
        </div>
      )}

      <style>{`
        input[type="date"]::-webkit-calendar-picker-indicator { filter: invert(0.5); }
        * { box-sizing: border-box; }
      `}</style>
      </div>
    </div>
  )
}
