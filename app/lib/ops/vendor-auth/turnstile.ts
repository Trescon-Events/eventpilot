/* Cloudflare Turnstile captcha for the vendor portal's public, credential-
   accepting endpoints (login, forgot password, set password).

   The token is ALWAYS verified server-side against Cloudflare — a bot that
   skips the widget simply has no valid token.

   Keys: NEXT_PUBLIC_TURNSTILE_SITE_KEY (client) + TURNSTILE_SECRET_KEY
   (server). In non-production, Cloudflare's published always-pass TEST keys
   are used when the real ones aren't set, so local development works. In
   PRODUCTION a missing secret FAILS CLOSED (nobody can log in) rather than
   silently disabling the captcha. */

const TEST_SECRET = '1x0000000000000000000000000000000AA'
export const TURNSTILE_TEST_SITE_KEY = '1x00000000000000000000AA'

export type CaptchaResult = { ok: true } | { ok: false; reason: 'not_configured' | 'missing' | 'failed' | 'unreachable' }

export async function verifyTurnstile(token: unknown, ip: string): Promise<CaptchaResult> {
  const secret = process.env.TURNSTILE_SECRET_KEY || (process.env.NODE_ENV !== 'production' ? TEST_SECRET : '')
  if (!secret) return { ok: false, reason: 'not_configured' }
  if (typeof token !== 'string' || !token || token.length > 4096) return { ok: false, reason: 'missing' }

  try {
    const body = new URLSearchParams({ secret, response: token })
    if (ip && ip !== 'unknown') body.set('remoteip', ip)
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST', body, signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return { ok: false, reason: 'unreachable' }
    const data = await res.json() as { success?: boolean }
    return data.success ? { ok: true } : { ok: false, reason: 'failed' }
  } catch {
    // Fail closed: if we can't confirm the captcha, the attempt doesn't proceed.
    return { ok: false, reason: 'unreachable' }
  }
}
