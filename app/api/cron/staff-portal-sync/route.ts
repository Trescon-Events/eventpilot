import { NextRequest, NextResponse } from 'next/server'
import { runStaffPortalSync } from '@/app/lib/staff-portal/run-sync'

/* GET /api/cron/staff-portal-sync
   Auth: Authorization: Bearer <CRON_SECRET>
   Schedule on cron-job.org: daily, same convention as every other
   cron-job.org-triggered route in this repo — register by hand, nothing
   in-repo auto-registers a job. Replaces the old app/api/cron/hrms-sync
   (deleted 2026-09-10). Once this is confirmed running, retire the old
   cron-job.org job that pointed at the deleted route and retire the
   EventPilot admin user account in Staff Portal per Lovable's note. */

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await runStaffPortalSync()
    return NextResponse.json(result)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Sync failed' }, { status: 500 })
  }
}
