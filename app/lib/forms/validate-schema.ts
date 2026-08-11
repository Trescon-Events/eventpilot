import { FieldSchema, FormType, RESERVED_FIELD_KEYS } from './types'
import { defaultFieldsFor } from './default-schemas'

// Shared by the per-event schema route (app/api/events/stakeholders/forms/
// [formType]/schema) and the global Form Templates route (app/api/admin/
// form-templates/[formType]/schema) — one validator, not two copies.

const KEY_RE = /^[a-z][a-z0-9_]*$/

export function validateFieldSchema(formType: FormType, fields: unknown): string | null {
  if (!Array.isArray(fields) || fields.length === 0) return 'fields must be a non-empty array'
  if (fields.length > 40) return 'Too many fields (max 40)'

  const seenIds = new Set<string>()
  const seenKeys = new Set<string>()
  for (const f of fields as FieldSchema[]) {
    if (!f || typeof f !== 'object') return 'Invalid field entry'
    if (!f.id || seenIds.has(f.id)) return `Duplicate or missing field id: ${f.id}`
    seenIds.add(f.id)
    if (!f.key || !KEY_RE.test(f.key)) return `Invalid field key: ${f.key}`
    const keyLower = f.key.toLowerCase()
    if (seenKeys.has(keyLower)) return `Duplicate field key: ${f.key}`
    seenKeys.add(keyLower)
    if (RESERVED_FIELD_KEYS.includes(keyLower)) return `"${f.key}" is a reserved key`
    if (!f.label || !f.label.trim()) return `Field "${f.key}" needs a label`
    if ((f.type === 'select' || f.type === 'multiselect') && (!f.options || f.options.filter(o => o && o.trim()).length === 0)) {
      return `Field "${f.key}" needs at least one option`
    }
    if (f.type === 'file' && f.max_size_mb !== undefined) {
      if (!Number.isInteger(f.max_size_mb) || f.max_size_mb < 1 || f.max_size_mb > 25) {
        return `Field "${f.key}" max file size must be an integer between 1 and 25 MB`
      }
    }
  }

  // Locked fields (the two NOT-NULL-backed keys) must be present, unchanged
  // key/type/locked, and cannot be made optional.
  const defaults = defaultFieldsFor(formType)
  for (const def of defaults.filter(d => d.locked)) {
    const match = (fields as FieldSchema[]).find(f => f.key === def.key)
    if (!match) return `"${def.label}" is required and cannot be removed`
    if (match.type !== def.type) return `"${def.label}" cannot change type`
    if (!match.locked) return `"${def.label}" cannot be unlocked`
    if (match.required !== true) return `"${def.label}" cannot be made optional`
  }

  return null
}
