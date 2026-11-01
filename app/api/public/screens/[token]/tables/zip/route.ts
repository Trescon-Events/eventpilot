import { NextRequest, NextResponse } from 'next/server'
import { linkByToken } from '@/app/lib/screens/service'
import { lookOf, recordTableDownloads, tableDownloads, tablesPayload, tableVariants, zipResponse, isUuid, type ZipRequest } from '@/app/lib/screens/tables-service'
import { DEFAULT_TABLE_COUNT, MAX_TABLES } from '@/app/lib/screens/tables'

/* POST {template?, standby_template?, session, seats:[{name, moderator, table}], include_standby?, table_count?} — the cards as one zip, for the AV console's link. */
export const maxDuration = 120
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const link = await linkByToken((await params).token, 'tables')
  if (!link) return NextResponse.json({ error: 'Not found.' }, { status: 404 })
  const b = await req.json().catch(() => ({})) as ZipRequest & { table_count?: number; session_id?: string }
  const count = Math.min(MAX_TABLES, Math.max(1, Math.trunc(b.table_count ?? DEFAULT_TABLE_COUNT)))
  // The technician's own downloads are remembered (what he now has for this session), so a later change in the agenda can be flagged.
  if (isUuid(b.session_id ?? null)) void Promise.all([tablesPayload(link.event_id, null), tableDownloads(link.id)]).then(([p, had]) => { const s = p.sessions.find(x => x.id === b.session_id); return s ? recordTableDownloads(link.id, [s], lookOf(p.templates, b.template), x => had.get(x.id)?.via ?? 'session') : undefined }).catch(() => {})
  return zipResponse(await tableVariants(link.event_id), b, count)
}
