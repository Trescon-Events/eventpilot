'use client'

import { useState, useEffect, useRef, use } from 'react'
import Link from 'next/link'
import { Download } from 'lucide-react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import TiptapLink from '@tiptap/extension-link'
import PageHeader from '@/app/components/PageHeader'
import { permissionSetSatisfies } from '@/app/lib/access/permission-match'
import { Button, Badge, Select, ProcessingOverlay, type BadgeColor } from '@/app/components/ui'
import { downloadFile } from '@/app/lib/download-file'
import type { Variant, CreativeTemplateConfig } from '@/app/lib/announcements/composite'
import CreateAnnouncementModal from './CreateAnnouncementModal'
import DeleteCreativeModal from './DeleteCreativeModal'

// post_copy is stored as plain text with '\n\n' paragraph breaks (not
// HTML) — the AI generation path writes it that way, and
// send-for-approval/publish-now/schedule all read it as pre-wrapped plain
// text downstream. The editor works in HTML internally (Tiptap), so these
// two convert at the boundary — nothing outside this page needs to know
// the editor exists.
function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
function plainToHtml(text: string): string {
  return text.split(/\n\n+/).filter(Boolean).map(para => `<p>${escapeHtml(para).replace(/\n/g, '<br>')}</p>`).join('')
}

/* Stakeholder Announcement Engine — main workspace (restructured
   2026-07-28 per Madhu's explicit ask, restructured again 2026-08-02 for
   real create/list/delete management). Previously this base path was a
   lightweight landing page linking out to the Stakeholder Hub for actual
   generation, and generation itself happened in a small popup modal on
   that page. Both moved here as a proper full-page workspace:

   - Speaker/Partner sub-sections (matching the Admin Console's own split).
   - Left: stakeholders who already have at least one creative (NOT every
     approved stakeholder — see 2026-08-02 below). Right: all of that
     stakeholder's creatives as a grid, plus a detail panel for whichever
     one is selected.
   - "+ Create New" (page-level, not scoped to the left-rail selection)
     opens a 2-step modal: pick a stakeholder (from those approved for
     announcement, `announcement_status === 'ready'` — regardless of
     whether they already have creatives) → pick a variant (shown with its
     real preview thumbnail) → Generate.

   2026-08-02 (Madhu): every announcement-creation action lives ONLY here
   now — the Stakeholder Hub's "Generate Creative →" button was removed
   (see stakeholders/page.tsx) so there's exactly one place a "generate"
   affordance can be clicked from. The SAE main view intentionally shows
   EXISTING creatives grouped by stakeholder, not a picker of every eligible
   stakeholder — that picker only exists inside the Create flow.

   Also fixes a real bug found the same day: `generate` always INSERTs a
   new row (never upserts), so a stakeholder could already silently
   accumulate multiple announcement rows — but the old `results` state only
   ever kept the FIRST one it fetched per stakeholder, hiding every other
   generation that already existed in the database. `results` is now an
   array per stakeholder, and every row is shown.

   Variant CREATION (the layer-stack editor) lives at ./admin instead —
   branding-team-only, unchanged by this restructure. */

export type StakeholderKind = 'speaker' | 'partner'

export type Speaker = {
  id: string; full_name: string; job_title: string; company_name: string
  photo_url: string | null; photo_processed_url: string | null; company_logo_url: string | null
  announcement_status: 'pending_review' | 'approved' | 'assets_missing' | 'ready' | 'archived'
}
export type Partner = {
  id: string; company_name: string; partner_type: string
  logo_url: string | null
  announcement_status: 'pending_review' | 'approved' | 'assets_missing' | 'ready' | 'archived'
}
export type Stakeholder = Speaker | Partner

// AnnouncementStatus/AnnouncementListItem (2026-08-02) — replaces the old
// AnnouncementSummary; see `results` state's own comment below for why: a
// stakeholder can have MULTIPLE announcement rows (generate always INSERTs,
// never upserts), so the shape needs every row's own status/variant/date,
// not just enough fields for a single displayed result.
export type AnnouncementStatus = 'draft' | 'pending_approval' | 'approved' | 'approved_with_comments' | 'changes_requested' | 'scheduled' | 'published' | 'failed'

export type AnnouncementListItem = {
  id: string
  stakeholder_type: StakeholderKind
  speaker_id: string | null
  partner_id: string | null
  post_copy: string | null
  creative_url: string | null
  creative_variant_id: string | null
  status: AnnouncementStatus
  created_at: string
  scheduled_for: string | null
  platforms: string[] | null
  published_at: string | null
  postiz_channel_ids: string[] | null
  publish_results: Record<string, { success: boolean; postId: string; state?: string }> | null
}

export type PostizChannel = { id: string; name: string; identifier: string; picture: string | null; disabled: boolean }
export type EventStaffOption = { id: string; role: string | null; event_role: string | null; staff_members: { id: string; name: string; email: string; department: string | null; role: string | null } }

export function displayName(kind: StakeholderKind, s: Stakeholder): string {
  return kind === 'speaker' ? (s as Speaker).full_name : (s as Partner).company_name
}
export function displaySubtitle(kind: StakeholderKind, s: Stakeholder): string {
  return kind === 'speaker' ? `${(s as Speaker).job_title} · ${(s as Speaker).company_name}` : (s as Partner).partner_type.replace(/_/g, ' ')
}
export function thumbUrl(kind: StakeholderKind, s: Stakeholder): string | null {
  return kind === 'speaker' ? ((s as Speaker).photo_processed_url || (s as Speaker).photo_url) : (s as Partner).logo_url
}

// Real per-platform caption limits (2026-08-16) — not exhaustive, just the
// two platforms actually in scope for now (per Madhu). A post that's too
// long for a selected platform still gets truncated/rejected by the real
// platform regardless of what EventPilot does, so surfacing this before
// Schedule/Post Now is the whole value — same "look like it'll actually
// post" principle as the caption editor rebuild.
const PLATFORM_CHAR_LIMITS: Record<string, number> = { x: 280, linkedin: 3000, 'linkedin-page': 3000 }

