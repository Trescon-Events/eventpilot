import { NextRequest, NextResponse } from 'next/server'
import { requireScreens } from '@/app/lib/screens/service'
import { isUuid, tableVariants, zipResponse, type ZipRequest } from '@/app/lib/screens/tables-service'
import { DEFAULT_TABLE_COUNT, MAX_TABLES } from '@/app/lib/screens/tables'

/* POST {event_id, template?, standby_template?, session:{date,startHM,topic}, seats:[{name, moderator, table}], include_standby?, table_count?} — the cards as one zip. */
export const maxDuration = 120
export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({})) as ZipRequest & { event_id?: string; table_count?: number }
  if (!isUuid(b.event_id)) return NextResponse.json({ error: 'event_id required' }, { status: 400 })
  const a = await requireScreens(req, b.event_id, 'view'); if ('error' in a) return a.error
  const count = Math.min(MAX_TABLES, Math.max(1, Math.trunc(b.table_count ?? DEFAULT_TABLE_COUNT)))
  return zipResponse(await tableVariants(b.event_id), b, count)
}
