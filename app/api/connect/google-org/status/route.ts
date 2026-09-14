import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/app/lib/access/session'
import { listGoogleConnections } from '@/app/lib/security/google-org-auth'

/* GET /api/connect/google-org/status — v1.3: every connected Google
   account, not one. Never exposes tokens. Admin-only, same as the rest of
   this connection's routes. */

export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session?.adm) {
    return NextResponse.json({ error: 'Admin access required.' }, { status: 403 })
  }

  const rows = await listGoogleConnections()

  return NextResponse.json({
    connections: rows
      .filter(r => !!r.google_account_email)
      .map(r => ({ id: r.id, email: r.google_account_email, connectedAt: r.connected_at })),
  })
}
