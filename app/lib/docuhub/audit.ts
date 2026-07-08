import { supabaseAdmin } from '@/app/lib/supabase'

type AuditAction = 'created' | 'updated' | 'deleted' | 'restored'
type ActorTier = 'owner' | 'user' | 'admin' | 'super_admin'

export async function logDocuHubAction(
  documentId: string | null,
  action: AuditAction,
  actorId: string | null,
  actorTier: ActorTier,
  details?: Record<string, unknown>
) {
  await supabaseAdmin.from('docuhub_audit_log').insert({
    document_id: documentId,
    action,
    actor_id: actorId,
    actor_tier: actorTier,
    details: details ?? null,
  })
}

/** Determines the tier to record for an audit entry: super_admin > admin > owner > user. */
export async function resolveActorTier(staffId: string | null, isAdmin: boolean, isOwner: boolean): Promise<ActorTier> {
  if (!staffId) return 'user'
  if (staffId === 'super-admin') return 'super_admin'
  if (isAdmin) {
    const { data } = await supabaseAdmin.from('staff_members').select('job_level').eq('id', staffId).single()
    return data?.job_level === 'super_admin' ? 'super_admin' : 'admin'
  }
  return isOwner ? 'owner' : 'user'
}
