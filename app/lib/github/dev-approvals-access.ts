/*
  Access gate for the PR Approvals feature (app/admin/dev-approvals + its
  API routes). Deliberately a hard email allowlist, not the general
  session.adm / access_roles admin check every other admin_only page uses —
  this button can merge code straight to production, so decision-making
  (approve/reject) is scoped to the two people named in this repo's own
  CLAUDE.md as owners (Madhu, Durga), not "anyone who happens to hold a
  platform-admin role."

  Khalifa gets a separate view-only allowance (added 2026-09-01) so he can
  check the status of his own PRs without waiting on an email — the GET
  route uses requireDevApprovalsViewAccess, while the approve/reject POST
  routes keep using the stricter requireDevApprovalsAccess below.
*/
import { NextRequest } from 'next/server'
import { getSession } from '@/app/lib/access/session'
import { supabaseAdmin } from '@/app/lib/supabase'

const ALLOWED_EMAILS = ['md@tresconglobal.com', 'dc@tresconglobal.com']
const VIEW_ONLY_EMAILS = ['khalifa@tresconglobal.com']

async function resolveSessionEmail(req: NextRequest): Promise<{ ok: true; staffId: string; email: string } | { ok: false; status: number; error: string }> {
  const session = getSession(req)
  if (!session?.sid) return { ok: false, status: 401, error: 'Not authenticated' }

  const { data } = await supabaseAdmin.from('staff_members').select('email').eq('id', session.sid).maybeSingle()
  const email = data?.email?.toLowerCase() ?? ''
  return { ok: true, staffId: session.sid, email }
}

export async function requireDevApprovalsAccess(req: NextRequest): Promise<{ ok: true; staffId: string; email: string } | { ok: false; status: number; error: string }> {
  const resolved = await resolveSessionEmail(req)
  if (!resolved.ok) return resolved

  if (!ALLOWED_EMAILS.includes(resolved.email)) {
    return { ok: false, status: 403, error: 'Forbidden — PR Approvals is restricted to Madhu and Durga' }
  }
  return resolved
}

export async function requireDevApprovalsViewAccess(req: NextRequest): Promise<{ ok: true; staffId: string; email: string; canDecide: boolean } | { ok: false; status: number; error: string }> {
  const resolved = await resolveSessionEmail(req)
  if (!resolved.ok) return resolved

  if (!ALLOWED_EMAILS.includes(resolved.email) && !VIEW_ONLY_EMAILS.includes(resolved.email)) {
    return { ok: false, status: 403, error: 'Forbidden — PR Approvals is restricted to Madhu, Durga, and Khalifa (view only)' }
  }
  return { ...resolved, canDecide: ALLOWED_EMAILS.includes(resolved.email) }
}
