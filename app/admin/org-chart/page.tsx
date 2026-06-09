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
  red:     '#8B1A1A',
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

type StaffNode = {
  id: string
  name: string
  email: string
  role: string | null
  department: string | null
  office_id: string | null
  job_level: string
  manager_id: string | null
  children: StaffNode[]
  depth: number
}

function initials(name: string) {
  return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
}

function buildTree(staff: Omit<StaffNode, 'children' | 'depth'>[]): StaffNode[] {
  const map = new Map<string, StaffNode>()
  const ids = new Set(staff.map(s => s.id))

  for (const s of staff) {
    map.set(s.id, { ...s, children: [], depth: 0 })
  }

  const roots: StaffNode[] = []
  for (const node of map.values()) {
    if (node.manager_id && ids.has(node.manager_id)) {
      map.get(node.manager_id)!.children.push(node)
    } else {
      roots.push(node)
    }
  }

  // Sort each level: by job_level rank then name
  const RANK: Record<string, number> = { super_admin: 0, office_head: 1, dept_head: 2, team_lead: 3, staff: 4 }
  function sortAndDepth(nodes: StaffNode[], depth: number) {
    nodes.sort((a, b) => (RANK[a.job_level] ?? 4) - (RANK[b.job_level] ?? 4) || a.name.localeCompare(b.name))
    for (const n of nodes) {
      n.depth = depth
      sortAndDepth(n.children, depth + 1)
    }
  }
  sortAndDepth(roots, 0)
  return roots
}

