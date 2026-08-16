import { supabaseAdmin } from '@/app/lib/supabase'

// Phase 2 of the Event Workspace Access Roles foundation redesign
// (2026-08-16) — auto-applies hrms_role_access_map to a freshly-synced
// batch of project_role rows (see supabase/access_rbac.sql's "HRMS ROLE →
// ACCESS ROLE MAPPING" section for why this table exists). Called from
// both app/api/hrms-sync/route.ts (manual button) and
// app/api/cron/hrms-sync/route.ts (daily automated) right after each
// upserts event_staff.project_role_type, so both paths behave identically
// rather than duplicating this logic a third time.
//
// Every row this function writes is marked auto_granted = true, which is
// the whole safety mechanism: a re-sync (role_type changed, or a mapping
// changed) diffs against ONLY its own prior auto_granted rows and
// replaces them — it never reads, writes, or deletes a manually-assigned
// row (auto_granted = false), so an admin's manual override in the Access
// UI always wins and is never silently clobbered by the next sync.

export type ProjectRoleRow = { staff_id: string; event_id: string; project_role_type: string | null }

export async function applyRoleAccessMapping(rows: ProjectRoleRow[]): Promise<{ applied: number; removed: number }> {
  const withRoleType = rows.filter((r): r is ProjectRoleRow & { project_role_type: string } => !!r.project_role_type)
  if (withRoleType.length === 0) return { applied: 0, removed: 0 }

  const { data: mapRows } = await supabaseAdmin.from('hrms_role_access_map').select('role_type, access_role_id')
  const mapping = new Map(
    (mapRows ?? []).filter((m): m is { role_type: string; access_role_id: string } => !!m.access_role_id).map(m => [m.role_type, m.access_role_id])
  )

  const staffIds = [...new Set(withRoleType.map(r => r.staff_id))]
  const { data: existingAuto } = await supabaseAdmin
    .from('event_access_assignments')
    .select('id, event_id, staff_id, role_id')
    .eq('auto_granted', true)
    .in('staff_id', staffIds)

  const existingByKey = new Map((existingAuto ?? []).map(a => [`${a.event_id}:${a.staff_id}`, a]))

  const toInsert: { event_id: string; staff_id: string; role_id: string; auto_granted: true }[] = []
  const toDeleteIds: string[] = []

  for (const row of withRoleType) {
    const mappedRoleId = mapping.get(row.project_role_type)
    const key = `${row.event_id}:${row.staff_id}`
    const existing = existingByKey.get(key)

    if (!mappedRoleId) {
      // No mapping (or explicitly unmapped) for this role_type — remove
      // any stale auto-grant from a previous mapping, leave manual grants alone.
      if (existing) toDeleteIds.push(existing.id)
      continue
    }
    if (existing?.role_id === mappedRoleId) continue // already correct, nothing to do
    if (existing) toDeleteIds.push(existing.id) // role_type (or its mapping) changed — replace
    toInsert.push({ event_id: row.event_id, staff_id: row.staff_id, role_id: mappedRoleId, auto_granted: true })
  }

  if (toDeleteIds.length > 0) {
    await supabaseAdmin.from('event_access_assignments').delete().in('id', toDeleteIds)
  }
  if (toInsert.length > 0) {
    // ignoreDuplicates: a manual (auto_granted=false) row may already hold
    // this exact (event_id, staff_id, role_id) triple — the unique
    // constraint would reject a second row; skipping it is correct since
    // the desired state (this person holds this role on this event) is
    // already satisfied by the manual grant.
    await supabaseAdmin.from('event_access_assignments').upsert(toInsert, { onConflict: 'event_id,staff_id,role_id', ignoreDuplicates: true })
  }

  return { applied: toInsert.length, removed: toDeleteIds.length }
}
