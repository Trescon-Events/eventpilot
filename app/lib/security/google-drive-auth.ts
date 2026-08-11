import { supabaseAdmin } from '@/app/lib/supabase'
import { encryptToken, decryptToken } from './token-crypto'

/* Delegated (per-user) Google Drive token resolution — Phase D of the
   HubSpot Forms integration. Same refresh-before-use shape as
   getMicrosoftDelegatedToken()/getCanvaAccessToken(). */

export async function getGoogleAccessToken(staffId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from('staff_oauth_connections')
    .select('access_token_enc, refresh_token_enc, expires_at')
    .eq('staff_id', staffId)
    .eq('provider', 'google')
    .single()

  if (!data) return null

  if (new Date(data.expires_at) < new Date()) {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        refresh_token: decryptToken(data.refresh_token_enc),
        grant_type: 'refresh_token',
      }),
    })
    if (!res.ok) return null

    const tokens = await res.json() as { access_token?: string; expires_in?: number }
    if (!tokens.access_token) return null

    await supabaseAdmin
      .from('staff_oauth_connections')
      .update({
        access_token_enc: encryptToken(tokens.access_token),
        expires_at: new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('staff_id', staffId).eq('provider', 'google')
      // Google's refresh grant doesn't return a new refresh_token — the
      // original one stays valid indefinitely (until revoked).

    return tokens.access_token
  }

  return decryptToken(data.access_token_enc)
}
