import { NextRequest } from 'next/server'

export interface TcsSession { sid: string; jl?: string; adm?: boolean; dept?: string; roles?: string[]; vt?: boolean }

/** Reads and decodes the tcs_session cookie server-side. Returns null if absent/invalid. */
export function getSession(req: NextRequest): TcsSession | null {
  const raw = req.cookies.get('tcs_session')?.value
  if (!raw) return null
  try {
    const session = JSON.parse(Buffer.from(raw, 'base64').toString('utf-8'))
    return session?.sid ? session : null
  } catch {
    return null
  }
}

/** Convenience: just the staff id, or null if not logged in. */
export function getSessionStaffId(req: NextRequest): string | null {
  return getSession(req)?.sid ?? null
}
