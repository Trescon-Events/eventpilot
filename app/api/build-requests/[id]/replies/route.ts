import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

function getSession(req: NextRequest) {
  const raw = req.cookies.get('tcs_session')?.value
  if (!raw) return null
  try { return JSON.parse(Buffer.from(raw, 'base64').toString('utf-8')) as { sid: string; adm?: boolean } }
  catch { return null }
}

/* POST /api/build-requests/[id]/replies — pilot responds to needs_clarification */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSession(req)
  if (!session?.sid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const { message } = await req.json().catch(() => ({}))
  if (!message?.trim()) return NextResponse.json({ error: 'message is required' }, { status: 400 })

  const { data: request } = await supabaseAdmin.from('build_requests').select('submitted_by, status').eq('id', id).single()
  if (!request) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Only the submitter can reply (unless admin)
  if (!session.adm && request.submitted_by !== session.sid)
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Can only reply when clarification is needed
  if (!session.adm && request.status !== 'needs_clarification')
    return NextResponse.json({ error: 'Can only reply when status is needs_clarification' }, { status: 400 })

  const { data: reply, error } = await supabaseAdmin.from('build_request_replies').insert({
    request_id: id, author_id: session.sid, is_admin_reply: false, message: message.trim(),
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Update request timestamp
  await supabaseAdmin.from('build_requests').update({ updated_at: new Date().toISOString() }).eq('id', id)

  return NextResponse.json({ reply }, { status: 201 })
}
