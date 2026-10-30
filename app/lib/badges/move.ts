import type { BadgeItemRow } from './types'

/* "Move to another batch" — a badge that needs a different template (a batch has exactly one template and one client approval) leaves its batch and starts again in another. Pure rules. */

export type BatchLite = { id: string; name: string; status: string; quantity: number | null; template_name: string }

/** The batches a badge may move into: another batch of the same event that is still being put together (draft or in review; an approved batch's approved set is not reopened), has a person-based
    template (not Common Badges), is not with the client right now, and does not already carry this person. */
export function eligibleTargets(sourceId: string, batches: BatchLite[], withClient: Set<string>, alreadyHas: Set<string>): BatchLite[] {
  return batches.filter(b => b.id !== sourceId && !b.quantity && b.status !== 'approved' && !withClient.has(b.id) && !alreadyHas.has(b.id))
}

/** The badge as it starts in the new batch: the same person and the same details as printed today (manual text/photo changes come with it), but not approved and not drawn yet —
    the new batch's template has to draw it and someone approves it there. */
export function movedItemRow(item: BadgeItemRow, targetBatchId: string, position: number) {
  return {
    batch_id: targetBatchId, position, speaker_id: item.speaker_id, vip_id: item.vip_id ?? null,
    name: item.name, title: item.title, company: item.company, country: item.country, photo_url: item.photo_url, photo_head_box: item.photo_head_box,
    overrides: item.overrides ?? {}, approved: false, removed: false, preview_url: null, preview_stale: true,
  }
}
