'use client'

import { useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import type { BadgeColor } from '@/app/components/ui'

// post_copy is stored as plain text with '\n\n' paragraph breaks (not
// HTML) — the AI generation path writes it that way, and
// send-for-approval/publish-now/schedule all read it as pre-wrapped plain
// text downstream. The editor works in HTML internally (Tiptap), so these
// two convert at the boundary — nothing outside this page needs to know
// the editor exists.
export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
export function plainToHtml(text: string): string {
  return text.split(/\n\n+/).filter(Boolean).map(para => `<p>${escapeHtml(para).replace(/\n/g, '<br>')}</p>`).join('')
}

/* This file is no longer a real page (2026-08-18, SAE-into-Hub merge,
   step 5) — the workspace it used to render (browse-by-kind, pick a
   stakeholder, review creatives) is superseded by the Stakeholder Hub's
   roster + each speaker/partner's own Announcements tab, and Queue already
   covers "see everything across every stakeholder." The default export
   below is now just a redirect, kept at this URL so old bookmarks/links
   still land somewhere sensible instead of 404ing.

   Every OTHER export in this file (types, displayName/displaySubtitle/
   thumbUrl/statusColor/escapeHtml/plainToHtml) is
   still very much alive — AnnouncementDetailPanel, CreateAnnouncementModal,
   DeleteCreativeModal, the Stakeholder Hub's AnnouncementsTab/
   CreateAnnouncementForStakeholder, and the Admin Console all import from
   here. This module is the shared type/helper home for the whole SAE
   feature now, not just this one retired page — do not delete these
   exports when touching this file. */

export type StakeholderKind = 'speaker' | 'partner'

export type Speaker = {
  id: string; full_name: string; job_title: string; company_name: string
  photo_url: string | null; photo_processed_url: string | null; company_logo_url: string | null
  announcement_status: 'pending_review' | 'approved' | 'assets_missing' | 'ready' | 'archived'
  // Already present on GET .../speakers's `select('*')` response — added to
  // the type here (2026-08-18) to default Send to Speaker's recipient
  // fields without a second fetch. `email` is a legacy, no-longer-written
  // column (see app/api/events/stakeholders/speakers/route.ts's own
  // websiteStatus() comment) — custom_fields.email is the one the rest of
  // the app (KonfHub registration, Registration tab readiness) actually
  // trusts; prefer it wherever a speaker's email is quick-picked.
  email: string | null; public_name: string | null
  custom_fields: Record<string, string | string[]> | null
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
  // X (Twitter)-specific short copy (2026-08-27) — always generated
  // alongside post_copy, never a truncation of it. See
  // app/lib/events/announcements.ts's parseGeminiCopyResponse.
  post_copy_x: string | null
  creative_url: string | null
  creative_variant_id: string | null
  status: AnnouncementStatus
  created_at: string
  scheduled_for: string | null
  platforms: string[] | null
  published_at: string | null
  postiz_channel_ids: string[] | null
  publish_results: Record<string, { success: boolean; postId: string; state?: string; url?: string }> | null
  announcement_kind: 'org_promo' | 'self_promo'
  // Two-layer approval (2026-08-26), extended to three (2026-08-29, per
  // Madhu — a middle "Client Approval" round for events Trescon manages on
  // behalf of another client, e.g. DFS/DIFC) — external/client_approval_status
  // are both derived server-side the same way, from the latest
  // layer='external'/'client' announcement_approvals row ('none' if never
  // sent); the bypassed_at fields are set by the "not required" checkboxes.
  // See AnnouncementDetailPanel.tsx's Approval section for how these
  // combine into the publish-readiness check.
  external_approval_status: 'none' | 'pending' | 'approved' | 'approved_with_comments' | 'changes_requested'
  client_approval_status: 'none' | 'pending' | 'approved' | 'approved_with_comments' | 'changes_requested'
  // Per-layer status detail (2026-08-29) — the latest external/client
  // announcement_approvals row's own comments/actioned_at/reviewer name,
  // so the Approval section's per-layer status area can show what the
  // reviewer actually said, not just a bare status word.
  external_approval_comments: string | null
  external_approval_actioned_at: string | null
  external_approval_recipient: string | null
  external_approval_notified_at: string | null
  client_approval_comments: string | null
  client_approval_actioned_at: string | null
  client_approval_recipient: string | null
  client_approval_notified_at: string | null
  internal_approval_bypassed_at: string | null
  external_approval_bypassed_at: string | null
  client_approval_bypassed_at: string | null
  // Post-publish notify flow (2026-08-27) — tagging_confirmed_at is the
  // single hard-gate checkbox (both "confirmed" and "bypass" in one, see
  // confirm-tagging/route.ts); the notified_at pair is each channel's
  // permanent first-sent record, reminder_count/last_sent_at track resends.
  tagging_confirmed_at: string | null
  internal_notified_at: string | null
  internal_notification_reminder_count: number
  internal_notification_last_sent_at: string | null
  external_notified_at: string | null
  external_notification_reminder_count: number
  external_notification_last_sent_at: string | null
  external_notification_recipient_name: string | null
  external_notification_recipient_email: string | null
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

export const PLATFORM_LABELS: Record<string, string> = {
  linkedin: 'LinkedIn', 'linkedin-page': 'LinkedIn Page', x: 'X', instagram: 'Instagram', youtube: 'YouTube',
}

export function statusColor(s: AnnouncementStatus): BadgeColor {
  if (s === 'published' || s === 'approved' || s === 'approved_with_comments') return 'teal'
  if (s === 'failed' || s === 'changes_requested') return 'red'
  if (s === 'scheduled') return 'purple'
  return 'amber' // draft, pending_approval
}

export default function CreativeTemplatesWorkspaceRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = use(params)
  const router = useRouter()

  useEffect(() => {
    router.replace(`/admin/events/${eventId}/stakeholders`)
  }, [eventId, router])

  return (
    <div style={{ minHeight: '100vh', background: 'var(--surface)', padding: '32px', color: 'var(--ink3)', fontSize: '13px' }}>
      Redirecting to the Stakeholder Hub…
    </div>
  )
}
