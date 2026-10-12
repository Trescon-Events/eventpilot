import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { requireGuestInviteAccess } from '@/app/lib/guest-invites/access'
import { createGuestCodeFor, proposeGuestCode } from '@/app/lib/guest-invites/provision'

/* POST /api/events/guest-invites/provision
   Body: { event_id, speaker_ids?: string[], all_missing?: boolean, codes?: { [speakerId]: string }, propose_only?: boolean }
   Creates the speakers' guest-pass codes on KonfHub and saves their links (or, with propose_only, just records the proposed
   code for review). `codes` carries a producer's edited code for a speaker. Works through at most CHUNK speakers per call
   (Cloudflare's 100 s limit) and returns `remaining` so the page can call again. Only Confirmed speakers without a link. */
const CHUNK = 8
export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => null) as { event_id?: string; speaker_ids?: string[]; all_missing?: boolean; codes?: Record<string, string>; propose_only?: boolean } | null
  if (!b?.event_id) return NextResponse.json({ error: 'event_id required' }, { status: 400 })
  const denied = await requireGuestInviteAccess(req, b.event_id, 'edit'); if (denied) return denied

  let q = supabaseAdmin.from('event_speakers').select('id, name, public_name').eq('event_id', b.event_id).eq('active', true).eq('confirmation_status', 'Confirmed').is('guest_invite_url', null).is('guest_invite_code', null).order('public_name')
  if (b.speaker_ids?.length) q = q.in('id', b.speaker_ids)
  else if (!b.all_missing) return NextResponse.json({ error: 'speaker_ids or all_missing required' }, { status: 400 })
  const { data: todo } = await q
  const batch = (todo ?? []).slice(0, CHUNK)
  const results: { id: string; name: string; ok: boolean; code?: string; error?: string }[] = []
  for (const s of batch) {
    const name = s.public_name || s.name
    if (b.propose_only) { const code = await proposeGuestCode(s.id); results.push(code ? { id: s.id, name, ok: true, code } : { id: s.id, name, ok: false, error: 'Could not build a code.' }); continue }
    const r = await createGuestCodeFor(s.id, b.codes?.[s.id] ?? null)
    results.push(r.ok ? { id: s.id, name, ok: true, code: r.code } : { id: s.id, name, ok: false, error: r.error })
  }
  // A failed speaker stays "missing", so exclude this call's failures from `remaining` or the client would loop on them.
  const done = new Set(batch.map(s => s.id))
  return NextResponse.json({ results, remaining: (todo ?? []).filter(s => !done.has(s.id)).map(s => s.id) })
}
