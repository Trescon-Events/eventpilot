import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

/* GET /api/toolkit-access
   Returns { access: true/false } for the current session user.
   Super admins always get access.
*/
export async function GET(req: NextRequest) {
  const raw = req.cookies.get('tcs_session')?.value
  if (!raw) return NextResponse.json({ access: false })

  let session: { sid: string; adm?: boolean } | null = null
  try { session = JSON.parse(Buffer.from(raw, 'base64').toString('utf-8')) } catch { return NextResponse.json({ access: false }) }
  if (!session?.sid) return NextResponse.json({ access: false })

  // Super admins always have toolkit access
  if (session.adm) return NextResponse.json({ access: true })

  const { data } = await supabaseAdmin
    .from('staff_members')
    .select('toolkit_access')
    .eq('id', session.sid)
    .single()

  return NextResponse.json({ access: data?.toolkit_access === true })
}

/* PATCH /api/toolkit-access
   Body: { id: string, toolkit_access: boolean }
   Toggles toolkit_access for one staff member. Super admin only.
*/
export async function PATCH(req: NextRequest) {
  const raw = req.cookies.get('tcs_session')?.value
  if (!raw) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  let session: { adm?: boolean } | null = null
  try { session = JSON.parse(Buffer.from(raw, 'base64').toString('utf-8')) } catch {}
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
