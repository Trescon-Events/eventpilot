/**
 * Shared access check for /api/corporate-marketing/* routes.
 * Allows: super admins OR staff_members.tool_grants.corporate_marketing === true.
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

export type CMSession = { sid: string; adm?: boolean }

export type AccessResult =
  | { ok: true;  session: CMSession }
  | { ok: false; res: NextResponse }

export async function requireCorporateMarketingAccess(req: NextRequest): Promise<AccessResult> {
  const raw = req.cookies.get('tcs_session')?.value
  if (!raw) return { ok: false, res: NextResponse.json({ error: 'Not signed in' }, { status: 401 }) }

  let session: CMSession | null = null
  try { session = JSON.parse(Buffer.from(raw, 'base64').toString('utf-8')) } catch {}
  if (!session?.sid) return { ok: false, res: NextResponse.json({ error: 'Not signed in' }, { status: 401 }) }

  if (session.adm) return { ok: true, session }

  const { data } = await supabaseAdmin
    .from('staff_members')
    .select('tool_grants')
    .eq('id', session.sid)
    .single()

  if (!data?.tool_grants?.corporate_marketing) {
    return { ok: false, res: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { ok: true, session }
}
