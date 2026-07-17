'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import PageHeader from '@/app/components/PageHeader'
import { ROLE_PRESETS, TOOL_GRANT_OPTIONS } from '@/app/lib/constants'

// ── Types ─────────────────────────────────────────────────────────────────────

type Staff = { id: string; name: string; email: string }

type ChecklistItem = {
  id: string; title: string; category: string | null
  completed: boolean; completed_at: string | null
  assigned_to: string; staff: { name: string; email: string } | null
}

type Member = {
  staff_id: string; role: string; role_label: string | null; role_color: string | null
  // tool_grants is only present when the viewer is an admin (GET /api/pilots strips
  // it for non-admins) — used by the Manage Members section below to show/edit
  // each member's current per-tool grant state.
  staff: { name: string; role: string; email: string; tool_grants?: Record<string, boolean> | null } | null
}

type BuildFile = {
  id: string; file_name: string; file_type: string; file_size_bytes: number; signed_url: string | null
}

type BuildReply = {
  id: string; author_id: string; is_admin_reply: boolean
  message: string; created_at: string; author_name: string
}

type BuildRequest = {
  id: string; project_id: string; submitted_by: string
  title: string; message: string; status: string
  created_at: string; updated_at: string
  submitter: { name: string; email: string } | null
  files: BuildFile[]; replies: BuildReply[]
}

type Project = {
  id: string; name: string; description: string | null; status: string
  tool_href: string | null; tool_label: string | null
  members: Member[]; checklist: ChecklistItem[]
}

// ── Constants ─────────────────────────────────────────────────────────────────

const ROLE_LABELS: Record<string, string> = { pilot: 'Pilot', co_pilot: 'Co-Pilot', consulting: 'Consulting', tracking: 'Tracking', builder: 'Builder', collaborator: 'Collaborator' }
// Where the "Open tool" button on each project header should point. Website Builder
// and Brand Studio don't have a standalone page yet (event-scoped only), so both
// route to the shared Toolkit hub until that's decided.
const PROJECT_TOOL_LINK: Record<string, { label: string; href: string }> = {
  'Bespoke Event Module':               { label: 'Open Bespoke Tracker', href: '/admin/bespoke' },
  'Website Builder & Brand Studio Module': { label: 'Open Toolkit', href: '/admin/toolkit' },
}
const STATUS_META: Record<string, { bg: string; color: string; label: string }> = {
  active:   { bg: 'var(--info-light)',    color: 'var(--info)',    label: 'Active' },
  building: { bg: 'var(--amber-light)',   color: 'var(--amber)',   label: 'In Build' },
  testing:  { bg: 'var(--purple-light)',  color: 'var(--purple)',  label: 'Testing' },
  complete: { bg: 'var(--success-light)', color: 'var(--success)', label: 'Complete' },
  paused:   { bg: 'var(--surface)',       color: 'var(--ink3)',    label: 'Paused' },
}
const BR_STATUS: Record<string, { bg: string; color: string; label: string }> = {
  submitted:           { bg: 'var(--info-light)',    color: 'var(--info)',    label: 'Submitted' },
  in_review:           { bg: 'var(--amber-light)',   color: 'var(--amber)',   label: 'In Review' },
  needs_clarification: { bg: 'var(--purple-light)',  color: 'var(--purple)',  label: 'Needs Clarification' },
  completed:           { bg: 'var(--success-light)', color: 'var(--success)', label: 'Completed' },
  deferred:            { bg: 'var(--surface)',       color: 'var(--ink3)',    label: 'Deferred' },
}

