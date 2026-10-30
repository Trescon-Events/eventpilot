import { NextRequest, NextResponse } from 'next/server'
import { linkByToken } from '@/app/lib/screens/service'
import { tablesPayload } from '@/app/lib/screens/tables-service'

/* Table Screens (the AV console's private link) — the Table Screen templates and this link's stage's sessions with their speakers in seat order. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const link = await linkByToken((await params).token, 'tables')
  if (!link) return NextResponse.json({ error: 'Not found.' }, { status: 404 })
  return NextResponse.json(await tablesPayload(link.event_id, link.track_id))
}
