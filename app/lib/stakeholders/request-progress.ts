import { supabaseAdmin } from '@/app/lib/supabase'
import { getEventFeatures } from '@/app/lib/access/event-access'
import { computeMissingItems, MissingItemKey, missingItemLabel } from '@/app/lib/stakeholders/missing-items'
import { SENSITIVE_EMAIL_LINE } from '@/app/lib/stakeholders/sensitive-consent'

export const TOKEN_TTL_MS = 14 * 24 * 60 * 60 * 1000

/* Which of a request's originally-requested items are STILL missing from the
   speaker's record right now. A speaker link stays open across partial
   submissions (2026-09-29), so "what's left" is always derived fresh from the
   record — which also covers items a producer filled in elsewhere meanwhile —
   never from a snapshot. Used by the submission page, submit route, and
   reminders so all three always agree. */
export async function remainingRequestedItems(speakerId: string, requested: MissingItemKey[]): Promise<MissingItemKey[]> {
  const { data: speaker } = await supabaseAdmin
    .from('event_speakers')
    .select('event_id, bio_full_url, photo_url, bio, country, is_uae_resident')
    .eq('id', speakerId)
    .single()
  if (!speaker) return []
  const { data: docs } = await supabaseAdmin.from('speaker_sensitive_documents').select('document_type').eq('speaker_id', speakerId).is('deleted_at', null)
  const docTypes = new Set((docs ?? []).map(d => d.document_type as 'passport' | 'national_id'))
  const features = await getEventFeatures(speaker.event_id)
  const missing = new Set(computeMissingItems(speaker, docTypes, {
    sensitiveDocuments: features.has('sensitive-documents'),
    uaeResidentField: features.has('uae-resident-field'),
  }).map(m => m.key))
  // national_id is only "missing" while residency is unknown/yes; when the
  // speaker answers "no" on the form it drops out of the missing set above.
  return requested.filter(k => missing.has(k))
}

/* eslint-disable no-restricted-syntax -- email HTML; clients can't render CSS custom properties, literal colors required (matches render-template.ts) */
export function outstandingItemsHtml(keys: MissingItemKey[]): string {
  const asksForDocuments = keys.some(k => k === 'passport' || k === 'national_id')
  return `<ul style="margin:8px 0 16px;padding-left:20px;">${keys.map(k => `<li style="margin-bottom:6px;font-weight:700;color:#0D6665;">${missingItemLabel(k)}</li>`).join('')}</ul>${asksForDocuments ? `<p style="margin:0 0 16px;font-size:13px;line-height:1.6;">${SENSITIVE_EMAIL_LINE}</p>` : ''}`
}
/* eslint-enable no-restricted-syntax */
