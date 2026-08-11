// "Send as" delivery via Microsoft Graph, app-only (client-credentials,
// Mail.Send Application permission — NOT the delegated SSO login flow in
// app/api/auth/callback/route.ts, which only ever exchanges a login code
// and never acquires/stores a Graph access token). Reuses the same 3 env
// vars already present for SSO (MICROSOFT_CLIENT_ID/TENANT_ID/CLIENT_SECRET)
// — no new credentials needed, just an additional Azure AD app permission
// (see the Phase 2 plan's Azure Portal steps). Raw fetch, no SDK — matches
// the existing hand-rolled OAuth convention in auth/callback/route.ts.
//
// Caveat (confirmed via Microsoft's own docs, verify empirically with a
// real "send test" before Phase 3 depends on it): from.emailAddress.name
// on an app-only sendMail call is typically cosmetic — most tenants render
// the recipient-visible sender name as the mailbox's real Exchange display
// name, not this payload value.

let tokenCache: { token: string; expiresAt: number } | null = null

async function getGraphAppToken(): Promise<string> {
  if (tokenCache && Date.now() < tokenCache.expiresAt - 60_000) return tokenCache.token

  const tenantId = process.env.MICROSOFT_TENANT_ID!
  const res = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.MICROSOFT_CLIENT_ID!,
      client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
      grant_type: 'client_credentials',
      scope: 'https://graph.microsoft.com/.default',
    }),
  })
  if (!res.ok) throw new Error(`Graph token request failed: ${res.status} ${await res.text()}`)

  const json = await res.json() as { access_token: string; expires_in: number }
  tokenCache = { token: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 }
  return tokenCache.token
}

export async function sendGraphMail(opts: {
  senderEmail: string
  senderName?: string
  to: string | string[]
  subject: string
  html: string
}): Promise<void> {
  const token = await getGraphAppToken()
  const toList = Array.isArray(opts.to) ? opts.to : [opts.to]

  const res = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(opts.senderEmail)}/sendMail`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: {
        subject: opts.subject,
        body: { contentType: 'HTML', content: opts.html },
        toRecipients: toList.map(address => ({ emailAddress: { address } })),
        from: { emailAddress: { address: opts.senderEmail, name: opts.senderName } },
      },
      saveToSentItems: true,
    }),
  })
  if (!res.ok) throw new Error(`Graph sendMail failed (${res.status}): ${await res.text().catch(() => '')}`)
}
