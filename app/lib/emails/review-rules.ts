/* Emails module — template review (2026-11-12). Pure: when does a template need a person to confirm it is still accurate for an event?
   A confirmation records the template text and the event's compiled reference (messaging doc + style guide, own and umbrella) it was checked against. */

export const REVIEW_MAX_AGE_DAYS = 90

export type ReviewRecord = { reviewed_at: string; template_updated_at: string | null; reference_version: number | null }
export type ReferenceInfo = { version: number; compiled_at: string } | null
export type ReviewState = { state: 'reviewed' | 'stale'; reasons: string[] }

const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

export function decideReview(args: { template_updated_at: string | null; review: ReviewRecord | null; reference: ReferenceInfo; now: Date }): ReviewState {
  const { review, reference, now } = args
  if (!review) return { state: 'stale', reasons: ['Not yet reviewed for this event.'] }
  const reasons: string[] = []
  const tpl = args.template_updated_at ? Date.parse(args.template_updated_at) : null
  const was = review.template_updated_at ? Date.parse(review.template_updated_at) : null
  if (tpl !== null && (was === null || tpl > was + 1000)) reasons.push(`The template was edited on ${day(args.template_updated_at!)}, after it was last reviewed.`)
  if (reference && (review.reference_version === null || reference.version > review.reference_version)) reasons.push(`The event’s messaging reference changed on ${day(reference.compiled_at)} (a messaging doc or style guide was approved), after it was last reviewed.`)
  if (now.getTime() - Date.parse(review.reviewed_at) > REVIEW_MAX_AGE_DAYS * 86_400_000) reasons.push(`It was last reviewed on ${day(review.reviewed_at)}, more than ${REVIEW_MAX_AGE_DAYS} days ago.`)
  return reasons.length ? { state: 'stale', reasons } : { state: 'reviewed', reasons: [] }
}
