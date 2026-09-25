import { supabaseAdmin } from '@/app/lib/supabase'
import { getStaffWithPermission } from '@/app/lib/ops/vendor-auth/support'
import { sendOpsNotice, PORTAL_BASE } from '@/app/lib/ops/vendor-auth/mail'
import { ownerColumn, operationsBasePath, type OpsScope } from '@/app/lib/ops/scope'

/* Shared lifecycle rules for licence batches (see
   supabase/ops_license_batches_migration.sql for the status set).

   draft → sent → downloaded → completed, with expired / cancelled as exits.
   A vendor can touch files ONLY while a batch is sent/downloaded AND its
   expires_at is still in the future. */

/** Statuses in which the vendor may download files and respond. */
export const VENDOR_ACTIVE = ['sent', 'downloaded'] as const
/** Statuses a vendor may even SEE in their list (never draft/cancelled). */
export const VENDOR_VISIBLE = ['sent', 'downloaded', 'completed', 'expired'] as const

export const MAX_ACCESS_DAYS = 30

/** Flips any sent/downloaded batch whose expiry has passed to 'expired'. Cheap, so callers run it before reading. */
export async function expireDueBatches(filter: { vendorId?: string; owner?: OpsScope }): Promise<void> {
  let q = supabaseAdmin.from('ops_license_batches').update({ status: 'expired' })
    .in('status', [...VENDOR_ACTIVE]).lt('expires_at', new Date().toISOString())
  if (filter.vendorId) q = q.eq('vendor_id', filter.vendorId)
  if (filter.owner) q = q.eq(ownerColumn(filter.owner), filter.owner.id)
  const { error } = await q
  if (error) console.error('[ops] expireDueBatches failed:', error.message)
}

export const isBatchAccessible = (b: { status: string; expires_at: string | null }): boolean =>
  (VENDOR_ACTIVE as readonly string[]).includes(b.status) && !!b.expires_at && new Date(b.expires_at).getTime() > Date.now()

/** Emails everyone with ops.licenses.view on ANY event of the scope (falling back to ops.view). Never throws. */
export async function notifyOps(scope: OpsScope, subject: string, heading: string, message: string): Promise<void> {
  try {
    const collect = async (key: string) => {
      const seen = new Map<string, string>()
      for (const eventId of scope.eventIds) for (const st of await getStaffWithPermission(eventId, key)) seen.set(st.id, st.email)
      return [...seen.values()]
    }
    let to = await collect('ops.licenses.view')
    if (!to.length) to = await collect('ops.view')
    await sendOpsNotice({
      to, subject, heading, message,
      link: { href: `${PORTAL_BASE}${operationsBasePath(scope)}/licenses`, label: 'Open Speaker Licences' },
    })
  } catch (e) {
    console.error('[ops] notifyOps failed:', e instanceof Error ? e.message : e)
  }
}

/** Closes a batch. Conditional on its current status (and, for vendors, on it being unexpired) so a race can't double-complete or resurrect it. Returns whether THIS call completed it. */
export async function completeBatch(
  batchId: string,
  completionType: 'license_uploaded' | 'approved',
  opts: { fromStatuses: readonly string[]; requireUnexpired: boolean },
): Promise<boolean> {
  let q = supabaseAdmin.from('ops_license_batches')
    .update({ status: 'completed', completed_at: new Date().toISOString(), completion_type: completionType })
    .eq('id', batchId).in('status', [...opts.fromStatuses])
  if (opts.requireUnexpired) q = q.gt('expires_at', new Date().toISOString())
  const { data, error } = await q.select('id')
  if (error) console.error('[ops] completeBatch failed:', error.message)
  return !!data?.length
}
