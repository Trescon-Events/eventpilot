import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'

/** Admin or the given permission on THIS event; null = allowed, otherwise the 403 response. */
export async function requireGuestInviteAccess(req: NextRequest, eventId: string, level: 'view' | 'edit'): Promise<NextResponse | null> {
  const session = getSession(req)
  if (session?.adm) return null
  if (await hasEventPermission(session?.sid, eventId, level === 'edit' ? 'sae.stakeholders.edit' : 'sae.stakeholders.view')) return null
  return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
}

// custom_fields.email is the canonical, actively-maintained speaker email (values can also be string[]).
export function speakerEmailOf(customFields: Record<string, unknown> | null, legacyEmail: string | null): string {
  const v = customFields?.email
  const fromCustom = Array.isArray(v) ? v[0] : v
  return (typeof fromCustom === 'string' ? fromCustom : '').trim() || (legacyEmail ?? '').trim()
}
