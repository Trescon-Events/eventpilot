'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'

const C = { bg: '#F6F8FB', surface: '#FFFFFF', border: '#DDE8EE', text: '#0F1923', muted: '#5B7080', green: '#00897B', amber: '#D97706', red: '#8B1A1A', blue: '#0284C7', purple: '#6C54B5' }

const CATEGORIES = [
  { value: 'travel', label: 'Travel' }, { value: 'accommodation', label: 'Accommodation' },
  { value: 'meals', label: 'Meals' }, { value: 'transport', label: 'Transport' },
  { value: 'office_supplies', label: 'Office Supplies' }, { value: 'software', label: 'Software' },
  { value: 'marketing', label: 'Marketing' }, { value: 'client_entertainment', label: 'Client Entertainment' },
  { value: 'training', label: 'Training' }, { value: 'other', label: 'Other' },
]
const STATUS_MAP: Record<string, { label: string; color: string }> = {
  pending: { label: 'Pending', color: C.amber }, approved: { label: 'Approved', color: C.blue },
  rejected: { label: 'Rejected', color: C.red }, paid: { label: 'Paid', color: C.green },
}
type Session = { sid: string; adm: boolean; jl: string }
type Claim = {
  id: string; staff_id: string; event_id: string | null; category: string; description: string;
  amount: number; currency: string; receipt_url: string | null; expense_date: string; status: string;
  rejection_reason: string | null; created_at: string;
  staff?: { id: string; name: string; department: string | null } | null
  event?: { id: string; name: string } | null
}
type Event = { id: string; name: string }

function getSession(): Session | null {
  if (typeof document === 'undefined') return null
  const raw = document.cookie.split('; ').find(c => c.startsWith('tcs_session='))?.split('=')[1]
  if (!raw) return null
  try { return JSON.parse(atob(raw)) } catch { return null }
}
function fmt(n: number) { return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) }

