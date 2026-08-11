import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'

/* GET /api/connect/status — the current staff member's own connection
   state for both providers. Never exposes tokens, just whether a
   connection exists and which account it's for. */

export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session?.sid) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })

  const { data } = await supabaseAdmin
    .from('staff_oauth_connections')
    .select('provider, provider_account_email')
    .eq('staff_id', session.sid)

  const google = data?.find(d => d.provider === 'google')
  const microsoft = data?.find(d => d.provider === 'microsoft')

  return NextResponse.json({
    google: { connected: !!google, email: google?.provider_account_email ?? null },
    microsoft: { connected: !!microsoft, email: microsoft?.provider_account_email ?? null },
  })
}
