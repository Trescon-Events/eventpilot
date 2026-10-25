import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { requireProposalAccess } from '@/app/lib/proposals/server'

/* POST { event_id, name, email } → adds a client approver to the event's list (the address book every drop picks from). */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => null) as { event_id?: string; name?: string; email?: string } | null
  if (!b?.event_id) return NextResponse.json({ error: 'event_id required' }, { status: 400 })
  const a = await requireProposalAccess(req, b.event_id, 'edit'); if ('error' in a) return a.error
  const name = (b.name ?? '').trim().slice(0, 120), email = (b.email ?? '').trim().toLowerCase()
  if (!name) return NextResponse.json({ error: 'Add a name.' }, { status: 400 })
  if (!EMAIL.test(email)) return NextResponse.json({ error: `“${email || 'That'}” is not a valid email address.` }, { status: 400 })
  const { data, error } = await supabaseAdmin.from('speaker_proposal_approvers').insert({ event_id: b.event_id, name, email, created_by: a.session.sid ?? null }).select('id, name, email').single()
  if (error?.code === '23505') return NextResponse.json({ error: 'That email is already on the list.' }, { status: 409 })
  if (error || !data) return NextResponse.json({ error: 'Could not save that.' }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
