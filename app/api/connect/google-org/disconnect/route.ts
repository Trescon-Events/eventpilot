import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'

/* DELETE /api/connect/google-org/disconnect?connection_id=X — v1.3: removes
   one named Google connection outright. No reason to keep an empty
   placeholder row per account the way the old singleton did — a future
   connect for that identity just inserts a fresh row. Admin-only. */

export async function DELETE(req: NextRequest) {
  const session = getSession(req)
  if (!session?.adm) {
    return NextResponse.json({ error: 'Admin access required.' }, { status: 403 })
  }

  const connectionId = req.nextUrl.searchParams.get('connection_id')
  if (!connectionId) return NextResponse.json({ error: 'connection_id required' }, { status: 400 })

  const { error } = await supabaseAdmin
    .from('google_connections')
    .delete()
    .eq('id', connectionId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
