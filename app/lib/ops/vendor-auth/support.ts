import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { permissionSetSatisfies } from '@/app/lib/access/permission-match'

/* Every vendor-facing error carries the same "check with the Trescon Ops
   team" line, plus — once the vendor is signed in and we know which event —
   the name and email of every staff member with access to that event's
   Operations workspace (Madhu, 2026-09-24). Before sign-in we deliberately
   don't name anyone: a failed login must not reveal who works on what. */

export const HELP_LINE = 'If this continues, please check with the Trescon Ops team for help.'

export type SupportContact = { name: string; email: string }
export type StaffLite = { id: string; name: string; email: string }

/** Staff holding `permissionKey` on this event through a role assigned to the event (or globally). */
export async function getStaffWithPermission(eventId: string, permissionKey: string): Promise<StaffLite[]> {
  const nowIso = new Date().toISOString()
  const { data: assignments } = await supabaseAdmin
    .from('event_access_assignments')
    .select('role_id, staff_members!staff_id(id, name, email)')
    .or(`event_id.eq.${eventId},event_id.is.null`)
    .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
  if (!assignments?.length) return []

  const roleIds = [...new Set(assignments.map(a => a.role_id))]
  const { data: perms } = await supabaseAdmin.from('access_role_permissions').select('role_id, permission_key').in('role_id', roleIds)
  const keysByRole = new Map<string, string[]>()
  for (const p of perms ?? []) keysByRole.set(p.role_id, [...(keysByRole.get(p.role_id) ?? []), p.permission_key])

  const seen = new Set<string>()
  const staff: StaffLite[] = []
  for (const a of assignments) {
    if (!permissionSetSatisfies(keysByRole.get(a.role_id) ?? [], permissionKey)) continue
    const sm = Array.isArray(a.staff_members) ? a.staff_members[0] : a.staff_members
    if (sm && sm.email && !seen.has(sm.id)) { seen.add(sm.id); staff.push(sm) }
  }
  return staff.sort((a, b) => a.name.localeCompare(b.name))
}

export async function getSupportContacts(eventIds: string[]): Promise<SupportContact[]> {
  const seen = new Set<string>()
  const out: SupportContact[] = []
  for (const eventId of [...new Set(eventIds)]) {
    for (const s of await getStaffWithPermission(eventId, 'ops.view')) {
      if (!seen.has(s.id)) { seen.add(s.id); out.push({ name: s.name, email: s.email }) }
    }
  }
  return out
}

/** The one way vendor-portal routes return an error. */
export async function vpError(status: number, message: string, opts?: { eventIds?: string[]; headers?: Record<string, string> }): Promise<NextResponse> {
  const contacts = opts?.eventIds?.length ? await getSupportContacts(opts.eventIds) : []
  return NextResponse.json(
    { error: message, help: HELP_LINE, ...(contacts.length ? { contacts } : {}) },
    { status, headers: { 'Cache-Control': 'no-store', ...(opts?.headers ?? {}) } },
  )
}

/** CSRF defence on top of SameSite=Strict: state-changing requests must come from our own origin. */
export function isSameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get('origin')
  if (!origin) return false
  let originHost: string
  try { originHost = new URL(origin).host } catch { return false }
  const allowed = new Set<string>()
  for (const h of [req.headers.get('x-original-host'), req.headers.get('host')]) if (h) allowed.add(h.toLowerCase())
  try { allowed.add(new URL(process.env.NEXT_PUBLIC_APP_URL ?? 'https://eventpilot.tresconglobal.com').host.toLowerCase()) } catch { /* ignore */ }
  return allowed.has(originHost.toLowerCase())
}
