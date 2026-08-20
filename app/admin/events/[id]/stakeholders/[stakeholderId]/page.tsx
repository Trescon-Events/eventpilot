'use client'

import { use, useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { Download } from 'lucide-react'
import PageHeader from '@/app/components/PageHeader'
import { permissionSetSatisfies } from '@/app/lib/access/permission-match'
import { Button, Card, Badge, Select, Input, Textarea, ProcessingOverlay } from '@/app/components/ui'
import { FormFieldInput } from '@/app/components/forms/FormFieldInput'
import { FieldSchema, FormType, SubmittedValue } from '@/app/lib/forms/types'
import { downloadFile } from '@/app/lib/download-file'
import { useBreadcrumbLabel } from '@/app/lib/nav/breadcrumb-labels'
import PhotoUploadModal from '../PhotoUploadModal'
import LogoApprovalModal from '../LogoApprovalModal'
import HeadBoxEditorModal from '../HeadBoxEditorModal'
import AnnouncementsTab from './AnnouncementsTab'
import type { Speaker as SaeSpeaker, Partner as SaePartner } from '../../creative-templates/page'

/* The generic, canonical full-page review/edit screen for a single
   stakeholder (Speaker or any Partner category) — replaces the old 440px
   side-panel + separate inline card action buttons. Reached from: the
   Submissions Inbox's "Process" button, the registry's "Edit" link, and
   after a manual "+ Add" create. `kind` (speaker|partner) and, for
   partners, `formType` (which field schema to resolve — defaults 'sponsor'
   for categories with no dedicated form, e.g. Exhibitors/Ecosystem
   Partners) come from the query string, since event_speakers/event_sponsors
   are two separate tables/id-spaces with no shared lookup.

   Auto-save: debounced 700ms after the last edit, flushed immediately on
   blur, PATCHes the whole current `fields` map each time (same contract
   every other caller of this route already uses) — there was no existing
   per-field autosave pattern anywhere in this codebase to reuse, so this is
   new. The PATCH route itself (see speakers|partners/[id]/route.ts) resets
   an already-`ready` record back to `pending_review` on any data-changing
   write that doesn't also explicitly set announcement_status — this page
   just reflects that reset back in the UI (reapprovalBanner) rather than
   enforcing it client-side. */

type Kind = 'speaker' | 'partner'
type AnnouncementStatus = 'pending_review' | 'approved' | 'assets_missing' | 'ready' | 'archived'

type StakeholderRecord = {
  id: string; event_id: string
  full_name?: string; job_title?: string; company_name?: string
  country?: string | null; bio?: string | null; linkedin_url?: string | null
  photo_url?: string | null; photo_processed_url?: string | null
  website_card_url?: string | null
  company_logo_url?: string | null; company_logo_raw_url?: string | null
  photo_head_box?: { centerXRatio: number; centerYRatio: number; heightRatio: number } | null
  company_website?: string | null; company_description?: string | null
  partner_type?: string
  public_name?: string | null; salutation?: string | null
  pronoun_style?: 'he_him' | 'she_her' | 'his_excellency' | 'her_excellency' | 'his_highness' | 'her_highness' | null
  key_talking_points?: string | null
  logo_url?: string | null; logo_raw_url?: string | null
  email?: string | null
  announcement_status: AnnouncementStatus
  source: 'onboarding_form' | 'manual'
  notes: string | null
  fields: Record<string, SubmittedValue>
}

// One preview tile — raw or cleaned photo/logo — with a download icon and a
// click-to-enlarge lightbox. Uniform size regardless of which asset is
// present so the row stays neatly aligned (2026-08-14, per Madhu: the old
// layout looked "misaligned" when e.g. a photo existed but no logo yet).
// `badge` (2026-08-15, per Madhu) overlays a small status pill directly on
// the thumbnail itself — e.g. whether the head-position override has been
// set for the Cleaned Photo tile — rather than relying solely on a
// checkmark on a separate button below, which is easy to miss.
function AssetTile({ label, url, filename, onOpen, badge }: {
  label: string; url: string | null | undefined; filename: string
  onOpen: (url: string, label: string) => void
  badge?: { text: string; tone: 'success' | 'amber' }
}) {
  return (
    <div>
      <div style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--ink4)', marginBottom: '7px', textTransform: 'uppercase', letterSpacing: '0.4px' }}>{label}</div>
      <div
        onClick={url ? () => onOpen(url, label) : undefined}
        style={{
          width: '132px', height: '132px', borderRadius: '10px', overflow: 'hidden', padding: url ? '8px' : 0,
          background: 'repeating-conic-gradient(var(--border-light) 0% 25%, var(--surface) 0% 50%) 50% / 14px 14px',
          border: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: url ? 'zoom-in' : 'default', position: 'relative',
        }}
      >
        {url
          // eslint-disable-next-line @next/next/no-img-element -- checkerboard preview needs the real image, not a next/image optimization pass
          ? <img src={url} alt={label} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
          : <span style={{ fontSize: '11.5px', color: 'var(--ink4)' }}>None</span>}
        {url && badge && (
          <div style={{
            position: 'absolute', top: '5px', left: '5px', right: '5px',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '3px',
            padding: '3px 6px', borderRadius: '6px', fontSize: '9.5px', fontWeight: 800, letterSpacing: '0.2px',
            background: badge.tone === 'success' ? 'color-mix(in srgb, var(--success) 88%, transparent)' : 'color-mix(in srgb, var(--amber) 88%, transparent)',
            color: badge.tone === 'success' ? 'var(--success-light)' : 'var(--amber-light)',
          }}>
            {badge.tone === 'success' ? '✓ ' : '⚠ '}{badge.text}
          </div>
        )}
      </div>
      <button
        onClick={() => url && downloadFile(url, filename).catch(() => {})}
        disabled={!url}
        title={url ? 'Download' : undefined}
        style={{
          marginTop: '7px', display: 'flex', alignItems: 'center', gap: '4px', background: 'none', border: 'none',
          color: url ? 'var(--ink3)' : 'var(--ink4)', fontSize: '12px', fontWeight: 600, cursor: url ? 'pointer' : 'default',
          padding: 0, opacity: url ? 1 : 0.4,
        }}
      >
        <Download size={12} /> Download
      </button>
    </div>
  )
}