// Manage Members section — small form controls, sized down from the
// full-wizard inputStyle/labelStyle in app/admin/pilots/new/page.tsx since
// this is an inline "add to existing project" row, not a full wizard step.
const smallLabelStyle: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: 'var(--ink3)', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.4 }
const smallInputStyle: React.CSSProperties = { width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit', background: 'var(--card)', color: 'var(--ink)' }
const grantChipStyle = (checked: boolean, disabled?: boolean): React.CSSProperties => ({
  display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, padding: '4px 9px', borderRadius: 999,
  border: `1px solid ${checked ? 'var(--teal-mid)' : 'var(--border)'}`,
  background: checked ? 'var(--teal-light)' : 'var(--card)', color: checked ? 'var(--teal-mid)' : 'var(--ink3)',
  cursor: disabled ? 'default' : 'pointer', fontWeight: 600, opacity: disabled ? 0.7 : 1,
})
const btnTealSolid: React.CSSProperties = { background: 'var(--teal-mid)', color: 'var(--teal-light)', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }
const btnRedSolid: React.CSSProperties = { background: 'var(--red)', color: 'var(--red-light)', border: 'none', borderRadius: 8, padding: '7px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }
const btnGhost: React.CSSProperties = { background: 'var(--card)', color: 'var(--ink3)', border: '1px solid var(--border)', borderRadius: 8, padding: '7px 14px', fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap' }

function fmtSize(b: number) {
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${Math.round(b / 1024)} KB`
  return `${(b / (1024 * 1024)).toFixed(1)} MB`
}
function fmtDate(s: string) {
  return new Date(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}
function fileIcon(type: string) { return type === 'application/pdf' ? '📄' : '🖼️' }

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function AdminPilotsPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading]   = useState(true)
  const [active, setActive]     = useState<string | null>(null)
  const [tab, setTab]           = useState<'checklist' | 'builds'>('checklist')

  // Build requests
  const [builds, setBuilds]         = useState<BuildRequest[]>([])
  const [loadingBuilds, setLoadingBuilds] = useState(false)
  const [expandedBR, setExpandedBR] = useState<string | null>(null)

  // Admin update form per request
  const [updatingBR, setUpdatingBR]     = useState<string | null>(null)
  const [updateStatus, setUpdateStatus] = useState('')
  const [updateReply, setUpdateReply]   = useState('')
  const [updateError, setUpdateError]   = useState('')
  const [updateLoading, setUpdateLoading] = useState(false)

  useEffect(() => {
    fetch('/api/pilots').then(r => r.json()).then(d => {
      setProjects(d.projects ?? [])
      if (d.projects?.length) setActive(d.projects[0].id)
      setLoading(false)
    })
  }, [])

  useEffect(() => {
    if (active && tab === 'builds') loadBuilds(active)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, tab])

  const loadBuilds = async (projectId: string) => {
    setLoadingBuilds(true)
    const res = await fetch(`/api/build-requests?project_id=${projectId}`)
    const data = await res.json()
    setBuilds(data.requests ?? [])
    setLoadingBuilds(false)
  }

  const toggleItem = async (itemId: string, current: boolean) => {
    await fetch(`/api/pilots/checklist/${itemId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed: !current }),
    })
    setProjects(prev => prev.map(p => ({
      ...p,
      checklist: p.checklist.map(i => i.id === itemId ? { ...i, completed: !current } : i),
    })))
  }

  const handleUpdate = async (brId: string) => {
    if (!updateStatus && !updateReply.trim()) { setUpdateError('Provide a status change or reply message'); return }
    setUpdateLoading(true); setUpdateError('')
    const res = await fetch(`/api/build-requests/${brId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: updateStatus || undefined, reply: updateReply.trim() || undefined }),
    })
    const data = await res.json()
    if (!res.ok) { setUpdateError(data.error ?? 'Failed to update'); setUpdateLoading(false); return }
    // Refresh builds
    if (active) loadBuilds(active)
    setUpdatingBR(null); setUpdateStatus(''); setUpdateReply(''); setUpdateLoading(false)
  }

  const progress = (items: ChecklistItem[]) =>
    items.length ? Math.round((items.filter(i => i.completed).length / items.length) * 100) : 0

  const activeProject = projects.find(p => p.id === active)

  // ── Manage Members & Tool Link (edit-time counterpart to app/admin/pilots/new/page.tsx) ──

  const [staffList, setStaffList] = useState<Staff[]>([])
  useEffect(() => {
    fetch('/api/staff-list').then(r => r.json()).then(d => setStaffList(Array.isArray(d) ? d : []))
  }, [])

  // Tool link editor
  const [toolLabelDraft, setToolLabelDraft] = useState('')
  const [toolHrefDraft, setToolHrefDraft]   = useState('')
  const [savingToolLink, setSavingToolLink] = useState(false)
  const [toolLinkSaved, setToolLinkSaved]   = useState(false)
  const [toolLinkError, setToolLinkError]   = useState('')

  // Add member
  const [addStaffId, setAddStaffId]       = useState('')
  const [addRoleKey, setAddRoleKey]       = useState<string>(ROLE_PRESETS[0].key)
  const [addRoleLabel, setAddRoleLabel]   = useState<string>(ROLE_PRESETS[0].label)
  const [addRoleColor, setAddRoleColor]   = useState<string>(ROLE_PRESETS[0].color)
  const [addToolGrants, setAddToolGrants] = useState<string[]>([])
  const [addingMember, setAddingMember]   = useState(false)
  const [addMemberError, setAddMemberError] = useState('')

  // Edit member
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null)
  const [editRoleKey, setEditRoleKey]     = useState('')
  const [editRoleLabel, setEditRoleLabel] = useState('')
  const [editRoleColor, setEditRoleColor] = useState('')
  const [editAddGrants, setEditAddGrants] = useState<string[]>([])
  const [savingMemberEdit, setSavingMemberEdit] = useState(false)
  const [editMemberError, setEditMemberError]   = useState('')

  // Remove member
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null)
  const [revokeKeys, setRevokeKeys]     = useState<string[]>([])
  const [removingMember, setRemovingMember] = useState(false)
  const [removeError, setRemoveError]   = useState('')

  const refreshProjects = async () => {
    const res = await fetch('/api/pilots')
    const d = await res.json()
    setProjects(d.projects ?? [])
  }

  const saveToolLink = async () => {
    if (!activeProject) return
    setSavingToolLink(true); setToolLinkError(''); setToolLinkSaved(false)
    const res = await fetch(`/api/admin/pilots/${activeProject.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool_href: toolHrefDraft.trim() || null, tool_label: toolLabelDraft.trim() || null }),
    })
    const data = await res.json()
    setSavingToolLink(false)
    if (!res.ok) { setToolLinkError(data.error ?? 'Failed to save'); return }
    setToolLinkSaved(true)
    await refreshProjects()
  }

  const applyAddRolePreset = (key: string) => {
    const preset = ROLE_PRESETS.find(p => p.key === key)
    setAddRoleKey(key)
    setAddRoleLabel(preset?.label ?? key)
    setAddRoleColor(preset?.color ?? '#374151')
  }
  const toggleAddGrant = (key: string) => {
    setAddToolGrants(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key])
  }
  const submitAddMember = async () => {
    if (!activeProject) return
    if (!addStaffId) { setAddMemberError('Select a staff member'); return }
    setAddingMember(true); setAddMemberError('')
    const res = await fetch(`/api/admin/pilots/${activeProject.id}/members`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ staff_id: addStaffId, role: addRoleKey, role_label: addRoleLabel, role_color: addRoleColor, tool_grants: addToolGrants }),
    })
    const data = await res.json()
    setAddingMember(false)
    if (!res.ok) { setAddMemberError(data.error ?? 'Failed to add member'); return }
    setAddStaffId(''); setAddToolGrants([])
    applyAddRolePreset(ROLE_PRESETS[0].key)
    await refreshProjects()
  }

  const applyEditRolePreset = (key: string) => {
    const preset = ROLE_PRESETS.find(p => p.key === key)
    setEditRoleKey(key)
    setEditRoleLabel(preset?.label ?? key)
    setEditRoleColor(preset?.color ?? '#374151')
  }
  const startEditMember = (m: Member) => {
    setRemovingMemberId(null)
    setEditingMemberId(m.staff_id)
    const preset = ROLE_PRESETS.find(p => p.key === m.role)
    setEditRoleKey(m.role)
    setEditRoleLabel(m.role_label ?? preset?.label ?? m.role)
    setEditRoleColor(m.role_color ?? preset?.color ?? '#374151')
    setEditAddGrants([])
    setEditMemberError('')
  }
  const toggleEditGrant = (key: string) => {
    setEditAddGrants(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key])
  }
  const saveMemberEdit = async (staffId: string) => {
    if (!activeProject) return
    setSavingMemberEdit(true); setEditMemberError('')
    const res = await fetch(`/api/admin/pilots/${activeProject.id}/members/${staffId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        role: editRoleKey, role_label: editRoleLabel, role_color: editRoleColor,
        ...(editAddGrants.length ? { tool_grants: editAddGrants } : {}),
      }),
    })
    const data = await res.json()
    setSavingMemberEdit(false)
    if (!res.ok) { setEditMemberError(data.error ?? 'Failed to save'); return }
    setEditingMemberId(null)
    await refreshProjects()
  }

  const startRemoveMember = (staffId: string) => {
    setEditingMemberId(null)
    setRemovingMemberId(staffId); setRevokeKeys([]); setRemoveError('')
  }
  const toggleRevokeKey = (key: string) => {
    setRevokeKeys(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key])
  }
  const confirmRemoveMember = async (staffId: string) => {
    if (!activeProject) return
    setRemovingMember(true); setRemoveError('')
    const res = await fetch(`/api/admin/pilots/${activeProject.id}/members/${staffId}`, {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ revoke_grant_keys: revokeKeys }),
    })
    const data = await res.json().catch(() => ({}))
    setRemovingMember(false)
    if (!res.ok) { setRemoveError(data.error ?? 'Failed to remove'); return }
    setRemovingMemberId(null)
    await refreshProjects()
  }

  // Reset all the transient Manage Members UI state when switching projects,
  // and seed the tool-link drafts from the newly-active project.
  useEffect(() => {
    const proj = projects.find(p => p.id === active)
    setToolLabelDraft(proj?.tool_label ?? '')
    setToolHrefDraft(proj?.tool_href ?? '')
    setToolLinkSaved(false); setToolLinkError('')
    setAddStaffId(''); setAddToolGrants([]); setAddMemberError('')
    applyAddRolePreset(ROLE_PRESETS[0].key)
    setEditingMemberId(null); setRemovingMemberId(null)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active])

  const byPerson: Record<string, { name: string; email: string; role: string; roleLabel: string; items: ChecklistItem[] }> = {}
  if (activeProject) {
    activeProject.checklist.forEach(item => {
      const key = item.assigned_to
      if (!byPerson[key]) {
        const member = activeProject.members.find(m => m.staff_id === key)
        byPerson[key] = {
          name:      item.staff?.name  ?? 'Unknown',
          email:     item.staff?.email ?? '',
          role:      member?.role ?? '',
          roleLabel: member?.role_label ?? (member ? ROLE_LABELS[member.role] ?? member.role : ''),
          items:     [],
        }
      }
      byPerson[key].items.push(item)
    })
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', background: 'var(--surface)' }}>
      <PageHeader title="Pilot Projects" />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 400 }}>
        <p style={{ color: 'var(--ink3)' }}>Loading pilot projects…</p>
      </div>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: 'var(--surface)' }}>
      <PageHeader
        title="Pilot Projects"
        description={`${projects.length} active project${projects.length !== 1 ? 's' : ''}`}
        actions={
          <Link href="/admin/pilots/new" style={{
            background: 'var(--teal-mid)', color: 'var(--teal-light)', fontSize: 13, fontWeight: 700, padding: '10px 18px',
            borderRadius: 8, textDecoration: 'none',
          }}>
            + New Pilot Project
          </Link>
        }
      />
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '40px 24px' }}>

        <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 24, alignItems: 'start' }}>

          {/* Sidebar */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {projects.map(p => {
              const sm  = STATUS_META[p.status] ?? STATUS_META.active
              const pct = progress(p.checklist)
              const isActive = active === p.id
              return (
                <button key={p.id} onClick={() => { setActive(p.id); setTab('checklist'); setExpandedBR(null) }} style={{
                  textAlign: 'left', background: isActive ? 'var(--teal-mid)' : 'var(--card)',
                  border: `1px solid ${isActive ? 'var(--teal-mid)' : 'var(--border)'}`,
                  borderRadius: 10, padding: '14px 16px', cursor: 'pointer', transition: 'all 0.15s',
                }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: isActive ? 'var(--teal-light)' : 'var(--ink)', marginBottom: 6 }}>{p.name}</div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 999,
                      background: isActive ? 'rgba(18,51,47,0.3)' : sm.bg,
                      color: isActive ? 'var(--teal-light)' : sm.color }}>{sm.label}</span>
                    <span style={{ fontSize: 12, color: isActive ? 'rgba(18,51,47,0.75)' : 'var(--ink3)', fontWeight: 600 }}>{pct}%</span>
                  </div>
                  <div style={{ marginTop: 8, height: 3, borderRadius: 2, background: isActive ? 'rgba(18,51,47,0.3)' : 'var(--border)' }}>
                    <div style={{ height: '100%', borderRadius: 2, width: `${pct}%`, background: isActive ? 'var(--teal-light)' : 'var(--teal-mid)', transition: 'width 0.3s' }} />
                  </div>
                </button>
              )
            })}
          </div>

          {/* Main panel */}
          {activeProject && (
            <div>
              <div style={{ background: 'var(--card)', borderRadius: 14, border: '1px solid var(--border)', overflow: 'hidden' }}>

                {/* Project header */}
                <div style={{ padding: '24px 28px', borderBottom: '1px solid var(--border-light)' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                    <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--ink)', margin: '0 0 6px' }}>{activeProject.name}</h2>
                    {(() => {
                      const link = activeProject.tool_href
                        ? { href: activeProject.tool_href, label: activeProject.tool_label ?? 'Open tool' }
                        : PROJECT_TOOL_LINK[activeProject.name]
                      return link && (
                        <a href={link.href} style={{
                          display: 'flex', alignItems: 'center', gap: 6, background: 'var(--ink)', color: 'var(--surface)',
                          fontSize: 12, fontWeight: 700, padding: '8px 14px', borderRadius: 8, textDecoration: 'none', flexShrink: 0,
                        }}>
                          {link.label} →
                        </a>
                      )
                    })()}
                  </div>
                  {activeProject.description && <p style={{ color: 'var(--ink3)', fontSize: 14, margin: '0 0 16px', lineHeight: 1.6 }}>{activeProject.description}</p>}
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    {activeProject.members.map(m => (
                      <div key={m.staff_id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', background: 'var(--surface)', borderRadius: 8, border: '1px solid var(--border)' }}>
                        <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--teal-mid)', color: 'var(--teal-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700 }}>
                          {(m.staff?.name ?? '?').split(' ').map(w => w[0]).join('').slice(0, 2)}
                        </div>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{m.staff?.name}</div>
                          <div style={{ fontSize: 11, color: 'var(--ink3)' }}>{m.role_label ?? ROLE_LABELS[m.role] ?? m.role} · {m.staff?.email}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* ── Manage Members & Tool Link — this is where changes actually happen; the
                     avatar chips above are read-only quick-glance only ── */}
                <div style={{ padding: '20px 28px', borderBottom: '1px solid var(--border-light)', background: 'var(--card-hi)' }}>
                  <h3 style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: 0.8, margin: '0 0 14px' }}>
                    Manage Members &amp; Tool Access
                  </h3>

                  {/* Tool link editor — fixes projects whose "Open Tool" button has nothing to link to */}
                  <div style={{ display: 'flex', gap: 10, marginBottom: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                    <div style={{ flex: '1 1 200px' }}>
                      <label style={smallLabelStyle}>TOOL LINK LABEL</label>
                      <input value={toolLabelDraft} onChange={e => setToolLabelDraft(e.target.value)} placeholder="e.g. Open Toolkit" style={smallInputStyle} />
                    </div>
                    <div style={{ flex: '1 1 240px' }}>
                      <label style={smallLabelStyle}>TOOL LINK HREF</label>
                      <input value={toolHrefDraft} onChange={e => setToolHrefDraft(e.target.value)} placeholder="/admin/toolkit" style={smallInputStyle} />
                    </div>
                    <button onClick={saveToolLink} disabled={savingToolLink} style={{ ...btnTealSolid, opacity: savingToolLink ? 0.6 : 1, cursor: savingToolLink ? 'not-allowed' : 'pointer' }}>
                      {savingToolLink ? 'Saving…' : 'Save Tool Link'}
                    </button>
                    {toolLinkSaved && <span style={{ fontSize: 12, color: 'var(--success)', fontWeight: 700 }}>Saved ✓</span>}
                  </div>
                  {toolLinkError && <p style={{ color: 'var(--red)', fontSize: 12, margin: '0 0 14px' }}>{toolLinkError}</p>}

                  {/* Add member */}
                  <div style={{ background: 'var(--card)', border: '1px dashed var(--border)', borderRadius: 10, padding: 14, marginTop: 14, marginBottom: 16 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 10 }}>Add Member to This Project</div>
                    <div style={{ display: 'flex', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
                      <div style={{ flex: '2 1 220px' }}>
                        <select value={addStaffId} onChange={e => setAddStaffId(e.target.value)} style={smallInputStyle}>
                          <option value="">— Select staff member —</option>
                          {staffList
                            .filter(s => !activeProject.members.some(m => m.staff_id === s.id))
                            .slice().sort((a, b) => a.name.localeCompare(b.name))
                            .map(s => <option key={s.id} value={s.id}>{s.name} ({s.email})</option>)}
                        </select>
                      </div>
                      <div style={{ flex: '1 1 140px' }}>
                        <select value={addRoleKey} onChange={e => applyAddRolePreset(e.target.value)} style={smallInputStyle}>
                          {ROLE_PRESETS.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
                        </select>
                      </div>
                      <button onClick={submitAddMember} disabled={addingMember} style={{ ...btnTealSolid, opacity: addingMember ? 0.6 : 1, cursor: addingMember ? 'not-allowed' : 'pointer' }}>
                        {addingMember ? 'Adding…' : '+ Add'}
                      </button>
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {TOOL_GRANT_OPTIONS.map(g => (
                        <label key={g.key} style={grantChipStyle(addToolGrants.includes(g.key))}>
                          <input type="checkbox" checked={addToolGrants.includes(g.key)} onChange={() => toggleAddGrant(g.key)} style={{ margin: 0 }} />
                          {g.label}
                        </label>
                      ))}
                    </div>
                    {addMemberError && <p style={{ color: 'var(--red)', fontSize: 12, margin: '10px 0 0' }}>{addMemberError}</p>}
                  </div>

                  {/* Current members — edit / remove */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {activeProject.members.map(m => {
                      const isEditing  = editingMemberId === m.staff_id
                      const isRemoving = removingMemberId === m.staff_id
                      const grantedKeys = Object.entries(m.staff?.tool_grants ?? {}).filter(([, v]) => v).map(([k]) => k)
                      return (
                        <div key={m.staff_id} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                            <div>
                              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{m.staff?.name ?? 'Unknown'}</span>
                              <span style={{ fontSize: 12, color: 'var(--ink3)', marginLeft: 8 }}>{m.role_label ?? ROLE_LABELS[m.role] ?? m.role} · {m.staff?.email}</span>
                            </div>
                            {!isEditing && !isRemoving && (
                              <div style={{ display: 'flex', gap: 8 }}>
                                <button onClick={() => startEditMember(m)} style={btnGhost}>Edit</button>
                                <button onClick={() => startRemoveMember(m.staff_id)} style={{ ...btnRedSolid, background: 'var(--card)', color: 'var(--red)', border: '1px solid var(--red-border)' }}>Remove</button>
                              </div>
                            )}
                          </div>

                          {/* Edit form */}
                          {isEditing && (
                            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border-light)' }}>
                              <div style={{ display: 'flex', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
                                <div style={{ flex: '1 1 160px' }}>
                                  <label style={smallLabelStyle}>ROLE</label>
                                  <select value={ROLE_PRESETS.some(p => p.key === editRoleKey) ? editRoleKey : 'custom'}
                                    onChange={e => e.target.value === 'custom' ? setEditRoleKey('') : applyEditRolePreset(e.target.value)} style={smallInputStyle}>
                                    {ROLE_PRESETS.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
                                    <option value="custom">Custom…</option>
                                  </select>
                                </div>
                                {!ROLE_PRESETS.some(p => p.key === editRoleKey) && (
                                  <>
                                    <div style={{ flex: '1 1 120px' }}>
                                      <label style={smallLabelStyle}>ROLE KEY</label>
                                      <input value={editRoleKey} onChange={e => setEditRoleKey(e.target.value)} style={smallInputStyle} />
                                    </div>
                                    <div style={{ flex: '1 1 160px' }}>
                                      <label style={smallLabelStyle}>ROLE LABEL</label>
                                      <input value={editRoleLabel} onChange={e => setEditRoleLabel(e.target.value)} style={smallInputStyle} />
                                    </div>
                                  </>
                                )}
                              </div>
                              <label style={smallLabelStyle}>TOOL ACCESS</label>
                              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                                {TOOL_GRANT_OPTIONS.map(g => {
                                  const alreadyGranted = grantedKeys.includes(g.key)
                                  return (
                                    <label key={g.key} style={grantChipStyle(alreadyGranted || editAddGrants.includes(g.key), alreadyGranted)}>
                                      <input type="checkbox" checked={alreadyGranted || editAddGrants.includes(g.key)} disabled={alreadyGranted}
                                        onChange={() => toggleEditGrant(g.key)} style={{ margin: 0 }} />
                                      {g.label}{alreadyGranted ? ' (granted)' : ''}
                                    </label>
                                  )
                                })}
                              </div>
                              <p style={{ fontSize: 11, color: 'var(--ink4)', margin: '0 0 10px' }}>
                                Grants are additive here — checking a box adds access. To revoke an existing grant, use Remove below.
                              </p>
                              {editMemberError && <p style={{ color: 'var(--red)', fontSize: 12, margin: '0 0 10px' }}>{editMemberError}</p>}
                              <div style={{ display: 'flex', gap: 8 }}>
                                <button onClick={() => saveMemberEdit(m.staff_id)} disabled={savingMemberEdit} style={{ ...btnTealSolid, opacity: savingMemberEdit ? 0.6 : 1, cursor: savingMemberEdit ? 'not-allowed' : 'pointer' }}>
                                  {savingMemberEdit ? 'Saving…' : 'Save'}
                                </button>
                                <button onClick={() => setEditingMemberId(null)} style={btnGhost}>Cancel</button>
                              </div>
                            </div>
                          )}

                          {/* Remove confirmation */}
                          {isRemoving && (
                            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border-light)' }}>
                              <p style={{ fontSize: 13, color: 'var(--ink2)', margin: '0 0 10px' }}>
                                Remove <strong>{m.staff?.name}</strong> from this project?
                              </p>
                              {grantedKeys.length > 0 && (
                                <>
                                  <label style={smallLabelStyle}>ALSO REVOKE THESE TOOL GRANTS <span style={{ fontWeight: 400, textTransform: 'none' }}>(optional — unchecked ones are left untouched)</span></label>
                                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                                    {TOOL_GRANT_OPTIONS.filter(g => grantedKeys.includes(g.key)).map(g => (
                                      <label key={g.key} style={grantChipStyle(revokeKeys.includes(g.key))}>
                                        <input type="checkbox" checked={revokeKeys.includes(g.key)} onChange={() => toggleRevokeKey(g.key)} style={{ margin: 0 }} />
                                        {g.label}
                                      </label>
                                    ))}
                                  </div>
                                </>
                              )}
                              {removeError && <p style={{ color: 'var(--red)', fontSize: 12, margin: '0 0 10px' }}>{removeError}</p>}
                              <div style={{ display: 'flex', gap: 8 }}>
                                <button onClick={() => confirmRemoveMember(m.staff_id)} disabled={removingMember}
                                  style={{ ...btnRedSolid, opacity: removingMember ? 0.6 : 1, cursor: removingMember ? 'not-allowed' : 'pointer' }}>
                                  {removingMember ? 'Removing…' : revokeKeys.length ? `Remove & Revoke ${revokeKeys.length}` : 'Remove from Project'}
                                </button>
                                <button onClick={() => setRemovingMemberId(null)} style={btnGhost}>Cancel</button>
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                    {activeProject.members.length === 0 && <p style={{ fontSize: 12, color: 'var(--ink3)', margin: 0 }}>No members on this project yet.</p>}
                  </div>
                </div>

                {/* Tab bar */}
                <div style={{ display: 'flex', borderBottom: '1px solid var(--border-light)', background: 'var(--card-hi)' }}>
                  {(['checklist', 'builds'] as const).map(t => (
                    <button key={t} onClick={() => setTab(t)} style={{
                      padding: '12px 20px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                      background: 'none', border: 'none', borderBottom: tab === t ? '2px solid var(--teal-mid)' : '2px solid transparent',
                      color: tab === t ? 'var(--teal-mid)' : 'var(--ink3)', transition: 'all 0.15s',
                    }}>
                      {t === 'checklist' ? '✓ Checklist' : '🔧 Build Requests'}
                      {t === 'builds' && builds.length > 0 && (
                        <span style={{ marginLeft: 6, fontSize: 11, background: 'var(--teal-mid)', color: 'var(--teal-light)', borderRadius: 999, padding: '1px 6px' }}>{builds.length}</span>
                      )}
                    </button>
                  ))}
                </div>

                {/* ── Checklist tab ── */}
                {tab === 'checklist' && (
                  <div style={{ padding: '24px 28px' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 20 }}>
                      Full Checklist — {activeProject.checklist.filter(i => i.completed).length} of {activeProject.checklist.length} items complete
                    </div>
                    {Object.entries(byPerson).map(([sid, person]) => {
                      const pct = progress(person.items)
                      return (
                        <div key={sid} style={{ marginBottom: 28 }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                            <div>
                              <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>{person.name}</span>
                              <span style={{ fontSize: 12, color: 'var(--ink3)', marginLeft: 8 }}>{person.roleLabel}</span>
                            </div>
                            <span style={{ fontSize: 13, fontWeight: 700, color: pct === 100 ? 'var(--success)' : 'var(--ink3)' }}>{pct}%</span>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            {person.items.map(item => (
                              <div key={item.id} onClick={() => toggleItem(item.id, item.completed)}
                                style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px', borderRadius: 8, border: `1px solid ${item.completed ? '#1F8F66' : 'var(--border)'}`, background: item.completed ? 'var(--success-light)' : 'var(--card-hi)', cursor: 'pointer' }}>
                                <div style={{ width: 18, height: 18, borderRadius: 4, border: `2px solid ${item.completed ? 'var(--success)' : 'var(--border)'}`, background: item.completed ? 'var(--success)' : 'var(--card)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                                  {item.completed && <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="var(--success-light)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                                </div>
                                <span style={{ fontSize: 13, color: item.completed ? 'var(--ink3)' : 'var(--ink)', textDecoration: item.completed ? 'line-through' : 'none', lineHeight: 1.5, fontWeight: 500 }}>{item.title}</span>
                                {item.category && <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 999, background: 'var(--border-light)', color: 'var(--ink3)', fontWeight: 600, flexShrink: 0, marginLeft: 'auto' }}>{item.category.replace('_', ' ')}</span>}
                              </div>
                            ))}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* ── Build Requests tab ── */}
                {tab === 'builds' && (
                  <div style={{ padding: '24px 28px' }}>

                    {/* CLI reference */}
                    <div style={{ background: 'var(--border-light)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 16px', marginBottom: 20, fontSize: 12, color: 'var(--ink3)' }}>
                      <strong>CLI:</strong>{' '}
                      <code style={{ fontSize: 11, background: 'var(--card-hi)', padding: '2px 6px', borderRadius: 4 }}>
                        curl https://eventpilot.tresconglobal.com/api/build-requests?project_id={activeProject.id}&amp;status=submitted -H &quot;x-setup-key: trescon-weekly-insights-2026&quot;
                      </code>
                    </div>

                    {loadingBuilds ? (
                      <p style={{ color: 'var(--ink3)', fontSize: 14, textAlign: 'center', padding: '24px 0' }}>Loading…</p>
                    ) : builds.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--ink3)' }}>
                        <div style={{ fontSize: 28, marginBottom: 8 }}>🔧</div>
                        <p style={{ fontSize: 14, margin: 0 }}>No build requests for this project yet.</p>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {builds.map(br => {
                          const brs = BR_STATUS[br.status] ?? BR_STATUS.submitted
                          const isExpanded = expandedBR === br.id
                          const isUpdating = updatingBR === br.id
                          return (
                            <div key={br.id} style={{ border: `1px solid ${br.status === 'needs_clarification' ? 'var(--purple-border)' : 'var(--border)'}`, borderRadius: 10, overflow: 'hidden', background: 'var(--card)' }}>

                              {/* Row header */}
                              <div onClick={() => { setExpandedBR(isExpanded ? null : br.id); setUpdatingBR(null) }}
                                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', cursor: 'pointer' }}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)', marginBottom: 2 }}>{br.title}</div>
                                  <div style={{ fontSize: 12, color: 'var(--ink3)' }}>
                                    {br.submitter?.name ?? 'Unknown'} · {fmtDate(br.created_at)}
                                    {br.files.length > 0 ? ` · ${br.files.length} file${br.files.length > 1 ? 's' : ''}` : ''}
                                    {br.replies.length > 0 ? ` · ${br.replies.length} repl${br.replies.length > 1 ? 'ies' : 'y'}` : ''}
                                  </div>
                                </div>
                                <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 999, background: brs.bg, color: brs.color, flexShrink: 0 }}>{brs.label}</span>
                                <span style={{ color: 'var(--ink4)', fontSize: 14 }}>{isExpanded ? '▲' : '▼'}</span>
                              </div>

                              {/* Expanded */}
                              {isExpanded && (
                                <div style={{ borderTop: '1px solid var(--border-light)', padding: '18px 22px' }}>

                                  {/* Submitter */}
                                  {br.submitter && (
                                    <div style={{ display: 'flex', gap: 8, marginBottom: 14, alignItems: 'center' }}>
                                      <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--teal-mid)', color: 'var(--teal-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                                        {br.submitter.name.split(' ').map(w => w[0]).join('').slice(0, 2)}
                                      </div>
                                      <div>
                                        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{br.submitter.name}</span>
                                        <span style={{ fontSize: 12, color: 'var(--ink3)', marginLeft: 6 }}>{br.submitter.email}</span>
                                      </div>
                                    </div>
                                  )}

                                  {/* Message */}
                                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 }}>Request</div>
                                  <p style={{ fontSize: 14, color: 'var(--ink2)', lineHeight: 1.7, margin: '0 0 16px', whiteSpace: 'pre-wrap' }}>{br.message}</p>

                                  {/* Files */}
                                  {br.files.length > 0 && (
                                    <div style={{ marginBottom: 16 }}>
                                      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 }}>Attachments</div>
                                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                        {br.files.map(f => (
                                          <a key={f.id} href={f.signed_url ?? '#'} target="_blank" rel="noopener"
                                            style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--border-light)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 12px', textDecoration: 'none', color: 'var(--info)', fontSize: 13, fontWeight: 600 }}>
                                            {fileIcon(f.file_type)} {f.file_name} <span style={{ color: 'var(--ink4)', fontWeight: 400 }}>({fmtSize(f.file_size_bytes)})</span>
                                          </a>
                                        ))}
                                      </div>
                                    </div>
                                  )}

                                  {/* Reply thread */}
                                  {br.replies.length > 0 && (
                                    <div style={{ marginBottom: 16 }}>
                                      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 }}>Thread</div>
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                        {br.replies.map(reply => (
                                          <div key={reply.id} style={{
                                            background: reply.is_admin_reply ? 'var(--success-light)' : 'var(--border-light)',
                                            border: `1px solid ${reply.is_admin_reply ? '#1F8F66' : 'var(--border)'}`,
                                            borderRadius: 8, padding: '10px 14px',
                                          }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                                              <span style={{ fontSize: 12, fontWeight: 700, color: reply.is_admin_reply ? 'var(--success)' : 'var(--ink2)' }}>{reply.author_name}</span>
                                              {reply.is_admin_reply && <span style={{ fontSize: 10, background: 'var(--success-light)', color: 'var(--success)', padding: '1px 6px', borderRadius: 999, fontWeight: 700 }}>Durga</span>}
                                              <span style={{ fontSize: 11, color: 'var(--ink3)', marginLeft: 'auto' }}>{fmtDate(reply.created_at)}</span>
                                            </div>
                                            <p style={{ margin: 0, fontSize: 13, color: 'var(--ink2)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{reply.message}</p>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}

                                  {/* Admin update form */}
                                  {!isUpdating ? (
                                    <button onClick={() => { setUpdatingBR(br.id); setUpdateStatus(br.status); setUpdateReply(''); setUpdateError('') }}
                                      style={{ background: 'var(--teal-mid)', color: 'var(--teal-light)', border: 'none', borderRadius: 8, padding: '9px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                                      Update Status / Reply
                                    </button>
                                  ) : (
                                    <div style={{ background: 'var(--border-light)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 20px', marginTop: 4 }}>
                                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12, marginBottom: 12 }}>
                                        <div>
                                          <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)', display: 'block', marginBottom: 4 }}>STATUS</label>
                                          <select value={updateStatus} onChange={e => setUpdateStatus(e.target.value)}
                                            style={{ width: '100%', padding: '9px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 14, background: 'var(--card)' }}>
                                            <option value="">— no change —</option>
                                            <option value="submitted">Submitted</option>
                                            <option value="in_review">In Review</option>
                                            <option value="needs_clarification">Needs Clarification</option>
                                            <option value="completed">Completed</option>
                                            <option value="deferred">Deferred</option>
                                          </select>
                                        </div>
                                        <div>
                                          <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)', display: 'block', marginBottom: 4 }}>REPLY NOTE</label>
                                          <input value={updateReply} onChange={e => setUpdateReply(e.target.value)}
                                            placeholder="Add a note for the pilot (optional)"
                                            style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 14, boxSizing: 'border-box' }} />
                                        </div>
                                      </div>
                                      {updateError && <p style={{ color: 'var(--red)', fontSize: 13, margin: '0 0 10px' }}>{updateError}</p>}
                                      <div style={{ display: 'flex', gap: 8 }}>
                                        <button onClick={() => handleUpdate(br.id)} disabled={updateLoading}
                                          style={{ background: 'var(--teal-mid)', color: 'var(--teal-light)', border: 'none', borderRadius: 8, padding: '9px 18px', fontSize: 13, fontWeight: 700, cursor: updateLoading ? 'not-allowed' : 'pointer', opacity: updateLoading ? 0.6 : 1 }}>
                                          {updateLoading ? 'Saving…' : 'Save'}
                                        </button>
                                        <button onClick={() => setUpdatingBR(null)}
                                          style={{ background: 'var(--card)', color: 'var(--ink3)', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 14px', fontSize: 13, cursor: 'pointer' }}>
                                          Cancel
                                        </button>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}

              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
