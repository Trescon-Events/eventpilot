import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission, hasPlatformPermission } from '@/app/lib/access/event-access'

/* Brand & Content access (docs/build_suggestions/brand-and-content-section.md, Part 1): everyone signed in can read; editing the Content
   pages needs platform.content.manage or super admin; approving is super admin only. Checked on the server in every write route, so a
   page gate alone is never what protects a write. */
export async function requireContentEditAccess(req: NextRequest): Promise<NextResponse | null> {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (session.adm) return null
  if (await hasPlatformPermission(session.sid, 'platform.content.manage')) return null
  return NextResponse.json({ error: 'You do not have permission to edit Content pages (needs platform.content.manage).' }, { status: 403 })
}

export function requireSuperAdmin(req: NextRequest): NextResponse | null {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (!session.adm) return NextResponse.json({ error: 'Only a super admin can approve.' }, { status: 403 })
  return null
}

/* For the messaging-document write routes (apply-edit, propose-edit, suggested-rule accept, clarification answer): the same gate the upload and
   delete routes already use, so no write relies on the page alone. Super admin always passes; a Trescon-wide document needs
   platform.content.manage; an umbrella document needs sae.messaging.umbrella_manage on that umbrella; an event document needs
   sae.forms.manage on that event. */
export async function requireDocWriteAccess(req: NextRequest, docId: string): Promise<NextResponse | null> {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const { data: doc } = await supabaseAdmin.from('event_messaging_docs').select('event_id, umbrella_id, org_scope').eq('id', docId).maybeSingle()
  if (!doc) return null // the route reports "not found" itself
  if (doc.org_scope) return requireContentEditAccess(req)
  if (session.adm) return null
  const ownerId = (doc.event_id ?? doc.umbrella_id) as string | null
  const key = doc.umbrella_id ? 'sae.messaging.umbrella_manage' : 'sae.forms.manage'
  if (ownerId && (await hasEventPermission(session.sid, ownerId, key))) return null
  return NextResponse.json({ error: 'You do not have permission to change this document.' }, { status: 403 })
}