const PARTNER_TYPES = [
  'headline_sponsor', 'platinum_sponsor', 'gold_sponsor', 'silver_sponsor', 'bronze_sponsor',
  'exhibitor', 'media_partner', 'association_partner', 'ecosystem_partner',
  'knowledge_partner', 'official_partner', 'supporting_partner', 'sponsor', 'other',
]

// Third-person reference style for org-promo copy (2026-08-18) — deliberately
// small/closed; extending it needs a DB constraint change, not just this list.
const PRONOUN_STYLES: { value: string; label: string }[] = [
  { value: 'he_him', label: 'He / Him' },
  { value: 'she_her', label: 'She / Her' },
  { value: 'his_excellency', label: 'His Excellency' },
  { value: 'her_excellency', label: 'Her Excellency' },
  { value: 'his_highness', label: 'His Highness' },
  { value: 'her_highness', label: 'Her Highness' },
]

const STATUS_BADGE: Record<AnnouncementStatus, { label: string; color: 'amber' | 'red' | 'teal' | 'grey' }> = {
  pending_review: { label: 'Pending Review', color: 'amber' },
  assets_missing: { label: 'Assets Missing', color: 'red' },
  approved:       { label: 'Approved', color: 'teal' },
  ready:          { label: 'Ready', color: 'teal' },
  archived:       { label: 'Archived', color: 'grey' },
}

const SAVE_DEBOUNCE_MS = 700

