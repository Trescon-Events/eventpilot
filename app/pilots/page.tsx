'use client'

import { useEffect, useState, useCallback } from 'react'
import NavBar from '@/app/components/NavBar'

type ChecklistItem = {
  id: string
  title: string
  description: string | null
  category: string | null
  completed: boolean
  completed_at: string | null
  sort_order: number
  staff?: { name: string; email: string } | null
  assigned_to: string
}

type Member = {
  staff_id: string
  role: string
  staff: { name: string; email: string; role: string } | null
}

type Project = {
  id: string
  name: string
  description: string | null
  status: string
  myRole: string | null
  members: Member[]
  checklist: ChecklistItem[]
}

const ROLE_LABELS: Record<string, string> = {
  pilot:    'Pilot',
  consulting: 'Consulting',
  tracking: 'Project Tracking',
}

const ROLE_COLORS: Record<string, { bg: string; color: string }> = {
  pilot:      { bg: '#eff6ff', color: '#1d4ed8' },
  consulting: { bg: '#fef3c7', color: '#92400e' },
  tracking:   { bg: '#f0fdf4', color: '#166534' },
}

const STATUS_COLORS: Record<string, { bg: string; color: string; label: string }> = {
  active:   { bg: '#eff6ff', color: '#1d4ed8', label: 'Active — Not Started' },
  building: { bg: '#fef9c3', color: '#854d0e', label: 'In Build' },
  testing:  { bg: '#fdf4ff', color: '#7e22ce', label: 'Testing' },
  complete: { bg: '#f0fdf4', color: '#166534', label: 'Complete' },
  paused:   { bg: '#f9fafb', color: '#6b7280', label: 'Paused' },
}

const CAT_LABELS: Record<string, string> = {
  prerequisite:    'Prerequisite',
  scope_decision:  'Scope Decision',
  content_prep:    'Content Prep',
  coordination:    'Coordination',
}

