/*
  Access gate for the PR Approvals feature (app/admin/dev-approvals + its
  API routes). Deliberately a hard email allowlist, not the general
  session.adm / access_roles admin check every other admin_only page uses —
  this button can merge code straight to production, so it's scoped to the
  two people named in this repo's own CLAUDE.md as owners (Madhu, Durga),
  not "anyone who happens to hold a platform-admin role."
*/
import { NextRequest } from 'next/server'
import { getSession } from '@/app/lib/access/session'
import { supabaseAdmin } from '@/app/lib/supabase'

const ALLOWED_EMAILS = ['md@tresconglobal.com', 'dc@tresconglobal.com']

export async function requireDevApprovalsAccess(req: NextRequest): Promise<{ ok: true; staffId: string; email: string } | { ok: false; status: number; error: string }> {
  const session = getSession(req)
  if (!session?.sid) return { ok: false, status: 401, error: 'Not authenticated' }

  const { data } = await supabaseAdmin.from('staff_members').select('email').eq('id', session.sid).maybeSingle()
  const email = data?.email?.toLowerCase() ?? ''

  if (!ALLOWED_EMAILS.includes(email)) {
    return { ok: false, status: 403, error: 'Forbidden — PR Approvals is restricted to Madhu and Durga' }
  }
  return { ok: true, staffId: session.sid, email }
}
