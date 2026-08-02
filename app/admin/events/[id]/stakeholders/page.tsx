'use client'

import { useState, useEffect, use } from 'react'
import Link from 'next/link'
import PageHeader from '@/app/components/PageHeader'
import { Button, Card, Badge, Input, Select, Textarea } from '@/app/components/ui'
import CalendarView from './CalendarView'
import DeletedTab from './DeletedTab'
import PhotoUploadModal from './PhotoUploadModal'
import LogoApprovalModal from './LogoApprovalModal'
import DeleteConfirmModal from './DeleteConfirmModal'

type Speaker = {
  id: string; event_id: string
  full_name: string; job_title: string; company_name: string
  country: string | null; bio: string | null; linkedin_url: string | null
  photo_url: string | null; photo_processed_url: string | null; company_logo_url: string | null
  announcement_status: 'pending_review' | 'approved' | 'assets_missing' | 'ready' | 'archived'
  source: 'onboarding_form' | 'manual'
  notes: string | null; created_at: string
}

type Partner = {
  id: string; event_id: string
  company_name: string; company_website: string | null; company_description: string | null
  partner_type: string
  logo_url: string | null; logo_raw_url: string | null
  announcement_status: 'pending_review' | 'approved' | 'assets_missing' | 'ready' | 'archived'
  source: 'onboarding_form' | 'manual'
  notes: string | null; created_at: string
}

