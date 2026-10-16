import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/app/lib/access/session'
import { hasPlatformPermission } from '@/app/lib/access/event-access'

/* GET /api/brand-content/access — what the signed-in person may do in Brand & Content. Drives which controls the pages show; every write
   route still checks on the server. */
export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const superAdmin = !!session.adm
  const [brand, content] = superAdmin ? [true, true] : await Promise.all([
    hasPlatformPermission(session.sid, 'platform.branding.manage'),
    hasPlatformPermission(session.sid, 'platform.content.manage'),
  ])
  return NextResponse.json({ can_edit_brand: brand, can_edit_content: content, can_approve: superAdmin })
}
