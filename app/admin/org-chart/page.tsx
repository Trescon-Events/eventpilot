'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import Link from 'next/link'

const C = {
  bg:      '#F6F8FB',
  surface: '#FFFFFF',
  border:  '#DDE8EE',
  text:    '#0F1923',
  muted:   '#5B7080',
  teal:    '#00897B',
  amber:   '#D97706',
  red:     '#DC2626',
  purple:  '#6C54B5',
  blue:    '#1565C0',
}

const OFFICE_COLOR: Record<string, string> = {
  dubai:     C.blue,
  bangalore: C.purple,
  mangalore: C.teal,
  manipal:   C.amber,
}
const OFFICE_LABEL: Record<string, string> = {
  dubai: 'Dubai', bangalore: 'Bangalore', mangalore: 'Mangalore', manipal: 'Manipal',
}
const LEVEL_COLOR: Record<string, string> = {
  super_admin: '#7C3AED',
  office_head: '#DC2626',
  dept_head:   '#D97706',
  team_lead:   '#1565C0',
  staff:       '#5B7080',
}
const LEVEL_LABEL: Record<string, string> = {
  super_admin: 'Super Admin',
  office_head: 'Office Head',
  dept_head:   'Dept Head',
  team_lead:   'Team Lead',
  staff:       'Staff',
}
const LEVEL_RANK: Record<string, number> = {
  super_admin: 0, office_head: 1, dept_head: 2, team_lead: 3, staff: 4,
}

const PLATFORM_TOOLS = [
  { key: 'smart_data',      label: 'Smart Data',      color: '#0E7490' },
  { key: 'hr_portal',       label: 'HR Portal',       color: '#7C3AED' },
  { key: 'events',          label: 'Events',          color: '#DC2626' },
  { key: 'intelligence',    label: 'Intelligence',    color: '#D97706' },
  { key: 'finance',         label: 'Finance',         color: '#059669' },
  { key: 'brand_studio',    label: 'Brand Studio',    color: '#DB2777' },
  { key: 'website_builder', label: 'Website',         color: '#2563EB' },
  { key: 'content',         label: 'Content',         color: '#EA580C' },
]

type StaffRow = {
  id:              string
  name:            string
  email:           string
  role:            string | null
  department:      string | null
  office_id:       string | null
  job_level:       string
  manager_id:      string | null
  toolkit_access?: boolean
  tool_grants?:    Record<string, boolean>
}

function initials(name: string) {
  return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
}

// ── Shared components ─────────────────────────────────────────────────────────
function Avatar({ name, level, size = 32 }: { name: string; level: string; size?: number }) {
  const lc = LEVEL_COLOR[level] ?? C.muted
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: lc + '20', color: lc, flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: Math.round(size * 0.34), fontWeight: 800,
    }}>
      {initials(name)}
    </div>
  )
}

function LevelBadge({ level }: { level: string }) {
  const lc = LEVEL_COLOR[level] ?? C.muted
  return (
    <span style={{
      fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: '6px',
      background: lc + '15', color: lc, whiteSpace: 'nowrap',
      letterSpacing: '0.3px', textTransform: 'uppercase',
    }}>
      {LEVEL_LABEL[level] ?? level}
    </span>
  )
}

function OfficeBadge({ office }: { office: string | null }) {
  if (!office) return null
  const oc = OFFICE_COLOR[office] ?? C.muted
  return (
    <span style={{
      fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: '6px',
      background: oc + '15', color: oc, whiteSpace: 'nowrap',
    }}>
      {OFFICE_LABEL[office] ?? office}
    </span>
  )
}

// 8 tool access dots
function ToolDots({ s }: { s: StaffRow }) {
  const isAdmin = s.job_level === 'super_admin'
  const grants: Record<string, boolean> = {
    ...(s.tool_grants ?? {}),
    smart_data: s.toolkit_access ?? false,
  }
  return (
    <div style={{ display: 'flex', gap: '3px', alignItems: 'center' }}>
      {PLATFORM_TOOLS.map(t => {
        const on = isAdmin || grants[t.key] === true
        return (
          <div key={t.key} title={t.label} style={{
            width: 7, height: 7, borderRadius: '50%',
            background: on ? t.color : C.border,
            transition: 'background 0.1s',
            flexShrink: 0,
          }} />
        )
      })}
    </div>
  )
}

