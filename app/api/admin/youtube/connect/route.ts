import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/app/lib/access/session'
import { requireAdmin } from '@/app/lib/access/require-admin'
import { buildYoutubeAuthUrl, getYoutubeClient, signYoutubeState, youtubeRedirectUri } from '@/app/lib/youtube/oauth'

/* GET /api/admin/youtube/connect — starts Google consent (a normal browser navigation, not fetch). */
export async function GET(req: NextRequest) {
  const denied = requireAdmin(req); if (denied) return denied
  const session = getSession(req)!
  const client = await getYoutubeClient()
  if (!client) return NextResponse.redirect(new URL('/admin/settings/integrations?youtube_error=client_not_configured', req.url))
  return NextResponse.redirect(buildYoutubeAuthUrl(client.clientId, youtubeRedirectUri(req), signYoutubeState(session.sid)))
}
