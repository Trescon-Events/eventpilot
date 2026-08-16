import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { listPostizIntegrations, PostizError } from '@/app/lib/postiz'

/* GET /api/events/postiz-channels?event_id=X
   Thin wrapper around listPostizIntegrations — powers both the event
   settings' "Connected Channels" default-selection UI and the
   per-announcement channel picker, so neither has to know the Postiz
   client directly.

   2026-08-16 fix, made against Trescon's real live Postiz workspace: the
   real /integrations response has no "customer"/group data on it at all —
   this is a single flat workspace, not Postiz's multi-customer setup — so
   gating on postiz_profile_key blocked every event from ever seeing its
   channels (confirmed live: World AI Show Malaysia has no profile key set
   and returned []). Now calls listPostizIntegrations() unscoped by
   default and only passes `group` when an event actually has a profile
   key set, so this still works automatically if/when Trescon's Postiz
   plan adds real per-customer scoping later. */
export async function GET(req: NextRequest) {
  const eventId = req.nextUrl.searchParams.get('event_id')
  if (!eventId) return NextResponse.json({ error: 'event_id required' }, { status: 400 })

  const { data: event, error } = await supabaseAdmin.from('events').select('postiz_profile_key').eq('id', eventId).single()
  if (error || !event) return NextResponse.json({ error: 'Event not found' }, { status: 404 })

  try {
    const channels = await listPostizIntegrations(event.postiz_profile_key || undefined)
    return NextResponse.json({ channels })
  } catch (e) {
    const message = e instanceof PostizError ? e.message : 'Failed to fetch Postiz channels'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