function statusColor(s: AnnouncementStatus): BadgeColor {
  if (s === 'published' || s === 'approved' || s === 'approved_with_comments') return 'teal'
  if (s === 'failed' || s === 'changes_requested') return 'red'
  if (s === 'scheduled') return 'purple'
  return 'amber' // draft, pending_approval
}

export default function CreativeTemplatesWorkspacePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = use(params)

  // Deep-link support (2026-08-16, for the new Queue view's "Open" links) —
  // ?type=speaker&stakeholder=X&announcement=Y pre-selects the right card
  // on load. Reads window.location directly rather than useSearchParams(),
  // matching the same established convention already used by the external
  // approval review page (avoids the Suspense-boundary requirement
  // useSearchParams() brings).
  const initialParams = (() => {
    if (typeof window === 'undefined') return null
    return new URLSearchParams(window.location.search)
  })()
  const [activeType, setActiveType] = useState<StakeholderKind>((initialParams?.get('type') as StakeholderKind | null) ?? 'speaker')
  const [loading, setLoading] = useState(true)
  const [speakers, setSpeakers] = useState<Speaker[]>([])
  const [partners, setPartners] = useState<Partner[]>([])
  const [variants, setVariants] = useState<{ speaker: Variant[]; partner: Variant[] }>({ speaker: [], partner: [] })
  const [selectedId, setSelectedId] = useState<string | null>(initialParams?.get('stakeholder') ?? null)
  const [selectedAnnouncementId, setSelectedAnnouncementId] = useState<string | null>(initialParams?.get('announcement') ?? null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  // Holds whatever's pending confirmation in DeleteCreativeModal — 1 item
  // for a single card's own ✕, 2+ for bulk-select delete (2026-08-03, per
  // Madhu: test creatives piled up with no way to clear several at once).
  const [deleteTargets, setDeleteTargets] = useState<AnnouncementListItem[]>([])
  const [deleting, setDeleting] = useState(false)
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedForBulk, setSelectedForBulk] = useState<Set<string>>(new Set())
  // Keyed by ANNOUNCEMENT id now, not stakeholder id (2026-08-02) — a
  // stakeholder can have several creatives visible at once, each needing
  // its own independent "switch variant on regenerate" selection; keying by
  // stakeholder would leak one card's choice into another's control.
  const [regenerateVariantChoice, setRegenerateVariantChoice] = useState<Record<string, string>>({})
  const [msg, setMsg] = useState<string | null>(null)

  const [regeneratingCreative, setRegeneratingCreative] = useState(false)
  const [regeneratingCopy, setRegeneratingCopy] = useState(false)
  const [copyDirty, setCopyDirty] = useState(false)
  const [savingCopy, setSavingCopy] = useState(false)
  // Every creative for a stakeholder, not just one — keyed by stakeholder
  // id, newest first. See the file-header comment for the shadowing bug
  // this replaced.
  const [results, setResults] = useState<Record<string, AnnouncementListItem[]>>({})

  // Publishing (2026-08-16) — permission gate mirrors the same pattern
  // already used on the Stakeholder Hub page, now wildcard-aware
  // (permissionSetSatisfies, app/lib/access/permission-match.ts — a role
  // holding 'sae.*' satisfies any 'sae.x.y' check). Postiz channels + this
  // event's remembered default selection + assigned staff (for the
  // approver picker) are all fetched once alongside everything else in
  // fetchAll().
  const [permissions, setPermissions] = useState<Set<string>>(new Set())
  const can = (key: string) => permissionSetSatisfies(permissions, key)
  const [postizChannels, setPostizChannels] = useState<PostizChannel[]>([])
  const [defaultChannelIds, setDefaultChannelIds] = useState<string[]>([])
  const [eventStaff, setEventStaff] = useState<EventStaffOption[]>([])
  // Per-announcement selected channels — seeded from the announcement's own
  // postiz_channel_ids if it has any (already touched before), else the
  // event's remembered default (never touched yet) — see the effect below
  // that seeds this whenever the selected announcement changes.
  const [selectedChannelIds, setSelectedChannelIds] = useState<string[]>([])
  const [publishing, setPublishing] = useState<'schedule' | 'now' | 'approval' | 'retry' | null>(null)
  const [scheduleAt, setScheduleAt] = useState('')
  const [approverPickerOpen, setApproverPickerOpen] = useState(false)
  const [pickedApprovers, setPickedApprovers] = useState<Record<string, string>>({}) // staff_id -> role_label

  const stakeholders: Stakeholder[] = activeType === 'speaker' ? speakers : partners
  const readyStakeholders = stakeholders.filter(s => s.announcement_status === 'ready')
  // Left rail (2026-08-02) — only stakeholders who already have a creative,
  // not every approved-for-announcement one. Picking WHO to create for now
  // happens inside the Create modal instead (readyStakeholders, above).
  const stakeholdersWithCreatives = stakeholders.filter(s => (results[s.id]?.length ?? 0) > 0)
  const selected = stakeholdersWithCreatives.find(s => s.id === selectedId) ?? null
  const activeVariants = variants[activeType]
  const selectedList = selected ? (results[selected.id] ?? []) : []
  const selectedAnnouncement = selectedList.find(a => a.id === selectedAnnouncementId) ?? selectedList[0] ?? null

  // Post copy is a social caption, not a document — no real platform
  // (LinkedIn, X, Instagram, Facebook) renders headings, bold/italic,
  // lists, blockquotes, or arbitrary text color in a post; pasting "rich
  // text" into any of their composers just becomes plain text. The old
  // editor here offered all of that anyway (reused wholesale from the
  // invite-email RichTextToolbar, where it's actually correct), which let
  // the WYSIWYG lie about what the post will really look like once
  // published. Stripped down to exactly what a caption can contain:
  // paragraphs, line breaks, and links (the one thing platforms DO
  // render specially — auto-linkifying a bare URL into blue/underlined
  // text) — see StarterKit.configure() below for the explicit disable
  // list (2026-08-16, per Madhu: "it should look similar to how the text
  // would look when its actually posted").
  const copyEditor = useEditor({
    extensions: [
      StarterKit.configure({
        bold: false, italic: false, strike: false, code: false, codeBlock: false,
        heading: false, bulletList: false, orderedList: false, listItem: false,
        blockquote: false, horizontalRule: false,
        // StarterKit (v3) bundles its own Link extension — disabled here
        // since we add @tiptap/extension-link directly below instead, to
        // get openOnClick:false (StarterKit's built-in Link doesn't expose
        // that option). Without this, both get registered and Tiptap warns
        // "Duplicate extension names found: ['link']".
        link: false,
      }),
      TiptapLink.configure({ openOnClick: false }),
    ],
    content: '',
    immediatelyRender: false,
    onUpdate: () => setCopyDirty(true),
  })

  // Re-seed the editor whenever the selected creative changes (switching
  // stakeholders, switching announcements, or a fresh Regenerate) — content
  // is plain text in the DB, converted to HTML paragraphs on the way in so
  // line breaks actually render (see plainToHtml's own comment).
  useEffect(() => {
    if (!copyEditor) return
    copyEditor.commands.setContent(plainToHtml(selectedAnnouncement?.post_copy ?? ''))
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resets the dirty flag alongside re-seeding the editor's content from the newly-selected creative, not a state update in response to another render
    setCopyDirty(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- copyEditor is stable once created; only re-seed when the actual selected creative or its copy changes
  }, [selectedAnnouncement?.id, selectedAnnouncement?.post_copy])

  // Channel selection pre-fills from whatever this specific announcement
  // already has saved (it's been scheduled/posted before, or a previous
  // session already picked channels for it) — falling back to the event's
  // remembered default only the first time a post is opened with nothing
  // of its own yet. Matches Madhu's ask exactly: zero extra clicks for the
  // common case, still freely adjustable per post from here.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- seeds per-post UI selection state from the newly-selected announcement, not a response to another render
    setSelectedChannelIds(selectedAnnouncement?.postiz_channel_ids?.length ? selectedAnnouncement.postiz_channel_ids : defaultChannelIds)
  }, [selectedAnnouncement?.id, selectedAnnouncement?.postiz_channel_ids, defaultChannelIds])

  function handleCopyEditorAreaClick(e: React.MouseEvent) {
    if (!copyEditor || !copyEditor.isActive('link')) return
    const href = copyEditor.getAttributes('link').href as string
    if (e.metaKey || e.ctrlKey) {
      window.open(href, '_blank', 'noopener,noreferrer')
      return
    }
    const url = window.prompt('Edit link URL (leave blank to remove the link):', href)
    if (url === null) return
    const trimmed = url.trim()
    if (trimmed === '') copyEditor.chain().focus().extendMarkRange('link').unsetLink().run()
    else copyEditor.chain().focus().extendMarkRange('link').setLink({ href: trimmed }).run()
  }

  async function saveCopy() {
    if (!copyEditor || !selectedAnnouncement || !selected) return
    setSavingCopy(true)
    const plainCopy = copyEditor.getText({ blockSeparator: '\n\n' })
    const res = await fetch(`/api/events/stakeholders/announcements/${selectedAnnouncement.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ post_copy: plainCopy }),
    })
    const data = await res.json().catch(() => ({}))
    setSavingCopy(false)
    if (res.ok) {
      setResults(prev => ({
        ...prev,
        [selected.id]: (prev[selected.id] ?? []).map(a => a.id === selectedAnnouncement.id ? { ...a, post_copy: data.post_copy } : a),
      }))
      setCopyDirty(false)
    } else {
      setMsg(data.error || 'Could not save the post copy.')
    }
  }

  async function fetchAll() {
    setLoading(true)
    const [spRes, ptRes, tplRes, annRes, permRes, chRes, evRes, stRes] = await Promise.all([
      fetch(`/api/events/stakeholders/speakers?event_id=${eventId}`),
      fetch(`/api/events/stakeholders/partners?event_id=${eventId}`),
      fetch(`/api/events/templates?event_id=${eventId}`),
      fetch(`/api/events/stakeholders/announcements?event_id=${eventId}`),
      fetch(`/api/events/access/me?event_id=${eventId}`),
      fetch(`/api/events/postiz-channels?event_id=${eventId}`),
      fetch(`/api/events?id=${eventId}`),
      fetch(`/api/events/staff?event_id=${eventId}`),
    ])
    setSpeakers(await spRes.json().catch(() => []))
    setPartners(await ptRes.json().catch(() => []))
    const config: CreativeTemplateConfig | null = await tplRes.json().catch(() => null)
    setVariants({ speaker: config?.speaker?.variants ?? [], partner: config?.partner?.variants ?? [] })
    const permData = await permRes.json().catch(() => ({ permissions: [] }))
    setPermissions(new Set(permData.permissions ?? []))
    const chData = await chRes.json().catch(() => ({ channels: [] }))
    setPostizChannels(Array.isArray(chData.channels) ? chData.channels : [])
    const evData = await evRes.json().catch(() => null)
    const ev = Array.isArray(evData) ? evData[0] : evData
    setDefaultChannelIds(ev?.postiz_default_channel_ids ?? [])
    const stData = await stRes.json().catch(() => [])
    setEventStaff(Array.isArray(stData) ? stData : [])
    const anns: AnnouncementListItem[] = await annRes.json().catch(() => [])
    // Group every row into its stakeholder's array, newest first — the
    // single source of truth for `results`, rebuilt in full on every fetch
    // rather than hand-merged, so create/delete just call fetchAll() again.
    const byStakeholder: Record<string, AnnouncementListItem[]> = {}
    for (const a of anns) {
      const id = a.speaker_id ?? a.partner_id
      if (!id) continue
      ;(byStakeholder[id] ??= []).push(a)
    }
    for (const id in byStakeholder) byStakeholder[id].sort((a, b) => b.created_at.localeCompare(a.created_at))
    setResults(byStakeholder)
    setLoading(false)
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-mount; matches the sibling stakeholders/admin pages' fetchAll effect
  useEffect(() => { fetchAll() }, [eventId])

  // Skip the very first run of the tab-switch reset below — on mount,
  // activeType/selectedId/selectedAnnouncementId may already be seeded from
  // deep-link query params (?type=&stakeholder=&announcement=, added
  // 2026-08-16 for the Queue view's "Open" links), and this effect firing
  // on mount like any other deps-effect would immediately null them back out.
  const skipNextTypeReset = useRef(true)
  useEffect(() => {
    if (skipNextTypeReset.current) { skipNextTypeReset.current = false; return }
    setSelectedId(null)
    setSelectedAnnouncementId(null)
    setSelectionMode(false)
    setSelectedForBulk(new Set())
  }, [activeType])

  async function handleCreated(stakeholderId: string, announcementId: string) {
    await fetchAll()
    setSelectedId(stakeholderId)
    setSelectedAnnouncementId(announcementId)
    setShowCreateModal(false)
  }

  async function regenerateCreative(announcementId: string, stakeholderId: string) {
    setRegeneratingCreative(true)
    const variantId = regenerateVariantChoice[announcementId]
    const res = await fetch(`/api/events/stakeholders/announcements/${announcementId}/regenerate-creative`, {
      method: 'POST',
      ...(variantId ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ variant_id: variantId }) } : {}),
    })
    const data = await res.json().catch(() => ({}))
    if (res.ok) {
      setResults(prev => ({
        ...prev,
        [stakeholderId]: (prev[stakeholderId] ?? []).map(a => a.id === announcementId ? { ...a, creative_url: data.creative_url } : a),
      }))
    } else setMsg(data.error || 'Could not regenerate the creative.')
    setRegeneratingCreative(false)
  }

  async function regenerateCopy(announcementId: string, stakeholderId: string) {
    setRegeneratingCopy(true)
    const res = await fetch(`/api/events/stakeholders/announcements/${announcementId}/regenerate-copy`, { method: 'POST' })
    const data = await res.json().catch(() => ({}))
    if (res.ok) {
      setResults(prev => ({
        ...prev,
        [stakeholderId]: (prev[stakeholderId] ?? []).map(a => a.id === announcementId ? { ...a, post_copy: data.post_copy } : a),
      }))
    } else setMsg(data.error || 'Could not regenerate the post copy.')
    setRegeneratingCopy(false)
  }

  function toggleChannel(id: string) {
    setSelectedChannelIds(prev => prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id])
  }

  function applyAnnouncementUpdate(stakeholderId: string, announcementId: string, patch: Partial<AnnouncementListItem>) {
    setResults(prev => ({
      ...prev,
      [stakeholderId]: (prev[stakeholderId] ?? []).map(a => a.id === announcementId ? { ...a, ...patch } : a),
    }))
  }

  async function sendForApproval(announcementId: string, stakeholderId: string) {
    const approvers = Object.entries(pickedApprovers).filter(([, role]) => role.trim()).map(([staff_id, role_label]) => ({ staff_id, role_label }))
    if (approvers.length === 0) { setMsg('Pick at least one approver.'); return }
    setPublishing('approval')
    const res = await fetch(`/api/events/stakeholders/announcements/${announcementId}/send-for-approval`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ approvers }),
    })
    const data = await res.json().catch(() => ({}))
    setPublishing(null)
    if (res.ok) {
      applyAnnouncementUpdate(stakeholderId, announcementId, { status: 'pending_approval' })
      setApproverPickerOpen(false)
      setPickedApprovers({})
    } else setMsg(data.error || 'Could not send for approval.')
  }

  async function scheduleAnnouncement(announcementId: string, stakeholderId: string) {
    if (!scheduleAt) { setMsg('Pick a date and time to schedule for.'); return }
    if (selectedChannelIds.length === 0) { setMsg('Pick at least one channel.'); return }
    setPublishing('schedule')
    const res = await fetch(`/api/events/stakeholders/announcements/${announcementId}/schedule`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scheduled_for: new Date(scheduleAt).toISOString(), postiz_channel_ids: selectedChannelIds }),
    })
    const data = await res.json().catch(() => ({}))
    setPublishing(null)
    if (res.ok) applyAnnouncementUpdate(stakeholderId, announcementId, { status: data.status, scheduled_for: data.scheduled_for, publish_results: data.publish_results, postiz_channel_ids: selectedChannelIds })
    else setMsg(data.error || 'Could not schedule this announcement.')
  }

  async function publishNow(announcementId: string, stakeholderId: string) {
    if (selectedChannelIds.length === 0) { setMsg('Pick at least one channel.'); return }
    setPublishing('now')
    const res = await fetch(`/api/events/stakeholders/announcements/${announcementId}/publish-now`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ postiz_channel_ids: selectedChannelIds }),
    })
    const data = await res.json().catch(() => ({}))
    setPublishing(null)
    if (res.ok) applyAnnouncementUpdate(stakeholderId, announcementId, { status: data.status, scheduled_for: data.scheduled_for, publish_results: data.publish_results, postiz_channel_ids: selectedChannelIds })
    else setMsg(data.error || 'Could not publish this announcement.')
  }

  // Retry (2026-08-16) — a failed announcement re-attempts publish-now
  // directly, without redoing approval (it was already approved once to
  // get here; Postiz/network failing on the attempt itself isn't a content
  // problem that needs re-review).
  async function retryPublish(announcementId: string, stakeholderId: string) {
    setPublishing('retry')
    const res = await fetch(`/api/events/stakeholders/announcements/${announcementId}/publish-now`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ postiz_channel_ids: selectedChannelIds }),
    })
    const data = await res.json().catch(() => ({}))
    setPublishing(null)
    if (res.ok) applyAnnouncementUpdate(stakeholderId, announcementId, { status: data.status, scheduled_for: data.scheduled_for, publish_results: data.publish_results })
    else setMsg(data.error || 'Retry failed.')
  }

  async function performDelete() {
    if (deleteTargets.length === 0) return
    setDeleting(true)
    const results = await Promise.all(
      deleteTargets.map(t => fetch(`/api/events/stakeholders/announcements/${t.id}`, { method: 'DELETE' }))
    )
    setDeleting(false)
    const failedCount = results.filter(r => !r.ok).length
    if (failedCount > 0) {
      setMsg(deleteTargets.length === 1 ? 'Could not delete this creative.' : `Could not delete ${failedCount} of ${deleteTargets.length} creatives.`)
    }
    const deletedIds = new Set(deleteTargets.map(t => t.id))
    setDeleteTargets([])
    if (selectedAnnouncementId && deletedIds.has(selectedAnnouncementId)) setSelectedAnnouncementId(null)
    setSelectedForBulk(new Set())
    setSelectionMode(false)
    await fetchAll()
  }


  // deleting is deliberately excluded — DeleteCreativeModal already shows
  // its own "Deleting…" busy state, same reasoning as the Stakeholder Hub
  // registry page.
  const overlay = regeneratingCreative
    ? { label: 'Re-compositing the creative…', estimatedMs: 3500 }
    : regeneratingCopy
    ? { label: 'Regenerating the post copy…', estimatedMs: 5000 }
    : savingCopy
    ? { label: 'Saving post copy…', estimatedMs: 600 }
    : publishing === 'approval'
    ? { label: 'Sending for approval…', estimatedMs: 1500 }
    : publishing === 'schedule'
    ? { label: 'Scheduling via Postiz…', estimatedMs: 2500 }
    : publishing === 'now' || publishing === 'retry'
    ? { label: 'Posting via Postiz…', estimatedMs: 3000 }
    : null

  return (
    <div style={{ minHeight: '100vh', background: 'var(--surface)' }}>
      <PageHeader
        eyebrow="Event Workspace"
        title="Stakeholder Announcement Engine"
        description="Create, review, and manage stakeholder announcement creatives. Speaker/partner details are managed in the Stakeholder Hub — this workspace covers approved stakeholders only."
        actions={(
          <div style={{ display: 'flex', gap: '10px' }}>
            <Link href={`/admin/events/${eventId}/creative-templates/queue`}><Button variant="ghost">Queue →</Button></Link>
            <Link href={`/admin/events/${eventId}/creative-templates/admin`}><Button variant="ghost">Admin Console →</Button></Link>
          </div>
        )}
      />

      <div style={{ padding: '24px 32px' }}>
        {msg && (
          <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'var(--red-light)', border: '1px solid var(--red-border)', color: 'var(--red)', fontSize: '12.5px', marginBottom: '16px' }}>
            {msg} <button onClick={() => setMsg(null)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontWeight: 700, marginLeft: '8px' }}>×</button>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
          <div style={{ display: 'flex', borderRadius: '8px', border: '1px solid var(--border)', overflow: 'hidden', width: 'fit-content' }}>
            {(['speaker', 'partner'] as const).map(t => (
              <button key={t} onClick={() => setActiveType(t)}
                style={{
                  padding: '7px 18px', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '12.5px', fontWeight: 700,
                  background: activeType === t ? 'var(--card)' : 'transparent',
                  color: activeType === t ? 'var(--ink)' : 'var(--ink3)',
                }}>
                {t === 'speaker' ? 'Speakers' : 'Partners'}
              </button>
            ))}
          </div>
          <Button variant="solid" onClick={() => setShowCreateModal(true)}>+ Create New</Button>
        </div>

        {loading ? (
          <div style={{ color: 'var(--ink3)', fontSize: '13px' }}>Loading…</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: '24px', alignItems: 'flex-start' }}>
            {/* Left: stakeholders who already have at least one creative */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>
                {activeType === 'speaker' ? 'Speakers' : 'Partners'} with Creatives ({stakeholdersWithCreatives.length})
              </div>
              {stakeholdersWithCreatives.map(s => {
                const thumb = thumbUrl(activeType, s)
                const count = results[s.id]?.length ?? 0
                return (
                  <button key={s.id} onClick={() => { setSelectedId(s.id); setSelectedAnnouncementId(null); setSelectionMode(false); setSelectedForBulk(new Set()) }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 10px', borderRadius: '10px',
                      border: 'none', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit',
                      background: selectedId === s.id ? 'var(--card)' : 'transparent',
                    }}>
                    <div style={{ width: '32px', height: '32px', borderRadius: '8px', overflow: 'hidden', background: 'var(--surface)', border: '1px solid var(--border-light)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {thumb ? (
                        // eslint-disable-next-line @next/next/no-img-element -- small list thumbnail
                        <img src={thumb} alt={displayName(activeType, s)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : <span style={{ fontSize: '13px', color: 'var(--ink4)' }}>{displayName(activeType, s)[0]}</span>}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayName(activeType, s)}</div>
                      <div style={{ fontSize: '10.5px', color: 'var(--ink3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displaySubtitle(activeType, s)}</div>
                    </div>
                    <Badge color="teal">{count}</Badge>
                  </button>
                )
              })}
              {stakeholdersWithCreatives.length === 0 && (
                <div style={{ color: 'var(--ink3)', fontSize: '12px', padding: '10px 0', lineHeight: 1.5 }}>
                  No creatives yet — click <strong>+ Create New</strong> above.
                </div>
              )}
            </div>

            {/* Right: this stakeholder's creatives + detail panel */}
            <div>
              {!selected ? (
                <div style={{ color: 'var(--ink3)', fontSize: '13px', textAlign: 'center', padding: '60px 0' }}>
                  {stakeholdersWithCreatives.length === 0 ? 'Nothing here yet — click + Create New to generate your first announcement creative.' : `Select a ${activeType} from the list to review their creatives.`}
                </div>
              ) : (
                <>
                  <div style={{ marginBottom: '16px' }}>
                    <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--ink)' }}>{displayName(activeType, selected)}</div>
                    <div style={{ fontSize: '12px', color: 'var(--ink3)' }}>{displaySubtitle(activeType, selected)}</div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', flexWrap: 'wrap', gap: '8px' }}>
                    <div style={{ fontSize: '10.5px', fontWeight: 800, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      Creatives ({selectedList.length})
                    </div>
                    {/* Bulk select/delete (2026-08-03, per Madhu) — test
                        creatives pile up fast with no way to clear several
                        at once; individual ✕ still works outside this mode. */}
                    {selectionMode ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '11.5px', color: 'var(--ink3)' }}>{selectedForBulk.size} selected</span>
                        <Button variant="ghost" onClick={() => setSelectedForBulk(new Set(selectedList.map(i => i.id)))}>Select All</Button>
                        <Button variant="ghost" onClick={() => setSelectedForBulk(new Set())}>Clear</Button>
                        <Button variant="red" disabled={selectedForBulk.size === 0}
                          onClick={() => setDeleteTargets(selectedList.filter(i => selectedForBulk.has(i.id)))}>
                          Delete Selected
                        </Button>
                        <Button variant="ghost" onClick={() => { setSelectionMode(false); setSelectedForBulk(new Set()) }}>Cancel</Button>
                      </div>
                    ) : (
                      <Button variant="ghost" onClick={() => setSelectionMode(true)}>Select</Button>
                    )}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '12px', marginBottom: '24px' }}>
                    {selectedList.map(item => {
                      const variantName = activeVariants.find(v => v.id === item.creative_variant_id)?.name ?? '—'
                      const isSelected = selectedAnnouncement?.id === item.id
                      const isBulkChecked = selectedForBulk.has(item.id)
                      function toggleBulk() {
                        setSelectedForBulk(prev => {
                          const next = new Set(prev)
                          if (next.has(item.id)) next.delete(item.id); else next.add(item.id)
                          return next
                        })
                      }
                      return (
                        <div key={item.id} onClick={() => selectionMode ? toggleBulk() : setSelectedAnnouncementId(item.id)}
                          style={{ cursor: 'pointer', position: 'relative', borderRadius: '10px', overflow: 'hidden', border: (selectionMode ? isBulkChecked : isSelected) ? '2px solid var(--teal-mid)' : '1px solid var(--border-light)', background: 'var(--surface)' }}>
                          {selectionMode && (
                            <input type="checkbox" checked={isBulkChecked} onChange={toggleBulk} onClick={e => e.stopPropagation()}
                              style={{ position: 'absolute', top: '8px', left: '8px', zIndex: 5, width: '16px', height: '16px', cursor: 'pointer' }} />
                          )}
                          <div style={{ aspectRatio: '4 / 5', background: 'var(--card)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                            {item.creative_url ? (
                              // eslint-disable-next-line @next/next/no-img-element -- small creative-list thumbnail
                              <img src={item.creative_url} alt={variantName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            ) : (
                              <span style={{ fontSize: '10.5px', color: 'var(--ink4)' }}>No creative</span>
                            )}
                          </div>
                          <div style={{ padding: '8px' }}>
                            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{variantName}</div>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '4px' }}>
                              <Badge color={statusColor(item.status)}>{item.status}</Badge>
                              {!selectionMode && (
                                <button onClick={e => { e.stopPropagation(); setDeleteTargets([item]) }} title="Delete this creative" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', fontSize: '13px' }}>✕</button>
                              )}
                            </div>
                            <div style={{ fontSize: '10px', color: 'var(--ink4)', marginTop: '4px' }}>{new Date(item.created_at).toLocaleDateString()}</div>
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {selectedAnnouncement && (
                    <div style={{ display: 'grid', gap: '24px' }}>
                      {/* Creative preview + Post Copy side by side — the
                          preview column is capped so a full-bleed 1080x1350
                          creative at native-ish width doesn't force an
                          absurdly tall page (an early version of this did
                          exactly that). "Assets Used" (the Photo/Logo
                          thumbnails that used to sit here) is gone — per
                          Madhu (2026-08-16), reviewing the already-generated
                          creative makes those redundant; this space is more
                          useful showing the post copy itself. */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 400px) 1fr', gap: '24px', alignItems: 'start' }}>
                        <div>
                          <div style={{ borderRadius: '12px', overflow: 'hidden', background: 'var(--surface)', border: '1px solid var(--border-light)', aspectRatio: '4 / 5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            {selectedAnnouncement.creative_url ? (
                              // eslint-disable-next-line @next/next/no-img-element -- reviewing a freshly generated/regenerated remote asset, not worth next/image's static-optimization pass here
                              <img src={selectedAnnouncement.creative_url} alt="Generated creative" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                            ) : (
                              <span style={{ fontSize: '12px', color: 'var(--ink3)' }}>No creative generated</span>
                            )}
                          </div>
                          <div style={{ marginTop: '10px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            {activeVariants.length > 1 && (
                              <Select value={regenerateVariantChoice[selectedAnnouncement.id] ?? activeVariants[0]?.id ?? ''}
                                onChange={e => setRegenerateVariantChoice(v => ({ ...v, [selectedAnnouncement.id]: e.target.value }))}
                                title="Switch to a different variant on regenerate" style={{ width: 'auto' }}>
                                {activeVariants.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                              </Select>
                            )}
                            <Button variant="ghost" onClick={() => regenerateCreative(selectedAnnouncement.id, selected.id)} disabled={regeneratingCreative}>
                              {regeneratingCreative ? 'Regenerating…' : 'Regenerate Creative'}
                            </Button>
                            {/* Download (2026-08-04, per Madhu: "if they want
                                to download and use it for approvals etc. they
                                can do so easily") — same forced-download
                                helper as the Stakeholder Hub's photo/logo
                                download buttons, needed for the same reason:
                                this file lives on a cross-origin storage
                                domain, so a plain <a download> wouldn't
                                reliably force a save. */}
                            {selectedAnnouncement.creative_url && (
                              <Button variant="ghost"
                                onClick={() => downloadFile(selectedAnnouncement.creative_url!, `${displayName(activeType, selected).replace(/\s+/g, '-')}-creative.png`).catch(() => {})}
                                title="Download this creative">
                                <Download size={13} style={{ marginRight: '5px', verticalAlign: '-2px' }} />
                                Download
                              </Button>
                            )}
                          </div>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ fontSize: '10.5px', fontWeight: 800, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Post Copy</div>
                            {copyDirty && <div style={{ fontSize: '11px', color: 'var(--amber)' }}>Unsaved changes</div>}
                          </div>
                          {/* Plain white card, platform-ish sans-serif, no
                              formatting toolbar — a real LinkedIn/X/Facebook/
                              Instagram post composer doesn't have Bold/
                              Italic/Heading/List/Quote buttons (rich text
                              pasted into any of them just becomes plain
                              text), so this WYSIWYG only ever needs to
                              reflect what those platforms actually render:
                              paragraphs, line breaks, and auto-linkified
                              URLs. See copyEditor's own extensions list for
                              the corresponding StarterKit config. Click a
                              link to edit its URL, cmd/ctrl-click to open it
                              — same convention as the invite composer. */}
                          <div
                            onClick={handleCopyEditorAreaClick}
                            className="social-caption-preview"
                            style={{
                              borderRadius: '10px', border: '1px solid var(--border-light)',
                              padding: '18px 20px', minHeight: '260px',
                            }}
                          >
                            <EditorContent editor={copyEditor} />
                          </div>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <Button variant="lime" onClick={saveCopy} disabled={!copyDirty || savingCopy}>
                              {savingCopy ? 'Saving…' : 'Save'}
                            </Button>
                            <Button variant="ghost" onClick={() => regenerateCopy(selectedAnnouncement.id, selected.id)} disabled={regeneratingCopy}>
                              {regeneratingCopy ? 'Regenerating…' : 'Regenerate Post Copy'}
                            </Button>
                          </div>
                        </div>
                      </div>

                      {/* Publishing (2026-08-16) — channel selection,
                          approval, schedule/post, and status, all for the
                          currently-selected announcement. Channels default
                          to this event's remembered selection (see
                          fetchAll's postiz_default_channel_ids) but are
                          freely adjustable per post. */}
                      <div style={{ padding: '16px 18px', borderRadius: '10px', border: '1px solid var(--border-light)', background: 'var(--surface)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                          <div style={{ fontSize: '10.5px', fontWeight: 800, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Publishing</div>
                          <Badge color={statusColor(selectedAnnouncement.status)}>{selectedAnnouncement.status.replace(/_/g, ' ')}</Badge>
                        </div>

                        <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink3)', marginBottom: '6px' }}>Channels</div>
                        {postizChannels.length === 0 ? (
                          <div style={{ fontSize: '12px', color: 'var(--ink4)', marginBottom: '12px' }}>
                            No channels connected — add a Postiz Profile Key and connect channels in this event&apos;s settings first.
                          </div>
                        ) : (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
                            {postizChannels.map(ch => {
                              const checked = selectedChannelIds.includes(ch.id)
                              return (
                                <label key={ch.id} title={ch.disabled ? 'Disconnected in Postiz' : undefined}
                                  style={{
                                    display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 10px', borderRadius: '8px',
                                    border: `1.5px solid ${checked ? 'var(--teal-mid)' : 'var(--border)'}`,
                                    background: checked ? 'var(--teal-light)' : 'transparent',
                                    color: ch.disabled ? 'var(--ink4)' : 'var(--ink2)', fontSize: '12px', fontWeight: 700, cursor: 'pointer',
                                  }}>
                                  <input type="checkbox" checked={checked} onChange={() => toggleChannel(ch.id)} style={{ margin: 0 }} />
                                  {ch.name} <span style={{ color: 'var(--ink4)', fontWeight: 400 }}>({ch.identifier})</span>
                                </label>
                              )
                            })}
                          </div>
                        )}

                        {/* Character-limit warnings — checked against the
                            live copy text (not the last-saved value), so an
                            unsaved edit is reflected immediately. */}
                        {(() => {
                          if (!copyEditor) return null
                          const len = copyEditor.getText().length
                          const overLimit = selectedChannelIds
                            .map(id => postizChannels.find(c => c.id === id))
                            .filter((c): c is PostizChannel => !!c)
                            .filter(c => PLATFORM_CHAR_LIMITS[c.identifier] && len > PLATFORM_CHAR_LIMITS[c.identifier])
                          if (overLimit.length === 0) return null
                          return (
                            <div style={{ fontSize: '11.5px', color: 'var(--red)', marginBottom: '12px' }}>
                              ⚠ {len} characters — over the limit for {overLimit.map(c => `${c.name} (${PLATFORM_CHAR_LIMITS[c.identifier]})`).join(', ')}. It will be rejected or truncated there.
                            </div>
                          )
                        })()}

                        {/* Status detail + actions, per state. */}
                        {selectedAnnouncement.status === 'pending_approval' && (
                          <div style={{ fontSize: '12px', color: 'var(--ink3)', marginBottom: '12px' }}>Waiting on approval — check back or follow up with your approvers directly.</div>
                        )}
                        {selectedAnnouncement.status === 'changes_requested' && (
                          <div style={{ fontSize: '12px', color: 'var(--red)', marginBottom: '12px' }}>Changes were requested — update the copy/creative above, then send for approval again.</div>
                        )}
                        {selectedAnnouncement.status === 'scheduled' && selectedAnnouncement.scheduled_for && (
                          <div style={{ fontSize: '12px', color: 'var(--ink3)', marginBottom: '12px' }}>
                            Scheduled for {new Date(selectedAnnouncement.scheduled_for).toLocaleString()} — Postiz confirms delivery within 15 minutes of that time.
                          </div>
                        )}
                        {selectedAnnouncement.status === 'published' && (
                          <div style={{ fontSize: '12px', color: 'var(--teal-mid)', fontWeight: 700, marginBottom: '12px' }}>
                            ✓ Published {selectedAnnouncement.published_at ? new Date(selectedAnnouncement.published_at).toLocaleString() : ''}
                          </div>
                        )}
                        {selectedAnnouncement.status === 'failed' && (
                          <div style={{ fontSize: '12px', color: 'var(--red)', marginBottom: '12px' }}>
                            Publishing failed on at least one channel.
                            {selectedAnnouncement.publish_results && (
                              <ul style={{ margin: '4px 0 0', paddingLeft: '18px' }}>
                                {Object.entries(selectedAnnouncement.publish_results).map(([channelId, r]) => {
                                  const ch = postizChannels.find(c => c.id === channelId)
                                  return <li key={channelId}>{ch?.name ?? channelId}: {r.state ?? (r.success ? 'ok' : 'error')}</li>
                                })}
                              </ul>
                            )}
                          </div>
                        )}

                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                          {(selectedAnnouncement.status === 'draft' || selectedAnnouncement.status === 'changes_requested') && (
                            <Button variant="ghost" onClick={() => setApproverPickerOpen(true)} disabled={publishing !== null}>
                              {publishing === 'approval' ? 'Sending…' : 'Send for Approval'}
                            </Button>
                          )}
                          {(selectedAnnouncement.status === 'approved' || selectedAnnouncement.status === 'approved_with_comments'
                            || ((selectedAnnouncement.status === 'draft' || selectedAnnouncement.status === 'changes_requested') && can('sae.announcements.publish'))) && (
                            <>
                              <input type="datetime-local" value={scheduleAt} onChange={e => setScheduleAt(e.target.value)}
                                style={{ padding: '7px 10px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '12.5px', fontFamily: 'inherit', color: 'var(--ink)' }} />
                              <Button variant="ghost" onClick={() => scheduleAnnouncement(selectedAnnouncement.id, selected.id)} disabled={publishing !== null}>
                                {publishing === 'schedule' ? 'Scheduling…' : 'Schedule'}
                              </Button>
                              <Button variant="lime" onClick={() => publishNow(selectedAnnouncement.id, selected.id)} disabled={publishing !== null}>
                                {publishing === 'now' ? 'Posting…' : 'Post Now'}
                              </Button>
                            </>
                          )}
                          {selectedAnnouncement.status === 'failed' && (
                            <Button variant="red" onClick={() => retryPublish(selectedAnnouncement.id, selected.id)} disabled={publishing !== null}>
                              {publishing === 'retry' ? 'Retrying…' : 'Retry'}
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {showCreateModal && (
        <CreateAnnouncementModal
          eventId={eventId}
          stakeholderType={activeType}
          readyStakeholders={readyStakeholders}
          variants={activeVariants}
          onClose={() => setShowCreateModal(false)}
          onCreated={handleCreated}
        />
      )}

      {deleteTargets.length > 0 && (
        <DeleteCreativeModal
          items={deleteTargets.map(t => ({ variantName: activeVariants.find(v => v.id === t.creative_variant_id)?.name ?? 'this creative', status: t.status }))}
          deleting={deleting}
          onConfirm={performDelete}
          onClose={() => setDeleteTargets([])}
        />
      )}

      {approverPickerOpen && selectedAnnouncement && selected && (
        <div style={{ position: 'fixed', inset: 0, background: 'color-mix(in srgb, black 60%, transparent)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }} onClick={() => setApproverPickerOpen(false)}>
          <div onClick={e => e.stopPropagation()} style={{ width: '480px', maxWidth: '100%', maxHeight: '85vh', overflowY: 'auto', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px', padding: '22px' }}>
            <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--ink)', marginBottom: '4px' }}>Send for Approval</div>
            <div style={{ fontSize: '12px', color: 'var(--ink3)', marginBottom: '16px', lineHeight: 1.5 }}>
              Pick who should review this announcement — each gets an email with a direct link, no EventPilot login required.
            </div>
            {eventStaff.length === 0 ? (
              <div style={{ fontSize: '12.5px', color: 'var(--ink4)' }}>No staff assigned to this event yet — assign someone under the event&apos;s Team tab first.</div>
            ) : (
              <div style={{ display: 'grid', gap: '8px', marginBottom: '18px' }}>
                {eventStaff.map(es => {
                  const sm = Array.isArray(es.staff_members) ? es.staff_members[0] : es.staff_members
                  if (!sm) return null
                  const picked = sm.id in pickedApprovers
                  return (
                    <label key={es.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px', borderRadius: '8px', border: `1.5px solid ${picked ? 'var(--teal-mid)' : 'var(--border-light)'}`, cursor: 'pointer' }}>
                      <input type="checkbox" checked={picked}
                        onChange={e => setPickedApprovers(prev => {
                          const next = { ...prev }
                          if (e.target.checked) next[sm.id] = (es.event_role ? es.event_role.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : null) || es.role || sm.role || 'Approver'
                          else delete next[sm.id]
                          return next
                        })} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink)' }}>{sm.name}</div>
                        <div style={{ fontSize: '11px', color: 'var(--ink4)' }}>{sm.email}</div>
                      </div>
                      {picked && (
                        <input type="text" value={pickedApprovers[sm.id]} onClick={e => e.stopPropagation()}
                          onChange={e => setPickedApprovers(prev => ({ ...prev, [sm.id]: e.target.value }))}
                          placeholder="Role label" style={{ width: '120px', padding: '5px 8px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '11.5px', fontFamily: 'inherit' }} />
                      )}
                    </label>
                  )
                })}
              </div>
            )}
            <div style={{ display: 'flex', gap: '8px' }}>
              <Button variant="lime" onClick={() => sendForApproval(selectedAnnouncement.id, selected.id)} disabled={Object.keys(pickedApprovers).length === 0 || publishing !== null}>
                {publishing === 'approval' ? 'Sending…' : 'Send'}
              </Button>
              <Button variant="ghost" onClick={() => setApproverPickerOpen(false)}>Cancel</Button>
            </div>
          </div>
        </div>
      )}

      <ProcessingOverlay active={!!overlay} label={overlay?.label} estimatedMs={overlay?.estimatedMs} />

      <style>{`@keyframes tspin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
