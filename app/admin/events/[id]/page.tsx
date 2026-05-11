'use client'

import { useState, useEffect, use } from 'react'
import Link from 'next/link'

type ChecklistItem = {
  id: string
  department: string
  title: string
  status: 'not_started' | 'in_progress' | 'done' | 'overdue'
  due_date: string | null
  completed_at: string | null
  notes: string | null
  sort_order: number
  owner: { id: string; name: string; department: string } | null
}

type Event = {
  id: string
  name: string
  type: string
  status: string
  event_date: string | null
  venue: string | null
  city: string | null
  client_name: string | null
  description: string | null
  expected_attendance: number | null
}

type StaffMember = { id: string; name: string; department: string }

type DraftReport = {
  id: string
  title: string
  extracted_text: string
  status: 'draft' | 'live'
  created_at: string
}

type Comment = {
  id: string
  comment: string
  resolved: boolean
  created_at: string
  staff: { id: string; name: string; department: string } | null
}

const DEPT_COLORS: Record<string, string> = {
  Operations: '#00897B',
  Marketing:  '#A78BFA',
  Sales:      '#F59E0B',
  Finance:    '#34D399',
  Content:    '#60A5FA',
  HR:         '#F472B6',
}

const STATUS_CONFIG = {
  not_started: { label: 'Not Started', color: '#0F1923',  bg: '#FFFFFF'  },
  in_progress: { label: 'In Progress', color: '#92400E',               bg: 'rgba(245,158,11,0.1)'    },
  done:        { label: 'Done',        color: '#3D6B00',               bg: 'rgba(192,244,60,0.1)'    },
  overdue:     { label: 'Overdue',     color: '#FF6B6B',               bg: 'rgba(255,107,107,0.1)'   },
}

