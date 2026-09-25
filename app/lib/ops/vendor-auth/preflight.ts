import { NextRequest, NextResponse } from 'next/server'
import { clientIp } from '@/app/lib/ops/audit'
import { isSameOrigin, vpError } from './support'
import { ipBlocked } from './throttle'
import { verifyTurnstile } from './turnstile'

/* Checks every PUBLIC (no session yet) vendor-portal POST runs before doing
   anything else, in a fixed order: same origin → IP throttle → captcha.
   Messages are deliberately generic; none reveals whether an account exists. */

export async function publicPreflight(
  req: NextRequest,
  opts: { captchaToken?: unknown; requireCaptcha: boolean },
): Promise<{ ip: string } | { error: NextResponse }> {
  if (!isSameOrigin(req)) return { error: await vpError(403, 'This request could not be verified.') }
  const ip = clientIp(req)
  if (await ipBlocked(ip)) return { error: await vpError(429, 'Too many attempts. Please wait a few minutes and try again.') }

  if (opts.requireCaptcha) {
    const captcha = await verifyTurnstile(opts.captchaToken, ip)
    if (!captcha.ok) {
      if (captcha.reason === 'not_configured') return { error: await vpError(503, 'Sign-in is temporarily unavailable.') }
      return { error: await vpError(400, 'Please complete the verification check and try again.') }
    }
  }
  return { ip }
}

export const normalizeEmail = (v: unknown): string | null => {
  if (typeof v !== 'string') return null
  const e = v.trim().toLowerCase()
  return e.length > 0 && e.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : null
}
