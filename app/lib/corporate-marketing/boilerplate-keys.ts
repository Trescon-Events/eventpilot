// Client-safe constants for the approved Trescon boilerplate (docs/build_suggestions/trescon-profile-boilerplate.md).
// Only these keys of corporate_company_content have an approval step; overview, vision, mission and tagline do not.
export const BOILERPLATE_KEYS = ['boilerplate', 'boilerplate_short', 'boilerplate_long', 'boilerplate_signature_module', 'boilerplate_managed_module'] as const
export type BoilerplateKey = (typeof BOILERPLATE_KEYS)[number]
export const isBoilerplateKey = (k: string): k is BoilerplateKey => (BOILERPLATE_KEYS as readonly string[]).includes(k)

export type ApprovalState = 'approved' | 'edited_since_approval' | 'not_approved'

/** approved: approved_text is set and equals the working copy; edited_since_approval: approved_text is set but the working copy differs. */
export function approvalState(row: { value_text: string | null; approved_text: string | null }): ApprovalState {
  if (!row.approved_text) return 'not_approved'
  return (row.value_text ?? '') === row.approved_text ? 'approved' : 'edited_since_approval'
}