export default function StakeholderReviewPage({ params }: { params: Promise<{ id: string; stakeholderId: string }> }) {
  const { id: eventId, stakeholderId } = use(params)
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const kind: Kind = searchParams.get('kind') === 'partner' ? 'partner' : 'speaker'
  const formType: FormType = kind === 'speaker' ? 'speaker' : ((searchParams.get('formType') as FormType | null) ?? 'sponsor')
  const base = kind === 'speaker' ? '/api/events/stakeholders/speakers' : '/api/events/stakeholders/partners'
  // Announcements tab (2026-08-18, SAE-into-Hub merge) — ?tab=announcements
  // (+ optional ?announcement=X) is how Queue's "Open" links land directly
  // on one creative's review panel, same deep-link idea SAE's own page used.
  const activeTab: 'overview' | 'announcements' = searchParams.get('tab') === 'announcements' ? 'announcements' : 'overview'
  const initialAnnouncementId = searchParams.get('announcement')

  const [record, setRecord] = useState<StakeholderRecord | null>(null)
  const [eventName, setEventName] = useState<string | null>(null)
  const [schema, setSchema] = useState<FieldSchema[]>([])
  const [values, setValues] = useState<Record<string, SubmittedValue>>({})
  const [partnerType, setPartnerType] = useState('sponsor')
  // Speaker-only, producer-editable, NOT part of the onboarding form
  // (2026-08-18) — public_name overrides `full_name` everywhere
  // public-facing content is generated (creatives, both org-promo and
  // self-promo post copy, future website), same fallback pattern as
  // events.public_name. pronoun_style/key_talking_points ground the AI
  // copy generators. salutation is different from public_name — it's real
  // data the live onboarding form already captures but was never mapped
  // to anything, used specifically for addressing the speaker correctly
  // in email (not creatives/post copy).
  const [publicName, setPublicName] = useState('')
  const [salutation, setSalutation] = useState('')
  const [pronounStyle, setPronounStyle] = useState('')
  const [keyTalkingPoints, setKeyTalkingPoints] = useState('')
  const [status, setStatus] = useState<AnnouncementStatus>('pending_review')
  const [loading, setLoading] = useState(true)
  const [permissions, setPermissions] = useState<Set<string>>(new Set())
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [reapprovalBanner, setReapprovalBanner] = useState(false)
  const [approving, setApproving] = useState(false)
  const [generatingWebsitePhoto, setGeneratingWebsitePhoto] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const [photoUploadTarget, setPhotoUploadTarget] = useState<File | null>(null)
  const [logoApproval, setLogoApproval] = useState<{ url: string } | null>(null)
  const [headBoxOpen, setHeadBoxOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  // estimatedMs per action, from real observed timings (dev log) — a plain
  // PATCH (approve/remove-logo) resolves in well under a second; logo
  // upload+processing (rasterize/background-removal) ran 0.5-3.1s for a
  // small test file, so 4.5s is a realistic estimate once real client
  // logos (larger, PDF/AI, etc.) are in the mix.
  const [processing, setProcessing] = useState<{ label: string; estimatedMs: number } | null>(null)
  const [lightbox, setLightbox] = useState<{ url: string; label: string } | null>(null)

  useEffect(() => {
    if (!lightbox) return
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') setLightbox(null) }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [lightbox])

  const can = (key: string) => permissionSetSatisfies(permissions, key)

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const valuesRef = useRef(values)
  const partnerTypeRef = useRef(partnerType)
  const publicNameRef = useRef(publicName)
  const salutationRef = useRef(salutation)
  const pronounStyleRef = useRef(pronounStyle)
  const keyTalkingPointsRef = useRef(keyTalkingPoints)
  useEffect(() => { valuesRef.current = values }, [values])
  useEffect(() => { partnerTypeRef.current = partnerType }, [partnerType])
  useEffect(() => { publicNameRef.current = publicName }, [publicName])
  useEffect(() => { salutationRef.current = salutation }, [salutation])
  useEffect(() => { pronounStyleRef.current = pronounStyle }, [pronounStyle])
  useEffect(() => { keyTalkingPointsRef.current = keyTalkingPoints }, [keyTalkingPoints])

  const load = useCallback(async () => {
    const [recRes, schemaRes, permRes, eventRes] = await Promise.all([
      fetch(`${base}/${stakeholderId}${kind === 'partner' ? `?form_type=${formType}` : ''}`),
      fetch(`/api/events/stakeholders/forms/${formType}/schema?event_id=${eventId}`),
      fetch(`/api/events/access/me?event_id=${eventId}`),
      fetch(`/api/events?id=${eventId}`),
    ])
    if (recRes.ok) {
      const data = await recRes.json()
      setRecord(data)
      setValues(data.fields ?? {})
      setStatus(data.announcement_status)
      if (kind === 'partner') setPartnerType(data.partner_type ?? 'sponsor')
      if (kind === 'speaker') {
        setPublicName(data.public_name ?? '')
        setSalutation(data.salutation ?? '')
        setPronounStyle(data.pronoun_style ?? '')
        setKeyTalkingPoints(data.key_talking_points ?? '')
      }
    } else {
      setMsg('Could not load this record.')
    }
    const schemaData = await schemaRes.json().catch(() => ({ fields: [] }))
    setSchema(schemaData.fields ?? [])
    const permData = await permRes.json().catch(() => ({ permissions: [] }))
    setPermissions(new Set(permData.permissions ?? []))
    const eventData = await eventRes.json().catch(() => null)
    setEventName(eventData?.name ?? null)
    setLoading(false)
  }, [base, stakeholderId, kind, formType, eventId])

  // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount, matches the Hub page's own fetchAll effect
  useEffect(() => { load() }, [load])
  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current) }, [])

  // Breadcrumb trail (GlobalShell) has no way to know an event's real name
  // or this stakeholder's name on its own — see breadcrumb-labels.tsx.
  // Computed ahead of the loading-state early return below since hooks
  // can't follow it; the record-derived fields are simply undefined until
  // load() resolves, and the hook itself already no-ops on falsy input.
  const stakeholderName = record && (kind === 'speaker'
    ? (typeof values.full_name === 'string' && values.full_name) || record.full_name
    : (typeof values.company_name === 'string' && values.company_name) || record.company_name)
  useBreadcrumbLabel(eventId, eventName)
  useBreadcrumbLabel(stakeholderId, stakeholderName || null)

  const flushSave = useCallback(async () => {
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null }
    setSaveState('saving')
    const body: Record<string, unknown> = { fields: valuesRef.current }
    if (kind === 'partner') { body.form_type = formType; body.partner_type = partnerTypeRef.current }
    if (kind === 'speaker') {
      body.public_name = publicNameRef.current.trim() || null
      body.salutation = salutationRef.current.trim() || null
      body.pronoun_style = pronounStyleRef.current || null
      body.key_talking_points = keyTalkingPointsRef.current.trim() || null
    }
    try {
      const res = await fetch(`${base}/${stakeholderId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      if (!res.ok) { setSaveState('error'); return }
      const data = await res.json()
      setSaveState('saved')
      setTimeout(() => setSaveState(s => (s === 'saved' ? 'idle' : s)), 2000)
      if (data.announcement_status && data.announcement_status !== status) {
        if (data.announcement_status === 'pending_review' && status === 'ready') setReapprovalBanner(true)
        setStatus(data.announcement_status)
      }
    } catch {
      setSaveState('error')
    }
  }, [base, stakeholderId, kind, formType, status])

  function scheduleSave() {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => { flushSave() }, SAVE_DEBOUNCE_MS)
  }

  function updateValue(key: string, value: SubmittedValue) {
    setValues(prev => ({ ...prev, [key]: value }))
    scheduleSave()
  }

  async function approve() {
    setApproving(true)
    setProcessing({ label: 'Approving…', estimatedMs: 900 })
    try {
      const res = await fetch(`${base}/${stakeholderId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ announcement_status: 'ready' }),
      })
      if (res.ok) { setStatus('ready'); setReapprovalBanner(false) } else { setMsg('Could not approve — please try again.') }
    } catch {
      setMsg('Could not approve — check your connection and try again.')
    } finally {
      setApproving(false)
      setProcessing(null)
    }
  }

  async function generateWebsitePhoto() {
    setGeneratingWebsitePhoto(true)
    // 2026-08-19: deterministic crop + background composite, no AI step —
    // always fast; this estimate just paces the progress bar reasonably.
    setProcessing({ label: 'Generating website photo…', estimatedMs: 3000 })
    setMsg(null)
    try {
      const res = await fetch('/api/events/stakeholders/speakers/website-photo/generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_id: eventId, speaker_id: stakeholderId }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setRecord(prev => prev ? { ...prev, website_card_url: data.website_card_url } : prev)
      } else {
        setMsg(data.error || 'Could not generate the website photo — please try again.')
      }
    } catch {
      setMsg('Could not generate the website photo — check your connection and try again.')
    } finally {
      setGeneratingWebsitePhoto(false)
      setProcessing(null)
    }
  }

  async function uploadLogo(file: File) {
    setUploading(true)
    setProcessing({ label: 'Uploading & processing logo…', estimatedMs: 4500 })
    setMsg(null)
    const form = new FormData()
    form.append('file', file)
    if (kind === 'speaker') form.append('asset_type', 'company_logo')
    let res: Response
    try {
      res = await fetch(`${base}/${stakeholderId}/upload-asset`, { method: 'POST', body: form })
    } catch (e) {
      setUploading(false)
      setProcessing(null)
      setMsg(`Could not upload logo: ${(e as Error).message}`)
      return
    }
    const data = await res.json().catch(() => ({}))
    setUploading(false)
    setProcessing(null)
    if (!res.ok) { setMsg(data?.error ?? `Could not upload logo (${res.status}).`); return }
    const logoUrl = data.company_logo_url || data.logo_url
    if (logoUrl) setLogoApproval({ url: logoUrl })
    else setMsg('Upload succeeded but no logo URL was returned — please try again.')
    await load()
  }

  async function removeCompanyLogo() {
    setUploading(true)
    setProcessing({ label: 'Removing logo…', estimatedMs: 800 })
    try {
      const res = await fetch(`${base}/${stakeholderId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ remove_company_logo: true }),
      })
      if (!res.ok) { setMsg('Could not remove the logo — please try again.'); return }
      await load()
    } catch {
      setMsg('Could not remove the logo — check your connection and try again.')
    } finally {
      setUploading(false)
      setProcessing(null)
    }
  }

  function setTab(tab: 'overview' | 'announcements') {
    const params = new URLSearchParams(searchParams.toString())
    params.set('tab', tab)
    if (tab === 'overview') params.delete('announcement')
    router.replace(`${pathname}?${params.toString()}`)
  }

  if (loading || !record) {
    return <div style={{ minHeight: '100vh', background: 'var(--surface)', padding: '32px', color: 'var(--ink3)' }}>Loading…</div>
  }

  const name = stakeholderName
  const badge = STATUS_BADGE[status]
  const canEdit = can('sae.stakeholders.edit')
  const canApprove = can('sae.approvals.approve')
  const showApprove = canApprove && status !== 'archived' && (status !== 'ready' || reapprovalBanner)

  // No separate "raw photo" tile — the true pre-processing original is
  // never persisted to storage at all (see upload-asset/route.ts), and
  // Madhu clarified photo_url (the resized, background-INTACT copy) reads
  // as "the finished photo" to a reviewer either way — so this just shows
  // whichever's actually available under one "Cleaned Photo" tile, same
  // fallback the rest of the app already uses everywhere else.
  const cleanPhoto = record.photo_processed_url ?? record.photo_url ?? null
  // Raw logo, unlike raw photo, IS always kept (logo-engine.ts persists the
  // untouched upload) and is worth reviewing on its own — required per Madhu.
  const rawLogo = (kind === 'speaker' ? record.company_logo_raw_url : record.logo_raw_url) ?? null
  const cleanLogo = (kind === 'speaker' ? record.company_logo_url : record.logo_url) ?? null
  const namePrefix = (name || 'stakeholder').replace(/\s+/g, '-')

  // Adapted to SAE's own Speaker/Partner shape (app/admin/events/[id]/
  // creative-templates/page.tsx) so AnnouncementsTab can hand this straight
  // to AnnouncementDetailPanel/CreateAnnouncementForStakeholder without a
  // second, diverging stakeholder type to keep in sync.
  const stakeholderForPanel: SaeSpeaker | SaePartner = kind === 'speaker'
    ? {
        id: record.id,
        full_name: name || '',
        job_title: record.job_title ?? '',
        company_name: record.company_name ?? '',
        photo_url: record.photo_url ?? null,
        photo_processed_url: record.photo_processed_url ?? null,
        company_logo_url: record.company_logo_url ?? null,
        announcement_status: status,
        email: record.email ?? null,
        public_name: record.public_name ?? null,
      }
    : {
        id: record.id,
        company_name: name || '',
        partner_type: record.partner_type ?? 'sponsor',
        logo_url: record.logo_url ?? null,
        announcement_status: status,
      }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--surface)' }}>
      <PageHeader
        eyebrow="Stakeholder Hub"
        title={name || (kind === 'speaker' ? 'New Speaker' : 'New Partner')}
        description={<Badge color={badge.color}>{badge.label}</Badge>}
        backHref={`/admin/events/${eventId}/stakeholders`}
        backLabel="Back to Stakeholder Hub"
      />

      <div style={{ maxWidth: '1240px', margin: '0 auto', padding: '20px 32px 0' }}>
        <div style={{ display: 'flex', gap: '6px', borderBottom: '1px solid var(--border-light)' }}>
          {(['overview', 'announcements'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              style={{
                padding: '10px 18px', border: 'none', borderBottom: activeTab === t ? '2px solid var(--teal-mid)' : '2px solid transparent',
                background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', fontSize: '13px', fontWeight: 700,
                color: activeTab === t ? 'var(--ink)' : 'var(--ink3)', marginBottom: '-1px',
              }}>
              {t === 'overview' ? 'Overview' : 'Announcements'}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'announcements' && (
        <div style={{ maxWidth: '1240px', margin: '0 auto', padding: '24px 32px' }}>
          <AnnouncementsTab
            eventId={eventId}
            stakeholderId={stakeholderId}
            stakeholderType={kind}
            stakeholder={stakeholderForPanel}
            initialAnnouncementId={initialAnnouncementId}
          />
        </div>
      )}

      {activeTab === 'overview' && (
      <div style={{ maxWidth: '1240px', margin: '0 auto', padding: '24px 32px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 300px', gap: '24px', alignItems: 'start' }}>
        <div style={{ display: 'grid', gap: '20px', minWidth: 0 }}>
          {msg && (
            <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'var(--red-light)', border: '1px solid var(--red-border)', color: 'var(--red)', fontSize: '14.5px' }}>
              {msg} <button onClick={() => setMsg(null)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontWeight: 700, marginLeft: '8px' }}>×</button>
            </div>
          )}

          {/* Photo / Logo */}
          <Card padded>
            <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--ink)', marginBottom: '16px' }}>
              {kind === 'speaker' ? 'Photo & Company Logo' : 'Logo'}
            </div>

            <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', marginBottom: '18px' }}>
              {kind === 'speaker' && (
                <AssetTile
                  label="Cleaned Photo" url={cleanPhoto} filename={`${namePrefix}-photo-clean.png`}
                  onOpen={(url, label) => setLightbox({ url, label })}
                  badge={record.photo_head_box ? { text: 'Head Fixed', tone: 'success' } : { text: 'Head Not Set', tone: 'amber' }}
                />
              )}
              <AssetTile label="Raw Logo" url={rawLogo} filename={`${namePrefix}-logo-raw.png`} onOpen={(url, label) => setLightbox({ url, label })} />
              <AssetTile label="Cleaned Logo" url={cleanLogo} filename={`${namePrefix}-logo-clean.png`} onOpen={(url, label) => setLightbox({ url, label })} />
            </div>

            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', paddingTop: '16px', borderTop: '1px solid var(--border-light)' }}>
              {kind === 'speaker' && (
                <>
                  <label style={{ display: 'inline-flex' }}>
                    <span style={{ padding: '7px 14px', borderRadius: '10px', border: '1.5px solid var(--border)', color: 'var(--ink2)', fontSize: '14.5px', fontWeight: 700, cursor: 'pointer' }}>
                      {cleanPhoto ? 'Replace Photo' : 'Upload Photo'}
                    </span>
                    <input type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }}
                      onChange={e => { const f = e.target.files?.[0]; if (f) setPhotoUploadTarget(f); e.target.value = '' }} />
                  </label>
                  {cleanPhoto && (
                    <Button variant="ghost" onClick={() => setHeadBoxOpen(true)}>
                      {record.photo_head_box ? '✓ Fix Head Position' : 'Fix Head Position'}
                    </Button>
                  )}
                </>
              )}
              <label style={{ display: 'inline-flex' }}>
                <span style={{ padding: '7px 14px', borderRadius: '10px', border: '1.5px solid var(--border)', color: 'var(--ink2)', fontSize: '14.5px', fontWeight: 700, cursor: uploading ? 'default' : 'pointer' }}>
                  {uploading ? 'Uploading…' : (cleanLogo ? 'Replace Logo' : 'Upload Logo')}
                </span>
                <input type="file" accept="image/*,.pdf,.ai,.svg,.eps,.psd,.psb,.bmp,.ico,.cur,.tif,.tiff,.heic,.heif" style={{ display: 'none' }} disabled={uploading}
                  onChange={e => { const f = e.target.files?.[0]; if (f) uploadLogo(f); e.target.value = '' }} />
              </label>
              {kind === 'speaker' && cleanLogo && (
                <Button variant="ghost" onClick={removeCompanyLogo} disabled={uploading}>Remove Logo</Button>
              )}
            </div>
          </Card>

          {/* Website Photo (2026-08-18/19) — a separate, square speaker
              card photo for the public Speakers page/KonfHub, generated
              from the same Cleaned Photo above but not the same asset.
              Deterministic crop + background composite only, no AI step —
              see composite.ts's Variant.category doc comment for why an AI
              lighting/style step was tried and abandoned. Speaker-only —
              partners have no equivalent. Not gated on approval status,
              same as SAE's own Create New: just the generate permission +
              having a cleaned photo to start from. */}
          {kind === 'speaker' && (
            <Card padded>
              <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--ink)', marginBottom: '16px' }}>Website Photo</div>
              <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', marginBottom: '18px' }}>
                <AssetTile
                  label="Website Photo" url={record.website_card_url ?? null} filename={`${namePrefix}-website-photo.png`}
                  onOpen={(url, label) => setLightbox({ url, label })}
                />
              </div>
              {can('sae.announcements.generate') && (
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', paddingTop: '16px', borderTop: '1px solid var(--border-light)' }}>
                  <Button variant="ghost" onClick={generateWebsitePhoto} disabled={!cleanPhoto || generatingWebsitePhoto}
                    title={!cleanPhoto ? 'Upload and clean a photo first' : undefined}>
                    {generatingWebsitePhoto ? 'Generating…' : record.website_card_url ? 'Regenerate Website Photo' : 'Generate Website Photo'}
                  </Button>
                </div>
              )}
            </Card>
          )}

          {/* Fields */}
          <Card padded>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--ink)' }}>Details</div>
              <div style={{ fontSize: '13.5px', color: 'var(--ink4)' }}>
                {saveState === 'saving' && 'Saving…'}
                {saveState === 'saved' && 'Saved ✓'}
                {saveState === 'error' && (
                  <span style={{ color: 'var(--red)' }}>
                    Save failed — <button onClick={flushSave} style={{ background: 'none', border: 'none', color: 'var(--red)', textDecoration: 'underline', cursor: 'pointer', fontWeight: 700 }}>retry</button>
                  </span>
                )}
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '18px' }}>
              {schema.filter(f => f.type !== 'file').map(field => (
                <div key={field.id} style={(field.type === 'textarea' || field.type === 'checkbox') ? { gridColumn: '1 / -1' } : undefined}>
                  <FormFieldInput
                    field={field}
                    value={values[field.key] ?? (field.type === 'multiselect' ? [] : '')}
                    onChange={v => updateValue(field.key, v)}
                    onBlur={flushSave}
                    disabled={!canEdit}
                    size="large"
                  />
                </div>
              ))}
              {kind === 'partner' && (
                <div>
                  <label style={{ fontSize: '16px', fontWeight: 700, color: 'var(--ink3)', display: 'block', marginBottom: '7px' }}>Partner Type</label>
                  <Select
                    className="tfield-lg" value={partnerType} disabled={!canEdit} onBlur={flushSave}
                    onChange={e => { setPartnerType(e.target.value); scheduleSave() }}
                  >
                    {PARTNER_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
                  </Select>
                </div>
              )}
              {kind === 'speaker' && (
                <>
                  <div>
                    <label style={{ fontSize: '16px', fontWeight: 700, color: 'var(--ink3)', display: 'block', marginBottom: '7px' }}>Public Name</label>
                    <Input
                      className="tfield-lg" value={publicName} disabled={!canEdit} onBlur={flushSave}
                      placeholder="Exact name to use everywhere public-facing"
                      onChange={e => { setPublicName(e.target.value); scheduleSave() }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '16px', fontWeight: 700, color: 'var(--ink3)', display: 'block', marginBottom: '7px' }}>Salutation</label>
                    <Input
                      className="tfield-lg" value={salutation} disabled={!canEdit} onBlur={flushSave}
                      placeholder="e.g. Dr., Prof., Datuk"
                      onChange={e => { setSalutation(e.target.value); scheduleSave() }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '16px', fontWeight: 700, color: 'var(--ink3)', display: 'block', marginBottom: '7px' }}>Pronoun / Honorific Style</label>
                    <Select
                      className="tfield-lg" value={pronounStyle} disabled={!canEdit} onBlur={flushSave}
                      onChange={e => { setPronounStyle(e.target.value); scheduleSave() }}
                    >
                      <option value="">Not set</option>
                      {PRONOUN_STYLES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                    </Select>
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={{ fontSize: '16px', fontWeight: 700, color: 'var(--ink3)', display: 'block', marginBottom: '7px' }}>Key Talking Points</label>
                    <Textarea
                      className="tfield-lg" value={keyTalkingPoints} disabled={!canEdit} onBlur={flushSave}
                      placeholder="What this speaker will specifically cover — used to ground the AI-generated post copy"
                      rows={3}
                      onChange={e => { setKeyTalkingPoints(e.target.value); scheduleSave() }}
                    />
                  </div>
                </>
              )}
            </div>
          </Card>
        </div>

        {/* Save + Approve — floating on the right, stays visible while scrolling
            the fields above. Auto-save already fires silently on every edit
            (see flushSave/scheduleSave), but Madhu asked for an explicit,
            hard-to-miss Save button here too — the existing "Saving…/Saved ✓"
            text only lives up near the Details card header, easy to scroll
            past without noticing (2026-08-15: "there is no way to user to
            know.. they'll keep guessing"). This button calls the same
            flushSave() as blur/debounce, just gives it an obvious trigger
            and a confirmation state right where the user is looking. */}
        <div style={{ position: 'sticky', top: '20px', display: 'grid', gap: '14px' }}>
          <Card padded>
            <div style={{ fontSize: '13.5px', color: 'var(--ink3)', marginBottom: '10px' }}>
              {saveState === 'saving' && 'Saving…'}
              {saveState === 'saved' && 'All changes saved ✓'}
              {saveState === 'error' && <span style={{ color: 'var(--red)' }}>Save failed — try again.</span>}
              {saveState === 'idle' && 'Changes auto-save as you type.'}
            </div>
            <Button variant="indigo" onClick={flushSave} disabled={saveState === 'saving' || !canEdit} className="tbtn-full">
              {saveState === 'saving' ? 'Saving…' : 'Save'}
            </Button>
          </Card>
          <Card padded color={status === 'ready' && !reapprovalBanner ? 'teal' : 'amber'}>
            <div style={{ fontSize: '15.5px', fontWeight: 800, color: 'var(--ink)' }}>
              {status === 'ready' && !reapprovalBanner ? 'Approved for Announcement' : 'Ready to approve?'}
            </div>
            <div style={{ fontSize: '14px', color: 'var(--ink3)', marginTop: '6px', lineHeight: 1.5 }}>
              {status === 'ready' && !reapprovalBanner
                ? 'This stakeholder is live for the Stakeholder Announcement Engine.'
                : reapprovalBanner
                ? 'Edited since approval — re-approve to update the announcement with the latest data.'
                : 'Review the photo, logo, and details, then approve to make this stakeholder available for announcements.'}
            </div>
            {showApprove && (
              <div style={{ marginTop: '14px' }}>
                <Button variant="teal" onClick={approve} disabled={approving} className="tbtn-full">
                  {approving ? 'Approving…' : 'Approve for Announcement'}
                </Button>
              </div>
            )}
          </Card>
        </div>
        </div>
      </div>
      )}

      <ProcessingOverlay active={!!processing} label={processing?.label} estimatedMs={processing?.estimatedMs} />

      {lightbox && (
        <div
          onClick={() => setLightbox(null)}
          style={{ position: 'fixed', inset: 0, background: 'color-mix(in srgb, black 78%, transparent)', zIndex: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px', cursor: 'zoom-out' }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- full-size lightbox needs the real image, not a next/image optimization pass */}
          <img src={lightbox.url} alt={lightbox.label} onClick={e => e.stopPropagation()} style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: '10px', boxShadow: 'var(--shadow-md)', cursor: 'default' }} />
        </div>
      )}

      {photoUploadTarget && (
        <PhotoUploadModal
          speakerId={stakeholderId}
          initialFile={photoUploadTarget}
          onClose={() => setPhotoUploadTarget(null)}
          onDone={load}
        />
      )}
      {logoApproval && (
        <LogoApprovalModal
          logoUrl={logoApproval.url}
          onClose={() => setLogoApproval(null)}
          onReupload={file => { setLogoApproval(null); uploadLogo(file) }}
        />
      )}
      {headBoxOpen && (
        <HeadBoxEditorModal
          speakerId={stakeholderId}
          photoUrl={(record.photo_processed_url || record.photo_url)!}
          currentHeadBox={record.photo_head_box ?? null}
          onClose={() => setHeadBoxOpen(false)}
          onDone={load}
        />
      )}
    </div>
  )
}
