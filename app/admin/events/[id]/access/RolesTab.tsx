'use client'

import { useState, useEffect } from 'react'
import { Button, Card, Badge } from '@/app/components/ui'
import { ACCESS_REGISTRY } from '@/app/lib/registry/access-permissions'

type RoleRow = { id: string; name: string; slug: string; description: string | null; permission_keys: string[] }

function slugify(name: string) {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

export default function RolesTab() {
  const [roles, setRoles] = useState<RoleRow[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<RoleRow | null>(null)
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => { fetchRoles() }, [])

  async function fetchRoles() {
    setLoading(true)
    const res = await fetch('/api/access-roles')
    setRoles(await res.json().catch(() => []))
    setLoading(false)
  }

  function openAdd() {
    setEditing(null); setName(''); setDescription(''); setChecked(new Set()); setAdding(true)
  }

  function openEdit(role: RoleRow) {
    setEditing(role); setName(role.name); setDescription(role.description ?? ''); setChecked(new Set(role.permission_keys)); setAdding(true)
  }

  function toggle(key: string) {
    setChecked(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }

  async function save() {
    if (!name.trim()) return
    setSaving(true); setMsg(null)
    const permission_keys = Array.from(checked)
    try {
      if (editing) {
        const res = await fetch(`/api/access-roles/${editing.id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: name.trim(), description: description.trim() || null, permission_keys }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error)
      } else {
        const res = await fetch('/api/access-roles', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: name.trim(), slug: slugify(name), description: description.trim() || null, permission_keys }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error)
      }
      setAdding(false)
      await fetchRoles()
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Save failed')
    }
    setSaving(false)
  }

  async function remove(role: RoleRow) {
    if (!confirm(`Delete the "${role.name}" role? Staff currently assigned it will lose those permissions on every event.`)) return
    await fetch(`/api/access-roles/${role.id}`, { method: 'DELETE' })
    await fetchRoles()
  }

  if (loading) return <div style={{ fontSize: '13px', color: 'var(--ink3)' }}>Loading…</div>

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <p style={{ fontSize: '13px', color: 'var(--ink3)', margin: 0, maxWidth: '560px' }}>
          Roles are global — edit one here and it updates everywhere it's assigned, across every event.
        </p>
        {!adding && <Button variant="lime" onClick={openAdd}>+ New Role</Button>}
      </div>

      {adding && (
        <Card padded className="tcard-p" >
          <div style={{ display: 'grid', gap: '12px', marginBottom: '16px' }}>
            <div>
              <label style={{ fontSize: '11px', fontWeight: 800, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '1px', display: 'block', marginBottom: '6px' }}>Role Name</label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Producer"
                style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px', fontFamily: 'inherit', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ fontSize: '11px', fontWeight: 800, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '1px', display: 'block', marginBottom: '6px' }}>Description (optional)</label>
              <input value={description} onChange={e => setDescription(e.target.value)} placeholder="What does this role do?"
                style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px', fontFamily: 'inherit', boxSizing: 'border-box' }} />
            </div>
          </div>

          <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '10px' }}>Permissions</div>
          <div style={{ display: 'grid', gap: '14px', marginBottom: '18px' }}>
            {ACCESS_REGISTRY.map(mod => (
              <div key={mod.key}>
                <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--ink)', marginBottom: '6px' }}>{mod.label}</div>
                <div style={{ display: 'grid', gap: '4px', paddingLeft: '4px' }}>
                  {mod.items.map(item => (
                    <label key={item.key} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12.5px', color: 'var(--ink2)', cursor: 'pointer' }}>
                      <input type="checkbox" checked={checked.has(item.key)} onChange={() => toggle(item.key)} />
                      {item.label}
                      {!item.enforced && (
                        <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--ink4)', background: 'var(--card-hi)', borderRadius: '999px', padding: '1px 7px' }}>not yet enforced</span>
                      )}
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {msg && <div style={{ fontSize: '12.5px', color: 'var(--red)', marginBottom: '12px' }}>{msg}</div>}
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button variant="teal" onClick={save}>{saving ? 'Saving…' : editing ? 'Save Changes' : 'Create Role'}</Button>
            <Button variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
          </div>
        </Card>
      )}

      {!adding && (
        <div style={{ display: 'grid', gap: '10px' }}>
          {roles.length === 0 && <div style={{ fontSize: '13px', color: 'var(--ink3)', padding: '24px', textAlign: 'center' }}>No roles defined yet.</div>}
          {roles.map(role => (
            <Card key={role.id} padded>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--ink)' }}>{role.name}</div>
                  {role.description && <div style={{ fontSize: '12.5px', color: 'var(--ink3)', marginTop: '2px' }}>{role.description}</div>}
                  <div style={{ marginTop: '8px' }}><Badge color="grey">{role.permission_keys.length} permission{role.permission_keys.length === 1 ? '' : 's'}</Badge></div>
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <Button variant="ghost" onClick={() => openEdit(role)}>Edit</Button>
                  <Button variant="red" onClick={() => remove(role)}>Delete</Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
