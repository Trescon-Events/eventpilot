import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/app/lib/access/session'
import { getGlobalSecretStatus, setGlobalSecret, GLOBAL_SECRET_IDS } from '@/app/lib/integrations/global-secrets'

/* GET/POST /api/admin/integrations/hubspot-crm-key
   Global (not per-event) — admin-only, same session.adm gate as every
   other page under /admin/settings. GET never returns the decrypted
   value, only whether one's configured and who/when it was last set —
   matching HubSpot's own Service Key page convention of never re-showing
   a saved secret. POST accepts the raw pasted value once and encrypts it
   at rest (app/lib/integrations/global-secrets.ts). */

export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session?.adm) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })

  const status = await getGlobalSecretStatus(GLOBAL_SECRET_IDS.hubspotCrmServiceKey)
  return NextResponse.json(status)
}

export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session?.adm) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })

  const body = await req.json().catch(() => null) as { value?: string } | null
  if (!body?.value?.trim()) return NextResponse.json({ error: 'value required' }, { status: 400 })

  await setGlobalSecret(GLOBAL_SECRET_IDS.hubspotCrmServiceKey, 'HubSpot CRM Sync Service Key', body.value.trim(), session.sid === 'super-admin' ? null : session.sid)
  const status = await getGlobalSecretStatus(GLOBAL_SECRET_IDS.hubspotCrmServiceKey)
  return NextResponse.json(status)
}
