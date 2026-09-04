import { supabaseAdmin } from '@/app/lib/supabase'

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

export type TriState = 'pending' | 'created' | 'published'
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

  const bySpeaker = new Map<string, { orgPromoStatuses: string[]; selfPromoIds: string[] }>()
  for (const a of announcements ?? []) {
    if (!a.speaker_id) continue
    const entry = bySpeaker.get(a.speaker_id) ?? { orgPromoStatuses: [], selfPromoIds: [] }
    if (a.announcement_kind === 'self_promo') entry.selfPromoIds.push(a.id)
    else entry.orgPromoStatuses.push(a.status)
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

  for (const [speakerId, entry] of bySpeaker) {
    const socialPostStatus: TriState =
      entry.orgPromoStatuses.length === 0 ? 'pending'
      : entry.orgPromoStatuses.includes('published') ? 'published'
      : 'created'
    const selfPromoStatus: SelfPromoState =
      entry.selfPromoIds.length === 0 ? 'pending'
      : entry.selfPromoIds.some(id => sentAnnouncementIds.has(id)) ? 'sent'
      : 'created'
    result.set(speakerId, { socialPostStatus, selfPromoStatus })
  }
  return result
}
