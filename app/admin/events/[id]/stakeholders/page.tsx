'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import PageHeader from '@/app/components/PageHeader'
import { permissionSetSatisfies } from '@/app/lib/access/permission-match'
import { Button, Card, Badge, Input, Select, ProcessingOverlay } from '@/app/components/ui'
import { FormFieldInput } from '@/app/components/forms/FormFieldInput'
import { downloadFilesAsZip } from '@/app/lib/download-file'
import CalendarView from './CalendarView'
import DeletedTab from './DeletedTab'
import DeleteConfirmModal from './DeleteConfirmModal'
import InvitesTab from './InvitesTab'
import { FieldSchema, SubmittedValue, asText } from '@/app/lib/forms/types'
import { useBreadcrumbLabel } from '@/app/lib/nav/breadcrumb-labels'

type Speaker = {
  id: string; event_id: string
  full_name: string; job_title: string; company_name: string
  country: string | null; bio: string | null; linkedin_url: string | null
  photo_url: string | null; photo_processed_url: string | null; company_logo_url: string | null
  photo_head_box: { centerXRatio: number; centerYRatio: number; heightRatio: number } | null
  announcement_status: 'pending_review' | 'approved' | 'assets_missing' | 'ready' | 'archived'
  source: 'onboarding_form' | 'manual'
  notes: string | null; created_at: string
  custom_fields: Record<string, SubmittedValue> | null
  // Roster status columns (2026-08-18, SAE-into-Hub merge) — computed
  // server-side in GET .../speakers, see that route's own doc comment.
  has_announcement: boolean; self_promo_sent: boolean
}

type Partner = {
  id: string; event_id: string
  company_name: string; company_website: string | null; company_description: string | null
  partner_type: string
  logo_url: string | null; logo_raw_url: string | null
  announcement_status: 'pending_review' | 'approved' | 'assets_missing' | 'ready' | 'archived'
  source: 'onboarding_form' | 'manual'
  notes: string | null; created_at: string
  custom_fields: Record<string, SubmittedValue> | null
  // Self Promo is speaker-only — always false here, kept for a uniform
  // shape with Speaker (see partners GET route's own doc comment).
  has_announcement: boolean; self_promo_sent: boolean
}

type Submission = {
  id: string; event_id: string; form_type: string
  submitted_data: Record<string, SubmittedValue>
  file_urls: { photo?: string; company_logo?: string; logo?: string } | null
  status: string; submitted_at: string
}

type CategoryKind = 'speaker' | 'partner'
type Category = {
  key: string; label: string; kind: CategoryKind
  partnerTypes?: string[]  // undefined = all partner types
  formType?: string        // if set, this category has a form-submission inbox
}

const CATEGORIES: Category[] = [
  { key: 'speakers', label: 'Speakers', kind: 'speaker', formType: 'speaker' },
  { key: 'sponsors', label: 'Sponsors', kind: 'partner', formType: 'sponsor',
    partnerTypes: ['headline_sponsor', 'platinum_sponsor', 'gold_sponsor', 'silver_sponsor', 'bronze_sponsor', 'sponsor'] },
  { key: 'exhibitors', label: 'Exhibitors', kind: 'partner', partnerTypes: ['exhibitor'] },
  { key: 'media_partners', label: 'Media Partners', kind: 'partner', formType: 'media_partner', partnerTypes: ['media_partner'] },
  { key: 'association_partners', label: 'Association Partners', kind: 'partner', formType: 'association_partner', partnerTypes: ['association_partner'] },
  { key: 'ecosystem_partners', label: 'Ecosystem Partners', kind: 'partner',
    partnerTypes: ['ecosystem_partner', 'knowledge_partner', 'official_partner', 'supporting_partner'] },
  { key: 'all_partners', label: 'All Partners', kind: 'partner' },
]

const DELETED_KEY = 'deleted'
const INVITES_KEY = 'invites'

