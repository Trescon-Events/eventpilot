'use client'

import { useState, useEffect, useCallback } from 'react'
import PageHeader from '@/app/components/PageHeader'

const C = {
  bg: '#F6F8FB', surface: '#FFFFFF', border: '#DDE8EE', text: '#0F1923',
  muted: '#5B7080', green: '#00897B', amber: '#D97706', red: '#8B1A1A',
  blue: '#0284C7', purple: '#7C3AED',
}

type Session = { sid: string; adm: boolean }
type Staff = { id: string; name: string; department: string | null; role: string | null; job_level: string; office_id: string | null }
type Grade = { id: string; code: string; label: string; min_salary: number; max_salary: number }
type SalaryRecord = {
  id: string; staff_id: string; effective_from: string; effective_to: string | null;
  basic_salary: number; allowances: number; deductions: number;
  gross_salary: number; net_salary: number; currency: string;
  grade_id: string | null; notes: string | null;
  grade?: { code: string; label: string } | null
}

function getSession(): Session | null {
  if (typeof document === 'undefined') return null
  const raw = document.cookie.split('; ').find(c => c.startsWith('tcs_session='))?.split('=')[1]
  if (!raw) return null
  try { return JSON.parse(atob(raw)) } catch { return null }
}

function fmt(n: number) { return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) }

const OFFICE_CURRENCY: Record<string, string> = { dubai: 'AED', bangalore: 'INR', mangalore: 'INR', manipal: 'INR' }
const USD_RATES: Record<string, number> = { USD: 1, AED: 0.2723, INR: 0.01189, EUR: 1.08, GBP: 1.26 } // approximate
function toUSD(amount: number, currency: string) { return amount * (USD_RATES[currency] ?? 1) }
function getCurrencyForOffice(officeId: string | null) { return officeId ? (OFFICE_CURRENCY[officeId] ?? 'USD') : 'USD' }
function currencySymbol(c: string) { return c === 'INR' ? 'Rs' : c === 'AED' ? 'AED' : c === 'EUR' ? 'EUR' : c === 'GBP' ? 'GBP' : '$' }

