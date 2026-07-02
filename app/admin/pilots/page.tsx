'use client'

import { useEffect, useState } from 'react'
import NavBar from '@/app/components/NavBar'
import Link from 'next/link'

// ── Types ─────────────────────────────────────────────────────────────────────

type ChecklistItem = {
  id: string; title: string; category: string | null
  completed: boolean; completed_at: string | null
  assigned_to: string; staff: { name: string; email: string } | null
}

type Member = {
  staff_id: string; role: string; role_label: string | null; role_color: string | null
  staff: { name: string; role: string; email: string } | null
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

const ROLE_LABELS: Record<string, string> = { pilot: 'Pilot', co_pilot: 'Co-Pilot', consulting: 'Consulting', tracking: 'Tracking' }
// Where the "Open tool" button on each project header should point. Website Builder
// and Brand Studio don't have a standalone page yet (event-scoped only), so both
// route to the shared Toolkit hub until that's decided.
const PROJECT_TOOL_LINK: Record<string, { label: string; href: string }> = {
  'Bespoke Event Module':               { label: 'Open Bespoke Tracker', href: '/admin/bespoke' },
  'Website Builder & Brand Studio Module': { label: 'Open Toolkit', href: '/admin/toolkit' },
}
const STATUS_META: Record<string, { bg: string; color: string; label: string }> = {
  active:   { bg: '#eff6ff', color: '#1d4ed8', label: 'Active' },
  building: { bg: '#fef9c3', color: '#854d0e', label: 'In Build' },
  testing:  { bg: '#fdf4ff', color: '#7e22ce', label: 'Testing' },
  complete: { bg: '#f0fdf4', color: '#166534', label: 'Complete' },
  paused:   { bg: '#f9fafb', color: '#6b7280', label: 'Paused' },
}
const BR_STATUS: Record<string, { bg: string; color: string; label: string }> = {
  submitted:           { bg: '#eff6ff', color: '#1d4ed8', label: 'Submitted' },
  in_review:           { bg: '#fef9c3', color: '#854d0e', label: 'In Review' },
  needs_clarification: { bg: '#fdf4ff', color: '#7e22ce', label: 'Needs Clarification' },
  completed:           { bg: '#f0fdf4', color: '#166534', label: 'Completed' },
  deferred:            { bg: '#f9fafb', color: '#6b7280', label: 'Deferred' },
}

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
    <div style={{ minHeight: '100vh', background: '#f8fafc' }}>
      <NavBar />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 400 }}>
        <p style={{ color: '#6b7280' }}>Loading pilot projects…</p>
      </div>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc' }}>
      <NavBar />
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '40px 24px' }}>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 32 }}>
          <div>
            <div style={{ marginBottom: 4 }}>
              <Link href="/admin" style={{ fontSize: 13, color: '#6b7280', textDecoration: 'none' }}>← Admin</Link>
            </div>
            <h1 style={{ fontSize: 26, fontWeight: 800, color: '#111827', margin: 0 }}>Pilot Projects</h1>
            <p style={{ color: '#6b7280', fontSize: 14, margin: '4px 0 0' }}>
              {projects.length} active project{projects.length !== 1 ? 's' : ''}
            </p>
          </div>
          <Link href="/admin/pilots/new" style={{
            background: '#0d9488', color: '#fff', fontSize: 13, fontWeight: 700, padding: '10px 18px',
            borderRadius: 8, textDecoration: 'none',
          }}>
            + New Pilot Project
          </Link>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 24, alignItems: 'start' }}>

          {/* Sidebar */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {projects.map(p => {
              const sm  = STATUS_META[p.status] ?? STATUS_META.active
              const pct = progress(p.checklist)
              const isActive = active === p.id
              return (
                <button key={p.id} onClick={() => { setActive(p.id); setTab('checklist'); setExpandedBR(null) }} style={{
                  textAlign: 'left', background: isActive ? '#0d9488' : '#fff',
                  border: `1px solid ${isActive ? '#0d9488' : '#e5e7eb'}`,
                  borderRadius: 10, padding: '14px 16px', cursor: 'pointer', transition: 'all 0.15s',
                }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: isActive ? '#fff' : '#111827', marginBottom: 6 }}>{p.name}</div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 999,
                      background: isActive ? 'rgba(255,255,255,0.2)' : sm.bg,
                      color: isActive ? '#fff' : sm.color }}>{sm.label}</span>
                    <span style={{ fontSize: 12, color: isActive ? 'rgba(255,255,255,0.7)' : '#6b7280', fontWeight: 600 }}>{pct}%</span>
                  </div>
                  <div style={{ marginTop: 8, height: 3, borderRadius: 2, background: isActive ? 'rgba(255,255,255,0.2)' : '#e5e7eb' }}>
                    <div style={{ height: '100%', borderRadius: 2, width: `${pct}%`, background: isActive ? '#fff' : '#0d9488', transition: 'width 0.3s' }} />
                  </div>
                </button>
              )
            })}
          </div>

          {/* Main panel */}
          {activeProject && (
            <div>
              <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e5e7eb', overflow: 'hidden' }}>

                {/* Project header */}
                <div style={{ padding: '24px 28px', borderBottom: '1px solid #f3f4f6' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                    <h2 style={{ fontSize: 20, fontWeight: 700, color: '#111827', margin: '0 0 6px' }}>{activeProject.name}</h2>
                    {(() => {
                      const link = activeProject.tool_href
                        ? { href: activeProject.tool_href, label: activeProject.tool_label ?? 'Open tool' }
                        : PROJECT_TOOL_LINK[activeProject.name]
                      return link && (
                        <a href={link.href} style={{
                          display: 'flex', alignItems: 'center', gap: 6, background: '#111827', color: '#fff',
                          fontSize: 12, fontWeight: 700, padding: '8px 14px', borderRadius: 8, textDecoration: 'none', flexShrink: 0,
                        }}>
                          {link.label} →
                        </a>
                      )
                    })()}
                  </div>
                  {activeProject.description && <p style={{ color: '#6b7280', fontSize: 14, margin: '0 0 16px', lineHeight: 1.6 }}>{activeProject.description}</p>}
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    {activeProject.members.map(m => (
                      <div key={m.staff_id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', background: '#f9fafb', borderRadius: 8, border: '1px solid #e5e7eb' }}>
                        <div style={{ width: 30, height: 30, borderRadius: '50%', background: '#0d9488', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700 }}>
                          {(m.staff?.name ?? '?').split(' ').map(w => w[0]).join('').slice(0, 2)}
                        </div>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{m.staff?.name}</div>
                          <div style={{ fontSize: 11, color: '#6b7280' }}>{m.role_label ?? ROLE_LABELS[m.role] ?? m.role} · {m.staff?.email}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Tab bar */}
                <div style={{ display: 'flex', borderBottom: '1px solid #f3f4f6', background: '#fafafa' }}>
                  {(['checklist', 'builds'] as const).map(t => (
                    <button key={t} onClick={() => setTab(t)} style={{
                      padding: '12px 20px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                      background: 'none', border: 'none', borderBottom: tab === t ? '2px solid #0d9488' : '2px solid transparent',
                      color: tab === t ? '#0d9488' : '#6b7280', transition: 'all 0.15s',
                    }}>
                      {t === 'checklist' ? '✓ Checklist' : '🔧 Build Requests'}
                      {t === 'builds' && builds.length > 0 && (
                        <span style={{ marginLeft: 6, fontSize: 11, background: '#0d9488', color: '#fff', borderRadius: 999, padding: '1px 6px' }}>{builds.length}</span>
                      )}
                    </button>
                  ))}
                </div>

                {/* ── Checklist tab ── */}
                {tab === 'checklist' && (
                  <div style={{ padding: '24px 28px' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 20 }}>
                      Full Checklist — {activeProject.checklist.filter(i => i.completed).length} of {activeProject.checklist.length} items complete
                    </div>
                    {Object.entries(byPerson).map(([sid, person]) => {
                      const pct = progress(person.items)
                      return (
                        <div key={sid} style={{ marginBottom: 28 }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                            <div>
                              <span style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>{person.name}</span>
                              <span style={{ fontSize: 12, color: '#9ca3af', marginLeft: 8 }}>{person.roleLabel}</span>
                            </div>
                            <span style={{ fontSize: 13, fontWeight: 700, color: pct === 100 ? '#16a34a' : '#6b7280' }}>{pct}%</span>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            {person.items.map(item => (
                              <div key={item.id} onClick={() => toggleItem(item.id, item.completed)}
                                style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px', borderRadius: 8, border: `1px solid ${item.completed ? '#bbf7d0' : '#e5e7eb'}`, background: item.completed ? '#f0fdf4' : '#fafafa', cursor: 'pointer' }}>
                                <div style={{ width: 18, height: 18, borderRadius: 4, border: `2px solid ${item.completed ? '#16a34a' : '#d1d5db'}`, background: item.completed ? '#16a34a' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                                  {item.completed && <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                                </div>
                                <span style={{ fontSize: 13, color: item.completed ? '#6b7280' : '#111827', textDecoration: item.completed ? 'line-through' : 'none', lineHeight: 1.5, fontWeight: 500 }}>{item.title}</span>
                                {item.category && <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 999, background: '#f3f4f6', color: '#6b7280', fontWeight: 600, flexShrink: 0, marginLeft: 'auto' }}>{item.category.replace('_', ' ')}</span>}
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
                    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '12px 16px', marginBottom: 20, fontSize: 12, color: '#64748b' }}>
                      <strong>CLI:</strong>{' '}
                      <code style={{ fontSize: 11, background: '#f1f5f9', padding: '2px 6px', borderRadius: 4 }}>
                        curl https://eventpilot.tresconglobal.com/api/build-requests?project_id={activeProject.id}&amp;status=submitted -H &quot;x-setup-key: trescon-weekly-insights-2026&quot;
                      </code>
                    </div>

                    {loadingBuilds ? (
                      <p style={{ color: '#9ca3af', fontSize: 14, textAlign: 'center', padding: '24px 0' }}>Loading…</p>
                    ) : builds.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '40px 0', color: '#9ca3af' }}>
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
                            <div key={br.id} style={{ border: `1px solid ${br.status === 'needs_clarification' ? '#e9d5ff' : '#e5e7eb'}`, borderRadius: 10, overflow: 'hidden', background: '#fff' }}>

                              {/* Row header */}
                              <div onClick={() => { setExpandedBR(isExpanded ? null : br.id); setUpdatingBR(null) }}
                                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', cursor: 'pointer' }}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ fontSize: 14, fontWeight: 700, color: '#111827', marginBottom: 2 }}>{br.title}</div>
                                  <div style={{ fontSize: 12, color: '#9ca3af' }}>
                                    {br.submitter?.name ?? 'Unknown'} · {fmtDate(br.created_at)}
                                    {br.files.length > 0 ? ` · ${br.files.length} file${br.files.length > 1 ? 's' : ''}` : ''}
                                    {br.replies.length > 0 ? ` · ${br.replies.length} repl${br.replies.length > 1 ? 'ies' : 'y'}` : ''}
                                  </div>
                                </div>
                                <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 999, background: brs.bg, color: brs.color, flexShrink: 0 }}>{brs.label}</span>
                                <span style={{ color: '#9ca3af', fontSize: 14 }}>{isExpanded ? '▲' : '▼'}</span>
                              </div>

                              {/* Expanded */}
                              {isExpanded && (
                                <div style={{ borderTop: '1px solid #f3f4f6', padding: '18px 22px' }}>

                                  {/* Submitter */}
                                  {br.submitter && (
                                    <div style={{ display: 'flex', gap: 8, marginBottom: 14, alignItems: 'center' }}>
                                      <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#0d9488', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                                        {br.submitter.name.split(' ').map(w => w[0]).join('').slice(0, 2)}
                                      </div>
                                      <div>
                                        <span style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>{br.submitter.name}</span>
                                        <span style={{ fontSize: 12, color: '#9ca3af', marginLeft: 6 }}>{br.submitter.email}</span>
                                      </div>
                                    </div>
                                  )}

                                  {/* Message */}
                                  <div style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 }}>Request</div>
                                  <p style={{ fontSize: 14, color: '#374151', lineHeight: 1.7, margin: '0 0 16px', whiteSpace: 'pre-wrap' }}>{br.message}</p>

                                  {/* Files */}
                                  {br.files.length > 0 && (
                                    <div style={{ marginBottom: 16 }}>
                                      <div style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 }}>Attachments</div>
                                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                        {br.files.map(f => (
                                          <a key={f.id} href={f.signed_url ?? '#'} target="_blank" rel="noopener"
                                            style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '6px 12px', textDecoration: 'none', color: '#1d4ed8', fontSize: 13, fontWeight: 600 }}>
                                            {fileIcon(f.file_type)} {f.file_name} <span style={{ color: '#9ca3af', fontWeight: 400 }}>({fmtSize(f.file_size_bytes)})</span>
                                          </a>
                                        ))}
                                      </div>
                                    </div>
                                  )}

                                  {/* Reply thread */}
                                  {br.replies.length > 0 && (
                                    <div style={{ marginBottom: 16 }}>
                                      <div style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 }}>Thread</div>
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                        {br.replies.map(reply => (
                                          <div key={reply.id} style={{
                                            background: reply.is_admin_reply ? '#f0fdf4' : '#f8fafc',
                                            border: `1px solid ${reply.is_admin_reply ? '#bbf7d0' : '#e5e7eb'}`,
                                            borderRadius: 8, padding: '10px 14px',
                                          }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                                              <span style={{ fontSize: 12, fontWeight: 700, color: reply.is_admin_reply ? '#166534' : '#374151' }}>{reply.author_name}</span>
                                              {reply.is_admin_reply && <span style={{ fontSize: 10, background: '#dcfce7', color: '#166534', padding: '1px 6px', borderRadius: 999, fontWeight: 700 }}>Durga</span>}
                                              <span style={{ fontSize: 11, color: '#9ca3af', marginLeft: 'auto' }}>{fmtDate(reply.created_at)}</span>
                                            </div>
                                            <p style={{ margin: 0, fontSize: 13, color: '#374151', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{reply.message}</p>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}

                                  {/* Admin update form */}
                                  {!isUpdating ? (
                                    <button onClick={() => { setUpdatingBR(br.id); setUpdateStatus(br.status); setUpdateReply(''); setUpdateError('') }}
                                      style={{ background: '#0d9488', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                                      Update Status / Reply
                                    </button>
                                  ) : (
                                    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '16px 20px', marginTop: 4 }}>
                                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12, marginBottom: 12 }}>
                                        <div>
                                          <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 4 }}>STATUS</label>
                                          <select value={updateStatus} onChange={e => setUpdateStatus(e.target.value)}
                                            style={{ width: '100%', padding: '9px 10px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14, background: '#fff' }}>
                                            <option value="">— no change —</option>
                                            <option value="submitted">Submitted</option>
                                            <option value="in_review">In Review</option>
                                            <option value="needs_clarification">Needs Clarification</option>
                                            <option value="completed">Completed</option>
                                            <option value="deferred">Deferred</option>
                                          </select>
                                        </div>
                                        <div>
                                          <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 4 }}>REPLY NOTE</label>
                                          <input value={updateReply} onChange={e => setUpdateReply(e.target.value)}
                                            placeholder="Add a note for the pilot (optional)"
                                            style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14, boxSizing: 'border-box' }} />
                                        </div>
                                      </div>
                                      {updateError && <p style={{ color: '#dc2626', fontSize: 13, margin: '0 0 10px' }}>{updateError}</p>}
                                      <div style={{ display: 'flex', gap: 8 }}>
                                        <button onClick={() => handleUpdate(br.id)} disabled={updateLoading}
                                          style={{ background: '#0d9488', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 18px', fontSize: 13, fontWeight: 700, cursor: updateLoading ? 'not-allowed' : 'pointer', opacity: updateLoading ? 0.6 : 1 }}>
                                          {updateLoading ? 'Saving…' : 'Save'}
                                        </button>
                                        <button onClick={() => setUpdatingBR(null)}
                                          style={{ background: '#fff', color: '#6b7280', border: '1px solid #e5e7eb', borderRadius: 8, padding: '9px 14px', fontSize: 13, cursor: 'pointer' }}>
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
