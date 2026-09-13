import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'

/* DELETE /api/connect/google-org/disconnect — clears the shared org-level
   Google connection. Doesn't delete the singleton row (see
   supabase/google_org_connection.sql), just wipes its token fields, so
   the row keeps existing for the next connect to update. Admin-only. */

export async function DELETE(req: NextRequest) {
  const session = getSession(req)
  if (!session?.adm) {
    return NextResponse.json({ error: 'Admin access required.' }, { status: 403 })
  }

  const { data: existing } = await supabaseAdmin
    .from('google_org_connection')
    .select('id')
    .limit(1)
    .single()

  if (!existing) return NextResponse.json({ ok: true })

  const { error } = await supabaseAdmin
    .from('google_org_connection')
    .update({
      access_token_enc: null,
      refresh_token_enc: null,
      expires_at: null,
      google_account_email: null,
      connected_by: null,
      connected_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', existing.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
