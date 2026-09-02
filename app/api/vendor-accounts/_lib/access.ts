import { NextRequest } from 'next/server'

// Vendor account creation/deletion/module-grants is platform-admin-only
// (Madhu/Durga) — a deliberately narrower bar than the general
// admin-or-HR-dept staff-creation check in app/api/hr/staff/route.ts, since
// this decides which EventPilot modules an external agency's login can
// reach. Task Manager's own vendor-contacts roster (who at the agency a
// task is tagged for) is a separate, narrower surface — see
// app/api/task-manager/vendor-contacts and _lib/access.ts there.
export function getVendorAccountsSession(req: NextRequest): { sid: string; adm?: boolean } | null {
  const raw = req.cookies.get('tcs_session')?.value
  if (!raw) return null
  try { return JSON.parse(Buffer.from(raw, 'base64').toString('utf-8')) as { sid: string; adm?: boolean } }
  catch { return null }
}

export function isPlatformAdmin(session: { sid: string; adm?: boolean } | null): boolean {
  return !!session?.adm
}
