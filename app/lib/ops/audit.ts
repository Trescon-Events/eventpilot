import { NextRequest } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

/* Append-only access audit for the Operations Hub (ops_access_audit).
   Best-effort by design for staff actions: a failed audit insert must not
   block ops from working, but it is logged. (Vendor-portal downloads in
   Phase 3 will treat a failed audit write as a hard failure instead.) */

export function clientIp(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? req.headers.get('x-real-ip') ?? 'unknown'
}

export async function logOpsAccess(entry: {
  eventId: string | null
  umbrellaId?: string | null
  actorType: 'staff' | 'vendor' | 'system'
  actorId: string | null
  action: string
  targetType?: string
  targetId?: string
  meta?: Record<string, unknown>
  ip?: string
}): Promise<boolean> {
  const { error } = await supabaseAdmin.from('ops_access_audit').insert({
    event_id: entry.eventId, umbrella_id: entry.umbrellaId ?? null, actor_type: entry.actorType, actor_id: entry.actorId, action: entry.action,
    target_type: entry.targetType ?? null, target_id: entry.targetId ?? null, meta: entry.meta ?? null, ip: entry.ip ?? null,
  })
  if (error) console.error('[ops-audit] insert failed:', error.message)
  return !error
}
