import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession as verifiedGetSession } from '@/app/lib/access/session'

/* GET /api/toolkit-access
   Returns { access: true/false } for the current session user.
   Super admins always get access.
*/
export async function GET(req: NextRequest) {
  const session = verifiedGetSession(req)
  if (!session?.sid) return NextResponse.json({ access: false })

  // Super admins get full unrestricted access
  if (session.adm) return NextResponse.json({ access: true, grants: null })

  const { data } = await supabaseAdmin
    .from('staff_members')
    .select('toolkit_access, tool_grants')
    .eq('id', session.sid)
    .single()

  const grants: Record<string, boolean> = {
    ...(data?.tool_grants ?? {}),
    // toolkit_access legacy flag maps to smart_data
    ...(data?.toolkit_access ? { smart_data: true } : {}),
  }
  const hasAny = Object.values(grants).some(Boolean)
  return NextResponse.json({ access: hasAny, grants })
}

/* PATCH /api/toolkit-access
   Body: { id: string, toolkit_access: boolean }
   Toggles toolkit_access for one staff member. Super admin only.
*/
export async function PATCH(req: NextRequest) {
  // Signature-verified admin session (2026-09-25 cookie sweep).
  const session = verifiedGetSession(req)
  if (!session?.adm) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { id, toolkit_access } = await req.json().catch(() => ({}))
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const { error } = await supabaseAdmin
    .from('staff_members')
    .update({ toolkit_access })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
