'use client'

import { FieldSchema, SubmittedValue } from '@/app/lib/forms/types'

/* Single field renderer shared by three consumers — the public onboarding
   form (app/public/forms/[event_id]/[form_type]/page.tsx), the Form
   Builder's live-preview pane, and the Stakeholder Hub's manual Add/Edit
   panel — so none of them can render a field differently from another.
   Markup/styles match the public form's original inline per-field block. */

export type FormFieldInputProps = {
  field: FieldSchema
  value: SubmittedValue
  onChange: (value: SubmittedValue) => void
  file?: File | null
  onFileChange?: (file: File | null) => void
  disabled?: boolean
}

export function FormFieldInput({ field, value, onChange, file, onFileChange, disabled }: FormFieldInputProps) {
  return (
    <div>
      <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--ink3)', display: 'block', marginBottom: '5px' }}>
        {field.label} {field.required && <span style={{ color: 'var(--red)' }}>*</span>}
      </label>

      {field.type === 'textarea' ? (
        <textarea
          required={field.required} rows={4} disabled={disabled}
          value={typeof value === 'string' ? value : ''}
          onChange={e => onChange(e.target.value)}
          className="tfield" style={{ resize: 'vertical' }}
        />
      ) : field.type === 'select' ? (
        <select
          required={field.required} disabled={disabled}
          value={typeof value === 'string' ? value : ''}
          onChange={e => onChange(e.target.value)}
          className="tfield"
        >
          <option value="">Select…</option>
          {(field.options ?? []).map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : field.type === 'multiselect' ? (
        <div style={{ display: 'grid', gap: '6px' }}>
          {(field.options ?? []).map(o => {
            const selected = Array.isArray(value) ? value : []
            const checked = selected.includes(o)
            return (
              <label key={o} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--ink2)', cursor: disabled ? 'default' : 'pointer' }}>
                <input
                  type="checkbox" checked={checked} disabled={disabled}
                  onChange={() => onChange(checked ? selected.filter(v => v !== o) : [...selected, o])}
                />
                {o}
              </label>
            )
          })}
        </div>
      ) : field.type === 'file' ? (
        <input
          type="file" required={field.required} accept={field.accept} className="tfield" disabled={disabled}
          onChange={e => onFileChange?.(e.target.files?.[0] ?? null)}
        />
      ) : (
        <input
          type={field.type === 'phone' ? 'tel' : field.type}
          required={field.required} disabled={disabled}
          value={typeof value === 'string' ? value : ''}
          onChange={e => onChange(e.target.value)}
          className="tfield"
        />
      )}

      {field.type === 'file' && file && (
        <div style={{ fontSize: '11px', color: 'var(--ink3)', marginTop: '4px' }}>Selected: {file.name}</div>
      )}
      {field.help && <div style={{ fontSize: '11px', color: 'var(--ink4)', marginTop: '4px' }}>{field.help}</div>}
    </div>
  )
}

export default FormFieldInput
