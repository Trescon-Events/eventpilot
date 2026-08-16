'use client'

import { useState, useEffect } from 'react'
import { Select } from '@/app/components/ui'

/* Phase 2 of the Event Workspace Access Roles foundation redesign
   (2026-08-16) — maps a Staff Portal (HRMS) functional role_type
   (already synced into event_staff.project_role_type by app/api/
   hrms-sync + app/api/cron/hrms-sync) to one of the access roles defined
   in the Roles tab. Every sync auto-applies this mapping (see
   app/lib/hrms/apply-role-access-map.ts), so assigning someone a role in
   Staff Portal auto-grants the matching EventPilot access bundle without
   anyone touching this page again — this page only sets up the mapping
   itself, once per role_type. */

type MapRow = { role_type: string; access_role_id: string | null; access_role_name: string | null }
type RoleOption = { id: string; name: string }

export default function StaffPortalMappingTab() {
  const [rows, setRows] = useState<MapRow[]>([])
  const [roleOptions, setRoleOptions] = useState<RoleOption[]>([])
  const [loading, setLoading] = useState(true)
  const [savingType, setSavingType] = useState<string | null>(null)

  async function fetchAll() {
    setLoading(true)
    const [mapRes, rolesRes] = await Promise.all([
      fetch('/api/hrms-role-map'),
      fetch('/api/access-roles'),
    ])
    setRows(await mapRes.json().catch(() => []))
    const roles = await rolesRes.json().catch(() => [])
    setRoleOptions(Array.isArray(roles) ? roles.map((r: RoleOption) => ({ id: r.id, name: r.name })) : [])
    setLoading(false)
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-mount, matches this module's other top-level fetchAll effects
    fetchAll()
  }, [])

  async function setMapping(roleType: string, accessRoleId: string | null) {
    setSavingType(roleType)
    await fetch('/api/hrms-role-map', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role_type: roleType, access_role_id: accessRoleId }),
    })
    await fetchAll()
    setSavingType(null)
  }

  if (loading) return <div style={{ fontSize: '13px', color: 'var(--ink3)' }}>Loading…</div>

  return (
    <div>
      <p style={{ fontSize: '13px', color: 'var(--ink3)', margin: '0 0 16px', maxWidth: '640px' }}>
        Every functional role type seen in Staff Portal allocations. Map one to an access role and every
        Staff Portal sync (daily, or a manual &quot;Sync from HRMS&quot;) automatically grants that role to
        anyone Staff Portal assigns it to — no manual re-assignment needed here. A manually-assigned role
        in the Access tab is never overwritten by this. Leave unmapped for &quot;no automatic access.&quot;
      </p>
      {rows.length === 0 ? (
        <div style={{ fontSize: '13px', color: 'var(--ink3)', padding: '24px', textAlign: 'center' }}>
          No role types seen yet — run a Staff Portal sync first.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '6px' }}>
          {rows.map(row => (
            <div key={row.role_type} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '10px' }}>
              {/* 2026-08-16 fix: flex:1 with no min-width/white-space guard
                  let the browser wrap this one character per line under
                  some widths — nowrap + minWidth:0 is the standard fix
                  for a flex text child that should never wrap. */}
              <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink)', flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontFamily: 'monospace' }}>{row.role_type}</span>
              <Select
                value={row.access_role_id ?? ''}
                disabled={savingType === row.role_type}
                onChange={e => setMapping(row.role_type, e.target.value || null)}
                style={{ minWidth: '220px' }}
              >
                <option value="">No automatic access</option>
                {roleOptions.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </Select>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
