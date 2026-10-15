import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { loadSetupSnapshot } from '@/app/lib/events/sae-setup'
import { blockingChecks } from '@/app/lib/events/sae-readiness'

/* POST /api/events/sae-setup/approve  Body: { event_id }
   Platform admins only (not delegatable). Records approval of the event's current setup — the fingerprint it stores is what the
   generate gate compares against, so any later change to the fixed-line fields, mode, live documents or active rules needs a new approval.
   Refused while any blocking readiness check fails. Never changes documents or rules. */
export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session?.adm) return NextResponse.json({ error: 'Only a platform admin can approve an event’s setup.' }, { status: 403 })
  const body = await req.json().catch(() => null) as { event_id?: string } | null
  if (!body?.event_id) return NextResponse.json({ error: 'event_id required' }, { status: 400 })
  const snap = await loadSetupSnapshot(body.event_id)
  if (!snap) return NextResponse.json({ error: 'Event not found' }, { status: 404 })
  const blocks = blockingChecks(snap.checks)
  if (blocks.length) return NextResponse.json({ error: `Fix these first: ${blocks.map(b => b.message).join(' ')}`, reasons: blocks.map(b => b.message) }, { status: 409 })
  const approvedAt = new Date().toISOString()
  const { error } = await supabaseAdmin.from('events').update({ sae_setup_approved_at: approvedAt, sae_setup_approved_by: session.sid, sae_setup_fingerprint: snap.fingerprint }).eq('id', body.event_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, approved_at: approvedAt })
}
