// Shared KB access-control rules — used by /api/documents/list, /api/kb/download,
// and getKBContext() so the three stay in lockstep instead of drifting apart.
//
// Layer 1 (knowledge_base) → always visible to everyone
// Layer 2 (general)        → visible to all staff
// Layer 3 (specific)       → only if department matches AND job_level meets min_level

export const LEVEL_RANK: Record<string, number> = {
  staff: 0, team_lead: 1, dept_head: 2, office_head: 3, super_admin: 4,
}

export const MIN_LEVEL_RANK: Record<string, number> = {
  all: 0, team_lead: 1, management: 3,
}

export function canAccessDocument(
  doc: { layer: string; department: string; min_level: string },
  staffDept: string,
  staffLevel: number
): boolean {
  if (staffLevel >= LEVEL_RANK.super_admin) return true
  if (doc.layer === 'knowledge_base') return true
  if (doc.layer === 'general') return true
  if (doc.layer === 'specific') {
    const deptMatch  = doc.department === 'all' || doc.department === staffDept
    const levelMatch = staffLevel >= (MIN_LEVEL_RANK[doc.min_level] ?? 0)
    return deptMatch && levelMatch
  }
  return true
}
