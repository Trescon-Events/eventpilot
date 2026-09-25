import bcrypt from 'bcryptjs'

const COST = 12

// A real bcrypt hash of a throwaway string, computed lazily once. Used so a
// login attempt for an email that doesn't exist still costs one bcrypt
// comparison, keeping response time from revealing which emails have accounts.
let dummyHash: string | null = null
function getDummyHash(): string {
  if (!dummyHash) dummyHash = bcrypt.hashSync('not-a-real-password-timing-pad', COST)
  return dummyHash
}

export const hashPassword = (password: string): Promise<string> => bcrypt.hash(password, COST)

/** Compares against the real hash, or a dummy one when there's no account/password. Always does the work. */
export async function verifyPassword(hash: string | null, password: string): Promise<boolean> {
  const ok = await bcrypt.compare(password, hash ?? getDummyHash())
  return hash ? ok : false
}

const COMMON = new Set([
  'password1234', 'passw0rd1234', 'qwerty123456', 'welcome12345', 'letmein12345', 'administrator',
  '123456789012', 'iloveyou1234', 'trescon12345', 'eventpilot123',
])

/** Returns a user-facing problem, or null if acceptable. */
export function validateNewPassword(password: string, email: string): string | null {
  if (typeof password !== 'string') return 'Enter a password.'
  if (password.length < 12) return 'Use at least 12 characters.'
  if (password.length > 128) return 'Use at most 128 characters.'
  if (/^(.)\1+$/.test(password)) return 'That password is too easy to guess.'
  const local = email.split('@')[0]?.toLowerCase()
  if (local && local.length >= 4 && password.toLowerCase().includes(local)) return 'Your password should not contain your email name.'
  if (COMMON.has(password.toLowerCase())) return 'That password is too common. Choose something less predictable.'
  return null
}
