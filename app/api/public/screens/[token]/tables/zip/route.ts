import { NextRequest, NextResponse } from 'next/server'
import { linkByToken } from '@/app/lib/screens/service'
import { tableVariants, zipResponse, type ZipRequest } from '@/app/lib/screens/tables-service'
import { DEFAULT_TABLE_COUNT, MAX_TABLES } from '@/app/lib/screens/tables'

/* POST {template?, standby_template?, session, seats:[{name, moderator, table}], include_standby?, table_count?} — the cards as one zip, for the AV console's link. */
export const maxDuration = 120
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const link = await linkByToken((await params).token)
  if (!link) return NextResponse.json({ error: 'Not found.' }, { status: 404 })
  const b = await req.json().catch(() => ({})) as ZipRequest & { table_count?: number }
  const count = Math.min(MAX_TABLES, Math.max(1, Math.trunc(b.table_count ?? DEFAULT_TABLE_COUNT)))
  return zipResponse(await tableVariants(link.event_id), b, count)
}
