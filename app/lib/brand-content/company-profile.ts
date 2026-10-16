// Client-safe types and helpers for the Company profile (docs/build_suggestions/brand-and-content-section.md, Part 3).
export type TextState = 'approved' | 'edited_since_approval' | 'needs_review' | 'not_approved'

export type ProfileText = {
  key: string; label: string; working_text: string; approved_text: string | null
  approved_by: string | null; approved_at: string | null; figure_keys: string[]; needs_review: boolean
  updated_at: string; state: TextState
}
export type Figure = {
  key: string; label: string; value: string; unit: string | null; description: string | null; source: string | null; notes: string | null
  status: 'draft' | 'pending_review' | 'approved'; approved_value: string | null; approved_by: string | null; approved_at: string | null; updated_at: string
}

/** Not approved wins, then needs review (a figure it quotes changed), then edited since approval, else approved. */
export function textState(t: { working_text: string; approved_text: string | null; needs_review: boolean }): TextState {
  if (!t.approved_text) return 'not_approved'
  if (t.needs_review) return 'needs_review'
  return t.working_text === t.approved_text ? 'approved' : 'edited_since_approval'
}

export const STATE_LABEL: Record<TextState, string> = {
  approved: 'Approved', edited_since_approval: 'Edited since approval', needs_review: 'Needs review', not_approved: 'Not approved',
}
