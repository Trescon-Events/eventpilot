import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { logOpsAccess, clientIp } from '@/app/lib/ops/audit'
import { auditOwner, operationsBasePath, ownerColumn, ownerFields, resolveScope, scopeFromParams } from '@/app/lib/ops/scope'
import { canManageSectionAccess, hasSectionAccess, OPS_SECTIONS, type OpsSection } from '@/app/lib/ops/section-access'
import { sendOpsNotice, PORTAL_BASE } from '@/app/lib/ops/vendor-auth/mail'
import { notifyStaff } from '@/app/lib/notify'
import { knownStaffId } from '@/app/lib/badges/service'

/* Ops > Access: who handles which Operations section (Speaker Licences, Badge Printing).
   GET  /api/events/operations/section-assignments?event_id= | ?umbrella_id=   assignments + who can be added
   POST /api/events/operations/section-assignments { event_id | umbrella_id, section, staff_id }
   An assignment gives that person access to the section and its notifications. Managing needs ops.access.manage
   (admins always). An event under an umbrella is managed at the umbrella (assignments there cover every event under it). */

const SECTION_KEYS = OPS_SECTIONS.map(s => s.key)

export async function GET(req: NextRequest) {
  const scope = await resolveScope(scopeFromParams(req.nextUrl.searchParams))
  if (!scope) return NextResponse.json({ error: 'event_id or umbrella_id required' }, { status: 400 })
  const session = getSession(req)
  const canManage = await canManageSectionAccess(session, scope)
  // Anyone who can see either section may see who is responsible; only managers can change it.
  const canSee = canManage || (await hasSectionAccess(session, scope, 'badges')) || (await hasSectionAccess(session, scope, 'licenses'))
  if (!canSee) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })

  const { data: rows } = await supabaseAdmin.from('ops_section_assignments').select('id, section, staff_id, assigned_at, staff_members!staff_id(name, email)').eq(ownerColumn(scope), scope.id).order('assigned_at')
  // People who can be assigned: the roster of the scope's events (same pool the Access screen uses).
  const { data: roster } = scope.eventIds.length
    ? await supabaseAdmin.from('event_staff').select('staff_id, role, staff_members!staff_id(id, name, email)').in('event_id', scope.eventIds)
    : { data: [] }
  const candidates = new Map<string, { id: string; name: string; email: string; role: string | null }>()
  for (const r of roster ?? []) {
    const sm = (Array.isArray(r.staff_members) ? r.staff_members[0] : r.staff_members) as { id: string; name: string; email: string } | null
    if (sm && !candidates.has(sm.id)) candidates.set(sm.id, { ...sm, role: (r.role as string | null) ?? null })
  }
  return NextResponse.json({
    scope: { kind: scope.kind, id: scope.id, name: scope.name }, can_manage: canManage,
    sections: OPS_SECTIONS.map(s => ({ key: s.key, label: s.label })),
    assignments: (rows ?? []).map(r => {
      const sm = (Array.isArray(r.staff_members) ? r.staff_members[0] : r.staff_members) as { name: string; email: string } | null
      return { id: r.id, section: r.section, staff_id: r.staff_id, name: sm?.name ?? '', email: sm?.email ?? '', assigned_at: r.assigned_at }
    }),
    candidates: [...candidates.values()].sort((a, b) => a.name.localeCompare(b.name)),
  })
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as { event_id?: string; umbrella_id?: string; section?: string; staff_id?: string } | null
  const scope = await resolveScope(scopeFromParams(body))
  if (!scope || !body?.staff_id || !body.section || !SECTION_KEYS.includes(body.section as OpsSection)) return NextResponse.json({ error: 'event_id (or umbrella_id), a valid section and staff_id are required.' }, { status: 400 })
  const session = getSession(req)
  if (!(await canManageSectionAccess(session, scope))) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })

  const { data: person } = await supabaseAdmin.from('staff_members').select('id, name, email').eq(`id`, body.staff_id).maybeSingle()
  if (!person) return NextResponse.json({ error: 'Staff member not found.' }, { status: 404 })
  const { data: onRoster } = scope.eventIds.length
    ? await supabaseAdmin.from('event_staff').select('staff_id').in('event_id', scope.eventIds).eq('staff_id', body.staff_id).limit(1)
    : { data: [] }
  if (!onRoster?.length) return NextResponse.json({ error: `${person.name} is not on the team roster of ${scope.name}.` }, { status: 422 })

  const { data: existing } = await supabaseAdmin.from('ops_section_assignments').select('id').eq(ownerColumn(scope), scope.id).eq('section', body.section).eq('staff_id', body.staff_id).maybeSingle()
  if (existing) return NextResponse.json({ error: `${person.name} is already assigned to this section.` }, { status: 409 })

  const by = await knownStaffId(session?.sid)
  const { data: row, error } = await supabaseAdmin.from('ops_section_assignments').insert({ ...ownerFields(scope), section: body.section, staff_id: body.staff_id, assigned_by: by }).select('id').single()
  if (error || !row) return NextResponse.json({ error: error?.message ?? 'Could not assign.' }, { status: 500 })

  await logOpsAccess({ ...auditOwner(scope), actorType: 'staff', actorId: by, action: 'ops_section_assigned', targetType: 'ops_section', targetId: row.id, meta: { section: body.section, staff_id: body.staff_id }, ip: clientIp(req) })
  // Tell the person what they are now responsible for (email + bell). Best effort.
  const label = OPS_SECTIONS.find(s => s.key === body.section)!.label
  const path = `${operationsBasePath(scope)}/${body.section === 'badges' ? 'badges' : 'licenses'}`
  const message = `You've been assigned to ${label} for ${scope.name}. You now have access to this section and will be notified when something needs you.`
  await Promise.all([
    sendOpsNotice({ to: [person.email as string], subject: `You're now responsible for ${label} — ${scope.name}`, heading: `You're assigned to ${label}`, message, link: { href: `${PORTAL_BASE}${path}`, label: `Open ${label}` } }).catch(() => {}),
    notifyStaff([person.id as string], { type: 'ops_section_assigned', title: `You're assigned to ${label} — ${scope.name}`, body: message, link: path, eventId: scope.kind === 'event' ? scope.id : null, umbrellaId: scope.kind === 'umbrella' ? scope.id : null }),
  ])
  return NextResponse.json({ ok: true, id: row.id })
}
