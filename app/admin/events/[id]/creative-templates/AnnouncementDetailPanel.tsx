'use client'

import { useEffect, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import TiptapLink from '@tiptap/extension-link'
import { Download } from 'lucide-react'
import { Button, Badge, Select, ProcessingOverlay } from '@/app/components/ui'
import { downloadFile } from '@/app/lib/download-file'
import type { Variant } from '@/app/lib/announcements/composite'
import { PLATFORM_CHAR_LIMITS } from '@/app/lib/announcements/platform-limits'
import SendToSpeakerComposer from './SendToSpeakerComposer'
import SendForExternalApprovalComposer from './SendForExternalApprovalComposer'
import SendForClientApprovalComposer from './SendForClientApprovalComposer'
import PostizCalendar, { type ScheduledPost } from './PostizCalendar'
import {
  displayName, displaySubtitle, statusColor, plainToHtml, PLATFORM_LABELS,
  type AnnouncementListItem, type Stakeholder, type StakeholderKind, type Speaker, type PostizChannel, type EventStaffOption,
} from './page'
import PublishProgressModal from './PublishProgressModal'
import ScheduleConfirmModal from './ScheduleConfirmModal'
import NotifyExternalComposer from './NotifyExternalComposer'

// The four (org_promo) / two (self_promo) steps of the left-hand workflow
// stepper — see its own comment further down for how "current" is derived.
type Stage = 'content' | 'approval' | 'publish' | 'notify' | 'send'

// custom_fields.email is the canonical, actively-maintained speaker email
// (see Speaker type's own comment) — a plain string field, but read
// defensively since custom_fields values can also be string[] (multi-value
// form fields elsewhere in the app).
function speakerEmail(s: Speaker): string {
  const v = s.custom_fields?.email
  const fromCustom = Array.isArray(v) ? v[0] : v
  return (fromCustom || s.email || '').trim()
}

/*
  The single-announcement review UI — creative preview, post-copy editor,
  publishing panel (org_promo) or Send-to-Speaker panel (self_promo),
  extracted verbatim out of the main SAE workspace page (2026-08-18, step 2
  of the SAE-into-Hub merge) so it can be reused from the Stakeholder Hub's
  new per-speaker Announcements tab without forking behavior. Owns every
  piece of state that's scoped to "reviewing THIS one announcement" —
  everything else (which stakeholder/announcement is selected, the
  creatives grid, Create/Delete modals) stays with whichever page renders
  this panel.
*/
export default function AnnouncementDetailPanel({
  announcement,
  stakeholderKind,
  stakeholder,
  activeVariants,
  effectiveKind,
  can,
  postizChannels,
  defaultChannelIds,
  eventStaff,
  eventId,
  eventName,
  clientContactName,
  clientContactJobTitle,
  clientContactEmail,
  onUpdate,
  onError,
}: {
  announcement: AnnouncementListItem
  stakeholderKind: StakeholderKind
  stakeholder: Stakeholder
  activeVariants: Variant[]
  effectiveKind: 'org_promo' | 'self_promo'
  can: (key: string) => boolean
  postizChannels: PostizChannel[]
  defaultChannelIds: string[]
  eventStaff: EventStaffOption[]
  // Used for the "other posts already scheduled on these channels"
  // clash-visibility panel (2026-08-27) — GET /api/events/postiz-scheduled
  // needs it to resolve the event's Postiz profile key.
  eventId: string
  // Used only to compose the "Share to Team" WhatsApp message (event name in
  // the header line) — optional so this panel doesn't hard-fail anywhere it
  // isn't threaded through yet; the message just omits the event name if
  // this isn't passed, rather than the button disappearing outright.
  eventName?: string | null
  // The event's single Client Approval contact (2026-08-29) — set on the
  // event workspace's own edit page. Whether client_contact_email is set
  // at all is what decides if the Client Approval card even shows for
  // this event (most events don't have one) — see hasClientApproval below.
  clientContactName?: string | null
  clientContactJobTitle?: string | null
  clientContactEmail?: string | null
  onUpdate: (patch: Partial<AnnouncementListItem>) => void
  onError: (msg: string) => void
}) {
  const [regeneratingCreative, setRegeneratingCreative] = useState(false)
  const [regeneratingCopy, setRegeneratingCopy] = useState(false)
  const [copyDirty, setCopyDirty] = useState(false)
  const [savingCopy, setSavingCopy] = useState(false)
  const [xCopyDraft, setXCopyDraft] = useState('')
  const [xCopyDirty, setXCopyDirty] = useState(false)
  const [savingXCopy, setSavingXCopy] = useState(false)
  const [variantChoice, setVariantChoice] = useState('')
  const [sendToSpeakerOpen, setSendToSpeakerOpen] = useState(false)
  const [sendForExternalApprovalOpen, setSendForExternalApprovalOpen] = useState(false)
  const [sendForClientApprovalOpen, setSendForClientApprovalOpen] = useState(false)
  const [bypassing, setBypassing] = useState<'internal' | 'external' | 'client' | null>(null)
  const [publishModalMode, setPublishModalMode] = useState<'now' | 'retry' | null>(null)
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false)
  const [confirmingTagging, setConfirmingTagging] = useState(false)
  const [notifyingInternal, setNotifyingInternal] = useState(false)
  const [notifyExternalOpen, setNotifyExternalOpen] = useState(false)
  const [remindingExternal, setRemindingExternal] = useState(false)
  const [notifyError, setNotifyError] = useState<string | null>(null)
  const [selectedChannelIds, setSelectedChannelIds] = useState<string[]>([])
  // These announcement creatives are always a static image — YouTube's API
  // rejects image-only content ("Item must be a video"), and since Postiz
  // batches every selected channel into one publish request, leaving
  // YouTube selectable failed the whole batch (X/Instagram/LinkedIn
  // included) the moment it was checked (2026-08-27).
  const youtubeChannels = postizChannels.filter(c => c.identifier === 'youtube')
  // Restricted to the event's own approved channel set (2026-09-06, per
  // Madhu) once one's been configured on the Integrations page —
  // previously defaultChannelIds only pre-checked boxes here, it never
  // actually hid anything, so a producer could still post to a channel
  // nobody approved for this event. Empty set (an event that hasn't
  // configured this yet) falls back to the old unrestricted behavior
  // rather than hiding every channel.
  const selectablePostizChannels = postizChannels.filter(c =>
    c.identifier !== 'youtube' && (defaultChannelIds.length === 0 || defaultChannelIds.includes(c.id))
  )
  const [publishing, setPublishing] = useState<'approval' | null>(null)
  const [scheduleAt, setScheduleAt] = useState('')
  const [otherScheduled, setOtherScheduled] = useState<ScheduledPost[]>([])
  const [otherScheduledLoading, setOtherScheduledLoading] = useState(false)
  const [approverPickerOpen, setApproverPickerOpen] = useState(false)
  const [pickedApprovers, setPickedApprovers] = useState<Record<string, string>>({})
  const [approverSearch, setApproverSearch] = useState('')
  // Which stepper stage is on screen — freely clickable regardless of
  // progress (someone reviewing an already-published post still wants to
  // click back into Content), but jumps to wherever the workflow actually
  // is whenever a DIFFERENT announcement is opened (not on every field
  // update of the same one — see the effect below).
  const [activeStage, setActiveStage] = useState<Stage>('content')

  const copyEditor = useEditor({
    extensions: [
      StarterKit.configure({
        bold: false, italic: false, strike: false, code: false, codeBlock: false,
        heading: false, bulletList: false, orderedList: false, listItem: false,
        blockquote: false, horizontalRule: false,
        link: false,
      }),
      TiptapLink.configure({ openOnClick: false }),
    ],
    content: '',
    immediatelyRender: false,
    onUpdate: () => setCopyDirty(true),
  })

  // Re-seed everything scoped to "the currently reviewed announcement"
  // whenever it changes (switching stakeholders, switching announcements,
  // or a fresh Regenerate updated its own copy in place).
  //
  // copyEditor IS a dependency here (2026-08-21, real bug: Post Copy showed
  // blank on the very first view of a brand-new announcement, despite
  // post_copy being fully populated in the DB) — useEditor is configured
  // with immediatelyRender: false, so copyEditor is null on first render
  // and only becomes a real Editor instance after mount, via its own
  // internal update. The old deps list ([announcement.id,
  // announcement.post_copy]) assumed copyEditor was already stable by the
  // time this effect first ran; in reality the effect ran once against
  // null (the early return did nothing) and never ran again for that same
  // announcement, since neither dep changes afterward. Including copyEditor
  // makes the effect re-fire the moment it actually becomes available.
  useEffect(() => {
    if (!copyEditor) return
    copyEditor.commands.setContent(plainToHtml(announcement.post_copy ?? ''))
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resets the dirty flag alongside re-seeding the editor's content from the newly-selected creative, not a state update in response to another render
    setCopyDirty(false)
  }, [announcement.id, announcement.post_copy, copyEditor])

  useEffect(() => {
    const youtubeIds = new Set(postizChannels.filter(c => c.identifier === 'youtube').map(c => c.id))
    const seeded = announcement.postiz_channel_ids?.length ? announcement.postiz_channel_ids : defaultChannelIds
    // eslint-disable-next-line react-hooks/set-state-in-effect -- seeds per-post UI selection state from the newly-selected announcement, not a response to another render
    setSelectedChannelIds(seeded.filter(id => !youtubeIds.has(id)))
  }, [announcement.id, announcement.postiz_channel_ids, defaultChannelIds, postizChannels])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- re-seeds from the newly-selected announcement, same pattern as the main copy editor's own reseed effect above
    setXCopyDraft(announcement.post_copy_x ?? '')
    setXCopyDirty(false)
  }, [announcement.id, announcement.post_copy_x])

  // "Other posts already scheduled on these channels" (2026-08-27, per
  // Madhu — a real producer-flagged gap: no visibility into what else is
  // already queued when picking a time). Refetches whenever the selected
  // channel set changes; not tied to scheduleAt, since the point is to
  // show the landscape BEFORE a time is picked, not just validate one
  // already chosen.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resets to empty when no channels are selected, mirrors the reseed pattern used throughout this file
    if (selectedChannelIds.length === 0) { setOtherScheduled([]); return }
    setOtherScheduledLoading(true)
    fetch(`/api/events/postiz-scheduled?event_id=${eventId}&channel_ids=${selectedChannelIds.join(',')}`)
      .then(r => r.json())
      .then(data => setOtherScheduled(data.posts ?? []))
      .catch(() => setOtherScheduled([]))
      .finally(() => setOtherScheduledLoading(false))
  }, [eventId, selectedChannelIds])

  // Live-updating approval status (2026-08-29, per Madhu, live: "regular
  // and persistent updates on any activity in that section") — an
  // external/client reviewer responds from a completely separate,
  // unauthenticated browser session (the public review portal), so there
  // is no way for THIS tab to know it happened other than asking again.
  // Polls only while at least one round is genuinely pending (not
  // bypassed) — nothing to watch for once every layer is resolved or
  // exempted. Reuses the existing announcements list route rather than a
  // new endpoint, matching what AnnouncementsTab.tsx already fetches.
  const externalPendingNow = announcement.external_approval_status === 'pending' && !announcement.external_approval_bypassed_at
  const clientPendingNow = announcement.client_approval_status === 'pending' && !announcement.client_approval_bypassed_at
  useEffect(() => {
    if (!externalPendingNow && !clientPendingNow) return
    const stakeholderParam = stakeholderKind === 'speaker' ? `speaker_id=${announcement.speaker_id}` : `partner_id=${announcement.partner_id}`
    const poll = setInterval(() => {
      fetch(`/api/events/stakeholders/announcements?event_id=${eventId}&${stakeholderParam}`)
        .then(r => r.json())
        .then((rows: AnnouncementListItem[]) => {
          const fresh = rows.find(r => r.id === announcement.id)
          if (!fresh) return
          onUpdate({
            external_approval_status: fresh.external_approval_status,
            external_approval_comments: fresh.external_approval_comments,
            external_approval_actioned_at: fresh.external_approval_actioned_at,
            external_approval_recipient: fresh.external_approval_recipient,
            client_approval_status: fresh.client_approval_status,
            client_approval_comments: fresh.client_approval_comments,
            client_approval_actioned_at: fresh.client_approval_actioned_at,
            client_approval_recipient: fresh.client_approval_recipient,
          })
        })
        .catch(() => { /* silent — next tick tries again */ })
    }, 20_000)
    return () => clearInterval(poll)
  }, [externalPendingNow, clientPendingNow, eventId, stakeholderKind, announcement.id, announcement.speaker_id, announcement.partner_id, onUpdate])

  // Backstop for the live "Post Now"/Schedule progress modal's own polling
  // (PublishProgressModal, gives up after ~88s) and the 15-min sync-status
  // cron: if the modal is closed before Postiz confirms, this panel — which,
  // unlike the modal, stays open indefinitely — had no way to pick up the
  // eventual result short of a manual reload, so "Delivered to" could sit on
  // "confirming…" long after Postiz (and the cron) had already resolved it
  // (2026-08-31 bug report). Mirrors the approval poll just above; only runs
  // while some channel is still non-terminal and the viewer can actually hit
  // publish-check (same permission that route itself requires).
  const publishInFlight = announcement.status === 'scheduled' && !!announcement.publish_results &&
    Object.values(announcement.publish_results).some(r => !r.url && r.state !== 'ERROR')
  const canCheckPublish = can('sae.announcements.publish')
  useEffect(() => {
    if (!publishInFlight || !canCheckPublish) return
    const poll = setInterval(() => {
      fetch(`/api/events/stakeholders/announcements/${announcement.id}/publish-check`, { method: 'POST' })
        .then(r => r.json())
        .then((data: { status?: AnnouncementListItem['status']; published_at?: string | null; publish_results?: AnnouncementListItem['publish_results'] }) => {
          if (!data.status) return
          onUpdate({ status: data.status, published_at: data.published_at, publish_results: data.publish_results })
        })
        .catch(() => { /* silent — next tick tries again */ })
    }, 20_000)
    return () => clearInterval(poll)
  }, [publishInFlight, canCheckPublish, announcement.id, onUpdate])

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
    if (!copyEditor) return
    setSavingCopy(true)
    const plainCopy = copyEditor.getText({ blockSeparator: '\n\n' })
    const res = await fetch(`/api/events/stakeholders/announcements/${announcement.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ post_copy: plainCopy }),
    })
    const data = await res.json().catch(() => ({}))
    setSavingCopy(false)
    if (res.ok) {
      onUpdate({ post_copy: data.post_copy })
      setCopyDirty(false)
    } else {
      onError(data.error || 'Could not save the post copy.')
    }
  }

  async function saveXCopy() {
    setSavingXCopy(true)
    const res = await fetch(`/api/events/stakeholders/announcements/${announcement.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ post_copy_x: xCopyDraft }),
    })
    const data = await res.json().catch(() => ({}))
    setSavingXCopy(false)
    if (res.ok) {
      onUpdate({ post_copy_x: data.post_copy_x })
      setXCopyDirty(false)
    } else {
      onError(data.error || 'Could not save the X copy.')
    }
  }

  async function regenerateCreative() {
    setRegeneratingCreative(true)
    const res = await fetch(`/api/events/stakeholders/announcements/${announcement.id}/regenerate-creative`, {
      method: 'POST',
      ...(variantChoice ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ variant_id: variantChoice }) } : {}),
    })
    const data = await res.json().catch(() => ({}))
    if (res.ok) onUpdate({ creative_url: data.creative_url })
    else onError(data.error || 'Could not regenerate the creative.')
    setRegeneratingCreative(false)
  }

  async function regenerateCopy() {
    setRegeneratingCopy(true)
    const res = await fetch(`/api/events/stakeholders/announcements/${announcement.id}/regenerate-copy`, { method: 'POST' })
    const data = await res.json().catch(() => ({}))
    if (res.ok) onUpdate({ post_copy: data.post_copy })
    else onError(data.error || 'Could not regenerate the post copy.')
    setRegeneratingCopy(false)
  }

  function toggleChannel(id: string) {
    setSelectedChannelIds(prev => prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id])
  }

  async function sendForApproval() {
    const approvers = Object.entries(pickedApprovers).filter(([, role]) => role.trim()).map(([staff_id, role_label]) => ({ staff_id, role_label }))
    if (approvers.length === 0) { onError('Pick at least one approver.'); return }
    setPublishing('approval')
    const res = await fetch(`/api/events/stakeholders/announcements/${announcement.id}/send-for-approval`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ approvers }),
    })
    const data = await res.json().catch(() => ({}))
    setPublishing(null)
    if (res.ok) {
      onUpdate({ status: 'pending_approval' })
      setApproverPickerOpen(false)
      setPickedApprovers({})
    } else onError(data.error || 'Could not send for approval.')
  }

  async function setBypassApproval(layer: 'internal' | 'external' | 'client', bypassed: boolean) {
    setBypassing(layer)
    const res = await fetch(`/api/events/stakeholders/announcements/${announcement.id}/bypass-approval`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ layer, bypassed }),
    })
    const data = await res.json().catch(() => ({}))
    setBypassing(null)
    if (res.ok) {
      onUpdate(layer === 'internal'
        ? { internal_approval_bypassed_at: data.internal_approval_bypassed_at }
        : layer === 'external'
        ? { external_approval_bypassed_at: data.external_approval_bypassed_at }
        : { client_approval_bypassed_at: data.client_approval_bypassed_at })
    } else onError(data.error || 'Could not update approval.')
  }

  // Shared by the inline warning display AND the Schedule/Post Now/Retry
  // click guards below (2026-08-29, per Madhu — a real over-limit X copy
  // silently failed at Postiz; the only feedback was a small error banner
  // at the top of the whole tab, easy to miss while scrolled down at
  // these buttons). Same logic that used to live only in the JSX warning
  // block, now also blocks the click itself before anything is sent.
  function charLimitViolationMessage(): string | null {
    if (!copyEditor) return null
    const len = copyEditor.getText().length
    const overLimit = selectedChannelIds
      .map(id => postizChannels.find(c => c.id === id))
      .filter((c): c is PostizChannel => !!c)
      .filter(c => c.identifier !== 'x' && PLATFORM_CHAR_LIMITS[c.identifier] && len > PLATFORM_CHAR_LIMITS[c.identifier])
    const xSelected = selectedChannelIds
      .map(id => postizChannels.find(c => c.id === id))
      .some(c => c?.identifier === 'x')
    const xOverLimit = xSelected && xCopyDraft.length > 280
    const parts: string[] = []
    if (overLimit.length > 0) parts.push(`${len} characters — over the limit for ${overLimit.map(c => `${c.name} (${PLATFORM_CHAR_LIMITS[c.identifier]})`).join(', ')}. It will be rejected or truncated there.`)
    if (xOverLimit) parts.push(`X Copy is ${xCopyDraft.length} characters — over X's 280 limit. Edit it above before posting.`)
    return parts.length > 0 ? parts.join(' ') : null
  }

  function scheduleClick() {
    if (!scheduleAt) { onError('Pick a date and time to schedule for.'); return }
    if (selectedChannelIds.length === 0) { onError('Pick at least one channel.'); return }
    const violation = charLimitViolationMessage()
    if (violation) { onError(violation); return }
    setScheduleModalOpen(true)
  }

  function publishNow() {
    if (selectedChannelIds.length === 0) { onError('Pick at least one channel.'); return }
    const violation = charLimitViolationMessage()
    if (violation) { onError(violation); return }
    setPublishModalMode('now')
  }

  function retryPublish() {
    const violation = charLimitViolationMessage()
    if (violation) { onError(violation); return }
    setPublishModalMode('retry')
  }

  async function toggleTaggingConfirmed(confirmed: boolean) {
    setConfirmingTagging(true); setNotifyError(null)
    const res = await fetch(`/api/events/stakeholders/announcements/${announcement.id}/confirm-tagging`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirmed }),
    })
    const data = await res.json().catch(() => ({}))
    setConfirmingTagging(false)
    if (res.ok) onUpdate({ tagging_confirmed_at: data.tagging_confirmed_at })
    else setNotifyError(data.error || 'Could not update tagging confirmation.')
  }

  async function notifyInternal() {
    setNotifyingInternal(true); setNotifyError(null)
    const res = await fetch(`/api/events/stakeholders/announcements/${announcement.id}/notify-internal`, { method: 'POST' })
    const data = await res.json().catch(() => ({}))
    setNotifyingInternal(false)
    if (res.ok) {
      onUpdate({
        internal_notified_at: data.internal_notified_at ?? announcement.internal_notified_at,
        internal_notification_reminder_count: data.internal_notification_reminder_count ?? announcement.internal_notification_reminder_count,
        internal_notification_last_sent_at: data.internal_notification_last_sent_at,
      })
    } else setNotifyError(data.error || 'Could not notify the internal team.')
  }

  async function remindExternal() {
    setRemindingExternal(true); setNotifyError(null)
    const res = await fetch(`/api/events/stakeholders/announcements/${announcement.id}/notify-external/remind`, { method: 'POST' })
    const data = await res.json().catch(() => ({}))
    setRemindingExternal(false)
    if (res.ok) {
      onUpdate({
        external_notification_reminder_count: data.external_notification_reminder_count,
        external_notification_last_sent_at: data.external_notification_last_sent_at,
      })
    } else setNotifyError(data.error || 'Could not send the reminder.')
  }

  // "Share to Team" (2026-08-21, per Madhu) — the team's own WhatsApp
  // announcements group is where staff go to like/reshare a fresh post, but
  // nothing can post INTO that existing group programmatically: WhatsApp's
  // official Groups API (added 2026) only messages groups created THROUGH
  // that API via invite links, capped at 8 members — it cannot reach a
  // pre-existing group like this one, and the only way around that is an
  // unofficial WhatsApp-Web-automation library, which violates WhatsApp's
  // ToS and risks the number getting banned. Not doing that. This instead
  // composes the exact message a producer would otherwise have to
  // hand-assemble (gathering each platform's live link, per Madhu's own
  // WhatsApp screenshot example) and opens it via WhatsApp's own official
  // wa.me click-to-chat deep link — the producer picks the group and hits
  // send, one click instead of manually copying N links into a fresh
  // message every time.
  function shareablePlatformLinks(): { label: string; url: string }[] {
    if (!announcement.publish_results) return []
    return Object.entries(announcement.publish_results)
      .filter((entry): entry is [string, { success: boolean; postId: string; state?: string; url: string }] => !!entry[1].url)
      .map(([channelId, r]) => {
        const ch = postizChannels.find(c => c.id === channelId)
        return { label: (ch && PLATFORM_LABELS[ch.identifier]) || ch?.name || channelId, url: r.url }
      })
  }
  function shareToTeam() {
    const links = shareablePlatformLinks()
    if (links.length === 0) return
    const kindLabel = stakeholderKind === 'speaker' ? 'Speaker Announcement' : 'Partner Announcement'
    const who = `${displayName(stakeholderKind, stakeholder)} (${displaySubtitle(stakeholderKind, stakeholder)})`
    const header = eventName ? `📣 New ${kindLabel} — ${eventName}` : `📣 New ${kindLabel}`
    const lines = [
      header,
      '',
      who,
      '',
      'Team kindly like and reshare 🙌',
      '',
      ...links.map((l, i) => `${i + 1}. ${l.label}: ${l.url}`),
    ]
    window.open(`https://wa.me/?text=${encodeURIComponent(lines.join('\n'))}`, '_blank', 'noopener,noreferrer')
  }

  // deliberately excludes "deleting" — no delete affordance lives in this
  // panel (only the creatives grid's own ✕/bulk-select do), same reasoning
  // as the original page's overlay derivation.
  const overlay = regeneratingCreative
    ? { label: 'Re-compositing the creative…', estimatedMs: 3500 }
    : regeneratingCopy
    ? { label: 'Regenerating the post copy…', estimatedMs: 5000 }
    : savingCopy
    ? { label: 'Saving post copy…', estimatedMs: 600 }
    : publishing === 'approval'
    ? { label: 'Sending for approval…', estimatedMs: 1500 }
    : null

  // Two-layer approval readiness (2026-08-26), extended to three
  // (2026-08-29, per Madhu — "all three should be either approved or
  // exempted for the next step to be activated"). internalDone mirrors the
  // exact condition Schedule/Post Now/Send-to-Speaker already used before
  // this feature existed (status flipped by internal approvers resolving,
  // via approve/route.ts) — OR'd with the internal bypass flag. clientOk/
  // externalOk both default to true for the vast majority of announcements
  // that never touch that round at all ('none' — most events have no
  // Client Approval contact configured, so that layer never even shows —
  // see hasClientApproval below), so nothing changes for them; each only
  // holds things up once someone has actually sent that round and it's
  // still pending or came back with changes requested, unless bypassed.
  // Same three conditions are enforced server-side too — see
  // checkCanPublish in app/lib/events/postiz-publish.ts.
  // Most events have no client contact configured at all — the Client
  // Approval card, and its contribution to readiness, only exist for the
  // ones that do (set on the event workspace's own edit page).
  const hasClientApproval = !!clientContactEmail
  const internalApproved = announcement.status === 'approved' || announcement.status === 'approved_with_comments'
  const clientApproved = announcement.client_approval_status === 'approved' || announcement.client_approval_status === 'approved_with_comments'
  const externalApproved = announcement.external_approval_status === 'approved' || announcement.external_approval_status === 'approved_with_comments'
  const internalDone = internalApproved || !!announcement.internal_approval_bypassed_at
  const clientOk = announcement.client_approval_status === 'none' || clientApproved || !!announcement.client_approval_bypassed_at
  const externalOk = announcement.external_approval_status === 'none' || externalApproved || !!announcement.external_approval_bypassed_at
  const readyToPublish = internalDone && clientOk && externalOk

  // Status pills for the Approval card (2026-08-27, per Madhu: "should look
  // like a status, not just random text"). 'exempted' color (purple) is
  // deliberately distinct from a real 'approved' (teal) — bypassing and
  // genuinely approving are different facts, and the pill shouldn't blur
  // that distinction away.
  type ApprovalPillTone = 'grey' | 'amber' | 'red' | 'purple' | 'teal'
  const APPROVAL_PILL_COLORS: Record<ApprovalPillTone, { bg: string; text: string }> = {
    grey:   { bg: 'color-mix(in srgb, white 6%, transparent)', text: 'var(--ink3)' },
    amber:  { bg: 'var(--amber-light)', text: 'var(--amber)' },
    red:    { bg: 'var(--red-light)', text: 'var(--red)' },
    purple: { bg: 'var(--purple-light)', text: 'var(--purple)' },
    teal:   { bg: 'var(--teal-light)', text: 'var(--teal)' },
  }
  function approvalPill(label: string, tone: ApprovalPillTone) {
    const c = APPROVAL_PILL_COLORS[tone]
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', padding: '5px 12px', borderRadius: '999px', background: c.bg, color: c.text, fontSize: '13px', fontWeight: 800, letterSpacing: '0.3px' }}>
        {label}
      </span>
    )
  }
  const internalPill = internalApproved ? approvalPill('✓ Approved', 'teal')
    : announcement.internal_approval_bypassed_at ? approvalPill('Exempted', 'purple')
    : announcement.status === 'changes_requested' ? approvalPill('Changes requested', 'red')
    : announcement.status === 'pending_approval' ? approvalPill('Pending', 'amber')
    : approvalPill('Not sent', 'grey')
  const clientPill = clientApproved ? approvalPill(announcement.client_approval_status === 'approved_with_comments' ? '✓ Approved (comments)' : '✓ Approved', 'teal')
    : announcement.client_approval_bypassed_at ? approvalPill('Exempted', 'purple')
    : announcement.client_approval_status === 'changes_requested' ? approvalPill('Changes requested', 'red')
    : announcement.client_approval_status === 'pending' ? approvalPill('Pending', 'amber')
    : approvalPill('Not sent', 'grey')
  const externalPill = externalApproved ? approvalPill(announcement.external_approval_status === 'approved_with_comments' ? '✓ Approved (comments)' : '✓ Approved', 'teal')
    : announcement.external_approval_bypassed_at ? approvalPill('Exempted', 'purple')
    : announcement.external_approval_status === 'changes_requested' ? approvalPill('Changes requested', 'red')
    : announcement.external_approval_status === 'pending' ? approvalPill('Pending', 'amber')
    : approvalPill('Not sent', 'grey')

  // Per-layer persistent status area (2026-08-29, per Madhu, live: "Each
  // sub-section under the approval section should have its own status
  // area below the buttons, where it shows regular and persistent updates
  // on any activity in that section"). Shows the actual reviewer comment
  // inline — found live that comments were being saved correctly
  // (confirmed via direct DB read) but never surfaced anywhere in the
  // admin UI at all, which is what actually made "no status update in
  // EventPilot" true. Reuses the same tone palette as the pills above so
  // the box and its pill always agree visually.
  function approvalStatusArea(opts: {
    status: 'none' | 'pending' | 'approved' | 'approved_with_comments' | 'changes_requested'
    bypassedAt: string | null
    comments: string | null
    actionedAt: string | null
    recipientName: string | null
    notifiedAt: string | null
    reviewerNoun: string
  }) {
    const { status, bypassedAt, comments, actionedAt, recipientName, notifiedAt, reviewerNoun } = opts
    const approved = status === 'approved' || status === 'approved_with_comments'
    let tone: ApprovalPillTone
    let headline: string
    if (bypassedAt) { tone = 'purple'; headline = 'Exempted — this round won’t block publishing.' }
    else if (approved) { tone = 'teal'; headline = `✓ Approved${status === 'approved_with_comments' ? ' — with comments' : ''}. Cleared for the next step.` }
    else if (status === 'changes_requested') { tone = 'red'; headline = '✗ Changes requested.' }
    else if (status === 'pending') { tone = 'amber'; headline = `Waiting on ${recipientName || `the ${reviewerNoun}`}${notifiedAt ? `, sent ${new Date(notifiedAt).toLocaleDateString()}` : ''} — publishing is on hold until they respond.` }
    else { tone = 'grey'; headline = 'Not sent yet.' }
    const c = APPROVAL_PILL_COLORS[tone]
    const showComment = !!comments && (approved || status === 'changes_requested')
    return (
      // Font sizes bumped (2026-08-29, per Madhu, live: "make all these
      // fonts a bit bigger.. too small to read") — was 12.5/12.5/11px.
      <div style={{ marginTop: '12px', padding: '12px 14px', borderRadius: '8px', background: c.bg, border: `1px solid color-mix(in srgb, ${c.text} 30%, transparent)` }}>
        <div style={{ fontSize: '14.5px', fontWeight: 800, color: c.text }}>{headline}</div>
        {showComment && (
          <div style={{ fontSize: '14px', color: 'var(--ink2)', marginTop: '7px', fontStyle: 'italic' }}>&quot;{comments}&quot;</div>
        )}
        {actionedAt && (approved || status === 'changes_requested') && (
          <div style={{ fontSize: '12.5px', color: 'var(--ink4)', marginTop: '7px' }}>
            {recipientName ? `${recipientName} · ` : ''}{new Date(actionedAt).toLocaleString()}
          </div>
        )}
      </div>
    )
  }

  // Sequential workflow stepper (2026-08-31, per Madhu — the announcement
  // detail view now has a genuine linear flow, so the layout should read
  // as one) — left-hand nav across the four things a producer does to an
  // org_promo announcement in order, with a pulsing ring on whichever one
  // is currently "live." self_promo has no approval round and no post-
  // publish notify step (see those sections' own effectiveKind checks
  // elsewhere in this file) — it only ever runs Content → Send.
  const STAGE_LABELS: Record<Stage, string> = {
    content: 'Content', approval: 'Approval', publish: 'Publish', notify: 'Notify', send: 'Send to Speaker',
  }
  const STAGE_SUBTITLES: Record<Stage, string> = {
    content: 'Creative, post copy & X copy',
    approval: 'Internal, client & external sign-off',
    publish: 'Channels, scheduling & delivery',
    notify: 'Tagging & post-publish notifications',
    send: 'Email the speaker to post it themselves',
  }
  const stageKeys: Stage[] = effectiveKind === 'org_promo' ? ['content', 'approval', 'publish', 'notify'] : ['content', 'send']
  // "Approval attempted/started" = anything beyond just having a creative —
  // sending a round OR bypassing one, even before any round has resolved.
  const approvalStarted = announcement.status !== 'draft'
    || !!announcement.internal_approval_bypassed_at || !!announcement.client_approval_bypassed_at || !!announcement.external_approval_bypassed_at
  const publishDone = announcement.status === 'published'
  const notifyDone = !!announcement.tagging_confirmed_at && !!announcement.internal_notified_at && !!announcement.external_notified_at
  const currentStage: Stage = effectiveKind === 'org_promo'
    ? (!approvalStarted ? 'content' : !readyToPublish ? 'approval' : !publishDone ? 'publish' : 'notify')
    : 'send'
  const fullyDone = effectiveKind === 'org_promo' ? (approvalStarted && readyToPublish && publishDone && notifyDone) : announcement.status === 'published'
  const currentStageIdx = stageKeys.indexOf(currentStage)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- jumps the stepper to wherever THIS newly-selected announcement's workflow actually is; deliberately not re-run on same-announcement field changes (e.g. clicking a bypass checkbox shouldn't yank the viewer away from the stage they're looking at)
    setActiveStage(currentStage)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally scoped to announcement.id only, see comment above
  }, [announcement.id])

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '230px 1fr', gap: '32px', alignItems: 'start' }}>
      <style>{`@keyframes adp-stage-pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.35; transform: scale(0.75); } }`}</style>
      <nav style={{ position: 'sticky', top: '20px', display: 'grid', gap: '6px' }}>
        {stageKeys.map((key, i) => {
          const status: 'done' | 'current' | 'upcoming' = i < currentStageIdx || (i === currentStageIdx && fullyDone) ? 'done' : i === currentStageIdx ? 'current' : 'upcoming'
          const selected = activeStage === key
          return (
            <button key={key} type="button" onClick={() => setActiveStage(key)}
              style={{
                display: 'flex', alignItems: 'flex-start', gap: '12px', padding: '14px 16px', borderRadius: '10px',
                border: 'none', borderLeft: `3px solid ${selected ? 'var(--teal-mid)' : 'transparent'}`,
                textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit',
                background: selected ? 'var(--surface)' : 'transparent',
              }}>
              <span style={{
                width: '18px', height: '18px', borderRadius: '50%', flexShrink: 0, marginTop: '2px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: status === 'done' ? 'var(--teal-mid)' : 'transparent',
                border: status === 'upcoming' ? '1.5px solid var(--border)' : status === 'current' ? '1.5px solid var(--teal-mid)' : 'none',
              }}>
                {status === 'done' ? (
                  <span style={{ fontSize: '11px', color: 'var(--card)', fontWeight: 900 }}>✓</span>
                ) : status === 'current' ? (
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--teal-mid)', animation: 'adp-stage-pulse 1.6s ease-in-out infinite' }} />
                ) : null}
              </span>
              <span style={{ display: 'grid', gap: '2px' }}>
                <span style={{ fontSize: '13.5px', fontWeight: 800, color: status === 'upcoming' ? 'var(--ink4)' : 'var(--ink)' }}>{STAGE_LABELS[key]}</span>
                <span style={{ fontSize: '11px', color: 'var(--ink4)', lineHeight: 1.3 }}>{STAGE_SUBTITLES[key]}</span>
              </span>
            </button>
          )
        })}
      </nav>

      <div style={{ display: 'grid', gap: '24px', minWidth: 0 }}>
      {activeStage === 'content' && (
      <div style={{ padding: '22px 26px', borderRadius: '12px', border: '1px solid var(--border-light)', background: 'var(--surface)' }}>
      {/* Creative preview + Post Copy side by side — the preview column is
          capped so a full-bleed 1080x1350 creative at native-ish width
          doesn't force an absurdly tall page. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 400px) 1fr', gap: '24px', alignItems: 'start' }}>
        <div>
          <div style={{ borderRadius: '12px', overflow: 'hidden', background: 'var(--surface)', border: '1px solid var(--border-light)', aspectRatio: '4 / 5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {announcement.creative_url ? (
              // eslint-disable-next-line @next/next/no-img-element -- reviewing a freshly generated/regenerated remote asset, not worth next/image's static-optimization pass here
              <img src={announcement.creative_url} alt="Generated creative" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            ) : (
              <span style={{ fontSize: '12px', color: 'var(--ink3)' }}>No creative generated</span>
            )}
          </div>
          <div style={{ marginTop: '10px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {activeVariants.length > 1 && (
              <Select value={variantChoice || activeVariants[0]?.id || ''}
                onChange={e => setVariantChoice(e.target.value)}
                title="Switch to a different variant on regenerate" style={{ width: 'auto' }}>
                {activeVariants.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
              </Select>
            )}
            <Button variant="ghost" onClick={regenerateCreative} disabled={regeneratingCreative}>
              {regeneratingCreative ? 'Regenerating…' : 'Regenerate Creative'}
            </Button>
            {announcement.creative_url && (
              <Button variant="ghost"
                onClick={() => downloadFile(announcement.creative_url!, `${displayName(stakeholderKind, stakeholder).replace(/\s+/g, '-')}-creative.png`).catch(() => {})}
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
            <Button variant="ghost" onClick={regenerateCopy} disabled={regeneratingCopy}>
              {regeneratingCopy ? 'Regenerating…' : 'Regenerate Post Copy'}
            </Button>
          </div>

          {/* X Copy (2026-08-27) — always generated alongside the main
              copy, never a truncation of it (see announcements.ts's
              prompt). Separate plain textarea, not the rich Tiptap editor
              above — a single short paragraph needs no rich formatting,
              and keeping it visually distinct reinforces that it's a
              genuinely different piece of text, not a variant view of the
              same one. */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px' }}>
            <div style={{ fontSize: '10.5px', fontWeight: 800, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>X Copy</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              {xCopyDirty && <div style={{ fontSize: '11px', color: 'var(--amber)' }}>Unsaved changes</div>}
              <div style={{ fontSize: '11px', fontWeight: 700, color: xCopyDraft.length > 280 ? 'var(--red)' : 'var(--ink4)' }}>{xCopyDraft.length} / 280</div>
            </div>
          </div>
          <textarea value={xCopyDraft} onChange={e => { setXCopyDraft(e.target.value); setXCopyDirty(true) }}
            rows={4} className="tfield" style={{ resize: 'vertical', fontSize: '14px', width: '100%', boxSizing: 'border-box' }} />
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button variant="lime" onClick={saveXCopy} disabled={!xCopyDirty || savingXCopy}>
              {savingXCopy ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </div>
      </div>
      </div>
      )}

      {/* Approval — internal (event_staff, existing) and external (speaker/
          office, 2026-08-26) rounds, side by side in one visually separate
          section per Madhu ("show two columns... just for proper page
          structure"), rather than duplicated inline in both the org_promo
          Publishing and self_promo Send-to-Speaker sections below (their
          previous location — identical logic either way, per the
          Send-to-Speaker section's own long-standing comment).

          The "Not required / Reviewed" checkbox is a real toggle, not a
          one-shot button (2026-08-26, per Madhu's brainstorm) — available
          any time that column isn't genuinely approved, INCLUDING while
          pending or after changes were requested (feedback often gets
          resolved outside the formal loop), and uncheckable as an honest
          undo. Once a column is genuinely approved its controls disappear
          entirely — no reason to second-guess a real yes. */}
      {/* Approval — org_promo only (2026-08-29, per Madhu: "self promo need
          not have approval section. we will not use it.") Self Promo's own
          terminal action is Send to Speaker, below — there's no publish
          step for it to gate. */}
      {effectiveKind === 'org_promo' && activeStage === 'approval' && (
      <div style={{ padding: '22px 26px', borderRadius: '12px', border: '1px solid var(--border-light)', background: 'var(--surface)' }}>
        <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: '14px' }}>Approval</div>

        <div style={{ display: 'grid', gridTemplateColumns: hasClientApproval ? '1fr 1fr 1fr' : '1fr 1fr', gap: '18px' }}>
          {/* Internal */}
          <div style={{ border: '1px solid var(--border-light)', borderRadius: '10px', padding: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
              <div style={{ fontSize: '13.5px', fontWeight: 800, color: 'var(--ink)' }}>Internal Approval</div>
              {internalPill}
            </div>
            {!internalApproved && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
                <Button variant="ghost" onClick={() => setApproverPickerOpen(true)} disabled={publishing !== null}>
                  {publishing === 'approval' ? 'Sending…' : 'Send for Approval'}
                </Button>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13.5px', color: 'var(--ink2)', cursor: bypassing ? 'default' : 'pointer' }}>
                  <input type="checkbox" checked={!!announcement.internal_approval_bypassed_at} disabled={bypassing !== null}
                    onChange={e => setBypassApproval('internal', e.target.checked)} style={{ width: '16px', height: '16px' }} />
                  Not required / Reviewed
                </label>
              </div>
            )}
            {approvalStatusArea({
              status: internalApproved ? announcement.status as 'approved' | 'approved_with_comments'
                : announcement.status === 'changes_requested' ? 'changes_requested'
                : announcement.status === 'pending_approval' ? 'pending' : 'none',
              bypassedAt: announcement.internal_approval_bypassed_at,
              comments: null, actionedAt: null, recipientName: null, notifiedAt: null,
              reviewerNoun: 'approvers',
            })}
          </div>

          {/* Client — only for events with a client contact configured
              (2026-08-29, per Madhu: "for some events... there will be an
              additional layer of approval"). Sits between Internal and
              External, same order he specified. */}
          {hasClientApproval && (
          <div style={{ border: '1px solid var(--border-light)', borderRadius: '10px', padding: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
              <div style={{ fontSize: '13.5px', fontWeight: 800, color: 'var(--ink)' }}>Client Approval</div>
              {clientPill}
            </div>
            {!clientApproved && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
                <Button variant="ghost" onClick={() => setSendForClientApprovalOpen(true)}>
                  Send for Client Approval
                </Button>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13.5px', color: 'var(--ink2)', cursor: bypassing ? 'default' : 'pointer' }}>
                  <input type="checkbox" checked={!!announcement.client_approval_bypassed_at} disabled={bypassing !== null}
                    onChange={e => setBypassApproval('client', e.target.checked)} style={{ width: '16px', height: '16px' }} />
                  Not required / Reviewed
                </label>
              </div>
            )}
            {approvalStatusArea({
              status: announcement.client_approval_status,
              bypassedAt: announcement.client_approval_bypassed_at,
              comments: announcement.client_approval_comments,
              actionedAt: announcement.client_approval_actioned_at,
              recipientName: announcement.client_approval_recipient,
              notifiedAt: announcement.client_approval_notified_at,
              reviewerNoun: 'client',
            })}
          </div>
          )}

          {/* External */}
          <div style={{ border: '1px solid var(--border-light)', borderRadius: '10px', padding: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
              <div style={{ fontSize: '13.5px', fontWeight: 800, color: 'var(--ink)' }}>External Approval</div>
              {externalPill}
            </div>
            {!externalApproved && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
                <Button variant="ghost" onClick={() => setSendForExternalApprovalOpen(true)}>
                  Send for External Approval
                </Button>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13.5px', color: 'var(--ink2)', cursor: bypassing ? 'default' : 'pointer' }}>
                  <input type="checkbox" checked={!!announcement.external_approval_bypassed_at} disabled={bypassing !== null}
                    onChange={e => setBypassApproval('external', e.target.checked)} style={{ width: '16px', height: '16px' }} />
                  Not required / Reviewed
                </label>
              </div>
            )}
            {approvalStatusArea({
              status: announcement.external_approval_status,
              bypassedAt: announcement.external_approval_bypassed_at,
              comments: announcement.external_approval_comments,
              actionedAt: announcement.external_approval_actioned_at,
              recipientName: announcement.external_approval_recipient,
              notifiedAt: announcement.external_approval_notified_at,
              reviewerNoun: 'external reviewer',
            })}
          </div>
        </div>
      </div>
      )}

      {(activeStage === 'publish' || activeStage === 'send') && (effectiveKind === 'org_promo' ? (
      /* Publishing — channel selection, approval, schedule/post, and
          status, all for the currently-selected announcement. Channels
          default to this event's remembered selection but are freely
          adjustable per post. */
      <div style={{ padding: '20px 24px', borderRadius: '12px', border: `1px solid ${announcement.status === 'published' ? 'var(--teal-mid)' : 'var(--border-light)'}`, background: 'var(--surface)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <div style={{ fontSize: '10.5px', fontWeight: 800, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Publishing</div>
          {/* Bigger, harder-to-miss treatment for the terminal "it's live"
              state (2026-08-21, per Madhu: a small pill in the corner was
              easy to walk right past after posting) — every other status
              keeps the compact badge, since only "published" needs to read
              as a clear, confident confirmation rather than a passing note. */}
          {announcement.status === 'published' ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '5px 12px', borderRadius: '999px', background: 'var(--teal-mid)', color: 'white', fontSize: '12.5px', fontWeight: 800 }}>
              <span style={{ fontSize: '14px' }}>✓</span> PUBLISHED
            </div>
          ) : (
            <Badge color={statusColor(announcement.status)}>{announcement.status.replace(/_/g, ' ')}</Badge>
          )}
        </div>

        {/* Publish lock (2026-08-29, per Madhu, live: "until all approvals
            are either exempted or approved, the publish section should
            not even be clickable... greyed out"). Was previously bypassed
            entirely for anyone with sae.announcements.publish (2026-08-16
            skip-approval feature) — Madhu hit this directly with his own
            account: the buttons were fully live for him regardless of
            approval state, so clicking Post Now just hit an unrelated
            "pick a channel" validation instead of ever reaching an
            approval block. Asked explicitly whether to keep the skip
            (made visually obvious) or remove it outright; chose removal —
            see checkCanPublish's own doc comment for the matching
            server-side change. Channels/date/Schedule/Post Now are now
            always rendered (not hidden) but visually dimmed and
            non-interactive while locked, with this banner explaining why —
            "not even clickable," not "mysteriously absent." */}
        {!readyToPublish && announcement.status !== 'published' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 12px', borderRadius: '8px', background: 'var(--amber-light)', border: '1px solid var(--amber-border)', color: 'var(--amber)', fontSize: '12.5px', fontWeight: 700, marginBottom: '12px' }}>
            🔒 Publishing is locked until Internal, Client, and External approval are all approved or exempted — see the Approval section above.
          </div>
        )}
        <div style={{ opacity: readyToPublish ? 1 : 0.5, pointerEvents: readyToPublish ? 'auto' : 'none' }}>
        <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink3)', marginBottom: '6px' }}>Channels</div>
        {/* YouTube is excluded here (2026-08-27) — these announcement creatives
            are always a static image, and YouTube's API rejects image-only
            content outright ("Item must be a video"). Postiz batches all
            selected channels into one request, so leaving YouTube selectable
            failed the entire publish — X/Instagram/LinkedIn included — the
            moment it was checked. */}
        {selectablePostizChannels.length === 0 ? (
          <div style={{ fontSize: '12px', color: 'var(--ink4)', marginBottom: '12px' }}>
            No channels connected — add a Postiz Profile Key and connect channels in this event&apos;s settings first.
          </div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
            {selectablePostizChannels.map(ch => {
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
        {youtubeChannels.length > 0 && (
          <div style={{ fontSize: '11px', color: 'var(--ink4)', marginTop: '-6px', marginBottom: '12px' }}>
            {youtubeChannels.map(c => c.name).join(', ')} not shown — YouTube requires an actual video and rejects image-only posts like this one.
          </div>
        )}

        {/* Character-limit warnings — checked against the live copy text
            (not the last-saved value), so an unsaved edit is reflected
            immediately. X (2026-08-27) checks its own dedicated copy
            (xCopyDraft) against its own limit, since it's no longer a
            shared/truncated value — everything else still checks the
            main copy against its (much larger) limit.

            2026-08-29: this same check now ALSO gates Schedule/Post
            Now/Retry directly (see charLimitViolationMessage below) — a
            real over-limit post used to fail silently server-side (Postiz
            rejects it, the only feedback was a small error banner at the
            top of the whole tab, easy to miss while scrolled down at
            these buttons). Keeping this block too so the reason is
            visible right where the copy actually is, not just at the
            moment of clicking. */}
        {charLimitViolationMessage() && (
          <div style={{ fontSize: '12.5px', color: 'var(--red)', marginBottom: '12px', display: 'grid', gap: '4px' }}>
            <div>⚠ {charLimitViolationMessage()}</div>
          </div>
        )}

        {announcement.status === 'pending_approval' && (
          <div style={{ fontSize: '12px', color: 'var(--ink3)', marginBottom: '12px' }}>Waiting on approval — check back or follow up with your approvers directly.</div>
        )}
        {announcement.status === 'changes_requested' && (
          <div style={{ fontSize: '12px', color: 'var(--red)', marginBottom: '12px' }}>Changes were requested — update the copy/creative above, then send for approval again.</div>
        )}
        {announcement.status === 'scheduled' && announcement.scheduled_for && (() => {
          // "Post Now" is implemented as a Postiz schedule for right now
          // (see postiz-publish.ts's own doc comment on why status stays
          // 'scheduled' until the sync cron confirms real delivery) — but
          // by the time this re-renders, that "now" is already a moment in
          // the past, and the old copy always said "Scheduled for
          // <timestamp>" regardless, reading exactly like a deliberate
          // future schedule even when the producer clicked Post Now for
          // immediate delivery (real confusion, 2026-08-21, Madhu: "my
          // action was to not schedule but post... it still says
          // scheduled"). A future timestamp is a genuine schedule; a
          // timestamp already in the past is really "posting now, still
          // confirming" — different situations, different copy.
          const isImmediate = new Date(announcement.scheduled_for) <= new Date()
          return (
            <div style={{ fontSize: '12px', color: 'var(--ink3)', marginBottom: '12px' }}>
              {isImmediate
                ? 'Posting now — Postiz is delivering it, this typically confirms within a few minutes.'
                : `Scheduled for ${new Date(announcement.scheduled_for).toLocaleString()} — Postiz confirms delivery within 15 minutes of that time.`}
            </div>
          )
        })()}
        {announcement.status === 'published' && (
          <div style={{ fontSize: '12px', color: 'var(--teal-mid)', fontWeight: 700, marginBottom: '12px' }}>
            ✓ Published {announcement.published_at ? new Date(announcement.published_at).toLocaleString() : ''}
          </div>
        )}
        {announcement.status === 'failed' && (
          <div style={{ fontSize: '12px', color: 'var(--red)', marginBottom: '12px' }}>
            Publishing failed on at least one channel.
          </div>
        )}

        {/* Per-channel results — state, and the live link once Postiz
            confirms it (2026-08-21, per Madhu: producers had no way to
            actually verify/reference what went out without leaving
            EventPilot and hunting for it on each platform). Shown for any
            status once a publish/schedule attempt exists, not just
            'published' — a channel can confirm with a link while the
            announcement's overall status is still 'scheduled' (other
            channels still in flight) or 'failed' (this one succeeded,
            another didn't). */}
        {announcement.publish_results && Object.keys(announcement.publish_results).length > 0 && (
          <div style={{ marginBottom: '12px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink3)', marginBottom: '6px' }}>Delivered to</div>
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: '4px' }}>
              {Object.entries(announcement.publish_results).map(([channelId, r]) => {
                const ch = postizChannels.find(c => c.id === channelId)
                const label = (ch && PLATFORM_LABELS[ch.identifier]) || ch?.name || channelId
                const state = r.state ?? (r.success ? 'QUEUE' : 'ERROR')
                return (
                  <li key={channelId} style={{ fontSize: '12px', color: state === 'ERROR' ? 'var(--red)' : 'var(--ink2)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontWeight: 700 }}>{label}:</span>
                    {r.url ? (
                      <a href={r.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--teal-mid)', fontWeight: 700 }}>
                        View post ↗
                      </a>
                    ) : state === 'ERROR' ? (
                      <span>failed</span>
                    ) : state === 'PUBLISHED' ? (
                      <span style={{ color: 'var(--ink3)' }}>confirmed, link pending</span>
                    ) : (
                      <span style={{ color: 'var(--ink3)' }}>confirming…</span>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
        )}

        {selectedChannelIds.length > 0 && (
          <PostizCalendar posts={otherScheduled} loading={otherScheduledLoading} anchorDate={scheduleAt || undefined} onSlotClick={setScheduleAt} />
        )}

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          {can('sae.announcements.publish') && (
            <>
              <input type="datetime-local" value={scheduleAt} onChange={e => setScheduleAt(e.target.value)} disabled={!readyToPublish}
                style={{ padding: '7px 10px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '12.5px', fontFamily: 'inherit', color: 'var(--ink)' }} />
              <Button variant="ghost" onClick={scheduleClick} disabled={publishing !== null || !readyToPublish}>
                Schedule
              </Button>
              <Button variant="lime" onClick={publishNow} disabled={publishing !== null || !readyToPublish}>
                Post Now
              </Button>
            </>
          )}
          {announcement.status === 'failed' && (
            <Button variant="red" onClick={retryPublish} disabled={publishing !== null || !readyToPublish}>
              Retry
            </Button>
          )}
        </div>
        </div>
      </div>
      ) : (
      /* Send to Speaker — Self Promo's terminal action. No Postiz/channel/
          char-limit UI at all: this is an email to the speaker, not a post
          on Trescon's own channels. Send-for-Approval/self-approve stay
          identical to org-promo (same routes, same permission) — only the
          "approved → do the thing" action swaps from Schedule/Post Now to
          Send to Speaker, and the terminal 'published' status means
          "sent", not "posted". */
      <div style={{ padding: '16px 18px', borderRadius: '10px', border: '1px solid var(--border-light)', background: 'var(--surface)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <div style={{ fontSize: '10.5px', fontWeight: 800, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Send to Speaker</div>
          <Badge color={statusColor(announcement.status)}>{announcement.status.replace(/_/g, ' ')}</Badge>
        </div>

        {announcement.status === 'published' ? (
          <div style={{ fontSize: '12px', color: 'var(--teal-mid)', fontWeight: 700, marginBottom: '12px' }}>
            ✓ Sent to the speaker {announcement.published_at ? new Date(announcement.published_at).toLocaleString() : ''}
          </div>
        ) : (
          <div style={{ fontSize: '12px', color: 'var(--ink3)', marginBottom: '12px', lineHeight: 1.5 }}>
            This creative and post copy are emailed directly to the speaker, asking them to post it themselves and tag the event&apos;s channels — there is no publishing step here.
          </div>
        )}

        {/* 2026-08-29 fix, per Madhu, live: no longer gated on
            readyToPublish/internalDone — that Approval-readiness concept
            (approve → do the thing) was removed for self_promo above and
            can now never become true, which had silently made this button
            vanish entirely once a self_promo hit 'published', leaving no
            way to resend at all. Self_promo has no approval gate to check
            anymore — just the plain publish permission — and the button
            always stays available so a producer can add CC recipients or
            tweak wording and resend, the same way External Approval's own
            button already works (see that block's `!externalApproved`
            check, which similarly never blocks a resend, just a genuinely
            already-approved round). Label swaps to "Resend" once already
            sent once, so it reads honestly either way. */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          {can('sae.announcements.publish') && (
            <Button variant="lime" onClick={() => setSendToSpeakerOpen(true)}>
              {announcement.status === 'published' ? 'Resend to Speaker' : 'Send to Speaker'}
            </Button>
          )}
        </div>
      </div>
      ))}

      {/* Notify — post-publish tagging confirmation + internal/external
          notifications, and the ad-hoc WhatsApp team share. Pulled out of
          the Publishing card into its own stage (2026-08-31) — previously
          nested inside it, only visible once already scrolled past
          Publishing, which was part of why producers weren't reliably
          working through it. org_promo only, same reasoning as Approval
          above: self_promo's terminal action is the email itself, nothing
          further to notify anyone about. */}
      {effectiveKind === 'org_promo' && activeStage === 'notify' && (
      <div style={{ padding: '22px 26px', borderRadius: '12px', border: '1px solid var(--border-light)', background: 'var(--surface)' }}>
        <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: '14px' }}>Notify</div>

        {announcement.status !== 'published' ? (
          <div style={{ fontSize: '12.5px', color: 'var(--ink4)', lineHeight: 1.5 }}>
            Notification options unlock once this announcement is published — see the Publish stage.
          </div>
        ) : (
          <>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 12px', borderRadius: '8px', border: `1.5px solid ${announcement.tagging_confirmed_at ? 'var(--teal-mid)' : 'var(--border)'}`, background: announcement.tagging_confirmed_at ? 'var(--teal-light)' : 'transparent', cursor: 'pointer', marginBottom: '10px', fontSize: '12.5px', fontWeight: 700, color: 'var(--ink2)' }}>
              <input type="checkbox" checked={!!announcement.tagging_confirmed_at} disabled={confirmingTagging}
                onChange={e => toggleTaggingConfirmed(e.target.checked)} style={{ margin: 0 }} />
              I&apos;ve tagged the speaker/companies on each platform (or there was nothing to tag)
              {announcement.tagging_confirmed_at && <span style={{ color: 'var(--ink4)', fontWeight: 400 }}> — confirmed {new Date(announcement.tagging_confirmed_at).toLocaleString()}</span>}
            </label>

            {notifyError && <div style={{ fontSize: '12.5px', color: 'var(--red)', marginBottom: '10px' }}>{notifyError}</div>}

            {/* All three notify actions — WhatsApp share included — are
                gated on the tagging confirmation above (2026-08-31, per
                Madhu: "none of the notify buttons should be available"
                until then). WhatsApp used to sit above the checkbox and
                stay clickable regardless, on the reasoning that an internal
                preview share isn't "publishing" anything — but grouping it
                with the other two, same gate, reads as one honest rule
                rather than an exception a producer has to remember. */}
            {shareablePlatformLinks().length > 0 && (
              <div style={{ marginBottom: '10px', opacity: announcement.tagging_confirmed_at ? 1 : 0.5 }}>
                <Button variant="ghost" onClick={shareToTeam} disabled={!announcement.tagging_confirmed_at} title="Opens WhatsApp with the message pre-filled — pick your team's announcements group and send">
                  Share to Team on WhatsApp
                </Button>
              </div>
            )}

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center', opacity: announcement.tagging_confirmed_at ? 1 : 0.5 }}>
              <Button variant="ghost" onClick={notifyInternal} disabled={!announcement.tagging_confirmed_at || notifyingInternal}>
                {notifyingInternal ? 'Sending…' : announcement.internal_notified_at ? 'Remind Internal Team' : 'Notify Internal Team'}
              </Button>
              {announcement.internal_notified_at && (
                <span style={{ fontSize: '11.5px', color: 'var(--ink4)' }}>
                  Sent {new Date(announcement.internal_notified_at).toLocaleString()}
                  {announcement.internal_notification_reminder_count > 0 && ` · reminded ${announcement.internal_notification_reminder_count}× (last ${new Date(announcement.internal_notification_last_sent_at!).toLocaleString()})`}
                </span>
              )}
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center', marginTop: '8px', opacity: announcement.tagging_confirmed_at ? 1 : 0.5 }}>
              {!announcement.external_notified_at ? (
                <Button variant="ghost" onClick={() => setNotifyExternalOpen(true)} disabled={!announcement.tagging_confirmed_at}>
                  Notify {displayName(stakeholderKind, stakeholder)}
                </Button>
              ) : (
                <Button variant="ghost" onClick={remindExternal} disabled={!announcement.tagging_confirmed_at || remindingExternal}>
                  {remindingExternal ? 'Sending…' : 'Send Reminder'}
                </Button>
              )}
              {announcement.external_notified_at && (
                <span style={{ fontSize: '11.5px', color: 'var(--ink4)' }}>
                  Sent {new Date(announcement.external_notified_at).toLocaleString()} to {announcement.external_notification_recipient_email}
                  {announcement.external_notification_reminder_count > 0 && ` · reminded ${announcement.external_notification_reminder_count}× (last ${new Date(announcement.external_notification_last_sent_at!).toLocaleString()})`}
                </span>
              )}
            </div>
          </>
        )}
      </div>
      )}

      {sendToSpeakerOpen && stakeholderKind === 'speaker' && (
        <SendToSpeakerComposer
          announcementId={announcement.id}
          speakerName={displayName(stakeholderKind, stakeholder)}
          initialRecipientName={(stakeholder as Speaker).public_name || displayName(stakeholderKind, stakeholder)}
          initialRecipientEmail={speakerEmail(stakeholder as Speaker)}
          onClose={() => setSendToSpeakerOpen(false)}
          onSent={() => onUpdate({ status: 'published', published_at: new Date().toISOString() })}
        />
      )}

      {sendForExternalApprovalOpen && (
        <SendForExternalApprovalComposer
          announcementId={announcement.id}
          stakeholderName={displayName(stakeholderKind, stakeholder)}
          initialRecipientName={stakeholderKind === 'speaker' ? ((stakeholder as Speaker).public_name || displayName(stakeholderKind, stakeholder)) : displayName(stakeholderKind, stakeholder)}
          initialRecipientEmail={stakeholderKind === 'speaker' ? speakerEmail(stakeholder as Speaker) : ''}
          onClose={() => setSendForExternalApprovalOpen(false)}
          onSent={() => onUpdate({ external_approval_status: 'pending' })}
        />
      )}

      {sendForClientApprovalOpen && (
        <SendForClientApprovalComposer
          announcementId={announcement.id}
          eventName={eventName}
          clientContactName={clientContactName}
          clientContactJobTitle={clientContactJobTitle}
          clientContactEmail={clientContactEmail}
          onClose={() => setSendForClientApprovalOpen(false)}
          onSent={() => onUpdate({ client_approval_status: 'pending' })}
        />
      )}

      {publishModalMode && (
        <PublishProgressModal
          announcementId={announcement.id}
          channelIds={selectedChannelIds}
          postizChannels={postizChannels}
          mode={publishModalMode}
          onClose={() => setPublishModalMode(null)}
          onDone={onUpdate}
        />
      )}

      {scheduleModalOpen && (
        <ScheduleConfirmModal
          announcementId={announcement.id}
          channelIds={selectedChannelIds}
          postizChannels={postizChannels}
          scheduledForIso={new Date(scheduleAt).toISOString()}
          scheduledForLabel={new Date(scheduleAt).toLocaleString()}
          onClose={() => setScheduleModalOpen(false)}
          onDone={onUpdate}
        />
      )}

      {notifyExternalOpen && (
        <NotifyExternalComposer
          announcementId={announcement.id}
          stakeholderName={displayName(stakeholderKind, stakeholder)}
          initialRecipientName={stakeholderKind === 'speaker' ? ((stakeholder as Speaker).public_name || displayName(stakeholderKind, stakeholder)) : displayName(stakeholderKind, stakeholder)}
          initialRecipientEmail={stakeholderKind === 'speaker' ? speakerEmail(stakeholder as Speaker) : ''}
          onClose={() => setNotifyExternalOpen(false)}
          onSent={data => onUpdate({
            external_notified_at: data.external_notified_at,
            external_notification_recipient_name: data.external_notification_recipient_name,
            external_notification_recipient_email: data.external_notification_recipient_email,
            external_notification_last_sent_at: data.external_notification_last_sent_at,
          } as Partial<AnnouncementListItem>)}
        />
      )}

      {approverPickerOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'color-mix(in srgb, black 60%, transparent)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }} onClick={() => setApproverPickerOpen(false)}>
          <div onClick={e => e.stopPropagation()} style={{ width: '480px', maxWidth: '100%', maxHeight: '85vh', overflowY: 'auto', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px', padding: '22px', position: 'relative' }}>
            <button type="button" onClick={() => setApproverPickerOpen(false)} aria-label="Close"
              style={{ position: 'absolute', top: '16px', right: '16px', width: '26px', height: '26px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '7px', border: '1px solid var(--border-light)', background: 'var(--surface)', color: 'var(--ink3)', fontSize: '14px', lineHeight: 1, cursor: 'pointer' }}>
              ×
            </button>
            <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--ink)', marginBottom: '4px', paddingRight: '30px' }}>Send for Approval</div>
            <div style={{ fontSize: '12px', color: 'var(--ink3)', marginBottom: '16px', lineHeight: 1.5 }}>
              Pick who should review this announcement — each gets an email with a direct link, no EventPilot login required.
            </div>
            {eventStaff.length === 0 ? (
              <div style={{ fontSize: '12.5px', color: 'var(--ink4)' }}>No staff assigned to this event yet — assign someone under the event&apos;s Team tab first.</div>
            ) : (
              <>
                <input type="text" value={approverSearch} onChange={e => setApproverSearch(e.target.value)} placeholder="Search by name or email…"
                  style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '12.5px', fontFamily: 'inherit', marginBottom: '10px', boxSizing: 'border-box' }} />
                <div style={{ display: 'grid', gap: '8px', marginBottom: '18px' }}>
                {eventStaff.filter(es => {
                  const sm = Array.isArray(es.staff_members) ? es.staff_members[0] : es.staff_members
                  if (!sm) return false
                  const q = approverSearch.trim().toLowerCase()
                  return !q || sm.name?.toLowerCase().includes(q) || sm.email?.toLowerCase().includes(q)
                }).map(es => {
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
              </>
            )}
            <div style={{ display: 'flex', gap: '8px' }}>
              <Button variant="lime" onClick={sendForApproval} disabled={Object.keys(pickedApprovers).length === 0 || publishing !== null}>
                {publishing === 'approval' ? 'Sending…' : 'Send'}
              </Button>
              <Button variant="ghost" onClick={() => setApproverPickerOpen(false)}>Cancel</Button>
            </div>
          </div>
        </div>
      )}

      <ProcessingOverlay active={!!overlay} label={overlay?.label} estimatedMs={overlay?.estimatedMs} />
      </div>
    </div>
  )
}
