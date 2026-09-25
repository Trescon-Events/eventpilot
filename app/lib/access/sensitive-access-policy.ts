import { NextRequest } from 'next/server'

/* Where staff may OPEN Passport / National ID documents from (2026-09-25).

   Rule: a request is allowed when EITHER its country is in the allowed list
   OR its IP is in the allowed list (office networks). So a stolen staff
   password used from anywhere else can't open a document.

   Config (env, all optional):
     SENSITIVE_DOC_ACCESS_MODE       off (default) | monitor | enforce
       off      — no checks.
       monitor  — evaluate and RECORD what would have been blocked, block nothing.
                  Use this first: it proves the country/IP headers really reach
                  the app through Cloudflare + Railway before anyone can be locked out.
       enforce  — block requests that fail the rule.
     SENSITIVE_DOC_ALLOWED_COUNTRIES e.g. "AE,IN"   (ISO 3166-1 alpha-2)
     SENSITIVE_DOC_ALLOWED_IPS       e.g. "203.0.113.7,198.51.100.0/24"  (IPv4 or CIDR; IPv6 exact)

   Country comes from Cloudflare's CF-IPCountry header, the client IP from
   CF-Connecting-IP — nothing else is trusted (X-Forwarded-For is forgeable). The proxy Worker copies
   request headers through, but whether Cloudflare's own headers survive the
   Worker -> Railway hop must be confirmed in production — hence monitor mode
   and the access-check endpoint. With enforce on and NEITHER list configured,
   the rule is treated as "no rules" (allow) rather than locking everyone out.

   KNOWN LIMIT: these headers are only trustworthy when the request really came
   through Cloudflare. The app's Railway address is publicly reachable, so a
   determined caller who talks to it directly could forge CF-* headers. This
   rule stops stolen-password use through the normal site; closing the gap fully
   needs the proxy Worker to add a secret header the app verifies (a Cloudflare
   Worker change, which needs an explicit go-ahead). */

export type AccessMode = 'off' | 'monitor' | 'enforce'
// `ip` is what the POLICY trusts (Cloudflare's own header only); `logIp` is a
// best-effort address for audit rows and may come from headers a client can forge.
export type ClientInfo = { ip: string; logIp: string; country: string | null }
export type PolicyResult = ClientInfo & {
  mode: AccessMode
  allowed: boolean            // did the request satisfy the rule (regardless of mode)
  reason: 'off' | 'no_rules' | 'ip_match' | 'country_match' | 'unknown_location' | 'outside_allowed_locations'
  rules: { countries: number; ips: number }
}

export function getClientInfo(req: NextRequest): ClientInfo {
  // The policy trusts ONLY CF-Connecting-IP / CF-IPCountry. X-Forwarded-For is
  // client-controlled (a caller can send their own), so it is never used to
  // grant access — only recorded in the audit log as a fallback.
  const cfIp = req.headers.get('cf-connecting-ip')?.trim() || ''
  const ip = cfIp || 'unknown'
  const logIp = cfIp || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip')?.trim() || 'unknown'
  const raw = req.headers.get('cf-ipcountry')?.trim().toUpperCase() ?? ''
  // 'XX' = unknown, 'T1' = Tor in Cloudflare's scheme: not usable as a country.
  const country = /^[A-Z]{2}$/.test(raw) && raw !== 'XX' && raw !== 'T1' ? raw : null
  return { ip, logIp, country }
}

function csv(v: string | undefined): string[] {
  return (v ?? '').split(',').map(s => s.trim()).filter(Boolean)
}

function ipv4ToInt(ip: string): number | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip)
  if (!m) return null
  const parts = m.slice(1).map(Number)
  if (parts.some(p => p > 255)) return null
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0
}

function ipMatches(ip: string, rule: string): boolean {
  if (!rule.includes('/')) return ip === rule
  const [base, bitsStr] = rule.split('/')
  const bits = Number(bitsStr)
  const a = ipv4ToInt(ip), b = ipv4ToInt(base)
  if (a === null || b === null || !Number.isInteger(bits) || bits < 0 || bits > 32) return false
  if (bits === 0) return true
  const mask = (~0 << (32 - bits)) >>> 0
  return ((a & mask) >>> 0) === ((b & mask) >>> 0)
}

export function evaluateAccessPolicy(req: NextRequest): PolicyResult {
  const info = getClientInfo(req)
  const modeRaw = (process.env.SENSITIVE_DOC_ACCESS_MODE ?? 'off').toLowerCase()
  const mode: AccessMode = modeRaw === 'enforce' || modeRaw === 'monitor' ? modeRaw : 'off'
  const countries = csv(process.env.SENSITIVE_DOC_ALLOWED_COUNTRIES).map(c => c.toUpperCase())
  const ips = csv(process.env.SENSITIVE_DOC_ALLOWED_IPS)
  const rules = { countries: countries.length, ips: ips.length }

  if (mode === 'off') return { ...info, mode, allowed: true, reason: 'off', rules }
  if (!countries.length && !ips.length) return { ...info, mode, allowed: true, reason: 'no_rules', rules }
  if (info.ip !== 'unknown' && ips.some(r => ipMatches(info.ip, r))) return { ...info, mode, allowed: true, reason: 'ip_match', rules }
  if (info.country && countries.includes(info.country)) return { ...info, mode, allowed: true, reason: 'country_match', rules }
  return { ...info, mode, allowed: false, reason: info.country || info.ip !== 'unknown' ? 'outside_allowed_locations' : 'unknown_location', rules }
}
