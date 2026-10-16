import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { hasPlatformPermission } from '@/app/lib/access/event-access'

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

/* For the messaging-document routes shared with events and umbrellas: only a Trescon-wide (org) document is held to the Content gate here;
   event and umbrella documents keep the checks they already have. */
export async function requireContentEditIfOrgDoc(req: NextRequest, docId: string): Promise<NextResponse | null> {
  const { data } = await supabaseAdmin.from('event_messaging_docs').select('org_scope').eq('id', docId).maybeSingle()
  return data?.org_scope ? requireContentEditAccess(req) : null
}
