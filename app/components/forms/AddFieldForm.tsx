'use client'

import { Button, Card, Input } from '@/app/components/ui'
import { FieldSchema, FieldType, RESERVED_FIELD_KEYS, slugifyKey } from '@/app/lib/forms/types'

/* Shared "define a new field" form — used by FormSchemaEditor's own
   +Add Field flow (form-builder/global Form Templates) AND, inline, by
   the HubSpot field-mapping page (hubspot-form/[formType]/page.tsx) when
   a producer needs a concept field that doesn't exist yet. One shape so
   a field created either way is identical. */

export type NewFieldDraft = {
  type: FieldType; label: string; required: boolean; help: string
  options: string[]; max_size_mb: number; accept: string
}

export const EMPTY_FIELD_DRAFT: NewFieldDraft = { type: 'text', label: '', required: false, help: '', options: [''], max_size_mb: 10, accept: 'image/png,image/jpeg' }

export const FIELD_TYPE_OPTIONS: { type: FieldType; label: string }[] = [
  { type: 'text', label: 'Text' },
  { type: 'email', label: 'Email' },
  { type: 'phone', label: 'Phone' },
  { type: 'url', label: 'URL' },
  { type: 'textarea', label: 'Long Text' },
  { type: 'select', label: 'Dropdown' },
  { type: 'multiselect', label: 'Checkboxes' },
  { type: 'date', label: 'Date' },
  { type: 'file', label: 'File Upload' },
]

export function uniqueFieldKey(base: string, existingFields: FieldSchema[]): string {
  const existing = new Set(existingFields.map(f => f.key.toLowerCase()))
  if (!existing.has(base) && !RESERVED_FIELD_KEYS.includes(base)) return base
  let n = 2
  while (existing.has(`${base}_${n}`) || RESERVED_FIELD_KEYS.includes(`${base}_${n}`)) n++
  return `${base}_${n}`
}

// Returns the new FieldSchema, or an error string if the draft is invalid.
export function buildFieldFromDraft(draft: NewFieldDraft, existingFields: FieldSchema[]): FieldSchema | string {
  const label = draft.label.trim()
  if (!label) return 'Give the field a label.'
  if ((draft.type === 'select' || draft.type === 'multiselect') && draft.options.filter(o => o.trim()).length === 0) {
    return 'Add at least one option.'
  }
  return {
    id: crypto.randomUUID(),
    key: uniqueFieldKey(slugifyKey(label), existingFields),
    label,
    type: draft.type,
    required: draft.required,
    locked: false,
    help: draft.help.trim() || undefined,
    options: (draft.type === 'select' || draft.type === 'multiselect') ? draft.options.map(o => o.trim()).filter(Boolean) : undefined,
    max_size_mb: draft.type === 'file' ? draft.max_size_mb : undefined,
    accept: draft.type === 'file' ? draft.accept : undefined,
  }
}

export function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink3)', display: 'block', marginBottom: '4px' }}>{label}</label>
      {children}
    </div>
  )
}

export function AddFieldForm({ draft, setDraft, onCancel, onConfirm, typeOptions = FIELD_TYPE_OPTIONS, confirmLabel = 'Add Field' }: {
  draft: NewFieldDraft
  setDraft: (d: NewFieldDraft | ((d: NewFieldDraft) => NewFieldDraft)) => void
  onCancel: () => void
  onConfirm: () => void
  typeOptions?: { type: FieldType; label: string }[]
  confirmLabel?: string
}) {
  return (
    <Card padded>
      <div style={{ display: 'grid', gap: '10px' }}>
        <FieldRow label="Field Type">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {typeOptions.map(o => (
              <button
                key={o.type}
                onClick={() => setDraft(d => ({ ...d, type: o.type }))}
                style={{
                  padding: '6px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                  border: draft.type === o.type ? '1.5px solid var(--teal-mid)' : '1px solid var(--border)',
                  background: draft.type === o.type ? 'var(--teal-light)' : 'transparent',
                  color: draft.type === o.type ? 'var(--teal-mid)' : 'var(--ink2)',
                }}
              >
                {o.label}
              </button>
            ))}
          </div>
        </FieldRow>
        <FieldRow label="Label">
          <Input value={draft.label} onChange={e => setDraft(d => ({ ...d, label: e.target.value }))} placeholder="e.g. T-Shirt Size" />
        </FieldRow>
        {draft.label.trim() && (
          <div style={{ fontSize: '11px', color: 'var(--ink4)' }}>Field key: <code>{slugifyKey(draft.label)}</code></div>
        )}
        <FieldRow label="Help text (optional)">
          <Input value={draft.help} onChange={e => setDraft(d => ({ ...d, help: e.target.value }))} />
        </FieldRow>
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12.5px', color: 'var(--ink2)', cursor: 'pointer' }}>
          <input type="checkbox" checked={draft.required} onChange={e => setDraft(d => ({ ...d, required: e.target.checked }))} />
          Required
        </label>
        {(draft.type === 'select' || draft.type === 'multiselect') && (
          <FieldRow label="Options (one per line)">
            <textarea className="tfield" rows={4} value={draft.options.join('\n')} onChange={e => setDraft(d => ({ ...d, options: e.target.value.split('\n') }))} />
          </FieldRow>
        )}
        {draft.type === 'file' && (
          <FieldRow label="Max file size (MB)">
            <Input type="number" min={1} max={25} value={draft.max_size_mb} onChange={e => setDraft(d => ({ ...d, max_size_mb: Math.min(25, Math.max(1, Number(e.target.value) || 10)) }))} />
          </FieldRow>
        )}
        <div style={{ display: 'flex', gap: '8px' }}>
          <Button variant="lime" onClick={onConfirm}>{confirmLabel}</Button>
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        </div>
      </div>
    </Card>
  )
}
