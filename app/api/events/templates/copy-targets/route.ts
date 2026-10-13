import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getServerSession } from '@/app/lib/registry/access'
import { hasEventPermission } from '@/app/lib/access/event-access'

/* GET /api/events/templates/copy-targets?exclude=<eventId>
   Every event the caller may copy a template INTO (same gate as the Admin Console itself: platform admin, or
   sae.admin.access on that event). Used by the "Copy to…" dialog in the template editor. */
export async function GET(req: NextRequest) {
  const session = await getServerSession()
  if (!session) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  const exclude = req.nextUrl.searchParams.get('exclude')

  const { data: events, error } = await supabaseAdmin.from('events').select('id, name, status, umbrella_id, event_umbrellas(name)').order('name')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = (events ?? []).filter(e => e.id !== exclude)
  const allowed = session.adm ? rows : (await Promise.all(rows.map(async e => (await hasEventPermission(session.sid, e.id, 'sae.admin.access')) ? e : null))).filter((e): e is typeof rows[number] => !!e)
  return NextResponse.json(allowed.map(e => ({
    id: e.id, name: e.name, status: e.status,
    umbrella: (e.event_umbrellas as unknown as { name?: string } | null)?.name ?? null,
  })))
}
