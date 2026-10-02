import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { requireVendor } from '@/app/lib/ops/vendor-auth/guard'
import { vpError } from '@/app/lib/ops/vendor-auth/support'
import { loadOwnDispatch } from '@/app/lib/ops/vendor-badge-batch'
import { logOpsAccess } from '@/app/lib/ops/audit'
import { batchContext, notifyBadgeOps } from '@/app/lib/badges/dispatch'

/* POST /vendor-portal/api/badge-batches/[id]/confirm-printed { note? }
   The vendor says the badges are printed. Only after a complete download; conditional update so it can't happen twice.
   Ends the vendor's access to the file and tells Ops (email + bell). */
export const runtime = 'nodejs'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireVendor(req, { stateChanging: true })
  if ('error' in auth) return auth.error
  const { session, ip } = auth
  const { id } = await params
  const d = await loadOwnDispatch(session.vendorId, id)
  if (!d) return vpError(404, 'We could not find that print file.')
  if (d.status === 'printed') return vpError(409, 'This was already confirmed as printed.')
  if (d.status !== 'downloaded') return vpError(409, 'Please download the print file first.')

  const body = await req.json().catch(() => null) as { note?: string } | null
  const note = body?.note?.trim().slice(0, 500) || null
  const { data: moved } = await supabaseAdmin.from('badge_print_dispatches')
    .update({ status: 'printed', printed_confirmed_at: new Date().toISOString(), printed_confirmed_by: session.userId, printed_note: note })
    .eq('id', d.id).eq('status', 'downloaded').select('id')
  if (!moved?.length) return vpError(409, 'This print file is no longer waiting for confirmation.')

  await logOpsAccess({ eventId: d.event_id, actorType: 'vendor', actorId: session.userId, action: 'vendor_badge_printed_confirmed', targetType: 'badge_dispatch', targetId: d.id, meta: { note }, ip })
  const ctx = await batchContext(d.batch_id)
  if (ctx) await notifyBadgeOps(ctx, 'printed', { vendorName: session.vendorName, note })
  return NextResponse.json({ ok: true })
}
