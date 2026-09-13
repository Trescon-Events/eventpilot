import { supabaseAdmin } from '@/app/lib/supabase'
import { encryptToken, decryptToken } from './token-crypto'

/* Site Operations module, Phase 2 — the ONE shared org-level Google
   connection (GA4 + Search Console), stored in the singleton
   google_org_connection table. Deliberately not per-staff (unlike the old,
   now-deleted Drive integration's staff_oauth_connections): every event's
   Site Registry fetches GA4/Search Console data from the same connected
   account, per Madhu's explicit decision — see
   docs/EventPilot-SiteOps-Build-Spec-v1.1.md. */

type ConnectionRow = {
  id: string
  access_token_enc: string | null
  refresh_token_enc: string | null
  expires_at: string | null
  google_account_email: string | null
}

export async function getGoogleOrgConnection(): Promise<ConnectionRow | null> {
  const { data } = await supabaseAdmin
    .from('google_org_connection')
    .select('id, access_token_enc, refresh_token_enc, expires_at, google_account_email')
    .limit(1)
    .single()
  return data ?? null
}

/* Returns a live access token, refreshing if expired. Null if never
   connected (no refresh token on file). */
export async function getGoogleOrgAccessToken(): Promise<string | null> {
  const row = await getGoogleOrgConnection()
  if (!row?.refresh_token_enc) return null

  if (!row.expires_at || new Date(row.expires_at) < new Date()) {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_ORG_CLIENT_ID!,
        client_secret: process.env.GOOGLE_ORG_CLIENT_SECRET!,
        refresh_token: decryptToken(row.refresh_token_enc),
        grant_type: 'refresh_token',
      }),
    })
    if (!res.ok) return null

    const tokens = await res.json() as { access_token?: string; expires_in?: number }
    if (!tokens.access_token) return null

    await supabaseAdmin
      .from('google_org_connection')
      .update({
        access_token_enc: encryptToken(tokens.access_token),
        expires_at: new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', row.id)
      // Google's refresh grant doesn't return a new refresh_token — the
      // original one stays valid indefinitely (until revoked).

    return tokens.access_token
  }

  return row.access_token_enc ? decryptToken(row.access_token_enc) : null
}
