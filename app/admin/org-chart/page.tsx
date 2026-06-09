'use client'

import { useState, useEffect, useMemo } from 'react'
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

type StaffRow = {
  id: string
  name: string
  email: string
  role: string | null
  department: string | null
  office_id: string | null
  job_level: string
  manager_id: string | null
}

function initials(name: string) {
  return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
}

// ── Avatar pill ───────────────────────────────────────────────────────────────
function Avatar({ name, level, size = 32 }: { name: string; level: string; size?: number }) {
  const lc = LEVEL_COLOR[level] ?? C.muted
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: lc + '20', color: lc, flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.34, fontWeight: 800,
    }}>
      {initials(name)}
    </div>
  )
}

// ── Level badge ───────────────────────────────────────────────────────────────
function LevelBadge({ level }: { level: string }) {
  const lc = LEVEL_COLOR[level] ?? C.muted
  return (
    <span style={{
      fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: '6px',
      background: lc + '15', color: lc, whiteSpace: 'nowrap', letterSpacing: '0.3px',
      textTransform: 'uppercase',
    }}>
      {LEVEL_LABEL[level] ?? level}
    </span>
  )
}

// ── Office badge ──────────────────────────────────────────────────────────────
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

// ═══════════════════════════════════════════════════════════════════════════════
// DIRECTORY VIEW — grouped table
// ═══════════════════════════════════════════════════════════════════════════════
function DirectoryView({ staff, nameMap }: { staff: StaffRow[]; nameMap: Map<string, string> }) {
  const [search,       setSearch]       = useState('')
  const [officeFilter, setOfficeFilter] = useState('')
  const [levelFilter,  setLevelFilter]  = useState('')
  const [collapsed,    setCollapsed]    = useState<Set<string>>(new Set())

  const offices = useMemo(() => [...new Set(staff.map(s => s.office_id).filter(Boolean))] as string[], [staff])

  const filtered = useMemo(() => {
    let list = staff
    if (officeFilter) list = list.filter(s => s.office_id === officeFilter)
    if (levelFilter)  list = list.filter(s => s.job_level === levelFilter)
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

  // Group by department
  const grouped = useMemo(() => {
    const map = new Map<string, StaffRow[]>()
    for (const s of filtered) {
      const dept = s.department ?? 'No Department'
      if (!map.has(dept)) map.set(dept, [])
      map.get(dept)!.push(s)
    }
    // Sort each group by level rank then name
    for (const rows of map.values()) {
      rows.sort((a, b) => (LEVEL_RANK[a.job_level] ?? 4) - (LEVEL_RANK[b.job_level] ?? 4) || a.name.localeCompare(b.name))
    }
    // Sort departments alphabetically
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [filtered])

  function toggleDept(dept: string) {
    setCollapsed(prev => {
      const n = new Set(prev)
      n.has(dept) ? n.delete(dept) : n.add(dept)
      return n
    })
  }

  const reportCount = useMemo(() => {
    const c: Record<string, number> = {}
    for (const s of staff) {
      if (s.manager_id) c[s.manager_id] = (c[s.manager_id] ?? 0) + 1
    }
    return c
  }, [staff])

  return (
    <div>
      {/* Filters */}
      <div style={{ padding: '14px 24px', background: C.surface, borderBottom: `1px solid ${C.border}`, display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative' }}>
          <span style={{ position: 'absolute', left: '9px', top: '50%', transform: 'translateY(-50%)', color: C.muted, pointerEvents: 'none' }}>
            <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          </span>
          <input
            placeholder="Search name, role, dept, email…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ padding: '7px 10px 7px 28px', borderRadius: '8px', border: `1px solid ${search ? C.teal : C.border}`, fontSize: '12px', fontFamily: 'inherit', outline: 'none', background: C.surface, color: C.text, width: '240px' }}
          />
        </div>
        <select value={officeFilter} onChange={e => setOfficeFilter(e.target.value)}
          style={{ padding: '7px 10px', borderRadius: '8px', border: `1px solid ${officeFilter ? C.teal : C.border}`, fontSize: '12px', fontFamily: 'inherit', outline: 'none', background: C.surface, color: C.text, cursor: 'pointer' }}>
          <option value="">All Offices</option>
          {offices.map(o => <option key={o} value={o}>{OFFICE_LABEL[o] ?? o}</option>)}
        </select>
        <select value={levelFilter} onChange={e => setLevelFilter(e.target.value)}
          style={{ padding: '7px 10px', borderRadius: '8px', border: `1px solid ${levelFilter ? C.teal : C.border}`, fontSize: '12px', fontFamily: 'inherit', outline: 'none', background: C.surface, color: C.text, cursor: 'pointer' }}>
          <option value="">All Levels</option>
          {Object.entries(LEVEL_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <span style={{ fontSize: '12px', color: C.muted, marginLeft: 'auto' }}>
          {filtered.length} of {staff.length} people
        </span>
      </div>

      {/* Table */}
      <div style={{ padding: '0 24px 80px' }}>
        {grouped.length === 0 && (
          <div style={{ textAlign: 'center', padding: '80px', color: C.muted, fontSize: '14px' }}>No staff found</div>
        )}
        {grouped.map(([dept, rows]) => {
          const isCollapsed = collapsed.has(dept)
          return (
            <div key={dept} style={{ marginTop: '20px', border: `1px solid ${C.border}`, borderRadius: '12px', overflow: 'hidden', background: C.surface }}>
              {/* Dept header */}
              <button
                onClick={() => toggleDept(dept)}
                style={{
                  width: '100%', textAlign: 'left', padding: '12px 18px',
                  background: '#F0F4F8', border: 'none', borderBottom: isCollapsed ? 'none' : `1px solid ${C.border}`,
                  cursor: 'pointer', fontFamily: 'inherit',
                  display: 'flex', alignItems: 'center', gap: '10px',
                }}>
                <svg width="12" height="12" fill="none" stroke={C.muted} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"
                  style={{ transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)', transition: 'transform 0.15s', flexShrink: 0 }}>
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
                <span style={{ fontSize: '13px', fontWeight: 800, color: C.text }}>{dept}</span>
                <span style={{ fontSize: '11px', fontWeight: 600, color: C.muted, marginLeft: '2px' }}>({rows.length})</span>
              </button>

              {!isCollapsed && (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#FAFBFC' }}>
                      <th style={thStyle}>Name</th>
                      <th style={thStyle}>Role / Title</th>
                      <th style={thStyle}>Level</th>
                      <th style={thStyle}>Office</th>
                      <th style={thStyle}>Manager</th>
                      <th style={{ ...thStyle, textAlign: 'center' }}>Reports</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((s, i) => (
                      <tr key={s.id} style={{ borderTop: `1px solid ${C.border}`, background: i % 2 === 0 ? C.surface : '#FAFBFC' }}>
                        <td style={tdStyle}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <Avatar name={s.name} level={s.job_level} size={28} />
                            <div>
                              <div style={{ fontSize: '13px', fontWeight: 700, color: C.text }}>{s.name}</div>
                              <div style={{ fontSize: '11px', color: C.muted }}>{s.email}</div>
                            </div>
                          </div>
                        </td>
                        <td style={tdStyle}>
                          <span style={{ fontSize: '12px', color: C.muted }}>{s.role ?? '—'}</span>
                        </td>
                        <td style={tdStyle}><LevelBadge level={s.job_level} /></td>
                        <td style={tdStyle}><OfficeBadge office={s.office_id} /></td>
                        <td style={tdStyle}>
                          <span style={{ fontSize: '12px', color: C.muted }}>{s.manager_id ? (nameMap.get(s.manager_id) ?? '—') : '—'}</span>
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'center' }}>
                          {reportCount[s.id] ? (
                            <span style={{ fontSize: '12px', fontWeight: 700, color: C.teal }}>{reportCount[s.id]}</span>
                          ) : (
                            <span style={{ fontSize: '12px', color: C.border }}>—</span>
                          )}
                        </td>
                      </tr>
                    ))}
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
  fontSize: '11px', fontWeight: 700, color: C.muted, textAlign: 'left',
  padding: '8px 14px', textTransform: 'uppercase', letterSpacing: '0.5px',
  borderBottom: `1px solid ${C.border}`,
}
const tdStyle: React.CSSProperties = {
  padding: '10px 14px', verticalAlign: 'middle',
}

// ═══════════════════════════════════════════════════════════════════════════════
// HIERARCHY VIEW — vertical indented list
// ═══════════════════════════════════════════════════════════════════════════════
type HierNode = StaffRow & { children: HierNode[]; depth: number }

function buildHierarchy(staff: StaffRow[]): HierNode[] {
  const map = new Map<string, HierNode>()
  const ids = new Set(staff.map(s => s.id))

  for (const s of staff) map.set(s.id, { ...s, children: [], depth: 0 })

  const roots: HierNode[] = []
  for (const node of map.values()) {
    if (node.manager_id && ids.has(node.manager_id)) {
      map.get(node.manager_id)!.children.push(node)
    } else {
      roots.push(node)
    }
  }

  function sortAndDepth(nodes: HierNode[], depth: number) {
    nodes.sort((a, b) => (LEVEL_RANK[a.job_level] ?? 4) - (LEVEL_RANK[b.job_level] ?? 4) || a.name.localeCompare(b.name))
    for (const n of nodes) {
      n.depth = depth
      sortAndDepth(n.children, depth + 1)
    }
  }
  sortAndDepth(roots, 0)
  return roots
}

function flattenVisible(nodes: HierNode[], expanded: Set<string>, result: HierNode[] = []): HierNode[] {
  for (const n of nodes) {
    result.push(n)
    if (expanded.has(n.id) && n.children.length > 0) {
      flattenVisible(n.children, expanded, result)
    }
  }
  return result
}

function HierarchyView({ staff }: { staff: StaffRow[] }) {
  const [search,       setSearch]       = useState('')
  const [officeFilter, setOfficeFilter] = useState('')
  const [expandedIds,  setExpandedIds]  = useState<Set<string>>(new Set())

  const roots = useMemo(() => buildHierarchy(staff), [staff])

  // Auto-expand top 2 levels on load
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
    for (const s of staff) {
      if (s.manager_id) c[s.manager_id] = (c[s.manager_id] ?? 0) + 1
    }
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

  function toggle(id: string) {
    setExpandedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
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

  const displayed = useMemo(() => {
    if (!matchIds) return visible
    return visible.filter(n => matchIds.has(n.id))
  }, [visible, matchIds])

  const INDENT = 28

  return (
    <div>
      {/* Filters */}
      <div style={{ padding: '14px 24px', background: C.surface, borderBottom: `1px solid ${C.border}`, display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative' }}>
          <span style={{ position: 'absolute', left: '9px', top: '50%', transform: 'translateY(-50%)', color: C.muted, pointerEvents: 'none' }}>
            <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          </span>
          <input
            placeholder="Search name, role, dept…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ padding: '7px 10px 7px 28px', borderRadius: '8px', border: `1px solid ${search ? C.teal : C.border}`, fontSize: '12px', fontFamily: 'inherit', outline: 'none', background: C.surface, color: C.text, width: '220px' }}
          />
        </div>
        <select value={officeFilter} onChange={e => setOfficeFilter(e.target.value)}
          style={{ padding: '7px 10px', borderRadius: '8px', border: `1px solid ${officeFilter ? C.teal : C.border}`, fontSize: '12px', fontFamily: 'inherit', outline: 'none', background: C.surface, color: C.text, cursor: 'pointer' }}>
          <option value="">All Offices</option>
          {offices.map(o => <option key={o} value={o}>{OFFICE_LABEL[o] ?? o}</option>)}
        </select>
        <button onClick={expandAll} style={{ padding: '6px 12px', borderRadius: '8px', border: `1px solid ${C.border}`, fontSize: '11px', fontWeight: 700, color: C.muted, background: C.surface, cursor: 'pointer', fontFamily: 'inherit' }}>
          Expand All
        </button>
        <button onClick={collapseAll} style={{ padding: '6px 12px', borderRadius: '8px', border: `1px solid ${C.border}`, fontSize: '11px', fontWeight: 700, color: C.muted, background: C.surface, cursor: 'pointer', fontFamily: 'inherit' }}>
          Collapse
        </button>
        <span style={{ fontSize: '12px', color: C.muted, marginLeft: 'auto' }}>
          {displayed.length} of {staff.length} people
        </span>
      </div>

      {/* Hierarchy rows */}
      <div style={{ padding: '12px 24px 80px' }}>
        {displayed.map(node => {
          const lc = LEVEL_COLOR[node.job_level] ?? C.muted
          const hasChildren = node.children.length > 0
          const isExpanded  = expandedIds.has(node.id)
          const isMatch     = matchIds ? matchIds.has(node.id) : false
          const indent      = matchIds ? 0 : node.depth * INDENT

          return (
            <div
              key={node.id}
              style={{
                display:       'flex',
                alignItems:    'center',
                gap:           '10px',
                paddingLeft:   indent + 4,
                paddingTop:    6,
                paddingBottom: 6,
                paddingRight:  12,
                borderRadius:  '8px',
                background:    isMatch ? '#FFF9E6' : 'transparent',
                borderLeft:    isMatch ? `3px solid ${C.amber}` : `3px solid transparent`,
                marginBottom:  '1px',
                transition:    'background 0.1s',
              }}
            >
              {/* Expand toggle */}
              <button
                onClick={() => hasChildren && toggle(node.id)}
                style={{
                  width: '18px', height: '18px', flexShrink: 0,
                  background: 'none', border: 'none', cursor: hasChildren ? 'pointer' : 'default',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: hasChildren ? C.muted : 'transparent', padding: 0,
                }}
              >
                {hasChildren && (
                  <svg width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"
                    style={{ transform: isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.15s' }}>
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                )}
              </button>

              {/* Left rule line (depth indicator) */}
              {!matchIds && node.depth > 0 && (
                <div style={{ position: 'absolute', left: indent - 4, top: 0, bottom: 0, width: '2px', background: C.border, borderRadius: '1px', marginLeft: 4 }} />
              )}

              {/* Avatar */}
              <Avatar name={node.name} level={node.job_level} size={30} />

              {/* Name + role */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: '13px', fontWeight: 700, color: C.text }}>{node.name}</span>
                {node.role && <span style={{ fontSize: '11px', color: C.muted, marginLeft: '8px' }}>{node.role}</span>}
              </div>

              {/* Dept */}
              {node.department && (
                <span style={{ fontSize: '11px', color: C.muted, minWidth: '90px' }}>{node.department}</span>
              )}

              {/* Level badge */}
              <LevelBadge level={node.job_level} />

              {/* Office badge */}
              <OfficeBadge office={node.office_id} />

              {/* Reports count */}
              {reportCount[node.id] ? (
                <span style={{
                  fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: '6px',
                  background: lc + '12', color: lc, whiteSpace: 'nowrap',
                }}>
                  {reportCount[node.id]} {reportCount[node.id] === 1 ? 'report' : 'reports'}
                </span>
              ) : null}
            </div>
          )
        })}
        {displayed.length === 0 && (
          <div style={{ textAlign: 'center', padding: '80px', color: C.muted, fontSize: '14px' }}>No staff found</div>
        )}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════════
export default function OrgChartPage() {
  const [staff,   setStaff]   = useState<StaffRow[]>([])
  const [loading, setLoading] = useState(true)
  const [view,    setView]    = useState<'directory' | 'hierarchy'>('directory')

  useEffect(() => {
    fetch('/api/staff-list')
      .then(r => r.json())
      .then(d => { if (Array.isArray(d)) setStaff(d); setLoading(false) })
  }, [])

  const nameMap = useMemo(() => new Map(staff.map(s => [s.id, s.name])), [staff])

  const byLevel = useMemo(() => {
    const c: Record<string, number> = {}
    for (const s of staff) c[s.job_level] = (c[s.job_level] ?? 0) + 1
    return c
  }, [staff])

  const offices = useMemo(() => [...new Set(staff.map(s => s.office_id).filter(Boolean))] as string[], [staff])

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
      <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, padding: '0 24px', position: 'sticky', top: 0, zIndex: 50 }}>
        <div style={{ display: 'flex', alignItems: 'center', height: '56px', gap: '12px' }}>
          <Link href="/admin" style={{ fontSize: '13px', color: C.muted, textDecoration: 'none', fontWeight: 600, flexShrink: 0, display: 'flex', alignItems: 'center', gap: '4px' }}>
            <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>
            Admin
          </Link>
          <div style={{ width: '1px', height: '20px', background: C.border }} />
          <span style={{ fontSize: '15px', fontWeight: 800, color: C.text, flexShrink: 0 }}>Org Chart</span>

          {/* Level stat pills */}
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginLeft: '4px', flexWrap: 'wrap' }}>
            {Object.entries(LEVEL_LABEL).map(([key, label]) => byLevel[key] ? (
              <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <div style={{ width: '7px', height: '7px', borderRadius: '2px', background: LEVEL_COLOR[key], flexShrink: 0 }} />
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
                padding: '5px 14px', borderRadius: '6px', border: 'none', cursor: 'pointer',
                fontSize: '12px', fontWeight: 700, fontFamily: 'inherit',
                background: view === v ? C.surface : 'transparent',
                color:      view === v ? C.text     : C.muted,
                boxShadow:  view === v ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                transition: 'all 0.12s',
              }}>
                {v === 'directory' ? 'Directory' : 'Hierarchy'}
              </button>
            ))}
          </div>

          {/* Total badge */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '5px 12px', background: C.teal + '12', borderRadius: '8px' }}>
            <svg width="13" height="13" fill="none" stroke={C.teal} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
            <span style={{ fontSize: '12px', fontWeight: 800, color: C.teal }}>{staff.length} staff</span>
          </div>
        </div>
      </div>

      {/* ── Office summary bar ── */}
      {offices.length > 0 && (
        <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, padding: '8px 24px', display: 'flex', gap: '20px', alignItems: 'center' }}>
          {offices.map(o => {
            const count = staff.filter(s => s.office_id === o).length
            const oc = OFFICE_COLOR[o] ?? C.muted
            return (
              <div key={o} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div style={{ width: '10px', height: '10px', borderRadius: '3px', background: oc }} />
                <span style={{ fontSize: '12px', fontWeight: 700, color: C.text }}>{OFFICE_LABEL[o] ?? o}</span>
                <span style={{ fontSize: '12px', color: C.muted }}>{count} people</span>
              </div>
            )
          })}
        </div>
      )}

      {/* ── View content ── */}
      {view === 'directory'
        ? <DirectoryView staff={staff} nameMap={nameMap} />
        : <HierarchyView staff={staff} />
      }
    </div>
  )
}
