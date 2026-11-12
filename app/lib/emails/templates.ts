/* Emails module, phase 3 (2026-11-12) — template placeholders and required fields. Pure: no database, so every rule is tested.
   A template holds only the BODY of an email ({{tokens}} inside it); the greeting and sign-off are added per person at send time.
   Three kinds of token:
     event tokens    {{event_name}} {{event_dates}} {{event_venue}}   filled from the event the email is sent from, when the email is created
     field tokens    {{gallery_link}} …                               the template's own required fields, filled by the producer when the email is created
     person tokens   {{speaker_name}} {{first_name}}                  filled per recipient at send time */

export const EVENT_TOKENS = [
  { key: 'event_name', label: 'Event name' },
  { key: 'event_dates', label: 'Event dates' },
  { key: 'event_venue', label: 'Event venue' },
] as const
export const PERSON_TOKENS = [
  { key: 'speaker_name', label: 'Speaker’s name' },
  { key: 'first_name', label: 'Speaker’s first name' },
] as const
export const RESERVED_KEYS: string[] = [...EVENT_TOKENS, ...PERSON_TOKENS].map(t => t.key)

export type FieldKind = 'url' | 'text'
export type RequiredField = { key: string; label: string; kind: FieldKind }

const TOKEN = /\{\{\s*([a-z][a-z0-9_]*)\s*\}\}/gi
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** The distinct token keys used in a piece of text, lower-cased. */
export function extractTokens(text: string): string[] {
  const out = new Set<string>()
  for (const m of text.matchAll(TOKEN)) out.add(m[1].toLowerCase())
  return [...out]
}

/** Replaces the tokens that have a value, HTML-escaped. Tokens without a value are left exactly as written. */
export function applyTokens(text: string, values: Record<string, string | null | undefined>): string {
  return text.replace(TOKEN, (whole, key: string) => { const v = values[key.toLowerCase()]; return typeof v === 'string' ? esc(v) : whole })
}

/** Subject lines are plain text, not HTML, so values are inserted as they are. */
export function applyTokensPlain(text: string, values: Record<string, string | null | undefined>): string {
  return text.replace(TOKEN, (whole, key: string) => { const v = values[key.toLowerCase()]; return typeof v === 'string' ? v : whole })
}

export const firstNameOf = (name: string) => name.trim().split(/\s+/)[0] ?? ''

export function personValues(name: string): Record<string, string> {
  return { speaker_name: name.trim(), first_name: firstNameOf(name) }
}

/** Checks the required fields a producer filled in; returns the cleaned values or the first problem. */
export function checkRequiredFields(fields: RequiredField[], given: Record<string, unknown>): { ok: true; values: Record<string, string> } | { ok: false; error: string } {
  const values: Record<string, string> = {}
  for (const f of fields) {
    const raw = typeof given[f.key] === 'string' ? (given[f.key] as string).trim() : ''
    if (!raw) return { ok: false, error: `${f.label} is required before this email can be sent.` }
    if (raw.length > 500) return { ok: false, error: `${f.label} is too long.` }
    if (f.kind === 'url') {
      if (!/^https:\/\/[^\s"'<>]+$/.test(raw)) return { ok: false, error: `${f.label} must be a full link starting with https://` }
      try { new URL(raw) } catch { return { ok: false, error: `${f.label} is not a valid link.` } }
    }
    values[f.key] = raw
  }
  return { ok: true, values }
}

/** Tokens that are still unfilled after event and field values were applied, other than the per-person ones that are filled at send time. */
export function unresolvedTokens(text: string): string[] {
  const person = new Set<string>(PERSON_TOKENS.map(t => t.key))
  return extractTokens(text).filter(k => !person.has(k))
}

/** Validates a template being saved: known tokens only (so a typo is caught here, not in a speaker's inbox), sane field definitions. */
export function validateTemplate(input: { name: string; subject: string; body_html: string; required_fields: unknown }): { ok: true; fields: RequiredField[] } | { ok: false; error: string } {
  if (!input.name.trim()) return { ok: false, error: 'Give the template a name.' }
  if (input.name.trim().length > 120) return { ok: false, error: 'The name is too long (120 characters at most).' }
  if (!input.subject.trim()) return { ok: false, error: 'Write a subject line.' }
  if (input.subject.length > 200 || /[\r\n]/.test(input.subject)) return { ok: false, error: 'The subject must be one line of at most 200 characters.' }
  if (!input.body_html.replace(/<[^>]*>/g, '').trim()) return { ok: false, error: 'The template has no text.' }

  const raw = Array.isArray(input.required_fields) ? input.required_fields : []
  if (raw.length > 5) return { ok: false, error: 'A template can have at most 5 required fields.' }
  const fields: RequiredField[] = []
  for (const f of raw as Partial<RequiredField>[]) {
    const key = (f.key ?? '').trim().toLowerCase()
    if (!/^[a-z][a-z0-9_]{1,30}$/.test(key)) return { ok: false, error: `“${f.key ?? ''}” cannot be a field name. Use lower-case letters, numbers and underscores, starting with a letter (for example gallery_link).` }
    if (RESERVED_KEYS.includes(key)) return { ok: false, error: `“${key}” is already a built-in placeholder.` }
    if (fields.some(x => x.key === key)) return { ok: false, error: `The field “${key}” is listed twice.` }
    const label = (f.label ?? '').trim()
    if (!label || label.length > 60) return { ok: false, error: `Give the field “${key}” a label of up to 60 characters.` }
    fields.push({ key, label, kind: f.kind === 'url' ? 'url' : 'text' })
  }
  const known = new Set([...RESERVED_KEYS, ...fields.map(f => f.key)])
  const unknown = extractTokens(`${input.subject}\n${input.body_html}`).filter(k => !known.has(k))
  if (unknown.length) return { ok: false, error: `Unknown placeholder${unknown.length > 1 ? 's' : ''}: ${unknown.map(k => `{{${k}}}`).join(', ')}. Add ${unknown.length > 1 ? 'them' : 'it'} as a required field, or fix the spelling.` }
  const used = new Set(extractTokens(`${input.subject}\n${input.body_html}`))
  const unused = fields.filter(f => !used.has(f.key))
  if (unused.length) return { ok: false, error: `The required field “${unused[0].label}” is not used in the email. Put {{${unused[0].key}}} where it belongs, or remove the field.` }
  return { ok: true, fields }
}

/** Every required field's token must still be in the email the producer is about to send (they may have edited the loaded text). */
export function missingFieldTokens(fields: RequiredField[], subject: string, bodyHtml: string): RequiredField[] {
  const used = new Set(extractTokens(`${subject}\n${bodyHtml}`))
  return fields.filter(f => !used.has(f.key))
}
