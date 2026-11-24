import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/app/lib/access/session'
import { requireAdmin } from '@/app/lib/access/require-admin'
import { getGlobalSecret, getGlobalSecretStatus, setGlobalSecret, GLOBAL_SECRET_IDS } from '@/app/lib/integrations/global-secrets'
import { youtubeRedirectUri } from '@/app/lib/youtube/oauth'

/* GET  /api/admin/youtube/client — is the Google OAuth client configured? (never returns the secret; the client ID is not secret)
   POST /api/admin/youtube/client { clientId, clientSecret } — paste once; stored AES-256-GCM encrypted. */

export async function GET(req: NextRequest) {
  const denied = requireAdmin(req); if (denied) return denied
  const [id, secretStatus] = await Promise.all([getGlobalSecret(GLOBAL_SECRET_IDS.youtubeOauthClientId), getGlobalSecretStatus(GLOBAL_SECRET_IDS.youtubeOauthClientSecret)])
  return NextResponse.json({ configured: !!id && secretStatus.configured, clientId: id, updatedAt: secretStatus.updatedAt, updatedByName: secretStatus.updatedByName, redirectUri: youtubeRedirectUri(req) })
}

export async function POST(req: NextRequest) {
  const denied = requireAdmin(req); if (denied) return denied
  const session = getSession(req)
  const body = await req.json().catch(() => null) as { clientId?: string; clientSecret?: string } | null
  const clientId = body?.clientId?.trim(), clientSecret = body?.clientSecret?.trim()
  if (!clientId || !clientSecret) return NextResponse.json({ error: 'Both the client ID and the client secret are required.' }, { status: 400 })
  if (!clientId.endsWith('.apps.googleusercontent.com')) return NextResponse.json({ error: 'That does not look like a Google OAuth client ID (it should end in .apps.googleusercontent.com).' }, { status: 400 })
  await setGlobalSecret(GLOBAL_SECRET_IDS.youtubeOauthClientId, 'YouTube OAuth client ID', clientId, session?.sid ?? null)
  await setGlobalSecret(GLOBAL_SECRET_IDS.youtubeOauthClientSecret, 'YouTube OAuth client secret', clientSecret, session?.sid ?? null)
  return NextResponse.json({ configured: true })
}
