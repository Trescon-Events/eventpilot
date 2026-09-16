import { randomBytes, createHash } from 'node:crypto'
import { supabaseAdmin } from '@/app/lib/supabase'

/* Content Guidelines API (2026-09-16) — see
   ~/Downloads/EventPilot_Content_Guidelines_API_Spec.md and
   supabase/content_guideline_tokens_migration.sql.

   Shared by GET /api/public/v1/content-guidelines and the (now dual-auth)
   POST /api/events/stakeholders/content/validate — both need identical
   token verification, so it lives here rather than in either route. */

const TOKEN_PREFIX = 'ep_cg_'
const RATE_LIMIT_PER_HOUR = 60
const RATE_WINDOW_MS = 60 * 60 * 1000

export function hashGuidelineToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

// Plaintext is shown to the caller exactly once, at creation — only
// token_hash is ever stored. See generateSecureToken() in
// security/generate-token.ts for the same randomBytes(32).toString('hex')
// pattern; not reused directly since this token also carries the ep_cg_
// prefix the spec calls for (Authorization: Bearer ep_cg_<token>).
export function generateGuidelineToken(): { plaintext: string; hash: string } {
  const plaintext = TOKEN_PREFIX + randomBytes(32).toString('hex')
  return { plaintext, hash: hashGuidelineToken(plaintext) }
}

export type GuidelineTokenAuth =
  | { ok: true; eventId: string; tokenId: string }
  | { ok: false; status: number; error: string }

// Verifies an `Authorization: Bearer ep_cg_<token>` header, rejects a
// missing/unknown/revoked token, enforces the spec's "60 requests per hour
// per token is ample" cap (tracked directly on the row — see the
// migration's comment on why there's no separate request-log table), and
// bumps last_used_at so an unused token can be spotted and revoked. The
// rate check is deliberately read-then-update, not atomic under a race
// between two near-simultaneous requests on the same token — an
// occasional off-by-one over the cap is a fine trade against the added
// complexity of a DB-side atomic counter for a limit this codebase's own
// spec calls "ample", not a hard security boundary.
export async function authenticateGuidelineToken(authHeader: string | null): Promise<GuidelineTokenAuth> {
  if (!authHeader?.startsWith('Bearer ')) return { ok: false, status: 401, error: 'Bearer token required' }
  const token = authHeader.slice('Bearer '.length).trim()
  if (!token.startsWith(TOKEN_PREFIX)) return { ok: false, status: 401, error: 'Invalid token' }

  const { data: row } = await supabaseAdmin
    .from('content_guideline_tokens')
    .select('id, event_id, revoked_at, rate_window_started_at, rate_window_count')
    .eq('token_hash', hashGuidelineToken(token))
    .maybeSingle()

  if (!row || row.revoked_at) return { ok: false, status: 401, error: 'Invalid or revoked token' }

  const windowStartedAt = row.rate_window_started_at ? new Date(row.rate_window_started_at).getTime() : 0
  const windowExpired = Date.now() - windowStartedAt > RATE_WINDOW_MS

  if (!windowExpired && row.rate_window_count >= RATE_LIMIT_PER_HOUR) {
    return { ok: false, status: 429, error: 'Rate limit exceeded — 60 requests per hour per token' }
  }

  const now = new Date().toISOString()
  await supabaseAdmin.from('content_guideline_tokens').update({
    last_used_at: now,
    rate_window_started_at: windowExpired ? now : row.rate_window_started_at,
    rate_window_count: windowExpired ? 1 : row.rate_window_count + 1,
  }).eq('id', row.id)

  return { ok: true, eventId: row.event_id, tokenId: row.id }
}
