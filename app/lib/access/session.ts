import { NextRequest } from 'next/server'
import crypto from 'crypto'

export interface TcsSession { sid: string; jl?: string; adm?: boolean; dept?: string; roles?: string[]; vt?: boolean }

/* Signed session cookie (2026-09-04) — the tcs_session cookie previously
   held nothing but base64(JSON.stringify(session)), with NO signature or
   any other server-side verification: any client that could set a cookie
   on this origin could set `adm: true` and an arbitrary `sid` and the
   server would trust it outright, no different from a real login. Found
   live while building a one-off import script that needed a session
   cookie to call the app's own APIs — the fix belongs in the app, not the
   script.

   Format is now `${base64(JSON)}.${signature}`, HMAC-SHA256 over the
   base64 payload, keyed by SESSION_SECRET (base64url-encoded, no padding
   — so the '.' separator can never collide with either half's alphabet).
   decodeSession() rejects anything without a valid signature, including
   every pre-existing (unsigned) cookie — this deploy logs everyone out;
   there is no migration path for an unsigned cookie because trusting one
   even once is the exact vulnerability being closed. */

function sessionSecret(): string {
  const secret = process.env.SESSION_SECRET
  if (!secret) throw new Error('SESSION_SECRET not configured')
  return secret
}

function sign(payloadB64: string): string {
  return crypto.createHmac('sha256', sessionSecret()).update(payloadB64).digest('base64url')
}

/** Builds a signed tcs_session cookie value from a session object — the only place a cookie should ever be constructed (see api/login and api/auth/callback). */
export function encodeSession(session: TcsSession): string {
  const payloadB64 = Buffer.from(JSON.stringify(session)).toString('base64')
  return `${payloadB64}.${sign(payloadB64)}`
}

/** Verifies and decodes a raw tcs_session cookie value. Null on any failure — missing signature, tampered payload, or malformed JSON. */
export function decodeSession(raw: string | undefined | null): TcsSession | null {
  if (!raw) return null
  const dot = raw.lastIndexOf('.')
  if (dot === -1) return null // pre-signing cookie, or malformed — reject, don't fall back to trusting it unsigned
  const payloadB64 = raw.slice(0, dot)
  const providedSig = raw.slice(dot + 1)
  let expectedSig: string
  try {
    expectedSig = sign(payloadB64)
  } catch {
    return null
  }
  const a = Buffer.from(providedSig)
  const b = Buffer.from(expectedSig)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null
  try {
    const session = JSON.parse(Buffer.from(payloadB64, 'base64').toString('utf-8'))
    return session?.sid ? session : null
  } catch {
    return null
  }
}

/** Reads and verifies the tcs_session cookie server-side (API route context — NextRequest). Returns null if absent/invalid/tampered. */
export function getSession(req: NextRequest): TcsSession | null {
  return decodeSession(req.cookies.get('tcs_session')?.value)
}

/** Convenience: just the staff id, or null if not logged in. */
export function getSessionStaffId(req: NextRequest): string | null {
  return getSession(req)?.sid ?? null
}
