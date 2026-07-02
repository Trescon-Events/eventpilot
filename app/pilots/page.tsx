'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import NavBar from '@/app/components/NavBar'

// ── Types ─────────────────────────────────────────────────────────────────────

type ChecklistItem = {
  id: string; title: string; description: string | null; category: string | null
  completed: boolean; completed_at: string | null; sort_order: number
  staff?: { name: string; email: string } | null; assigned_to: string
}

type Member = {
  staff_id: string; role: string; role_label: string | null; role_color: string | null
  staff: { name: string; email: string; role: string } | null
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
  files: BuildFile[]; replies: BuildReply[]
}

type Project = {
  id: string; name: string; description: string | null; status: string
  tool_href: string | null; tool_label: string | null
  myRole: string | null; members: Member[]; checklist: ChecklistItem[]
}

// ── Constants ─────────────────────────────────────────────────────────────────

const ROLE_LABELS: Record<string, string> = { pilot: 'Pilot', co_pilot: 'Co-Pilot', consulting: 'Consulting', tracking: 'Project Tracking' }
const ROLE_COLORS: Record<string, { bg: string; color: string }> = {
  pilot:      { bg: '#eff6ff', color: '#1d4ed8' },
  co_pilot:   { bg: '#fdf2f8', color: '#be185d' },
  consulting: { bg: '#fef3c7', color: '#92400e' },
  tracking:   { bg: '#f0fdf4', color: '#166534' },
}
// Where the "Open tool" button on each project card should point. Website Builder
// and Brand Studio don't have a standalone page yet (event-scoped only), so both
// route to the shared Toolkit hub until that's decided.
const PROJECT_TOOL_LINK: Record<string, { label: string; href: string }> = {
  'Bespoke Event Module':               { label: 'Open Bespoke Tracker', href: '/admin/bespoke' },
  'Website Builder & Brand Studio Module': { label: 'Open Toolkit', href: '/admin/toolkit' },
}
const STATUS_COLORS: Record<string, { bg: string; color: string; label: string }> = {
  active:   { bg: '#eff6ff', color: '#1d4ed8', label: 'Active — Not Started' },
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
const CAT_LABELS: Record<string, string> = {
  prerequisite: 'Prerequisite', scope_decision: 'Scope Decision',
  content_prep: 'Content Prep', coordination: 'Coordination',
}
const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png']
const MAX_FILE_SIZE = 10 * 1024 * 1024

function fmtSize(b: number) {
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${Math.round(b / 1024)} KB`
  return `${(b / (1024 * 1024)).toFixed(1)} MB`
}

function fmtDate(s: string) {
  return new Date(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function fileIcon(type: string) {
  if (type === 'application/pdf') return '📄'
  return '🖼️'
}

// Light background tint for a role's accent hex, e.g. '#1d4ed8' -> '#1d4ed81a' (~10% alpha)
function tint(hex: string) {
  return `${hex}1a`
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function PilotsPage() {
  const [projects, setProjects]   = useState<Project[]>([])
  const [loading, setLoading]     = useState(true)
  const [staffId, setStaffId]     = useState<string | null>(null)
  const [isAdmin, setIsAdmin]     = useState(false)
  const [toggling, setToggling]   = useState<string | null>(null)

  // Tab state per project
  const [activeTab, setActiveTab] = useState<Record<string, 'checklist' | 'builds'>>({})

  // Build requests state per project
  const [buildRequests, setBuildRequests]   = useState<Record<string, BuildRequest[]>>({})
  const [loadingBuilds, setLoadingBuilds]   = useState<Record<string, boolean>>({})
  const [expandedBR, setExpandedBR]         = useState<string | null>(null)

  // New request form state (shared, one at a time)
  const [showForm, setShowForm]         = useState<string | null>(null)
  const [formTitle, setFormTitle]       = useState('')
  const [formMessage, setFormMessage]   = useState('')
  const [formFiles, setFormFiles]       = useState<File[]>([])
  const [formError, setFormError]       = useState('')
  const [formSubmitting, setFormSubmitting] = useState(false)
  const [dragActive, setDragActive]     = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Reply state
  const [replyText, setReplyText]           = useState<Record<string, string>>({})
  const [replySubmitting, setReplySubmitting] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const [pilotsRes, sessionRes] = await Promise.all([
        fetch('/api/pilots'), fetch('/api/auth/session'),
      ])
      const pilotsData  = await pilotsRes.json()
      const sessionData = await sessionRes.json()
      setProjects(pilotsData.projects ?? [])
      // /api/auth/session returns the raw session cookie payload — { sid, jl, adm, dept, roles }
      // — with no nested `staff` object.
      setStaffId(sessionData?.sid ?? null)
      setIsAdmin(sessionData?.adm ?? false)
      setLoading(false)
    }
    load()
  }, [])

  const fetchBuilds = useCallback(async (projectId: string) => {
    if (loadingBuilds[projectId] || buildRequests[projectId]) return
    setLoadingBuilds(prev => ({ ...prev, [projectId]: true }))
    const res = await fetch(`/api/build-requests?project_id=${projectId}`)
    const data = await res.json()
    setBuildRequests(prev => ({ ...prev, [projectId]: data.requests ?? [] }))
    setLoadingBuilds(prev => ({ ...prev, [projectId]: false }))
  }, [loadingBuilds, buildRequests])

  const switchTab = (projectId: string, tab: 'checklist' | 'builds') => {
    setActiveTab(prev => ({ ...prev, [projectId]: tab }))
    if (tab === 'builds') fetchBuilds(projectId)
  }

  const toggleItem = useCallback(async (itemId: string, current: boolean) => {
    setToggling(itemId)
    const res = await fetch(`/api/pilots/checklist/${itemId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed: !current }),
    })
    if (res.ok) {
      setProjects(prev => prev.map(p => ({
        ...p,
        checklist: p.checklist.map(i =>
          i.id === itemId ? { ...i, completed: !current, completed_at: !current ? new Date().toISOString() : null } : i
        ),
      })))
    }
    setToggling(null)
  }, [])

  const addFiles = useCallback((incoming: File[]) => {
    if (!incoming.length) return
    setFormFiles(prev => {
      const combined = [...prev, ...incoming]
      const bad = combined.find(f => !ALLOWED_TYPES.includes(f.type) || f.size > MAX_FILE_SIZE)
      if (bad) { setFormError('Files must be PDF, PNG or JPG and under 10 MB each'); return prev }
      if (combined.length > 3) { setFormError('Max 3 files'); return prev }
      setFormError('')
      return combined
    })
  }, [])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    addFiles(Array.from(e.target.files ?? []))
    e.target.value = ''
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragActive(false)
    addFiles(Array.from(e.dataTransfer.files ?? []))
  }

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const pasted = Array.from(e.clipboardData?.items ?? [])
      .filter(item => item.kind === 'file' && item.type.startsWith('image/'))
      .map(item => item.getAsFile())
      .filter((f): f is File => f !== null)
    if (pasted.length) addFiles(pasted)
  }

  const handleSubmitRequest = async (projectId: string) => {
    if (!formTitle.trim() || !formMessage.trim()) { setFormError('Title and message are required'); return }
    setFormSubmitting(true)
    setFormError('')
    const fd = new FormData()
    fd.append('title', formTitle.trim())
    fd.append('message', formMessage.trim())
    fd.append('project_id', projectId)
    formFiles.forEach(f => fd.append('files', f))
    const res = await fetch('/api/build-requests', { method: 'POST', body: fd })
    const data = await res.json()
    if (!res.ok) { setFormError(data.error ?? 'Failed to submit'); setFormSubmitting(false); return }
    // Reset form
    setFormTitle(''); setFormMessage(''); setFormFiles([])
    setShowForm(null)
    // Refresh builds for this project
    setBuildRequests(prev => {
      const current = prev[projectId] ?? []
      return { ...prev, [projectId]: [data.request, ...current] }
    })
    setFormSubmitting(false)
  }

  const handleReply = async (requestId: string, projectId: string) => {
    const msg = replyText[requestId]?.trim()
    if (!msg) return
    setReplySubmitting(requestId)
    const res = await fetch(`/api/build-requests/${requestId}/replies`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: msg }),
    })
    if (res.ok) {
      const data = await res.json()
      setReplyText(prev => ({ ...prev, [requestId]: '' }))
      setBuildRequests(prev => ({
        ...prev,
        [projectId]: (prev[projectId] ?? []).map(br =>
          br.id === requestId ? { ...br, replies: [...br.replies, { ...data.reply, author_name: 'You' }] } : br
        ),
      }))
    }
    setReplySubmitting(null)
  }

  const progress = (items: ChecklistItem[]) =>
    items.length ? Math.round((items.filter(i => i.completed).length / items.length) * 100) : 0

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#f8fafc' }}>
      <NavBar />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 'calc(100vh - 64px)' }}>
        <p style={{ color: '#6b7280', fontSize: 15 }}>Loading your pilot projects…</p>
      </div>
    </div>
  )

  if (!projects.length) return (
    <div style={{ minHeight: '100vh', background: '#f8fafc' }}>
      <NavBar />
      <div style={{ maxWidth: 600, margin: '80px auto', textAlign: 'center', padding: '0 24px' }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>🚀</div>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: '#111827', margin: '0 0 8px' }}>No pilot projects yet</h2>
        <p style={{ color: '#6b7280', fontSize: 15 }}>You haven't been assigned to any EventPilot pilot projects.</p>
      </div>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc' }}>
      <NavBar />
      <div style={{ maxWidth: 860, margin: '0 auto', padding: '40px 24px' }}>

        {/* Header */}
        <div style={{ marginBottom: 36 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <span style={{ fontSize: 22 }}>🚀</span>
            <h1 style={{ fontSize: 26, fontWeight: 800, color: '#111827', margin: 0 }}>Pilot Projects</h1>
          </div>
          <p style={{ color: '#6b7280', fontSize: 15, margin: 0, lineHeight: 1.6 }}>
            Complete your checklist items, then submit build requests for Durga to implement.
            {' '}Scope and architecture questions go directly to{' '}
            <strong style={{ color: '#111827' }}>Durga (dc@tresconglobal.com)</strong>.
          </p>
        </div>

        {projects.map(project => {
          const tab = activeTab[project.id] ?? 'checklist'
          const myItems = project.checklist.filter(i => !isAdmin || i.assigned_to === staffId)
          const myPct   = progress(myItems)
          const statusMeta = STATUS_COLORS[project.status] ?? STATUS_COLORS.active
          const myMember   = project.members.find(m => m.staff_id === staffId)
          const roleMeta   = myMember?.role_color
            ? { bg: tint(myMember.role_color), color: myMember.role_color }
            : ROLE_COLORS[project.myRole ?? ''] ?? { bg: '#f3f4f6', color: '#374151' }
          const roleLabel  = myMember?.role_label ?? ROLE_LABELS[project.myRole ?? ''] ?? project.myRole
          const isTrackerView = isAdmin || project.myRole === 'tracking'
          const byPerson: Record<string, { name: string; items: ChecklistItem[] }> = {}
          if (isTrackerView) {
            project.checklist.forEach(item => {
              if (!byPerson[item.assigned_to])
                byPerson[item.assigned_to] = { name: item.staff?.name ?? 'Unknown', items: [] }
              byPerson[item.assigned_to].items.push(item)
            })
          }
          const builds = buildRequests[project.id] ?? []

          return (
            <div key={project.id} style={{ background: '#fff', borderRadius: 14, border: '1px solid #e5e7eb', marginBottom: 28, overflow: 'hidden' }}>

              {/* Project header */}
              <div style={{ padding: '24px 28px', borderBottom: '1px solid #f3f4f6' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                  <div>
                    <h2 style={{ fontSize: 19, fontWeight: 700, color: '#111827', margin: '0 0 6px' }}>{project.name}</h2>
                    {project.description && <p style={{ color: '#6b7280', fontSize: 14, margin: '0 0 12px', lineHeight: 1.6 }}>{project.description}</p>}
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 12, fontWeight: 600, padding: '3px 10px', borderRadius: 999, background: statusMeta.bg, color: statusMeta.color }}>{statusMeta.label}</span>
                      {project.myRole && <span style={{ fontSize: 12, fontWeight: 600, padding: '3px 10px', borderRadius: 999, background: roleMeta.bg, color: roleMeta.color }}>Your role: {roleLabel}</span>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    {(() => {
                      const link = project.tool_href
                        ? { href: project.tool_href, label: project.tool_label ?? 'Open tool' }
                        : PROJECT_TOOL_LINK[project.name]
                      return link && (
                        <a href={link.href} style={{
                          display: 'flex', alignItems: 'center', gap: 6, background: '#111827', color: '#fff',
                          fontSize: 12, fontWeight: 700, padding: '8px 14px', borderRadius: 8, textDecoration: 'none', flexShrink: 0,
                        }}>
                          {link.label} →
                        </a>
                      )
                    })()}
                    {!isTrackerView && (
                      <div style={{ textAlign: 'center', minWidth: 64 }}>
                        <div style={{ fontSize: 26, fontWeight: 800, color: myPct === 100 ? '#16a34a' : '#111827' }}>{myPct}%</div>
                        <div style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>Complete</div>
                      </div>
                    )}
                  </div>
                </div>
                {/* Members */}
                <div style={{ display: 'flex', gap: 16, marginTop: 16, flexWrap: 'wrap' }}>
                  {project.members.map(m => {
                    const mRole = m.role_color
                      ? { bg: tint(m.role_color), color: m.role_color }
                      : ROLE_COLORS[m.role] ?? { bg: '#f3f4f6', color: '#374151' }
                    return (
                      <div key={m.staff_id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ width: 28, height: 28, borderRadius: '50%', background: mRole.bg, color: mRole.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700 }}>
                          {(m.staff?.name ?? '?').split(' ').map(w => w[0]).join('').slice(0, 2)}
                        </div>
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 600, color: '#111827' }}>{m.staff?.name ?? 'Unknown'}</div>
                          <div style={{ fontSize: 11, color: '#9ca3af' }}>{m.role_label ?? ROLE_LABELS[m.role] ?? m.role}</div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Tab bar */}
              <div style={{ display: 'flex', borderBottom: '1px solid #f3f4f6', background: '#fafafa' }}>
                {(['checklist', 'builds'] as const).map(t => (
                  <button key={t} onClick={() => switchTab(project.id, t)} style={{
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
                <div style={{ padding: '20px 28px' }}>
                  {!isTrackerView ? (
                    <>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 14 }}>
                        Your Checklist — {myItems.filter(i => i.completed).length} of {myItems.length} done
                      </div>
                      {myItems.length === 0
                        ? <p style={{ color: '#9ca3af', fontSize: 14 }}>No checklist items assigned to you yet.</p>
                        : <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            {myItems.map((item, idx) => (
                              <ChecklistRow key={item.id} item={item} index={idx + 1}
                                toggling={toggling === item.id} onToggle={() => toggleItem(item.id, item.completed)} />
                            ))}
                          </div>}
                    </>
                  ) : (
                    <>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 16 }}>
                        Full Checklist — All Participants
                      </div>
                      {Object.entries(byPerson).map(([sid, { name, items }]) => {
                        const pct = progress(items)
                        return (
                          <div key={sid} style={{ marginBottom: 20 }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                              <span style={{ fontSize: 14, fontWeight: 700, color: '#374151' }}>{name}</span>
                              <span style={{ fontSize: 12, color: pct === 100 ? '#16a34a' : '#6b7280', fontWeight: 600 }}>{pct}% complete</span>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                              {items.map((item, idx) => (
                                <ChecklistRow key={item.id} item={item} index={idx + 1}
                                  toggling={toggling === item.id} onToggle={() => toggleItem(item.id, item.completed)}
                                  readonly={!isAdmin && item.assigned_to !== staffId} />
                              ))}
                            </div>
                          </div>
                        )
                      })}
                    </>
                  )}
                </div>
              )}

              {/* ── Build Requests tab ── */}
              {tab === 'builds' && (
                <div style={{ padding: '20px 28px' }}>

                  {/* Submit new request button */}
                  {showForm !== project.id && (
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
                      <button onClick={() => { setShowForm(project.id); setFormError('') }} style={{
                        background: '#0d9488', color: '#fff', border: 'none', borderRadius: 8,
                        padding: '9px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                      }}>
                        + New Build Request
                      </button>
                    </div>
                  )}

                  {/* New request form */}
                  {showForm === project.id && (
                    <div style={{ background: '#f0fdf4', border: '1px solid #6ee7b7', borderRadius: 12, padding: '20px 24px', marginBottom: 20 }}>
                      <h3 style={{ fontSize: 15, fontWeight: 700, color: '#111827', margin: '0 0 16px' }}>New Build Request</h3>
                      <div style={{ marginBottom: 12 }}>
                        <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 4 }}>TITLE *</label>
                        <input value={formTitle} onChange={e => setFormTitle(e.target.value)}
                          placeholder="Short summary of what you need built"
                          style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14, boxSizing: 'border-box', outline: 'none' }} />
                      </div>
                      <div style={{ marginBottom: 12 }}>
                        <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 4 }}>DETAILED INSTRUCTIONS *</label>
                        <textarea value={formMessage} onChange={e => setFormMessage(e.target.value)}
                          onPaste={handlePaste}
                          placeholder="Describe exactly what you want built, how it should work, and any edge cases to consider… (paste a screenshot directly here)"
                          rows={5} style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14, boxSizing: 'border-box', resize: 'vertical', outline: 'none', fontFamily: 'inherit' }} />
                      </div>
                      <div style={{ marginBottom: 16 }}>
                        <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 4 }}>
                          ATTACHMENTS <span style={{ fontWeight: 400, color: '#6b7280' }}>(PDF, PNG, JPG — max 10 MB each, max 3 files)</span>
                        </label>
                        <div
                          onDragOver={e => { e.preventDefault(); setDragActive(true) }}
                          onDragLeave={() => setDragActive(false)}
                          onDrop={handleDrop}
                          onClick={() => fileInputRef.current?.click()}
                          style={{
                            border: `1.5px dashed ${dragActive ? '#0d9488' : '#d1d5db'}`, borderRadius: 8,
                            background: dragActive ? '#f0fdfa' : '#fafafa', padding: '16px 14px',
                            textAlign: 'center', cursor: 'pointer', transition: 'all 0.15s',
                          }}>
                          <p style={{ margin: 0, fontSize: 13, color: '#6b7280' }}>
                            Drag files here, click to browse, or paste a screenshot from your clipboard
                          </p>
                          <input ref={fileInputRef} type="file" multiple accept=".pdf,.png,.jpg,.jpeg"
                            onChange={handleFileChange} onClick={e => e.stopPropagation()}
                            style={{ display: 'none' }} />
                        </div>
                        {formFiles.length > 0 && (
                          <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            {formFiles.map((f, i) => (
                              <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, background: '#fff', border: '1px solid #d1d5db', padding: '3px 6px 3px 10px', borderRadius: 999, color: '#374151' }}>
                                {fileIcon(f.type)} {f.name} ({fmtSize(f.size)})
                                <button type="button" onClick={() => setFormFiles(prev => prev.filter((_, j) => j !== i))}
                                  style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: 13, lineHeight: 1, padding: '0 2px' }}>✕</button>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      {formError && <p style={{ color: '#dc2626', fontSize: 13, margin: '0 0 12px' }}>{formError}</p>}
                      <div style={{ display: 'flex', gap: 10 }}>
                        <button onClick={() => handleSubmitRequest(project.id)} disabled={formSubmitting}
                          style={{ background: '#0d9488', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 20px', fontSize: 14, fontWeight: 700, cursor: formSubmitting ? 'not-allowed' : 'pointer', opacity: formSubmitting ? 0.6 : 1 }}>
                          {formSubmitting ? 'Submitting…' : 'Submit Request'}
                        </button>
                        <button onClick={() => { setShowForm(null); setFormTitle(''); setFormMessage(''); setFormFiles([]); setFormError('') }}
                          style={{ background: '#fff', color: '#6b7280', border: '1px solid #e5e7eb', borderRadius: 8, padding: '10px 16px', fontSize: 14, cursor: 'pointer' }}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Build requests list */}
                  {loadingBuilds[project.id] ? (
                    <p style={{ color: '#9ca3af', fontSize: 14, textAlign: 'center', padding: '24px 0' }}>Loading requests…</p>
                  ) : builds.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '32px 0', color: '#9ca3af' }}>
                      <div style={{ fontSize: 28, marginBottom: 8 }}>🔧</div>
                      <p style={{ fontSize: 14, margin: 0 }}>No build requests yet for this project.</p>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {builds.map(br => {
                        const brs = BR_STATUS[br.status] ?? BR_STATUS.submitted
                        const isExpanded = expandedBR === br.id
                        const canReply = br.status === 'needs_clarification' && br.submitted_by === staffId
                        return (
                          <div key={br.id} style={{ border: `1px solid ${br.status === 'needs_clarification' ? '#e9d5ff' : '#e5e7eb'}`, borderRadius: 10, overflow: 'hidden', background: br.status === 'needs_clarification' ? '#fdf4ff' : '#fff' }}>
                            {/* Request row */}
                            <div onClick={() => setExpandedBR(isExpanded ? null : br.id)}
                              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px', cursor: 'pointer' }}>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 14, fontWeight: 700, color: '#111827', marginBottom: 2 }}>{br.title}</div>
                                <div style={{ fontSize: 12, color: '#9ca3af' }}>{fmtDate(br.created_at)}{br.files.length > 0 ? ` · ${br.files.length} file${br.files.length > 1 ? 's' : ''}` : ''}{br.replies.length > 0 ? ` · ${br.replies.length} repl${br.replies.length > 1 ? 'ies' : 'y'}` : ''}</div>
                              </div>
                              <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 999, background: brs.bg, color: brs.color, flexShrink: 0 }}>{brs.label}</span>
                              <span style={{ color: '#9ca3af', fontSize: 14 }}>{isExpanded ? '▲' : '▼'}</span>
                            </div>

                            {/* Expanded detail */}
                            {isExpanded && (
                              <div style={{ borderTop: '1px solid #f3f4f6', padding: '16px 20px' }}>
                                {/* Message */}
                                <div style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 }}>Request Details</div>
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

                                {/* Pilot reply input (only when needs_clarification) */}
                                {canReply && (
                                  <div style={{ marginTop: 8 }}>
                                    <div style={{ fontSize: 12, fontWeight: 700, color: '#7e22ce', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 }}>Reply to Durga</div>
                                    <textarea
                                      value={replyText[br.id] ?? ''}
                                      onChange={e => setReplyText(prev => ({ ...prev, [br.id]: e.target.value }))}
                                      placeholder="Provide the clarification Durga asked for…"
                                      rows={3}
                                      style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #e9d5ff', fontSize: 14, boxSizing: 'border-box', resize: 'vertical', outline: 'none', fontFamily: 'inherit' }}
                                    />
                                    <button
                                      onClick={() => handleReply(br.id, project.id)}
                                      disabled={replySubmitting === br.id || !replyText[br.id]?.trim()}
                                      style={{ marginTop: 8, background: '#7e22ce', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: replySubmitting === br.id ? 0.6 : 1 }}>
                                      {replySubmitting === br.id ? 'Sending…' : 'Send Reply'}
                                    </button>
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
          )
        })}

        {/* Guidance footer */}
        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '16px 20px', marginTop: 8 }}>
          <p style={{ margin: 0, fontSize: 14, color: '#92400e', lineHeight: 1.7 }}>
            <strong>How build requests work:</strong> Complete your checklist items first.
            Then submit a build request with a clear description and any supporting files (PDF with screenshots is best).
            Durga will review and either complete the build or ask for clarification.
            Files are automatically deleted once a request is completed or deferred.
          </p>
        </div>

      </div>
    </div>
  )
}

