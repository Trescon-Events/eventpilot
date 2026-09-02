'use client'
import { useEffect, useState } from 'react'
import Button from '@/app/components/ui/Button'
import Card from '@/app/components/ui/Card'
import { Input } from '@/app/components/ui/Field'
import PageHeader from '@/app/components/PageHeader'
import { TaskType } from '../../types'

/*
  Required classification on every task (Web Design, Web Dev, ...) — see
  supabase/task_manager_task_types.sql. Separate from the vendor-contact
  roster (who at an agency a task is tagged for): this applies to every
  task, internal or vendor-assigned. Same Admin Console territory
  (Khalifa's) as Vendor Contacts, reorder is deliberately simple up/down
  buttons rather than drag-and-drop — reliable beats fancy for a list this
  short.
*/
export default function TaskTypesPage() {
  const [types, setTypes] = useState<TaskType[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [newLabel, setNewLabel] = useState('')
  const [busy, setBusy] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingLabel, setEditingLabel] = useState('')

  async function loadTypes() {
    const res = await fetch('/api/task-manager/task-types')
    if (!res.ok) { setError('Failed to load task types.'); return }
    setTypes(await res.json())
  }

  useEffect(() => {
    async function loadInitial() {
      const res = await fetch('/api/task-manager/task-types')
      if (!res.ok) { setError('Failed to load task types.'); return }
      setTypes(await res.json())
    }
    loadInitial().catch(() => setError('Failed to load task types.')).finally(() => setLoading(false))
  }, [])

  async function handleAdd() {
    if (!newLabel.trim() || busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/task-manager/task-types', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: newLabel.trim() }),
      })
      if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b.error ?? 'Failed to add task type') }
      setNewLabel('')
      await loadTypes()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to add task type')
    } finally {
      setBusy(false)
    }
  }

  async function toggleActive(t: TaskType) {
    setTypes(prev => prev.map(x => x.id === t.id ? { ...x, active: !x.active } : x))
    const res = await fetch(`/api/task-manager/task-types/${t.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ active: !t.active }),
    })
    if (!res.ok) { setError('Failed to update task type.'); await loadTypes() }
  }

  function startEdit(t: TaskType) {
    setEditingId(t.id)
    setEditingLabel(t.label)
  }

  async function saveEdit() {
    if (!editingId || !editingLabel.trim()) return
    const id = editingId
    setTypes(prev => prev.map(x => x.id === id ? { ...x, label: editingLabel.trim() } : x))
    setEditingId(null)
    const res = await fetch(`/api/task-manager/task-types/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ label: editingLabel.trim() }),
    })
    if (!res.ok) { setError('Failed to rename task type.'); await loadTypes() }
  }

  // Swaps sort_order with the adjacent row in the given direction — two
  // PATCHes, applied optimistically to the local list first.
  async function move(t: TaskType, direction: -1 | 1) {
    const idx = types.findIndex(x => x.id === t.id)
    const swapIdx = idx + direction
    if (swapIdx < 0 || swapIdx >= types.length) return
    const other = types[swapIdx]

    const reordered = [...types]
    reordered[idx] = { ...other, sort_order: t.sort_order }
    reordered[swapIdx] = { ...t, sort_order: other.sort_order }
    reordered.sort((a, b) => a.sort_order - b.sort_order)
    setTypes(reordered)

    const [res1, res2] = await Promise.all([
      fetch(`/api/task-manager/task-types/${t.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sort_order: other.sort_order }) }),
      fetch(`/api/task-manager/task-types/${other.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sort_order: t.sort_order }) }),
    ])
    if (!res1.ok || !res2.ok) { setError('Failed to reorder task types.'); await loadTypes() }
  }

  if (loading) return <div style={{ padding: '80px', textAlign: 'center', color: 'var(--ink4)' }}>Loading…</div>

  return (
    <>
      <PageHeader
        eyebrow="Task Manager"
        title="Task Types"
        description="The Task Type every task must be classified under (Web Design, Web Dev, ...) — required on every new or edited task, internal or vendor-assigned."
        backHref="/admin/task-manager/console"
        backLabel="Admin Console"
      />
      <div style={{ padding: '20px 32px 48px', maxWidth: '720px' }}>
        {error && (
          <div style={{ background: 'var(--red-light)', border: '1px solid var(--red-border)', color: 'var(--red)', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', marginBottom: '16px' }}>
            {error}
          </div>
        )}

        <Card padded>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '18px' }}>
            <Input placeholder="Task type name (e.g. Web Design)" value={newLabel} onChange={e => setNewLabel(e.target.value)} style={{ flex: 1 }} />
            <Button variant="teal" disabled={!newLabel.trim() || busy} onClick={handleAdd}>Add</Button>
          </div>

          <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--ink)', marginBottom: '10px' }}>
            Task Types ({types.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {types.map((t, idx) => (
              <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '10px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <button
                    type="button"
                    disabled={idx === 0}
                    onClick={() => move(t, -1)}
                    style={{ background: 'none', border: 'none', cursor: idx === 0 ? 'default' : 'pointer', color: idx === 0 ? 'var(--ink4)' : 'var(--ink3)', fontSize: '11px', lineHeight: 1, padding: '2px' }}
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    disabled={idx === types.length - 1}
                    onClick={() => move(t, 1)}
                    style={{ background: 'none', border: 'none', cursor: idx === types.length - 1 ? 'default' : 'pointer', color: idx === types.length - 1 ? 'var(--ink4)' : 'var(--ink3)', fontSize: '11px', lineHeight: 1, padding: '2px' }}
                  >
                    ▼
                  </button>
                </div>

                {editingId === t.id ? (
                  <Input
                    autoFocus
                    value={editingLabel}
                    onChange={e => setEditingLabel(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditingId(null) }}
                    onBlur={saveEdit}
                    style={{ flex: 1 }}
                  />
                ) : (
                  <span style={{ fontSize: '13px', fontWeight: 700, color: t.active ? 'var(--ink)' : 'var(--ink4)', flex: 1 }}>{t.label}</span>
                )}

                {!t.active && <span style={{ fontSize: '11px', color: 'var(--ink4)' }}>Inactive</span>}

                {editingId !== t.id && (
                  <button
                    type="button"
                    onClick={() => startEdit(t)}
                    style={{ fontSize: '13px', fontWeight: 700, color: 'var(--teal)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
                  >
                    Rename
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => toggleActive(t)}
                  style={{ fontSize: '13px', fontWeight: 700, color: t.active ? 'var(--red)' : 'var(--teal)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
                >
                  {t.active ? 'Deactivate' : 'Reactivate'}
                </button>
              </div>
            ))}
            {types.length === 0 && <div style={{ fontSize: '13px', color: 'var(--ink3)' }}>No task types yet.</div>}
          </div>
        </Card>
      </div>
    </>
  )
}
