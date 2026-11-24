import crypto from 'crypto'
import type { NextRequest } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { decryptToken } from '@/app/lib/security/token-crypto'
import { getGlobalSecret, GLOBAL_SECRET_IDS } from '@/app/lib/integrations/global-secrets'

/* YouTube channel connections (session video Step C).
   The Google OAuth *client* (id + secret) is pasted once in Admin → Global Integrations and stored encrypted — no Railway
   env var. Each connection is one channel: Google asks which channel (brand account) to authorise during consent, and the
   refresh token is bound to that choice. Connect the same login again to add its other channels. */

export const YOUTUBE_SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
].join(' ')

export async function getYoutubeClient(): Promise<{ clientId: string; clientSecret: string } | null> {
  const [clientId, clientSecret] = await Promise.all([
    getGlobalSecret(GLOBAL_SECRET_IDS.youtubeOauthClientId),
    getGlobalSecret(GLOBAL_SECRET_IDS.youtubeOauthClientSecret),
  ])
  return clientId && clientSecret ? { clientId, clientSecret } : null
}

/** The exact redirect URI to register on the Google OAuth client. Localhost when running locally, the live site otherwise. */
export function youtubeRedirectUri(req: NextRequest): string {
  const host = req.headers.get('host') ?? ''
  const base = host.startsWith('localhost') || host.startsWith('127.0.0.1')
    ? `http://${host}`
    : (process.env.NEXT_PUBLIC_SITE_URL || 'https://eventpilot.tresconglobal.com')
  return `${base}/api/admin/youtube/callback`
}

// ── signed state (CSRF + who started the flow) ──
function stateKey(): Buffer {
  const hex = process.env.OAUTH_TOKEN_ENCRYPTION_KEY
  if (!hex) throw new Error('OAUTH_TOKEN_ENCRYPTION_KEY not configured')
  return Buffer.from(hex, 'hex')
}
export function signYoutubeState(sid: string): string {
  const payload = Buffer.from(JSON.stringify({ sid, ts: Date.now(), n: crypto.randomBytes(8).toString('hex') })).toString('base64url')
  const sig = crypto.createHmac('sha256', stateKey()).update(payload).digest('base64url')
  return `${payload}.${sig}`
}
export function verifyYoutubeState(state: string | null): { sid: string } | null {
  if (!state) return null
  const [payload, sig] = state.split('.')
  if (!payload || !sig) return null
  const expected = crypto.createHmac('sha256', stateKey()).update(payload).digest('base64url')
  const a = Buffer.from(sig), b = Buffer.from(expected)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null
  try {
    const p = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { sid: string; ts: number }
    if (!p.sid || Date.now() - p.ts > 10 * 60 * 1000) return null
    return { sid: p.sid }
  } catch { return null }
}

export function buildYoutubeAuthUrl(clientId: string, redirectUri: string, state: string): string {
  const q = new URLSearchParams({
    client_id: clientId, redirect_uri: redirectUri, response_type: 'code', scope: YOUTUBE_SCOPES,
    access_type: 'offline',
    // consent → always returns a refresh token; select_account → lets the user pick a different Google login each time
    prompt: 'consent select_account',
    include_granted_scopes: 'false', state,
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`
}

/** Fresh access token for a connection (used by the upload step). Marks the connection needs_reconnect if Google revoked it. */
export async function getYoutubeAccessToken(connectionId: string): Promise<string | null> {
  const client = await getYoutubeClient()
  if (!client) return null
  const { data } = await supabaseAdmin.from('youtube_connections').select('encrypted_refresh_token').eq('id', connectionId).maybeSingle()
  if (!data) return null
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: client.clientId, client_secret: client.clientSecret, refresh_token: decryptToken(data.encrypted_refresh_token), grant_type: 'refresh_token' }),
  })
  const json = await res.json().catch(() => ({})) as { access_token?: string; error?: string }
  if (!res.ok || !json.access_token) {
    if (json.error === 'invalid_grant') await supabaseAdmin.from('youtube_connections').update({ status: 'needs_reconnect', updated_at: new Date().toISOString() }).eq('id', connectionId)
    return null
  }
  return json.access_token
}
