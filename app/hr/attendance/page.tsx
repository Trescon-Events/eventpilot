'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import Link from 'next/link'

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
  purple:  '#6C54B5',
  blue:    '#1565C0',
}

// ── Types ─────────────────────────────────────────────────────────────────────
type StaffMember = {
  id: string
  name: string
  department: string | null
  office_id: string | null
  role: string | null
  attendance_exempted: boolean | null
}

type AttRecord = {
  id: string
  staff_id: string
  date: string
  status: string
  clock_in: string | null
  clock_out: string | null
  work_hours: number | null
  location: string
  late_arrival: boolean
  early_leave: boolean
  notes: string | null
  staff: { id: string; name: string; department: string | null; office_id: string | null } | null
}

type MergedRow = {
  key: string
  staff_id: string
  name: string
  department: string | null
  office_id: string | null
  hasRecord: boolean
  id: string | null
  date: string
  status: string
  clock_in: string | null
  clock_out: string | null
  work_hours: number | null
  location: string
  late_arrival: boolean
  early_leave: boolean
  notes: string | null
}

type TrendPoint = { date: string; present: number; total: number; rate: number }

// ── Constants ─────────────────────────────────────────────────────────────────
const STATUS_LABEL: Record<string, string> = {
  present:  'Present',
  wfh:      'WFH',
  half_day: 'Half Day',
  on_leave: 'On Leave',
  absent:   'Absent',
  holiday:  'Holiday',
  weekend:  'Weekend',
}
const STATUS_COLOR: Record<string, string> = {
  present:  C.green,
  wfh:      C.purple,
  half_day: C.blue,
  on_leave: C.amber,
  absent:   C.red,
  holiday:  C.muted,
  weekend:  C.muted,
}
const ALL_STATUSES = ['present', 'wfh', 'half_day', 'on_leave', 'absent', 'holiday', 'weekend']

const OFFICE_LABEL: Record<string, string> = {
  dubai:     'Dubai',
  mangalore: 'Mangalore',
  bangalore: 'Bangalore',
  manipal:   'Manipal',
}
const OFFICE_COLOR: Record<string, string> = {
  dubai:     C.blue,
  mangalore: C.green,
  bangalore: C.purple,
  manipal:   C.amber,
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function todayStr() { return new Date().toISOString().slice(0, 10) }

function lastWorkingDay() {
  const d = new Date()
  const dow = d.getDay()
  if (dow === 0) d.setDate(d.getDate() - 2)  // Sunday → Friday
  if (dow === 6) d.setDate(d.getDate() - 1)  // Saturday → Friday
  return d.toISOString().slice(0, 10)
}

function isWeekendDate(iso: string) {
  const dow = new Date(iso + 'T00:00:00').getDay()
  return dow === 0 || dow === 6
}

function daysAgo(n: number) {
  const d = new Date(); d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

function fmtTime(t: string | null) {
  if (!t) return '—'
  return t.slice(0, 5)          // "HH:MM:SS" → "HH:MM"
}

function fmtHours(h: number | null) {
  if (h == null) return '—'
  return `${Number(h).toFixed(1)}h`
}

function fmtDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

function fmtDateLong(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

function pill(color: string, label: string) {
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: '10px',
      fontSize: '11px', fontWeight: 700, background: color + '20', color,
      letterSpacing: '0.3px', whiteSpace: 'nowrap',
    }}>
      {label}
    </span>
  )
}

