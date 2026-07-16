'use client'

import { useState, useEffect, useCallback } from 'react'
import PageHeader from '@/app/components/PageHeader'

// ── Design tokens ─────────────────────────────────────────────────────────────
const C = {
  bg:      '#F6F8FB',
  surface: '#FFFFFF',
  border:  '#DDE8EE',
  text:    '#0F1923',
  muted:   '#5B7080',
  green:   '#00897B',
  amber:   '#D97706',
  red:     '#8B1A1A',
  blue:    '#0284C7',
  purple:  '#6C54B5',
}

const TASK_TYPES = [
  { value: 'project_work',         label: 'Project Work' },
  { value: 'event_execution',      label: 'Event Execution' },
  { value: 'business_development', label: 'Business Development' },
  { value: 'internal_meeting',     label: 'Internal Meeting' },
  { value: 'training',             label: 'Training' },
  { value: 'admin',                label: 'Admin / Ops' },
  { value: 'other',                label: 'Other' },
]

const TASK_COLORS: Record<string, string> = {
  project_work: '#00897B', event_execution: '#1565C0', business_development: '#D97706',
  internal_meeting: '#6C54B5', training: '#0284C7', admin: '#5B7080', other: '#8B1A1A',
}

type Session = { sid: string; adm: boolean; jl: string; dept: string }
type Event = { id: string; name: string }
type Entry = {
  id: string; staff_id: string; date: string; hours: number;
  event_id: string | null; task_type: string; description: string;
  approved: boolean; approved_by: string | null; approved_at: string | null;
  event?: { id: string; name: string } | null
  staff?: { id: string; name: string; department: string | null } | null
}

function getSession(): Session | null {
  if (typeof document === 'undefined') return null
  const raw = document.cookie.split('; ').find(c => c.startsWith('tcs_session='))?.split('=')[1]
  if (!raw) return null
  try { return JSON.parse(atob(raw)) } catch { return null }
}

function fmtDate(d: string) { return new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) }
function isoWeekStart(d: Date) { const day = d.getDay(); const diff = d.getDate() - (day === 0 ? 6 : day - 1); const mon = new Date(d); mon.setDate(diff); return mon.toISOString().slice(0, 10) }
function addDays(d: string, n: number) { const x = new Date(d + 'T00:00:00'); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10) }

