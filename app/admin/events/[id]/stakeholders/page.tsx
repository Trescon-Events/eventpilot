'use client'

import { useState, useEffect, use } from 'react'
import PageHeader from '@/app/components/PageHeader'
import { Button, Card, Badge, Input, Select, Textarea } from '@/app/components/ui'
import CalendarView from './CalendarView'
import PhotoCropModal from './PhotoCropModal'
import LogoApprovalModal from './LogoApprovalModal'
import type { Variant, CreativeTemplateConfig } from '@/app/lib/announcements/composite'

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

export default function StakeholderHubPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = use(params)

  const [activeTab, setActiveTab] = useState(CATEGORIES[0].key)
  const [viewMode, setViewMode] = useState<'registry' | 'calendar'>('registry')
  const [speakers, setSpeakers] = useState<Speaker[]>([])
  const [partners, setPartners] = useState<Partner[]>([])
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState<string | null>(null)

  const [panelOpen, setPanelOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<EditDraft>(EMPTY_DRAFT)
  const [saving, setSaving] = useState(false)
  const [uploadingId, setUploadingId] = useState<string | null>(null)
  const [cropTarget, setCropTarget] = useState<Speaker | null>(null)
  const [logoApproval, setLogoApproval] = useState<{ url: string; item: Speaker | Partner; assetType: 'photo' | 'company_logo' | 'logo' } | null>(null)
  const [creativeVariants, setCreativeVariants] = useState<{ speaker: Variant[]; partner: Variant[] }>({ speaker: [], partner: [] })
  const [variantChoice, setVariantChoice] = useState<Record<string, string>>({}) // item id -> chosen variant id

  const category = CATEGORIES.find(c => c.key === activeTab)!

  async function fetchAll() {
    setLoading(true)
    const [spRes, ptRes, tplRes] = await Promise.all([
      fetch(`/api/events/stakeholders/speakers?event_id=${eventId}`),
      fetch(`/api/events/stakeholders/partners?event_id=${eventId}`),
      fetch(`/api/events/templates?event_id=${eventId}`),
    ])
    setSpeakers(await spRes.json().catch(() => []))
    setPartners(await ptRes.json().catch(() => []))
    const config: CreativeTemplateConfig | null = await tplRes.json().catch(() => null)
    setCreativeVariants({ speaker: config?.speaker?.variants ?? [], partner: config?.partner?.variants ?? [] })
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
    if (category.formType) fetchSubmissions(category.formType)
    else setSubmissions([])
  }, [eventId, category.formType])

  const visiblePartners = partners.filter(p => !category.partnerTypes || category.partnerTypes.includes(p.partner_type))

  function openAdd() {
    setEditingId(null)
    setDraft(EMPTY_DRAFT)
    setPanelOpen(true)
  }

  function openEdit(item: Speaker | Partner) {
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

  async function remove(item: Speaker | Partner) {
    const base = category.kind === 'speaker' ? '/api/events/stakeholders/speakers' : '/api/events/stakeholders/partners'
    await fetch(`${base}/${item.id}`, { method: 'DELETE' })
    fetchAll()
  }

  async function uploadAsset(item: Speaker | Partner, assetType: 'photo' | 'company_logo' | 'logo', file: File) {
    setUploadingId(item.id)
    const base = category.kind === 'speaker' ? '/api/events/stakeholders/speakers' : '/api/events/stakeholders/partners'
    const form = new FormData()
    form.append('file', file)
    if (category.kind === 'speaker') form.append('asset_type', assetType)
    const res = await fetch(`${base}/${item.id}/upload-asset`, { method: 'POST', body: form })
    const data = await res.json().catch(() => ({}))
    await fetchAll()
    setUploadingId(null)
    // Offer the crop/zoom tool right after a speaker photo upload — never for
    // company logos or partner logos. The freshly-fetched speaker record (with
    // the new photo_processed_url) is picked up from the next fetchAll() below.
    if (category.kind === 'speaker' && assetType === 'photo') {
      const updated = await fetch(`/api/events/stakeholders/speakers?event_id=${eventId}`).then(r => r.json()).catch(() => [])
      const fresh = (updated as Speaker[]).find(s => s.id === item.id)
      if (fresh?.photo_processed_url) setCropTarget(fresh)
    }
    // Every logo path (partner logo, speaker's own company logo) runs
    // through the Logo Engine automatically — offer a look-and-confirm step
    // rather than trusting the automatic background removal blindly.
    if (assetType === 'company_logo' || assetType === 'logo') {
      const logoUrl = data.company_logo_url || data.logo_url
      if (logoUrl) setLogoApproval({ url: logoUrl, item, assetType })
    }
  }

  async function processSubmission(submission: Submission) {
    const base = category.kind === 'speaker' ? '/api/events/stakeholders/speakers/from-submission' : '/api/events/stakeholders/partners/from-submission'
    const res = await fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ submission_id: submission.id, event_id: eventId }) })
    if (res.ok) { await fetchSubmissions(category.formType!); await fetchAll() } else { setMsg('Could not process this submission.') }
  }

  async function rejectSubmission(submission: Submission) {
    await fetch(`/api/events/stakeholders/submissions/${submission.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'rejected' }) })
    fetchSubmissions(category.formType!)
  }

  async function generateAnnouncement(item: Speaker | Partner) {
    const variantId = variantChoice[item.id]
    const res = await fetch('/api/events/stakeholders/announcements/generate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_id: eventId,
        stakeholder_type: category.kind === 'speaker' ? 'speaker' : 'partner',
        ...(category.kind === 'speaker' ? { speaker_id: item.id } : { partner_id: item.id }),
        ...(variantId ? { variant_id: variantId } : {}),
      }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) setMsg(data.error || 'Announcement generation failed.')
    // The review/approval UI (generator slide-over, Phase F) isn't built yet —
    // for now this just confirms the announcement row + creative were created.
    else setMsg(`Announcement generated (id: ${data.announcement_id}). Review UI is coming in Phase F.`)
  }

  const items: (Speaker | Partner)[] = category.kind === 'speaker' ? speakers : visiblePartners

  return (
    <div style={{ minHeight: '100vh', background: 'var(--surface)' }}>
      <PageHeader
        eyebrow="Event Workspace"
        title="Stakeholder Hub"
        description="Speakers, sponsors, and partners — onboarding, asset review, and announcements for this event."
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
        </div>

        {/* Main content */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
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
              <Button variant="lime" onClick={openAdd}>+ Add {category.kind === 'speaker' ? 'Speaker' : 'Partner'}</Button>
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

          {/* Registry */}
          {loading ? (
            <div style={{ color: 'var(--ink3)', fontSize: '13px' }}>Loading…</div>
          ) : items.length === 0 ? (
            <div style={{ color: 'var(--ink3)', fontSize: '13px', padding: '30px 0', textAlign: 'center' }}>No {category.label.toLowerCase()} yet.</div>
          ) : (
            <div style={{ display: 'grid', gap: '10px' }}>
              {items.map(item => {
                const isSpeaker = category.kind === 'speaker'
                const s = item as Speaker
                const p = item as Partner
                const name  = isSpeaker ? s.full_name : p.company_name
                const thumb = isSpeaker ? (s.photo_processed_url || s.photo_url) : p.logo_url
                const badge = STATUS_BADGE[item.announcement_status]
                return (
                  <Card key={item.id} padded>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
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
                          <label style={{ display: 'inline-flex' }}>
                            <span style={{ padding: '7px 14px', borderRadius: '10px', border: '1.5px solid var(--border)', background: 'transparent', color: 'var(--ink2)', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>
                              {uploadingId === item.id ? 'Uploading…' : isSpeaker ? 'Upload Photo' : 'Upload Logo'}
                            </span>
                            <input type="file" accept="image/*" style={{ display: 'none' }} disabled={uploadingId === item.id}
                              onChange={e => { const f = e.target.files?.[0]; if (f) uploadAsset(item, isSpeaker ? 'photo' : 'logo', f); e.target.value = '' }} />
                          </label>
                          {isSpeaker && (
                            <label style={{ display: 'inline-flex' }}>
                              <span style={{ padding: '7px 14px', borderRadius: '10px', border: '1.5px solid var(--border)', background: 'transparent', color: 'var(--ink2)', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>
                                Upload Company Logo
                              </span>
                              <input type="file" accept="image/*" style={{ display: 'none' }} disabled={uploadingId === item.id}
                                onChange={e => { const f = e.target.files?.[0]; if (f) uploadAsset(item, 'company_logo', f); e.target.value = '' }} />
                            </label>
                          )}
                          {creativeVariants[category.kind].length > 1 && (
                            <Select value={variantChoice[item.id] ?? creativeVariants[category.kind][0]?.id ?? ''}
                              onChange={e => setVariantChoice(v => ({ ...v, [item.id]: e.target.value }))}
                              style={{ width: 'auto' }}>
                              {creativeVariants[category.kind].map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                            </Select>
                          )}
                          <Button variant="solid" disabled={item.announcement_status !== 'ready'} onClick={() => generateAnnouncement(item)}>
                            Generate Announcement ▶
                          </Button>
                          <Button variant="ghost" onClick={() => remove(item)}>Archive</Button>
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
        </div>
      </div>

      {cropTarget?.photo_processed_url && (
        <PhotoCropModal
          speakerId={cropTarget.id}
          photoUrl={cropTarget.photo_processed_url}
          onClose={() => setCropTarget(null)}
          onCropped={fetchAll}
        />
      )}

      {logoApproval && (
        <LogoApprovalModal
          logoUrl={logoApproval.url}
          onClose={() => setLogoApproval(null)}
          onReupload={file => { const { item, assetType } = logoApproval; setLogoApproval(null); uploadAsset(item, assetType, file) }}
        />
      )}

      {/* Add/Edit slide-over */}
      {panelOpen && (
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
