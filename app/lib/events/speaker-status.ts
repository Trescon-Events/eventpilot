import { supabaseAdmin } from '@/app/lib/supabase'
import { fetchAwaitingApprovalIds } from '@/app/lib/events/approval-round'

/* Roster status columns (2026-08-18 SAE-into-Hub merge, extended 2026-08-23
   for the 3-state Website/Social Post/Self Promo columns; extracted
   2026-09-04 from app/api/events/stakeholders/speakers/route.ts so the new
   Status Board route can reuse the exact same computation rather than
   duplicate it). None of these are booleans on event_speakers itself.
   Social Post: 'published' once any org_promo announcement's status is
   'published' (the sync-status cron only sets this once Postiz confirms a
   live post with a real URL — see app/api/cron/announcements/sync-status/
   route.ts), 'created' once one exists in any earlier state (draft/
   pending_review/approved/scheduled/failed), else 'pending'. Self Promo:
   'sent' once a stakeholder_announcement_sends row with status='sent'
   exists for one of this speaker's self_promo announcements, 'created'
   once a self_promo announcement exists but hasn't been sent yet, else
   'pending'. Two batched queries for the whole roster rather than N+1 per
   speaker. */

/* Social Post follows the post through its real stages (2026-10-19, per Madhu): created (a draft) -> awaiting_approval (an external/client round was sent
   and nobody has answered yet, or the post is in internal review) -> approved -> scheduled -> published. With several posts the furthest stage wins. */
export type TriState = 'pending' | 'created' | 'awaiting_approval' | 'approved' | 'scheduled' | 'published'

/** The Social Post state from a stakeholder's org_promo announcements (shared by speakers and partners). */
export function socialPostState(items: { id: string; status: string }[], awaiting: Set<string>): TriState {
  if (items.length === 0) return 'pending'
  if (items.some(i => i.status === 'published')) return 'published'
  if (items.some(i => i.status === 'scheduled')) return 'scheduled'
  if (items.some(i => i.status === 'approved')) return 'approved'
  if (items.some(i => i.status === 'pending_review' || awaiting.has(i.id))) return 'awaiting_approval'
  return 'created'
}
export type SelfPromoState = 'pending' | 'created' | 'sent'

// Website column — 'published' once actually pushed to KonfHub (which also
// publishes to the event website, see .../konfhub-push/route.ts), 'created'
// once internally ready to push (status='approved' + active=true — a looser
// proxy than the push route's own real eligibility check, kept as-is since
// this column predates that route), otherwise 'pending'.
export function websiteStatus(row: { konfhub_speaker_id: string | null; status: string; active: boolean }): TriState {
  if (row.konfhub_speaker_id) return 'published'
  if (row.status === 'approved' && row.active === true) return 'created'
  return 'pending'
}

export async function fetchAnnouncementStatus(speakerIds: string[]): Promise<Map<string, { socialPostStatus: TriState; selfPromoStatus: SelfPromoState }>> {
  const result = new Map<string, { socialPostStatus: TriState; selfPromoStatus: SelfPromoState }>()
  if (speakerIds.length === 0) return result

  const { data: announcements } = await supabaseAdmin
    .from('stakeholder_announcements')
    .select('id, speaker_id, announcement_kind, status')
    .in('speaker_id', speakerIds)

  const bySpeaker = new Map<string, { orgPromo: { id: string; status: string }[]; selfPromoIds: string[] }>()
  for (const a of announcements ?? []) {
    if (!a.speaker_id) continue
    const entry = bySpeaker.get(a.speaker_id) ?? { orgPromo: [], selfPromoIds: [] }
    if (a.announcement_kind === 'self_promo') entry.selfPromoIds.push(a.id)
    else entry.orgPromo.push({ id: a.id, status: a.status })
    bySpeaker.set(a.speaker_id, entry)
  }

  const allSelfPromoIds = [...bySpeaker.values()].flatMap(e => e.selfPromoIds)
  let sentAnnouncementIds = new Set<string>()
  if (allSelfPromoIds.length > 0) {
    const { data: sends } = await supabaseAdmin
      .from('stakeholder_announcement_sends')
      .select('announcement_id')
      .in('announcement_id', allSelfPromoIds)
      .eq('status', 'sent')
    sentAnnouncementIds = new Set((sends ?? []).map(s => s.announcement_id))
  }

  const awaiting = await fetchAwaitingApprovalIds([...bySpeaker.values()].flatMap(e => e.orgPromo.map(o => o.id)))

  for (const [speakerId, entry] of bySpeaker) {
    const socialPostStatus = socialPostState(entry.orgPromo, awaiting)
    const selfPromoStatus: SelfPromoState =
      entry.selfPromoIds.length === 0 ? 'pending'
      : entry.selfPromoIds.some(id => sentAnnouncementIds.has(id)) ? 'sent'
      : 'created'
    result.set(speakerId, { socialPostStatus, selfPromoStatus })
  }
  return result
}
