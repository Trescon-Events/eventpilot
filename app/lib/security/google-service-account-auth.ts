import { JWT } from 'google-auth-library'

/* Site Operations module — Google service account authentication.
   Replaces the earlier per-user OAuth connection model entirely (see
   docs/EventPilot-SiteOps-Build-Spec-v1.1.md, Changelog v1.3 -> v1.4):
   a single service account, granted access on each GA4/Search Console
   property directly (same "add a user" action as sharing with a person,
   just pointed at the service account's own email), replaces the need to
   authenticate as any particular human's Google identity. No OAuth
   consent screen, no token expiry, no verification review — the key is
   long-lived until rotated.

   GOOGLE_SERVICE_ACCOUNT_KEY holds the full downloaded JSON key,
   minified to one line. Never log or return its contents. */

const SCOPES = [
  'https://www.googleapis.com/auth/analytics.readonly',
  'https://www.googleapis.com/auth/analytics.edit',
  'https://www.googleapis.com/auth/webmasters',
]

let client: JWT | null = null

function getClient(): JWT {
  if (client) return client

  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY not configured')

  const key = JSON.parse(raw) as { client_email: string; private_key: string }
  client = new JWT({
    email: key.client_email,
    key: key.private_key,
    scopes: SCOPES,
  })
  return client
}

/* Returns a live access token, minted fresh or reused from
   google-auth-library's own in-memory cache until it's near expiry. */
export async function getGoogleServiceAccountToken(): Promise<string | null> {
  try {
    const { token } = await getClient().getAccessToken()
    return token ?? null
  } catch {
    return null
  }
}

export function getGoogleServiceAccountEmail(): string | null {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY
  if (!raw) return null
  try {
    const key = JSON.parse(raw) as { client_email?: string }
    return key.client_email ?? null
  } catch {
    return null
  }
}