// ── Person detail panel ───────────────────────────────────────────────────────
function DetailPanel({
  person, allStaff, onClose, onGrantsChange,
}: {
  person:          StaffRow
  allStaff:        StaffRow[]
  onClose:         () => void
  onGrantsChange:  (id: string, key: string, value: boolean) => void
}) {
  const [saving, setSaving] = useState<string | null>(null)

  const staffMap = useMemo(() => new Map(allStaff.map(s => [s.id, s])), [allStaff])

  // Build manager chain (upward)
  const chain = useMemo(() => {
    const result: StaffRow[] = []
    let cur = person.manager_id ? staffMap.get(person.manager_id) : undefined
    let safety = 0
    while (cur && safety < 10) {
      result.unshift(cur)
      cur = cur.manager_id ? staffMap.get(cur.manager_id) : undefined
      safety++
    }
    return result
  }, [person, staffMap])

  // Direct reports
  const reports = useMemo(() =>
    allStaff.filter(s => s.manager_id === person.id)
      .sort((a, b) => (LEVEL_RANK[a.job_level] ?? 4) - (LEVEL_RANK[b.job_level] ?? 4) || a.name.localeCompare(b.name))
  , [person.id, allStaff])

  const isAdmin = person.job_level === 'super_admin'
  const grants: Record<string, boolean> = {
    ...(person.tool_grants ?? {}),
    smart_data: person.toolkit_access ?? false,
  }

  async function toggle(key: string, current: boolean) {
    setSaving(key)
    try {
      await fetch('/api/admin/tool-permissions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: person.id, tool_key: key, value: !current }),
      })
      onGrantsChange(person.id, key, !current)
    } finally {
      setSaving(null)
    }
  }

  return (
    <div style={{
      width: '360px', flexShrink: 0, background: C.surface,
      borderLeft: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column',
      height: 'calc(100vh - 56px - 36px)', position: 'sticky', top: '92px',
      overflowY: 'auto',
    }}>
      {/* Panel header */}
      <div style={{ padding: '16px 18px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: '12px' }}>
        <Avatar name={person.name} level={person.job_level} size={40} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '14px', fontWeight: 800, color: C.text, lineHeight: 1.2 }}>{person.name}</div>
          <div style={{ fontSize: '11px', color: C.muted, marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{person.role ?? person.email}</div>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted, padding: '4px', display: 'flex', alignItems: 'center' }}>
          <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      <div style={{ padding: '14px 18px', borderBottom: `1px solid ${C.border}`, display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
        <LevelBadge level={person.job_level} />
        <OfficeBadge office={person.office_id} />
        {person.department && (
          <span style={{ fontSize: '10px', fontWeight: 600, padding: '2px 7px', borderRadius: '6px', background: '#F0F4F8', color: C.muted }}>
            {person.department}
          </span>
        )}
      </div>

      {/* Reporting chain */}
      <div style={{ padding: '14px 18px', borderBottom: `1px solid ${C.border}` }}>
        <div style={{ fontSize: '10px', fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' }}>
          Reporting Chain
        </div>

        {chain.length === 0 && reports.length === 0 && (
          <div style={{ fontSize: '12px', color: C.muted }}>No reporting data</div>
        )}

        {/* Managers above */}
        {chain.map((m, i) => (
          <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', paddingLeft: i * 12 }}>
            <div style={{ width: '2px', height: i === 0 ? '0' : '12px', background: C.border, position: 'absolute', marginLeft: i * 12 + 9, marginTop: '-12px' }} />
            <Avatar name={m.name} level={m.job_level} size={24} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: C.text }}>{m.name}</div>
              <div style={{ fontSize: '10px', color: C.muted }}>{m.role ?? LEVEL_LABEL[m.job_level]}</div>
            </div>
            <LevelBadge level={m.job_level} />
          </div>
        ))}

        {/* Selected person */}
        {chain.length > 0 && (
          <div style={{ width: '2px', height: '12px', background: C.teal, marginLeft: chain.length * 12 + 9, marginBottom: '0' }} />
        )}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          paddingLeft: chain.length * 12,
          padding: '6px 10px',
          background: C.teal + '10',
          borderRadius: '8px',
          border: `1.5px solid ${C.teal}30`,
          marginTop: chain.length > 0 ? '0' : '0',
          marginBottom: reports.length > 0 ? '0' : '0',
        }}>
          <Avatar name={person.name} level={person.job_level} size={26} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '12px', fontWeight: 800, color: C.text }}>{person.name}</div>
            <div style={{ fontSize: '10px', color: C.muted }}>{person.role ?? LEVEL_LABEL[person.job_level]}</div>
          </div>
          {reports.length > 0 && (
            <span style={{ fontSize: '10px', fontWeight: 700, color: C.teal, background: C.teal + '15', padding: '2px 6px', borderRadius: '6px' }}>
              {reports.length} reports
            </span>
          )}
        </div>

        {/* Direct reports below */}
        {reports.length > 0 && (
          <div style={{ marginTop: '4px' }}>
            <div style={{ width: '2px', height: '12px', background: C.border, marginLeft: chain.length * 12 + 9 + 13 }} />
            <div style={{ paddingLeft: (chain.length + 1) * 12 + 4, display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {reports.map(r => (
                <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '5px 8px', borderRadius: '7px', background: '#FAFBFC', border: `1px solid ${C.border}` }}>
                  <Avatar name={r.name} level={r.job_level} size={22} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</div>
                    <div style={{ fontSize: '10px', color: C.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.role ?? LEVEL_LABEL[r.job_level]}</div>
                  </div>
                  <OfficeBadge office={r.office_id} />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Tool access */}
      <div style={{ padding: '14px 18px' }}>
        <div style={{ fontSize: '10px', fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' }}>
          Platform Access
        </div>
        {isAdmin ? (
          <div style={{ fontSize: '11px', color: C.teal, fontWeight: 600 }}>Super Admin — full access to all tools</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {PLATFORM_TOOLS.map(t => {
              const on = grants[t.key] === true
              const isSaving = saving === t.key
              return (
                <div key={t.key} style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  padding: '8px 10px', borderRadius: '8px',
                  background: on ? t.color + '08' : '#FAFBFC',
                  border: `1px solid ${on ? t.color + '30' : C.border}`,
                  transition: 'all 0.12s',
                }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: on ? t.color : C.border, flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: '12px', fontWeight: 600, color: on ? C.text : C.muted }}>{t.label}</span>
                  <button
                    onClick={() => toggle(t.key, on)}
                    disabled={isSaving}
                    style={{
                      width: '36px', height: '20px', borderRadius: '10px',
                      background: on ? t.color : C.border,
                      border: 'none', cursor: isSaving ? 'wait' : 'pointer',
                      position: 'relative', transition: 'background 0.15s', flexShrink: 0,
                      opacity: isSaving ? 0.6 : 1,
                    }}
                  >
                    <div style={{
                      width: '14px', height: '14px', borderRadius: '50%',
                      background: '#fff', position: 'absolute',
                      top: '3px', left: on ? '19px' : '3px',
                      transition: 'left 0.15s',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
                    }} />
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// DIRECTORY VIEW
// ═══════════════════════════════════════════════════════════════════════════════
function DirectoryView({
  staff, nameMap, selected, onSelect,
}: {
  staff: StaffRow[]
  nameMap: Map<string, string>
  selected: string | null
  onSelect: (s: StaffRow) => void
}) {
  const [search,       setSearch]       = useState('')
  const [officeFilter, setOfficeFilter] = useState('')
  const [levelFilter,  setLevelFilter]  = useState('')
  const [collapsed,    setCollapsed]    = useState<Set<string>>(new Set())

  const offices = useMemo(() => [...new Set(staff.map(s => s.office_id).filter(Boolean))] as string[], [staff])

  const filtered = useMemo(() => {
    let list = staff
    if (officeFilter) list = list.filter(s => s.office_id === officeFilter)
    if (levelFilter)  list = list.filter(s => s.job_level  === levelFilter)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(s =>
        s.name.toLowerCase().includes(q) ||
        (s.role ?? '').toLowerCase().includes(q) ||
        (s.department ?? '').toLowerCase().includes(q) ||
        s.email.toLowerCase().includes(q)
      )
    }
    return list
  }, [staff, officeFilter, levelFilter, search])

  const grouped = useMemo(() => {
    const map = new Map<string, StaffRow[]>()
    for (const s of filtered) {
      const dept = s.department ?? 'No Department'
      if (!map.has(dept)) map.set(dept, [])
      map.get(dept)!.push(s)
    }
    for (const rows of map.values()) {
      rows.sort((a, b) => (LEVEL_RANK[a.job_level] ?? 4) - (LEVEL_RANK[b.job_level] ?? 4) || a.name.localeCompare(b.name))
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [filtered])

  const reportCount = useMemo(() => {
    const c: Record<string, number> = {}
    for (const s of staff) { if (s.manager_id) c[s.manager_id] = (c[s.manager_id] ?? 0) + 1 }
    return c
  }, [staff])

  function toggleDept(dept: string) {
    setCollapsed(prev => { const n = new Set(prev); n.has(dept) ? n.delete(dept) : n.add(dept); return n })
  }

  return (
    <div style={{ flex: 1, minWidth: 0, overflowY: 'auto' }}>
      {/* Filters */}
      <div style={{ padding: '12px 20px', background: C.surface, borderBottom: `1px solid ${C.border}`, display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ position: 'relative' }}>
          <span style={{ position: 'absolute', left: '9px', top: '50%', transform: 'translateY(-50%)', color: C.muted, pointerEvents: 'none' }}>
            <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          </span>
          <input placeholder="Search name, role, dept…" value={search} onChange={e => setSearch(e.target.value)}
            style={{ padding: '6px 10px 6px 26px', borderRadius: '8px', border: `1px solid ${search ? C.teal : C.border}`, fontSize: '12px', fontFamily: 'inherit', outline: 'none', background: C.surface, color: C.text, width: '220px' }} />
        </div>
        <select value={officeFilter} onChange={e => setOfficeFilter(e.target.value)}
          style={{ padding: '6px 10px', borderRadius: '8px', border: `1px solid ${officeFilter ? C.teal : C.border}`, fontSize: '12px', fontFamily: 'inherit', outline: 'none', background: C.surface, color: C.text, cursor: 'pointer' }}>
          <option value="">All Offices</option>
          {offices.map(o => <option key={o} value={o}>{OFFICE_LABEL[o] ?? o}</option>)}
        </select>
        <select value={levelFilter} onChange={e => setLevelFilter(e.target.value)}
          style={{ padding: '6px 10px', borderRadius: '8px', border: `1px solid ${levelFilter ? C.teal : C.border}`, fontSize: '12px', fontFamily: 'inherit', outline: 'none', background: C.surface, color: C.text, cursor: 'pointer' }}>
          <option value="">All Levels</option>
          {Object.entries(LEVEL_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <span style={{ fontSize: '12px', color: C.muted, marginLeft: 'auto' }}>{filtered.length} / {staff.length} people</span>
      </div>

      {/* Table */}
      <div style={{ padding: '12px 20px 40px' }}>
        {grouped.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px', color: C.muted, fontSize: '13px' }}>No staff found</div>
        )}
        {grouped.map(([dept, rows]) => {
          const isCollapsed = collapsed.has(dept)
          return (
            <div key={dept} style={{ marginTop: '16px', border: `1px solid ${C.border}`, borderRadius: '10px', overflow: 'hidden', background: C.surface }}>
              <button onClick={() => toggleDept(dept)} style={{
                width: '100%', textAlign: 'left', padding: '10px 16px',
                background: '#F0F4F8', border: 'none', borderBottom: isCollapsed ? 'none' : `1px solid ${C.border}`,
                cursor: 'pointer', fontFamily: 'inherit',
                display: 'flex', alignItems: 'center', gap: '8px',
              }}>
                <svg width="11" height="11" fill="none" stroke={C.muted} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"
                  style={{ transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)', transition: 'transform 0.15s', flexShrink: 0 }}>
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
                <span style={{ fontSize: '12px', fontWeight: 800, color: C.text }}>{dept}</span>
                <span style={{ fontSize: '11px', color: C.muted }}>({rows.length})</span>
              </button>

              {!isCollapsed && (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#FAFBFC' }}>
                      <th style={thStyle}>Name</th>
                      <th style={thStyle}>Role</th>
                      <th style={thStyle}>Level</th>
                      <th style={thStyle}>Office</th>
                      <th style={thStyle}>Manager</th>
                      <th style={{ ...thStyle, textAlign: 'center' }}>Reports</th>
                      <th style={{ ...thStyle, textAlign: 'center' }}>Access</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((s, i) => {
                      const isSelected = selected === s.id
                      return (
                        <tr
                          key={s.id}
                          onClick={() => onSelect(s)}
                          style={{
                            borderTop: `1px solid ${C.border}`,
                            background: isSelected ? C.teal + '08' : i % 2 === 0 ? C.surface : '#FAFBFC',
                            cursor: 'pointer',
                            outline: isSelected ? `2px solid ${C.teal}40` : 'none',
                            outlineOffset: '-1px',
                            transition: 'background 0.1s',
                          }}
                        >
                          <td style={tdStyle}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
                              <Avatar name={s.name} level={s.job_level} size={26} />
                              <div>
                                <div style={{ fontSize: '12px', fontWeight: 700, color: C.text }}>{s.name}</div>
                                <div style={{ fontSize: '10px', color: C.muted }}>{s.email}</div>
                              </div>
                            </div>
                          </td>
                          <td style={tdStyle}><span style={{ fontSize: '11px', color: C.muted }}>{s.role ?? '—'}</span></td>
                          <td style={tdStyle}><LevelBadge level={s.job_level} /></td>
                          <td style={tdStyle}><OfficeBadge office={s.office_id} /></td>
                          <td style={tdStyle}><span style={{ fontSize: '11px', color: C.muted }}>{s.manager_id ? (nameMap.get(s.manager_id) ?? '—') : '—'}</span></td>
                          <td style={{ ...tdStyle, textAlign: 'center' }}>
                            {reportCount[s.id] ? (
                              <span style={{ fontSize: '11px', fontWeight: 700, color: C.teal }}>{reportCount[s.id]}</span>
                            ) : <span style={{ color: C.border }}>—</span>}
                          </td>
                          <td style={{ ...tdStyle, textAlign: 'center' }}>
                            <ToolDots s={s} />
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

const thStyle: React.CSSProperties = {
  fontSize: '10px', fontWeight: 700, color: C.muted, textAlign: 'left',
  padding: '7px 12px', textTransform: 'uppercase', letterSpacing: '0.5px',
  borderBottom: `1px solid ${C.border}`,
}
const tdStyle: React.CSSProperties = { padding: '8px 12px', verticalAlign: 'middle' }

// ═══════════════════════════════════════════════════════════════════════════════
// HIERARCHY VIEW
// ═══════════════════════════════════════════════════════════════════════════════
type HierNode = StaffRow & { children: HierNode[]; depth: number }

function buildHierarchy(staff: StaffRow[]): HierNode[] {
  const map = new Map<string, HierNode>()
  const ids = new Set(staff.map(s => s.id))
  for (const s of staff) map.set(s.id, { ...s, children: [], depth: 0 })
  const roots: HierNode[] = []
  for (const node of map.values()) {
    if (node.manager_id && ids.has(node.manager_id)) map.get(node.manager_id)!.children.push(node)
    else roots.push(node)
  }
  function sortAndDepth(nodes: HierNode[], depth: number) {
    nodes.sort((a, b) => (LEVEL_RANK[a.job_level] ?? 4) - (LEVEL_RANK[b.job_level] ?? 4) || a.name.localeCompare(b.name))
    for (const n of nodes) { n.depth = depth; sortAndDepth(n.children, depth + 1) }
  }
  sortAndDepth(roots, 0)
  return roots
}

function flattenVisible(nodes: HierNode[], expanded: Set<string>, result: HierNode[] = []): HierNode[] {
  for (const n of nodes) {
    result.push(n)
    if (expanded.has(n.id) && n.children.length > 0) flattenVisible(n.children, expanded, result)
  }
  return result
}

function HierarchyView({
  staff, selected, onSelect,
}: {
  staff: StaffRow[]
  selected: string | null
  onSelect: (s: StaffRow) => void
}) {
  const [search,       setSearch]       = useState('')
  const [officeFilter, setOfficeFilter] = useState('')
  const [expandedIds,  setExpandedIds]  = useState<Set<string>>(new Set())

  const roots = useMemo(() => buildHierarchy(staff), [staff])

  useEffect(() => {
    if (roots.length === 0) return
    const ids = new Set<string>()
    function collect(nodes: HierNode[], depth: number) {
      if (depth >= 2) return
      for (const n of nodes) { if (n.children.length) ids.add(n.id); collect(n.children, depth + 1) }
    }
    collect(roots, 0)
    setExpandedIds(ids)
  }, [roots.length])

  const reportCount = useMemo(() => {
    const c: Record<string, number> = {}
    for (const s of staff) { if (s.manager_id) c[s.manager_id] = (c[s.manager_id] ?? 0) + 1 }
    return c
  }, [staff])

  const matchIds = useMemo(() => {
    if (!search.trim() && !officeFilter) return null
    const ids = new Set<string>()
    for (const s of staff) {
      if (officeFilter && s.office_id !== officeFilter) continue
      if (search.trim()) {
        const q = search.toLowerCase()
        if (!s.name.toLowerCase().includes(q) && !(s.role ?? '').toLowerCase().includes(q) && !(s.department ?? '').toLowerCase().includes(q)) continue
      }
      ids.add(s.id)
    }
    return ids
  }, [search, officeFilter, staff])

  const offices = useMemo(() => [...new Set(staff.map(s => s.office_id).filter(Boolean))] as string[], [staff])

  function toggle(id: string) { setExpandedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n }) }
  function expandAll() {
    const ids = new Set<string>()
    function collect(nodes: HierNode[]) { for (const n of nodes) { if (n.children.length) ids.add(n.id); collect(n.children) } }
    collect(roots); setExpandedIds(ids)
  }
  function collapseAll() {
    const ids = new Set<string>()
    for (const r of roots) if (r.children.length) ids.add(r.id)
    setExpandedIds(ids)
  }

  const visible = useMemo(() => flattenVisible(roots, expandedIds), [roots, expandedIds])
  const displayed = useMemo(() => matchIds ? visible.filter(n => matchIds.has(n.id)) : visible, [visible, matchIds])

  const INDENT = 24

  return (
    <div style={{ flex: 1, minWidth: 0, overflowY: 'auto' }}>
      {/* Filters */}
      <div style={{ padding: '12px 20px', background: C.surface, borderBottom: `1px solid ${C.border}`, display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ position: 'relative' }}>
          <span style={{ position: 'absolute', left: '9px', top: '50%', transform: 'translateY(-50%)', color: C.muted, pointerEvents: 'none' }}>
            <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          </span>
          <input placeholder="Search name, role, dept…" value={search} onChange={e => setSearch(e.target.value)}
            style={{ padding: '6px 10px 6px 26px', borderRadius: '8px', border: `1px solid ${search ? C.teal : C.border}`, fontSize: '12px', fontFamily: 'inherit', outline: 'none', background: C.surface, color: C.text, width: '200px' }} />
        </div>
        <select value={officeFilter} onChange={e => setOfficeFilter(e.target.value)}
          style={{ padding: '6px 10px', borderRadius: '8px', border: `1px solid ${officeFilter ? C.teal : C.border}`, fontSize: '12px', fontFamily: 'inherit', outline: 'none', background: C.surface, color: C.text, cursor: 'pointer' }}>
          <option value="">All Offices</option>
          {offices.map(o => <option key={o} value={o}>{OFFICE_LABEL[o] ?? o}</option>)}
        </select>
        <button onClick={expandAll} style={{ padding: '5px 10px', borderRadius: '8px', border: `1px solid ${C.border}`, fontSize: '11px', fontWeight: 700, color: C.muted, background: C.surface, cursor: 'pointer', fontFamily: 'inherit' }}>Expand All</button>
        <button onClick={collapseAll} style={{ padding: '5px 10px', borderRadius: '8px', border: `1px solid ${C.border}`, fontSize: '11px', fontWeight: 700, color: C.muted, background: C.surface, cursor: 'pointer', fontFamily: 'inherit' }}>Collapse</button>
        <span style={{ fontSize: '12px', color: C.muted, marginLeft: 'auto' }}>{displayed.length} / {staff.length}</span>
      </div>

      {/* Rows */}
      <div style={{ padding: '8px 12px 40px' }}>
        {displayed.map(node => {
          const lc = LEVEL_COLOR[node.job_level] ?? C.muted
          const hasChildren = node.children.length > 0
          const isExpanded  = expandedIds.has(node.id)
          const isSelected  = selected === node.id
          const indent      = matchIds ? 0 : node.depth * INDENT

          return (
            <div
              key={node.id}
              onClick={() => onSelect(node)}
              style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                paddingTop: 5, paddingBottom: 5, paddingRight: 12,
                paddingLeft: indent + 4,
                borderRadius: '7px',
                background:   isSelected ? C.teal + '10' : 'transparent',
                borderLeft:   isSelected ? `2px solid ${C.teal}` : '2px solid transparent',
                marginBottom: '1px',
                cursor: 'pointer',
                transition: 'background 0.1s',
              }}
            >
              {/* Expand toggle */}
              <button onClick={e => { e.stopPropagation(); hasChildren && toggle(node.id) }} style={{
                width: '16px', height: '16px', flexShrink: 0,
                background: 'none', border: 'none', cursor: hasChildren ? 'pointer' : 'default',
                display: 'flex', alignItems: 'center', justifyContent: 'center', color: hasChildren ? C.muted : 'transparent', padding: 0,
              }}>
                {hasChildren && (
                  <svg width="9" height="9" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"
                    style={{ transform: isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.15s' }}>
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                )}
              </button>

              <Avatar name={node.name} level={node.job_level} size={28} />

              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: C.text }}>{node.name}</span>
                {node.role && <span style={{ fontSize: '11px', color: C.muted, marginLeft: '7px' }}>{node.role}</span>}
              </div>

              {node.department && <span style={{ fontSize: '10px', color: C.muted, flexShrink: 0 }}>{node.department}</span>}
              <LevelBadge level={node.job_level} />
              <OfficeBadge office={node.office_id} />

              {reportCount[node.id] ? (
                <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 6px', borderRadius: '6px', background: lc + '12', color: lc, whiteSpace: 'nowrap', flexShrink: 0 }}>
                  {reportCount[node.id]} reports
                </span>
              ) : null}

              <ToolDots s={node} />
            </div>
          )
        })}
        {displayed.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px', color: C.muted, fontSize: '13px' }}>No staff found</div>
        )}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════════
export default function OrgChartPage() {
  const [staff,    setStaff]    = useState<StaffRow[]>([])
  const [loading,  setLoading]  = useState(true)
  const [view,     setView]     = useState<'directory' | 'hierarchy'>('directory')
  const [selected, setSelected] = useState<StaffRow | null>(null)

  useEffect(() => {
    fetch('/api/staff-list')
      .then(r => r.json())
      .then(d => { if (Array.isArray(d)) setStaff(d); setLoading(false) })
  }, [])

  const nameMap    = useMemo(() => new Map(staff.map(s => [s.id, s.name])), [staff])
  const byLevel    = useMemo(() => { const c: Record<string,number> = {}; for (const s of staff) c[s.job_level] = (c[s.job_level] ?? 0) + 1; return c }, [staff])
  const offices    = useMemo(() => [...new Set(staff.map(s => s.office_id).filter(Boolean))] as string[], [staff])

  // When panel toggle is saved, update local staff state
  const handleGrantsChange = useCallback((id: string, key: string, value: boolean) => {
    setStaff(prev => prev.map(s => {
      if (s.id !== id) return s
      const newGrants = { ...(s.tool_grants ?? {}), [key]: value }
      return { ...s, tool_grants: newGrants, toolkit_access: key === 'smart_data' ? value : s.toolkit_access }
    }))
    setSelected(prev => {
      if (!prev || prev.id !== id) return prev
      const newGrants = { ...(prev.tool_grants ?? {}), [key]: value }
      return { ...prev, tool_grants: newGrants, toolkit_access: key === 'smart_data' ? value : prev.toolkit_access }
    })
  }, [])

  function handleSelect(s: StaffRow) {
    setSelected(prev => prev?.id === s.id ? null : s)
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui, sans-serif' }}>
        <div style={{ color: C.muted, fontSize: '14px' }}>Loading org chart…</div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: 'system-ui, sans-serif' }}>

      {/* ── Header ── */}
      <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, padding: '0 20px', position: 'sticky', top: 0, zIndex: 50 }}>
        <div style={{ display: 'flex', alignItems: 'center', height: '56px', gap: '10px' }}>
          <Link href="/admin" style={{ fontSize: '12px', color: C.muted, textDecoration: 'none', fontWeight: 600, flexShrink: 0, display: 'flex', alignItems: 'center', gap: '3px' }}>
            <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>
            Admin
          </Link>
          <div style={{ width: '1px', height: '18px', background: C.border }} />
          <span style={{ fontSize: '14px', fontWeight: 800, color: C.text, flexShrink: 0 }}>Org Chart</span>

          {/* Level pills */}
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginLeft: '4px', flexWrap: 'wrap' }}>
            {Object.entries(LEVEL_LABEL).map(([key, label]) => byLevel[key] ? (
              <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <div style={{ width: '6px', height: '6px', borderRadius: '2px', background: LEVEL_COLOR[key], flexShrink: 0 }} />
                <span style={{ fontSize: '11px', color: C.muted, fontWeight: 600 }}>
                  {label} <strong style={{ color: C.text }}>{byLevel[key]}</strong>
                </span>
              </div>
            ) : null)}
          </div>

          <div style={{ flex: 1 }} />

          {/* View toggle */}
          <div style={{ display: 'flex', gap: '2px', background: '#F0F4F8', borderRadius: '8px', padding: '3px' }}>
            {(['directory', 'hierarchy'] as const).map(v => (
              <button key={v} onClick={() => setView(v)} style={{
                padding: '4px 12px', borderRadius: '6px', border: 'none', cursor: 'pointer',
                fontSize: '11px', fontWeight: 700, fontFamily: 'inherit',
                background: view === v ? C.surface : 'transparent',
                color:      view === v ? C.text     : C.muted,
                boxShadow:  view === v ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              }}>
                {v === 'directory' ? 'Directory' : 'Hierarchy'}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '4px 10px', background: C.teal + '12', borderRadius: '8px' }}>
            <svg width="12" height="12" fill="none" stroke={C.teal} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
            <span style={{ fontSize: '11px', fontWeight: 800, color: C.teal }}>{staff.length} staff</span>
          </div>
        </div>
      </div>

      {/* ── Office bar ── */}
      {offices.length > 0 && (
        <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, padding: '6px 20px', display: 'flex', gap: '18px', alignItems: 'center' }}>
          {offices.map(o => {
            const count = staff.filter(s => s.office_id === o).length
            const oc = OFFICE_COLOR[o] ?? C.muted
            return (
              <div key={o} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <div style={{ width: '9px', height: '9px', borderRadius: '2px', background: oc }} />
                <span style={{ fontSize: '11px', fontWeight: 700, color: C.text }}>{OFFICE_LABEL[o] ?? o}</span>
                <span style={{ fontSize: '11px', color: C.muted }}>{count}</span>
              </div>
            )
          })}
          <span style={{ marginLeft: 'auto', fontSize: '10px', color: C.muted }}>Click any row to see reporting chain and manage tool access</span>
        </div>
      )}

      {/* ── Two-panel body ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start' }}>
        {view === 'directory'
          ? <DirectoryView  staff={staff} nameMap={nameMap} selected={selected?.id ?? null} onSelect={handleSelect} />
          : <HierarchyView  staff={staff}                   selected={selected?.id ?? null} onSelect={handleSelect} />
        }

        {selected && (
          <DetailPanel
            person={selected}
            allStaff={staff}
            onClose={() => setSelected(null)}
            onGrantsChange={handleGrantsChange}
          />
        )}
      </div>
    </div>
  )
}
