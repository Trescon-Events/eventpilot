import { randomBytes, createHash } from 'node:crypto'
import { supabaseAdmin } from '@/app/lib/supabase'

/* Platform-wide read-only AI Access API (2026-09-29, per Madhu) — token
   verification for /api/public/v1/knowledge/*. Generalizes
   app/lib/content/guideline-tokens.ts's own pattern (same randomBytes(32)
   hex + sha256-hash-only-stored shape, same read-then-update rate limit)
   to a token that can be scoped to several DOMAINS and several EVENTS at
   once, instead of Content Guidelines' one-event/one-purpose shape.

   Unlike Content Guidelines (which deliberately has no request log —
   "avoids an unbounded log"), every call here also writes one
   platform_api_access_log row — "what was requested" tracking is an
   explicit requirement for this token type, not an add-on. */

const TOKEN_PREFIX = 'ep_ai_'
const RATE_LIMIT_PER_HOUR = 60
const RATE_WINDOW_MS = 60 * 60 * 1000

export const DOMAINS = ['event_overview', 'speakers_partners', 'agenda', 'documents_reports', 'news_and_intel'] as const
export type Domain = typeof DOMAINS[number]

export function hashPlatformApiToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

// Plaintext is shown to the caller exactly once, at creation — only
// token_hash is ever stored.
export function generatePlatformApiToken(): { plaintext: string; hash: string } {
  const plaintext = TOKEN_PREFIX + randomBytes(32).toString('hex')
  return { plaintext, hash: hashPlatformApiToken(plaintext) }
}

export type TokenScope = {
  tokenId: string
  domains: Domain[]
  eventScope: 'all' | 'specific'
  eventIds: string[]
}

export type PlatformApiAuth =
  | { ok: true; scope: TokenScope }
  | { ok: false; status: number; error: string }

export async function authenticatePlatformApiToken(authHeader: string | null): Promise<PlatformApiAuth> {
  if (!authHeader?.startsWith('Bearer ')) return { ok: false, status: 401, error: 'Bearer token required' }
  const token = authHeader.slice('Bearer '.length).trim()
  if (!token.startsWith(TOKEN_PREFIX)) return { ok: false, status: 401, error: 'Invalid token' }

  const { data: row } = await supabaseAdmin
    .from('platform_api_tokens')
    .select('id, domains, event_scope, event_ids, revoked_at, rate_window_started_at, rate_window_count')
    .eq('token_hash', hashPlatformApiToken(token))
    .maybeSingle()

  if (!row || row.revoked_at) return { ok: false, status: 401, error: 'Invalid or revoked token' }

  // Same deliberate read-then-update trade as guideline-tokens.ts's own
  // rate check — an occasional off-by-one under a race between two
  // near-simultaneous requests on the same token is a fine trade against
  // an atomic DB-side counter for a limit that's a courtesy cap, not a
  // hard security boundary.
  const windowStartedAt = row.rate_window_started_at ? new Date(row.rate_window_started_at).getTime() : 0
  const windowExpired = Date.now() - windowStartedAt > RATE_WINDOW_MS

  if (!windowExpired && row.rate_window_count >= RATE_LIMIT_PER_HOUR) {
    return { ok: false, status: 429, error: 'Rate limit exceeded — 60 requests per hour per token' }
  }

  const now = new Date().toISOString()
  await supabaseAdmin.from('platform_api_tokens').update({
    last_used_at: now,
    rate_window_started_at: windowExpired ? now : row.rate_window_started_at,
    rate_window_count: windowExpired ? 1 : row.rate_window_count + 1,
  }).eq('id', row.id)

  return {
    ok: true,
    scope: {
      tokenId: row.id,
      domains: (row.domains ?? []) as Domain[],
      eventScope: row.event_scope as 'all' | 'specific',
      eventIds: (row.event_ids ?? []) as string[],
    },
  }
}

// Every route calls this ONCE per request, whether it succeeded or not —
// the log is the whole point of this token type (see this file's top
// comment). status_code lets the admin's log view distinguish a genuine
// 200 from a 403 (wrong domain)/404 (event not in scope) at a glance,
// without needing to store the actual response body.
export async function logPlatformApiAccess(args: {
  tokenId: string
  domain: Domain | 'unknown'
  eventId?: string | null
  querySummary?: string | null
  resultCount?: number | null
  statusCode: number
}): Promise<void> {
  await supabaseAdmin.from('platform_api_access_log').insert({
    token_id: args.tokenId,
    domain: args.domain,
    event_id: args.eventId ?? null,
    query_summary: args.querySummary ?? null,
    result_count: args.resultCount ?? null,
    status_code: args.statusCode,
  })
}

// Checked by every route before running its query — 403 (not 404) is
// deliberate: the caller has a genuinely valid token, it's just not
// scoped for this, same distinction hasEventPermission()'s own callers
// already draw elsewhere in this codebase.
export function requiresDomain(scope: TokenScope, domain: Domain): string | null {
  if (!scope.domains.includes(domain)) return `This token isn't scoped for "${domain}".`
  return null
}

// Event-scope check — 'all' means every event; 'specific' means only the
// event_ids list. Returns an error string (never throws) so route handlers
// can log-then-return in one consistent shape.
export function requiresEventInScope(scope: TokenScope, eventId: string): string | null {
  if (scope.eventScope === 'all') return null
  if (scope.eventIds.includes(eventId)) return null
  return 'This token is not scoped for this event.'
}