export default function TimesheetsPage() {
  const [session, setSession] = useState<Session | null>(null)
  const [tab, setTab] = useState<'my' | 'approve'>('my')
  const [weekOf, setWeekOf] = useState(isoWeekStart(new Date()))
  const [entries, setEntries] = useState<Entry[]>([])
  const [pending, setPending] = useState<Entry[]>([])
  const [events, setEvents] = useState<Event[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)

  // New entry form
  const [formDate, setFormDate] = useState(new Date().toISOString().slice(0, 10))
  const [formHours, setFormHours] = useState('8')
  const [formEvent, setFormEvent] = useState('')
  const [formType, setFormType] = useState('project_work')
  const [formDesc, setFormDesc] = useState('')
  const [showForm, setShowForm] = useState(false)

  useEffect(() => { setSession(getSession()) }, [])

  const isManager = session?.jl === 'team_lead' || session?.jl === 'dept_head' || session?.jl === 'office_head' || session?.adm

  const fetchWeek = useCallback(async () => {
    if (!session?.sid) return
    setLoading(true)
    const res = await fetch(`/api/hr/timesheets?staff_id=${session.sid}&week=${weekOf}`)
    const data = await res.json()
    setEntries(data.entries ?? [])
    setLoading(false)
  }, [session?.sid, weekOf])

  const fetchPending = useCallback(async () => {
    const res = await fetch('/api/hr/timesheets?pending_approval=true')
    const data = await res.json()
    setPending(data ?? [])
  }, [])

  const fetchEvents = useCallback(async () => {
    const res = await fetch('/api/events?status=active')
    const data = await res.json()
    if (Array.isArray(data)) setEvents(data)
    else {
      const r2 = await fetch('/api/events')
      const d2 = await r2.json()
      setEvents(Array.isArray(d2) ? d2.slice(0, 50) : [])
    }
  }, [])

  useEffect(() => { if (session) { fetchWeek(); fetchEvents(); if (isManager) fetchPending() } }, [session, fetchWeek, fetchEvents, fetchPending, isManager])

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekOf, i))
  const totalHours = entries.reduce((s, e) => s + Number(e.hours), 0)

  // ── Submit entry ────────────────────────────────────────────
  async function submitEntry() {
    if (!formDesc.trim()) { setMsg({ text: 'Description is required', ok: false }); return }
    if (Number(formHours) <= 0 || Number(formHours) > 24) { setMsg({ text: 'Hours must be 1-24', ok: false }); return }
    setSaving(true); setMsg(null)
    const res = await fetch('/api/hr/timesheets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        staff_id: session!.sid,
        date: formDate,
        hours: Number(formHours),
        event_id: formEvent || null,
        task_type: formType,
        description: formDesc.trim(),
      }),
    })
    if (res.ok) {
      setMsg({ text: 'Entry logged', ok: true })
      setShowForm(false); setFormDesc(''); setFormHours('8')
      fetchWeek()
    } else {
      const d = await res.json()
      setMsg({ text: d.error ?? 'Failed', ok: false })
    }
    setSaving(false)
  }

  // ── Approve / Reject ────────────────────────────────────────
  async function handleApproval(id: string, approved: boolean) {
    await fetch('/api/hr/timesheets', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, approved, approved_by: session!.sid }),
    })
    fetchPending()
    if (tab === 'my') fetchWeek()
  }

  // ── Delete entry ────────────────────────────────────────────
  async function deleteEntry(id: string) {
    await fetch('/api/hr/timesheets', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, hours: 0 }),
    })
    fetchWeek()
  }

  if (!session) return null

  return (
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: "'Inter', system-ui, sans-serif" }}>
      <PageHeader
        title="Timesheets"
        actions={<>
          <button onClick={() => setTab('my')}
            style={{ padding: '7px 18px', borderRadius: 8, border: tab === 'my' ? `1.5px solid ${C.blue}` : `1px solid ${C.border}`, background: tab === 'my' ? C.blue : C.surface, color: tab === 'my' ? '#fff' : C.muted, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
            My Timesheet
          </button>
          {isManager && (
            <button onClick={() => { setTab('approve'); fetchPending() }}
              style={{ padding: '7px 18px', borderRadius: 8, border: tab === 'approve' ? `1.5px solid ${C.amber}` : `1px solid ${C.border}`, background: tab === 'approve' ? C.amber : C.surface, color: tab === 'approve' ? '#fff' : C.muted, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', position: 'relative' }}>
              Approvals
              {pending.length > 0 && <span style={{ position: 'absolute', top: -6, right: -6, width: 18, height: 18, borderRadius: '50%', background: C.red, color: '#fff', fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{pending.length}</span>}
            </button>
          )}
        </>}
      />

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 32px' }}>
        {msg && <div style={{ padding: '10px 16px', borderRadius: 8, marginBottom: 16, background: msg.ok ? `${C.green}12` : `${C.red}12`, border: `1px solid ${msg.ok ? C.green : C.red}30`, color: msg.ok ? C.green : C.red, fontSize: 13, fontWeight: 600 }}>{msg.text}</div>}

        {/* ══════════ MY TIMESHEET TAB ══════════ */}
        {tab === 'my' && (
          <>
            {/* Week navigator */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button onClick={() => setWeekOf(addDays(weekOf, -7))} style={{ width: 32, height: 32, borderRadius: 8, border: `1px solid ${C.border}`, background: C.surface, cursor: 'pointer', fontSize: 14, fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="14" height="14" fill="none" stroke={C.muted} strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg>
                </button>
                <span style={{ fontSize: 15, fontWeight: 700, color: C.text, minWidth: 200, textAlign: 'center' }}>
                  {fmtDate(weekOf)} — {fmtDate(addDays(weekOf, 6))}
                </span>
                <button onClick={() => setWeekOf(addDays(weekOf, 7))} style={{ width: 32, height: 32, borderRadius: 8, border: `1px solid ${C.border}`, background: C.surface, cursor: 'pointer', fontSize: 14, fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="14" height="14" fill="none" stroke={C.muted} strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><path d="M9 18l6-6-6-6"/></svg>
                </button>
                <button onClick={() => setWeekOf(isoWeekStart(new Date()))} style={{ padding: '5px 12px', borderRadius: 6, border: `1px solid ${C.border}`, background: C.surface, fontSize: 12, fontWeight: 600, color: C.muted, cursor: 'pointer', fontFamily: 'inherit' }}>This Week</button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>Total: <span style={{ color: totalHours >= 40 ? C.green : totalHours >= 20 ? C.amber : C.red }}>{totalHours}h</span> / 40h</div>
                <button onClick={() => { setShowForm(true); setFormDate(new Date().toISOString().slice(0, 10)) }}
                  style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: C.blue, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                  + Log Hours
                </button>
              </div>
            </div>

            {/* Week grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8, marginBottom: 24 }}>
              {weekDays.map(day => {
                const dayEntries = entries.filter(e => e.date === day)
                const dayTotal = dayEntries.reduce((s, e) => s + Number(e.hours), 0)
                const isToday = day === new Date().toISOString().slice(0, 10)
                return (
                  <div key={day} style={{ background: C.surface, borderRadius: 10, border: isToday ? `2px solid ${C.blue}` : `1px solid ${C.border}`, padding: 12, minHeight: 100 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: isToday ? C.blue : C.muted }}>{fmtDate(day).split(',')[0]}</span>
                      <span style={{ fontSize: 12, fontWeight: 800, color: dayTotal > 0 ? C.text : C.border }}>{dayTotal}h</span>
                    </div>
                    {dayEntries.map(e => (
                      <div key={e.id} style={{ padding: '6px 8px', borderRadius: 6, marginBottom: 4, background: `${TASK_COLORS[e.task_type] ?? C.muted}10`, borderLeft: `3px solid ${TASK_COLORS[e.task_type] ?? C.muted}` }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: TASK_COLORS[e.task_type] ?? C.muted }}>{e.hours}h</span>
                          <span style={{ fontSize: 10, fontWeight: 600, color: e.approved ? C.green : C.amber }}>{e.approved ? 'Approved' : 'Pending'}</span>
                        </div>
                        <div style={{ fontSize: 11, color: C.text, marginTop: 2, lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden' }}>{e.description}</div>
                        {e.event && <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>{e.event.name}</div>}
                      </div>
                    ))}
                    {dayEntries.length === 0 && (
                      <button onClick={() => { setShowForm(true); setFormDate(day) }}
                        style={{ width: '100%', padding: '8px 0', borderRadius: 6, border: `1px dashed ${C.border}`, background: 'transparent', color: C.muted, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>
                        + Add
                      </button>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Entry list */}
            {entries.length > 0 && (
              <div style={{ background: C.surface, borderRadius: 12, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
                <div style={{ padding: '14px 20px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>This Week&apos;s Entries</span>
                  <span style={{ fontSize: 12, color: C.muted }}>{entries.length} entries</span>
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#F8FAFB' }}>
                      {['Date', 'Hours', 'Type', 'Event', 'Description', 'Status', ''].map(h => (
                        <th key={h} style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, color: C.muted, textAlign: 'left', borderBottom: `1px solid ${C.border}` }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map(e => (
                      <tr key={e.id} style={{ borderBottom: `1px solid ${C.border}08` }}>
                        <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 600, color: C.text }}>{fmtDate(e.date)}</td>
                        <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 800, color: C.text }}>{e.hours}h</td>
                        <td style={{ padding: '10px 14px' }}>
                          <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: `${TASK_COLORS[e.task_type] ?? C.muted}12`, color: TASK_COLORS[e.task_type] ?? C.muted }}>{TASK_TYPES.find(t => t.value === e.task_type)?.label ?? e.task_type}</span>
                        </td>
                        <td style={{ padding: '10px 14px', fontSize: 12, color: C.muted }}>{e.event?.name ?? '—'}</td>
                        <td style={{ padding: '10px 14px', fontSize: 13, color: C.text, maxWidth: 250, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.description}</td>
                        <td style={{ padding: '10px 14px' }}>
                          <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: e.approved ? `${C.green}12` : `${C.amber}12`, color: e.approved ? C.green : C.amber }}>
                            {e.approved ? 'Approved' : 'Pending'}
                          </span>
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          {!e.approved && (
                            <button onClick={() => deleteEntry(e.id)} style={{ border: 'none', background: 'transparent', color: C.red, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Remove</button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {loading && <div style={{ textAlign: 'center', padding: 40, color: C.muted, fontSize: 14 }}>Loading...</div>}
            {!loading && entries.length === 0 && (
              <div style={{ textAlign: 'center', padding: 48, background: C.surface, borderRadius: 12, border: `1px solid ${C.border}` }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 6 }}>No hours logged this week</div>
                <div style={{ fontSize: 13, color: C.muted, marginBottom: 16 }}>Click &quot;Log Hours&quot; to start tracking your time</div>
                <button onClick={() => setShowForm(true)} style={{ padding: '10px 20px', borderRadius: 8, border: 'none', background: C.blue, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>+ Log Hours</button>
              </div>
            )}
          </>
        )}

        {/* ══════════ APPROVALS TAB ══════════ */}
        {tab === 'approve' && isManager && (
          <>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 16 }}>Pending Approvals ({pending.length})</div>
            {pending.length === 0 && (
              <div style={{ textAlign: 'center', padding: 48, background: C.surface, borderRadius: 12, border: `1px solid ${C.border}` }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>All caught up</div>
                <div style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>No timesheets awaiting your approval</div>
              </div>
            )}
            {pending.length > 0 && (
              <div style={{ background: C.surface, borderRadius: 12, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#F8FAFB' }}>
                      {['Staff', 'Department', 'Date', 'Hours', 'Type', 'Event', 'Description', 'Actions'].map(h => (
                        <th key={h} style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, color: C.muted, textAlign: 'left', borderBottom: `1px solid ${C.border}` }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pending.map(e => (
                      <tr key={e.id} style={{ borderBottom: `1px solid ${C.border}08` }}>
                        <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 700, color: C.text }}>{e.staff?.name ?? '—'}</td>
                        <td style={{ padding: '10px 14px', fontSize: 12, color: C.muted }}>{e.staff?.department ?? '—'}</td>
                        <td style={{ padding: '10px 14px', fontSize: 13, color: C.text }}>{fmtDate(e.date)}</td>
                        <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 800, color: C.text }}>{e.hours}h</td>
                        <td style={{ padding: '10px 14px' }}>
                          <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: `${TASK_COLORS[e.task_type] ?? C.muted}12`, color: TASK_COLORS[e.task_type] ?? C.muted }}>{TASK_TYPES.find(t => t.value === e.task_type)?.label ?? e.task_type}</span>
                        </td>
                        <td style={{ padding: '10px 14px', fontSize: 12, color: C.muted }}>{e.event?.name ?? '—'}</td>
                        <td style={{ padding: '10px 14px', fontSize: 12, color: C.text, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.description}</td>
                        <td style={{ padding: '10px 14px', display: 'flex', gap: 6 }}>
                          <button onClick={() => handleApproval(e.id, true)}
                            style={{ padding: '5px 12px', borderRadius: 6, border: 'none', background: C.green, color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Approve</button>
                          <button onClick={() => handleApproval(e.id, false)}
                            style={{ padding: '5px 12px', borderRadius: 6, border: `1px solid ${C.red}`, background: 'transparent', color: C.red, fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Reject</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>

      {/* ══════════ LOG HOURS MODAL ══════════ */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setShowForm(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background: C.surface, borderRadius: 14, padding: 28, width: 440, maxHeight: '80vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: C.text, marginBottom: 20 }}>Log Hours</div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: C.muted }}>
                Date
                <input type="date" value={formDate} onChange={e => setFormDate(e.target.value)}
                  style={{ display: 'block', width: '100%', marginTop: 4, padding: '8px 10px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, fontFamily: 'inherit', color: C.text, boxSizing: 'border-box' }} />
              </label>
              <label style={{ fontSize: 12, fontWeight: 700, color: C.muted }}>
                Hours
                <input type="number" min="0.5" max="24" step="0.5" value={formHours} onChange={e => setFormHours(e.target.value)}
                  style={{ display: 'block', width: '100%', marginTop: 4, padding: '8px 10px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, fontFamily: 'inherit', color: C.text, boxSizing: 'border-box' }} />
              </label>
            </div>

            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: C.muted, marginBottom: 14 }}>
              Task Type
              <select value={formType} onChange={e => setFormType(e.target.value)}
                style={{ display: 'block', width: '100%', marginTop: 4, padding: '8px 10px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, fontFamily: 'inherit', color: C.text, background: C.surface }}>
                {TASK_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </label>

            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: C.muted, marginBottom: 14 }}>
              Event (optional)
              <select value={formEvent} onChange={e => setFormEvent(e.target.value)}
                style={{ display: 'block', width: '100%', marginTop: 4, padding: '8px 10px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, fontFamily: 'inherit', color: C.text, background: C.surface }}>
                <option value="">No event — internal / admin work</option>
                {events.map(ev => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
              </select>
            </label>

            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: C.muted, marginBottom: 20 }}>
              Description
              <textarea value={formDesc} onChange={e => setFormDesc(e.target.value)} rows={3} placeholder="What did you work on?"
                style={{ display: 'block', width: '100%', marginTop: 4, padding: '8px 10px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, fontFamily: 'inherit', color: C.text, resize: 'vertical', boxSizing: 'border-box' }} />
            </label>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowForm(false)} style={{ padding: '9px 18px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.surface, color: C.muted, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
              <button onClick={submitEntry} disabled={saving}
                style={{ padding: '9px 24px', borderRadius: 8, border: 'none', background: saving ? C.muted : C.blue, color: '#fff', fontSize: 13, fontWeight: 700, cursor: saving ? 'wait' : 'pointer', fontFamily: 'inherit' }}>
                {saving ? 'Saving...' : 'Log Hours'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