const STATUS_BADGE: Record<string, { label: string; color: 'amber' | 'red' | 'teal' | 'grey' }> = {
  pending_review: { label: 'Pending Review', color: 'amber' },
  assets_missing: { label: 'Assets Missing', color: 'red' },
  approved:       { label: 'Approved', color: 'teal' },
  ready:          { label: 'Ready', color: 'teal' }, // .tbadge has no lime variant; teal is the closest positive tone
  archived:       { label: 'Archived', color: 'grey' },
}

// Raw submitted_data never has full_name derived yet (that only happens at
// Process time, in mapFieldsToRecord) — fall through first/last name and
// company before giving up, so the inbox row is never blank for a
// perfectly normal submission.
function submissionLabel(s: Submission): string {
  const d = s.submitted_data
  const full = asText(d.full_name)
  if (full) return full
  const first = asText(d.first_name)
  const last = asText(d.last_name)
  const name = [first, last].filter(Boolean).join(' ')
  const company = asText(d.company_name) || asText(d.company)
  if (name && company) return `${name} · ${company}`
  if (name) return name
  if (company) return company
  return asText(d.email) || 'Untitled submission'
}

// One roster status indicator — a small label + a done/not-done dot.
// `comingSoon` (2026-08-18) renders as a low-emphasis stub for "Published"
// — no backing field exists yet (there's no "published to the public
// website" tracking distinct from the general `active` visibility flag),
// so this is a placeholder for a later feature, not a real status.
function StatusColumn({ label, done, comingSoon }: { label: string; done: boolean; comingSoon?: boolean }) {
  return (
    <div style={{ textAlign: 'center', minWidth: '64px' }}>
      <div style={{ fontSize: '9px', fontWeight: 800, letterSpacing: '0.4px', textTransform: 'uppercase', color: 'var(--ink4)', marginBottom: '3px' }}>{label}</div>
      {comingSoon ? (
        <span style={{ fontSize: '11px', color: 'var(--ink4)', fontStyle: 'italic' }}>Soon</span>
      ) : (
        <span style={{ fontSize: '13px', fontWeight: 800, color: done ? 'var(--success)' : 'var(--ink4)' }}>{done ? '✓' : '—'}</span>
      )}
    </div>
  )
}

function matchesSearch(item: Speaker | Partner, kind: CategoryKind, q: string): boolean {
  if (!q) return true
  const haystack = kind === 'speaker'
    ? [(item as Speaker).full_name, (item as Speaker).job_title, (item as Speaker).company_name, (item as Speaker).country, (item as Speaker).bio, (item as Speaker).linkedin_url]
    : [(item as Partner).company_name, (item as Partner).company_website, (item as Partner).company_description, (item as Partner).partner_type]
  return haystack.filter(Boolean).join(' ').toLowerCase().includes(q)
}

