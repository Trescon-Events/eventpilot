import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'

/* GET /api/events/press-releases?event_id=X — list press releases for an event, newest first. */
export async function GET(req: NextRequest) {
  const eventId = req.nextUrl.searchParams.get('event_id')
  if (!eventId) return NextResponse.json({ error: 'event_id required' }, { status: 400 })

  const session = getSession(req)
  if (!session?.adm && !(await hasEventPermission(session?.sid, eventId, 'sae.content_studio.press_release.view'))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  const { data, error } = await supabaseAdmin
    .from('press_releases')
    .select('id, title, status, created_at, updated_at, press_release_versions(count)')
    .eq('event_id', eventId)
    .order('updated_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

/* POST /api/events/press-releases — create a new press release shell for an event. Body: { event_id, title }. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as { event_id?: string; title?: string } | null
  if (!body?.event_id || !body?.title?.trim()) {
    return NextResponse.json({ error: 'event_id and title are required' }, { status: 400 })
  }

  const session = getSession(req)
  if (!session?.adm && !(await hasEventPermission(session?.sid, body.event_id, 'sae.content_studio.press_release.generate'))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  const { data, error } = await supabaseAdmin
    .from('press_releases')
    .insert({ event_id: body.event_id, title: body.title.trim(), created_by: session?.sid ?? null })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
