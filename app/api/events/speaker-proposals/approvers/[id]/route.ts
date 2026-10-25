import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { requireProposalAccess } from '@/app/lib/proposals/server'

/* PATCH { name?, email? } · DELETE — edit or remove a saved approver. Drops that already picked them keep their own copy (and private link); this only changes the list. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
async function load(req: NextRequest, id: string) {
  const { data: row } = await supabaseAdmin.from('speaker_proposal_approvers').select('id, event_id').eq('id', id).maybeSingle()
  if (!row) return { error: NextResponse.json({ error: 'Not found.' }, { status: 404 }) } as const
  const a = await requireProposalAccess(req, row.event_id as string, 'edit')
  return 'error' in a ? a : { row }
}
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const r = await load(req, id); if ('error' in r) return r.error
  const b = await req.json().catch(() => null) as { name?: string; email?: string } | null
  const patch: Record<string, string> = {}
  if (b?.name !== undefined) { const n = b.name.trim().slice(0, 120); if (!n) return NextResponse.json({ error: 'Add a name.' }, { status: 400 }); patch.name = n }
  if (b?.email !== undefined) { const e = b.email.trim().toLowerCase(); if (!EMAIL.test(e)) return NextResponse.json({ error: `“${e}” is not a valid email address.` }, { status: 400 }); patch.email = e }
  if (!Object.keys(patch).length) return NextResponse.json({ error: 'Nothing to change.' }, { status: 400 })
  const { error } = await supabaseAdmin.from('speaker_proposal_approvers').update(patch).eq('id', id)
  if (error?.code === '23505') return NextResponse.json({ error: 'That email is already on the list.' }, { status: 409 })
  if (error) return NextResponse.json({ error: 'Could not save that.' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const r = await load(req, id); if ('error' in r) return r.error
  await supabaseAdmin.from('speaker_proposal_approvers').delete().eq('id', id)
  return NextResponse.json({ ok: true })
}
