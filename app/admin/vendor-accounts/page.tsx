'use client'
import { useEffect, useState } from 'react'
import Button from '@/app/components/ui/Button'
import Card from '@/app/components/ui/Card'
import { Input } from '@/app/components/ui/Field'
import PageHeader from '@/app/components/PageHeader'
import { getModuleRegistry } from '@/app/lib/registry/modules'

type ModuleGrant = { module_key: string; label: string; tier: string }
type Vendor = { id: string; name: string; email: string; vendor_label: string | null; access_enabled: boolean; created_at: string; modules: ModuleGrant[] }

const ALL_MODULES = getModuleRegistry().map(m => ({ key: m.key, label: m.label })).sort((a, b) => a.label.localeCompare(b.label))

export default function VendorAccountsPage() {
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const [email, setEmail] = useState('')
  const [vendorLabel, setVendorLabel] = useState('')
  const [initialModules, setInitialModules] = useState<string[]>(['task-manager'])
  const [creating, setCreating] = useState(false)

  async function loadVendors() {
    const res = await fetch('/api/vendor-accounts')
    if (!res.ok) { setError('Failed to load vendor accounts.'); return }
    setVendors(await res.json())
  }

  useEffect(() => {
    async function loadInitial() {
      const res = await fetch('/api/vendor-accounts')
      if (!res.ok) { setError('Failed to load vendor accounts.'); return }
      setVendors(await res.json())
    }
    loadInitial().catch(() => setError('Failed to load vendor accounts.')).finally(() => setLoading(false))
  }, [])

  async function handleCreate() {
    if (!email.trim() || !vendorLabel.trim() || creating) return
    setCreating(true)
    setError(null)
    try {
      const res = await fetch('/api/vendor-accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), vendor_label: vendorLabel.trim(), module_keys: initialModules }),
      })
      if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b.error ?? 'Failed to create vendor account') }
      setEmail('')
      setVendorLabel('')
      setInitialModules(['task-manager'])
      await loadVendors()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create vendor account')
    } finally {
      setCreating(false)
    }
  }

  async function toggleEnabled(v: Vendor) {
    setVendors(prev => prev.map(x => x.id === v.id ? { ...x, access_enabled: !x.access_enabled } : x))
    const res = await fetch(`/api/vendor-accounts/${v.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ access_enabled: !v.access_enabled }),
    })
    if (!res.ok) { setError('Failed to update account.'); await loadVendors() }
  }

  async function toggleModule(vendorId: string, moduleKey: string, granted: boolean) {
    setVendors(prev => prev.map(v => {
      if (v.id !== vendorId) return v
      const modules = granted
        ? v.modules.filter(m => m.module_key !== moduleKey)
        : [...v.modules, { module_key: moduleKey, label: ALL_MODULES.find(m => m.key === moduleKey)?.label ?? moduleKey, tier: 'user' }]
      return { ...v, modules }
    }))
    const res = granted
      ? await fetch(`/api/vendor-accounts/${vendorId}/access?module_key=${encodeURIComponent(moduleKey)}`, { method: 'DELETE' })
      : await fetch(`/api/vendor-accounts/${vendorId}/access`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ module_key: moduleKey }) })
    if (!res.ok) { setError('Failed to update module access.'); await loadVendors() }
  }

  if (loading) return <div style={{ padding: '80px', textAlign: 'center', color: 'var(--ink4)' }}>Loading vendor accounts…</div>

  return (
    <>
      <PageHeader
        eyebrow="Admin"
        title="Vendor Accounts"
        description="External agency logins (Cactus, Pixelate, ...) restricted to an allow-list of modules — deny-by-default, not the normal broad staff access. Task Manager's own vendor-contact roster (who at an agency a task is tagged for) is managed inside the Task Manager Admin Console instead."
        backHref="/admin"
        backLabel="Admin"
      />
      <div style={{ padding: '20px 32px 48px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {error && (
          <div style={{ background: 'var(--red-light)', border: '1px solid var(--red-border)', color: 'var(--red)', borderRadius: '8px', padding: '10px 14px', fontSize: '13px' }}>
            {error}
          </div>
        )}

        <Card padded>
          <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--ink)', marginBottom: '14px' }}>New Vendor Account</div>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '14px' }}>
            <Input placeholder="Agency name (e.g. Pixelate)" value={vendorLabel} onChange={e => setVendorLabel(e.target.value)} style={{ flex: '1 1 220px' }} />
            <Input placeholder="Login email (e.g. pixelate@tresconglobal.com)" value={email} onChange={e => setEmail(e.target.value)} style={{ flex: '1 1 260px' }} />
          </div>
          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: '8px' }}>
            Initial module access
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' }}>
            {ALL_MODULES.map(m => (
              <label key={m.key} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--ink3)', padding: '5px 10px', borderRadius: '8px', border: '1px solid var(--border)', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={initialModules.includes(m.key)}
                  onChange={e => setInitialModules(prev => e.target.checked ? [...prev, m.key] : prev.filter(k => k !== m.key))}
                />
                {m.label}
              </label>
            ))}
          </div>
          <Button variant="teal" disabled={!email.trim() || !vendorLabel.trim() || creating} onClick={handleCreate}>
            {creating ? 'Creating…' : 'Create Vendor Account'}
          </Button>
        </Card>

        <Card padded>
          <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--ink)', marginBottom: '14px' }}>
            Vendor Accounts ({vendors.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {vendors.map(v => (
              <div key={v.id} style={{ border: '1px solid var(--border)', borderRadius: '10px', overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 14px', background: 'var(--card)' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink)' }}>{v.vendor_label ?? v.name}</div>
                    <div style={{ fontSize: '12px', color: 'var(--ink3)' }}>{v.email}</div>
                  </div>
                  <span style={{
                    fontSize: '11px', fontWeight: 700, padding: '3px 9px', borderRadius: '10px',
                    color: v.access_enabled ? 'var(--teal)' : 'var(--ink4)',
                    background: v.access_enabled ? 'var(--teal-light)' : 'var(--card-hi)',
                  }}>
                    {v.access_enabled ? 'Active' : 'Disabled'}
                  </span>
                  <span style={{ fontSize: '12px', color: 'var(--ink4)' }}>
                    {v.modules.length === 0 ? 'No modules granted' : v.modules.map(m => m.label).join(', ')}
                  </span>
                  <Button variant="ghost" onClick={() => setExpandedId(expandedId === v.id ? null : v.id)}>
                    {expandedId === v.id ? 'Close' : 'Manage Access'}
                  </Button>
                  <Button variant={v.access_enabled ? 'red' : 'teal'} onClick={() => toggleEnabled(v)}>
                    {v.access_enabled ? 'Deactivate' : 'Reactivate'}
                  </Button>
                </div>

                {expandedId === v.id && (
                  <div style={{ padding: '14px', borderTop: '1px solid var(--border-light)', background: 'var(--surface)' }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                      {ALL_MODULES.map(m => {
                        const granted = v.modules.some(g => g.module_key === m.key)
                        return (
                          <label key={m.key} style={{
                            display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', padding: '5px 10px', borderRadius: '8px', cursor: 'pointer',
                            border: `1px solid ${granted ? 'var(--teal)' : 'var(--border)'}`,
                            color: granted ? 'var(--teal)' : 'var(--ink3)',
                            background: granted ? 'var(--teal-light)' : 'var(--card)',
                          }}>
                            <input type="checkbox" checked={granted} onChange={() => toggleModule(v.id, m.key, granted)} />
                            {m.label}
                          </label>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            ))}
            {vendors.length === 0 && <div style={{ fontSize: '13px', color: 'var(--ink4)' }}>No vendor accounts yet.</div>}
          </div>
        </Card>
      </div>
    </>
  )
}
