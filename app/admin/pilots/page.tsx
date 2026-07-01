'use client'

import { useEffect, useState } from 'react'
import NavBar from '@/app/components/NavBar'
import Link from 'next/link'

type ChecklistItem = {
  id: string
  title: string
  category: string | null
  completed: boolean
  completed_at: string | null
  assigned_to: string
  staff: { name: string; email: string } | null
}

type Member = {
  staff_id: string
  role: string
  staff: { name: string; role: string; email: string } | null
}

type Project = {
  id: string
  name: string
  description: string | null
  status: string
  members: Member[]
  checklist: ChecklistItem[]
}

const ROLE_LABELS: Record<string, string> = { pilot: 'Pilot', consulting: 'Consulting', tracking: 'Tracking' }
const STATUS_META: Record<string, { bg: string; color: string; label: string }> = {
  active:   { bg: '#eff6ff', color: '#1d4ed8', label: 'Active' },
  building: { bg: '#fef9c3', color: '#854d0e', label: 'In Build' },
  testing:  { bg: '#fdf4ff', color: '#7e22ce', label: 'Testing' },
  complete: { bg: '#f0fdf4', color: '#166534', label: 'Complete' },
  paused:   { bg: '#f9fafb', color: '#6b7280', label: 'Paused' },
}

export default function AdminPilotsPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading]   = useState(true)
  const [active, setActive]     = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/pilots').then(r => r.json()).then(d => {
      setProjects(d.projects ?? [])
      if (d.projects?.length) setActive(d.projects[0].id)
      setLoading(false)
    })
  }, [])

  const toggleItem = async (itemId: string, current: boolean) => {
    await fetch(`/api/pilots/checklist/${itemId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed: !current }),
    })
    setProjects(prev => prev.map(p => ({
      ...p,
      checklist: p.checklist.map(i => i.id === itemId ? { ...i, completed: !current } : i),
    })))
  }

  const progress = (items: ChecklistItem[]) =>
    items.length ? Math.round((items.filter(i => i.completed).length / items.length) * 100) : 0

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#f8fafc' }}>
        <NavBar />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 400 }}>
          <p style={{ color: '#6b7280' }}>Loading pilot projects…</p>
        </div>
      </div>
    )
  }

  const activeProject = projects.find(p => p.id === active)

  // Group checklist by person
  const byPerson: Record<string, { name: string; email: string; role: string; items: ChecklistItem[] }> = {}
  if (activeProject) {
    activeProject.checklist.forEach(item => {
      const key = item.assigned_to
      if (!byPerson[key]) {
        byPerson[key] = {
          name:  item.staff?.name  ?? 'Unknown',
          email: item.staff?.email ?? '',
          role:  activeProject.members.find(m => m.staff_id === item.assigned_to)?.role ?? '',
          items: [],
        }
      }
      byPerson[key].items.push(item)
    })
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc' }}>
      <NavBar />
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '40px 24px' }}>

        {/* Page header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 32 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <Link href="/admin" style={{ fontSize: 13, color: '#6b7280', textDecoration: 'none' }}>← Admin</Link>
            </div>
            <h1 style={{ fontSize: 26, fontWeight: 800, color: '#111827', margin: 0 }}>Pilot Projects</h1>
            <p style={{ color: '#6b7280', fontSize: 14, margin: '4px 0 0' }}>
              {projects.length} active project{projects.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 24, alignItems: 'start' }}>

          {/* Sidebar — project list */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {projects.map(p => {
              const sm = STATUS_META[p.status] ?? STATUS_META.active
              const pct = progress(p.checklist)
              const isActive = active === p.id
              return (
                <button key={p.id} onClick={() => setActive(p.id)} style={{
                  textAlign: 'left', background: isActive ? '#0d9488' : '#fff',
                  border: `1px solid ${isActive ? '#0d9488' : '#e5e7eb'}`,
                  borderRadius: 10, padding: '14px 16px', cursor: 'pointer', transition: 'all 0.15s',
                }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: isActive ? '#fff' : '#111827', marginBottom: 6 }}>{p.name}</div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 999,
                      background: isActive ? 'rgba(255,255,255,0.2)' : sm.bg,
                      color: isActive ? '#fff' : sm.color }}>
                      {sm.label}
                    </span>
                    <span style={{ fontSize: 12, color: isActive ? 'rgba(255,255,255,0.7)' : '#6b7280', fontWeight: 600 }}>{pct}%</span>
                  </div>
                  {/* mini progress bar */}
                  <div style={{ marginTop: 8, height: 3, borderRadius: 2, background: isActive ? 'rgba(255,255,255,0.2)' : '#e5e7eb' }}>
                    <div style={{ height: '100%', borderRadius: 2, width: `${pct}%`, background: isActive ? '#fff' : '#0d9488', transition: 'width 0.3s' }} />
                  </div>
                </button>
              )
            })}
          </div>

          {/* Main — active project detail */}
          {activeProject && (
            <div>
              <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e5e7eb', overflow: 'hidden' }}>

                {/* Project header */}
                <div style={{ padding: '24px 28px', borderBottom: '1px solid #f3f4f6' }}>
                  <h2 style={{ fontSize: 20, fontWeight: 700, color: '#111827', margin: '0 0 6px' }}>{activeProject.name}</h2>
                  {activeProject.description && (
                    <p style={{ color: '#6b7280', fontSize: 14, margin: '0 0 16px', lineHeight: 1.6 }}>{activeProject.description}</p>
                  )}
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    {activeProject.members.map(m => (
                      <div key={m.staff_id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', background: '#f9fafb', borderRadius: 8, border: '1px solid #e5e7eb' }}>
                        <div style={{ width: 30, height: 30, borderRadius: '50%', background: '#0d9488', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700 }}>
                          {(m.staff?.name ?? '?').split(' ').map(w => w[0]).join('').slice(0, 2)}
                        </div>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{m.staff?.name}</div>
                          <div style={{ fontSize: 11, color: '#6b7280' }}>{ROLE_LABELS[m.role] ?? m.role} · {m.staff?.email}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Checklist grouped by person */}
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
                            <span style={{ fontSize: 12, color: '#9ca3af', marginLeft: 8 }}>{ROLE_LABELS[person.role] ?? person.role}</span>
                          </div>
                          <span style={{ fontSize: 13, fontWeight: 700, color: pct === 100 ? '#16a34a' : '#6b7280' }}>{pct}%</span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {person.items.map(item => (
                            <div key={item.id}
                              onClick={() => toggleItem(item.id, item.completed)}
                              style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px', borderRadius: 8, border: `1px solid ${item.completed ? '#bbf7d0' : '#e5e7eb'}`, background: item.completed ? '#f0fdf4' : '#fafafa', cursor: 'pointer' }}>
                              <div style={{ width: 18, height: 18, borderRadius: 4, border: `2px solid ${item.completed ? '#16a34a' : '#d1d5db'}`, background: item.completed ? '#16a34a' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                                {item.completed && (
                                  <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                                    <path d="M2 6l3 3 5-5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                  </svg>
                                )}
                              </div>
                              <span style={{ fontSize: 13, color: item.completed ? '#6b7280' : '#111827', textDecoration: item.completed ? 'line-through' : 'none', lineHeight: 1.5, fontWeight: 500 }}>
                                {item.title}
                              </span>
                              {item.category && (
                                <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 999, background: '#f3f4f6', color: '#6b7280', fontWeight: 600, flexShrink: 0, marginLeft: 'auto' }}>
                                  {item.category.replace('_', ' ')}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
