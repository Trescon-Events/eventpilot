import { NextRequest, NextResponse } from 'next/server'
import { runStaffPortalSync } from '@/app/lib/staff-portal/run-sync'

/* POST /api/staff-portal-sync — manual trigger (admin dashboard / HR page
   "Sync from Staff Portal" buttons). Auth: admin_code in request body,
   matching the old hrms-sync route's convention. Actual sync logic lives
   in app/lib/staff-portal/run-sync.ts, shared with the cron trigger at
   app/api/cron/staff-portal-sync so the two paths can't drift. */

const ADMIN_CODE = process.env.NEXT_PUBLIC_ADMIN_CODE ?? 'eventpilot2026'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  if (body.admin_code !== ADMIN_CODE) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await runStaffPortalSync()
    return NextResponse.json(result)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Sync failed' }, { status: 500 })
  }
}
