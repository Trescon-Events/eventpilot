/* Shared input validation for the Operations Hub Vendor Directory API routes
   (app/api/events/operations/vendors). Lives here, not in a route file —
   Next route modules may only export HTTP method handlers. */

export const MAX_ACTIVE_CONTACTS = 2
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export type ContactInput = { id?: string; name?: string; email?: string; phone?: string | null; job_title?: string | null }

export function validateContacts(contacts: ContactInput[] | undefined): string | null {
  if (!Array.isArray(contacts) || contacts.length === 0) return 'At least one contact is required.'
  if (contacts.length > MAX_ACTIVE_CONTACTS) return `A vendor can have at most ${MAX_ACTIVE_CONTACTS} contacts.`
  for (const c of contacts) {
    if (!c.name?.trim()) return 'Every contact needs a name.'
    if (!c.email || !EMAIL_RE.test(c.email.trim())) return `"${c.email ?? ''}" is not a valid email address.`
  }
  return null
}
