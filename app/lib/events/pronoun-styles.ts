// Third-person reference style for org-promo copy (2026-08-18) — deliberately
// small/closed; extending it needs a DB constraint change, not just this list.
export const PRONOUN_STYLES: { value: string; label: string }[] = [
  { value: 'he_him', label: 'He / Him' },
  { value: 'she_her', label: 'She / Her' },
  { value: 'his_excellency', label: 'His Excellency' },
  { value: 'her_excellency', label: 'Her Excellency' },
  { value: 'his_highness', label: 'His Highness' },
  { value: 'her_highness', label: 'Her Highness' },
]

export function pronounLabel(value: string | null | undefined): string | null {
  return PRONOUN_STYLES.find(p => p.value === value)?.label ?? null
}
