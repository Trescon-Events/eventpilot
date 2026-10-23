/* The optional "Also Cc" line on the bulk-send dialogs (guest invites, media interview requests, speaker emails): whoever sends can add themselves or a colleague.
   Shared by the dialogs (live validation) and the send routes (which re-check, never trusting the client). Added on top of each speaker's own Cc list
   (their Additional Contacts); never duplicates the To address or an address already on Cc. */

export const MAX_EXTRA_CC = 5
const EMAIL = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/

/** Parses what was typed (comma, semicolon, space or newline separated) or an array of addresses. */
export function parseExtraCc(raw: unknown): { emails: string[] } | { error: string } {
  const parts = Array.isArray(raw) ? raw.map(String) : typeof raw === 'string' ? raw.split(/[\s,;]+/) : []
  const emails: string[] = []
  for (const p of parts) {
    const e = p.trim().toLowerCase()
    if (!e) continue
    if (!EMAIL.test(e)) return { error: `“${p.trim()}” is not a valid email address.` }
    if (!emails.includes(e)) emails.push(e)
  }
  if (emails.length > MAX_EXTRA_CC) return { error: `Add at most ${MAX_EXTRA_CC} extra Cc addresses.` }
  return { emails }
}

/** The speaker's own Cc list plus the extra ones, without repeating the To address or any address twice. */
export function mergeCc(base: string[], extra: string[], to?: string | null): string[] {
  const seen = new Set<string>(to ? [to.toLowerCase()] : [])
  const out: string[] = []
  for (const e of [...base, ...extra]) {
    const k = e.toLowerCase()
    if (seen.has(k)) continue
    seen.add(k); out.push(e)
  }
  return out
}
