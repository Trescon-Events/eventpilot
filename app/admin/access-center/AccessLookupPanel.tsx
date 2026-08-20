'use client'

import { useState, useEffect } from 'react'
import { Card, Badge } from '@/app/components/ui'

/* "Who has what" lookup (2026-08-16) — the reverse of RolesTab/
   AssignmentsTab: pick a person, see everything they actually hold
   across the per-event/global RBAC system, resolved (wildcards expanded)
   and attributed to the specific role + scope that grants it. Backed by
   GET /api/admin/access-lookup. */

type StaffOption = { id: string; name: string; email: string }
type Assignment = { id: string; roleId: string; roleName: string; scope: string; autoGranted: boolean; grantedAt: string; expiresAt: string | null; isExpired: boolean }
type PermItem = { key: string; label: string; enforced: boolean; granted: boolean; grantedVia: { roleName: string; scope: string }[] }
type ModuleResult = { key: string; label: string; items: PermItem[] }
type LookupResult = { staff: { id: string; name: string; email: string }; isPlatformAdmin: boolean; assignments: Assignment[]; modules: ModuleResult[] }

export default function AccessLookupPanel() {
  const [staffOptions, setStaffOptions] = useState<StaffOption[]>([])
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<StaffOption | null>(null)
  const [result, setResult] = useState<LookupResult | null>(null)
  const [loading, setLoading] = useState(false)

  async function fetchStaffOptions() {
    const res = await fetch('/api/staff-list')
    const data = await res.json().catch(() => [])
    setStaffOptions(Array.isArray(data) ? data.map((s: StaffOption) => ({ id: s.id, name: s.name, email: s.email })) : [])
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-mount, matches this app's other top-level fetchAll effects
    fetchStaffOptions()
  }, [])

  async function pick(s: StaffOption) {
    setSelected(s)
    setQuery('')
    setLoading(true)
    const res = await fetch(`/api/admin/access-lookup?staff_id=${s.id}`)
    setResult(await res.json().catch(() => null))
    setLoading(false)
  }

  const matches = query.trim().length === 0 ? [] : staffOptions.filter(s =>
    s.name.toLowerCase().includes(query.toLowerCase()) || s.email.toLowerCase().includes(query.toLowerCase())
  ).slice(0, 8)

  return (
    <Card padded>
      <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '0.8px', color: 'var(--teal-mid)', textTransform: 'uppercase', marginBottom: '6px' }}>Look Up Access</div>
      <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--ink)', marginBottom: '4px' }}>Who has what</div>
      <p style={{ fontSize: '13px', color: 'var(--ink3)', margin: '0 0 16px', maxWidth: '600px' }}>
        Pick a staff member to see every role they hold (global or per-event), where each came from
        (manually assigned or auto-granted from a Staff Portal sync), and the full resolved permission
        list that follows from it.
      </p>

      {/* Results render in-flow, not as an absolutely-positioned overlay
          (2026-08-16 fix) — this panel sits inside a Card, and .tcard has
          overflow:hidden (app/globals.css), which silently clipped an
          absolute dropdown here with no way to scroll it into view. */}
      <div style={{ maxWidth: '360px', marginBottom: selected ? '18px' : 0 }}>
        <input value={selected ? `${selected.name} — ${selected.email}` : query}
          onChange={e => { setQuery(e.target.value); setSelected(null); setResult(null) }}
          placeholder="Search staff by name or email…"
          style={{ width: '100%', padding: '9px 12px', borderRadius: '9px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--ink)', fontSize: '13px', fontFamily: 'inherit', boxSizing: 'border-box' }} />
        {matches.length > 0 && !selected && (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '9px', marginTop: '6px', overflow: 'hidden' }}>
            {matches.map(s => (
              <button key={s.id} onClick={() => pick(s)}
                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 12px', border: 'none', borderBottom: '1px solid var(--border-light)', background: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '13px', color: 'var(--ink)' }}>
                {s.name} <span style={{ color: 'var(--ink3)' }}>— {s.email}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {loading && <div style={{ fontSize: '13px', color: 'var(--ink3)' }}>Loading…</div>}

      {result && !loading && (
        <div>
          {result.isPlatformAdmin ? (
            <div style={{ padding: '12px 16px', borderRadius: '10px', background: 'var(--teal-light)', border: '1.5px solid var(--teal-border)', fontSize: '13px', color: 'var(--teal)', fontWeight: 700 }}>
              Platform admin — full access to everything, everywhere. No per-event roles needed.
            </div>
          ) : (
            <>
              <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: '8px' }}>
                Assignments ({result.assignments.length})
              </div>
              {result.assignments.length === 0 ? (
                <div style={{ fontSize: '13px', color: 'var(--ink3)', marginBottom: '18px' }}>No roles assigned — this person has no access under the RBAC system.</div>
              ) : (
                <div style={{ display: 'grid', gap: '6px', marginBottom: '18px' }}>
                  {result.assignments.map(a => (
                    <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 14px', background: 'var(--surface)', border: '1px solid var(--border-light)', borderRadius: '9px' }}>
                      <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink)', flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.roleName}</span>
                      <span style={{ fontSize: '12px', color: 'var(--ink3)' }}>{a.scope}</span>
                      {a.expiresAt && (
                        <Badge color={a.isExpired ? 'red' : 'amber'}>{a.isExpired ? 'expired' : `until ${new Date(a.expiresAt).toLocaleDateString()}`}</Badge>
                      )}
                      <Badge color={a.autoGranted ? 'purple' : 'grey'}>{a.autoGranted ? 'auto (Staff Portal)' : 'manual'}</Badge>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: '8px' }}>Resolved Permissions</div>
              <div style={{ display: 'grid', gap: '14px' }}>
                {result.modules.map(mod => {
                  const grantedItems = mod.items.filter(i => i.granted)
                  if (grantedItems.length === 0) return null
                  return (
                    <div key={mod.key}>
                      <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--ink)', marginBottom: '6px' }}>{mod.label}</div>
                      <div style={{ display: 'grid', gap: '4px', paddingLeft: '4px' }}>
                        {grantedItems.map(item => (
                          <div key={item.key} style={{ fontSize: '12.5px', color: 'var(--ink2)', display: 'flex', gap: '8px', alignItems: 'baseline' }}>
                            <span style={{ color: 'var(--teal-mid)' }}>✓</span>
                            <span>{item.label}</span>
                            <span style={{ fontSize: '11px', color: 'var(--ink4)' }}>
                              via {item.grantedVia.map(v => `${v.roleName} (${v.scope})`).join(', ')}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
                {result.modules.every(m => m.items.every(i => !i.granted)) && (
                  <div style={{ fontSize: '13px', color: 'var(--ink3)' }}>No resolved permissions.</div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </Card>
  )
}
