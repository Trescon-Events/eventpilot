import { supabaseAdmin } from '@/app/lib/supabase'

/* Brute-force limits for the vendor portal, layered on top of the captcha.
   Backed by ops_vendor_auth_events so limits hold across server instances. */

export const LOCKOUT_WINDOW_MS = 15 * 60 * 1000
export const MAX_FAILED_PER_EMAIL = 5
export const MAX_ATTEMPTS_PER_IP = 20

export async function recordAuthEvent(e: { email: string | null; ip: string; kind: 'login' | 'otp' | 'forgot' | 'set_password'; success: boolean; reason?: string }): Promise<void> {
  const { error } = await supabaseAdmin.from('ops_vendor_auth_events').insert({ email: e.email, ip: e.ip, kind: e.kind, success: e.success, reason: e.reason ?? null })
  if (error) console.error('[vendor-auth] event log failed:', error.message)
}

async function count(filter: (q: ReturnType<typeof base>) => ReturnType<typeof base>, windowMs: number): Promise<number> {
  const since = new Date(Date.now() - windowMs).toISOString()
  const { count: n } = await filter(base()).gte('created_at', since)
  return n ?? 0
}
function base() {
  return supabaseAdmin.from('ops_vendor_auth_events').select('*', { count: 'exact', head: true })
}

/** True when this IP has made too many attempts (any outcome) recently. */
export async function ipBlocked(ip: string): Promise<boolean> {
  if (ip === 'unknown') return false
  return (await count(q => q.eq('ip', ip), LOCKOUT_WINDOW_MS)) >= MAX_ATTEMPTS_PER_IP
}

/** Failed login/OTP attempts for this email in the window. */
export async function recentFailuresForEmail(email: string): Promise<number> {
  return count(q => q.eq('email', email).eq('success', false).in('kind', ['login', 'otp']), LOCKOUT_WINDOW_MS)
}

/** How many forgot-password requests this email made in the past hour. */
export async function recentForgotCount(email: string): Promise<number> {
  return count(q => q.eq('email', email).eq('kind', 'forgot'), 60 * 60 * 1000)
}