export default function EventWorkspacePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = use(params)

  const [event,         setEvent]         = useState<Event | null>(null)
  const [checklist,     setChecklist]     = useState<ChecklistItem[]>([])
  const [staffList,     setStaffList]     = useState<StaffMember[]>([])
  const [loading,       setLoading]       = useState(true)
  const [generating,    setGenerating]    = useState(false)
  const [editingId,     setEditingId]     = useState<string | null>(null)
  const [editDraft,     setEditDraft]     = useState<Partial<ChecklistItem>>({})
  const [addingDept,    setAddingDept]    = useState<string | null>(null)
  const [newItemTitle,  setNewItemTitle]  = useState('')
  const [msg,           setMsg]           = useState('')
  const [report,        setReport]        = useState<DraftReport | null>(null)
  const [comments,      setComments]      = useState<Comment[]>([])
  const [commentText,   setCommentText]   = useState('')
  const [reportBusy,    setReportBusy]    = useState(false)
  const [commentSaving, setCommentSaving] = useState(false)

  useEffect(() => {
    fetchAll()
  }, [eventId])

  async function fetchAll() {
    setLoading(true)
    const [evRes, clRes, stRes, rpRes] = await Promise.all([
      fetch(`/api/events?id=${eventId}`),
      fetch(`/api/events/checklist?event_id=${eventId}`),
      fetch('/api/staff-list'),
      fetch(`/api/documents/generate-report?event_id=${eventId}`),
    ])
    const evData = await evRes.json().catch(() => null)
    const clData = await clRes.json().catch(() => [])
    const stData = await stRes.json().catch(() => [])
    const rpData = await rpRes.json().catch(() => null)

    setEvent(Array.isArray(evData) ? evData[0] : evData)
    setChecklist(Array.isArray(clData) ? clData : [])
    setStaffList(Array.isArray(stData) ? stData : [])
    const rp = rpData?.id ? rpData : null
    setReport(rp)
    if (rp) fetchComments(rp.id)
    setLoading(false)
  }

  async function fetchComments(docId: string) {
    const res  = await fetch(`/api/documents/comments?document_id=${docId}`)
    const data = await res.json().catch(() => [])
    setComments(Array.isArray(data) ? data : [])
  }

  async function generateReport() {
    setReportBusy(true)
    setMsg('')
    const res  = await fetch('/api/documents/generate-report', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ event_id: eventId }),
    })
    const data = await res.json()
    if (res.ok) {
      setReport(data)
      setComments([])
      setMsg('Draft report generated. Review it, add comments, then conclude when ready.')
    } else {
      setMsg(data.error ?? 'Failed to generate report.')
    }
    setReportBusy(false)
  }

  async function addComment() {
    if (!commentText.trim() || !report) return
    setCommentSaving(true)
    await fetch('/api/documents/comments', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ document_id: report.id, comment: commentText.trim() }),
    })
    setCommentText('')
    fetchComments(report.id)
    setCommentSaving(false)
  }

  async function resolveComment(id: string, resolved: boolean) {
    await fetch(`/api/documents/comments?id=${id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ resolved }),
    })
    fetchComments(report!.id)
  }

  async function deleteComment(id: string) {
    await fetch(`/api/documents/comments?id=${id}`, { method: 'DELETE' })
    fetchComments(report!.id)
  }

  async function concludeReport() {
    if (!report) return
    setReportBusy(true)
    const res  = await fetch(`/api/documents/generate-report?id=${report.id}`, { method: 'PATCH' })
    const data = await res.json()
    if (res.ok) {
      setReport(data)
      setMsg('Report concluded. It is now live in the knowledge base — Tresci can answer questions from it.')
    } else {
      setMsg(data.error ?? 'Failed to conclude report.')
    }
    setReportBusy(false)
  }

  async function generateChecklist() {
    setGenerating(true)
    setMsg('')
    const res  = await fetch('/api/events/checklist', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ event_id: eventId, generate: true, regenerate: checklist.length > 0 }),
    })
    const data = await res.json()
    if (res.ok) {
      setMsg(`Checklist generated — ${data.count} items across departments.`)
      fetchAll()
    } else {
      setMsg(data.error ?? 'Failed to generate checklist.')
    }
    setGenerating(false)
  }

  async function updateItem(id: string, patch: Partial<ChecklistItem>) {
    await fetch(`/api/events/checklist?id=${id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(patch),
    })
    fetchAll()
  }

  async function deleteItem(id: string) {
    await fetch(`/api/events/checklist?id=${id}`, { method: 'DELETE' })
    fetchAll()
  }

  async function addItem(department: string) {
    if (!newItemTitle.trim()) return
    await fetch('/api/events/checklist', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ event_id: eventId, department, title: newItemTitle.trim() }),
    })
    setNewItemTitle('')
    setAddingDept(null)
    fetchAll()
  }

  function saveEdit(id: string) {
    updateItem(id, editDraft)
    setEditingId(null)
    setEditDraft({})
  }

  // Group by department
  const byDept = checklist.reduce<Record<string, ChecklistItem[]>>((acc, item) => {
    if (!acc[item.department]) acc[item.department] = []
    acc[item.department].push(item)
    return acc
  }, {})

  // Stats
  const total   = checklist.length
  const done    = checklist.filter(i => i.status === 'done').length
  const overdue = checklist.filter(i => i.status === 'overdue' || (i.due_date && new Date(i.due_date) < new Date() && i.status !== 'done')).length
  const inProg  = checklist.filter(i => i.status === 'in_progress').length
  const pct     = total > 0 ? Math.round((done / total) * 100) : 0

  if (loading) return (
    <div style={{ fontFamily: 'var(--font-manrope), Manrope, sans-serif', background: '#E8EEF4', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: '#0F1923', fontSize: '13px' }}>Loading event workspace…</div>
    </div>
  )

  if (!event) return (
    <div style={{ fontFamily: 'var(--font-manrope), Manrope, sans-serif', background: '#E8EEF4', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: '#FF6B6B', fontSize: '13px' }}>Event not found.</div>
    </div>
  )

  return (
    <div style={{ fontFamily: 'var(--font-manrope), Manrope, sans-serif', background: '#E8EEF4', minHeight: '100vh', color: '#0F1923' }}>

      {/* Nav */}
      <nav style={{ background: '#FFFFFF', borderBottom: '1px solid #DDE8EE', padding: '0 32px', height: '64px', display: 'flex', alignItems: 'center', gap: '16px', boxShadow: '0 1px 3px rgba(0,165,163,0.08)', position: 'sticky', top: 0, zIndex: 100 }}>
        <Link href="/admin" style={{ fontSize: '13px', color: '#0F1923', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
          Admin
        </Link>
        <span style={{ color: '#2D3E50' }}>/</span>
        <span style={{ fontSize: '13px', color: '#0F1923' }}>Events</span>
        <span style={{ color: '#2D3E50' }}>/</span>
        <span style={{ fontSize: '13px', fontWeight: 700, color: '#0F1923' }}>{event.name}</span>
      </nav>

      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '40px 32px' }}>

        {/* Event header */}
        <div style={{ marginBottom: '32px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '24px', flexWrap: 'wrap' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                <div style={{ fontSize: '13px', fontWeight: 800, letterSpacing: '2px', textTransform: 'uppercase', color: '#00695C' }}>Event Workspace</div>
                <div style={{ fontSize: '13px', fontWeight: 700, padding: '2px 10px', borderRadius: '16px', background: event.status === 'active' ? 'rgba(192,244,60,0.15)' : '#FFFFFF', color: event.status === 'active' ? '#00695C' : '#2D3E50' }}>
                  {event.status}
                </div>
              </div>
              <h1 style={{ fontSize: '36px', fontWeight: 900, color: '#0F1923', margin: '0 0 6px', letterSpacing: '-0.5px' }}>{event.name}</h1>
              <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
                {event.city && <span style={{ fontSize: '13px', color: '#2D3E50' }}>{event.city}</span>}
                {event.event_date && <span style={{ fontSize: '13px', color: '#2D3E50' }}>{new Date(event.event_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</span>}
                {event.venue && <span style={{ fontSize: '13px', color: '#2D3E50' }}>{event.venue}</span>}
                {event.client_name && <span style={{ fontSize: '13px', color: '#2D3E50' }}>{event.client_name}</span>}
              </div>
            </div>

            {/* Generate checklist button */}
            <button
              onClick={generateChecklist}
              disabled={generating}
              style={{ padding: '14px 26px', borderRadius: '12px', border: 'none', background: generating ? '#E4EEF2' : '#C0F43C', color: generating ? '#0F1923' : '#0F1923', fontSize: '13px', fontWeight: 800, cursor: generating ? 'not-allowed' : 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '8px', whiteSpace: 'nowrap' }}>
              <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
              {generating ? 'AI generating checklist…' : checklist.length > 0 ? 'Regenerate Checklist' : 'Generate Checklist with AI'}
            </button>
          </div>

          {msg && (
            <div style={{ marginTop: '16px', padding: '10px 16px', borderRadius: '10px', background: msg.includes('generated') || msg.includes('Generated') ? 'rgba(192,244,60,0.08)' : 'rgba(255,107,107,0.08)', border: `1px solid ${msg.includes('generated') || msg.includes('Generated') ? 'rgba(192,244,60,0.25)' : 'rgba(255,107,107,0.25)'}`, color: msg.includes('generated') || msg.includes('Generated') ? '#00695C' : '#FF6B6B', fontSize: '13px' }}>
              {msg}
            </div>
          )}
        </div>

        {/* Content Campaigns shortcut */}
        <div style={{ marginBottom: '32px', background: 'rgba(167,139,250,0.05)', border: '1px solid rgba(167,139,250,0.18)', borderRadius: '16px', padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ width: '44px', height: '44px', background: 'rgba(167,139,250,0.12)', border: '1px solid rgba(167,139,250,0.25)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="20" height="20" fill="none" stroke="#A78BFA" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </div>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 800, color: '#0F1923', marginBottom: '3px' }}>Content Campaigns</div>
              <div style={{ fontSize: '13px', color: '#2D3E50' }}>Manage social media campaigns and posts for this event</div>
            </div>
          </div>
          <Link
            href={`/content?event_id=${eventId}`}
            style={{ padding: '10px 20px', borderRadius: '10px', background: 'rgba(167,139,250,0.15)', border: '1px solid rgba(167,139,250,0.3)', color: '#A78BFA', fontSize: '13px', fontWeight: 700, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '8px', whiteSpace: 'nowrap' }}
          >
            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            Open Campaigns
          </Link>
        </div>

        {/* Progress stats */}
        {checklist.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '32px' }}>
            {[
              { label: 'Total Items',  value: total,   accent: '#00897B' },
              { label: 'Completed',    value: done,    accent: '#3D6B00' },
              { label: 'In Progress',  value: inProg,  accent: '#D97706' },
              { label: 'Overdue',      value: overdue, accent: '#DC2626' },
            ].map(s => (
              <div key={s.label} style={{ background: '#FFFFFF', border: '1px solid #DDE8EE', borderTop: `4px solid ${s.accent}`, borderRadius: '14px', padding: '20px', boxShadow: '0 2px 8px rgba(15,25,35,0.06)' }}>
                <div style={{ fontSize: '40px', fontWeight: 900, color: s.accent, lineHeight: 1, marginBottom: '6px' }}>{s.value}</div>
                <div style={{ fontSize: '11px', color: '#5B7080', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1.2px' }}>{s.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Progress bar */}
        {checklist.length > 0 && (
          <div style={{ marginBottom: '32px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontSize: '13px', fontWeight: 700, color: '#2D3E50' }}>Overall Progress</span>
              <span style={{ fontSize: '13px', fontWeight: 800, color: '#3D6B00' }}>{pct}%</span>
            </div>
            <div style={{ height: '6px', background: '#EEF2F7', borderRadius: '3px', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${pct}%`, background: 'linear-gradient(90deg, #00A5A3, #C0F43C)', borderRadius: '3px', transition: 'width 0.5s ease' }} />
            </div>
          </div>
        )}

        {/* Empty state */}
        {checklist.length === 0 && !generating && (
          <div style={{ textAlign: 'center', padding: '80px 0' }}>
            <div style={{ width: '64px', height: '64px', background: 'rgba(192,244,60,0.08)', border: '1px solid rgba(192,244,60,0.2)', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
              <svg width="28" height="28" fill="none" stroke="#007A6E" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
            </div>
            <h3 style={{ fontSize: '36px', fontWeight: 800, color: '#0F1923', margin: '0 0 8px' }}>No checklist yet</h3>
            <p style={{ fontSize: '13px', color: '#2D3E50', margin: '0 0 28px' }}>
              Click "Generate Checklist with AI" — Tresci will build a complete<br />department-by-department checklist for this event instantly.
            </p>
          </div>
        )}

        {/* Checklist by department */}
        {Object.keys(byDept).sort().map(dept => {
          const items   = byDept[dept]
          const dColor  = DEPT_COLORS[dept] ?? '#00897B'
          const dDone   = items.filter(i => i.status === 'done').length
          const dTotal  = items.length

          return (
            <div key={dept} style={{ marginBottom: '24px', background: '#FFFFFF', border: '1px solid #D8EAEB', borderRadius: '16px', overflow: 'hidden' }}>

              {/* Department header */}
              <div style={{ padding: '16px 22px', borderBottom: '1px solid #D8EAEB', display: 'flex', alignItems: 'center', gap: '12px', background: `rgba(${dColor === '#00897B' ? '0,165,163' : dColor === '#A78BFA' ? '167,139,250' : dColor === '#F59E0B' ? '245,158,11' : dColor === '#34D399' ? '52,211,153' : dColor === '#60A5FA' ? '96,165,250' : '244,114,182'},0.06)` }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: dColor }} />
                <span style={{ fontSize: '13px', fontWeight: 800, color: dColor, letterSpacing: '0.5px' }}>{dept}</span>
                <span style={{ fontSize: '13px', color: '#0F1923', marginLeft: 'auto' }}>{dDone}/{dTotal} done</span>
                {/* Mini progress */}
                <div style={{ width: '80px', height: '4px', background: '#EEF2F7', borderRadius: '2px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${dTotal > 0 ? (dDone / dTotal) * 100 : 0}%`, background: dColor, borderRadius: '2px' }} />
                </div>
              </div>

              {/* Items */}
              <div>
                {items.map((item, idx) => {
                  const isEditing = editingId === item.id
                  const sCfg = STATUS_CONFIG[item.status] ?? STATUS_CONFIG.not_started
                  const isLate = item.due_date && new Date(item.due_date) < new Date() && item.status !== 'done'

                  return (
                    <div key={item.id} style={{ padding: '14px 22px', borderBottom: idx < items.length - 1 ? '1px solid #EEF4F4' : 'none', display: 'flex', alignItems: 'flex-start', gap: '14px' }}>

                      {/* Status toggle */}
                      <button
                        onClick={() => {
                          const next = item.status === 'not_started' ? 'in_progress' : item.status === 'in_progress' ? 'done' : 'not_started'
                          updateItem(item.id, { status: next })
                        }}
                        style={{ width: '22px', height: '22px', borderRadius: '6px', border: `2px solid ${item.status === 'done' ? '#C0F43C' : 'rgba(15,23,42,0.16)'}`, background: item.status === 'done' ? '#C0F43C' : 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '1px', transition: 'all 0.15s' }}>
                        {item.status === 'done' && (
                          <svg width="12" height="12" fill="none" stroke="#0F1923" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                        )}
                        {item.status === 'in_progress' && (
                          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#F59E0B' }} />
                        )}
                      </button>

                      {/* Content */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {isEditing ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <input
                              value={editDraft.title ?? item.title}
                              onChange={e => setEditDraft(p => ({ ...p, title: e.target.value }))}
                              style={{ padding: '7px 12px', borderRadius: '8px', border: '1px solid #B8CDD8', background: '#FFFFFF', color: '#0F1923', fontSize: '13px', fontFamily: 'inherit' }}
                            />
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                              <input type="date"
                                value={editDraft.due_date ?? item.due_date ?? ''}
                                onChange={e => setEditDraft(p => ({ ...p, due_date: e.target.value }))}
                                style={{ padding: '6px 10px', borderRadius: '8px', border: '1px solid #D8EAEB', background: '#FFFFFF', color: '#0F1923', fontSize: '13px', fontFamily: 'inherit' }}
                              />
                              <select
                                value={editDraft.owner?.id ?? item.owner?.id ?? ''}
                                onChange={e => {
                                  const s = staffList.find(x => x.id === e.target.value)
                                  setEditDraft(p => ({ ...p, owner: s ? { id: s.id, name: s.name, department: s.department } : undefined }))
                                }}
                                style={{ padding: '6px 10px', borderRadius: '8px', border: '1px solid #D8EAEB', background: '#FFFFFF', color: '#0F1923', fontSize: '13px', fontFamily: 'inherit', flex: 1 }}
                              >
                                <option value="">Assign owner…</option>
                                {staffList.map(s => <option key={s.id} value={s.id}>{s.name} — {s.department}</option>)}
                              </select>
                              <textarea
                                value={editDraft.notes ?? item.notes ?? ''}
                                onChange={e => setEditDraft(p => ({ ...p, notes: e.target.value }))}
                                placeholder="Notes…"
                                rows={2}
                                style={{ width: '100%', padding: '7px 12px', borderRadius: '8px', border: '1px solid #D8EAEB', background: '#FFFFFF', color: '#0F1923', fontSize: '13px', fontFamily: 'inherit', resize: 'vertical' }}
                              />
                            </div>
                            <div style={{ display: 'flex', gap: '8px' }}>
                              <button onClick={() => saveEdit(item.id)} style={{ padding: '6px 16px', borderRadius: '8px', border: 'none', background: '#C0F43C', color: '#0F1923', fontSize: '13px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>Save</button>
                              <button onClick={() => { setEditingId(null); setEditDraft({}) }} style={{ padding: '6px 14px', borderRadius: '8px', border: '1px solid #D8EAEB', background: 'transparent', color: '#0F1923', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
                              <button onClick={() => deleteItem(item.id)} style={{ padding: '6px 14px', borderRadius: '8px', border: 'none', background: 'rgba(255,107,107,0.1)', color: '#FF6B6B', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', marginLeft: 'auto' }}>Delete</button>
                            </div>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '13px', fontWeight: 600, color: item.status === 'done' ? '#0F1923' : '#0F1923', textDecoration: item.status === 'done' ? 'line-through' : 'none', flex: 1 }}>
                              {item.title}
                            </span>
                            {item.owner && (
                              <span style={{ fontSize: '13px', color: '#2D3E50', background: '#FFFFFF', padding: '2px 8px', borderRadius: '6px', whiteSpace: 'nowrap' }}>
                                {item.owner.name}
                              </span>
                            )}
                            {item.due_date && (
                              <span style={{ fontSize: '13px', fontWeight: 600, color: isLate ? '#FF6B6B' : '#2D3E50', whiteSpace: 'nowrap' }}>
                                {isLate ? 'Overdue · ' : ''}{new Date(item.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                              </span>
                            )}
                            <span style={{ fontSize: '13px', fontWeight: 700, padding: '2px 8px', borderRadius: '6px', background: sCfg.bg, color: sCfg.color, whiteSpace: 'nowrap' }}>
                              {sCfg.label}
                            </span>
                            <button onClick={() => { setEditingId(item.id); setEditDraft({}) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#0F1923', padding: '2px', display: 'flex', alignItems: 'center' }}>
                              <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                            </button>
                          </div>
                        )}
                        {item.notes && !isEditing && (
                          <p style={{ fontSize: '13px', color: '#0F1923', margin: '4px 0 0', lineHeight: 1.65 }}>{item.notes}</p>
                        )}
                      </div>
                    </div>
                  )
                })}

                {/* Add item row */}
                {addingDept === dept ? (
                  <div style={{ padding: '12px 22px', borderTop: '1px solid #D8EAEB', display: 'flex', gap: '8px' }}>
                    <input
                      autoFocus
                      value={newItemTitle}
                      onChange={e => setNewItemTitle(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') addItem(dept); if (e.key === 'Escape') { setAddingDept(null); setNewItemTitle('') } }}
                      placeholder="Add checklist item…"
                      style={{ flex: 1, padding: '8px 12px', borderRadius: '8px', border: '1px solid #B8CDD8', background: '#FFFFFF', color: '#0F1923', fontSize: '13px', fontFamily: 'inherit' }}
                    />
                    <button onClick={() => addItem(dept)} style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', background: dColor, color: '#0F1923', fontSize: '13px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>Add</button>
                    <button onClick={() => { setAddingDept(null); setNewItemTitle('') }} style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #D8EAEB', background: 'transparent', color: '#0F1923', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
                  </div>
                ) : (
                  <button onClick={() => setAddingDept(dept)} style={{ width: '100%', padding: '10px 22px', background: 'none', border: 'none', cursor: 'pointer', color: '#0F1923', fontSize: '13px', fontWeight: 600, textAlign: 'left', fontFamily: 'inherit', borderTop: '1px solid #D8EAEB', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    Add item to {dept}
                  </button>
                )}
              </div>
            </div>
          )
        })}
        {/* ── Event Report Section ── */}
        <div style={{ marginTop: '48px', paddingTop: '40px', borderTop: '1px solid #D8EAEB' }}>

          {/* Section header */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '20px', marginBottom: '28px', flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 800, letterSpacing: '2px', textTransform: 'uppercase', color: '#A78BFA', marginBottom: '6px' }}>AI Generated</div>
              <h2 style={{ fontSize: '36px', fontWeight: 900, color: '#0F1923', margin: '0 0 6px', letterSpacing: '-0.3px' }}>Event Report</h2>
              <p style={{ fontSize: '13px', color: '#2D3E50', margin: 0 }}>
                Generated from the checklist and team inputs. Add comments before concluding.
              </p>
            </div>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
              {report && (
                <span style={{ fontSize: '13px', fontWeight: 700, padding: '4px 12px', borderRadius: '16px', background: report.status === 'live' ? 'rgba(192,244,60,0.12)' : 'rgba(167,139,250,0.12)', color: report.status === 'live' ? '#00695C' : '#A78BFA', border: `1px solid ${report.status === 'live' ? 'rgba(192,244,60,0.25)' : 'rgba(167,139,250,0.25)'}` }}>
                  {report.status === 'live' ? 'Live · In Knowledge Base' : 'Draft · Pending Review'}
                </span>
              )}
              {checklist.length > 0 && (
                <button
                  onClick={generateReport}
                  disabled={reportBusy}
                  style={{ padding: '10px 20px', borderRadius: '10px', border: '1px solid rgba(167,139,250,0.3)', background: reportBusy ? '#FFFFFF' : 'rgba(167,139,250,0.1)', color: reportBusy ? '#0F1923' : '#A78BFA', fontSize: '13px', fontWeight: 700, cursor: reportBusy ? 'not-allowed' : 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '7px' }}>
                  <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                  {reportBusy ? 'Generating…' : report ? 'Regenerate Report' : 'Generate Report'}
                </button>
              )}
            </div>
          </div>

          {!report && checklist.length === 0 && (
            <div style={{ padding: '40px', textAlign: 'center', background: '#FFFFFF', border: '1px solid #D8EAEB', borderRadius: '16px' }}>
              <p style={{ fontSize: '13px', color: '#0F1923', margin: 0 }}>Generate a checklist first — the report is built from checklist items and team notes.</p>
            </div>
          )}

          {!report && checklist.length > 0 && !reportBusy && (
            <div style={{ padding: '48px', textAlign: 'center', background: 'rgba(167,139,250,0.04)', border: '1px dashed rgba(167,139,250,0.2)', borderRadius: '16px' }}>
              <div style={{ width: '52px', height: '52px', background: 'rgba(167,139,250,0.1)', border: '1px solid rgba(167,139,250,0.2)', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                <svg width="24" height="24" fill="none" stroke="#A78BFA" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
              </div>
              <h3 style={{ fontSize: '13px', fontWeight: 800, color: '#0F1923', margin: '0 0 8px' }}>No report yet</h3>
              <p style={{ fontSize: '13px', color: '#2D3E50', margin: '0 0 24px', lineHeight: 1.65 }}>
                Click "Generate Report" — AI reads all {checklist.length} checklist items, team notes,<br />and event details to produce a structured status report.
              </p>
              <button onClick={generateReport} disabled={reportBusy}
                style={{ padding: '14px 28px', borderRadius: '12px', border: 'none', background: '#A78BFA', color: '#0F1923', fontSize: '13px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
                Generate Report with AI
              </button>
            </div>
          )}

          {report && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: '24px', alignItems: 'flex-start' }}>

              {/* Report content */}
              <div style={{ background: '#FFFFFF', border: '1px solid #D8EAEB', borderRadius: '16px', overflow: 'hidden' }}>
                <div style={{ padding: '18px 24px', borderBottom: '1px solid #D8EAEB', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: '#0F1923' }}>{report.title}</span>
                  <span style={{ fontSize: '13px', color: '#0F1923' }}>
                    {new Date(report.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                </div>
                <div style={{ padding: '24px', maxHeight: '600px', overflowY: 'auto' }}>
                  <pre style={{ fontFamily: 'var(--font-manrope), Manrope, sans-serif', fontSize: '13px', color: '#2D3E50', lineHeight: 1.65, whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0 }}>
                    {report.extracted_text}
                  </pre>
                </div>
                {report.status === 'draft' && (
                  <div style={{ padding: '16px 24px', borderTop: '1px solid #D8EAEB', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
                    <span style={{ fontSize: '13px', color: '#2D3E50' }}>
                      {comments.filter(c => !c.resolved).length > 0
                        ? `${comments.filter(c => !c.resolved).length} unresolved comment${comments.filter(c => !c.resolved).length > 1 ? 's' : ''} — resolve all before concluding`
                        : 'All comments resolved — ready to conclude'}
                    </span>
                    <button
                      onClick={concludeReport}
                      disabled={reportBusy || comments.some(c => !c.resolved)}
                      style={{ padding: '11px 22px', borderRadius: '10px', border: 'none', background: comments.some(c => !c.resolved) || reportBusy ? '#FFFFFF' : '#C0F43C', color: comments.some(c => !c.resolved) || reportBusy ? '#0F1923' : '#0F1923', fontSize: '13px', fontWeight: 800, cursor: comments.some(c => !c.resolved) || reportBusy ? 'not-allowed' : 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                      {reportBusy ? 'Concluding…' : 'Conclude Report'}
                    </button>
                  </div>
                )}
                {report.status === 'live' && (
                  <div style={{ padding: '14px 24px', borderTop: '1px solid #D8EAEB', background: 'rgba(192,244,60,0.04)' }}>
                    <span style={{ fontSize: '13px', color: '#3D6B00', fontWeight: 600 }}>
                      Live in knowledge base — Tresci can now answer questions from this report.
                    </span>
                  </div>
                )}
              </div>

              {/* Comments panel */}
              <div style={{ background: '#FFFFFF', border: '1px solid #D8EAEB', borderRadius: '16px', overflow: 'hidden' }}>
                <div style={{ padding: '18px 20px', borderBottom: '1px solid #D8EAEB' }}>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: '#0F1923' }}>
                    Comments
                    {comments.length > 0 && (
                      <span style={{ marginLeft: '8px', fontSize: '13px', fontWeight: 700, padding: '2px 8px', borderRadius: '10px', background: comments.some(c => !c.resolved) ? 'rgba(245,158,11,0.15)' : 'rgba(192,244,60,0.1)', color: comments.some(c => !c.resolved) ? '#F59E0B' : '#3D6B00' }}>
                        {comments.filter(c => !c.resolved).length} open
                      </span>
                    )}
                  </span>
                </div>

                {/* Comment thread */}
                <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                  {comments.length === 0 ? (
                    <div style={{ padding: '28px 20px', textAlign: 'center', color: '#0F1923', fontSize: '13px' }}>
                      No comments yet. Add corrections or clarifications before concluding.
                    </div>
                  ) : (
                    <div style={{ padding: '12px 0' }}>
                      {comments.map(c => (
                        <div key={c.id} style={{ padding: '12px 20px', borderBottom: '1px solid #EEF4F4', opacity: c.resolved ? 0.5 : 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '6px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                              <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: 'rgba(167,139,250,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                <span style={{ fontSize: '9px', fontWeight: 800, color: '#A78BFA' }}>
                                  {c.staff?.name?.charAt(0) ?? 'A'}
                                </span>
                              </div>
                              <span style={{ fontSize: '13px', fontWeight: 700, color: '#2D3E50' }}>
                                {c.staff?.name ?? 'Admin'}
                              </span>
                              <span style={{ fontSize: '13px', color: '#0F1923' }}>
                                {new Date(c.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                              </span>
                            </div>
                            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                              {c.resolved ? (
                                <button onClick={() => resolveComment(c.id, false)}
                                  style={{ fontSize: '13px', color: '#0F1923', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}>
                                  Reopen
                                </button>
                              ) : (
                                <button onClick={() => resolveComment(c.id, true)}
                                  style={{ fontSize: '13px', color: '#3D6B00', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700 }}>
                                  Resolve
                                </button>
                              )}
                              <button onClick={() => deleteComment(c.id)}
                                style={{ fontSize: '13px', color: 'rgba(255,107,107,0.6)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
                                Delete
                              </button>
                            </div>
                          </div>
                          <p style={{ fontSize: '13px', color: c.resolved ? '#0F1923' : '#2D3E50', margin: 0, lineHeight: 1.65, textDecoration: c.resolved ? 'line-through' : 'none' }}>
                            {c.comment}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Add comment */}
                {report.status === 'draft' && (
                  <div style={{ padding: '14px 20px', borderTop: '1px solid #D8EAEB' }}>
                    <textarea
                      value={commentText}
                      onChange={e => setCommentText(e.target.value)}
                      placeholder="Add a comment or correction…"
                      rows={3}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid #B8CDD8', background: '#FFFFFF', color: '#0F1923', fontSize: '13px', fontFamily: 'inherit', resize: 'none', boxSizing: 'border-box', marginBottom: '8px' }}
                    />
                    <button onClick={addComment} disabled={commentSaving || !commentText.trim()}
                      style={{ width: '100%', padding: '10px', borderRadius: '8px', border: 'none', background: commentText.trim() ? '#A78BFA' : '#FFFFFF', color: commentText.trim() ? 'white' : '#0F1923', fontSize: '13px', fontWeight: 700, cursor: commentText.trim() ? 'pointer' : 'not-allowed', fontFamily: 'inherit' }}>
                      {commentSaving ? 'Saving…' : 'Add Comment'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

      </div>

      <style>{`
        input[type="date"]::-webkit-calendar-picker-indicator { filter: invert(0.5); }
        * { box-sizing: border-box; }
      `}</style>
    </div>
  )
}