export default function ExpensesPage() {
  const [session, setSession] = useState<Session | null>(null)
  const [tab, setTab] = useState<'all' | 'pending'>('all')
  const [claims, setClaims] = useState<Claim[]>([])
  const [events, setEvents] = useState<Event[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [filterStatus, setFilterStatus] = useState('all')

  const [fCategory, setFCategory] = useState('travel')
  const [fDesc, setFDesc] = useState('')
  const [fAmount, setFAmount] = useState('')
  const [fCurrency, setFCurrency] = useState('USD')
  const [fEvent, setFEvent] = useState('')
  const [fDate, setFDate] = useState(new Date().toISOString().slice(0, 10))

  useEffect(() => { setSession(getSession()) }, [])
  const isManager = session?.jl === 'team_lead' || session?.jl === 'dept_head' || session?.jl === 'office_head' || session?.adm

  const fetchClaims = useCallback(async () => {
    setLoading(true)
    const url = tab === 'pending' ? '/api/hr/expenses?pending=true' : '/api/hr/expenses'
    const res = await fetch(url)
    const data = await res.json()
    setClaims(Array.isArray(data) ? data : [])
    setLoading(false)
  }, [tab])

  useEffect(() => { if (session) { fetchClaims(); fetch('/api/events').then(r => r.json()).then(d => setEvents(Array.isArray(d) ? d : [])).catch(() => {}) } }, [session, fetchClaims])

  const filtered = filterStatus === 'all' ? claims : claims.filter(c => c.status === filterStatus)
  const totalPending = claims.filter(c => c.status === 'pending').reduce((s, c) => s + c.amount, 0)
  const totalApproved = claims.filter(c => c.status === 'approved' || c.status === 'paid').reduce((s, c) => s + c.amount, 0)

  async function submitClaim() {
    if (!fDesc.trim() || !fAmount) { setMsg({ text: 'Description and amount required', ok: false }); return }
    setSaving(true); setMsg(null)
    const res = await fetch('/api/hr/expenses', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ staff_id: session!.sid, event_id: fEvent || null, category: fCategory, description: fDesc.trim(), amount: Number(fAmount), currency: fCurrency, expense_date: fDate }),
    })
    if (res.ok) { setMsg({ text: 'Claim submitted', ok: true }); setShowForm(false); setFDesc(''); setFAmount(''); fetchClaims() }
    else { const d = await res.json(); setMsg({ text: d.error ?? 'Failed', ok: false }) }
    setSaving(false)
  }

  async function handleAction(id: string, status: string, reason?: string) {
    await fetch('/api/hr/expenses', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status, approved_by: session!.sid, rejection_reason: reason }),
    })
    fetchClaims()
  }

  if (!session) return null

  return (
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, padding: '20px 32px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <Link href="/hr" style={{ color: C.muted, textDecoration: 'none', fontSize: 13 }}>HR Portal</Link>
            <span style={{ color: C.border }}>/</span>
            <span style={{ fontSize: 13, color: C.text, fontWeight: 700 }}>Expense Claims</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: C.text, margin: 0 }}>Expense Claims</h1>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => setTab('all')} style={{ padding: '7px 18px', borderRadius: 8, border: tab === 'all' ? `1.5px solid ${C.blue}` : `1px solid ${C.border}`, background: tab === 'all' ? C.blue : C.surface, color: tab === 'all' ? '#fff' : C.muted, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>All Claims</button>
              {isManager && <button onClick={() => setTab('pending')} style={{ padding: '7px 18px', borderRadius: 8, border: tab === 'pending' ? `1.5px solid ${C.amber}` : `1px solid ${C.border}`, background: tab === 'pending' ? C.amber : C.surface, color: tab === 'pending' ? '#fff' : C.muted, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Pending Approval</button>}
              <button onClick={() => setShowForm(true)} style={{ padding: '7px 18px', borderRadius: 8, border: 'none', background: C.green, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>+ New Claim</button>
            </div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 32px' }}>
        {msg && <div style={{ padding: '10px 16px', borderRadius: 8, marginBottom: 16, background: msg.ok ? `${C.green}12` : `${C.red}12`, border: `1px solid ${msg.ok ? C.green : C.red}30`, color: msg.ok ? C.green : C.red, fontSize: 13, fontWeight: 600 }}>{msg.text}</div>}

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
          <div style={{ padding: '16px 18px', borderRadius: 10, background: C.surface, border: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.muted }}>Total Claims</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: C.text }}>{claims.length}</div>
          </div>
          <div style={{ padding: '16px 18px', borderRadius: 10, background: C.surface, border: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.muted }}>Pending Amount</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: C.amber }}>${fmt(totalPending)}</div>
          </div>
          <div style={{ padding: '16px 18px', borderRadius: 10, background: C.surface, border: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.muted }}>Approved / Paid</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: C.green }}>${fmt(totalApproved)}</div>
          </div>
        </div>

        {/* Filter */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ padding: '7px 12px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 12, fontFamily: 'inherit', color: C.muted, background: C.surface }}>
            <option value="all">All Statuses</option>
            {Object.entries(STATUS_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>

        {loading && <div style={{ padding: 40, textAlign: 'center', color: C.muted }}>Loading...</div>}
        {!loading && filtered.length === 0 && <div style={{ padding: 48, textAlign: 'center', background: C.surface, borderRadius: 12, border: `1px solid ${C.border}` }}><div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>No expense claims</div><div style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>Click &quot;+ New Claim&quot; to submit an expense</div></div>}

        {filtered.length > 0 && (
          <div style={{ background: C.surface, borderRadius: 12, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr style={{ background: '#F8FAFB' }}>
                {['Staff', 'Category', 'Description', 'Event', 'Amount', 'Date', 'Status', ...(isManager && tab === 'pending' ? ['Actions'] : [])].map(h => (
                  <th key={h} style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, color: C.muted, textAlign: 'left', borderBottom: `1px solid ${C.border}` }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {filtered.map(c => {
                  const s = STATUS_MAP[c.status] ?? STATUS_MAP.pending
                  return (
                    <tr key={c.id} style={{ borderBottom: `1px solid ${C.border}08` }}>
                      <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 700, color: C.text }}>{c.staff?.name ?? '—'}</td>
                      <td style={{ padding: '10px 14px', fontSize: 12, color: C.muted }}>{CATEGORIES.find(x => x.value === c.category)?.label ?? c.category}</td>
                      <td style={{ padding: '10px 14px', fontSize: 13, color: C.text, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.description}</td>
                      <td style={{ padding: '10px 14px', fontSize: 12, color: C.muted }}>{c.event?.name ?? '—'}</td>
                      <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 800, color: C.text }}>{c.currency} {fmt(c.amount)}</td>
                      <td style={{ padding: '10px 14px', fontSize: 12, color: C.muted }}>{c.expense_date}</td>
                      <td style={{ padding: '10px 14px' }}><span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: `${s.color}12`, color: s.color }}>{s.label}</span></td>
                      {isManager && tab === 'pending' && c.status === 'pending' && (
                        <td style={{ padding: '10px 14px', display: 'flex', gap: 6 }}>
                          <button onClick={() => handleAction(c.id, 'approved')} style={{ padding: '5px 12px', borderRadius: 6, border: 'none', background: C.green, color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Approve</button>
                          <button onClick={() => { const r = prompt('Rejection reason:'); if (r) handleAction(c.id, 'rejected', r) }} style={{ padding: '5px 12px', borderRadius: 6, border: `1px solid ${C.red}`, background: 'transparent', color: C.red, fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Reject</button>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* New claim modal */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setShowForm(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background: C.surface, borderRadius: 14, padding: 28, width: 440, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: C.text, marginBottom: 20 }}>Submit Expense Claim</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: C.muted }}>Category
                <select value={fCategory} onChange={e => setFCategory(e.target.value)} style={{ display: 'block', width: '100%', marginTop: 4, padding: '8px 10px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, fontFamily: 'inherit', color: C.text, background: C.surface }}>{CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}</select>
              </label>
              <label style={{ fontSize: 12, fontWeight: 700, color: C.muted }}>Date
                <input type="date" value={fDate} onChange={e => setFDate(e.target.value)} style={{ display: 'block', width: '100%', marginTop: 4, padding: '8px 10px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, fontFamily: 'inherit', color: C.text, boxSizing: 'border-box' }} />
              </label>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12, marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: C.muted }}>Amount
                <input type="number" min="0" step="0.01" value={fAmount} onChange={e => setFAmount(e.target.value)} placeholder="0.00" style={{ display: 'block', width: '100%', marginTop: 4, padding: '8px 10px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, fontFamily: 'inherit', color: C.text, boxSizing: 'border-box' }} />
              </label>
              <label style={{ fontSize: 12, fontWeight: 700, color: C.muted }}>Currency
                <select value={fCurrency} onChange={e => setFCurrency(e.target.value)} style={{ display: 'block', width: '100%', marginTop: 4, padding: '8px 10px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, fontFamily: 'inherit', color: C.text, background: C.surface }}>
                  {['USD', 'AED', 'INR', 'EUR', 'GBP'].map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
            </div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: C.muted, marginBottom: 14 }}>Event (optional)
              <select value={fEvent} onChange={e => setFEvent(e.target.value)} style={{ display: 'block', width: '100%', marginTop: 4, padding: '8px 10px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, fontFamily: 'inherit', color: C.text, background: C.surface }}>
                <option value="">No event</option>
                {events.map(ev => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
              </select>
            </label>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: C.muted, marginBottom: 20 }}>Description
              <textarea value={fDesc} onChange={e => setFDesc(e.target.value)} rows={3} placeholder="What was the expense for?" style={{ display: 'block', width: '100%', marginTop: 4, padding: '8px 10px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, fontFamily: 'inherit', color: C.text, resize: 'vertical', boxSizing: 'border-box' }} />
            </label>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowForm(false)} style={{ padding: '9px 18px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.surface, color: C.muted, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
              <button onClick={submitClaim} disabled={saving} style={{ padding: '9px 24px', borderRadius: 8, border: 'none', background: saving ? C.muted : C.green, color: '#fff', fontSize: 13, fontWeight: 700, cursor: saving ? 'wait' : 'pointer', fontFamily: 'inherit' }}>{saving ? 'Submitting...' : 'Submit Claim'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