// ── Person card ───────────────────────────────────────────────────────────────
function PersonCard({
  node, expanded, onToggle, highlighted, searchMatch,
}: {
  node: StaffNode
  expanded: boolean
  onToggle: () => void
  highlighted: boolean
  searchMatch: boolean
}) {
  const oc   = OFFICE_COLOR[node.office_id ?? ''] ?? C.muted
  const lc   = LEVEL_COLOR[node.job_level] ?? C.muted

  return (
    <div style={{
      background:   searchMatch ? '#FFF9E6' : C.surface,
      border:       `1.5px solid ${highlighted ? C.teal : searchMatch ? C.amber : C.border}`,
      borderLeft:   `4px solid ${lc}`,
      borderRadius: '12px',
      padding:      '12px 14px',
      width:        '200px',
      flexShrink:   0,
      boxShadow:    highlighted ? `0 0 0 3px ${C.teal}25` : '0 1px 4px rgba(0,0,0,0.06)',
      position:     'relative',
      transition:   'box-shadow 0.15s',
    }}>
      {/* Avatar + name */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '9px', marginBottom: '8px' }}>
        <div style={{
          width: '32px', height: '32px', borderRadius: '50%',
          background: lc + '20', color: lc,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '11px', fontWeight: 800, flexShrink: 0,
        }}>
          {initials(node.name)}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: '12px', fontWeight: 800, color: C.text, lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {node.name}
          </div>
          {node.role && (
            <div style={{ fontSize: '10px', color: C.muted, marginTop: '1px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {node.role}
            </div>
          )}
        </div>
      </div>

      {/* Badges */}
      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '9px', fontWeight: 700, padding: '2px 6px', borderRadius: '6px', background: lc + '15', color: lc, letterSpacing: '0.3px', textTransform: 'uppercase' }}>
          {LEVEL_LABEL[node.job_level] ?? node.job_level}
        </span>
        {node.office_id && (
          <span style={{ fontSize: '9px', fontWeight: 700, padding: '2px 6px', borderRadius: '6px', background: oc + '15', color: oc, letterSpacing: '0.3px' }}>
            {OFFICE_LABEL[node.office_id] ?? node.office_id}
          </span>
        )}
      </div>

      {/* Expand/collapse button */}
      {node.children.length > 0 && (
        <button onClick={onToggle} style={{
          position: 'absolute', bottom: '-12px', left: '50%', transform: 'translateX(-50%)',
          width: '22px', height: '22px', borderRadius: '50%',
          border: `1.5px solid ${C.border}`, background: C.surface,
          color: C.muted, fontSize: '10px', fontWeight: 800,
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 2, boxShadow: '0 1px 4px rgba(0,0,0,0.1)',
        }}>
          {expanded ? (
            <svg width="9" height="9" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" viewBox="0 0 24 24"><polyline points="18 15 12 9 6 15"/></svg>
          ) : (
            <svg width="9" height="9" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" viewBox="0 0 24 24">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
          )}
          {!expanded && node.children.length > 0 && (
            <span style={{ position: 'absolute', top: '-6px', right: '-6px', width: '14px', height: '14px', borderRadius: '50%', background: lc, color: '#fff', fontSize: '8px', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {node.children.length}
            </span>
          )}
        </button>
      )}
    </div>
  )
}

// ── Tree node (recursive) ─────────────────────────────────────────────────────
function TreeNode({
  node, expandedIds, toggleExpand, highlightId, matchIds,
}: {
  node: StaffNode
  expandedIds: Set<string>
  toggleExpand: (id: string) => void
  highlightId: string | null
  matchIds: Set<string>
}) {
  const isExpanded = expandedIds.has(node.id)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0 }}>
      <PersonCard
        node={node}
        expanded={isExpanded}
        onToggle={() => toggleExpand(node.id)}
        highlighted={node.id === highlightId}
        searchMatch={matchIds.has(node.id)}
      />

      {isExpanded && node.children.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
          {/* Vertical line down from parent */}
          <div style={{ width: '2px', height: '24px', background: C.border }} />

          {/* Horizontal line spanning children */}
          <div style={{ position: 'relative', display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
            {node.children.length > 1 && (
              <div style={{
                position: 'absolute', top: 0, left: '108px', right: '108px',
                height: '2px', background: C.border,
              }} />
            )}
            {node.children.map(child => (
              <div key={child.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                {/* Vertical line to child */}
                <div style={{ width: '2px', height: '20px', background: C.border }} />
                <TreeNode
                  node={child}
                  expandedIds={expandedIds}
                  toggleExpand={toggleExpand}
                  highlightId={highlightId}
                  matchIds={matchIds}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function OrgChartPage() {
  const [staff,      setStaff]      = useState<Omit<StaffNode, 'children' | 'depth'>[]>([])
  const [loading,    setLoading]    = useState(true)
  const [search,     setSearch]     = useState('')
  const [officeFilter, setOfficeFilter] = useState('')
  const [expandedIds, setExpandedIds]  = useState<Set<string>>(new Set())
  const [highlightId, setHighlightId]  = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/staff-list')
      .then(r => r.json())
      .then(d => {
        if (Array.isArray(d)) setStaff(d)
        setLoading(false)
      })
  }, [])

  // Build tree
  const filteredStaff = useMemo(() => {
    if (!officeFilter) return staff
    return staff.filter(s => s.office_id === officeFilter)
  }, [staff, officeFilter])

  const roots = useMemo(() => buildTree(filteredStaff), [filteredStaff])

  // Auto-expand top 2 levels on load
  useEffect(() => {
    if (roots.length === 0) return
    const ids = new Set<string>()
    function collect(nodes: StaffNode[], depth: number) {
      if (depth >= 2) return
      for (const n of nodes) {
        if (n.children.length > 0) ids.add(n.id)
        collect(n.children, depth + 1)
      }
    }
    collect(roots, 0)
    setExpandedIds(ids)
  }, [roots.length])

  // Search matching
  const matchIds = useMemo(() => {
    if (!search.trim()) return new Set<string>()
    const q = search.toLowerCase()
    const ids = new Set<string>()
    for (const s of staff) {
      if (
        s.name.toLowerCase().includes(q) ||
        (s.role ?? '').toLowerCase().includes(q) ||
        (s.department ?? '').toLowerCase().includes(q) ||
        s.email.toLowerCase().includes(q)
      ) ids.add(s.id)
    }
    return ids
  }, [search, staff])

  // When search has exactly one result, highlight + expand its ancestors
  useEffect(() => {
    if (matchIds.size === 1) {
      const id = [...matchIds][0]
      setHighlightId(id)
      // Expand all ancestors
      const parentMap = new Map(staff.map(s => [s.id, s.manager_id]))
      const toExpand = new Set<string>()
      let cur = parentMap.get(id)
      while (cur) {
        toExpand.add(cur)
        cur = parentMap.get(cur) ?? null
      }
      setExpandedIds(prev => new Set([...prev, ...toExpand]))
    } else {
      setHighlightId(null)
    }
  }, [matchIds])

  function toggleExpand(id: string) {
    setExpandedIds(prev => {
      const n = new Set(prev)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }

  function expandAll() {
    const ids = new Set<string>()
    function collect(nodes: StaffNode[]) {
      for (const n of nodes) { if (n.children.length) ids.add(n.id); collect(n.children) }
    }
    collect(roots)
    setExpandedIds(ids)
  }

  function collapseAll() {
    // Keep only level 0 expanded
    const ids = new Set<string>()
    for (const r of roots) if (r.children.length) ids.add(r.id)
    setExpandedIds(ids)
  }

  // Stats
  const byLevel = useMemo(() => {
    const c: Record<string, number> = {}
    for (const s of staff) c[s.job_level] = (c[s.job_level] ?? 0) + 1
    return c
  }, [staff])

  const offices = useMemo(() =>
    [...new Set(staff.map(s => s.office_id).filter(Boolean))] as string[]
  , [staff])

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui, sans-serif' }}>
        <div style={{ color: C.muted, fontSize: '14px' }}>Building org chart…</div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: 'system-ui, sans-serif' }}>

      {/* ── Header ── */}
      <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, padding: '0 32px', position: 'sticky', top: 0, zIndex: 50 }}>
        <div style={{ maxWidth: '100%', display: 'flex', alignItems: 'center', height: '60px', gap: '12px' }}>
          <Link href="/admin" style={{ fontSize: '13px', color: C.muted, textDecoration: 'none', fontWeight: 600, flexShrink: 0 }}>← Admin</Link>
          <div style={{ width: '1px', height: '20px', background: C.border }} />
          <span style={{ fontSize: '15px', fontWeight: 800, color: C.text, flexShrink: 0 }}>Org Chart</span>
          <div style={{ width: '1px', height: '20px', background: C.border }} />

          {/* Level legend */}
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            {Object.entries(LEVEL_LABEL).map(([key, label]) => byLevel[key] ? (
              <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '2px', background: LEVEL_COLOR[key] }} />
                <span style={{ fontSize: '11px', color: C.muted, fontWeight: 600 }}>{label} <span style={{ color: C.text, fontWeight: 800 }}>{byLevel[key]}</span></span>
              </div>
            ) : null)}
          </div>

          <div style={{ flex: 1 }} />

          {/* Search */}
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: '9px', top: '50%', transform: 'translateY(-50%)', color: C.muted, pointerEvents: 'none' }}>
              <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            </span>
            <input
              placeholder="Search name, role, dept…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ padding: '7px 10px 7px 26px', borderRadius: '8px', border: `1px solid ${search ? C.teal : C.border}`, fontSize: '12px', fontFamily: 'inherit', outline: 'none', background: C.surface, color: C.text, width: '200px' }}
            />
            {search && (
              <span style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', fontSize: '10px', fontWeight: 700, color: matchIds.size > 0 ? C.teal : C.red }}>
                {matchIds.size}
              </span>
            )}
          </div>

          {/* Office filter */}
          <select value={officeFilter} onChange={e => setOfficeFilter(e.target.value)}
            style={{ padding: '7px 10px', borderRadius: '8px', border: `1px solid ${officeFilter ? C.teal : C.border}`, fontSize: '12px', fontFamily: 'inherit', outline: 'none', background: C.surface, color: C.text, cursor: 'pointer' }}>
            <option value="">All Offices</option>
            {offices.map(o => <option key={o} value={o}>{OFFICE_LABEL[o] ?? o}</option>)}
          </select>

          {/* Expand / collapse */}
          <button onClick={expandAll} style={{ padding: '7px 12px', borderRadius: '8px', border: `1px solid ${C.border}`, fontSize: '11px', fontWeight: 700, color: C.muted, background: C.surface, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>
            Expand All
          </button>
          <button onClick={collapseAll} style={{ padding: '7px 12px', borderRadius: '8px', border: `1px solid ${C.border}`, fontSize: '11px', fontWeight: 700, color: C.muted, background: C.surface, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>
            Collapse
          </button>
        </div>
      </div>

      {/* ── Tree canvas ── */}
      <div style={{ padding: '40px 32px', overflowX: 'auto', overflowY: 'auto' }}>
        {roots.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px', color: C.muted }}>No staff found</div>
        ) : (
          <div style={{ display: 'flex', gap: '40px', alignItems: 'flex-start', width: 'max-content', paddingBottom: '40px' }}>
            {roots.map(root => (
              <TreeNode
                key={root.id}
                node={root}
                expandedIds={expandedIds}
                toggleExpand={toggleExpand}
                highlightId={highlightId}
                matchIds={matchIds}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Stats footer ── */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: C.surface, borderTop: `1px solid ${C.border}`, padding: '10px 32px', display: 'flex', gap: '24px', alignItems: 'center' }}>
        <span style={{ fontSize: '12px', color: C.muted }}>{staff.length} staff total</span>
        {offices.map(o => {
          const count = staff.filter(s => s.office_id === o).length
          const oc = OFFICE_COLOR[o] ?? C.muted
          return (
            <span key={o} style={{ fontSize: '12px', fontWeight: 700 }}>
              <span style={{ color: oc }}>{OFFICE_LABEL[o]}</span>
              <span style={{ color: C.muted }}> {count}</span>
            </span>
          )
        })}
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: '11px', color: C.border }}>Click the + button on any card to expand their reports</span>
      </div>
    </div>
  )
}
