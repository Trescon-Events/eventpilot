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

const LEVEL_COLOR: Record<string, string> = {
  super_admin: '#7C3AED', office_head: '#DC2626',
  dept_head: '#D97706', team_lead: '#1565C0', staff: '#5B7080',
}
const LEVEL_LABEL: Record<string, string> = {
  super_admin: 'Super Admin', office_head: 'Office Head',
  dept_head: 'Dept Head', team_lead: 'Team Lead', staff: 'Staff',
}
const LEVEL_RANK: Record<string, number> = {
  super_admin: 0, office_head: 1, dept_head: 2, team_lead: 3, staff: 4,
}
const OFFICE_COLOR: Record<string, string> = {
  dubai: C.blue, bangalore: C.purple, mangalore: C.teal, manipal: C.amber,
}
const OFFICE_LABEL: Record<string, string> = {
  dubai: 'Dubai', bangalore: 'Bangalore', mangalore: 'Mangalore', manipal: 'Manipal',
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
  access_enabled: boolean
  profile_complete: boolean
  joined_at: string | null
}

function initials(name: string) {
  return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
}

export default function StaffDirectoryPage() {
  const [staff,        setStaff]        = useState<StaffRow[]>([])
  const [loading,      setLoading]      = useState(true)
  const [search,       setSearch]       = useState('')
  const [deptFilter,   setDeptFilter]   = useState('')
  const [officeFilter, setOfficeFilter] = useState('')
  const [levelFilter,  setLevelFilter]  = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  useEffect(() => {
    fetch('/api/staff-list')
      .then(r => r.json())
      .then(d => { if (Array.isArray(d)) setStaff(d); setLoading(false) })
  }, [])

  const nameMap = useMemo(() => new Map(staff.map(s => [s.id, s.name])), [staff])

  const departments = useMemo(() =>
    [...new Set(staff.map(s => s.department).filter(Boolean))].sort() as string[]
  , [staff])

  const offices = useMemo(() =>
    [...new Set(staff.map(s => s.office_id).filter(Boolean))] as string[]
  , [staff])

  const filtered = useMemo(() => {
    let list = staff
    if (deptFilter)   list = list.filter(s => s.department  === deptFilter)
    if (officeFilter) list = list.filter(s => s.office_id   === officeFilter)
    if (levelFilter)  list = list.filter(s => s.job_level   === levelFilter)
    if (statusFilter === 'active')   list = list.filter(s =>  s.access_enabled)
    if (statusFilter === 'inactive') list = list.filter(s => !s.access_enabled)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(s =>
        s.name.toLowerCase().includes(q) ||
        s.email.toLowerCase().includes(q) ||
        (s.role ?? '').toLowerCase().includes(q) ||
        (s.department ?? '').toLowerCase().includes(q)
      )
    }
    return [...list].sort((a, b) =>
      (LEVEL_RANK[a.job_level] ?? 4) - (LEVEL_RANK[b.job_level] ?? 4) || a.name.localeCompare(b.name)
    )
  }, [staff, search, deptFilter, officeFilter, levelFilter, statusFilter])

  const stats = useMemo(() => ({
    total:    staff.length,
    active:   staff.filter(s => s.access_enabled).length,
    inactive: staff.filter(s => !s.access_enabled).length,
    noProfile: staff.filter(s => s.access_enabled && !s.profile_complete).length,
  }), [staff])

  return (
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: 'system-ui, sans-serif' }}>

      {/* Header */}
      <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, padding: '0 28px', position: 'sticky', top: 0, zIndex: 50 }}>
        <div style={{ display: 'flex', alignItems: 'center', height: '56px', gap: '10px' }}>
          <Link href="/hr" style={{ fontSize: '12px', color: C.muted, textDecoration: 'none', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '3px' }}>
            <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>
            HR Portal
          </Link>
          <div style={{ width: '1px', height: '18px', background: C.border }} />
          <span style={{ fontSize: '14px', fontWeight: 800, color: C.text }}>Staff Directory</span>
          <div style={{ flex: 1 }} />
          <Link href="/hr/staff/new" style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px',
            padding: '8px 16px', borderRadius: '8px', background: C.teal, color: '#fff',
            textDecoration: 'none', fontSize: '13px', fontWeight: 700,
          }}>
            <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Add New Staff
          </Link>
        </div>
      </div>

      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px 24px 60px' }}>

        {/* Stats bar */}
        {!loading && (
          <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
            {[
              { label: 'Total Staff',      value: stats.total,     color: C.text  },
              { label: 'Active',           value: stats.active,    color: C.teal  },
              { label: 'Inactive',         value: stats.inactive,  color: C.muted },
              { label: 'Profile Pending',  value: stats.noProfile, color: C.amber },
            ].map(s => (
              <div key={s.label} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '10px', padding: '12px 18px', display: 'flex', gap: '10px', alignItems: 'center' }}>
                <span style={{ fontSize: '20px', fontWeight: 800, color: s.color }}>{s.value}</span>
                <span style={{ fontSize: '11px', color: C.muted, fontWeight: 600 }}>{s.label}</span>
              </div>
            ))}
          </div>
        )}

        {/* Filters */}
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '10px', padding: '12px 16px', marginBottom: '16px', display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: '1 1 220px' }}>
            <span style={{ position: 'absolute', left: '9px', top: '50%', transform: 'translateY(-50%)', color: C.muted, pointerEvents: 'none' }}>
              <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            </span>
            <input
              placeholder="Search name, role, email, dept…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ width: '100%', padding: '7px 10px 7px 28px', borderRadius: '8px', border: `1px solid ${search ? C.teal : C.border}`, fontSize: '12px', fontFamily: 'inherit', outline: 'none', background: C.surface, color: C.text, boxSizing: 'border-box' }}
            />
          </div>
          {[
            { value: deptFilter,   onChange: setDeptFilter,   options: departments, placeholder: 'All Departments' },
            { value: officeFilter, onChange: setOfficeFilter, options: offices.map(o => ({ value: o, label: OFFICE_LABEL[o] ?? o })), placeholder: 'All Offices' },
          ].map((f, i) => (
            <select key={i} value={f.value} onChange={e => f.onChange(e.target.value)}
              style={{ padding: '7px 10px', borderRadius: '8px', border: `1px solid ${f.value ? C.teal : C.border}`, fontSize: '12px', fontFamily: 'inherit', outline: 'none', background: C.surface, color: C.text, cursor: 'pointer' }}>
              <option value="">{f.placeholder}</option>
              {f.options.map(o => typeof o === 'string'
                ? <option key={o} value={o}>{o}</option>
                : <option key={o.value} value={o.value}>{o.label}</option>
              )}
            </select>
          ))}
          <select value={levelFilter} onChange={e => setLevelFilter(e.target.value)}
            style={{ padding: '7px 10px', borderRadius: '8px', border: `1px solid ${levelFilter ? C.teal : C.border}`, fontSize: '12px', fontFamily: 'inherit', outline: 'none', background: C.surface, color: C.text, cursor: 'pointer' }}>
            <option value="">All Levels</option>
            {Object.entries(LEVEL_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            style={{ padding: '7px 10px', borderRadius: '8px', border: `1px solid ${statusFilter ? C.teal : C.border}`, fontSize: '12px', fontFamily: 'inherit', outline: 'none', background: C.surface, color: C.text, cursor: 'pointer' }}>
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          <span style={{ fontSize: '12px', color: C.muted, whiteSpace: 'nowrap' }}>{filtered.length} / {staff.length}</span>
        </div>

        {/* Table */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px', color: C.muted, fontSize: '13px' }}>Loading staff…</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px', color: C.muted, fontSize: '13px' }}>No staff match the current filters</div>
        ) : (
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '12px', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#F0F4F8' }}>
                  {['Name', 'Role / Department', 'Level', 'Office', 'Manager', 'Joined', 'Status'].map(h => (
                    <th key={h} style={{ fontSize: '10px', fontWeight: 700, color: C.muted, textAlign: 'left', padding: '9px 14px', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: `1px solid ${C.border}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((s, i) => {
                  const lc = LEVEL_COLOR[s.job_level] ?? C.muted
                  const oc = OFFICE_COLOR[s.office_id ?? ''] ?? C.muted
                  return (
                    <tr key={s.id} style={{ borderTop: `1px solid ${C.border}`, background: i % 2 === 0 ? C.surface : '#FAFBFC', transition: 'background 0.1s' }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#F0F9F7')}
                      onMouseLeave={e => (e.currentTarget.style.background = i % 2 === 0 ? C.surface : '#FAFBFC')}
                    >
                      <td style={{ padding: '10px 14px', verticalAlign: 'middle' }}>
                        <Link href={`/hr/staff/${s.id}`} style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div style={{ width: 30, height: 30, borderRadius: '50%', background: lc + '20', color: lc, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 800, flexShrink: 0 }}>
                            {initials(s.name)}
                          </div>
                          <div>
                            <div style={{ fontSize: '13px', fontWeight: 700, color: C.text }}>{s.name}</div>
                            <div style={{ fontSize: '10px', color: C.muted }}>{s.email}</div>
                          </div>
                        </Link>
                      </td>
                      <td style={{ padding: '10px 14px', verticalAlign: 'middle' }}>
                        <div style={{ fontSize: '12px', color: C.text, fontWeight: 600 }}>{s.role ?? '—'}</div>
                        {s.department && <div style={{ fontSize: '10px', color: C.muted }}>{s.department}</div>}
                      </td>
                      <td style={{ padding: '10px 14px', verticalAlign: 'middle' }}>
                        <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: '6px', background: lc + '15', color: lc, textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                          {LEVEL_LABEL[s.job_level] ?? s.job_level}
                        </span>
                      </td>
                      <td style={{ padding: '10px 14px', verticalAlign: 'middle' }}>
                        {s.office_id ? (
                          <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: '6px', background: oc + '15', color: oc }}>
                            {OFFICE_LABEL[s.office_id] ?? s.office_id}
                          </span>
                        ) : <span style={{ color: C.border }}>—</span>}
                      </td>
                      <td style={{ padding: '10px 14px', verticalAlign: 'middle' }}>
                        {s.manager_id ? (
                          <Link href={`/hr/staff/${s.manager_id}`} style={{ fontSize: '12px', color: C.muted, textDecoration: 'none', fontWeight: 600 }}>
                            {nameMap.get(s.manager_id) ?? '—'}
                          </Link>
                        ) : <span style={{ fontSize: '12px', color: C.border }}>—</span>}
                      </td>
                      <td style={{ padding: '10px 14px', verticalAlign: 'middle' }}>
                        <span style={{ fontSize: '11px', color: C.muted }}>
                          {s.joined_at ? new Date(s.joined_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                        </span>
                      </td>
                      <td style={{ padding: '10px 14px', verticalAlign: 'middle' }}>
                        <span style={{
                          fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '6px',
                          background: s.access_enabled ? '#D1FAE5' : '#F0F4F8',
                          color: s.access_enabled ? '#065F46' : C.muted,
                        }}>
                          {s.access_enabled ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
