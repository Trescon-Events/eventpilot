import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { scopeOfRow, hasScopePermission, ownerColumn, auditOwner, scopeSupportContacts } from '@/app/lib/ops/scope'
import { loadBatches } from '@/app/lib/ops/batches'
import { completeBatch, expireDueBatches, MAX_ACCESS_DAYS } from '@/app/lib/ops/batch-lifecycle'
import { sendVendorBatchAvailable } from '@/app/lib/ops/vendor-auth/mail'
import { logOpsAccess, clientIp } from '@/app/lib/ops/audit'

/* POST /api/events/operations/licenses/batches/[batchId]/action
   Body: { action: 'send' | 'extend' | 'revoke' | 'reopen' | 'mark_approved', days?: 1-30 }

     send          draft → sent. Makes the batch available to the vendor for
                   `days` (default the batch's own setting, max 30) and emails
                   the vendor's logins a NOTICE (no files, no documents). Refused
                   if any speaker changed since the batch was made.
     extend        sent/downloaded: push expiry to now + days (never shorter).
     revoke        sent/downloaded → cancelled. Vendor access ends immediately
                   and the speakers return to the ready list.
     reopen        completed/expired → available again for `days`.
     mark_approved sent/downloaded/expired → completed (approved, no file), for
                   when ops learns of approval outside the portal.
   Gated by ops.licenses.manage. Every action is audited. */

type Action = 'send' | 'extend' | 'revoke' | 'reopen' | 'mark_approved'
const ACTIONS: Action[] = ['send', 'extend', 'revoke', 'reopen', 'mark_approved']

