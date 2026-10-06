import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { requireGuestInviteAccess, speakerEmailOf } from '@/app/lib/guest-invites/access'
import { matchRows, type ImportRow, type MatchSpeaker } from '@/app/lib/guest-invites/match'

/* POST /api/events/guest-invites/import
   Body: { event_id, rows: [{ name?, email?, link }], apply?: boolean }

   Bulk-loads each speaker's unique KonfHub registration link. With apply=false (the
   default) it only PREVIEWS: every row is matched to a speaker (by email, then name,
   then the code's name prefix such as NURYMGUEST → Nurym) or flagged — invalid link,
   no match, more than one candidate, a code already used by someone else, a duplicate
   inside the file. apply=true saves only the rows that matched cleanly; usage
   counters for a replaced link are reset. Nothing is ever created on KonfHub. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as { event_id?: string; rows?: ImportRow[]; apply?: boolean } | null
  if (!body?.event_id || !Array.isArray(body.rows)) return NextResponse.json({ error: 'event_id and rows are required' }, { status: 400 })
  if (body.rows.length === 0 || body.rows.length > 500) return NextResponse.json({ error: 'Send between 1 and 500 rows.' }, { status: 400 })
  const denied = await requireGuestInviteAccess(req, body.event_id, 'edit'); if (denied) return denied

  const { data: sp } = await supabaseAdmin.from('event_speakers').select('id, name, public_name, email, custom_fields, guest_invite_code').eq('event_id', body.event_id).eq('active', true)
  const speakers: MatchSpeaker[] = (sp ?? []).map(s => ({ id: s.id, name: s.name, public_name: s.public_name, email: speakerEmailOf(s.custom_fields as Record<string, unknown> | null, s.email), guest_invite_code: s.guest_invite_code }))
  const results = matchRows(body.rows, speakers)
  const summary = { total: results.length, matched: results.filter(r => r.status === 'matched').length, needs_attention: results.filter(r => r.status !== 'matched').length }

  if (!body.apply) return NextResponse.json({ applied: false, summary, results })

  let saved = 0
  const failed: { index: number; error: string }[] = []
  for (const r of results.filter(x => x.status === 'matched')) {
    const { error } = await supabaseAdmin.from('event_speakers').update({
      guest_invite_url: r.url, guest_invite_code: r.code,
      ...(r.replaces ? { guest_invite_used: null, guest_invite_usage_checked_at: null } : {}),
    }).eq('id', r.speaker!.id).eq('event_id', body.event_id)
    if (error) failed.push({ index: r.index, error: error.code === '23505' ? 'That code is already used by another speaker.' : error.message }); else saved++
  }
  return NextResponse.json({ applied: true, saved, failed, summary, results })
}
