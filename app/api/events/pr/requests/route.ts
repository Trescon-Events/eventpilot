import { NextRequest, NextResponse } from 'next/server'
import { requirePrAccess } from '@/app/lib/pr/access'
import { loadInterestedForPr } from '@/app/lib/pr/media-interest'

/* GET ?event_id= — the speakers who said YES to media interviews, with their times and notes. This is all the PR person acts on; who has or has not been asked,
   who is still to answer and who declined is the producers' view (see ./outreach). */
export async function GET(req: NextRequest) {
  const eventId = req.nextUrl.searchParams.get('event_id')
  if (!eventId) return NextResponse.json({ error: 'event_id is required' }, { status: 400 })
  const auth = await requirePrAccess(req, eventId, 'view'); if ('error' in auth) return auth.error
  return NextResponse.json({ rows: await loadInterestedForPr(eventId) })
}