export async function POST(req: NextRequest, { params }: { params: Promise<{ batchId: string }> }) {
  const { batchId } = await params
  const body = await req.json().catch(() => null) as { action?: Action; days?: number } | null
  if (!body?.action || !ACTIONS.includes(body.action)) return NextResponse.json({ error: 'A valid action is required.' }, { status: 400 })

  const { data: batch } = await supabaseAdmin.from('ops_license_batches')
    .select('id, event_id, umbrella_id, vendor_id, batch_number, status, access_days, expires_at, downloaded_at').eq('id', batchId).maybeSingle()
  if (!batch) return NextResponse.json({ error: 'Batch not found.' }, { status: 404 })

  const scope = await scopeOfRow(batch)
  const session = getSession(req)
  if (!scope || !(await hasScopePermission(session, scope, 'ops.licenses.manage'))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }
  await expireDueBatches({ owner: scope })
  const { data: fresh } = await supabaseAdmin.from('ops_license_batches').select('status').eq('id', batch.id).single()
  const status = fresh?.status ?? batch.status

  const days = body.days ?? batch.access_days
  if (['send', 'extend', 'reopen'].includes(body.action) && (!Number.isInteger(days) || days < 1 || days > MAX_ACCESS_DAYS)) {
    return NextResponse.json({ error: `Vendor access must be between 1 and ${MAX_ACCESS_DAYS} days.` }, { status: 400 })
  }
  const expiresAt = new Date(Date.now() + days * 86_400_000).toISOString()
  const audit = (action: string, meta?: Record<string, unknown>) =>
    logOpsAccess({ ...auditOwner(scope), actorType: 'staff', actorId: session?.sid ?? null, action, targetType: 'license_batch', targetId: batch.id, meta: { batch_number: batch.batch_number, ...meta }, ip: clientIp(req) })
  const wrongState = (msg: string) => NextResponse.json({ error: msg }, { status: 409 })

  switch (body.action) {
    case 'send': {
      if (status !== 'draft') return wrongState('Only a draft batch can be sent.')
      const view = (await loadBatches(scope)).find(b => b.id === batch.id)
      const changed = view?.items.filter(i => i.flags.length).length ?? 0
      if (changed) return wrongState(`${changed} speaker${changed === 1 ? ' has' : 's have'} changed since this batch was created (documents replaced or speaker cancelled). Cancel this draft and create a new batch.`)

      const [{ data: vendor }, { data: link }, { data: users }] = await Promise.all([
        supabaseAdmin.from('ops_vendors').select('active').eq('id', batch.vendor_id).single(),
        supabaseAdmin.from('ops_event_vendors').select('vendor_id').eq(ownerColumn(scope), scope.id).eq('vendor_id', batch.vendor_id).eq('purpose', 'speaker_license').maybeSingle(),
        supabaseAdmin.from('ops_vendor_users').select('name, email').eq('vendor_id', batch.vendor_id).neq('status', 'disabled'),
      ])
      if (!vendor?.active || !link) return wrongState('This vendor is not active here.')
      if (!users?.length) return wrongState('This vendor has no Vendor Portal login yet. Create one under Vendors first.')

      const { data: sent } = await supabaseAdmin.from('ops_license_batches')
        .update({ status: 'sent', sent_at: new Date().toISOString(), expires_at: expiresAt, access_days: days })
        .eq('id', batch.id).eq('status', 'draft').select('id')
      if (!sent?.length) return wrongState('This batch is no longer a draft.')

      const contacts = await scopeSupportContacts(scope)
      let emailed = 0
      for (const u of users) {
        try {
          await sendVendorBatchAvailable({ to: u.email, name: u.name, eventName: scope.name, batchNumber: batch.batch_number, speakerCount: view?.items.length ?? 0, expiresAt: new Date(expiresAt), contacts })
          emailed++
        } catch (e) { console.error('[ops] batch notice email failed:', e instanceof Error ? e.message : e) }
      }
      await audit('batch_sent', { days, emailed })
      return NextResponse.json({ ok: true, emailed, of: users.length })
    }

    case 'extend': {
      if (status !== 'sent' && status !== 'downloaded') return wrongState('Only a batch the vendor can currently access can be extended.')
      if (batch.expires_at && new Date(expiresAt) <= new Date(batch.expires_at)) return wrongState('That would not extend the current access period.')
      await supabaseAdmin.from('ops_license_batches').update({ expires_at: expiresAt, access_days: days }).eq('id', batch.id).in('status', ['sent', 'downloaded'])
      await audit('batch_extended', { days })
      return NextResponse.json({ ok: true })
    }

    case 'revoke': {
      if (status !== 'sent' && status !== 'downloaded') return wrongState('Only a sent batch can be revoked. Drafts are cancelled instead.')
      const { data: done } = await supabaseAdmin.from('ops_license_batches').update({ status: 'cancelled' }).eq('id', batch.id).in('status', ['sent', 'downloaded']).select('id')
      if (!done?.length) return wrongState('This batch changed state. Refresh and try again.')
      await supabaseAdmin.from('ops_license_batch_items').update({ active: false }).eq('batch_id', batch.id)
      await audit('batch_revoked')
      return NextResponse.json({ ok: true })
    }

    case 'reopen': {
      if (status !== 'completed' && status !== 'expired') return wrongState('Only a completed or expired batch can be reopened.')
      const { data: vendor } = await supabaseAdmin.from('ops_vendors').select('active').eq('id', batch.vendor_id).single()
      if (!vendor?.active) return wrongState('This vendor is inactive.')
      const { data: done } = await supabaseAdmin.from('ops_license_batches')
        .update({ status: batch.downloaded_at ? 'downloaded' : 'sent', completed_at: null, completion_type: null, expires_at: expiresAt, access_days: days })
        .eq('id', batch.id).in('status', ['completed', 'expired']).select('id')
      if (!done?.length) return wrongState('This batch changed state. Refresh and try again.')
      await audit('batch_reopened', { days })
      return NextResponse.json({ ok: true })
    }

    case 'mark_approved': {
      const ok = await completeBatch(batch.id, 'approved', { fromStatuses: ['sent', 'downloaded', 'expired'], requireUnexpired: false })
      if (!ok) return wrongState('Only a sent, downloaded or expired batch can be marked approved.')
      await audit('batch_marked_approved')
      return NextResponse.json({ ok: true })
    }
  }
}
