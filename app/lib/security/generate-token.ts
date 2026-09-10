import { randomBytes } from 'node:crypto'

// The same randomBytes(32).toString('hex') one-liner already copy-pasted
// at 4+ call sites (send-for-approval, send-for-client-approval,
// send-for-external-approval/compose, invites/compose) — centralized here
// for new call sites rather than adding a 5th copy. Existing call sites
// are left untouched (not worth the churn of retrofitting working code).
export function generateSecureToken(): string {
  return randomBytes(32).toString('hex')
}
