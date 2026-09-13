import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'

/* GET /api/connect/google-org/status — whether the shared org-level
   Google connection exists, and which account it is. Never exposes
   tokens. Admin-only, same as the rest of this connection's routes. */

export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session?.adm) {
    return NextResponse.json({ error: 'Admin access required.' }, { status: 403 })
  }

  const { data } = await supabaseAdmin
    .from('google_org_connection')
    .select('google_account_email, connected_at, connected_by')
    .limit(1)
    .single()

  return NextResponse.json({
    connected: !!data?.google_account_email,
    email: data?.google_account_email ?? null,
    connectedAt: data?.connected_at ?? null,
  })
}
