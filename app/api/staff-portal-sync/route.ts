import { NextRequest, NextResponse } from 'next/server'
import { runStaffPortalSync } from '@/app/lib/staff-portal/run-sync'
import { requireAdminOrHr } from '@/app/lib/access/require-admin'

/* POST /api/staff-portal-sync — manual trigger (admin dashboard / HR page
   "Sync from Staff Portal" buttons). Auth: a signature-verified admin or HR session
   (was a shared admin_code, removed 2026-09-25). Actual sync logic lives
   in app/lib/staff-portal/run-sync.ts, shared with the cron trigger at
   app/api/cron/staff-portal-sync so the two paths can't drift. */


export async function POST(req: NextRequest) {
  const denied = requireAdminOrHr(req)
  if (denied) return denied

  try {
    const result = await runStaffPortalSync()
    return NextResponse.json(result)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Sync failed' }, { status: 500 })
  }
}
