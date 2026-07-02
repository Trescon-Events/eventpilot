/*
  Save & Resume — one-draft operations.

  Endpoints:
    DELETE /api/drafts/[id]  — remove a draft (user chose "start new" or
                                tool finished/published).
    PATCH  /api/drafts/[id]  — toggle shared_with_team, update notes.

  Both are owner-only: only the draft's owner can delete or edit its
  metadata. Others can pick up a shared draft (via the GET list), but
  they can't remove or re-share it.
*/

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

function getSession(req: NextRequest) {
  const raw = req.cookies.get('tcs_session')?.value
  if (!raw) return null
  try { return JSON.parse(Buffer.from(raw, 'base64').toString('utf-8')) as { sid: string; adm?: boolean } }
  catch { return null }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = getSession(req)
  if (!session?.sid) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params

  // Only the owner (or admin) can delete
  const { data: draft } = await supabaseAdmin
    .from('active_drafts').select('user_id').eq('id', id).single()

  if (!draft) return NextResponse.json({ ok: true }) // already gone — idempotent
  if (draft.user_id !== session.sid && !session.adm) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { error } = await supabaseAdmin.from('active_drafts').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = getSession(req)
  if (!session?.sid) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const body = await req.json().catch(() => ({} as { shared_with_team?: boolean; notes?: string | null }))

  const { data: draft } = await supabaseAdmin
    .from('active_drafts').select('user_id').eq('id', id).single()

  if (!draft) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (draft.user_id !== session.sid && !session.adm) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const patch: Record<string, unknown> = { last_updated: new Date().toISOString() }
  if (typeof body.shared_with_team === 'boolean') patch.shared_with_team = body.shared_with_team
  if (body.notes !== undefined) patch.notes = body.notes

  const { error } = await supabaseAdmin.from('active_drafts').update(patch).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
