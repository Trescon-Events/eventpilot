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
import { PRONOUN_STYLES } from '@/app/lib/events/pronoun-styles'
import LogoApprovalModal from '../LogoApprovalModal'
import PhotoCleaningWizard from '../PhotoCleaningWizard'
import KonfhubPushConfirmModal from '../KonfhubPushConfirmModal'
import KonfhubRegistrationPushConfirmModal from '../KonfhubRegistrationPushConfirmModal'
import { SPEAKER_KEY_MAP } from '@/app/lib/forms/map-to-stakeholder-record'
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
  photo_low_resolution?: boolean
  photo_cleaning_cycle_done?: boolean
  website_photo_crop_warning?: { left: number; top: number; right: number; bottom: number } | null
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
  konfhub_speaker_id?: string | null
  konfhub_synced_at?: string | null
  konfhub_booking_id?: string | null
  konfhub_registration_synced_at?: string | null
}

// One preview tile — raw or cleaned photo/logo — with a download icon and a
// click-to-enlarge lightbox. Uniform size regardless of which asset is
// present so the row stays neatly aligned (2026-08-14, per Madhu: the old
// layout looked "misaligned" when e.g. a photo existed but no logo yet).
// `badge` (2026-08-15, per Madhu) overlays a small status pill directly on
// the thumbnail itself — e.g. whether the head-position override has been
// set for the Cleaned Photo tile — rather than relying solely on a
// checkmark on a separate button below, which is easy to miss.
function AssetTile({ label, url, filename, onOpen, badge, badges, size }: {
  label: string; url: string | null | undefined; filename: string
  onOpen: (url: string, label: string) => void
  badge?: { text: string; tone: 'success' | 'amber' }
  badges?: { text: string; tone: 'success' | 'amber' }[]
  size?: number
}) {
  const allBadges = badges ?? (badge ? [badge] : [])
  const tileSize = size ?? 132
  return (
    <div>
      <div style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--ink4)', marginBottom: '7px', textTransform: 'uppercase', letterSpacing: '0.4px' }}>{label}</div>
      <div
        onClick={url ? () => onOpen(url, label) : undefined}
        style={{
          width: `${tileSize}px`, height: `${tileSize}px`, borderRadius: '10px', overflow: 'hidden', padding: url ? '8px' : 0,
          background: 'repeating-conic-gradient(var(--border-light) 0% 25%, var(--surface) 0% 50%) 50% / 14px 14px',
          border: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: url ? 'zoom-in' : 'default', position: 'relative',
        }}
      >
        {url
          // eslint-disable-next-line @next/next/no-img-element -- checkerboard preview needs the real image, not a next/image optimization pass
          ? <img src={url} alt={label} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
          : <span style={{ fontSize: '11.5px', color: 'var(--ink4)' }}>None</span>}
        {url && allBadges.length > 0 && (
          <div style={{ position: 'absolute', top: '5px', left: '5px', right: '5px', display: 'grid', gap: '3px' }}>
            {allBadges.map((b, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '3px',
                padding: '3px 6px', borderRadius: '6px', fontSize: '9.5px', fontWeight: 800, letterSpacing: '0.2px',
                background: b.tone === 'success' ? 'color-mix(in srgb, var(--success) 88%, transparent)' : 'color-mix(in srgb, var(--amber) 88%, transparent)',
                color: b.tone === 'success' ? 'var(--success-light)' : 'var(--amber-light)',
              }}>
                {b.tone === 'success' ? '✓ ' : '⚠ '}{b.text}
              </div>
            ))}
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
  const activeTab: 'overview' | 'registration' | 'announcements' =
    searchParams.get('tab') === 'announcements' ? 'announcements'
    : searchParams.get('tab') === 'registration' ? 'registration'
    : 'overview'
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
  // copy generators. Salutation used to be a separate hardcoded field here
  // too, but it wrote the same `event_speakers.salutation` column as the
  // schema-driven Salutation field in the Details grid and always won on
  // save — removed 2026-08-23; Salutation is edited only via the schema
  // field now.
  const [publicName, setPublicName] = useState('')
  const [pronounStyle, setPronounStyle] = useState('')
  const [keyTalkingPoints, setKeyTalkingPoints] = useState('')
  const [status, setStatus] = useState<AnnouncementStatus>('pending_review')
  const [loading, setLoading] = useState(true)
  const [permissions, setPermissions] = useState<Set<string>>(new Set())
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  // True from the moment a field changes until flushSave actually succeeds
  // (2026-08-22, per Madhu — real gap: saveState alone can't distinguish
  // "nothing to save" from "an edit is sitting in the 700ms debounce
  // window, not yet sent" — both read identically as 'idle'. Drives the
  // Save button (enabled only when there's something to save) and the
  // Approve gate (blocked while dirty, so approval can never commit
  // against stale data or race a pending edit). Stays true on a failed
  // save — the edit genuinely isn't persisted yet, so neither button
  // should treat it as clean.
  const [dirty, setDirty] = useState(false)
  // The actual reason a save failed (2026-08-22, real bug: a manually-
  // created speaker with an incomplete field set — never went through the
  // full onboarding form, so several schema-required fields like Salutation/
  // Email/Phone/Industry Sector were never filled — got a completely opaque
  // "Save failed — try again." on every edit, no matter which unrelated
  // field was actually changed. The PATCH route validates the WHOLE current
  // fields map against every required field in the schema on any fields
  // edit, not just the field being changed, and DOES return a specific,
  // useful message (e.g. "Salutation is required") — the frontend was just
  // discarding it. Retrying literally cannot help without also seeing this.
  const [saveErrorMsg, setSaveErrorMsg] = useState<string | null>(null)
  const [reapprovalBanner, setReapprovalBanner] = useState(false)
  const [approving, setApproving] = useState(false)
  // "Push to KonfHub" (2026-08-24) — deliberately separate from Approve
  // (see this page's Push button doc comment below for why). konfhubConfirm
  // just gates whether the confirm modal is open; the record's own
  // konfhub_speaker_id (in `record`) is what decides first-push vs re-push
  // wording, so no extra "was this the first push" state is needed here.
  const [konfhubConfirm, setKonfhubConfirm] = useState(false)
  const [pushingKonfhub, setPushingKonfhub] = useState(false)
  // "Register on KonfHub" (Attendee Registration push, 2026-08-25) —
  // separate system from the Speakers-module push above (see the route's
  // own doc comment). No re-push confirm needed: once record.konfhub_booking_id
  // is set the button is hidden entirely rather than offering a repeat
  // action KonfHub's API doesn't support anyway.
  const [registrationConfirm, setRegistrationConfirm] = useState(false)
  const [pushingRegistration, setPushingRegistration] = useState(false)
  const [generatingWebsitePhoto, setGeneratingWebsitePhoto] = useState(false)
  // The guided Photo Cleaning wizard (2026-08-22, replaces the old separate
  // Replace Photo / Fix Head Position / Clean Photo buttons) owns its own
  // working/confirm/error steps internally; this page only needs to know
  // what to open it WITH (an already-known photo, or a just-picked file to
  // upload first) and refetch the record whenever the wizard reports a save.
  // See PhotoCleaningWizard's own top comment for why it's a full refetch
  // rather than a hand-maintained patch.
  const [wizardEntry, setWizardEntry] = useState<{ kind: 'existing'; url: string; headBox: NonNullable<StakeholderRecord['photo_head_box']> | null } | { kind: 'upload'; file: File } | null>(null)
  const rawPhotoInputRef = useRef<HTMLInputElement | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const [logoApproval, setLogoApproval] = useState<{ url: string } | null>(null)
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
  const pronounStyleRef = useRef(pronounStyle)
  const keyTalkingPointsRef = useRef(keyTalkingPoints)
  useEffect(() => { valuesRef.current = values }, [values])
  useEffect(() => { partnerTypeRef.current = partnerType }, [partnerType])
  useEffect(() => { publicNameRef.current = publicName }, [publicName])
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
    // Public Name + Pronoun are mandatory for speakers (2026-08-23, per
    // Madhu) — they drive every public-facing surface (emails, promo
    // creatives, website, KonfHub), so a record can't sit around without
    // them once a producer has landed on this page, whether it arrived via
    // a processed onboarding submission (which never collects these) or was
    // created manually here. Blocks the WHOLE save (this PATCH always sends
    // every field together — see body below), not just these two, since
    // there's no partial-save path to preserve.
    if (kind === 'speaker' && (!publicNameRef.current.trim() || !pronounStyleRef.current)) {
      setSaveState('error')
      setSaveErrorMsg('Public Name and Pronoun / Honorific Style are required before this record can be saved — see the section below.')
      return
    }
    setSaveState('saving')
    setSaveErrorMsg(null)
    const body: Record<string, unknown> = { fields: valuesRef.current }
    if (kind === 'partner') { body.form_type = formType; body.partner_type = partnerTypeRef.current }
    if (kind === 'speaker') {
      body.public_name = publicNameRef.current.trim() || null
      body.pronoun_style = pronounStyleRef.current || null
      body.key_talking_points = keyTalkingPointsRef.current.trim() || null
    }
    try {
      const res = await fetch(`${base}/${stakeholderId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setSaveState('error'); setSaveErrorMsg(data.error || null); return }
      setSaveState('saved')
      setDirty(false)
      setTimeout(() => setSaveState(s => (s === 'saved' ? 'idle' : s)), 2000)
      if (data.announcement_status && data.announcement_status !== status) {
        if (data.announcement_status === 'pending_review' && status === 'ready') setReapprovalBanner(true)
        setStatus(data.announcement_status)
      }
    } catch {
      setSaveState('error')
      setSaveErrorMsg(null)
    }
  }, [base, stakeholderId, kind, formType, status])

  function scheduleSave() {
    setDirty(true)
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

  // Deliberately separate from approve() above (2026-08-24, per Madhu) —
  // Approve is an internal creative-readiness gate; this publishes the
  // speaker publicly on KonfHub + the event website, a different decision
  // with different stakes, so it gets its own confirm dialog (see the
  // Push button's onClick, which opens KonfhubPushConfirmModal first) and
  // its own server-side re-check of the same three readiness conditions
  // (see the route's own doc comment for why that check isn't trusted
  // client-side-only here, unlike Approve's own PATCH).
  async function pushToKonfhub() {
    setPushingKonfhub(true)
    setProcessing({ label: 'Pushing to KonfHub…', estimatedMs: 2500 })
    try {
      const res = await fetch(`/api/events/stakeholders/speakers/${stakeholderId}/konfhub-push`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setMsg(data.error || 'Could not push to KonfHub — please try again.'); return }
      setRecord(prev => prev ? { ...prev, konfhub_speaker_id: data.konfhub_speaker_id, konfhub_synced_at: data.konfhub_synced_at } : prev)
      setKonfhubConfirm(false)
    } catch {
      setMsg('Could not push to KonfHub — check your connection and try again.')
    } finally {
      setPushingKonfhub(false)
      setProcessing(null)
    }
  }

  // Background-job-backed (2026-08-25, added right after this route's
  // first live test hit a Cloudflare 502 — see the route's own doc
  // comment). POST now just kicks off a job and returns { job_id }
  // immediately; this polls .../job/[jobId] until it leaves 'processing'.
  // See .../konfhub-registration-push's own doc comment — this is
  // CREATE-ONLY, so unlike pushToKonfhub above there's no "already
  // registered" success path to handle here; the button itself is hidden
  // once record.konfhub_booking_id is set (see the Registration tab JSX).
  async function pushRegistration() {
    setPushingRegistration(true)
    setProcessing({ label: 'Registering on KonfHub…', estimatedMs: 8000 })
    try {
      const res = await fetch(`/api/events/stakeholders/speakers/${stakeholderId}/konfhub-registration-push`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.job_id) {
        setMsg(data.error || 'Could not register on KonfHub — please try again.')
        setPushingRegistration(false)
        setProcessing(null)
        return
      }
      pollRegistrationJob(data.job_id, 0)
    } catch {
      setMsg('Could not register on KonfHub — check your connection and try again.')
      setPushingRegistration(false)
      setProcessing(null)
    }
  }

  const REGISTRATION_POLL_INTERVAL_MS = 3000
  // ~2 min ceiling — generous past the ~60s KonfHub-fetch timeout the job
  // itself already enforces, just a backstop.
  const REGISTRATION_POLL_MAX_ATTEMPTS = 40
  async function pollRegistrationJob(jobId: string, attempt: number) {
    try {
      const res = await fetch(`/api/events/stakeholders/speakers/${stakeholderId}/konfhub-registration-push/job/${jobId}`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok || data.status === 'error') {
        setMsg(data.error || 'Could not register on KonfHub — please try again.')
        setPushingRegistration(false)
        setProcessing(null)
        return
      }
      if (data.status === 'processing') {
        if (attempt >= REGISTRATION_POLL_MAX_ATTEMPTS) {
          setMsg('This is taking much longer than usual — check back shortly before trying again.')
          setPushingRegistration(false)
          setProcessing(null)
          return
        }
        setTimeout(() => pollRegistrationJob(jobId, attempt + 1), REGISTRATION_POLL_INTERVAL_MS)
        return
      }
      const result = data.result ?? {}
      setRecord(prev => prev ? { ...prev, konfhub_booking_id: result.konfhub_booking_id, konfhub_registration_synced_at: result.konfhub_registration_synced_at } : prev)
      setRegistrationConfirm(false)
      setPushingRegistration(false)
      setProcessing(null)
    } catch {
      // A transient network blip on one poll tick shouldn't fail the whole
      // run — retry like any other tick, same attempt cap as above.
      if (attempt >= REGISTRATION_POLL_MAX_ATTEMPTS) {
        setMsg('Could not register on KonfHub — check your connection and try again.')
        setPushingRegistration(false)
        setProcessing(null)
        return
      }
      setTimeout(() => pollRegistrationJob(jobId, attempt + 1), REGISTRATION_POLL_INTERVAL_MS)
    }
  }

  async function generateWebsitePhoto() {
    setGeneratingWebsitePhoto(true)
    setProcessing({ label: 'Generating website photo…', estimatedMs: 3000 })
    setMsg(null)
    try {
      const res = await fetch('/api/events/stakeholders/speakers/website-photo/generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_id: eventId, speaker_id: stakeholderId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setMsg(data.error || 'Could not generate the website photo — please try again.'); return }
      setRecord(prev => prev ? { ...prev, website_card_url: data.website_card_url, website_photo_crop_warning: data.crop_warning ?? null } : prev)
    } catch {
      setMsg('Could not generate the website photo — check your connection and try again.')
    } finally {
      setGeneratingWebsitePhoto(false)
      setProcessing(null)
    }
  }

  // "Clean Photo" (2026-08-22): if there's already a raw/processed photo to
  // work with, open the wizard directly at its head-fix step. If not,
  // there's nothing to clean yet — fall back to the exact same file-picker
  // flow as "Upload Raw Photo" (per Madhu: Clean Photo should never just
  // error out on a missing photo when the fix is one click away).
  function startCleanPhoto() {
    const cleanPhoto = record?.photo_processed_url ?? record?.photo_url ?? null
    if (cleanPhoto) {
      setWizardEntry({ kind: 'existing', url: cleanPhoto, headBox: record?.photo_head_box ?? null })
    } else {
      rawPhotoInputRef.current?.click()
    }
  }

  // "Upload Raw Photo" always opens the native file picker — this is the
  // explicit "give me a fresh source photo" action (a form submission's
  // photo was missing or broken), unlike Clean Photo's conditional check
  // above. Once picked, the wizard opens immediately and performs the
  // upload as its own first working step (real progress bar, not a second
  // separate upload popup first) — see PhotoCleaningWizard's top comment.
  function onRawPhotoPicked(file: File) {
    setWizardEntry({ kind: 'upload', file })
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

  function setTab(tab: 'overview' | 'registration' | 'announcements') {
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
  // Whether Approve is actually clickable is decided further down, once
  // cleanLogo (and photo readiness) are available — see readyForApproval.

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

  // Approve readiness (2026-08-22, per Madhu). Speakers: the Cleaning
  // Cycle must have actually run (photo_cleaning_cycle_done) AND a
  // Website Photo must exist — both are what the "review the photo, logo,
  // and details" copy above already implies, just not enforced before
  // now. Partners: mirrored with their own equivalent — logo cleaned
  // (cleanLogo set). No website-tile requirement for partners — that
  // field exists in the schema but has no generation UI anywhere in this
  // app yet, so gating on it would make partner approval permanently
  // impossible rather than catching a real gap.
  const readyForApproval = kind === 'speaker'
    ? record.photo_cleaning_cycle_done === true && !!record.website_card_url
    : !!cleanLogo
  const missingRequiredSpeakerFields = kind === 'speaker' && (!publicName.trim() || !pronounStyle)
  const approveBlockedReason = missingRequiredSpeakerFields
    ? 'Set Public Name and Pronoun / Honorific Style first.'
    : dirty
    ? 'Save your changes first.'
    : !readyForApproval && kind === 'speaker'
    ? (!record.photo_cleaning_cycle_done ? 'Clean the photo first.' : 'Generate the Website Photo first.')
    : !readyForApproval
    ? 'Clean the logo first.'
    : null

  // Same three gates as Approve above (Push to KonfHub reuses
  // readyForApproval/missingRequiredSpeakerFields rather than a second,
  // independently-drifting copy) — speaker-only, since partners have no
  // KonfHub Speakers-API equivalent yet.
  const pushToKonfhubBlockedReason = kind !== 'speaker'
    ? null
    : missingRequiredSpeakerFields
    ? 'Set Public Name and Pronoun / Honorific Style first.'
    : dirty
    ? 'Save your changes first.'
    : !readyForApproval
    ? (!record.photo_cleaning_cycle_done ? 'Clean the photo first.' : 'Generate the Website Photo first.')
    : null
  const isKonfhubFirstPush = !record.konfhub_speaker_id

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

  // Details card layout (2026-08-23, per Madhu): Salutation/First Name/Last
  // Name lead the card, Full Name is dropped from view entirely (still a
  // locked schema field underneath — full_name/name feeds the page title,
  // Approve gate, photo filenames, and announcement fallbacks elsewhere, so
  // it's hidden here rather than removed from the schema; whatever value it
  // already holds keeps flowing through flushSave's fields payload
  // unchanged). Everything else in the schema renders after, unchanged in
  // relative order.
  const detailNamePriority = ['salutation', 'first_name', 'last_name']
  const detailFields = schema.filter(f => f.type !== 'file' && f.key !== 'full_name')
  const priorityDetailFields = detailNamePriority
    .map(key => detailFields.find(f => f.key === key))
    .filter((f): f is FieldSchema => !!f)
  const remainingDetailFields = detailFields.filter(f => !detailNamePriority.includes(f.key))

  // Registration split (2026-08-25, speaker-only, per Madhu) — see
  // SPEAKER_KEY_MAP's own doc comment for the reasoning: a field mapping
  // to a real event_speakers column is "Public Speaker Page" data (stays
  // here on Overview — it's also exactly what the Speakers-module KonfHub
  // push already reads); everything else (email, phone, industry sector,
  // PR quote, assistant contacts, consent checkboxes) only ever lands in
  // custom_fields and moves to the new Registration tab instead. Partners
  // are untouched — Attendee Registration has no partner equivalent here.
  const publicSpeakerFieldKeys = new Set(Object.keys(SPEAKER_KEY_MAP))
  const overviewFields = kind === 'speaker' ? remainingDetailFields.filter(f => publicSpeakerFieldKeys.has(f.key)) : remainingDetailFields
  const registrationFields = kind === 'speaker' ? remainingDetailFields.filter(f => !publicSpeakerFieldKeys.has(f.key)) : []

  return (
    // overflowAnchor: 'none' (2026-08-22, per Madhu — reported the page
    // sometimes lands scrolled down into the Details section instead of
    // at the top). Couldn't reproduce it live to confirm the exact cause,
    // but the likely explanation is the browser's own scroll-anchoring:
    // if the Photo/Company Logo thumbnails above cause any layout shift
    // as they load in (no reserved space before the image loads), the
    // browser can compensate by adjusting scroll position to keep
    // whatever it picked as an "anchor" node visually stable — which
    // looks exactly like an unrequested jump. This disables that
    // compensation for the whole page, which has no downside here since
    // the page should always just stay pinned wherever it loaded
    // (normally the top) regardless of what shifts below.
    <div style={{ minHeight: '100vh', background: 'var(--surface)', overflowAnchor: 'none' }}>
      <PageHeader
        eyebrow="Stakeholder Hub"
        title={name || (kind === 'speaker' ? 'New Speaker' : 'New Partner')}
        description={<Badge color={badge.color}>{badge.label}</Badge>}
        backHref={`/admin/events/${eventId}/stakeholders`}
        backLabel="Back to Stakeholder Hub"
      />

      <div style={{ maxWidth: '1240px', margin: '0 auto', padding: '20px 32px 0' }}>
        <div style={{ display: 'flex', gap: '6px', borderBottom: '1px solid var(--border-light)' }}>
          {/* Registration is speaker-only (2026-08-25) — Attendee
              Registration on KonfHub is a speaker-ticket concept, partners
              have no equivalent here. */}
          {(kind === 'speaker' ? (['overview', 'registration', 'announcements'] as const) : (['overview', 'announcements'] as const)).map(t => (
            <button key={t} onClick={() => setTab(t)}
              style={{
                padding: '10px 18px', border: 'none', borderBottom: activeTab === t ? '2px solid var(--teal-mid)' : '2px solid transparent',
                background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', fontSize: '13px', fontWeight: 700,
                color: activeTab === t ? 'var(--ink)' : 'var(--ink3)', marginBottom: '-1px',
              }}>
              {t === 'overview' ? 'Overview' : t === 'registration' ? 'Registration' : 'Announcements'}
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

      {activeTab === 'registration' && kind === 'speaker' && (
        <div style={{ maxWidth: '1240px', margin: '0 auto', padding: '24px 32px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 300px', gap: '24px', alignItems: 'start' }}>
            <div style={{ display: 'grid', gap: '20px', minWidth: 0 }}>
              {msg && (
                <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'var(--red-light)', border: '1px solid var(--red-border)', color: 'var(--red)', fontSize: '14.5px' }}>
                  {msg} <button onClick={() => setMsg(null)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontWeight: 700, marginLeft: '8px' }}>×</button>
                </div>
              )}
              <Card padded>
                <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--ink)', marginBottom: '6px' }}>Registration Details</div>
                <div style={{ fontSize: '12.5px', color: 'var(--ink3)', marginBottom: '16px' }}>
                  What the speaker actually submitted — contact details, consents, and everything used for badge printing, check-in, and networking on KonfHub. Review and clean up before registering.
                </div>
                {registrationFields.length === 0 ? (
                  <div style={{ fontSize: '13px', color: 'var(--ink4)' }}>No registration-specific fields on this event&apos;s form.</div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '18px' }}>
                    {registrationFields.map(field => (
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
                  </div>
                )}
              </Card>
            </div>
            <div style={{ display: 'grid', gap: '16px' }}>
              <Card padded color={record.konfhub_booking_id ? 'teal' : 'amber'}>
                <div style={{ fontSize: '15.5px', fontWeight: 800, color: 'var(--ink)' }}>
                  {record.konfhub_booking_id ? 'Registered on KonfHub' : 'Register on KonfHub?'}
                </div>
                <div style={{ fontSize: '14px', color: 'var(--ink3)', marginTop: '6px', lineHeight: 1.5 }}>
                  {record.konfhub_booking_id
                    ? "Has a real Attendee Registration on KonfHub for badge printing, check-in, and networking. KonfHub has no update API — edits here won't reflect there automatically."
                    : 'Creates a real Attendee Registration on KonfHub under the Speaker Registration ticket — separate from "Push to KonfHub" (the public Speakers module, on Overview).'}
                </div>
                {!record.konfhub_booking_id && (
                  <div style={{ marginTop: '14px' }}>
                    <Button variant="teal" onClick={() => setRegistrationConfirm(true)} disabled={pushingRegistration} className="tbtn-full">
                      {pushingRegistration ? 'Registering…' : 'Register on KonfHub'}
                    </Button>
                  </div>
                )}
              </Card>
            </div>
          </div>
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

          {/* Photo / Logo (2026-08-22 rework, per Madhu — full "proper SaaS"
              pass, replacing the 2026-08-21 two-column layout below) — Photo
              and Company Logo are now full-width STACKED sections (a
              horizontal divider, not a cramped vertical border-left split)
              since Photo alone now needs real room: two larger preview
              tiles plus the guided Clean Photo flow's two entry actions
              sitting side by side underneath Cleaned Photo, per Madhu's
              explicit ask. "Fix Head Position" as its own button is GONE —
              it's now the wizard's own first interactive step, not
              something a producer has to remember to click before Clean
              Photo even becomes available (previously
              disabled={!record.photo_head_box}). "Replace Photo" is renamed
              "Upload Raw Photo" — clearer that this is specifically for
              supplying the unprocessed source (a missing/broken form
              submission photo), not a general "change the photo" action —
              see PhotoCleaningWizard's own top comment for how the two
              photo actions now hand off into one continuous guided flow.

              Old Website Photo comment (2026-08-18/19, still accurate for
              WHAT this does): deterministic crop + background composite
              only, no AI step of its own — see composite.ts's
              Variant.category doc comment. Any AI-assisted standardization
              happens upstream, once per speaker, via Clean Photo (see
              composite.ts's CleaningCycleTemplate doc comment) — this just
              crops whatever's already in Cleaned Photo to this variant's
              own target and composites it onto the branded background, so
              results are only as good as whether Clean Photo has been run.
              Speaker-only. Not gated on approval status, same as SAE's own
              Create New: just the generate permission + having a cleaned
              photo to start from. The standalone Regenerate button here is
              unchanged — for re-running just this step later (e.g. after a
              template redesign) without the whole guided cycle; the wizard
              calls the same endpoint automatically as its own last step. */}
          <Card padded>
            <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--ink)', marginBottom: '20px' }}>
              {kind === 'speaker' ? 'Photo & Company Logo' : 'Logo'}
            </div>

            {kind === 'speaker' && (
              <div style={{ marginBottom: '24px' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', color: 'var(--ink3)', marginBottom: '14px' }}>Photo</div>
                <div style={{ display: 'flex', gap: '40px', flexWrap: 'wrap' }}>
                  <div>
                    <AssetTile
                      label="Cleaned Photo" url={cleanPhoto} filename={`${namePrefix}-photo-clean.png`} size={176}
                      onOpen={(url, label) => setLightbox({ url, label })}
                      badges={[
                        ...(record.photo_low_resolution ? [{ text: 'Low Resolution', tone: 'amber' as const }] : []),
                        record.photo_cleaning_cycle_done ? { text: 'Cleaned', tone: 'success' as const } : { text: 'Not Cleaned Yet', tone: 'amber' as const },
                      ]}
                    />
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '12px' }}>
                      <Button variant="ghost" onClick={() => rawPhotoInputRef.current?.click()}>Upload Raw Photo</Button>
                      <input ref={rawPhotoInputRef} type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }}
                        onChange={e => { const f = e.target.files?.[0]; if (f) onRawPhotoPicked(f); e.target.value = '' }} />
                      {/* Drops to the same muted "ghost" treatment Regenerate
                          Website Photo already uses once done (2026-08-22,
                          per Madhu) — the action itself stays available (real
                          reasons to re-run even after completion: the
                          Cleaning Cycle template changes later, dissatisfaction
                          with one AI attempt, self-healing a bug found after
                          the fact — see this session's own Alex P'ng/Ramana
                          incidents), it just shouldn't keep reading as "the
                          next thing to click" once the checkmark shows it's
                          already been done. */}
                      <Button variant={record.photo_cleaning_cycle_done ? 'ghost' : 'lime'} onClick={startCleanPhoto}>
                        {record.photo_cleaning_cycle_done ? '✓ Clean Photo' : 'Clean Photo'}
                      </Button>
                    </div>
                    {record.photo_low_resolution && (
                      <div style={{ fontSize: '11.5px', color: 'var(--amber)', marginTop: '10px', maxWidth: '260px' }}>
                        ⚠ Lower resolution than ideal — creatives may look soft. Ask for a higher-res original if possible.
                      </div>
                    )}
                  </div>
                  <div>
                    <AssetTile
                      label="Website Photo" url={record.website_card_url ?? null} filename={`${namePrefix}-website-photo.png`} size={176}
                      onOpen={(url, label) => setLightbox({ url, label })}
                      badges={record.website_photo_crop_warning ? [{ text: 'Needs Review', tone: 'amber' as const }] : undefined}
                    />
                    {can('sae.announcements.generate') && (
                      <div style={{ marginTop: '12px' }}>
                        <Button variant="ghost" onClick={generateWebsitePhoto} disabled={!cleanPhoto || generatingWebsitePhoto}
                          title={!cleanPhoto ? 'Upload and clean a photo first' : undefined}>
                          {generatingWebsitePhoto ? 'Generating…' : record.website_card_url ? 'Regenerate Website Photo' : 'Generate Website Photo'}
                        </Button>
                      </div>
                    )}
                    {record.website_photo_crop_warning && (
                      <div style={{ fontSize: '11.5px', color: 'var(--amber)', marginTop: '10px', maxWidth: '260px' }}>
                        ⚠ Didn&apos;t have enough room around the head to fill the frame — check for a visible gap (
                        {Object.entries(record.website_photo_crop_warning).filter(([, px]) => px > 3).map(([edge, px]) => `${edge} ${px}px`).join(', ')}
                        ). Try re-running Clean Photo.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {kind === 'speaker' && <div style={{ height: '1px', background: 'var(--border-light)', margin: '0 0 24px' }} />}

            <div>
              <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', color: 'var(--ink3)', marginBottom: '14px' }}>
                {kind === 'speaker' ? 'Company Logo' : 'Logo'}
              </div>
              <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', marginBottom: '14px' }}>
                <AssetTile label="Raw Logo" url={rawLogo} filename={`${namePrefix}-logo-raw.png`} onOpen={(url, label) => setLightbox({ url, label })} />
                <AssetTile label="Cleaned Logo" url={cleanLogo} filename={`${namePrefix}-logo-clean.png`} onOpen={(url, label) => setLightbox({ url, label })} />
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <label style={{ display: 'inline-flex' }}>
                  <span style={{ padding: '7px 14px', borderRadius: '10px', border: '1.5px solid var(--border)', color: 'var(--ink2)', fontSize: '13.5px', fontWeight: 700, cursor: uploading ? 'default' : 'pointer' }}>
                    {uploading ? 'Uploading…' : (cleanLogo ? 'Replace Logo' : 'Upload Logo')}
                  </span>
                  <input type="file" accept="image/*,.pdf,.ai,.svg,.eps,.psd,.psb,.bmp,.ico,.cur,.tif,.tiff,.heic,.heif" style={{ display: 'none' }} disabled={uploading}
                    onChange={e => { const f = e.target.files?.[0]; if (f) uploadLogo(f); e.target.value = '' }} />
                </label>
                {kind === 'speaker' && cleanLogo && (
                  <Button variant="ghost" onClick={removeCompanyLogo} disabled={uploading}>Remove Logo</Button>
                )}
              </div>
            </div>
          </Card>

          {/* Fields */}
          <Card padded>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--ink)' }}>Details</div>
              <div style={{ fontSize: '13.5px', color: 'var(--ink4)' }}>
                {saveState === 'saving' && 'Saving…'}
                {saveState === 'saved' && 'Saved ✓'}
                {saveState === 'error' && (
                  <span style={{ color: 'var(--red)' }}>
                    {saveErrorMsg ?? 'Save failed'} — <button onClick={flushSave} style={{ background: 'none', border: 'none', color: 'var(--red)', textDecoration: 'underline', cursor: 'pointer', fontWeight: 700 }}>retry</button>
                  </span>
                )}
              </div>
            </div>
            {priorityDetailFields.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '18px' }}>
                {priorityDetailFields.map(field => (
                  <div key={field.id}>
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
              </div>
            )}
            {kind === 'speaker' && (
              <div style={{
                marginTop: priorityDetailFields.length > 0 ? '18px' : 0,
                padding: '16px 18px',
                borderRadius: '12px',
                background: 'color-mix(in srgb, var(--teal-mid) 7%, transparent)',
                border: '1px solid color-mix(in srgb, var(--teal-mid) 22%, transparent)',
              }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', marginBottom: '14px' }}>
                  <div style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--teal-mid)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                    For Emails, Promos, Website &amp; Creatives
                  </div>
                  {missingRequiredSpeakerFields && (
                    <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--amber)' }}>Required — the record can&apos;t be saved until both are set</div>
                  )}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '18px' }}>
                  <div>
                    <label style={{ fontSize: '16px', fontWeight: 700, color: 'var(--ink3)', display: 'block', marginBottom: '7px' }}>Public Name <span style={{ color: 'var(--red)' }}>*</span></label>
                    <Input
                      className="tfield-lg" value={publicName} disabled={!canEdit} onBlur={flushSave}
                      placeholder="Exact name to use everywhere public-facing"
                      onChange={e => { setPublicName(e.target.value); scheduleSave() }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '16px', fontWeight: 700, color: 'var(--ink3)', display: 'block', marginBottom: '7px' }}>Pronoun / Honorific Style <span style={{ color: 'var(--red)' }}>*</span></label>
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
                </div>
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '18px', marginTop: (priorityDetailFields.length > 0 || kind === 'speaker') ? '18px' : 0 }}>
              {overviewFields.map(field => (
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
              {saveState === 'error' && <span style={{ color: 'var(--red)' }}>{saveErrorMsg ?? 'Save failed — try again.'}</span>}
              {saveState === 'idle' && (dirty ? 'Unsaved changes — auto-saving shortly.' : 'All changes saved.')}
            </div>
            <Button variant="indigo" onClick={flushSave} disabled={saveState === 'saving' || !canEdit || !dirty} className="tbtn-full">
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
                <Button variant="teal" onClick={approve} disabled={approving || !!approveBlockedReason} className="tbtn-full">
                  {approving ? 'Approving…' : 'Approve for Announcement'}
                </Button>
                {approveBlockedReason && !approving && (
                  <div style={{ fontSize: '11.5px', color: 'var(--amber)', marginTop: '8px' }}>{approveBlockedReason}</div>
                )}
              </div>
            )}
          </Card>
          {/* Deliberately its own Card, not folded into Approve above
              (2026-08-24, per Madhu) — publishing to KonfHub + the event
              website is a different, public-facing decision from
              approving for internal announcement creative, so it gets its
              own confirmation and its own status line. */}
          {kind === 'speaker' && canApprove && status !== 'archived' && (
            <Card padded color={record.konfhub_speaker_id ? 'teal' : 'amber'}>
              <div style={{ fontSize: '15.5px', fontWeight: 800, color: 'var(--ink)' }}>
                {record.konfhub_speaker_id ? 'Published to KonfHub' : 'Push to KonfHub?'}
              </div>
              <div style={{ fontSize: '14px', color: 'var(--ink3)', marginTop: '6px', lineHeight: 1.5 }}>
                {record.konfhub_speaker_id
                  ? 'Live on KonfHub and the event website. Push again after any edits to update the listing.'
                  : 'Publishes this speaker on KonfHub and the event website — a separate action from Approve for Announcement.'}
              </div>
              <div style={{ marginTop: '14px' }}>
                <Button variant="teal" onClick={() => setKonfhubConfirm(true)} disabled={pushingKonfhub || !!pushToKonfhubBlockedReason} className="tbtn-full">
                  {pushingKonfhub ? 'Pushing…' : record.konfhub_speaker_id ? 'Push Update to KonfHub' : 'Push to KonfHub'}
                </Button>
                {pushToKonfhubBlockedReason && !pushingKonfhub && (
                  <div style={{ fontSize: '11.5px', color: 'var(--amber)', marginTop: '8px' }}>{pushToKonfhubBlockedReason}</div>
                )}
              </div>
            </Card>
          )}
        </div>
        </div>
      </div>
      )}

      {konfhubConfirm && record && (
        <KonfhubPushConfirmModal
          isFirstPush={isKonfhubFirstPush}
          singleName={publicName || record.full_name}
          pushing={pushingKonfhub}
          onConfirm={pushToKonfhub}
          onClose={() => setKonfhubConfirm(false)}
        />
      )}

      {registrationConfirm && record && (
        <KonfhubRegistrationPushConfirmModal
          singleName={publicName || record.full_name}
          pushing={pushingRegistration}
          onConfirm={pushRegistration}
          onClose={() => setRegistrationConfirm(false)}
        />
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

      {logoApproval && (
        <LogoApprovalModal
          logoUrl={logoApproval.url}
          onClose={() => setLogoApproval(null)}
          onReupload={file => { setLogoApproval(null); uploadLogo(file) }}
        />
      )}
      {wizardEntry && (
        <PhotoCleaningWizard
          eventId={eventId}
          speakerId={stakeholderId}
          entry={wizardEntry}
          onSaved={load}
          onClose={() => setWizardEntry(null)}
        />
      )}
    </div>
  )
}
