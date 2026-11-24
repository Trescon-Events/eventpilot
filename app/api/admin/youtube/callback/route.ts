import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { encryptToken, decryptToken } from '@/app/lib/security/token-crypto'
import { getYoutubeClient, verifyYoutubeState, youtubeRedirectUri } from '@/app/lib/youtube/oauth'

/* GET /api/admin/youtube/callback — Google redirects here. Exchanges the code, reads which channel was authorised, stores it. */

export async function GET(req: NextRequest) {
  const back = (q: string) => NextResponse.redirect(new URL(`/admin/settings/integrations?${q}`, req.url))
  const sp = req.nextUrl.searchParams
  if (sp.get('error')) return back(`youtube_error=${encodeURIComponent(sp.get('error')!)}`)

  const session = getSession(req)
  const state = verifyYoutubeState(sp.get('state'))
  if (!session?.adm || !state || state.sid !== session.sid) return back('youtube_error=invalid_state')
  const code = sp.get('code')
  const client = await getYoutubeClient()
  if (!code || !client) return back('youtube_error=missing_code')

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: client.clientId, client_secret: client.clientSecret, redirect_uri: youtubeRedirectUri(req), grant_type: 'authorization_code' }),
  })
  const tokens = await tokenRes.json().catch(() => ({})) as { access_token?: string; refresh_token?: string; scope?: string }
  if (!tokenRes.ok || !tokens.access_token) return back('youtube_error=token_exchange_failed')
  const scopes = tokens.scope ?? ''
  if (!scopes.includes('youtube.upload')) return back('youtube_error=upload_permission_not_granted')

  const auth = { Authorization: `Bearer ${tokens.access_token}` }
  const [chRes, meRes] = await Promise.all([
    fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', { headers: auth }),
    fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: auth }),
  ])
  const ch = await chRes.json().catch(() => ({})) as { items?: { id: string; snippet: { title: string; customUrl?: string; thumbnails?: { default?: { url?: string } } } }[] }
  const channel = ch.items?.[0]
  if (!channel) return back('youtube_error=no_channel_found')
  const me = await meRes.json().catch(() => ({})) as { email?: string }

  // A re-connect of an existing channel may come back without a refresh token only if Google skipped consent; keep the old one then.
  let encrypted: string | null = tokens.refresh_token ? encryptToken(tokens.refresh_token) : null
  if (!encrypted) {
    const { data: existing } = await supabaseAdmin.from('youtube_connections').select('encrypted_refresh_token').eq('channel_id', channel.id).maybeSingle()
    if (existing?.encrypted_refresh_token) { try { decryptToken(existing.encrypted_refresh_token); encrypted = existing.encrypted_refresh_token } catch { /* unusable */ } }
  }
  if (!encrypted) return back('youtube_error=no_refresh_token')

  const { error } = await supabaseAdmin.from('youtube_connections').upsert({
    channel_id: channel.id, channel_title: channel.snippet.title, channel_handle: channel.snippet.customUrl ?? null,
    channel_thumbnail_url: channel.snippet.thumbnails?.default?.url ?? null, google_email: me.email ?? null,
    encrypted_refresh_token: encrypted, scopes, status: 'active', connected_by: session.sid, updated_at: new Date().toISOString(),
  }, { onConflict: 'channel_id' })
  if (error) return back('youtube_error=save_failed')
  return back(`youtube_connected=${encodeURIComponent(channel.snippet.title)}`)
}