// ── Sparkline ─────────────────────────────────────────────────────────────────
function Sparkline({ values, width = 240, height = 44 }: { values: number[]; width?: number; height?: number }) {
  if (values.length < 2) return null
  const max = Math.max(...values, 1)
  const min = Math.min(...values)
  const span = max - min || 1
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * width
    const y = height - 4 - ((v - min) / span) * (height - 8)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
  return (
    <svg width={width} height={height} style={{ overflow: 'visible', flexShrink: 0 }}>
      <defs>
        <linearGradient id="sg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={C.green} stopOpacity="0.15" />
          <stop offset="100%" stopColor={C.green} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polyline points={pts + ` ${width},${height} 0,${height}`} fill="url(#sg)" stroke="none" />
      <polyline points={pts} fill="none" stroke={C.green} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

// ── Edit modal ────────────────────────────────────────────────────────────────
function EditModal({ row, onClose, onSave }: {
  row: MergedRow
  onClose: () => void
  onSave: (updates: Record<string, unknown>) => Promise<void>
}) {
  const [status,     setStatus]     = useState(row.status)
  const [clockIn,    setClockIn]    = useState(row.clock_in?.slice(0, 5) ?? '')
  const [clockOut,   setClockOut]   = useState(row.clock_out?.slice(0, 5) ?? '')
  const [location,   setLocation]   = useState(row.location)
  const [lateArr,    setLateArr]    = useState(row.late_arrival)
  const [earlyLeave, setEarlyLeave] = useState(row.early_leave)
  const [notes,      setNotes]      = useState(row.notes ?? '')
  const [saving,     setSaving]     = useState(false)

  const inp: React.CSSProperties = { padding: '8px 12px', borderRadius: '8px', border: `1px solid ${C.border}`, fontSize: '13px', fontFamily: 'inherit', outline: 'none', background: C.surface, color: C.text, width: '100%', boxSizing: 'border-box' }
  const lbl: React.CSSProperties = { fontSize: '11px', fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '4px' }

  async function save() {
    setSaving(true)
    await onSave({
      status,
      clock_in:    clockIn   || null,
      clock_out:   clockOut  || null,
      location,
      late_arrival: lateArr,
      early_leave: earlyLeave,
      notes:       notes || null,
    })
    setSaving(false)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div style={{ background: C.surface, borderRadius: '20px', padding: '28px', width: '100%', maxWidth: '480px', boxShadow: '0 24px 64px rgba(0,0,0,0.18)' }}>
        <div style={{ fontSize: '15px', fontWeight: 800, color: C.text, marginBottom: '4px' }}>Edit Attendance</div>
        <div style={{ fontSize: '12px', color: C.muted, marginBottom: '20px' }}>{row.name} · {row.date}</div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={lbl}>Status</label>
              <select value={status} onChange={e => setStatus(e.target.value)} style={inp}>
                {ALL_STATUSES.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Location</label>
              <select value={location} onChange={e => setLocation(e.target.value)} style={inp}>
                <option value="office">Office</option>
                <option value="wfh">WFH</option>
                <option value="client_site">Client Site</option>
                <option value="travel">Travel</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div><label style={lbl}>Clock In</label><input type="time" value={clockIn} onChange={e => setClockIn(e.target.value)} style={inp} /></div>
            <div><label style={lbl}>Clock Out</label><input type="time" value={clockOut} onChange={e => setClockOut(e.target.value)} style={inp} /></div>
          </div>

          <div style={{ display: 'flex', gap: '24px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: C.text, cursor: 'pointer' }}>
              <input type="checkbox" checked={lateArr} onChange={e => setLateArr(e.target.checked)} /> Late arrival
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: C.text, cursor: 'pointer' }}>
              <input type="checkbox" checked={earlyLeave} onChange={e => setEarlyLeave(e.target.checked)} /> Early leave
            </label>
          </div>

          <div>
            <label style={lbl}>Notes</label>
            <input type="text" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional" style={inp} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
          <button onClick={onClose} style={{ flex: 1, padding: '10px', borderRadius: '10px', border: `1px solid ${C.border}`, background: C.surface, color: C.muted, fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
            Cancel
          </button>
          <button onClick={save} disabled={saving} style={{ flex: 2, padding: '10px', borderRadius: '10px', background: C.green, color: '#fff', fontSize: '13px', fontWeight: 700, border: 'none', cursor: 'pointer', fontFamily: 'inherit', opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Log Record modal ──────────────────────────────────────────────────────────
function LogModal({ date, staffList, onClose, onSaved }: {
  date: string
  staffList: StaffMember[]
  onClose: () => void
  onSaved: () => void
}) {
  const [logStaff,  setLogStaff]  = useState('')
  const [logStatus, setLogStatus] = useState('present')
  const [logIn,     setLogIn]     = useState('')
  const [logOut,    setLogOut]    = useState('')
  const [logLoc,    setLogLoc]    = useState('office')
  const [logLate,   setLogLate]   = useState(false)
  const [logEarly,  setLogEarly]  = useState(false)
  const [logNotes,  setLogNotes]  = useState('')
  const [saving,    setSaving]    = useState(false)

  const inp: React.CSSProperties = { padding: '8px 12px', borderRadius: '8px', border: `1px solid ${C.border}`, fontSize: '13px', fontFamily: 'inherit', outline: 'none', background: C.surface, color: C.text, width: '100%', boxSizing: 'border-box' }
  const lbl: React.CSSProperties = { fontSize: '11px', fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '4px' }

  async function save() {
    if (!logStaff) return
    setSaving(true)
    await fetch('/api/hr/attendance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ staff_id: logStaff, date, status: logStatus, clock_in: logIn || null, clock_out: logOut || null, location: logLoc, late_arrival: logLate, early_leave: logEarly, notes: logNotes || null }),
    })
    setSaving(false)
    onSaved()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div style={{ background: C.surface, borderRadius: '20px', padding: '28px', width: '100%', maxWidth: '480px', boxShadow: '0 24px 64px rgba(0,0,0,0.18)' }}>
        <div style={{ fontSize: '15px', fontWeight: 800, color: C.text, marginBottom: '4px' }}>Log Attendance</div>
        <div style={{ fontSize: '12px', color: C.muted, marginBottom: '20px' }}>{date}</div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div>
            <label style={lbl}>Staff Member</label>
            <select value={logStaff} onChange={e => setLogStaff(e.target.value)} style={inp}>
              <option value="">Select staff…</option>
              {staffList.map(s => <option key={s.id} value={s.id}>{s.name}{s.department ? ` — ${s.department}` : ''}</option>)}
            </select>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={lbl}>Status</label>
              <select value={logStatus} onChange={e => setLogStatus(e.target.value)} style={inp}>
                {ALL_STATUSES.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Location</label>
              <select value={logLoc} onChange={e => setLogLoc(e.target.value)} style={inp}>
                <option value="office">Office</option>
                <option value="wfh">WFH</option>
                <option value="client_site">Client Site</option>
                <option value="travel">Travel</option>
              </select>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div><label style={lbl}>Clock In</label><input type="time" value={logIn} onChange={e => setLogIn(e.target.value)} style={inp} /></div>
            <div><label style={lbl}>Clock Out</label><input type="time" value={logOut} onChange={e => setLogOut(e.target.value)} style={inp} /></div>
          </div>
          <div style={{ display: 'flex', gap: '24px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: C.text, cursor: 'pointer' }}>
              <input type="checkbox" checked={logLate} onChange={e => setLogLate(e.target.checked)} /> Late arrival
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: C.text, cursor: 'pointer' }}>
              <input type="checkbox" checked={logEarly} onChange={e => setLogEarly(e.target.checked)} /> Early leave
            </label>
          </div>
          <div><label style={lbl}>Notes</label><input type="text" value={logNotes} onChange={e => setLogNotes(e.target.value)} placeholder="Optional" style={inp} /></div>
        </div>

        <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
          <button onClick={onClose} style={{ flex: 1, padding: '10px', borderRadius: '10px', border: `1px solid ${C.border}`, background: C.surface, color: C.muted, fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
          <button onClick={save} disabled={saving || !logStaff} style={{ flex: 2, padding: '10px', borderRadius: '10px', background: C.green, color: '#fff', fontSize: '13px', fontWeight: 700, border: 'none', cursor: 'pointer', fontFamily: 'inherit', opacity: saving || !logStaff ? 0.6 : 1 }}>
            {saving ? 'Saving…' : 'Save Record'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Stat tile ─────────────────────────────────────────────────────────────────
function StatTile({ label, count, color, active, onClick }: {
  label: string; count: number; color: string; active: boolean; onClick: () => void
}) {
  return (
    <button onClick={onClick} style={{
      background: active ? color + '12' : C.surface,
      border: `2px solid ${active ? color : C.border}`,
      borderRadius: '12px', padding: '12px 8px', textAlign: 'center',
      cursor: 'pointer', fontFamily: 'inherit', outline: 'none', width: '100%',
      transition: 'border-color 0.15s, background 0.15s',
    }}>
      <div style={{ fontSize: '26px', fontWeight: 900, color: count > 0 ? color : C.border, lineHeight: 1 }}>{count}</div>
      <div style={{ fontSize: '10px', fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.6px', marginTop: '4px' }}>{label}</div>
    </button>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function AttendancePage() {
  const today = todayStr()

  // ── Mode & dates
  const [mode,         setMode]         = useState<'day' | 'range'>('day')
  const [selectedDate, setSelectedDate] = useState(lastWorkingDay)
  const [rangeFrom,    setRangeFrom]    = useState(daysAgo(30))
  const [rangeTo,      setRangeTo]      = useState(today)

  // ── Data
  const [staffList,    setStaffList]    = useState<StaffMember[]>([])
  const [dayRecords,   setDayRecords]   = useState<AttRecord[]>([])
  const [rangeRecords, setRangeRecords] = useState<AttRecord[]>([])
  const [trendData,    setTrendData]    = useState<TrendPoint[]>([])

  // ── Loading
  const [loading,      setLoading]      = useState(true)
  const [trendReady,   setTrendReady]   = useState(false)

  // ── Filters
  const [search,       setSearch]       = useState('')
  const [officeFilter, setOfficeFilter] = useState<Set<string>>(new Set())
  const [deptFilter,   setDeptFilter]   = useState('')
  const [statusFilter, setStatusFilter] = useState<string | null>(null)

  // ── Selection / bulk
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set())
  const [bulkStatus,   setBulkStatus]   = useState('present')
  const [bulkBusy,     setBulkBusy]     = useState(false)

  // ── Pagination
  const [perPage,      setPerPage]      = useState(25)
  const [currentPage,  setCurrentPage]  = useState(1)

  // ── Modals
  const [editRow,  setEditRow]  = useState<MergedRow | null>(null)
  const [showLog,  setShowLog]  = useState(false)

  // ── Sync
  const [syncing,     setSyncing]     = useState(false)
  const [syncMsg,     setSyncMsg]     = useState<string | null>(null)
  const [lastSynced,  setLastSynced]  = useState<string | null>(null)

  // ── Load staff list once ──────────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/staff-list')
      .then(r => r.json())
      .then(d => setStaffList(Array.isArray(d) ? d : []))
    const stored = localStorage.getItem('att_last_synced')
    if (stored) setLastSynced(stored)
  }, [])

  // ── Load day records ──────────────────────────────────────────────────────
  const loadDay = useCallback(async (date: string) => {
    setLoading(true)
    const res = await fetch(`/api/hr/attendance?date=${date}`)
    const data = await res.json()
    setDayRecords(Array.isArray(data) ? data : [])
    setLoading(false)
  }, [])

  // ── Load range records ────────────────────────────────────────────────────
  const loadRange = useCallback(async (from: string, to: string) => {
    setLoading(true)
    const res = await fetch(`/api/hr/attendance?from=${from}&to=${to}`)
    const data = await res.json()
    setRangeRecords(Array.isArray(data) ? data : [])
    setLoading(false)
  }, [])

  // ── Load 30-day trend (independent background fetch) ─────────────────────
  const loadTrend = useCallback(async (total: number) => {
    if (total === 0) return
    const from = daysAgo(30)
    const to   = todayStr()
    const res  = await fetch(`/api/hr/attendance?from=${from}&to=${to}`)
    const data: AttRecord[] = await res.json()
    if (!Array.isArray(data)) return

    const byDate: Record<string, number> = {}
    const datesWithRecords = new Set<string>()
    for (const r of data) {
      datesWithRecords.add(r.date)
      if (['present', 'wfh', 'half_day'].includes(r.status)) {
        byDate[r.date] = (byDate[r.date] ?? 0) + 1
      }
    }

    const points: TrendPoint[] = []
    for (let i = 29; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i)
      const dow = d.getDay()
      if (dow === 0 || dow === 6) continue  // skip weekends — no attendance expected
      const dateStr = d.toISOString().slice(0, 10)
      if (!datesWithRecords.has(dateStr)) continue  // skip days with no records at all (sync not done)
      const present = byDate[dateStr] ?? 0
      points.push({ date: dateStr, present, total, rate: Math.round((present / total) * 100) })
    }
    setTrendData(points)
    setTrendReady(true)
  }, [])

  // ── Effects ───────────────────────────────────────────────────────────────
  useEffect(() => { loadDay(selectedDate) }, [selectedDate, loadDay])
  useEffect(() => { if (mode === 'range') loadRange(rangeFrom, rangeTo) }, [mode, rangeFrom, rangeTo, loadRange])
  useEffect(() => { if (staffList.length > 0) loadTrend(staffList.length) }, [staffList.length, loadTrend])

  // ── Build merged rows (day mode) ──────────────────────────────────────────
  const mergedRows = useMemo<MergedRow[]>(() => {
    const byStaff: Record<string, AttRecord> = {}
    for (const r of dayRecords) byStaff[r.staff_id] = r

    return staffList.filter(s => !s.attendance_exempted).map(s => {
      const r = byStaff[s.id]
      if (r) {
        return {
          key: r.id, staff_id: s.id, name: s.name,
          department: s.department, office_id: s.office_id,
          hasRecord: true, id: r.id, date: r.date, status: r.status,
          clock_in: r.clock_in, clock_out: r.clock_out, work_hours: r.work_hours,
          location: r.location, late_arrival: r.late_arrival,
          early_leave: r.early_leave, notes: r.notes,
        }
      }
      return {
        key: `nr-${s.id}`, staff_id: s.id, name: s.name,
        department: s.department, office_id: s.office_id,
        hasRecord: false, id: null, date: selectedDate, status: 'no_record',
        clock_in: null, clock_out: null, work_hours: null,
        location: 'office', late_arrival: false, early_leave: false, notes: null,
      }
    })
  }, [staffList, dayRecords, selectedDate])

  // ── Build range rows ──────────────────────────────────────────────────────
  const rangeRows = useMemo<MergedRow[]>(() => (
    rangeRecords.map(r => ({
      key: r.id, staff_id: r.staff_id,
      name: r.staff?.name ?? '—',
      department: r.staff?.department ?? null,
      office_id: r.staff?.office_id ?? null,
      hasRecord: true, id: r.id, date: r.date, status: r.status,
      clock_in: r.clock_in, clock_out: r.clock_out, work_hours: r.work_hours,
      location: r.location, late_arrival: r.late_arrival,
      early_leave: r.early_leave, notes: r.notes,
    }))
  ), [rangeRecords])

  const baseRows = mode === 'day' ? mergedRows : rangeRows

  // ── Distinct offices and departments (from staff list) ────────────────────
  const offices = useMemo(() =>
    [...new Set(staffList.map(s => s.office_id).filter((v): v is string => !!v))].sort()
  , [staffList])

  const departments = useMemo(() =>
    [...new Set(staffList.map(s => s.department).filter((v): v is string => !!v))].sort()
  , [staffList])

  // ── Stat counts (pre-filter) ──────────────────────────────────────────────
  const stats = useMemo(() => {
    const c: Record<string, number> = { present: 0, wfh: 0, half_day: 0, on_leave: 0, absent: 0, late: 0, no_record: 0 }
    for (const r of baseRows) {
      if (!r.hasRecord) { c.no_record++; continue }
      if (c[r.status] !== undefined) c[r.status]++
      if (r.late_arrival) c.late++
    }
    return c
  }, [baseRows])

  // ── Office breakdown (for header strip) ───────────────────────────────────
  const officeStats = useMemo(() => {
    const byOffice: Record<string, { total: number; present: number }> = {}
    for (const r of baseRows) {
      const o = r.office_id ?? 'unknown'
      if (!byOffice[o]) byOffice[o] = { total: 0, present: 0 }
      byOffice[o].total++
      if (r.hasRecord && ['present', 'wfh', 'half_day'].includes(r.status)) byOffice[o].present++
    }
    return byOffice
  }, [baseRows])

  // Reset to page 1 on any filter change
  useEffect(() => { setCurrentPage(1) }, [search, deptFilter, officeFilter, statusFilter, selectedDate, mode])

  // ── Filtered rows ─────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const rows = baseRows.filter(r => {
      if (search) {
        const q = search.toLowerCase()
        if (!r.name.toLowerCase().includes(q) && !(r.department ?? '').toLowerCase().includes(q)) return false
      }
      if (officeFilter.size > 0 && !officeFilter.has(r.office_id ?? '')) return false
      if (deptFilter && r.department !== deptFilter) return false
      if (statusFilter === 'late')      { if (!r.late_arrival) return false }
      else if (statusFilter === 'no_record') { if (r.hasRecord) return false }
      else if (statusFilter)            { if (r.status !== statusFilter) return false }
      return true
    })

    // Sort: records first (by name), no-records last
    return rows.sort((a, b) => {
      if (mode === 'day') {
        if (!a.hasRecord && b.hasRecord) return 1
        if (a.hasRecord && !b.hasRecord) return -1
      }
      // Range: sort by date desc, then name
      if (mode === 'range' && a.date !== b.date) return b.date.localeCompare(a.date)
      return a.name.localeCompare(b.name)
    })
  }, [baseRows, search, officeFilter, deptFilter, statusFilter, mode])

  // ── Trend values — weekends and no-data days already excluded from trendData ─
  const sparkValues = trendData.map(p => p.rate)
  const avgRate = sparkValues.length > 0
    ? Math.round(sparkValues.reduce((a, b) => a + b, 0) / sparkValues.length)
    : 0
  const last7 = trendData.slice(-7) // last 7 working days with data

  // ── Pagination slice ──────────────────────────────────────────────────────
  const totalPages  = Math.ceil(filtered.length / perPage)
  const pagedRows   = filtered.slice((currentPage - 1) * perPage, currentPage * perPage)

  // ── Derived booleans ──────────────────────────────────────────────────────
  const isToday      = mode === 'day' && selectedDate === today
  const hasFilters   = !!(search || deptFilter || officeFilter.size > 0 || statusFilter)
  // No data for this day = day mode, not a weekend, not loading, and HRMS has no records
  const noDataForDay = mode === 'day' && !loading && dayRecords.length === 0 && !isWeekendDate(selectedDate)
  // Last date that has data (from trend)
  const lastDataDate = trendData.length > 0 ? trendData[trendData.length - 1].date : null

  // ── Handlers ──────────────────────────────────────────────────────────────
  function stepDay(delta: number) {
    const d = new Date(selectedDate + 'T00:00:00'); d.setDate(d.getDate() + delta)
    setSelectedDate(d.toISOString().slice(0, 10))
    setMode('day')
  }
  function goToday() { setSelectedDate(today); setMode('day') }

  function toggleOffice(id: string) {
    setOfficeFilter(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  function toggleKey(key: string) {
    setSelectedKeys(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n })
  }
  function toggleAll() {
    const selectable = filtered.filter(r => r.hasRecord).map(r => r.key)
    setSelectedKeys(prev => prev.size === selectable.length ? new Set() : new Set(selectable))
  }

  async function updateStatus(row: MergedRow, status: string) {
    if (row.id) {
      await fetch('/api/hr/attendance', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: row.id, status }),
      })
    } else {
      await fetch('/api/hr/attendance', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staff_id: row.staff_id, date: row.date, status }),
      })
    }
    if (mode === 'day') loadDay(selectedDate)
    else loadRange(rangeFrom, rangeTo)
  }

  async function applyBulk() {
    if (!selectedKeys.size) return
    setBulkBusy(true)
    const rows = filtered.filter(r => selectedKeys.has(r.key))
    await Promise.all(rows.map(r => updateStatus(r, bulkStatus)))
    setSelectedKeys(new Set())
    setBulkBusy(false)
  }

  async function saveEdit(row: MergedRow, updates: Record<string, unknown>) {
    if (row.id) {
      await fetch('/api/hr/attendance', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: row.id, ...updates }),
      })
    }
    setEditRow(null)
    if (mode === 'day') loadDay(selectedDate)
    else loadRange(rangeFrom, rangeTo)
  }

  async function syncHRMS(days: number) {
    setSyncing(true); setSyncMsg(null)
    const res  = await fetch('/api/hr/attendance/sync', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ days }),
    })
    const data = await res.json()
    if (data.error) {
      setSyncMsg(`Sync failed: ${data.error}`)
    } else {
      const ts = new Date().toISOString()
      setSyncMsg(`Synced ${data.synced} records · ${data.skipped} unmatched · from ${data.from_date}`)
      setLastSynced(ts)
      localStorage.setItem('att_last_synced', ts)
      if (mode === 'day') loadDay(selectedDate); else loadRange(rangeFrom, rangeTo)
      loadTrend(staffList.length)
    }
    setSyncing(false)
  }

  function exportCSV() {
    const cols = mode === 'day'
      ? ['Name', 'Department', 'Office', 'Status', 'Clock In', 'Clock Out', 'Hours', 'Location', 'Late', 'Early Leave', 'Notes']
      : ['Name', 'Department', 'Office', 'Date', 'Status', 'Clock In', 'Clock Out', 'Hours', 'Location', 'Late', 'Notes']
    const lines = filtered.map(r => {
      const row = [
        `"${r.name}"`,
        r.department ?? '',
        OFFICE_LABEL[r.office_id ?? ''] ?? r.office_id ?? '',
        ...(mode === 'range' ? [r.date] : []),
        r.hasRecord ? r.status : 'no_record',
        fmtTime(r.clock_in),
        fmtTime(r.clock_out),
        r.work_hours != null ? Number(r.work_hours).toFixed(1) : '',
        r.location,
        r.late_arrival ? 'Yes' : 'No',
        ...(mode === 'day' ? [r.early_leave ? 'Yes' : 'No'] : []),
        `"${r.notes ?? ''}"`,
      ]
      return row.join(',')
    })
    const csv  = [cols.join(','), ...lines].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = mode === 'day' ? `attendance_${selectedDate}.csv` : `attendance_${rangeFrom}_to_${rangeTo}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // ── Render ────────────────────────────────────────────────────────────────
  const selectable = filtered.filter(r => r.hasRecord)

  return (
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: 'system-ui, sans-serif' }}>

      {/* ── Top bar (sticky) ── */}
      <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, padding: '0 32px', position: 'sticky', top: 0, zIndex: 50 }}>
        <div style={{ maxWidth: '1280px', margin: '0 auto', display: 'flex', alignItems: 'center', height: '60px', gap: '10px' }}>
          <Link href="/hr" style={{ fontSize: '13px', color: C.muted, textDecoration: 'none', fontWeight: 600, flexShrink: 0 }}>← HR Portal</Link>
          <div style={{ width: '1px', height: '20px', background: C.border }} />
          <span style={{ fontSize: '15px', fontWeight: 800, color: C.text, flexShrink: 0 }}>Attendance</span>

          <div style={{ flex: 1 }} />

          {syncMsg && (
            <span style={{ fontSize: '11px', color: syncMsg.startsWith('Sync failed') ? C.red : C.green, maxWidth: '280px', textAlign: 'right' }}>
              {syncMsg}
            </span>
          )}

          <button onClick={() => syncHRMS(30)} disabled={syncing}
            style={{ padding: '7px 14px', borderRadius: '8px', border: `1px solid ${C.green}`, fontSize: '12px', fontWeight: 700, color: C.green, background: C.surface, cursor: 'pointer', fontFamily: 'inherit', opacity: syncing ? 0.6 : 1, flexShrink: 0, display: 'flex', alignItems: 'center', gap: '5px' }}>
            <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="8 17 12 21 16 17"/><line x1="12" y1="3" x2="12" y2="21"/></svg>
            {syncing ? 'Syncing…' : 'Sync 30d'}
          </button>
          <button onClick={() => syncHRMS(365)} disabled={syncing}
            style={{ padding: '7px 12px', borderRadius: '8px', border: `1px solid ${C.border}`, fontSize: '12px', fontWeight: 700, color: C.muted, background: C.surface, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>
            Sync All
          </button>
          <button onClick={exportCSV}
            style={{ padding: '7px 12px', borderRadius: '8px', border: `1px solid ${C.border}`, fontSize: '12px', fontWeight: 700, color: C.text, background: C.surface, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0, display: 'flex', alignItems: 'center', gap: '5px' }}>
            <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="8 17 12 21 16 17"/><line x1="12" y1="3" x2="12" y2="21"/></svg>
            CSV
          </button>
          <button onClick={() => setShowLog(true)}
            style={{ padding: '7px 14px', borderRadius: '8px', background: C.text, color: '#fff', fontSize: '12px', fontWeight: 700, border: 'none', cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0, display: 'flex', alignItems: 'center', gap: '5px' }}>
            <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Log Record
          </button>
        </div>
      </div>

      <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '24px 32px' }}>

        {/* ── Last synced (below header) ── */}
        {lastSynced && (
          <div style={{ fontSize: '11px', color: C.muted, marginBottom: '16px' }}>
            Last synced: {new Date(lastSynced).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </div>
        )}

        {/* ── Weekend banner ── */}
        {mode === 'day' && isWeekendDate(selectedDate) && (
          <div style={{ background: C.amber + '10', border: `1px solid ${C.amber}40`, borderRadius: '12px', padding: '12px 18px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <svg width="16" height="16" fill="none" stroke={C.amber} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            <span style={{ fontSize: '13px', fontWeight: 700, color: C.amber }}>Weekend — attendance not expected on {fmtDateLong(selectedDate)}</span>
            <button onClick={() => setSelectedDate(lastWorkingDay())} style={{ marginLeft: 'auto', padding: '5px 12px', borderRadius: '7px', border: `1px solid ${C.amber}60`, background: C.surface, fontSize: '12px', fontWeight: 700, color: C.amber, cursor: 'pointer', fontFamily: 'inherit' }}>
              Go to last working day
            </button>
          </div>
        )}

        {/* ── Office strip — only when day has actual data ── */}
        {offices.length > 0 && !noDataForDay && (
          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
            {offices.map(o => {
              const s  = officeStats[o] ?? { total: 0, present: 0 }
              const pct = s.total > 0 ? Math.round((s.present / s.total) * 100) : 0
              const active = officeFilter.has(o)
              const col = OFFICE_COLOR[o] ?? C.blue
              return (
                <button key={o} onClick={() => toggleOffice(o)} style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  padding: '8px 12px', borderRadius: '12px',
                  border: `2px solid ${active ? col : C.border}`,
                  background: active ? col + '10' : C.surface,
                  cursor: 'pointer', fontFamily: 'inherit', outline: 'none',
                  transition: 'all 0.15s',
                }}>
                  <div style={{ textAlign: 'left' }}>
                    <div style={{ fontSize: '12px', fontWeight: 800, color: active ? col : C.text }}>{OFFICE_LABEL[o] ?? o}</div>
                    <div style={{ fontSize: '10px', color: C.muted, fontWeight: 600 }}>{s.total} staff</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '18px', fontWeight: 900, color: pct >= 80 ? C.green : pct >= 60 ? C.amber : C.red }}>{pct}%</div>
                    <div style={{ fontSize: '10px', color: C.muted }}>present</div>
                  </div>
                </button>
              )
            })}
            {officeFilter.size > 0 && (
              <button onClick={() => setOfficeFilter(new Set())}
                style={{ padding: '8px 12px', borderRadius: '12px', border: `1px solid ${C.border}`, background: C.surface, fontSize: '12px', color: C.muted, cursor: 'pointer', fontFamily: 'inherit' }}>
                Show all offices
              </button>
            )}
          </div>
        )}

        {/* ── Day navigator ── */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '16px', background: C.surface, border: `1px solid ${C.border}`, borderRadius: '12px', padding: '12px 16px' }}>
          <button onClick={() => stepDay(-1)}
            style={{ padding: '7px 12px', borderRadius: '8px', border: `1px solid ${C.border}`, fontSize: '14px', color: C.muted, background: C.surface, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700 }}>←</button>

          <button onClick={goToday} style={{
            padding: '7px 18px', borderRadius: '8px',
            border: `2px solid ${isToday ? C.green : C.border}`,
            fontSize: '13px', fontWeight: 800,
            color: isToday ? C.green : C.text,
            background: isToday ? C.green + '10' : C.surface,
            cursor: 'pointer', fontFamily: 'inherit',
            display: 'flex', alignItems: 'center', gap: '7px',
          }}>
            {isToday && <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: C.green, display: 'inline-block', flexShrink: 0 }} />}
            TODAY
          </button>

          <button onClick={() => stepDay(1)} disabled={isToday}
            style={{ padding: '7px 12px', borderRadius: '8px', border: `1px solid ${isToday ? C.bg : C.border}`, fontSize: '14px', color: isToday ? C.border : C.muted, background: C.surface, cursor: isToday ? 'default' : 'pointer', fontFamily: 'inherit', fontWeight: 700 }}>→</button>

          <input type="date" value={selectedDate} onChange={e => { setSelectedDate(e.target.value); setMode('day') }}
            style={{ padding: '7px 10px', borderRadius: '8px', border: `1px solid ${C.border}`, fontSize: '13px', fontWeight: 700, color: C.text, fontFamily: 'inherit', outline: 'none', background: C.surface, cursor: 'pointer' }} />

          <div style={{ width: '1px', height: '20px', background: C.border, margin: '0 4px' }} />

          <span style={{ fontSize: '10px', color: C.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Range</span>
          <input type="date" value={rangeFrom} onChange={e => { setRangeFrom(e.target.value); setMode('range') }}
            style={{ padding: '7px 10px', borderRadius: '8px', border: `1px solid ${mode === 'range' ? C.blue : C.border}`, fontSize: '13px', color: C.text, fontFamily: 'inherit', outline: 'none', background: C.surface }} />
          <span style={{ color: C.muted, fontSize: '13px' }}>→</span>
          <input type="date" value={rangeTo} onChange={e => { setRangeTo(e.target.value); setMode('range') }}
            style={{ padding: '7px 10px', borderRadius: '8px', border: `1px solid ${mode === 'range' ? C.blue : C.border}`, fontSize: '13px', color: C.text, fontFamily: 'inherit', outline: 'none', background: C.surface }} />
          {mode === 'range' && (
            <button onClick={goToday}
              style={{ padding: '7px 12px', borderRadius: '8px', border: `1px solid ${C.border}`, fontSize: '12px', color: C.muted, background: C.surface, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '5px' }}>
              <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              Live view
            </button>
          )}

          <div style={{ flex: 1 }} />
          <span style={{ fontSize: '13px', fontWeight: 800, color: C.text, whiteSpace: 'nowrap' }}>
            {mode === 'day' ? fmtDateLong(selectedDate) : `${rangeFrom} → ${rangeTo}`}
          </span>
        </div>

        {/* ── Trend strip — always visible when data exists ── */}
        {trendReady && trendData.length > 0 && (
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '12px', padding: '16px 20px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '24px', flexWrap: 'wrap' }}>
            <div style={{ flexShrink: 0 }}>
              <div style={{ fontSize: '10px', fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '2px' }}>Avg attendance rate</div>
              <div style={{ fontSize: '32px', fontWeight: 900, color: avgRate >= 80 ? C.green : avgRate >= 60 ? C.amber : C.red, lineHeight: 1 }}>{avgRate}%</div>
              <div style={{ fontSize: '11px', color: C.muted, marginTop: '2px' }}>Based on {trendData.length} days with data{lastDataDate ? ` · up to ${fmtDate(lastDataDate)}` : ''}</div>
            </div>

            <Sparkline values={sparkValues} width={280} height={48} />

            <div style={{ flex: 1 }} />

            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', minWidth: '160px' }}>
              <div style={{ fontSize: '10px', fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>Last 7 days with data</div>
              {last7.map(p => (
                <div key={p.date} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                  <button onClick={() => { setSelectedDate(p.date); setMode('day') }}
                    style={{ fontSize: '11px', color: C.blue, background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit', textDecoration: 'underline' }}>
                    {fmtDate(p.date)}
                  </button>
                  <span style={{ fontSize: '11px', fontWeight: 800, color: p.rate >= 80 ? C.green : p.rate >= 60 ? C.amber : C.red }}>{p.rate}%</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── No data state ── */}
        {noDataForDay ? (
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '16px', padding: '60px 40px', textAlign: 'center' }}>
            <svg width="40" height="40" fill="none" stroke={C.border} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" style={{ marginBottom: '16px' }}>
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
            <div style={{ fontSize: '16px', fontWeight: 800, color: C.text, marginBottom: '6px' }}>No attendance data for {fmtDateLong(selectedDate)}</div>
            <div style={{ fontSize: '13px', color: C.muted, marginBottom: '24px', maxWidth: '400px', margin: '0 auto 24px' }}>
              {lastDataDate
                ? `Attendance was last recorded on ${fmtDate(lastDataDate)}. Either sync from HRMS or log records manually.`
                : 'No attendance has been recorded yet. Sync from HRMS or log records manually.'}
            </div>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
              {lastDataDate && (
                <button onClick={() => { setSelectedDate(lastDataDate); setMode('day') }}
                  style={{ padding: '9px 18px', borderRadius: '9px', border: `1px solid ${C.green}`, fontSize: '13px', fontWeight: 700, color: C.green, background: C.surface, cursor: 'pointer', fontFamily: 'inherit' }}>
                  View {fmtDate(lastDataDate)}
                </button>
              )}
              <button onClick={() => syncHRMS(30)}
                style={{ padding: '9px 18px', borderRadius: '9px', border: `1px solid ${C.border}`, fontSize: '13px', fontWeight: 700, color: C.muted, background: C.surface, cursor: 'pointer', fontFamily: 'inherit' }}>
                Sync from HRMS
              </button>
              <button onClick={() => setShowLog(true)}
                style={{ padding: '9px 18px', borderRadius: '9px', background: C.text, color: '#fff', fontSize: '13px', fontWeight: 700, border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
                Log manually
              </button>
            </div>
          </div>
        ) : (
        <>

        {/* ── Stat tiles ── */}
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${mode === 'day' ? 7 : 6}, 1fr)`, gap: '8px', marginBottom: '16px' }}>
          <StatTile label="Present"   count={stats.present}   color={C.green}  active={statusFilter === 'present'}   onClick={() => setStatusFilter(statusFilter === 'present' ? null : 'present')} />
          <StatTile label="WFH"       count={stats.wfh}       color={C.purple} active={statusFilter === 'wfh'}       onClick={() => setStatusFilter(statusFilter === 'wfh' ? null : 'wfh')} />
          <StatTile label="Half Day"  count={stats.half_day}  color={C.blue}   active={statusFilter === 'half_day'}  onClick={() => setStatusFilter(statusFilter === 'half_day' ? null : 'half_day')} />
          <StatTile label="On Leave"  count={stats.on_leave}  color={C.amber}  active={statusFilter === 'on_leave'}  onClick={() => setStatusFilter(statusFilter === 'on_leave' ? null : 'on_leave')} />
          <StatTile label="Absent"    count={stats.absent}    color={C.red}    active={statusFilter === 'absent'}    onClick={() => setStatusFilter(statusFilter === 'absent' ? null : 'absent')} />
          <StatTile label="Late"      count={stats.late}      color={C.amber}  active={statusFilter === 'late'}      onClick={() => setStatusFilter(statusFilter === 'late' ? null : 'late')} />
          {mode === 'day' && (
            <StatTile label="No Record" count={stats.no_record} color={C.red} active={statusFilter === 'no_record'} onClick={() => setStatusFilter(statusFilter === 'no_record' ? null : 'no_record')} />
          )}
        </div>

        {/* ── Filters row ── */}
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '12px' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: '180px', maxWidth: '260px' }}>
            <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: C.muted, pointerEvents: 'none', display: 'flex' }}>
              <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            </span>
            <input
              placeholder="Search staff or dept…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ padding: '8px 12px 8px 28px', borderRadius: '8px', border: `1px solid ${search ? C.blue : C.border}`, fontSize: '13px', fontFamily: 'inherit', outline: 'none', background: C.surface, color: C.text, width: '100%', boxSizing: 'border-box' as const }}
            />
          </div>

          <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)}
            style={{ padding: '8px 12px', borderRadius: '8px', border: `1px solid ${deptFilter ? C.blue : C.border}`, fontSize: '13px', fontFamily: 'inherit', outline: 'none', background: C.surface, color: C.text, cursor: 'pointer' }}>
            <option value="">All Departments</option>
            {departments.map(d => <option key={d} value={d}>{d}</option>)}
          </select>

          {hasFilters && (
            <button onClick={() => { setSearch(''); setDeptFilter(''); setOfficeFilter(new Set()); setStatusFilter(null) }}
              style={{ padding: '8px 14px', borderRadius: '8px', border: `1px solid ${C.border}`, fontSize: '12px', color: C.muted, background: C.surface, cursor: 'pointer', fontFamily: 'inherit' }}>
              Clear filters
            </button>
          )}

          <div style={{ flex: 1 }} />
          <span style={{ fontSize: '12px', color: C.muted, fontWeight: 600 }}>
            {filtered.length} {filtered.length === 1 ? 'record' : 'records'}
          </span>
        </div>

        {/* ── Bulk action bar ── */}
        {selectedKeys.size > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: C.text, color: '#fff', borderRadius: '10px', padding: '10px 16px', marginBottom: '12px' }}>
            <span style={{ fontSize: '13px', fontWeight: 700 }}>{selectedKeys.size} selected</span>
            <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '12px' }}>→ set status to</span>
            <select value={bulkStatus} onChange={e => setBulkStatus(e.target.value)}
              style={{ padding: '6px 10px', borderRadius: '8px', border: 'none', fontSize: '13px', fontFamily: 'inherit', background: '#fff', color: C.text, cursor: 'pointer' }}>
              {ALL_STATUSES.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
            </select>
            <button onClick={applyBulk} disabled={bulkBusy}
              style={{ padding: '6px 16px', borderRadius: '8px', background: C.green, color: '#fff', border: 'none', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: bulkBusy ? 0.6 : 1 }}>
              {bulkBusy ? 'Applying…' : 'Apply'}
            </button>
            <button onClick={() => setSelectedKeys(new Set())}
              style={{ padding: '6px 12px', borderRadius: '8px', background: 'transparent', color: 'rgba(255,255,255,0.7)', border: '1px solid rgba(255,255,255,0.25)', fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit' }}>
              Clear
            </button>
          </div>
        )}

        {/* ── Table ── */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '80px', color: C.muted, background: C.surface, borderRadius: '16px', border: `1px solid ${C.border}` }}>
            Loading…
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px', color: C.muted, background: C.surface, borderRadius: '16px', border: `1px solid ${C.border}` }}>
            No records match the current filters
          </div>
        ) : (
          <>
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '16px 16px 0 0', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.border}`, background: C.bg }}>
                  <th style={{ padding: '10px 14px', width: '36px' }}>
                    <input type="checkbox"
                      checked={selectedKeys.size > 0 && selectedKeys.size === selectable.length}
                      onChange={toggleAll}
                      style={{ cursor: 'pointer' }}
                    />
                  </th>
                  {['Staff', 'Dept', 'Office', ...(mode === 'range' ? ['Date'] : []), 'Status', 'In', 'Out', 'Hrs', 'Flags', ''].map(h => (
                    <th key={h} style={{ padding: '10px 12px', fontSize: '10px', fontWeight: 700, color: C.muted, letterSpacing: '1px', textTransform: 'uppercase', textAlign: 'left', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pagedRows.map((r, i) => {
                  const noRec    = !r.hasRecord
                  const isLate   = r.late_arrival
                  const isSelect = selectedKeys.has(r.key)
                  const rowBg    = isSelect ? C.green + '08' : noRec ? C.red + '05' : i % 2 === 0 ? C.surface : C.bg
                  const sc       = STATUS_COLOR[r.status] ?? C.muted
                  // 3px left border on rows that have a record, matching status color
                  const leftBorder = r.hasRecord ? `3px solid ${sc}` : `3px solid transparent`

                  return (
                    <tr key={r.key} style={{ borderBottom: i < pagedRows.length - 1 ? `1px solid ${C.border}` : 'none', background: rowBg, borderLeft: leftBorder }}>

                      {/* Checkbox */}
                      <td style={{ padding: '10px 14px' }}>
                        {r.hasRecord && (
                          <input type="checkbox" checked={isSelect} onChange={() => toggleKey(r.key)} style={{ cursor: 'pointer' }} />
                        )}
                      </td>

                      {/* Name */}
                      <td style={{ padding: '10px 12px' }}>
                        <Link href={`/hr/staff/${r.staff_id}`} style={{ fontSize: '14px', fontWeight: 800, color: C.text, textDecoration: 'none' }}>
                          {r.name}
                        </Link>
                      </td>

                      {/* Dept */}
                      <td style={{ padding: '10px 12px', fontSize: '12px', color: C.muted, maxWidth: '130px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {r.department ?? '—'}
                      </td>

                      {/* Office */}
                      <td style={{ padding: '10px 12px' }}>
                        {r.office_id ? (
                          <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '8px', background: (OFFICE_COLOR[r.office_id] ?? C.muted) + '18', color: OFFICE_COLOR[r.office_id] ?? C.muted }}>
                            {OFFICE_LABEL[r.office_id] ?? r.office_id}
                          </span>
                        ) : <span style={{ color: C.border, fontSize: '12px' }}>—</span>}
                      </td>

                      {/* Date (range mode) */}
                      {mode === 'range' && (
                        <td style={{ padding: '10px 12px', fontSize: '12px', color: C.muted, whiteSpace: 'nowrap' }}>{r.date}</td>
                      )}

                      {/* Status */}
                      <td style={{ padding: '10px 12px' }}>
                        {noRec ? (
                          <select defaultValue="" onChange={e => updateStatus(r, e.target.value)}
                            style={{ padding: '3px 8px', borderRadius: '8px', border: `1px solid ${C.red}40`, fontSize: '12px', fontWeight: 700, color: C.red, background: C.red + '0D', fontFamily: 'inherit', cursor: 'pointer', outline: 'none' }}>
                            <option value="" disabled>No record</option>
                            {ALL_STATUSES.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                          </select>
                        ) : (
                          <select value={r.status} onChange={e => updateStatus(r, e.target.value)}
                            style={{ padding: '3px 8px', borderRadius: '8px', border: `1px solid ${sc}40`, fontSize: '12px', fontWeight: 700, color: sc, background: sc + '15', fontFamily: 'inherit', cursor: 'pointer', outline: 'none' }}>
                            {ALL_STATUSES.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                          </select>
                        )}
                      </td>

                      {/* Clock in */}
                      <td style={{ padding: '10px 12px', fontSize: '13px', fontFamily: 'monospace', color: C.text }}>
                        {fmtTime(r.clock_in)}
                        {isLate && r.clock_in && (
                          <svg style={{ marginLeft: '4px', verticalAlign: 'middle' }} width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={C.amber} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                          </svg>
                        )}
                      </td>

                      {/* Clock out */}
                      <td style={{ padding: '10px 12px', fontSize: '13px', fontFamily: 'monospace', color: C.text }}>{fmtTime(r.clock_out)}</td>

                      {/* Hours */}
                      <td style={{ padding: '10px 12px', fontSize: '13px', fontWeight: 700, color: C.text }}>{fmtHours(r.work_hours)}</td>

                      {/* Flags */}
                      <td style={{ padding: '10px 12px' }}>
                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                          {r.late_arrival    && pill(C.amber,  'Late')}
                          {r.early_leave     && pill(C.red,    'Early out')}
                          {r.location === 'travel'      && pill(C.blue,   'Travel')}
                          {r.location === 'client_site' && pill(C.purple, 'Client site')}
                        </div>
                      </td>

                      {/* Actions */}
                      <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                        {r.hasRecord ? (
                          <button onClick={() => setEditRow(r)}
                            style={{ padding: '4px 10px', borderRadius: '7px', border: `1px solid ${C.border}`, fontSize: '11px', fontWeight: 700, color: C.muted, background: C.surface, cursor: 'pointer', fontFamily: 'inherit' }}>
                            Edit
                          </button>
                        ) : (
                          <span style={{ fontSize: '11px', color: C.border }}>—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* ── Pagination controls ── */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', background: C.surface, borderRadius: '0 0 16px 16px', border: `1px solid ${C.border}`, borderTop: `1px solid ${C.border}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '12px', color: C.muted }}>Rows per page:</span>
              <select value={perPage} onChange={e => { setPerPage(Number(e.target.value)); setCurrentPage(1) }}
                style={{ padding: '3px 8px', borderRadius: '7px', border: `1px solid ${C.border}`, fontSize: '12px', color: C.text, background: C.surface, fontFamily: 'inherit', cursor: 'pointer', outline: 'none' }}>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
            <span style={{ fontSize: '12px', color: C.muted, fontWeight: 600 }}>
              {filtered.length === 0 ? '0 records' : `${(currentPage - 1) * perPage + 1}–${Math.min(currentPage * perPage, filtered.length)} of ${filtered.length}`}
            </span>
            <div style={{ display: 'flex', gap: '4px' }}>
              <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}
                style={{ width: '30px', height: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '7px', border: `1px solid ${C.border}`, background: currentPage === 1 ? C.bg : C.surface, color: currentPage === 1 ? C.border : C.text, cursor: currentPage === 1 ? 'not-allowed' : 'pointer' }}>
                <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>
              </button>
              <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}
                style={{ width: '30px', height: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '7px', border: `1px solid ${C.border}`, background: currentPage === totalPages ? C.bg : C.surface, color: currentPage === totalPages ? C.border : C.text, cursor: currentPage === totalPages ? 'not-allowed' : 'pointer' }}>
                <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>
              </button>
            </div>
          </div>

          </>
        )}

        </>
        )}

      </div>

      {/* ── Edit modal ── */}
      {editRow && (
        <EditModal
          row={editRow}
          onClose={() => setEditRow(null)}
          onSave={updates => saveEdit(editRow, updates)}
        />
      )}

      {/* ── Log record modal ── */}
      {showLog && (
        <LogModal
          date={selectedDate}
          staffList={staffList}
          onClose={() => setShowLog(false)}
          onSaved={() => { setShowLog(false); loadDay(selectedDate) }}
        />
      )}
    </div>
  )
}
