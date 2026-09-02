'use client'
import { useEffect, useState } from 'react'
import Button from '@/app/components/ui/Button'
import Card from '@/app/components/ui/Card'
import { Input } from '@/app/components/ui/Field'
import PageHeader from '@/app/components/PageHeader'
import { VendorContact } from '../../types'

type VendorOption = { id: string; name: string; email: string; vendor_label: string | null }

/*
  Named people at a shared-login vendor account (e.g. Ravi/Priya at Pixelate)
  so a task can be tagged with who should pick it up, without each of them
  needing their own Microsoft 365 seat — see TASK_MANAGER_HANDOFF.md and
  supabase/vendor_accounts.sql. Deliberately inside the Task Manager Admin
  Console (Khalifa's territory), NOT the platform-admin-only
  /admin/vendor-accounts, which decides account existence/module access
  instead.
*/
export default function VendorContactsPage() {
  const [vendors, setVendors] = useState<VendorOption[]>([])
  const [selectedVendorId, setSelectedVendorId] = useState('')
  const [contacts, setContacts] = useState<VendorContact[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    fetch('/api/task-manager/vendor-contacts/vendors')
      .then(r => r.json())
      .then((data: VendorOption[]) => {
        setVendors(data ?? [])
        if (data?.length) setSelectedVendorId(data[0].id)
      })
      .catch(() => setError('Failed to load vendor accounts.'))
      .finally(() => setLoading(false))
  }, [])

  async function loadContacts(vendorId: string) {
    if (!vendorId) { setContacts([]); return }
    const res = await fetch(`/api/task-manager/vendor-contacts?vendor_staff_id=${vendorId}`)
    if (!res.ok) { setError('Failed to load contacts.'); return }
    setContacts(await res.json())
  }

  useEffect(() => {
    // No vendor selected (nothing granted Task Manager access yet, see the
    // empty-state render below) — nothing to fetch, contacts starts empty.
    if (!selectedVendorId) return
    fetch(`/api/task-manager/vendor-contacts?vendor_staff_id=${selectedVendorId}`)
      .then(r => r.json())
      .then((data: VendorContact[]) => setContacts(Array.isArray(data) ? data : []))
      .catch(() => setError('Failed to load contacts.'))
  }, [selectedVendorId])

  async function handleAdd() {
    if (!newName.trim() || !selectedVendorId || busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/task-manager/vendor-contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vendor_staff_id: selectedVendorId, name: newName.trim() }),
      })
      if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b.error ?? 'Failed to add contact') }
      setNewName('')
      await loadContacts(selectedVendorId)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to add contact')
    } finally {
      setBusy(false)
    }
  }

  async function toggleActive(contact: VendorContact) {
    setContacts(prev => prev.map(c => c.id === contact.id ? { ...c, active: !c.active } : c))
    const res = await fetch(`/api/task-manager/vendor-contacts/${contact.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ active: !contact.active }),
    })
    if (!res.ok) { setError('Failed to update contact.'); await loadContacts(selectedVendorId) }
  }

  if (loading) return <div style={{ padding: '80px', textAlign: 'center', color: 'var(--ink4)' }}>Loading…</div>

  return (
    <>
      <PageHeader
        eyebrow="Task Manager"
        title="Vendor Contacts"
        description="Named people at a shared vendor login (e.g. Pixelate) — tag a task with who at the agency should pick it up. Doesn't grant them their own EventPilot login; that's managed platform-wide under Admin → Vendor Accounts."
        backHref="/admin/task-manager/console"
        backLabel="Admin Console"
      />
      <div style={{ padding: '20px 32px 48px', maxWidth: '720px' }}>
        {error && (
          <div style={{ background: 'var(--red-light)', border: '1px solid var(--red-border)', color: 'var(--red)', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', marginBottom: '16px' }}>
            {error}
          </div>
        )}

        {vendors.length === 0 ? (
          <Card padded>
            <div style={{ fontSize: '13px', color: 'var(--ink3)' }}>
              No vendor account has Task Manager access yet. An admin grants that from Admin → Vendor Accounts.
            </div>
          </Card>
        ) : (
          <Card padded>
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: '8px' }}>
              Vendor account
            </div>
            <select
              value={selectedVendorId}
              onChange={e => setSelectedVendorId(e.target.value)}
              className="tfield"
              style={{ marginBottom: '18px', maxWidth: '360px' }}
            >
              {vendors.map(v => <option key={v.id} value={v.id}>{v.vendor_label ?? v.name} — {v.email}</option>)}
            </select>

            <div style={{ display: 'flex', gap: '8px', marginBottom: '18px' }}>
              <Input placeholder="Contact name (e.g. Ravi)" value={newName} onChange={e => setNewName(e.target.value)} style={{ flex: 1 }} />
              <Button variant="teal" disabled={!newName.trim() || busy} onClick={handleAdd}>Add</Button>
            </div>

            <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--ink)', marginBottom: '10px' }}>
              Contacts ({contacts.length})
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {contacts.map(c => (
                <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '10px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: c.active ? 'var(--ink)' : 'var(--ink4)', flex: 1 }}>{c.name}</span>
                  {!c.active && <span style={{ fontSize: '11px', color: 'var(--ink4)' }}>Inactive</span>}
                  <button
                    type="button"
                    onClick={() => toggleActive(c)}
                    style={{ fontSize: '13px', fontWeight: 700, color: c.active ? 'var(--red)' : 'var(--teal)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
                  >
                    {c.active ? 'Deactivate' : 'Reactivate'}
                  </button>
                </div>
              ))}
              {contacts.length === 0 && <div style={{ fontSize: '13px', color: 'var(--ink3)' }}>No contacts yet.</div>}
            </div>
          </Card>
        )}
      </div>
    </>
  )
}
