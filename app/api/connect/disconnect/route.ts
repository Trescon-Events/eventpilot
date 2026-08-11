import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'

/* DELETE /api/connect/disconnect?provider=google|microsoft — removes the
   current staff member's own connection. Never touches another staff
   member's row (staff_id is always the session's own sid, never a param). */

export async function DELETE(req: NextRequest) {
  const session = getSession(req)
  if (!session?.sid) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })

  const provider = req.nextUrl.searchParams.get('provider')
  if (provider !== 'google' && provider !== 'microsoft') {
    return NextResponse.json({ error: 'provider must be google or microsoft' }, { status: 400 })
  }

  const { error } = await supabaseAdmin
    .from('staff_oauth_connections')
    .delete()
    .eq('staff_id', session.sid).eq('provider', provider)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
