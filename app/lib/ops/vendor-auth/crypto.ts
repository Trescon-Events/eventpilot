import { createHash, createHmac, randomBytes, randomInt } from 'crypto'

/* Primitives for the vendor-portal auth system. Tokens, one-time codes and
   session ids are random and only ever stored HASHED — a database read
   never yields anything usable to log in. */

// 256 bits of randomness, URL-safe (invite/reset links, session cookies).
export const newToken = (): string => randomBytes(32).toString('base64url')

export const sha256Hex = (value: string): string => createHash('sha256').update(value).digest('hex')

export const newOtpCode = (): string => String(randomInt(0, 1_000_000)).padStart(6, '0')

/* A 6-digit code has only 10^6 possibilities, so a plain hash could be
   brute-forced offline from a leaked row. Keying the hash with a server
   secret (SESSION_SECRET, which never leaves the server) removes that;
   combined with the 5-attempt limit and 10-minute expiry, the code is
   only guessable online, within those limits. */
export function hashOtp(userId: string, code: string): string {
  const secret = process.env.SESSION_SECRET
  if (!secret) throw new Error('SESSION_SECRET is not configured')
  return createHmac('sha256', secret).update(`${userId}:${code}`).digest('hex')
}
