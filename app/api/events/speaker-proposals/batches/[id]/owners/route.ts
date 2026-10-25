import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { authBatch } from '@/app/lib/proposals/server'
import { MAX_CO_OWNERS, eligibleTeam, isStaffId, ownersOf, recipientSids } from '@/app/lib/proposals/owners'
import { notifyStaff } from '@/app/lib/notify'

/* GET → { owner, co_owners, team, me, can_manage }   the drop's owner and co-owners, and the people they can be chosen from
   PUT { owner_sid?, co_owner_sids? }                  anyone who can edit the drop may make THEMSELVES the owner; changing it to someone else, or changing co-owners, is for the owner, a co-owner or an admin
   (until an owner exists, any editor may set it). The owner is who client emails go out as; co-owners are copied on every email and notification. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const a = await authBatch(req, id, 'view'); if ('error' in a) return a.error
  const [o, team] = await Promise.all([ownersOf(id), eligibleTeam(a.batch.event_id)])
  const me = isStaffId(a.session.sid) ? a.session.sid : null
  const canManage = !!a.session.adm || !o.owner || (!!me && recipientSids(o).includes(me))
  return NextResponse.json({ owner: o.owner, co_owners: o.coOwners, team, me, can_manage: canManage })
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const a = await authBatch(req, id, 'edit'); if ('error' in a) return a.error
  const b = await req.json().catch(() => null) as { owner_sid?: string | null; co_owner_sids?: string[] } | null
  if (!b) return NextResponse.json({ error: 'Bad request.' }, { status: 400 })
  const me = isStaffId(a.session.sid) ? a.session.sid : null
  const before = await ownersOf(id)
  const mayManage = !!a.session.adm || !before.owner || (!!me && recipientSids(before).includes(me))
  const takingOver = b.owner_sid !== undefined && !!me && b.owner_sid === me && b.co_owner_sids === undefined
  if (!mayManage && !takingOver) return NextResponse.json({ error: 'Only the drop’s owner or a co-owner can change this. You can make yourself the owner.' }, { status: 403 })

  const team = new Set((await eligibleTeam(a.batch.event_id)).map(p => p.sid))
  const allowed = (s: string) => team.has(s) || s === me
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  let owner = before.owner?.sid ?? null
  if (b.owner_sid !== undefined) {
    if (b.owner_sid !== null && (!isStaffId(b.owner_sid) || !allowed(b.owner_sid))) return NextResponse.json({ error: 'That person can’t be the owner — they need access to this event’s proposals.' }, { status: 400 })
    owner = b.owner_sid; patch.owner_sid = b.owner_sid
  }
  let co = before.coOwners.map(c => c.sid)
  if (b.co_owner_sids !== undefined) {
    const list = [...new Set(b.co_owner_sids)]
    if (list.some(s => !isStaffId(s) || !allowed(s))) return NextResponse.json({ error: 'Co-owners must be people with access to this event’s proposals.' }, { status: 400 })
    if (list.length > MAX_CO_OWNERS) return NextResponse.json({ error: `Add up to ${MAX_CO_OWNERS} co-owners.` }, { status: 400 })
    co = list
  }
  patch.co_owner_sids = co.filter(s => s !== owner)
  const { error } = await supabaseAdmin.from('speaker_proposal_batches').update(patch).eq('id', id)
  if (error) return NextResponse.json({ error: 'Could not save that.' }, { status: 500 })

  // Tell people what changed for them (bell only — never an email, never the client).
  const path = `/admin/events/${a.batch.event_id}/stakeholders/speaker-proposals/${id}`
  const who = (await ownersOf(id))
  const nameOf = (sid: string) => [who.owner, ...who.coOwners].find(p => p?.sid === sid)?.name ?? 'Someone'
  const by = me ? (nameOf(me) !== 'Someone' ? nameOf(me) : ((await supabaseAdmin.from('staff_members').select('name').eq('id', me).maybeSingle()).data?.name as string | undefined) ?? 'A colleague') : 'An admin'
  const hear = (sids: string[], title: string) => sids.length ? notifyStaff(sids, { type: 'speaker_proposal_owner', title, body: `${a.batch.name}`, link: path, eventId: a.batch.event_id }).catch(() => {}) : Promise.resolve()
  if (owner && owner !== before.owner?.sid && owner !== me) await hear([owner], `${by} made you the owner of “${a.batch.name}”`)
  if (before.owner && owner !== before.owner.sid && before.owner.sid !== me) await hear([before.owner.sid], `${by} took over “${a.batch.name}” from you`)
  const added = co.filter(s => s !== owner && !before.coOwners.some(c => c.sid === s) && s !== me)
  await hear(added, `${by} added you as a co-owner of “${a.batch.name}”`)
  return NextResponse.json({ ok: true, owner: who.owner, co_owners: who.coOwners })
}
