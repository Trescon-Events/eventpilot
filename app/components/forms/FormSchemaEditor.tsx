'use client'

import { useState, useEffect } from 'react'
import { Button, Card, Input } from '@/app/components/ui'
import { FormFieldInput } from '@/app/components/forms/FormFieldInput'
import { AddFieldForm, NewFieldDraft, EMPTY_FIELD_DRAFT, buildFieldFromDraft, FieldRow } from '@/app/components/forms/AddFieldForm'
import { FieldSchema, FIELD_USAGE_HINTS } from '@/app/lib/forms/types'
import { DndContext, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

/* Shared field-schema editor — the actual builder UI (drag-reorder,
   add/edit/delete field, live preview, save/reset), with zero opinion
   about page chrome or WHICH schema it's editing (per-event override vs.
   the global default). Two thin page wrappers own that distinction:
     - app/admin/events/[id]/stakeholders/form-builder/[formType]/page.tsx
       (per-event, RBAC-gated via sae.forms.manage)
     - app/admin/form-templates/[formType]/page.tsx
       (global, admin_only — canManage is always true there)
   Reorder uses @dnd-kit/sortable (already a project dependency, first use
   of this specific sub-package — the codebase's other dnd-kit usage,
   DelegateKanban.tsx, only uses @dnd-kit/core's column-drag primitives).
   Live preview renders the exact same FormFieldInput the real public form
   and the Hub's manual panel use, so it can never drift from reality. */

export type FormSchemaEditorProps = {
  schemaApiUrl: string           // GET (load) / PUT (save) / DELETE (reset) all target this exact URL
  canManage: boolean
  permissionsLoading?: boolean    // true while the wrapper's own async permission check is in flight
  resetConfirmMessage: string     // window.confirm() copy before DELETE — wording differs by scope
  resetButtonLabel?: string       // defaults to "Reset to Default"; global wrapper passes "Reset to Original"
  noPermissionMessage?: string    // shown when !canManage && !loading
}

export function FormSchemaEditor({
  schemaApiUrl, canManage, permissionsLoading, resetConfirmMessage,
  resetButtonLabel = 'Reset to Default',
  noPermissionMessage = "You can view this form's fields but don't have permission to customize them.",
}: FormSchemaEditorProps) {
  const [fields, setFields] = useState<FieldSchema[]>([])
  const [isDefault, setIsDefault] = useState(true)
  const [schemaLoading, setSchemaLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [msgIsError, setMsgIsError] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [draft, setDraft] = useState<NewFieldDraft>(EMPTY_FIELD_DRAFT)

  const loading = schemaLoading || !!permissionsLoading

  async function loadSchema() {
    const res = await fetch(schemaApiUrl)
    const data = await res.json().catch(() => ({ fields: [], is_default: true }))
    setFields(data.fields ?? [])
    setIsDefault(data.is_default ?? true)
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-mount; matches stakeholders/page.tsx's fetchAll effect
    setSchemaLoading(true)
    loadSchema().then(() => setSchemaLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadSchema closes over schemaApiUrl, already the effect's own dependency
  }, [schemaApiUrl])

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  function onDragEnd(e: DragEndEvent) {
    if (!canManage || !e.over || e.active.id === e.over.id) return
    const oldIdx = fields.findIndex(f => f.id === e.active.id)
    const newIdx = fields.findIndex(f => f.id === e.over!.id)
    if (oldIdx === -1 || newIdx === -1) return
    setFields(prev => arrayMove(prev, oldIdx, newIdx))
  }

  function updateField(id: string, patch: Partial<FieldSchema>) {
    setFields(prev => prev.map(f => (f.id === id ? { ...f, ...patch } : f)))
  }

  function requestDeleteField(field: FieldSchema) {
    if (field.locked) return
    const hint = FIELD_USAGE_HINTS[field.key]
    if (hint && !window.confirm(`${hint}\n\nRemove "${field.label}" anyway?`)) return
    setFields(prev => prev.filter(f => f.id !== field.id))
    if (expandedId === field.id) setExpandedId(null)
  }

  function confirmAddField() {
    const result = buildFieldFromDraft(draft, fields)
    if (typeof result === 'string') { setMsg(result); setMsgIsError(true); return }
    setFields(prev => [...prev, result])
    setDraft(EMPTY_FIELD_DRAFT)
    setAddOpen(false)
    setMsg(null)
  }

  async function save() {
    setSaving(true); setMsg(null)
    const res = await fetch(schemaApiUrl, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fields }),
    })
    const data = await res.json().catch(() => ({}))
    setSaving(false)
    if (res.ok) { setFields(data.fields); setIsDefault(false); setMsg('Saved.'); setMsgIsError(false) }
    else { setMsg(data.error ?? 'Save failed.'); setMsgIsError(true) }
  }

  async function resetToDefault() {
    if (!window.confirm(resetConfirmMessage)) return
    setSaving(true)
    const res = await fetch(schemaApiUrl, { method: 'DELETE' })
    if (res.ok) { await loadSchema(); setMsg('Reverted.'); setMsgIsError(false) }
    else { setMsg('Could not reset — please try again.'); setMsgIsError(true) }
    setSaving(false)
  }

  return (
    <div>
      {!canManage && !loading && (
        <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'var(--amber-light)', border: '1px solid var(--amber-border)', color: 'var(--ink2)', fontSize: '12.5px', marginBottom: '16px' }}>
          {noPermissionMessage}
        </div>
      )}

      {canManage && !loading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
          <Button variant="lime" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
          {!isDefault && <Button variant="ghost" onClick={resetToDefault} disabled={saving}>{resetButtonLabel}</Button>}
        </div>
      )}

      {msg && (
        <div style={{
          padding: '10px 14px', borderRadius: '8px', marginBottom: '16px', fontSize: '12.5px',
          background: msgIsError ? 'var(--red-light)' : 'var(--success-light)',
          border: `1px solid ${msgIsError ? 'var(--red-border)' : 'color-mix(in srgb, var(--success) 40%, transparent)'}`,
          color: msgIsError ? 'var(--red)' : 'var(--success)',
        }}>
          {msg}
        </div>
      )}

      {loading ? (
        <div style={{ fontSize: '13px', color: 'var(--ink3)' }}>Loading…</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 400px', gap: '24px', alignItems: 'flex-start' }}>
          <div>
            <DndContext sensors={sensors} onDragEnd={onDragEnd}>
              <SortableContext items={fields.map(f => f.id)} strategy={verticalListSortingStrategy}>
                <div style={{ display: 'grid', gap: '8px' }}>
                  {fields.map(field => (
                    <SortableField
                      key={field.id}
                      field={field}
                      canManage={canManage}
                      expanded={expandedId === field.id}
                      onToggle={() => setExpandedId(id => (id === field.id ? null : field.id))}
                      onChange={patch => updateField(field.id, patch)}
                      onDelete={() => requestDeleteField(field)}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>

            {canManage && (
              <div style={{ marginTop: '14px' }}>
                {!addOpen ? (
                  <Button variant="ghost" onClick={() => setAddOpen(true)}>+ Add Field</Button>
                ) : (
                  <AddFieldForm draft={draft} setDraft={setDraft} onCancel={() => { setAddOpen(false); setDraft(EMPTY_FIELD_DRAFT) }} onConfirm={confirmAddField} />
                )}
              </div>
            )}
          </div>

          <div style={{ position: 'sticky', top: '24px' }}>
            <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--ink3)', letterSpacing: '0.6px', textTransform: 'uppercase', marginBottom: '8px' }}>Live Preview</div>
            <Card padded>
              <div style={{ display: 'grid', gap: '16px' }}>
                {fields.length === 0 && <div style={{ fontSize: '12.5px', color: 'var(--ink3)' }}>No fields yet.</div>}
                {fields.map(field => (
                  <FormFieldInput key={field.id} field={field} value={field.type === 'multiselect' ? [] : ''} onChange={() => {}} disabled />
                ))}
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  )
}

function SortableField({ field, canManage, expanded, onToggle, onChange, onDelete }: {
  field: FieldSchema
  canManage: boolean
  expanded: boolean
  onToggle: () => void
  onChange: (patch: Partial<FieldSchema>) => void
  onDelete: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: field.id, disabled: !canManage })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }
  const hint = FIELD_USAGE_HINTS[field.key]

  return (
    <div ref={setNodeRef} style={style}>
      <Card padded>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {canManage && (
            <span {...attributes} {...listeners} title="Drag to reorder" style={{ cursor: 'grab', color: 'var(--ink4)', fontSize: '16px', lineHeight: 1 }}>⠿</span>
          )}
          <div onClick={onToggle} style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
            <span style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--ink)' }}>{field.label}</span>
            <span style={{ fontSize: '10.5px', color: 'var(--ink4)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>{field.type}</span>
            {field.locked && (
              <span style={{ fontSize: '10px', fontWeight: 800, color: 'var(--amber)', background: 'var(--amber-light)', border: '1px solid var(--amber-border)', borderRadius: '10px', padding: '1px 7px' }}>
                Required field
              </span>
            )}
          </div>
          {canManage && (
            <button
              onClick={onDelete}
              disabled={field.locked}
              title={field.locked ? 'Required internally — cannot be removed' : 'Delete field'}
              style={{
                background: 'none', border: 'none', fontSize: '12.5px', fontWeight: 700, cursor: field.locked ? 'default' : 'pointer',
                color: field.locked ? 'var(--ink4)' : 'var(--red)', opacity: field.locked ? 0.5 : 1,
              }}
            >
              Delete
            </button>
          )}
        </div>

        {expanded && canManage && (
          <div style={{ marginTop: '14px', paddingTop: '14px', borderTop: '1px solid var(--border-light)', display: 'grid', gap: '10px' }}>
            {hint && (
              <div style={{ fontSize: '11.5px', color: 'var(--ink3)', background: 'var(--surface)', border: '1px solid var(--border-light)', borderRadius: '6px', padding: '8px 10px' }}>
                {hint}
              </div>
            )}
            <FieldRow label="Label">
              <Input value={field.label} onChange={e => onChange({ label: e.target.value })} />
            </FieldRow>
            <FieldRow label="Help text">
              <Input value={field.help ?? ''} onChange={e => onChange({ help: e.target.value || undefined })} />
            </FieldRow>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12.5px', color: 'var(--ink2)', cursor: field.locked ? 'default' : 'pointer' }}>
              <input type="checkbox" checked={field.required} disabled={field.locked} onChange={e => onChange({ required: e.target.checked })} />
              Required
            </label>
            {(field.type === 'select' || field.type === 'multiselect') && (
              <FieldRow label="Options (one per line)">
                <textarea
                  className="tfield" rows={4}
                  value={(field.options ?? []).join('\n')}
                  onChange={e => onChange({ options: e.target.value.split('\n') })}
                  onBlur={e => onChange({ options: e.target.value.split('\n').map(o => o.trim()).filter(Boolean) })}
                />
              </FieldRow>
            )}
            {field.type === 'file' && (
              <>
                <FieldRow label="Max file size (MB)">
                  <Input type="number" min={1} max={25} value={field.max_size_mb ?? 10}
                    onChange={e => onChange({ max_size_mb: Math.min(25, Math.max(1, Number(e.target.value) || 10)) })} />
                </FieldRow>
                <div style={{ fontSize: '11px', color: 'var(--ink4)' }}>
                  {['photo', 'company_logo', 'logo'].includes(field.key)
                    ? 'This is a built-in asset field — uploads here go through automatic background removal / logo processing.'
                    : 'Custom file uploads are stored as-is — automatic logo/photo processing only applies to the built-in Photo/Logo fields.'}
                </div>
              </>
            )}
          </div>
        )}
      </Card>
    </div>
  )
}

