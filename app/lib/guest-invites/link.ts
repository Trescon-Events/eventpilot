/*
  Guest-invite links are KonfHub checkout URLs with a registration code embedded,
  e.g. https://konfhub.com/checkout/dubai-future-finance-week-2026?ticketId=77824%7C1%3B&selectedCode=NURYMGUEST
  The code (selectedCode) is what ties a registration back to the speaker: KonfHub's
  attendee list reports it per registration as `coupon_code`.
*/
export type ParsedGuestLink = { ok: true; url: string; code: string; slug: string } | { ok: false; error: string }

export function parseGuestLink(raw: string): ParsedGuestLink {
  const input = (raw ?? '').trim()
  if (!input) return { ok: false, error: 'No link.' }
  let u: URL
  try { u = new URL(input) } catch { return { ok: false, error: 'Not a valid URL.' } }
  if (u.protocol !== 'https:') return { ok: false, error: 'The link must start with https://.' }
  if (!/(^|\.)konfhub\.com$/i.test(u.hostname)) return { ok: false, error: 'This isn’t a konfhub.com link.' }
  const m = /^\/checkout\/([^/]+)/.exec(u.pathname)
  if (!m) return { ok: false, error: 'Not a KonfHub checkout link (expected konfhub.com/checkout/<event>).' }
  const code = (u.searchParams.get('selectedCode') ?? '').trim()
  if (!code) return { ok: false, error: 'The link has no registration code (selectedCode=…).' }
  return { ok: true, url: u.toString(), code: code.toUpperCase(), slug: m[1] }
}
