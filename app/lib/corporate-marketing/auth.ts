/**
 * Shared access check for /api/corporate-marketing/* routes.
 * Allows: super admins OR staff_members.tool_grants.corporate_marketing === true.
 *
 * Why this is a standalone check instead of the shared registry gate
 * (app/lib/registry/access.ts checkAccess()/requireModuleAccess()) or the
 * generic module_access table: Corporate Marketing was built with its own
 * client-side layout guard (app/admin/toolkit/corporate-marketing/layout.tsx,
 * a useEffect -> /api/toolkit-access check) before the module registry was
 * unified, and every API route under /api/corporate-marketing/* calls this
 * function directly rather than going through requireModuleAccess(). It was
 * left in place on purpose rather than migrated — same tool_grants JSONB
 * column either way, migrating the plumbing carries risk without changing
 * behavior. It intentionally has no moduleAccessKey/AccessTab of its own:
 * the "Who has access" list in SettingsTab.tsx (deck/SettingsTab.tsx) is
 * read-only display, not a grant UI. Granting/revoking corporate_marketing
 * happens through the generic "Staff -> Access & Tools" toggle
 * (/api/admin/tool-permissions) or the access-requests flow
 * (app/lib/access-requests/grant-map.ts) — both write the same
 * tool_grants.corporate_marketing flag this function reads, so there is no
 * disconnect between "granting it" and "the gate checking it". Don't add a
 * second write path here without checking this file first.
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
