import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/app/lib/access/session'
import { syncContactToHubSpot } from '@/app/lib/hubspot/crm-sync'

// POST /api/crm/contacts/[id]/sync-hubspot — manual, producer-triggered push
// of one CRM contact to HubSpot (see app/lib/hubspot/crm-sync.ts for why
// this isn't automatic yet).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSession(req)
  if (!session?.adm) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  const { id } = await params

  try {
    const result = await syncContactToHubSpot(id)
    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Sync failed' }, { status: 400 })
  }
}
