/**
 * POST /api/admin/access-requests/:id/deny
 *   body: { note?: string }
 *
 * Marks a pending request denied. Does not touch tool_grants / access_roles.
 * Auth: super admin only.
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

function parseSession(req: NextRequest): { sid?: string; adm?: boolean } | null {
  const raw = req.cookies.get('tcs_session')?.value
  if (!raw) return null
  try { return JSON.parse(Buffer.from(raw, 'base64').toString('utf-8')) } catch { return null }
}

type Ctx = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, ctx: Ctx) {
  const session = parseSession(req)
  if (!session?.adm || !session.sid) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id } = await ctx.params

  const body = await req.json().catch(() => ({}))
  const note = typeof body?.note === 'string' ? body.note.slice(0, 500) : null

  const { data: reqRow } = await supabaseAdmin
    .from('access_requests').select('status').eq('id', id).single()
  if (!reqRow) return NextResponse.json({ error: 'Request not found' }, { status: 404 })
  if (reqRow.status !== 'pending') {
    return NextResponse.json({ error: `Request already ${reqRow.status}` }, { status: 400 })
  }

  const { error } = await supabaseAdmin
    .from('access_requests')
    .update({
      status:     'denied',
      handled_by: session.sid,
      handled_at: new Date().toISOString(),
      note,
    })
    .eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
