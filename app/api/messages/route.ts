import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

function getSession(req: NextRequest) {
  const raw = req.cookies.get('tcs_session')?.value
  if (!raw) return null
  try { return JSON.parse(Buffer.from(raw, 'base64').toString('utf-8')) } catch { return null }
}

/* GET /api/messages?with=<partner_id>
   Returns the full thread between current user and partner, oldest first */
export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session?.sid) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const partnerId = req.nextUrl.searchParams.get('with')
  if (!partnerId) return NextResponse.json({ error: 'with param required' }, { status: 400 })

  const sid = session.sid

  const { data, error } = await supabaseAdmin
    .from('messages')
    .select('id, from_id, from_name, to_id, to_name, body, read, created_at')
    .or(`and(from_id.eq.${sid},to_id.eq.${partnerId}),and(from_id.eq.${partnerId},to_id.eq.${sid})`)
    .order('created_at', { ascending: true })
    .limit(200)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Mark incoming messages as read
  await supabaseAdmin
    .from('messages')
    .update({ read: true })
    .eq('to_id', sid)
    .eq('from_id', partnerId)
    .eq('read', false)

  return NextResponse.json(data ?? [])
}

/* POST /api/messages — send a message */
export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session?.sid) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const sid = session.sid
  const { to_id, body } = await req.json().catch(() => ({}))

  if (!to_id || !body?.trim()) {
    return NextResponse.json({ error: 'to_id and body are required' }, { status: 400 })
  }

  // Resolve sender and recipient names
  const [{ data: sender }, { data: recipient }] = await Promise.all([
    supabaseAdmin.from('staff_members').select('id, name').eq('id', sid).maybeSingle(),
    supabaseAdmin.from('staff_members').select('id, name').eq('id', to_id).maybeSingle(),
  ])

  if (!sender || !recipient) {
    return NextResponse.json({ error: 'Staff member not found' }, { status: 404 })
  }

  const { data: msg, error } = await supabaseAdmin
    .from('messages')
    .insert({
      from_id:   sid,
      from_name: sender.name,
      to_id,
      to_name:   recipient.name,
      body:      body.trim(),
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Create in-app notification for recipient (fire and forget)
  supabaseAdmin.from('notifications').insert({
    staff_id:       to_id,
    type:           'message',
    title:          `Message from ${sender.name}`,
    body:           body.trim().slice(0, 120) + (body.trim().length > 120 ? '…' : ''),
    from_staff_id:  sid,
  })

  return NextResponse.json(msg)
}

/* PATCH /api/messages?with=<partner_id> — mark thread as read */
export async function PATCH(req: NextRequest) {
  const session = getSession(req)
  if (!session?.sid) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const partnerId = req.nextUrl.searchParams.get('with')
  if (!partnerId) return NextResponse.json({ error: 'with param required' }, { status: 400 })

  await supabaseAdmin
    .from('messages')
    .update({ read: true })
    .eq('to_id', session.sid)
    .eq('from_id', partnerId)
    .eq('read', false)

  return NextResponse.json({ ok: true })
}
