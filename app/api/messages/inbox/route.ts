import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

function getSession(req: NextRequest) {
  const raw = req.cookies.get('tcs_session')?.value
  if (!raw) return null
  try { return JSON.parse(Buffer.from(raw, 'base64').toString('utf-8')) } catch { return null }
}

/* GET /api/messages/inbox
   Returns one entry per conversation: partner info, last message, unread count */
export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session?.sid) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const sid = session.sid

  // Fetch all messages involving this user, newest first, cap at 500
  const { data, error } = await supabaseAdmin
    .from('messages')
    .select('id, from_id, from_name, to_id, to_name, body, read, created_at')
    .or(`from_id.eq.${sid},to_id.eq.${sid}`)
    .order('created_at', { ascending: false })
    .limit(500)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Collapse into one entry per conversation partner
  const convMap = new Map<string, {
    partner_id:   string
    partner_name: string
    last_body:    string
    last_time:    string
    unread:       number
    is_mine:      boolean  // true = I sent the last msg
  }>()

  for (const m of (data ?? [])) {
    const partnerId   = m.from_id === sid ? m.to_id   : m.from_id
    const partnerName = m.from_id === sid ? m.to_name : m.from_name
    const isMine      = m.from_id === sid

    if (!convMap.has(partnerId)) {
      // First (latest) message for this partner
      convMap.set(partnerId, {
        partner_id:   partnerId,
        partner_name: partnerName,
        last_body:    m.body,
        last_time:    m.created_at,
        unread:       (!isMine && !m.read) ? 1 : 0,
        is_mine:      isMine,
      })
    } else {
      // Only accumulate unread count for older messages
      const c = convMap.get(partnerId)!
      if (!isMine && !m.read) c.unread++
    }
  }

  const conversations = Array.from(convMap.values())
    .sort((a, b) => new Date(b.last_time).getTime() - new Date(a.last_time).getTime())

  return NextResponse.json(conversations)
}
