import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'
import { getEventSpeakerCategories } from '@/app/lib/konfhub/categories'

/* GET  ?event_id=X                              -> { categories: [{id, label}] } — empty when the event doesn't use per-speaker categories
   POST { event_id, ids: string[], category_id } -> sets event_speakers.konfhub_category_id for those speakers (null = the event default).
   Only saves the choice in EventPilot; the speaker moves on KonfHub at their next "Push to KonfHub". */

export async function GET(req: NextRequest) {
  const eventId = req.nextUrl.searchParams.get('event_id')
  if (!eventId) return NextResponse.json({ error: 'event_id required' }, { status: 400 })
  const session = getSession(req)
  if (!session?.adm && !(await hasEventPermission(session?.sid, eventId, 'sae.stakeholders.view'))) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  return NextResponse.json({ categories: await getEventSpeakerCategories(eventId) })
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as { event_id?: string; ids?: string[]; category_id?: string | null } | null
  if (!body?.event_id || !Array.isArray(body.ids) || body.ids.length === 0) return NextResponse.json({ error: 'event_id and ids are required.' }, { status: 400 })
  const session = getSession(req)
  if (!session?.adm && !(await hasEventPermission(session?.sid, body.event_id, 'sae.stakeholders.edit'))) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  const categoryId = body.category_id ?? null
  if (categoryId !== null && !(await getEventSpeakerCategories(body.event_id)).some(c => c.id === categoryId)) {
    return NextResponse.json({ error: 'That category isn’t set up for this event.' }, { status: 422 })
  }
  const { data, error } = await supabaseAdmin.from('event_speakers').update({ konfhub_category_id: categoryId }).eq('event_id', body.event_id).in('id', body.ids).select('id')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ updated: data?.length ?? 0 })
}
