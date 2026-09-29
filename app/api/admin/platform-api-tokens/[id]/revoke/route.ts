import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { requirePlatformAdmin } from '@/app/lib/platform-api/admin-access'

/* POST /api/admin/platform-api-tokens/[id]/revoke — sets revoked_at, never
   deletes the row (the access log's own token_id FK, and the admin's own
   need to see "this token existed and was revoked on X date", both want
   the row to stay). authenticatePlatformApiToken() already treats any
   revoked_at as an instant, permanent 401 for every future request. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = requirePlatformAdmin(req)
  if (denied) return denied
  const session = getSession(req)
  const { id } = await params

  const { data, error } = await supabaseAdmin
    .from('platform_api_tokens')
    .update({ revoked_at: new Date().toISOString(), revoked_by: session?.sid ?? null })
    .eq('id', id)
    .select('id')
    .single()
  if (error || !data) return NextResponse.json({ error: error?.message ?? 'Token not found' }, { status: 404 })
  return NextResponse.json({ success: true })
}