export default function StakeholderHubPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = use(params)
  const router = useRouter()

  const [activeTab, setActiveTab] = useState(CATEGORIES[0].key)
  const [viewMode, setViewMode] = useState<'registry' | 'calendar'>('registry')
  const [speakers, setSpeakers] = useState<Speaker[]>([])
  const [partners, setPartners] = useState<Partner[]>([])
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  // The Add/Edit slide-over is now create-only — reviewing/editing an
  // existing stakeholder happens on the full-page screen at
  // stakeholders/[stakeholderId] instead (Process/Edit both redirect there).
  const [panelOpen, setPanelOpen] = useState(false)
  const [values, setValues] = useState<Record<string, SubmittedValue>>({})
  const [partnerType, setPartnerType] = useState('sponsor')
  const [formSchema, setFormSchema] = useState<FieldSchema[]>([])
  const [saving, setSaving] = useState(false)

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [deleteConfirm, setDeleteConfirm] = useState<(Speaker | Partner)[] | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [bulkDownloading, setBulkDownloading] = useState<'photo' | 'logo' | null>(null)
  // processSubmission() had no loading feedback at all before this — it's
  // also the heaviest single action on this page (re-hosts the submitted
  // photo/logo, then runs PhotoRoom + Logo Engine + head detection), so it
  // gets its own tracked id rather than reusing a generic boolean.
  const [processingSubmissionId, setProcessingSubmissionId] = useState<string | null>(null)
  const [permissions, setPermissions] = useState<Set<string>>(new Set())
  const [eventName, setEventName] = useState<string | null>(null)

  const category = CATEGORIES.find(c => c.key === activeTab)
  // '*' = platform admin (getEventPermissions() returns this instead of
  // enumerating every key) — see app/lib/access/event-access.ts.
  const can = (key: string) => permissionSetSatisfies(permissions, key)

  // Breadcrumb trail (GlobalShell) has no way to know this event's real
  // name on its own — see breadcrumb-labels.tsx.
  useBreadcrumbLabel(eventId, eventName)

  async function fetchAll() {
    setLoading(true)
    const [spRes, ptRes, permRes, eventRes] = await Promise.all([
      fetch(`/api/events/stakeholders/speakers?event_id=${eventId}`),
      fetch(`/api/events/stakeholders/partners?event_id=${eventId}`),
      fetch(`/api/events/access/me?event_id=${eventId}`),
      fetch(`/api/events?id=${eventId}`),
    ])
    setSpeakers(await spRes.json().catch(() => []))
    setPartners(await ptRes.json().catch(() => []))
    const permData = await permRes.json().catch(() => ({ permissions: [] }))
    setPermissions(new Set(permData.permissions ?? []))
    const eventData = await eventRes.json().catch(() => null)
    setEventName(eventData?.name ?? null)
    setLoading(false)
  }

  async function fetchSubmissions(formType: string) {
    const res = await fetch(`/api/events/stakeholders/submissions?event_id=${eventId}&form_type=${formType}`)
    setSubmissions(await res.json().catch(() => []))
  }

  async function fetchFormSchema(formType: string) {
    const res = await fetch(`/api/events/stakeholders/forms/${formType}/schema?event_id=${eventId}`)
    const data = await res.json().catch(() => ({ fields: [] }))
    setFormSchema(data.fields ?? [])
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-mount; matches app/admin/events/[id]/page.tsx's fetchAll effect
  useEffect(() => { fetchAll() }, [eventId])
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- same fetch-on-dependency-change pattern as the effect above
    if (category?.formType) fetchSubmissions(category.formType)
    else setSubmissions([])
  }, [eventId, category?.formType])
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch the resolved schema for whichever form this category maps to (fallback 'sponsor' for categories with no dedicated form) — used by the manual Add/Edit panel below
    if (category) fetchFormSchema(category.kind === 'speaker' ? 'speaker' : (category.formType ?? 'sponsor'))
  }, [eventId, category?.key])
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset per-tab UI state (selection, search) on tab switch, not a fetch side effect
    setSelectedIds(new Set())
    setSearch('')
  }, [activeTab])

  const visiblePartners = category ? partners.filter(p => !category.partnerTypes || category.partnerTypes.includes(p.partner_type)) : []

  function openAdd() {
    setValues({})
    setPartnerType('sponsor')
    setPanelOpen(true)
  }

  function reviewUrl(item: Speaker | Partner) {
    if (!category) return '#'
    const formType = category.kind === 'speaker' ? 'speaker' : (category.formType ?? 'sponsor')
    return `/admin/events/${eventId}/stakeholders/${item.id}?kind=${category.kind}&formType=${formType}`
  }

  async function save() {
    if (!category) return
    setSaving(true)
    const base = category.kind === 'speaker' ? '/api/events/stakeholders/speakers' : '/api/events/stakeholders/partners'
    const body = category.kind === 'speaker'
      ? { event_id: eventId, fields: values }
      : { event_id: eventId, fields: values, partner_type: partnerType, form_type: category.formType ?? 'sponsor' }

    const res = await fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    if (res.ok) {
      const created = await res.json()
      setPanelOpen(false)
      const formType = category.kind === 'speaker' ? 'speaker' : (category.formType ?? 'sponsor')
      router.push(`/admin/events/${eventId}/stakeholders/${created.id}?kind=${category.kind}&formType=${formType}`)
    } else {
      setMsg('Save failed — check required fields.')
    }
    setSaving(false)
  }

  // Bulk download (2026-08-04, per Madhu: "when multiple speakers are
  // selected, a button each should show on top to download photos and one
  // for logos... bulk (more than one) should download as a zip file") —
  // speaker-only (photo_url/company_logo_url are Speaker-only fields), so
  // these two buttons only render for the Speakers category, not Partners.
  // Silently skips any selected speaker who doesn't have that asset rather
  // than failing the whole batch over it.
  async function bulkDownloadAssets(kind: 'photo' | 'logo') {
    const selected = visibleItems.filter(i => selectedIds.has(i.id)) as Speaker[]
    const files = selected
      .map(s => {
        if (kind === 'photo') {
          const url = s.photo_processed_url || s.photo_url
          if (!url) return null
          return { url, filename: `${s.full_name.replace(/\s+/g, '-')}-photo.${s.photo_processed_url ? 'png' : 'jpg'}` }
        }
        if (!s.company_logo_url) return null
        return { url: s.company_logo_url, filename: `${s.full_name.replace(/\s+/g, '-')}-logo.png` }
      })
      .filter((f): f is { url: string; filename: string } => f !== null)

    if (files.length === 0) {
      setMsg(`None of the ${selected.length} selected speakers have a ${kind === 'photo' ? 'photo' : 'company logo'} uploaded.`)
      return
    }

    setBulkDownloading(kind)
    setMsg(null)
    try {
      await downloadFilesAsZip(files, `speaker-${kind}s-${Date.now()}.zip`)
    } catch (e) {
      setMsg(`Could not prepare download: ${(e as Error).message}`)
    }
    setBulkDownloading(null)
  }

  async function processSubmission(submission: Submission) {
    if (!category) return
    setProcessingSubmissionId(submission.id)
    const base = category.kind === 'speaker' ? '/api/events/stakeholders/speakers/from-submission' : '/api/events/stakeholders/partners/from-submission'
    const res = await fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ submission_id: submission.id, event_id: eventId }) })
    if (res.ok) {
      const created = await res.json()
      const formType = category.kind === 'speaker' ? 'speaker' : (category.formType ?? 'sponsor')
      router.push(`/admin/events/${eventId}/stakeholders/${created.id}?kind=${category.kind}&formType=${formType}`)
      // Deliberately not clearing processingSubmissionId here — the overlay
      // stays up through the router.push() navigation itself, rather than
      // dropping for a beat right before the new page's own loading state
      // takes over.
    } else {
      setProcessingSubmissionId(null)
      setMsg('Could not process this submission.')
    }
  }

  async function rejectSubmission(submission: Submission) {
    if (!category?.formType) return
    await fetch(`/api/events/stakeholders/submissions/${submission.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'rejected' }) })
    fetchSubmissions(category.formType)
  }

  async function performDelete(alsoRemoveFromWebsite: boolean) {
    if (!deleteConfirm || !category) return
    setDeleting(true)
    const base = category.kind === 'speaker' ? '/api/events/stakeholders/speakers' : '/api/events/stakeholders/partners'
    await Promise.all(deleteConfirm.map(item =>
      fetch(`${base}/${item.id}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ also_remove_from_website: alsoRemoveFromWebsite }) })
    ))
    setDeleting(false)
    setDeleteConfirm(null)
    setSelectedIds(new Set())
    fetchAll()
  }

  function toggleSelected(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const items: (Speaker | Partner)[] = category ? (category.kind === 'speaker' ? speakers : visiblePartners) : []
  const q = search.trim().toLowerCase()
  const visibleItems = category ? items.filter(item => matchesSearch(item, category.kind, q)) : []
  const allVisibleSelected = visibleItems.length > 0 && visibleItems.every(i => selectedIds.has(i.id))

  // One overlay descriptor covering the blocking actions on this page that
  // AREN'T already inside their own modal with its own busy state —
  // deleting is deliberately excluded: DeleteConfirmModal already shows a
  // "Deleting…" button state in-context, and stacking this full-screen
  // overlay on top of that modal would just double up the dimming for a
  // sub-1.5s operation.
  const overlay = saving
    ? { label: 'Saving…', estimatedMs: 800 }
    : processingSubmissionId
    ? { label: 'Processing submission…', estimatedMs: 6000 }
    : bulkDownloading
    ? { label: `Preparing ${bulkDownloading === 'photo' ? 'photos' : 'logos'} download…`, estimatedMs: 1200 + selectedIds.size * 300 }
    : null

  return (
    <div style={{ minHeight: '100vh', background: 'var(--surface)' }}>
      <PageHeader
        eyebrow="Event Workspace"
        title="Stakeholder Hub"
        description="Speakers, sponsors, and partners — onboarding, asset review, approval, and their announcements, all in one place."
        backHref={`/admin/events/${eventId}`}
        backLabel="Back to Workspace"
        actions={(
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <Link href={`/admin/events/${eventId}/creative-templates/queue`}><Button variant="ghost">Queue →</Button></Link>
            {/* Secondary/smaller — branding-team-only tool, not a daily
                producer destination like Queue (2026-08-18 SAE-into-Hub
                merge, per Madhu). */}
            {can('sae.admin.access') && (
              <Link href={`/admin/events/${eventId}/creative-templates/admin`} style={{ fontSize: '13px', color: 'var(--ink3)', textDecoration: 'none' }}>
                Admin Console →
              </Link>
            )}
          </div>
        )}
      />
      <div style={{ padding: '24px 32px', display: 'grid', gridTemplateColumns: '220px 1fr', gap: '24px', alignItems: 'flex-start' }}>
        {/* Left nav */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {CATEGORIES.map(c => {
            const count = c.kind === 'speaker' ? speakers.length : partners.filter(p => !c.partnerTypes || c.partnerTypes.includes(p.partner_type)).length
            const inboxCount = c.formType ? submissions.filter(s => s.form_type === c.formType).length : 0
            return (
              <button key={c.key} onClick={() => setActiveTab(c.key)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px',
                  padding: '9px 12px', borderRadius: '8px', border: 'none', textAlign: 'left', cursor: 'pointer',
                  fontFamily: 'inherit', fontSize: '15px', fontWeight: 700,
                  background: activeTab === c.key ? 'var(--card)' : 'transparent',
                  color: activeTab === c.key ? 'var(--ink)' : 'var(--ink3)',
                }}>
                <span>{c.label}</span>
                <span style={{ display: 'flex', gap: '4px' }}>
                  {count > 0 && <span style={{ fontSize: '13px', color: 'var(--ink3)' }}>{count}</span>}
                  {inboxCount > 0 && (
                    <span style={{ background: 'var(--red)', color: 'var(--red-light)', borderRadius: '10px', padding: '0 6px', fontSize: '12px', fontWeight: 800 }}>{inboxCount}</span>
                  )}
                </span>
              </button>
            )
          })}
          <div style={{ height: '1px', background: 'var(--border-light)', margin: '6px 4px' }} />
          <button onClick={() => setActiveTab(INVITES_KEY)}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '9px 12px', borderRadius: '8px', border: 'none', textAlign: 'left', cursor: 'pointer',
              fontFamily: 'inherit', fontSize: '15px', fontWeight: 700,
              background: activeTab === INVITES_KEY ? 'var(--card)' : 'transparent',
              color: activeTab === INVITES_KEY ? 'var(--ink)' : 'var(--ink3)',
            }}>
            <span>Invites</span>
          </button>
          <button onClick={() => setActiveTab(DELETED_KEY)}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '9px 12px', borderRadius: '8px', border: 'none', textAlign: 'left', cursor: 'pointer',
              fontFamily: 'inherit', fontSize: '15px', fontWeight: 700,
              background: activeTab === DELETED_KEY ? 'var(--card)' : 'transparent',
              color: activeTab === DELETED_KEY ? 'var(--ink)' : 'var(--ink3)',
            }}>
            <span>Deleted</span>
          </button>
        </div>

        {/* Main content */}
        <div>
          {activeTab === DELETED_KEY ? (
            <>
              <div style={{ fontSize: '20px', fontWeight: 900, color: 'var(--ink)', marginBottom: '16px' }}>Deleted</div>
              <DeletedTab eventId={eventId} />
            </>
          ) : activeTab === INVITES_KEY ? (
            <InvitesTab eventId={eventId} can={can} />
          ) : category && (
          <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <div style={{ fontSize: '20px', fontWeight: 900, color: 'var(--ink)' }}>{viewMode === 'registry' ? category.label : 'Social Calendar'}</div>
              <div style={{ display: 'flex', borderRadius: '8px', border: '1px solid var(--border)', overflow: 'hidden' }}>
                {(['registry', 'calendar'] as const).map(v => (
                  <button key={v} onClick={() => setViewMode(v)}
                    style={{
                      padding: '5px 12px', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '13px', fontWeight: 700,
                      background: viewMode === v ? 'var(--card)' : 'transparent',
                      color: viewMode === v ? 'var(--ink)' : 'var(--ink3)',
                    }}>
                    {v === 'registry' ? 'Registry' : 'Calendar'}
                  </button>
                ))}
              </div>
            </div>
            {viewMode === 'registry' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Input value={search} onChange={e => setSearch(e.target.value)} placeholder={`Search ${category.label.toLowerCase()}…`} style={{ width: '240px' }} />
                {category.formType && can('sae.forms.manage') && (
                  <Link href={`/admin/events/${eventId}/stakeholders/hubspot-form/${category.formType}`}>
                    <Button variant="ghost">Connect HubSpot Form</Button>
                  </Link>
                )}
                {can('sae.stakeholders.edit') && <Button variant="lime" onClick={openAdd}>+ Add {category.kind === 'speaker' ? 'Speaker' : 'Partner'}</Button>}
              </div>
            )}
          </div>

          {viewMode === 'calendar' ? (
            <CalendarView eventId={eventId} />
          ) : (
          <>
          {msg && (
            <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'var(--red-light)', border: '1px solid var(--red-border)', color: 'var(--red)', fontSize: '14.5px', marginBottom: '14px' }}>
              {msg} <button onClick={() => setMsg(null)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontWeight: 700, marginLeft: '8px' }}>×</button>
            </div>
          )}

          {/* Submissions inbox */}
          {category.formType && submissions.length > 0 && can('sae.submissions.view') && (
            <div style={{ marginBottom: '18px' }}>
            <Card padded>
              <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--amber)', letterSpacing: '0.6px', textTransform: 'uppercase', marginBottom: '10px' }}>
                {submissions.length} New Submission{submissions.length === 1 ? '' : 's'}
              </div>
              <div style={{ display: 'grid', gap: '8px' }}>
                {submissions.map(s => (
                  <div key={s.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: 'var(--amber-light)', border: '1px solid var(--amber-border)', borderRadius: '8px' }}>
                    <div style={{ fontSize: '14.5px', color: 'var(--ink)' }}>
                      {submissionLabel(s)}
                    </div>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      {can('sae.submissions.process') && (
                        <Button variant="teal" onClick={() => processSubmission(s)} disabled={processingSubmissionId !== null}>
                          {processingSubmissionId === s.id ? 'Processing…' : 'Process'}
                        </Button>
                      )}
                      {can('sae.submissions.reject') && <Button variant="ghost" onClick={() => rejectSubmission(s)} disabled={processingSubmissionId !== null}>Reject</Button>}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
            </div>
          )}

          {/* Bulk action bar */}
          {selectedIds.size > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px', background: 'var(--red-light)', border: '1px solid var(--red-border)', borderRadius: '8px', marginBottom: '14px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '14.5px', fontWeight: 700, color: 'var(--red)' }}>{selectedIds.size} selected</span>
              {/* Bulk download (2026-08-04, per Madhu) — speaker-only, see
                  bulkDownloadAssets()'s own doc comment. More than one
                  matching asset zips automatically; exactly one downloads
                  directly (no point zipping a single file). */}
              {category?.kind === 'speaker' && (
                <>
                  <Button variant="ghost" onClick={() => bulkDownloadAssets('photo')} disabled={bulkDownloading !== null}>
                    {bulkDownloading === 'photo' ? 'Preparing…' : 'Download Photos'}
                  </Button>
                  <Button variant="ghost" onClick={() => bulkDownloadAssets('logo')} disabled={bulkDownloading !== null}>
                    {bulkDownloading === 'logo' ? 'Preparing…' : 'Download Logos'}
                  </Button>
                </>
              )}
              {can('sae.stakeholders.delete') && <Button variant="red" onClick={() => setDeleteConfirm(visibleItems.filter(i => selectedIds.has(i.id)))}>Delete Selected</Button>}
              <button onClick={() => setSelectedIds(new Set())} style={{ background: 'none', border: 'none', color: 'var(--ink3)', fontSize: '14px', fontWeight: 700, cursor: 'pointer' }}>Clear selection</button>
            </div>
          )}

          {/* Registry */}
          {loading ? (
            <div style={{ color: 'var(--ink3)', fontSize: '15px' }}>Loading…</div>
          ) : visibleItems.length === 0 ? (
            <div style={{ color: 'var(--ink3)', fontSize: '15px', padding: '30px 0', textAlign: 'center' }}>
              {items.length === 0 ? `No ${category.label.toLowerCase()} yet.` : `No ${category.label.toLowerCase()} match your search.`}
            </div>
          ) : (
            <div style={{ display: 'grid', gap: '10px' }}>
              {items.length > 1 && (
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13.5px', fontWeight: 700, color: 'var(--ink3)', cursor: 'pointer', padding: '0 4px' }}>
                  <input type="checkbox" checked={allVisibleSelected} onChange={e => setSelectedIds(e.target.checked ? new Set(visibleItems.map(i => i.id)) : new Set())} />
                  Select all
                </label>
              )}
              {visibleItems.map(item => {
                const isSpeaker = category.kind === 'speaker'
                const s = item as Speaker
                const p = item as Partner
                const name = isSpeaker ? s.full_name : p.company_name
                const subtitle = isSpeaker ? `${s.job_title} · ${s.company_name}` : p.partner_type.replace(/_/g, ' ')
                const badge = STATUS_BADGE[item.announcement_status]
                // Clean, minimal row (2026-08-14, per Madhu: "just speaker
                // name, job title and company name" — every other per-item
                // action, including Delete, now moved off the row itself.
                // The whole row navigates to the full-page review screen;
                // Delete only happens via selection + the bulk action bar
                // above (works for a single selected item too), which
                // already routes through DeleteConfirmModal's
                // type-DELETE-to-confirm gate.
                return (
                  <Card key={item.id} padded>
                    <div
                      onClick={() => router.push(reviewUrl(item))}
                      style={{ display: 'flex', alignItems: 'center', gap: '14px', cursor: 'pointer' }}
                    >
                      <input
                        type="checkbox" checked={selectedIds.has(item.id)}
                        onClick={e => e.stopPropagation()}
                        onChange={() => toggleSelected(item.id)}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--ink)' }}>{name}</div>
                          <Badge color={badge.color}>{badge.label}</Badge>
                        </div>
                        <div style={{ fontSize: '15px', color: 'var(--ink3)', marginTop: '3px' }}>{subtitle}</div>
                      </div>
                      {/* Roster status columns (2026-08-18, SAE-into-Hub
                          merge) — at-a-glance answer to "who still needs an
                          announcement", the thing the old separate SAE
                          workspace had no single view for. */}
                      <div style={{ display: 'flex', gap: '16px', flexShrink: 0, alignItems: 'center' }}>
                        <StatusColumn label="Announced" done={item.has_announcement} />
                        {isSpeaker && <StatusColumn label="Self Promo Sent" done={item.self_promo_sent} />}
                        <StatusColumn label="Published" done={false} comingSoon />
                      </div>
                    </div>
                  </Card>
                )
              })}
            </div>
          )}
          </>
          )}
          </>
          )}
        </div>
      </div>

      <ProcessingOverlay active={!!overlay} label={overlay?.label} estimatedMs={overlay?.estimatedMs} />

      {deleteConfirm && category && (
        <DeleteConfirmModal
          count={deleteConfirm.length}
          itemLabel={category.kind === 'speaker' ? 'speaker' : 'partner'}
          singleName={deleteConfirm.length === 1 ? (category.kind === 'speaker' ? (deleteConfirm[0] as Speaker).full_name : (deleteConfirm[0] as Partner).company_name) : undefined}
          deleting={deleting}
          onConfirm={performDelete}
          onClose={() => setDeleteConfirm(null)}
        />
      )}

      {/* Add/Edit slide-over */}
      {panelOpen && category && (
        <div style={{ position: 'fixed', inset: 0, background: 'color-mix(in srgb, black 50%, transparent)', zIndex: 50, display: 'flex', justifyContent: 'flex-end' }} onClick={() => setPanelOpen(false)}>
          <div onClick={e => e.stopPropagation()} style={{ width: '440px', maxWidth: '100%', height: '100%', background: 'var(--card)', borderLeft: '1px solid var(--border)', padding: '24px', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
              <div style={{ fontSize: '18px', fontWeight: 900, color: 'var(--ink)' }}>Add {category.kind === 'speaker' ? 'Speaker' : 'Partner'}</div>
              <button onClick={() => setPanelOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--ink3)', fontSize: '20px', cursor: 'pointer' }}>✕</button>
            </div>

            <div style={{ display: 'grid', gap: '12px' }}>
              {formSchema.filter(f => f.type !== 'file').map(field => (
                <FormFieldInput
                  key={field.id}
                  field={field}
                  value={values[field.key] ?? (field.type === 'multiselect' ? [] : '')}
                  onChange={v => setValues(prev => ({ ...prev, [field.key]: v }))}
                />
              ))}
              {category.kind === 'partner' && (
                <Field label="Partner Type">
                  <Select value={partnerType} onChange={e => setPartnerType(e.target.value)}>
                    {['headline_sponsor', 'platinum_sponsor', 'gold_sponsor', 'silver_sponsor', 'bronze_sponsor', 'exhibitor', 'media_partner', 'association_partner', 'ecosystem_partner', 'knowledge_partner', 'official_partner', 'supporting_partner', 'other'].map(t => (
                      <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
                    ))}
                  </Select>
                </Field>
              )}
              {formSchema.some(f => f.type === 'file') && (
                <div style={{ fontSize: '13.5px', color: 'var(--ink4)' }}>
                  File fields (photo/logo) aren&apos;t set here — you&apos;ll be taken to the full review page to upload those after saving.
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: '8px', marginTop: '20px' }}>
              <Button variant="lime" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
              <Button variant="ghost" onClick={() => setPanelOpen(false)}>Cancel</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink3)', display: 'block', marginBottom: '4px' }}>{label}</label>
      {children}
    </div>
  )
}
