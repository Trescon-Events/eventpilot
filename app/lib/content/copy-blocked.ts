import { COPY_CATALOGUE, variantLabel, type VariantLength, type VariantPhase } from './copy-catalogue'
import { seedCtaText } from './copy-model'

/* Copy Library slots that "Generate starter set" cannot fill yet (16 Nov 2026): the call to action before the event is copied from Common Details, and approved quotes are copied from a "quotes"
   section of the messaging document. When either source is missing the slot stays empty and would otherwise just fail on every press; the screen highlights it, says what is missing and what
   to do, and offers "Not used for this event". Pure: the caller supplies what exists. */

export type BlockedSlot = { key: string; label: string; length: VariantLength; phase: VariantPhase; slot_label: string; why: string; fix: string }

export function blockedSlots(input: { ownedSlots: Set<string>; ctaLabel: string | null | undefined; registrationUrl: string | null | undefined; hasQuotesSection: boolean }): BlockedSlot[] {
  const out: BlockedSlot[] = []
  const has = (k: string, l: string, p: string) => input.ownedSlots.has(`${k}|${l}|${p}`)
  for (const e of COPY_CATALOGUE) {
    for (const v of e.variants) {
      if (has(e.key, v.length, v.phase)) continue
      const base = { key: e.key, label: e.label, length: v.length, phase: v.phase, slot_label: `${e.label}${e.variants.length > 1 ? ` (${variantLabel(v)})` : ''}` }
      if (e.key === 'cta' && v.phase === 'pre' && !seedCtaText(input.ctaLabel, input.registrationUrl)) {
        out.push({ ...base, why: 'The event has no call-to-action label in Common Details, and the before-the-event call to action is copied from it.', fix: 'Add a call-to-action label in the event\'s Common Details, then press Generate starter set. Or mark it Not used for this event.' })
      } else if (e.fromDoc && !input.hasQuotesSection) {
        out.push({ ...base, why: 'The messaging document has no "quotes" section, and approved quotes are copied word for word from it.', fix: 'Add a quotes section to the messaging document, then press Generate starter set. Or mark it Not used for this event.' })
      }
    }
  }
  return out
}
