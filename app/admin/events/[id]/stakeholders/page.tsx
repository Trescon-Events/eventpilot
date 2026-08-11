'use client'

import { useState, useEffect, use } from 'react'
import Link from 'next/link'
import { Download } from 'lucide-react'
import PageHeader from '@/app/components/PageHeader'
import { Button, Card, Badge, Input, Select } from '@/app/components/ui'
import { downloadFile, downloadFilesAsZip } from '@/app/lib/download-file'
import CalendarView from './CalendarView'
import DeletedTab from './DeletedTab'
import PhotoUploadModal from './PhotoUploadModal'
import LogoApprovalModal from './LogoApprovalModal'
import DeleteConfirmModal from './DeleteConfirmModal'
import HeadBoxEditorModal from './HeadBoxEditorModal'
import InviteComposer from './InviteComposer'
import { FormFieldInput } from '@/app/components/forms/FormFieldInput'
import { FieldSchema, FormType, SubmittedValue, asText } from '@/app/lib/forms/types'
import { recordToFields } from '@/app/lib/forms/map-to-stakeholder-record'

// Small download-icon button shown under a photo/logo thumbnail (2026-08-04,
// per Madhu: "our team usually need them for different purposes so they can
// easily download cleaned versions"). Stops propagation so it never
// triggers whatever the thumbnail itself might be wrapped in.
function ThumbDownloadButton({ url, filename }: { url: string; filename: string }) {
  return (
    <button
      onClick={e => { e.stopPropagation(); downloadFile(url, filename).catch(() => {}) }}
      title="Download"
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: '48px', padding: '2px 0', marginTop: '4px',
        background: 'none', border: 'none', color: 'var(--ink4)', cursor: 'pointer',
      }}
    >
      <Download size={13} />
    </button>
  )
}

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
}

type Submission = {
  id: string; event_id: string; form_type: string
  submitted_data: Record<string, SubmittedValue>
  file_urls: { photo?: string; company_logo?: string; logo?: string } | null
  status: string; submitted_at: string
}