export default function PilotsPage() {
  const [projects, setProjects]   = useState<Project[]>([])
  const [loading, setLoading]     = useState(true)
  const [staffId, setStaffId]     = useState<string | null>(null)
  const [isAdmin, setIsAdmin]     = useState(false)
  const [toggling, setToggling]   = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const [pilotsRes, sessionRes] = await Promise.all([
        fetch('/api/pilots'),
        fetch('/api/auth/session'),
      ])
      const pilotsData = await pilotsRes.json()
      const sessionData = await sessionRes.json()
      setProjects(pilotsData.projects ?? [])
      setStaffId(sessionData?.staff?.id ?? null)
      setIsAdmin(sessionData?.staff?.isAdmin ?? false)
      setLoading(false)
    }
    load()
  }, [])

  const toggleItem = useCallback(async (itemId: string, current: boolean) => {
    setToggling(itemId)
    const res = await fetch(`/api/pilots/checklist/${itemId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
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

  const progress = (items: ChecklistItem[]) => {
    if (!items.length) return 0
    return Math.round((items.filter(i => i.completed).length / items.length) * 100)
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#f8fafc' }}>
        <NavBar />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 'calc(100vh - 64px)' }}>
          <p style={{ color: '#6b7280', fontSize: 15 }}>Loading your pilot projects…</p>
        </div>
      </div>
    )
  }

  if (!projects.length) {
    return (
      <div style={{ minHeight: '100vh', background: '#f8fafc' }}>
        <NavBar />
        <div style={{ maxWidth: 600, margin: '80px auto', textAlign: 'center', padding: '0 24px' }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>🚀</div>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#111827', margin: '0 0 8px' }}>No pilot projects yet</h2>
          <p style={{ color: '#6b7280', fontSize: 15 }}>You haven't been assigned to any EventPilot pilot projects.</p>
        </div>
      </div>
    )
  }

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
            These are your assigned EventPilot Pilot Projects. Complete your checklist items to unlock the build phase.
            {' '}For scope and architecture questions, coordinate directly with{' '}
            <strong style={{ color: '#111827' }}>Durga (dc@tresconglobal.com)</strong>.
          </p>
        </div>

        {/* Projects */}
        {projects.map(project => {
          const myItems = project.checklist.filter(i => !isAdmin || i.assigned_to === staffId)
          const allItems = project.checklist
          const myPct = progress(myItems)
          const statusMeta = STATUS_COLORS[project.status] ?? STATUS_COLORS.active
          const roleMeta = ROLE_COLORS[project.myRole ?? ''] ?? { bg: '#f3f4f6', color: '#374151' }

          // Group by person for tracker view
          const byPerson: Record<string, { name: string; items: ChecklistItem[] }> = {}
          if (isAdmin || project.myRole === 'tracking') {
            allItems.forEach(item => {
              const key = item.assigned_to
              if (!byPerson[key]) {
                byPerson[key] = { name: item.staff?.name ?? 'Unknown', items: [] }
              }
              byPerson[key].items.push(item)
            })
          }

          const isTrackerView = isAdmin || project.myRole === 'tracking'

          return (
            <div key={project.id} style={{ background: '#fff', borderRadius: 14, border: '1px solid #e5e7eb', marginBottom: 28, overflow: 'hidden' }}>

              {/* Project header */}
              <div style={{ padding: '24px 28px', borderBottom: '1px solid #f3f4f6' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                  <div>
                    <h2 style={{ fontSize: 19, fontWeight: 700, color: '#111827', margin: '0 0 6px' }}>{project.name}</h2>
                    {project.description && (
                      <p style={{ color: '#6b7280', fontSize: 14, margin: '0 0 12px', lineHeight: 1.6 }}>{project.description}</p>
                    )}
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 12, fontWeight: 600, padding: '3px 10px', borderRadius: 999, background: statusMeta.bg, color: statusMeta.color }}>
                        {statusMeta.label}
                      </span>
                      {project.myRole && (
                        <span style={{ fontSize: 12, fontWeight: 600, padding: '3px 10px', borderRadius: 999, background: roleMeta.bg, color: roleMeta.color }}>
                          Your role: {ROLE_LABELS[project.myRole] ?? project.myRole}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Progress ring */}
                  {!isTrackerView && (
                    <div style={{ textAlign: 'center', minWidth: 64 }}>
                      <div style={{ fontSize: 26, fontWeight: 800, color: myPct === 100 ? '#16a34a' : '#111827' }}>{myPct}%</div>
                      <div style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>Complete</div>
                    </div>
                  )}
                </div>

                {/* Members row */}
                <div style={{ display: 'flex', gap: 16, marginTop: 16, flexWrap: 'wrap' }}>
                  {project.members.map(m => {
                    const mRole = ROLE_COLORS[m.role] ?? { bg: '#f3f4f6', color: '#374151' }
                    return (
                      <div key={m.staff_id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ width: 28, height: 28, borderRadius: '50%', background: mRole.bg, color: mRole.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700 }}>
                          {(m.staff?.name ?? '?').split(' ').map(w => w[0]).join('').slice(0, 2)}
                        </div>
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 600, color: '#111827' }}>{m.staff?.name ?? 'Unknown'}</div>
                          <div style={{ fontSize: 11, color: '#9ca3af' }}>{ROLE_LABELS[m.role] ?? m.role}</div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Checklist — personal view */}
              {!isTrackerView && (
                <div style={{ padding: '20px 28px' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 14 }}>
                    Your Checklist — {myItems.filter(i => i.completed).length} of {myItems.length} done
                  </div>
                  {myItems.length === 0 ? (
                    <p style={{ color: '#9ca3af', fontSize: 14 }}>No checklist items assigned to you yet.</p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      {myItems.map((item, idx) => (
                        <ChecklistRow
                          key={item.id}
                          item={item}
                          index={idx + 1}
                          toggling={toggling === item.id}
                          onToggle={() => toggleItem(item.id, item.completed)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Tracker view — grouped by person */}
              {isTrackerView && (
                <div style={{ padding: '20px 28px' }}>
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
                            <ChecklistRow
                              key={item.id}
                              item={item}
                              index={idx + 1}
                              toggling={toggling === item.id}
                              onToggle={() => toggleItem(item.id, item.completed)}
                              readonly={!isAdmin && item.assigned_to !== staffId}
                            />
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}

        {/* Guidance footer */}
        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '16px 20px', marginTop: 8 }}>
          <p style={{ margin: 0, fontSize: 14, color: '#92400e', lineHeight: 1.7 }}>
            <strong>How this works:</strong> Complete your checklist items before writing any prompts for Durga.
            Scope decisions must be aligned with Durga directly — these can't be decided in isolation.
            Madhu has reviewed all projects at a high level and is available for strategic input, not day-to-day decisions.
            For the SME context guide (how to write good prompts), see <strong>SME_CONTEXT.md</strong> in the shared repo or ask Durga for a copy.
          </p>
        </div>

      </div>
    </div>
  )
}

function ChecklistRow({
  item, index, toggling, onToggle, readonly = false,
}: {
  item: ChecklistItem
  index: number
  toggling: boolean
  onToggle: () => void
  readonly?: boolean
}) {
  const catMeta = item.category ? CAT_LABELS[item.category] : null

  return (
    <div style={{
      display: 'flex',
      alignItems: 'flex-start',
      gap: 12,
      padding: '11px 14px',
      borderRadius: 8,
      background: item.completed ? '#f0fdf4' : '#fafafa',
      border: `1px solid ${item.completed ? '#bbf7d0' : '#e5e7eb'}`,
      opacity: toggling ? 0.6 : 1,
      transition: 'all 0.15s',
      cursor: readonly ? 'default' : 'pointer',
    }}
      onClick={() => !readonly && !toggling && onToggle()}
    >
      {/* Checkbox */}
      <div style={{
        width: 20, height: 20, borderRadius: 4, border: `2px solid ${item.completed ? '#16a34a' : '#d1d5db'}`,
        background: item.completed ? '#16a34a' : '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0, marginTop: 1,
        cursor: readonly ? 'default' : 'pointer',
      }}>
        {item.completed && (
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
            <path d="M2 6l3 3 5-5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, color: '#9ca3af', fontWeight: 600, flexShrink: 0 }}>#{index}</span>
          <span style={{ fontSize: 14, fontWeight: 600, color: item.completed ? '#6b7280' : '#111827', textDecoration: item.completed ? 'line-through' : 'none' }}>
            {item.title}
          </span>
          {catMeta && (
            <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 999, background: '#f3f4f6', color: '#6b7280', fontWeight: 600, flexShrink: 0 }}>
              {catMeta}
            </span>
          )}
        </div>
        {item.description && (
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#6b7280', lineHeight: 1.5 }}>{item.description}</p>
        )}
        {item.completed && item.completed_at && (
          <p style={{ margin: '3px 0 0', fontSize: 11, color: '#16a34a' }}>
            Done {new Date(item.completed_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
          </p>
        )}
      </div>
    </div>
  )
}