export default function SalaryPage() {
  const [session, setSession] = useState<Session | null>(null)
  const [staff, setStaff] = useState<Staff[]>([])
  const [grades, setGrades] = useState<Grade[]>([])
  const [search, setSearch] = useState('')
  const [deptFilter, setDeptFilter] = useState('all')
  const [selected, setSelected] = useState<Staff | null>(null)
  const [records, setRecords] = useState<SalaryRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [showBulk, setShowBulk] = useState(false)
  const [bulkUploading, setBulkUploading] = useState(false)
  const [bulkResult, setBulkResult] = useState<{ total: number; created: number; skipped: number; error_count: number; skipped_list: Array<{ email: string; reason: string }>; errors_list: Array<{ email: string; error: string }> } | null>(null)

  // Form fields
  const [fBasic, setFBasic] = useState('')
  const [fAllow, setFAllow] = useState('0')
  const [fDeduct, setFDeduct] = useState('0')
  const [fGrade, setFGrade] = useState('')
  const [fDate, setFDate] = useState(new Date().toISOString().slice(0, 10))
  const [fCurrency, setFCurrency] = useState('USD')
  const [fNotes, setFNotes] = useState('')

  useEffect(() => {
    const s = getSession()
    if (s) setSession(s)
    else fetch('/api/auth/session').then(r => r.json()).then(d => { if (d?.sid) setSession({ sid: d.sid, adm: d.adm ?? false }) }).catch(() => {})
  }, [])

  const fetchStaff = useCallback(async () => {
    setLoading(true)
    const [sRes, gRes] = await Promise.all([
      fetch('/api/hr/staff'),
      fetch('/api/hr/payroll-grades').catch(() => null),
    ])
    const sData = await sRes.json()
    setStaff(Array.isArray(sData) ? sData : [])
    if (gRes?.ok) {
      const gData = await gRes.json()
      setGrades(Array.isArray(gData) ? gData : [])
    }
    setLoading(false)
  }, [])

  useEffect(() => { fetchStaff() }, [fetchStaff])

  const fetchRecords = useCallback(async (staffId: string) => {
    const res = await fetch(`/api/hr/salary?staff_id=${staffId}`)
    const data = await res.json()
    setRecords(Array.isArray(data) ? data : [])
  }, [])

  useEffect(() => { if (selected) fetchRecords(selected.id) }, [selected, fetchRecords])

  const departments = [...new Set(staff.map(s => s.department).filter(Boolean))] as string[]
  const filtered = staff.filter(s => {
    if (search && !s.name.toLowerCase().includes(search.toLowerCase())) return false
    if (deptFilter !== 'all' && s.department !== deptFilter) return false
    return true
  })

  async function submitSalary() {
    if (!selected || !fBasic || Number(fBasic) <= 0) { setMsg({ text: 'Basic salary is required', ok: false }); return }
    setSaving(true); setMsg(null)
    const res = await fetch('/api/hr/salary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        staff_id: selected.id,
        effective_from: fDate,
        basic_salary: Number(fBasic),
        allowances: Number(fAllow) || 0,
        deductions: Number(fDeduct) || 0,
        currency: fCurrency,
        grade_id: fGrade || null,
        notes: fNotes.trim() || null,
        created_by: session!.sid,
      }),
    })
    if (res.ok) {
      setMsg({ text: 'Salary record saved', ok: true })
      setShowForm(false)
      fetchRecords(selected.id)
    } else {
      const d = await res.json()
      setMsg({ text: d.error ?? 'Failed', ok: false })
    }
    setSaving(false)
  }

  const currentRecord = records.find(r => !r.effective_to)

  async function handleBulkCSV(file: File) {
    setBulkUploading(true); setBulkResult(null); setMsg(null)
    const text = await file.text()
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
    if (lines.length < 2) { setMsg({ text: 'CSV must have a header row + at least 1 data row', ok: false }); setBulkUploading(false); return }
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/\s+/g, '_'))
    const rows = lines.slice(1).map(line => {
      const vals = line.split(',').map(v => v.trim())
      const obj: Record<string, string> = {}
      headers.forEach((h, i) => { obj[h] = vals[i] ?? '' })
      return obj
    }).filter(r => r.email)
    if (rows.length === 0) { setMsg({ text: 'No valid rows found. Ensure CSV has an "email" column.', ok: false }); setBulkUploading(false); return }
    const res = await fetch('/api/hr/salary/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows, created_by: session!.sid }),
    })
    const data = await res.json()
    if (res.ok) {
      setBulkResult(data)
      setMsg({ text: `Bulk import: ${data.created} created, ${data.skipped} skipped, ${data.error_count} errors`, ok: data.created > 0 })
      fetchStaff()
    } else {
      setMsg({ text: data.error ?? 'Bulk import failed', ok: false })
    }
    setBulkUploading(false)
  }

  if (!session && !loading) return null // only hide if definitely no session AND done loading

  return (
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: "'Inter', system-ui, sans-serif" }}>
      <PageHeader eyebrow="Finance" title="Salary & Compensation" actions={
        <button onClick={() => setShowBulk(true)} style={{ padding: '8px 18px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.surface, color: C.text, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
          <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24" style={{ verticalAlign: 'middle', marginRight: 6 }}><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
          Bulk CSV Import
        </button>
      } />

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 32px', display: 'grid', gridTemplateColumns: selected ? '340px 1fr' : '1fr', gap: 24 }}>
        {/* Staff list */}
        <div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            <input placeholder="Search staff..." value={search} onChange={e => setSearch(e.target.value)}
              style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, fontFamily: 'inherit', color: C.text }} />
            <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)}
              style={{ padding: '8px 10px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 12, fontFamily: 'inherit', color: C.muted, background: C.surface }}>
              <option value="all">All Depts</option>
              {departments.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>

          {loading && <div style={{ padding: 20, textAlign: 'center', color: C.muted, fontSize: 13 }}>Loading...</div>}

          <div style={{ maxHeight: 'calc(100vh - 220px)', overflow: 'auto' }}>
            {filtered.map(s => (
              <div key={s.id} onClick={() => { setSelected(s); setMsg(null) }}
                style={{ padding: '12px 14px', borderRadius: 10, border: selected?.id === s.id ? `2px solid ${C.purple}` : `1px solid ${C.border}`, background: C.surface, marginBottom: 6, cursor: 'pointer', transition: 'all 0.1s' }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{s.name}</div>
                <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{s.department ?? '—'} · {s.role ?? s.job_level}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Detail panel */}
        {selected && (
          <div>
            {msg && <div style={{ padding: '10px 16px', borderRadius: 8, marginBottom: 16, background: msg.ok ? `${C.green}12` : `${C.red}12`, border: `1px solid ${msg.ok ? C.green : C.red}30`, color: msg.ok ? C.green : C.red, fontSize: 13, fontWeight: 600 }}>{msg.text}</div>}

            {/* Current salary card */}
            <div style={{ background: C.surface, borderRadius: 12, border: `1px solid ${C.border}`, padding: 24, marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: C.text }}>{selected.name}</div>
                  <div style={{ fontSize: 13, color: C.muted }}>{selected.department ?? '—'} · {selected.role ?? selected.job_level}</div>
                </div>
                <button onClick={() => { setShowForm(true); setFBasic(currentRecord ? String(currentRecord.basic_salary) : ''); setFAllow(currentRecord ? String(currentRecord.allowances) : '0'); setFDeduct(currentRecord ? String(currentRecord.deductions) : '0'); setFGrade(currentRecord?.grade_id ?? ''); setFCurrency(currentRecord?.currency ?? getCurrencyForOffice(selected.office_id)); setFNotes(''); setFDate(new Date().toISOString().slice(0, 10)) }}
                  style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: C.purple, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                  {currentRecord ? 'Revise Salary' : '+ Add Salary'}
                </button>
              </div>

              {currentRecord ? (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 12 }}>
                    {[
                      { label: 'Basic Salary', value: `${currencySymbol(currentRecord.currency)} ${fmt(currentRecord.basic_salary)}`, color: C.text },
                      { label: 'Allowances', value: `+ ${fmt(currentRecord.allowances)}`, color: C.green },
                      { label: 'Deductions', value: `- ${fmt(currentRecord.deductions)}`, color: C.red },
                      { label: 'Net Salary', value: `${currencySymbol(currentRecord.currency)} ${fmt(currentRecord.net_salary)}`, color: C.purple },
                    ].map(c => (
                      <div key={c.label} style={{ padding: '14px 16px', borderRadius: 10, background: `${c.color}08`, border: `1px solid ${c.color}20` }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, marginBottom: 4 }}>{c.label}</div>
                        <div style={{ fontSize: 16, fontWeight: 800, color: c.color }}>{c.value}</div>
                      </div>
                    ))}
                  </div>
                  {/* USD equivalent + office context */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderRadius: 8, background: '#F8FAFB', border: `1px solid ${C.border}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span style={{ fontSize: 12, color: C.muted }}>Office: <strong style={{ color: C.text }}>{selected.office_id ? selected.office_id.charAt(0).toUpperCase() + selected.office_id.slice(1) : '—'}</strong></span>
                      <span style={{ color: C.border }}>|</span>
                      <span style={{ fontSize: 12, color: C.muted }}>Currency: <strong style={{ color: C.text }}>{currentRecord.currency}</strong></span>
                    </div>
                    {currentRecord.currency !== 'USD' && (
                      <div style={{ fontSize: 12, color: C.muted }}>
                        USD equivalent: <strong style={{ color: C.blue }}>$ {fmt(toUSD(currentRecord.net_salary, currentRecord.currency))}</strong>
                        <span style={{ fontSize: 10, color: '#B8CDD8', marginLeft: 4 }}>@ {USD_RATES[currentRecord.currency]}</span>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div style={{ borderRadius: 10, overflow: 'hidden', border: `1px solid ${C.border}` }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 0 }}>
                    {[
                      { label: 'Basic Salary', value: '—', color: C.muted },
                      { label: 'Allowances', value: '—', color: C.muted },
                      { label: 'Deductions', value: '—', color: C.muted },
                      { label: 'Net Salary', value: '—', color: C.muted },
                    ].map(c => (
                      <div key={c.label} style={{ padding: '14px 16px', background: '#F8FAFB', borderRight: `1px solid ${C.border}` }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, marginBottom: 4 }}>{c.label}</div>
                        <div style={{ fontSize: 16, fontWeight: 800, color: '#B8CDD8' }}>{c.value}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ padding: '16px', textAlign: 'center', background: '#FAFBFC' }}>
                    <div style={{ fontSize: 13, color: C.muted, marginBottom: 8 }}>No salary record for {selected.name}. Set up their compensation to start tracking payroll.</div>
                    <div style={{ fontSize: 11, color: '#B8CDD8', marginBottom: 12 }}>e.g. Basic: AED 8,000 + Allowances: AED 1,500 - Deductions: AED 500 = Net: AED 9,000 | Grade: M1 | Effective: 2026-07-01</div>
                    <button onClick={() => { setShowForm(true); setFBasic(''); setFAllow('0'); setFDeduct('0'); setFGrade(''); setFCurrency(selected.department === 'Dubai' ? 'AED' : 'INR'); setFNotes(''); setFDate(new Date().toISOString().slice(0, 10)) }}
                      style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: C.purple, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>+ Add Salary Record</button>
                  </div>
                </div>
              )}

              {currentRecord?.grade && (
                <div style={{ marginTop: 12, fontSize: 12, color: C.muted }}>Grade: <span style={{ fontWeight: 700, color: C.text }}>{currentRecord.grade.code} — {currentRecord.grade.label}</span> · Effective from {currentRecord.effective_from}</div>
              )}
            </div>

            {/* Salary history */}
            {records.length > 1 && (
              <div style={{ background: C.surface, borderRadius: 12, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
                <div style={{ padding: '14px 20px', borderBottom: `1px solid ${C.border}` }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>Salary History</span>
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#F8FAFB' }}>
                      {['Effective From', 'Effective To', 'Grade', 'Basic', 'Gross', 'Net', 'USD Equiv.', 'Notes'].map(h => (
                        <th key={h} style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, color: C.muted, textAlign: 'left', borderBottom: `1px solid ${C.border}` }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {records.map(r => (
                      <tr key={r.id} style={{ borderBottom: `1px solid ${C.border}08`, background: !r.effective_to ? `${C.purple}04` : 'transparent' }}>
                        <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 600, color: C.text }}>{r.effective_from}</td>
                        <td style={{ padding: '10px 14px', fontSize: 13, color: r.effective_to ? C.muted : C.green }}>{r.effective_to ?? 'Current'}</td>
                        <td style={{ padding: '10px 14px', fontSize: 12, color: C.muted }}>{r.grade?.code ?? '—'}</td>
                        <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 700, color: C.text }}>{currencySymbol(r.currency)} {fmt(r.basic_salary)}</td>
                        <td style={{ padding: '10px 14px', fontSize: 13, color: C.text }}>{currencySymbol(r.currency)} {fmt(r.gross_salary)}</td>
                        <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 700, color: C.purple }}>{currencySymbol(r.currency)} {fmt(r.net_salary)}</td>
                        <td style={{ padding: '10px 14px', fontSize: 13, color: C.blue }}>$ {fmt(toUSD(r.net_salary, r.currency))}</td>
                        <td style={{ padding: '10px 14px', fontSize: 12, color: C.muted, maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.notes ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {!selected && !loading && (
          <div>
            <div style={{ background: C.surface, borderRadius: 12, border: `1px solid ${C.border}`, padding: 24, marginBottom: 16 }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: C.text, marginBottom: 8 }}>Salary & Compensation</div>
              <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.6, marginBottom: 16 }}>Select a staff member from the list to view or manage their salary. You can also bulk import salary data for all staff using a CSV file.</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, marginBottom: 8 }}>What you can manage per staff member:</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                {['Basic Salary + Currency (INR / AED)', 'Allowances (housing, transport, etc.)', 'Deductions (tax, insurance, etc.)', 'Payroll Grade (L1-L3, M1-M2, SM, D1, EX)', 'Salary History with effective dates', 'Revision notes and audit trail'].map(item => (
                  <div key={item} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: C.text }}>
                    <svg width="12" height="12" fill="none" stroke={C.green} strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                    {item}
                  </div>
                ))}
              </div>
            </div>
            <div style={{ background: '#F8FAFB', borderRadius: 10, border: `1px dashed ${C.border}`, padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 13, color: C.muted }}>Have salary data in a spreadsheet? Upload it all at once.</div>
              <button onClick={() => setShowBulk(true)} style={{ padding: '7px 16px', borderRadius: 8, border: `1px solid ${C.purple}30`, background: `${C.purple}08`, color: C.purple, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Bulk CSV Import</button>
            </div>
          </div>
        )}
      </div>

      {/* Salary form modal */}
      {showForm && selected && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setShowForm(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background: C.surface, borderRadius: 14, padding: 28, width: 480, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: C.text, marginBottom: 4 }}>{currentRecord ? 'Revise Salary' : 'Add Salary'}</div>
            <div style={{ fontSize: 13, color: C.muted, marginBottom: 20 }}>{selected.name}</div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: C.muted }}>
                Effective From
                <input type="date" value={fDate} onChange={e => setFDate(e.target.value)}
                  style={{ display: 'block', width: '100%', marginTop: 4, padding: '8px 10px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, fontFamily: 'inherit', color: C.text, boxSizing: 'border-box' }} />
              </label>
              <label style={{ fontSize: 12, fontWeight: 700, color: C.muted }}>
                Currency
                <select value={fCurrency} onChange={e => setFCurrency(e.target.value)}
                  style={{ display: 'block', width: '100%', marginTop: 4, padding: '8px 10px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, fontFamily: 'inherit', color: C.text, background: C.surface }}>
                  <option value="USD">USD</option>
                  <option value="AED">AED</option>
                  <option value="INR">INR</option>
                  <option value="EUR">EUR</option>
                  <option value="GBP">GBP</option>
                </select>
              </label>
            </div>

            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: C.muted, marginBottom: 14 }}>
              Grade
              <select value={fGrade} onChange={e => setFGrade(e.target.value)}
                style={{ display: 'block', width: '100%', marginTop: 4, padding: '8px 10px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, fontFamily: 'inherit', color: C.text, background: C.surface }}>
                <option value="">No grade</option>
                {grades.map(g => <option key={g.id} value={g.id}>{g.code} — {g.label} ({fmt(g.min_salary)} - {fmt(g.max_salary)})</option>)}
              </select>
            </label>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: C.muted }}>
                Basic Salary
                <input type="number" min="0" step="100" value={fBasic} onChange={e => setFBasic(e.target.value)} placeholder="0.00"
                  style={{ display: 'block', width: '100%', marginTop: 4, padding: '8px 10px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, fontFamily: 'inherit', color: C.text, boxSizing: 'border-box' }} />
              </label>
              <label style={{ fontSize: 12, fontWeight: 700, color: C.green }}>
                Allowances
                <input type="number" min="0" step="100" value={fAllow} onChange={e => setFAllow(e.target.value)}
                  style={{ display: 'block', width: '100%', marginTop: 4, padding: '8px 10px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, fontFamily: 'inherit', color: C.text, boxSizing: 'border-box' }} />
              </label>
              <label style={{ fontSize: 12, fontWeight: 700, color: C.red }}>
                Deductions
                <input type="number" min="0" step="100" value={fDeduct} onChange={e => setFDeduct(e.target.value)}
                  style={{ display: 'block', width: '100%', marginTop: 4, padding: '8px 10px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, fontFamily: 'inherit', color: C.text, boxSizing: 'border-box' }} />
              </label>
            </div>

            {fBasic && (() => {
              const net = Number(fBasic) + Number(fAllow || 0) - Number(fDeduct || 0)
              return (
                <div style={{ padding: '10px 14px', borderRadius: 8, background: `${C.purple}08`, border: `1px solid ${C.purple}20`, marginBottom: 14, fontSize: 13 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: fCurrency !== 'USD' ? 4 : 0 }}>
                    <span style={{ fontWeight: 700, color: C.muted }}>Net Salary</span>
                    <span style={{ fontWeight: 800, color: C.purple }}>{currencySymbol(fCurrency)} {fmt(net)}</span>
                  </div>
                  {fCurrency !== 'USD' && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 11, color: '#B8CDD8' }}>USD equivalent (for P&L)</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: C.blue }}>$ {fmt(toUSD(net, fCurrency))}</span>
                    </div>
                  )}
                </div>
              )
            })()}

            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: C.muted, marginBottom: 20 }}>
              Notes
              <textarea value={fNotes} onChange={e => setFNotes(e.target.value)} rows={2} placeholder="Reason for revision..."
                style={{ display: 'block', width: '100%', marginTop: 4, padding: '8px 10px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, fontFamily: 'inherit', color: C.text, resize: 'vertical', boxSizing: 'border-box' }} />
            </label>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowForm(false)} style={{ padding: '9px 18px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.surface, color: C.muted, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
              <button onClick={submitSalary} disabled={saving}
                style={{ padding: '9px 24px', borderRadius: 8, border: 'none', background: saving ? C.muted : C.purple, color: '#fff', fontSize: 13, fontWeight: 700, cursor: saving ? 'wait' : 'pointer', fontFamily: 'inherit' }}>
                {saving ? 'Saving...' : 'Save Salary'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk CSV upload modal */}
      {showBulk && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => { setShowBulk(false); setBulkResult(null) }}>
          <div onClick={e => e.stopPropagation()} style={{ background: C.surface, borderRadius: 14, padding: 28, width: 520, maxHeight: '85vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: C.text, marginBottom: 6 }}>Bulk Salary Import</div>
            <div style={{ fontSize: 13, color: C.muted, marginBottom: 16 }}>Upload a CSV file with salary data for multiple staff members at once.</div>

            <div style={{ padding: 16, borderRadius: 10, background: '#F8FAFB', border: `1px solid ${C.border}`, marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 8 }}>Required CSV format:</div>
              <code style={{ fontSize: 11, color: C.muted, display: 'block', lineHeight: 1.8 }}>
                email, basic_salary, allowances, deductions, currency, grade_code, effective_from, notes<br />
                john@tresconglobal.com, 5000, 500, 200, USD, M1, 2026-07-01, Annual revision<br />
                jane@tresconglobal.com, 4500, 400, 150, USD, L3, 2026-07-01, New hire
              </code>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 8 }}>
                <strong>Required:</strong> email, basic_salary<br />
                <strong>Optional:</strong> allowances (default 0), deductions (default 0), currency (default USD), grade_code (L1-EX), effective_from (default today), notes
              </div>
            </div>

            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px 16px', borderRadius: 10, border: `2px dashed ${bulkUploading ? C.muted : C.purple}`, background: `${C.purple}04`, cursor: bulkUploading ? 'wait' : 'pointer', marginBottom: 16 }}>
              <input type="file" accept=".csv" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) handleBulkCSV(f); e.target.value = '' }} disabled={bulkUploading} />
              <div style={{ textAlign: 'center' }}>
                <svg width="24" height="24" fill="none" stroke={bulkUploading ? C.muted : C.purple} strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24" style={{ marginBottom: 6 }}><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                <div style={{ fontSize: 13, fontWeight: 700, color: bulkUploading ? C.muted : C.purple }}>{bulkUploading ? 'Importing...' : 'Click to select CSV file'}</div>
              </div>
            </label>

            {bulkResult && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 12 }}>
                  <div style={{ padding: '10px 12px', borderRadius: 8, background: `${C.green}10`, textAlign: 'center' }}>
                    <div style={{ fontSize: 18, fontWeight: 800, color: C.green }}>{bulkResult.created}</div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: C.muted }}>Created</div>
                  </div>
                  <div style={{ padding: '10px 12px', borderRadius: 8, background: `${C.amber}10`, textAlign: 'center' }}>
                    <div style={{ fontSize: 18, fontWeight: 800, color: C.amber }}>{bulkResult.skipped}</div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: C.muted }}>Skipped</div>
                  </div>
                  <div style={{ padding: '10px 12px', borderRadius: 8, background: `${C.red}10`, textAlign: 'center' }}>
                    <div style={{ fontSize: 18, fontWeight: 800, color: C.red }}>{bulkResult.error_count}</div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: C.muted }}>Errors</div>
                  </div>
                </div>
                {bulkResult.skipped_list.length > 0 && (
                  <details style={{ marginBottom: 8 }}>
                    <summary style={{ fontSize: 12, fontWeight: 700, color: C.amber, cursor: 'pointer' }}>Skipped rows ({bulkResult.skipped_list.length})</summary>
                    <div style={{ maxHeight: 120, overflow: 'auto', marginTop: 6 }}>
                      {bulkResult.skipped_list.map((s, i) => <div key={i} style={{ fontSize: 11, color: C.muted, padding: '2px 0' }}>{s.email} — {s.reason}</div>)}
                    </div>
                  </details>
                )}
                {bulkResult.errors_list.length > 0 && (
                  <details>
                    <summary style={{ fontSize: 12, fontWeight: 700, color: C.red, cursor: 'pointer' }}>Errors ({bulkResult.errors_list.length})</summary>
                    <div style={{ maxHeight: 120, overflow: 'auto', marginTop: 6 }}>
                      {bulkResult.errors_list.map((e, i) => <div key={i} style={{ fontSize: 11, color: C.muted, padding: '2px 0' }}>{e.email} — {e.error}</div>)}
                    </div>
                  </details>
                )}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={() => { setShowBulk(false); setBulkResult(null) }} style={{ padding: '9px 18px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.surface, color: C.muted, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
