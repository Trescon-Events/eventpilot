import { supabaseAdmin } from '@/app/lib/supabase'
import { getAccessibleEventIds } from '@/app/lib/access/event-access'

/* Umbrellas to list under "My Events" on the dashboard (2026-09-26). An umbrella (e.g. Dubai Future
   Finance Week) isn't an event, so the events list never included it — an Operations user could only
   reach it by knowing the URL. Listed when the person can use its workspace: an admin / org-wide grant
   sees every umbrella; anyone else sees an umbrella only if they hold ops.view on one of its child events
   (the same rule the umbrella's Operations pages enforce). */
export type MyUmbrella = {
  id: string; name: string; type: string; status: string; event_date: string | null; end_date: string | null
  city: null; client_name: string | null; my_role: string | null; has_workspace_access: true
  kind: 'umbrella'; href: string
}

export async function umbrellasForStaff(staffId: string, allEvents: boolean): Promise<MyUmbrella[]> {
  let ids: string[] | null = null
  if (!allEvents) {
    const ops = await getAccessibleEventIds(staffId, 'ops.view')
    const eventIds = ops.allEvents ? null : ops.eventIds
    if (eventIds && eventIds.length === 0) return []
    if (eventIds) {
      const { data: kids } = await supabaseAdmin.from('events').select('umbrella_id').in('id', eventIds).not('umbrella_id', 'is', null)
      ids = [...new Set((kids ?? []).map(k => k.umbrella_id as string))]
      if (ids.length === 0) return []
    }
  }
  let q = supabaseAdmin.from('event_umbrellas').select('id, name, status, event_date, end_date, client_name, created_at').order('created_at', { ascending: false })
  if (ids) q = q.in('id', ids)
  const { data } = await q
  return (data ?? []).map(u => ({
    id: u.id, name: u.name, type: 'umbrella', status: u.status, event_date: u.event_date, end_date: u.end_date,
    city: null, client_name: u.client_name, my_role: allEvents ? null : 'Operations', has_workspace_access: true,
    kind: 'umbrella' as const, href: `/admin/umbrellas/${u.id}`,
  }))
}