type Invite = {
  id: string; event_id: string; form_type: string; template_id: string
  invite_token: string; recipient_name: string; recipient_email: string
  status: 'draft' | 'sent' | 'submitted'; send_error: string | null
  actual_subject: string; actual_body_html: string
  sent_at: string | null; reminder_count: number
  submission: { status: string; processed_into: string | null } | null
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

const STATUS_BADGE: Record<string, { label: string; color: 'amber' | 'red' | 'teal' | 'grey' }> = {
  pending_review: { label: 'Pending Review', color: 'amber' },
  assets_missing: { label: 'Assets Missing', color: 'red' },
  approved:       { label: 'Approved', color: 'teal' },
  ready:          { label: 'Ready', color: 'teal' }, // .tbadge has no lime variant; teal is the closest positive tone
  archived:       { label: 'Archived', color: 'grey' },
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

  const [activeTab, setActiveTab] = useState(CATEGORIES[0].key)
  const [viewMode, setViewMode] = useState<'registry' | 'calendar'>('registry')
  const [speakers, setSpeakers] = useState<Speaker[]>([])
  const [partners, setPartners] = useState<Partner[]>([])
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [invites, setInvites] = useState<Invite[]>([])
  const [composeOpen, setComposeOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const [panelOpen, setPanelOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [values, setValues] = useState<Record<string, SubmittedValue>>({})
  const [partnerType, setPartnerType] = useState('sponsor')
  const [formSchema, setFormSchema] = useState<FieldSchema[]>([])
  const [saving, setSaving] = useState(false)
  const [uploadingId, setUploadingId] = useState<string | null>(null)
  const [photoUploadTarget, setPhotoUploadTarget] = useState<{ speakerId: string; file: File } | null>(null)
  const [logoApproval, setLogoApproval] = useState<{ url: string; item: Speaker | Partner; assetType: 'photo' | 'company_logo' | 'logo' } | null>(null)
  const [headBoxTarget, setHeadBoxTarget] = useState<Speaker | null>(null)

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [deleteConfirm, setDeleteConfirm] = useState<(Speaker | Partner)[] | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [bulkDownloading, setBulkDownloading] = useState<'photo' | 'logo' | null>(null)
  const [permissions, setPermissions] = useState<Set<string>>(new Set())

  const category = CATEGORIES.find(c => c.key === activeTab)
  // '*' = platform admin (getEventPermissions() returns this instead of
  // enumerating every key) — see app/lib/access/event-access.ts.
  const can = (key: string) => permissions.has('*') || permissions.has(key)

  async function fetchAll() {
    setLoading(true)
    const [spRes, ptRes, permRes] = await Promise.all([
      fetch(`/api/events/stakeholders/speakers?event_id=${eventId}`),
      fetch(`/api/events/stakeholders/partners?event_id=${eventId}`),
      fetch(`/api/events/access/me?event_id=${eventId}`),
    ])
    setSpeakers(await spRes.json().catch(() => []))
    setPartners(await ptRes.json().catch(() => []))
    const permData = await permRes.json().catch(() => ({ permissions: [] }))
    setPermissions(new Set(permData.permissions ?? []))
    setLoading(false)
  }

  async function fetchSubmissions(formType: string) {
    const res = await fetch(`/api/events/stakeholders/submissions?event_id=${eventId}&form_type=${formType}`)
    setSubmissions(await res.json().catch(() => []))
  }

  async function fetchInvites(formType: string) {
    const res = await fetch(`/api/events/stakeholders/invites?event_id=${eventId}&form_type=${formType}`)
    setInvites(await res.json().catch(() => []))
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
    if (category?.formType) { fetchSubmissions(category.formType); fetchInvites(category.formType) }
    else { setSubmissions([]); setInvites([]) }
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
    setEditingId(null)
    setValues({})
    setPartnerType('sponsor')
    setPanelOpen(true)
  }

  function openEdit(item: Speaker | Partner) {
    if (!category) return
    setEditingId(item.id)
    const formType: FormType = category.kind === 'speaker' ? 'speaker' : (category.formType as FormType | undefined) ?? 'sponsor'
    setValues(recordToFields(formType, formSchema, item as unknown as Record<string, unknown>))
    if (category.kind === 'partner') setPartnerType((item as Partner).partner_type)
    setPanelOpen(true)
  }

  async function save() {
    if (!category) return
    setSaving(true)
    const base = category.kind === 'speaker' ? '/api/events/stakeholders/speakers' : '/api/events/stakeholders/partners'
    const body = category.kind === 'speaker'
      ? { event_id: eventId, fields: values }
      : { event_id: eventId, fields: values, partner_type: partnerType, form_type: category.formType ?? 'sponsor' }

    const res = editingId
      ? await fetch(`${base}/${editingId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      : await fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

    if (res.ok) { setPanelOpen(false); fetchAll() } else { setMsg('Save failed — check required fields.') }
    setSaving(false)
  }

  // Generate Announcement is gated on announcement_status === 'ready', but
  // nothing ever moved a stakeholder there — every path (manual add,
  // onboarding-form conversion) lands on 'pending_review' and stays there
  // forever, permanently disabling the button with no way to unblock it.
  // Real gap found live (2026-07-27): Madhu added a speaker, clicked
  // Generate Announcement, and nothing happened — the button LOOKED
  // enabled (disabled buttons had no visual treatment at all, fixed
  // separately in globals.css) but was actually inert. This is the
  // missing step: an explicit "this stakeholder's details/photo/logo have
  // been reviewed, go ahead" action, matching the 'ready' vocabulary
  // STATUS_BADGE already defines but nothing ever set.
  async function approveForAnnouncement(item: Speaker | Partner) {
    if (!category) return
    const base = category.kind === 'speaker' ? '/api/events/stakeholders/speakers' : '/api/events/stakeholders/partners'
    await fetch(`${base}/${item.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ announcement_status: 'ready' }),
    })
    fetchAll()
  }

  async function uploadAsset(item: Speaker | Partner, assetType: 'company_logo' | 'logo', file: File) {
    if (!category) return
    setUploadingId(item.id)
    setMsg(null)
    const base = category.kind === 'speaker' ? '/api/events/stakeholders/speakers' : '/api/events/stakeholders/partners'
    const form = new FormData()
    form.append('file', file)
    if (category.kind === 'speaker') form.append('asset_type', assetType)
    let res: Response
    try {
      res = await fetch(`${base}/${item.id}/upload-asset`, { method: 'POST', body: form })
    } catch (e) {
      // Network failure never reached the server at all — previously
      // silently swallowed here (real bug reported live, 2026-08-04:
      // "when I upload company logo nothing happens" — ANY failure in this
      // function, network or server-side, produced zero visible feedback,
      // since the only success path required `logoUrl` to be truthy and
      // nothing else was ever surfaced).
      setUploadingId(null)
      setMsg(`Could not upload logo: ${(e as Error).message}`)
      return
    }
    const data = await res.json().catch(() => ({}))
    setUploadingId(null)
    if (!res.ok) { setMsg(data?.error ?? `Could not upload logo (${res.status}).`); return }
    await fetchAll()
    // Every logo path (partner logo, speaker's own company logo) runs
    // through the Logo Engine automatically — offer a look-and-confirm step
    // rather than trusting the automatic background removal blindly.
    const logoUrl = data.company_logo_url || data.logo_url
    if (logoUrl) setLogoApproval({ url: logoUrl, item, assetType })
    else setMsg('Upload succeeded but no logo URL was returned — please try again.')
  }

  async function removeCompanyLogo(speakerId: string) {
    setUploadingId(speakerId)
    setMsg(null)
    const res = await fetch(`/api/events/stakeholders/speakers/${speakerId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ remove_company_logo: true }),
    })
    setUploadingId(null)
    if (!res.ok) { setMsg('Could not remove the logo — please try again.'); return }
    await fetchAll()
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
    const base = category.kind === 'speaker' ? '/api/events/stakeholders/speakers/from-submission' : '/api/events/stakeholders/partners/from-submission'
    const res = await fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ submission_id: submission.id, event_id: eventId }) })
    if (res.ok) { await fetchSubmissions(category.formType!); await fetchAll() } else { setMsg('Could not process this submission.') }
  }

  async function rejectSubmission(submission: Submission) {
    if (!category?.formType) return
    await fetch(`/api/events/stakeholders/submissions/${submission.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'rejected' }) })
    fetchSubmissions(category.formType)
  }

  async function remindInvite(invite: Invite) {
    if (!category?.formType) return
    const res = await fetch(`/api/events/stakeholders/invites/${invite.id}/remind`, { method: 'POST' })
    if (res.ok) fetchInvites(category.formType)
    else setMsg('Could not send reminder.')
  }

  async function retryInvite(invite: Invite) {
    if (!category?.formType) return
    const res = await fetch('/api/events/stakeholders/invites/send', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        invite_token: invite.invite_token, event_id: invite.event_id, form_type: invite.form_type, template_id: invite.template_id,
        recipient_name: invite.recipient_name, recipient_email: invite.recipient_email,
        subject: invite.actual_subject, html: invite.actual_body_html,
      }),
    })
    if (res.ok) fetchInvites(category.formType)
    else setMsg('Retry failed — check the invite for details.')
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

  return (
    <div style={{ minHeight: '100vh', background: 'var(--surface)' }}>
      <PageHeader
        eyebrow="Event Workspace"
        title="Stakeholder Hub"
        description="Speakers, sponsors, and partners — onboarding, asset review, and approval. Announcement creatives are generated in the Stakeholder Announcement Engine."
        actions={<Link href={`/admin/events/${eventId}/creative-templates`}><Button variant="ghost">Stakeholder Announcement Engine →</Button></Link>}
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
                  fontFamily: 'inherit', fontSize: '13px', fontWeight: 700,
                  background: activeTab === c.key ? 'var(--card)' : 'transparent',
                  color: activeTab === c.key ? 'var(--ink)' : 'var(--ink3)',
                }}>
                <span>{c.label}</span>
                <span style={{ display: 'flex', gap: '4px' }}>
                  {count > 0 && <span style={{ fontSize: '11px', color: 'var(--ink3)' }}>{count}</span>}
                  {inboxCount > 0 && (
                    <span style={{ background: 'var(--red)', color: 'var(--red-light)', borderRadius: '10px', padding: '0 6px', fontSize: '10px', fontWeight: 800 }}>{inboxCount}</span>
                  )}
                </span>
              </button>
            )
          })}
          <div style={{ height: '1px', background: 'var(--border-light)', margin: '6px 4px' }} />
          <button onClick={() => setActiveTab(DELETED_KEY)}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '9px 12px', borderRadius: '8px', border: 'none', textAlign: 'left', cursor: 'pointer',
              fontFamily: 'inherit', fontSize: '13px', fontWeight: 700,
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
              <div style={{ fontSize: '18px', fontWeight: 900, color: 'var(--ink)', marginBottom: '16px' }}>Deleted</div>
              <DeletedTab eventId={eventId} />
            </>
          ) : category && (
          <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <div style={{ fontSize: '18px', fontWeight: 900, color: 'var(--ink)' }}>{viewMode === 'registry' ? category.label : 'Social Calendar'}</div>
              <div style={{ display: 'flex', borderRadius: '8px', border: '1px solid var(--border)', overflow: 'hidden' }}>
                {(['registry', 'calendar'] as const).map(v => (
                  <button key={v} onClick={() => setViewMode(v)}
                    style={{
                      padding: '5px 12px', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '11px', fontWeight: 700,
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
            <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'var(--red-light)', border: '1px solid var(--red-border)', color: 'var(--red)', fontSize: '12.5px', marginBottom: '14px' }}>
              {msg} <button onClick={() => setMsg(null)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontWeight: 700, marginLeft: '8px' }}>×</button>
            </div>
          )}

          {/* Submissions inbox */}
          {category.formType && submissions.length > 0 && can('sae.submissions.view') && (
            <div style={{ marginBottom: '18px' }}>
            <Card padded>
              <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--amber)', letterSpacing: '0.6px', textTransform: 'uppercase', marginBottom: '10px' }}>
                {submissions.length} New Submission{submissions.length === 1 ? '' : 's'}
              </div>
              <div style={{ display: 'grid', gap: '8px' }}>
                {submissions.map(s => (
                  <div key={s.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: 'var(--amber-light)', border: '1px solid var(--amber-border)', borderRadius: '8px' }}>
                    <div style={{ fontSize: '12.5px', color: 'var(--ink)' }}>
                      {asText(s.submitted_data.full_name) || asText(s.submitted_data.company_name)} {s.submitted_data.company_name && s.submitted_data.full_name ? `· ${asText(s.submitted_data.company_name)}` : ''}
                    </div>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      {can('sae.submissions.process') && <Button variant="teal" onClick={() => processSubmission(s)}>Process</Button>}
                      {can('sae.submissions.reject') && <Button variant="ghost" onClick={() => rejectSubmission(s)}>Reject</Button>}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
            </div>
          )}

          {/* Invites tracker */}
          {category.formType && can('sae.stakeholders.view') && (
            <div style={{ marginBottom: '18px' }}>
            <Card padded>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--ink3)', letterSpacing: '0.6px', textTransform: 'uppercase' }}>Invites{invites.length > 0 ? ` (${invites.length})` : ''}</div>
                {can('sae.invites.send') && <Button variant="lime" onClick={() => setComposeOpen(true)}>+ Invite</Button>}
              </div>
              {invites.length === 0 && <div style={{ fontSize: '12.5px', color: 'var(--ink3)' }}>No invites sent yet for this category.</div>}
              <div style={{ display: 'grid', gap: '8px' }}>
                {invites.map(inv => (
                  <div key={inv.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: 'var(--card-hi)', border: '1px solid var(--surface)', borderRadius: '8px' }}>
                    <div>
                      <div style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--ink)' }}>{inv.recipient_name} <span style={{ fontWeight: 400, color: 'var(--ink3)' }}>· {inv.recipient_email}</span></div>
                      <div style={{ fontSize: '11px', color: 'var(--ink4)', marginTop: '2px' }}>
                        {inv.status === 'submitted' && 'Submitted'}
                        {inv.status === 'sent' && `Sent${inv.sent_at ? ' ' + new Date(inv.sent_at).toLocaleDateString() : ''}`}
                        {inv.status === 'draft' && `Send failed${inv.send_error ? `: ${inv.send_error}` : ''}`}
                        {inv.reminder_count > 0 && ` · Reminded ${inv.reminder_count}×`}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      {inv.status === 'sent' && can('sae.invites.send') && <Button variant="ghost" onClick={() => remindInvite(inv)}>Send Reminder</Button>}
                      {inv.status === 'draft' && can('sae.invites.send') && <Button variant="red" onClick={() => retryInvite(inv)}>Retry Send</Button>}
                      {inv.status === 'submitted' && <Badge color="teal">Processed via Submissions Inbox</Badge>}
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
              <span style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--red)' }}>{selectedIds.size} selected</span>
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
              <button onClick={() => setSelectedIds(new Set())} style={{ background: 'none', border: 'none', color: 'var(--ink3)', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>Clear selection</button>
            </div>
          )}

          {/* Registry */}
          {loading ? (
            <div style={{ color: 'var(--ink3)', fontSize: '13px' }}>Loading…</div>
          ) : visibleItems.length === 0 ? (
            <div style={{ color: 'var(--ink3)', fontSize: '13px', padding: '30px 0', textAlign: 'center' }}>
              {items.length === 0 ? `No ${category.label.toLowerCase()} yet.` : `No ${category.label.toLowerCase()} match your search.`}
            </div>
          ) : (
            <div style={{ display: 'grid', gap: '10px' }}>
              {items.length > 1 && (
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11.5px', fontWeight: 700, color: 'var(--ink3)', cursor: 'pointer', padding: '0 4px' }}>
                  <input type="checkbox" checked={allVisibleSelected} onChange={e => setSelectedIds(e.target.checked ? new Set(visibleItems.map(i => i.id)) : new Set())} />
                  Select all
                </label>
              )}
              {visibleItems.map(item => {
                const isSpeaker = category.kind === 'speaker'
                const s = item as Speaker
                const p = item as Partner
                const name  = isSpeaker ? s.full_name : p.company_name
                const thumb = isSpeaker ? (s.photo_processed_url || s.photo_url) : p.logo_url
                const badge = STATUS_BADGE[item.announcement_status]
                return (
                  <Card key={item.id} padded>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
                      <input type="checkbox" checked={selectedIds.has(item.id)} onChange={() => toggleSelected(item.id)} style={{ marginTop: '18px' }} />
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                        <div style={{ width: '48px', height: '48px', borderRadius: '10px', background: 'var(--surface)', border: '1px solid var(--border-light)', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {thumb ? <img src={thumb} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: '18px', color: 'var(--ink4)' }}>{name?.[0]}</span>}
                        </div>
                        {/* Download icon (2026-08-04, per Madhu: "our team
                            usually need them for different purposes so they
                            can easily download cleaned versions") — only
                            when there's actually a processed asset to
                            download, not the bare-initial placeholder. */}
                        {thumb && <ThumbDownloadButton url={thumb} filename={`${name.replace(/\s+/g, '-')}-photo.${isSpeaker ? 'jpg' : 'png'}`} />}
                      </div>
                      {/* Company logo indicator (2026-08-04, per Madhu) —
                          previously a speaker's uploaded company logo had no
                          persistent visual trace anywhere in the Hub once
                          the upload review modal closed, the only feedback
                          was a one-time approval popup. `objectFit: contain`
                          (not cover, unlike the photo thumb above) — a logo
                          shouldn't get cropped to fill a square. Checkerboard
                          background shows through any transparency, same
                          convention as the upload review modals. */}
                      {isSpeaker && s.company_logo_url && (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                          <div title="Company logo" style={{
                            width: '48px', height: '48px', borderRadius: '10px',
                            background: 'repeating-conic-gradient(var(--border-light) 0% 25%, var(--surface) 0% 50%) 50% / 12px 12px',
                            border: '1px solid var(--border-light)', overflow: 'hidden',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4px',
                          }}>
                            <img src={s.company_logo_url} alt={`${name} company logo`} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                          </div>
                          <ThumbDownloadButton url={s.company_logo_url} filename={`${name.replace(/\s+/g, '-')}-logo.png`} />
                        </div>
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--ink)' }}>{name}</div>
                          <Badge color={badge.color}>{badge.label}</Badge>
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--ink3)', marginTop: '2px' }}>
                          {isSpeaker ? `${s.job_title} · ${s.company_name}` : (p.company_description ? p.company_description.slice(0, 80) : p.partner_type.replace(/_/g, ' '))}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--ink4)', marginTop: '2px' }}>
                          {isSpeaker && s.country ? `${s.country} · ` : ''}via {item.source === 'onboarding_form' ? 'Onboarding Form' : 'Manual'}
                        </div>
                        {item.custom_fields && Object.keys(item.custom_fields).length > 0 && (
                          <details style={{ marginTop: '6px', fontSize: '11.5px', color: 'var(--ink3)' }}>
                            <summary style={{ cursor: 'pointer', fontWeight: 700 }}>Additional Details</summary>
                            <div style={{ marginTop: '4px', display: 'grid', gap: '2px' }}>
                              {Object.entries(item.custom_fields).map(([k, v]) => (
                                <div key={k}>{formSchema.find(f => f.key === k)?.label ?? k}: {asText(v)}</div>
                              ))}
                            </div>
                          </details>
                        )}
                        <div style={{ display: 'flex', gap: '8px', marginTop: '10px', flexWrap: 'wrap' }}>
                          {can('sae.stakeholders.edit') && <Button variant="ghost" onClick={() => openEdit(item)}>Edit</Button>}
                          {isSpeaker ? (
                            // "Done" state (2026-08-04, per Madhu: "at least
                            // once if upload photo... is performed, let the
                            // button turn green so user knows that step is
                            // done. however they still can upload again" —
                            // purely visual, the input/onChange below is
                            // completely unchanged, still re-uploadable.
                            <label style={{ display: 'inline-flex' }}>
                              <span style={{
                                padding: '7px 14px', borderRadius: '10px', fontSize: '13px', fontWeight: 700, cursor: 'pointer',
                                border: (s.photo_processed_url || s.photo_url) ? '1.5px solid color-mix(in srgb, var(--success) 45%, transparent)' : '1.5px solid var(--border)',
                                background: (s.photo_processed_url || s.photo_url) ? 'var(--success-light)' : 'transparent',
                                color: (s.photo_processed_url || s.photo_url) ? 'var(--success)' : 'var(--ink2)',
                              }}>
                                {(s.photo_processed_url || s.photo_url) ? '✓ Upload Photo' : 'Upload Photo'}
                              </span>
                              <input type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }}
                                onChange={e => { const f = e.target.files?.[0]; if (f) setPhotoUploadTarget({ speakerId: item.id, file: f }); e.target.value = '' }} />
                            </label>
                          ) : (
                            <label style={{ display: 'inline-flex' }}>
                              <span style={{ padding: '7px 14px', borderRadius: '10px', border: '1.5px solid var(--border)', background: 'transparent', color: 'var(--ink2)', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>
                                {uploadingId === item.id ? 'Uploading…' : 'Upload Logo'}
                              </span>
                              <input type="file" accept="image/*" style={{ display: 'none' }} disabled={uploadingId === item.id}
                                onChange={e => { const f = e.target.files?.[0]; if (f) uploadAsset(item, 'logo', f); e.target.value = '' }} />
                            </label>
                          )}
                          {isSpeaker && (
                            <label style={{ display: 'inline-flex' }}>
                              <span style={{
                                padding: '7px 14px', borderRadius: '10px', fontSize: '13px', fontWeight: 700, cursor: 'pointer',
                                border: s.company_logo_url ? '1.5px solid color-mix(in srgb, var(--success) 45%, transparent)' : '1.5px solid var(--border)',
                                background: s.company_logo_url ? 'var(--success-light)' : 'transparent',
                                color: s.company_logo_url ? 'var(--success)' : 'var(--ink2)',
                              }}>
                                {uploadingId === item.id ? 'Uploading…' : (s.company_logo_url ? '✓ Upload Company Logo' : 'Upload Company Logo')}
                              </span>
                              <input type="file" accept="image/*" style={{ display: 'none' }} disabled={uploadingId === item.id}
                                onChange={e => { const f = e.target.files?.[0]; if (f) uploadAsset(item, 'company_logo', f); e.target.value = '' }} />
                            </label>
                          )}
                          {/* Remove Logo (2026-08-04, per Madhu: "currently
                              we can only reupload a different one, but if we
                              decide to remove it altogether, let there be an
                              option for it too") — no confirmation modal,
                              unlike deleting a whole speaker: this is a
                              single low-stakes, fully reversible field
                              (re-uploading restores it immediately), matching
                              Upload Company Logo's own lack of ceremony. */}
                          {isSpeaker && s.company_logo_url && (
                            <Button variant="ghost" onClick={() => removeCompanyLogo(item.id)} disabled={uploadingId === item.id}>
                              Remove Logo
                            </Button>
                          )}
                          {isSpeaker && (s.photo_processed_url || s.photo_url) && (
                            <Button variant={s.photo_head_box ? 'success' : 'ghost'} onClick={() => setHeadBoxTarget(s)} title="Manually adjust where the head is detected — use this if a generated creative shows the head too small, too large, or mispositioned">
                              {s.photo_head_box ? '✓ Fix Head Position' : 'Fix Head Position'}
                            </Button>
                          )}
                          {item.announcement_status !== 'ready' && item.announcement_status !== 'archived' && can('sae.approvals.approve') && (
                            <Button variant="teal" onClick={() => approveForAnnouncement(item)} title="Review the photo/logo/details above, then approve to make this stakeholder available in the Stakeholder Announcement Engine">
                              Approve for Announcement
                            </Button>
                          )}
                          {/* Plain wayfinding link, not a styled action button
                              (2026-08-02, per Madhu) — every announcement-
                              creation action now lives only in the SAE
                              module (creative-templates), so this page
                              shouldn't read as if generating happens here
                              too. Approve for Announcement above stays a
                              real action; this is navigation only. */}
                          {item.announcement_status === 'ready' && (
                            <Link href={`/admin/events/${eventId}/creative-templates`} style={{ fontSize: '12.5px', color: 'var(--ink3)', textDecoration: 'underline', alignSelf: 'center' }}>
                              Manage in Stakeholder Announcement Engine →
                            </Link>
                          )}
                          {can('sae.stakeholders.delete') && <Button variant="red" onClick={() => setDeleteConfirm([item])}>Delete</Button>}
                        </div>
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

      {photoUploadTarget && (
        <PhotoUploadModal
          speakerId={photoUploadTarget.speakerId}
          initialFile={photoUploadTarget.file}
          onClose={() => setPhotoUploadTarget(null)}
          onDone={fetchAll}
        />
      )}

      {logoApproval && (
        <LogoApprovalModal
          logoUrl={logoApproval.url}
          onClose={() => setLogoApproval(null)}
          onReupload={file => { const { item, assetType } = logoApproval; setLogoApproval(null); uploadAsset(item, assetType as 'company_logo' | 'logo', file) }}
        />
      )}

      {headBoxTarget && (
        <HeadBoxEditorModal
          speakerId={headBoxTarget.id}
          photoUrl={(headBoxTarget.photo_processed_url || headBoxTarget.photo_url)!}
          currentHeadBox={headBoxTarget.photo_head_box}
          onClose={() => setHeadBoxTarget(null)}
          onDone={fetchAll}
        />
      )}

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

      {composeOpen && category?.formType && (
        <InviteComposer
          eventId={eventId}
          formType={category.formType as 'speaker' | 'sponsor' | 'media_partner' | 'association_partner'}
          onClose={() => setComposeOpen(false)}
          onSent={() => fetchInvites(category.formType!)}
        />
      )}

      {/* Add/Edit slide-over */}
      {panelOpen && category && (
        <div style={{ position: 'fixed', inset: 0, background: 'color-mix(in srgb, black 50%, transparent)', zIndex: 50, display: 'flex', justifyContent: 'flex-end' }} onClick={() => setPanelOpen(false)}>
          <div onClick={e => e.stopPropagation()} style={{ width: '440px', maxWidth: '100%', height: '100%', background: 'var(--card)', borderLeft: '1px solid var(--border)', padding: '24px', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
              <div style={{ fontSize: '16px', fontWeight: 900, color: 'var(--ink)' }}>{editingId ? 'Edit' : 'Add'} {category.kind === 'speaker' ? 'Speaker' : 'Partner'}</div>
              <button onClick={() => setPanelOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--ink3)', fontSize: '18px', cursor: 'pointer' }}>✕</button>
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
                <div style={{ fontSize: '11.5px', color: 'var(--ink4)' }}>
                  File fields (photo/logo) aren&apos;t set here — use the Upload Photo/Upload Logo buttons on the card after saving.
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
      <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink3)', display: 'block', marginBottom: '4px' }}>{label}</label>
      {children}
    </div>
  )
}
