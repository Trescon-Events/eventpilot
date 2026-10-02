import { supabaseAdmin } from '@/app/lib/supabase'

/* In-app bell notifications for staff (the `notifications` table; Realtime already pushes new rows to an open
   browser). `link` is an absolute path like /admin/events/<id>/operations/badges/<batch>. Never throws — a failed
   bell entry must not break the action that triggered it. */
export async function notifyStaff(
  staffIds: string[],
  n: { type: string; title: string; body: string; link?: string; eventId?: string | null; umbrellaId?: string | null },
): Promise<void> {
  const ids = [...new Set(staffIds)].filter(Boolean)
  if (!ids.length) return
  const { error } = await supabaseAdmin.from('notifications').insert(ids.map(staff_id => ({
    staff_id, type: n.type, title: n.title, body: n.body, link: n.link ?? null, event_id: n.eventId ?? null, umbrella_id: n.umbrellaId ?? null,
  })))
  if (error) console.error('[notify] insert failed:', error.message)
}