// ── Checklist Row ─────────────────────────────────────────────────────────────

function ChecklistRow({ item, index, toggling, onToggle, readonly = false }: {
  item: ChecklistItem; index: number; toggling: boolean; onToggle: () => void; readonly?: boolean
}) {
  const catMeta = item.category ? CAT_LABELS[item.category] : null
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 12, padding: '11px 14px', borderRadius: 8,
      background: item.completed ? '#f0fdf4' : '#fafafa',
      border: `1px solid ${item.completed ? '#bbf7d0' : '#e5e7eb'}`,
      opacity: toggling ? 0.6 : 1, transition: 'all 0.15s', cursor: readonly ? 'default' : 'pointer',
    }} onClick={() => !readonly && !toggling && onToggle()}>
      <div style={{
        width: 20, height: 20, borderRadius: 4, flexShrink: 0, marginTop: 1,
        border: `2px solid ${item.completed ? '#16a34a' : '#d1d5db'}`,
        background: item.completed ? '#16a34a' : '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: readonly ? 'default' : 'pointer',
      }}>
        {item.completed && (
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
            <path d="M2 6l3 3 5-5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, color: '#9ca3af', fontWeight: 600, flexShrink: 0 }}>#{index}</span>
          <span style={{ fontSize: 14, fontWeight: 600, color: item.completed ? '#6b7280' : '#111827', textDecoration: item.completed ? 'line-through' : 'none' }}>{item.title}</span>
          {catMeta && <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 999, background: '#f3f4f6', color: '#6b7280', fontWeight: 600, flexShrink: 0 }}>{catMeta}</span>}
        </div>
        {item.description && <p style={{ margin: '4px 0 0', fontSize: 13, color: '#6b7280', lineHeight: 1.5 }}>{item.description}</p>}
        {item.completed && item.completed_at && (
          <p style={{ margin: '3px 0 0', fontSize: 11, color: '#16a34a' }}>
            Done {new Date(item.completed_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
          </p>
        )}
      </div>
    </div>
  )
}
