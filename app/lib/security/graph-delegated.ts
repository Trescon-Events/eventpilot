import { supabaseAdmin } from '@/app/lib/supabase'
import { encryptToken, decryptToken } from './token-crypto'

/* Delegated (per-user) Microsoft Graph token resolution for OneDrive
   secure-document writes — Phase D of the HubSpot Forms integration.
   Mirrors app/lib/canva.ts's getCanvaAccessToken() exact refresh-before-use
   shape, but tokens are encrypted at rest (see token-crypto.ts) and the
   grant is delegated Authorization Code (app/api/connect/microsoft/*),
   architecturally distinct from Graph mail's app-only client-credentials
   flow (app/lib/email/graph-mail.ts) — never mix these up. */

export async function getMicrosoftDelegatedToken(staffId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from('staff_oauth_connections')
    .select('access_token_enc, refresh_token_enc, expires_at')
    .eq('staff_id', staffId)
    .eq('provider', 'microsoft')
    .single()

  if (!data) return null

  if (new Date(data.expires_at) < new Date()) {
    const res = await fetch(`https://login.microsoftonline.com/${process.env.MICROSOFT_TENANT_ID}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.MICROSOFT_CLIENT_ID!,
        client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
        refresh_token: decryptToken(data.refresh_token_enc),
        grant_type: 'refresh_token',
        scope: 'offline_access Files.ReadWrite',
      }),
    })
    if (!res.ok) return null

    const tokens = await res.json() as { access_token?: string; refresh_token?: string; expires_in?: number }
    if (!tokens.access_token) return null

    await supabaseAdmin
      .from('staff_oauth_connections')
      .update({
        access_token_enc: encryptToken(tokens.access_token),
        refresh_token_enc: tokens.refresh_token ? encryptToken(tokens.refresh_token) : data.refresh_token_enc,
        expires_at: new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('staff_id', staffId).eq('provider', 'microsoft')

    return tokens.access_token
  }

  return decryptToken(data.access_token_enc)
}