type Submission = {
  id: string; event_id: string; form_type: string
  submitted_data: Record<string, string>
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

const STATUS_BADGE: Record<string, { label: string; color: 'amber' | 'red' | 'teal' | 'grey' }> = {
  pending_review: { label: 'Pending Review', color: 'amber' },
  assets_missing: { label: 'Assets Missing', color: 'red' },
  approved:       { label: 'Approved', color: 'teal' },
  ready:          { label: 'Ready', color: 'teal' }, // .tbadge has no lime variant; teal is the closest positive tone
  archived:       { label: 'Archived', color: 'grey' },
}

type EditDraft = {
  full_name: string; job_title: string; company_name: string; country: string; bio: string; linkedin_url: string
  company_website: string; company_description: string; partner_type: string
}
const EMPTY_DRAFT: EditDraft = {
  full_name: '', job_title: '', company_name: '', country: '', bio: '', linkedin_url: '',
  company_website: '', company_description: '', partner_type: 'sponsor',
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
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const [panelOpen, setPanelOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<EditDraft>(EMPTY_DRAFT)
  const [saving, setSaving] = useState(false)
  const [uploadingId, setUploadingId] = useState<string | null>(null)
  const [photoUploadTarget, setPhotoUploadTarget] = useState<{ speakerId: string; file: File } | null>(null)
  const [logoApproval, setLogoApproval] = useState<{ url: string; item: Speaker | Partner; assetType: 'photo' | 'company_logo' | 'logo' } | null>(null)

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [deleteConfirm, setDeleteConfirm] = useState<(Speaker | Partner)[] | null>(null)
  const [deleting, setDeleting] = useState(false)

  const category = CATEGORIES.find(c => c.key === activeTab)

  async function fetchAll() {
    setLoading(true)
    const [spRes, ptRes] = await Promise.all([
      fetch(`/api/events/stakeholders/speakers?event_id=${eventId}`),
      fetch(`/api/events/stakeholders/partners?event_id=${eventId}`),
    ])
    setSpeakers(await spRes.json().catch(() => []))
    setPartners(await ptRes.json().catch(() => []))
    setLoading(false)
  }

  async function fetchSubmissions(formType: string) {
    const res = await fetch(`/api/events/stakeholders/submissions?event_id=${eventId}&form_type=${formType}`)
    setSubmissions(await res.json().catch(() => []))
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-mount; matches app/admin/events/[id]/page.tsx's fetchAll effect
  useEffect(() => { fetchAll() }, [eventId])
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- same fetch-on-dependency-change pattern as the effect above
    if (category?.formType) fetchSubmissions(category.formType)
    else setSubmissions([])
  }, [eventId, category?.formType])
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset per-tab UI state (selection, search) on tab switch, not a fetch side effect
    setSelectedIds(new Set())
    setSearch('')
  }, [activeTab])

  const visiblePartners = category ? partners.filter(p => !category.partnerTypes || category.partnerTypes.includes(p.partner_type)) : []

  function openAdd() {
    setEditingId(null)
    setDraft(EMPTY_DRAFT)
    setPanelOpen(true)
  }

  function openEdit(item: Speaker | Partner) {
    if (!category) return
    setEditingId(item.id)
    if (category.kind === 'speaker') {
      const s = item as Speaker
      setDraft({ ...EMPTY_DRAFT, full_name: s.full_name, job_title: s.job_title, company_name: s.company_name, country: s.country ?? '', bio: s.bio ?? '', linkedin_url: s.linkedin_url ?? '' })
    } else {
      const p = item as Partner
      setDraft({ ...EMPTY_DRAFT, company_name: p.company_name, company_website: p.company_website ?? '', company_description: p.company_description ?? '', partner_type: p.partner_type })
    }
    setPanelOpen(true)
  }

  async function save() {
    if (!category) return
    setSaving(true)
    const base = category.kind === 'speaker' ? '/api/events/stakeholders/speakers' : '/api/events/stakeholders/partners'
    const body = category.kind === 'speaker'
      ? { event_id: eventId, full_name: draft.full_name, job_title: draft.job_title, company_name: draft.company_name, country: draft.country, bio: draft.bio, linkedin_url: draft.linkedin_url }
      : { event_id: eventId, company_name: draft.company_name, company_website: draft.company_website, company_description: draft.company_description, partner_type: draft.partner_type }

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
    const base = category.kind === 'speaker' ? '/api/events/stakeholders/speakers' : '/api/events/stakeholders/partners'
    const form = new FormData()
    form.append('file', file)
    if (category.kind === 'speaker') form.append('asset_type', assetType)
    const res = await fetch(`${base}/${item.id}/upload-asset`, { method: 'POST', body: form })
    const data = await res.json().catch(() => ({}))
    await fetchAll()
    setUploadingId(null)
    // Every logo path (partner logo, speaker's own company logo) runs
    // through the Logo Engine automatically — offer a look-and-confirm step
    // rather than trusting the automatic background removal blindly.
    const logoUrl = data.company_logo_url || data.logo_url
    if (logoUrl) setLogoApproval({ url: logoUrl, item, assetType })
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
                <Button variant="lime" onClick={openAdd}>+ Add {category.kind === 'speaker' ? 'Speaker' : 'Partner'}</Button>
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
          {category.formType && submissions.length > 0 && (
            <div style={{ marginBottom: '18px' }}>
            <Card padded>
              <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--amber)', letterSpacing: '0.6px', textTransform: 'uppercase', marginBottom: '10px' }}>
                {submissions.length} New Submission{submissions.length === 1 ? '' : 's'}
              </div>
              <div style={{ display: 'grid', gap: '8px' }}>
                {submissions.map(s => (
                  <div key={s.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: 'var(--amber-light)', border: '1px solid var(--amber-border)', borderRadius: '8px' }}>
                    <div style={{ fontSize: '12.5px', color: 'var(--ink)' }}>
                      {s.submitted_data.full_name || s.submitted_data.company_name} {s.submitted_data.company_name && s.submitted_data.full_name ? `· ${s.submitted_data.company_name}` : ''}
                    </div>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <Button variant="teal" onClick={() => processSubmission(s)}>Process</Button>
                      <Button variant="ghost" onClick={() => rejectSubmission(s)}>Reject</Button>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
            </div>
          )}

          {/* Bulk action bar */}
          {selectedIds.size > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px', background: 'var(--red-light)', border: '1px solid var(--red-border)', borderRadius: '8px', marginBottom: '14px' }}>
              <span style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--red)' }}>{selectedIds.size} selected</span>
              <Button variant="red" onClick={() => setDeleteConfirm(visibleItems.filter(i => selectedIds.has(i.id)))}>Delete Selected</Button>
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
                      <div style={{ width: '48px', height: '48px', borderRadius: '10px', background: 'var(--surface)', border: '1px solid var(--border-light)', flexShrink: 0, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {thumb ? <img src={thumb} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: '18px', color: 'var(--ink4)' }}>{name?.[0]}</span>}
                      </div>
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
                        <div style={{ display: 'flex', gap: '8px', marginTop: '10px', flexWrap: 'wrap' }}>
                          <Button variant="ghost" onClick={() => openEdit(item)}>Edit</Button>
                          {isSpeaker ? (
                            <label style={{ display: 'inline-flex' }}>
                              <span style={{ padding: '7px 14px', borderRadius: '10px', border: '1.5px solid var(--border)', background: 'transparent', color: 'var(--ink2)', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>
                                Upload Photo
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
                              <span style={{ padding: '7px 14px', borderRadius: '10px', border: '1.5px solid var(--border)', background: 'transparent', color: 'var(--ink2)', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>
                                {uploadingId === item.id ? 'Uploading…' : 'Upload Company Logo'}
                              </span>
                              <input type="file" accept="image/*" style={{ display: 'none' }} disabled={uploadingId === item.id}
                                onChange={e => { const f = e.target.files?.[0]; if (f) uploadAsset(item, 'company_logo', f); e.target.value = '' }} />
                            </label>
                          )}
                          {item.announcement_status !== 'ready' && item.announcement_status !== 'archived' && (
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
                          <Button variant="red" onClick={() => setDeleteConfirm([item])}>Delete</Button>
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
              <div style={{ fontSize: '16px', fontWeight: 900, color: 'var(--ink)' }}>{editingId ? 'Edit' : 'Add'} {category.kind === 'speaker' ? 'Speaker' : 'Partner'}</div>
              <button onClick={() => setPanelOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--ink3)', fontSize: '18px', cursor: 'pointer' }}>✕</button>
            </div>

            <div style={{ display: 'grid', gap: '12px' }}>
              {category.kind === 'speaker' ? (
                <>
                  <Field label="Full Name *"><Input value={draft.full_name} onChange={e => setDraft(d => ({ ...d, full_name: e.target.value }))} /></Field>
                  <Field label="Job Title *"><Input value={draft.job_title} onChange={e => setDraft(d => ({ ...d, job_title: e.target.value }))} /></Field>
                  <Field label="Company Name *"><Input value={draft.company_name} onChange={e => setDraft(d => ({ ...d, company_name: e.target.value }))} /></Field>
                  <Field label="Country"><Input value={draft.country} onChange={e => setDraft(d => ({ ...d, country: e.target.value }))} /></Field>
                  <Field label="LinkedIn Profile URL"><Input type="url" value={draft.linkedin_url} onChange={e => setDraft(d => ({ ...d, linkedin_url: e.target.value }))} /></Field>
                  <Field label="Bio"><Textarea rows={4} value={draft.bio} onChange={e => setDraft(d => ({ ...d, bio: e.target.value }))} /></Field>
                </>
              ) : (
                <>
                  <Field label="Company Name *"><Input value={draft.company_name} onChange={e => setDraft(d => ({ ...d, company_name: e.target.value }))} /></Field>
                  <Field label="Company Website URL"><Input type="url" value={draft.company_website} onChange={e => setDraft(d => ({ ...d, company_website: e.target.value }))} /></Field>
                  <Field label="Company Description"><Textarea rows={4} value={draft.company_description} onChange={e => setDraft(d => ({ ...d, company_description: e.target.value }))} /></Field>
                  <Field label="Partner Type">
                    <Select value={draft.partner_type} onChange={e => setDraft(d => ({ ...d, partner_type: e.target.value }))}>
                      {['headline_sponsor', 'platinum_sponsor', 'gold_sponsor', 'silver_sponsor', 'bronze_sponsor', 'exhibitor', 'media_partner', 'association_partner', 'ecosystem_partner', 'knowledge_partner', 'official_partner', 'supporting_partner', 'other'].map(t => (
                        <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
                      ))}
                    </Select>
                  </Field>
                </>
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
