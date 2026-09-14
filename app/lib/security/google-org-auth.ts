import { supabaseAdmin } from '@/app/lib/supabase'
import { encryptToken, decryptToken } from './token-crypto'

/* Site Operations module — Google connections (GA4 + Search Console).
   v1.3: multiple named org-level connections, not one shared singleton.
   Event analytics properties are genuinely split across more than one
   Google identity (confirmed 2026-09-14 — see docs/
   EventPilot-SiteOps-Build-Spec-v1.1.md, Changelog v1.2 -> v1.3), and that
   split isn't temporary: GA4/Search Console properties can't be transferred
   between Google accounts, so some events permanently live under a
   different connection than others. Every caller now takes an explicit
   connectionId — there's no "the" connection anymore. */

export type ConnectionRow = {
  id: string
  access_token_enc: string | null
  refresh_token_enc: string | null
  expires_at: string | null
  google_account_email: string | null
  connected_by: string | null
  connected_at: string | null
}

export async function listGoogleConnections(): Promise<ConnectionRow[]> {
  const { data } = await supabaseAdmin
    .from('google_connections')
    .select('id, access_token_enc, refresh_token_enc, expires_at, google_account_email, connected_by, connected_at')
    .order('connected_at', { ascending: true })
  return data ?? []
}

export async function getGoogleConnection(connectionId: string): Promise<ConnectionRow | null> {
  const { data } = await supabaseAdmin
    .from('google_connections')
    .select('id, access_token_enc, refresh_token_enc, expires_at, google_account_email, connected_by, connected_at')
    .eq('id', connectionId)
    .maybeSingle()
  return data ?? null
}

/* Returns a live access token for the given connection, refreshing if
   expired. Null if the connection doesn't exist or was never completed. */
export async function getGoogleAccessToken(connectionId: string): Promise<string | null> {
  const row = await getGoogleConnection(connectionId)
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
      .from('google_connections')
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
