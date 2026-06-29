'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'

const C = { bg: '#F6F8FB', surface: '#FFFFFF', border: '#DDE8EE', text: '#0F1923', muted: '#5B7080', green: '#00897B', amber: '#D97706', red: '#8B1A1A', blue: '#0284C7', purple: '#6C54B5' }

const CATEGORIES = [
  { value: 'venue', label: 'Venue' }, { value: 'catering', label: 'Catering' },
  { value: 'av_production', label: 'AV / Production' }, { value: 'printing', label: 'Printing' },
  { value: 'marketing', label: 'Marketing' }, { value: 'travel_logistics', label: 'Travel & Logistics' },
  { value: 'technology', label: 'Technology' }, { value: 'staffing', label: 'Staffing / Freelancers' },
  { value: 'government_fees', label: 'Government Fees' }, { value: 'other', label: 'Other' },
]
const STATUS_MAP: Record<string, { label: string; color: string }> = {
  pending: { label: 'Pending', color: C.amber }, approved: { label: 'Approved', color: C.blue },
  paid: { label: 'Paid', color: C.green }, overdue: { label: 'Overdue', color: C.red },
  cancelled: { label: 'Cancelled', color: C.muted },
}
type Session = { sid: string; adm: boolean }
type Payment = {
  id: string; event_id: string | null; vendor_name: string; description: string;
  invoice_number: string | null; amount: number; currency: string; category: string;
  status: string; due_date: string | null; paid_date: string | null; payment_ref: string | null;
  notes: string | null; created_at: string;
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

export default function VendorsPage() {
  const [session, setSession] = useState<Session | null>(null)
  const [payments, setPayments] = useState<Payment[]>([])
  const [events, setEvents] = useState<Event[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [filterStatus, setFilterStatus] = useState('all')

  const [fVendor, setFVendor] = useState('')
  const [fDesc, setFDesc] = useState('')
  const [fInvoice, setFInvoice] = useState('')
  const [fAmount, setFAmount] = useState('')
  const [fCurrency, setFCurrency] = useState('USD')
  const [fCategory, setFCategory] = useState('other')
  const [fEvent, setFEvent] = useState('')
  const [fDue, setFDue] = useState('')
  const [fNotes, setFNotes] = useState('')

  useEffect(() => { setSession(getSession()) }, [])

  const fetchPayments = useCallback(async () => {
    setLoading(true)
    const url = filterStatus === 'all' ? '/api/hr/vendor-payments' : `/api/hr/vendor-payments?status=${filterStatus}`
    const res = await fetch(url)
    const data = await res.json()
    setPayments(Array.isArray(data) ? data : [])
    setLoading(false)
  }, [filterStatus])

  useEffect(() => { if (session) { fetchPayments(); fetch('/api/events').then(r => r.json()).then(d => setEvents(Array.isArray(d) ? d : [])).catch(() => {}) } }, [session, fetchPayments])

  const totalPending = payments.filter(p => p.status === 'pending' || p.status === 'approved').reduce((s, p) => s + p.amount, 0)
  const totalPaid = payments.filter(p => p.status === 'paid').reduce((s, p) => s + p.amount, 0)
  const totalOverdue = payments.filter(p => p.status === 'overdue').reduce((s, p) => s + p.amount, 0)

  async function submitPayment() {
    if (!fVendor.trim() || !fDesc.trim() || !fAmount) { setMsg({ text: 'Vendor, description, and amount required', ok: false }); return }
    setSaving(true); setMsg(null)
    const res = await fetch('/api/hr/vendor-payments', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_id: fEvent || null, vendor_name: fVendor.trim(), description: fDesc.trim(), invoice_number: fInvoice.trim() || null, amount: Number(fAmount), currency: fCurrency, category: fCategory, due_date: fDue || null, notes: fNotes.trim() || null }),
    })
    if (res.ok) { setMsg({ text: 'Vendor payment created', ok: true }); setShowForm(false); setFVendor(''); setFDesc(''); setFAmount(''); setFInvoice(''); setFNotes(''); fetchPayments() }
    else { const d = await res.json(); setMsg({ text: d.error ?? 'Failed', ok: false }) }
    setSaving(false)
  }

  async function handleAction(id: string, status: string) {
    await fetch('/api/hr/vendor-payments', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status, approved_by: session!.sid }),
    })
    fetchPayments()
  }

  if (!session) return null

  return (
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, padding: '20px 32px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <Link href="/finance" style={{ color: C.muted, textDecoration: 'none', fontSize: 13 }}>Finance</Link>
            <span style={{ color: C.border }}>/</span>
            <span style={{ fontSize: 13, color: C.text, fontWeight: 700 }}>Vendor Payments</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: C.text, margin: 0 }}>Vendor Payments</h1>
            <button onClick={() => setShowForm(true)} style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: C.blue, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>+ Add Payment</button>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 32px' }}>
        {msg && <div style={{ padding: '10px 16px', borderRadius: 8, marginBottom: 16, background: msg.ok ? `${C.green}12` : `${C.red}12`, border: `1px solid ${msg.ok ? C.green : C.red}30`, color: msg.ok ? C.green : C.red, fontSize: 13, fontWeight: 600 }}>{msg.text}</div>}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
          <div style={{ padding: '16px 18px', borderRadius: 10, background: C.surface, border: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.muted }}>Pending / Approved</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: C.amber }}>${fmt(totalPending)}</div>
          </div>
          <div style={{ padding: '16px 18px', borderRadius: 10, background: C.surface, border: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.muted }}>Paid</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: C.green }}>${fmt(totalPaid)}</div>
          </div>
          <div style={{ padding: '16px 18px', borderRadius: 10, background: C.surface, border: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.muted }}>Overdue</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: C.red }}>${fmt(totalOverdue)}</div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ padding: '7px 12px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 12, fontFamily: 'inherit', color: C.muted, background: C.surface }}>
            <option value="all">All Statuses</option>
            {Object.entries(STATUS_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>

        {loading && <div style={{ padding: 40, textAlign: 'center', color: C.muted }}>Loading...</div>}
        {!loading && payments.length === 0 && (
          <div style={{ background: C.surface, borderRadius: 12, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr style={{ background: '#F8FAFB' }}>
                {['Vendor', 'Category', 'Event', 'Invoice #', 'Amount', 'Due Date', 'Status', 'Actions'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, color: C.muted, textAlign: 'left', borderBottom: `1px solid ${C.border}` }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                <tr style={{ background: '#FAFBFC' }}>
                  <td colSpan={8} style={{ padding: '24px 14px', textAlign: 'center' }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 4 }}>No vendor payments recorded</div>
                    <div style={{ fontSize: 13, color: C.muted, marginBottom: 12 }}>Track vendor invoices per event — venue, catering, AV, marketing, travel, staffing, government fees.</div>
                    <button onClick={() => setShowForm(true)} style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: C.blue, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>+ Add First Payment</button>
                  </td>
                </tr>
                <tr style={{ opacity: 0.4 }}>
                  <td style={{ padding: '10px 14px' }}><div style={{ fontSize: 13, color: C.muted }}>e.g. Hilton Hotels</div><div style={{ fontSize: 11, color: C.muted }}>Venue hire for 2 days</div></td>
                  <td style={{ padding: '10px 14px', fontSize: 12, color: C.muted }}>Venue</td>
                  <td style={{ padding: '10px 14px', fontSize: 12, color: C.muted }}>World AI Show</td>
                  <td style={{ padding: '10px 14px', fontSize: 12, color: C.muted }}>INV-2026-001</td>
                  <td style={{ padding: '10px 14px', fontSize: 13, color: C.muted }}>AED 45,000.00</td>
                  <td style={{ padding: '10px 14px', fontSize: 12, color: C.muted }}>2026-08-01</td>
                  <td style={{ padding: '10px 14px' }}><span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: `${C.amber}12`, color: C.amber }}>Pending</span></td>
                  <td style={{ padding: '10px 14px', fontSize: 11, color: C.muted }}>Approve / Pay</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {payments.length > 0 && (
          <div style={{ background: C.surface, borderRadius: 12, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr style={{ background: '#F8FAFB' }}>
                {['Vendor', 'Category', 'Event', 'Invoice', 'Amount', 'Due Date', 'Status', 'Actions'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, color: C.muted, textAlign: 'left', borderBottom: `1px solid ${C.border}` }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {payments.map(p => {
                  const s = STATUS_MAP[p.status] ?? STATUS_MAP.pending
                  return (
                    <tr key={p.id} style={{ borderBottom: `1px solid ${C.border}08` }}>
                      <td style={{ padding: '10px 14px' }}><div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{p.vendor_name}</div><div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{p.description}</div></td>
                      <td style={{ padding: '10px 14px', fontSize: 12, color: C.muted }}>{CATEGORIES.find(x => x.value === p.category)?.label ?? p.category}</td>
                      <td style={{ padding: '10px 14px', fontSize: 12, color: C.muted }}>{p.event?.name ?? '—'}</td>
                      <td style={{ padding: '10px 14px', fontSize: 12, color: C.muted }}>{p.invoice_number ?? '—'}</td>
                      <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 800, color: C.text }}>{p.currency} {fmt(p.amount)}</td>
                      <td style={{ padding: '10px 14px', fontSize: 12, color: p.due_date && new Date(p.due_date) < new Date() && p.status !== 'paid' ? C.red : C.muted }}>{p.due_date ?? '—'}</td>
                      <td style={{ padding: '10px 14px' }}><span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: `${s.color}12`, color: s.color }}>{s.label}</span></td>
                      <td style={{ padding: '10px 14px', display: 'flex', gap: 4 }}>
                        {p.status === 'pending' && <button onClick={() => handleAction(p.id, 'approved')} style={{ padding: '4px 10px', borderRadius: 6, border: 'none', background: C.blue, color: '#fff', fontSize: 10, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Approve</button>}
                        {p.status === 'approved' && <button onClick={() => handleAction(p.id, 'paid')} style={{ padding: '4px 10px', borderRadius: 6, border: 'none', background: C.green, color: '#fff', fontSize: 10, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Mark Paid</button>}
                        {(p.status === 'pending' || p.status === 'approved') && <button onClick={() => handleAction(p.id, 'cancelled')} style={{ padding: '4px 10px', borderRadius: 6, border: `1px solid ${C.red}`, background: 'transparent', color: C.red, fontSize: 10, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* New payment modal */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setShowForm(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background: C.surface, borderRadius: 14, padding: 28, width: 480, maxHeight: '85vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: C.text, marginBottom: 20 }}>Add Vendor Payment</div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: C.muted, marginBottom: 14 }}>Vendor Name
              <input value={fVendor} onChange={e => setFVendor(e.target.value)} placeholder="e.g. Hilton Hotels" style={{ display: 'block', width: '100%', marginTop: 4, padding: '8px 10px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, fontFamily: 'inherit', color: C.text, boxSizing: 'border-box' }} />
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: C.muted }}>Category
                <select value={fCategory} onChange={e => setFCategory(e.target.value)} style={{ display: 'block', width: '100%', marginTop: 4, padding: '8px 10px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, fontFamily: 'inherit', color: C.text, background: C.surface }}>{CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}</select>
              </label>
              <label style={{ fontSize: 12, fontWeight: 700, color: C.muted }}>Event (optional)
                <select value={fEvent} onChange={e => setFEvent(e.target.value)} style={{ display: 'block', width: '100%', marginTop: 4, padding: '8px 10px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, fontFamily: 'inherit', color: C.text, background: C.surface }}>
                  <option value="">No event</option>{events.map(ev => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
                </select>
              </label>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: C.muted }}>Amount
                <input type="number" min="0" step="0.01" value={fAmount} onChange={e => setFAmount(e.target.value)} style={{ display: 'block', width: '100%', marginTop: 4, padding: '8px 10px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, fontFamily: 'inherit', color: C.text, boxSizing: 'border-box' }} />
              </label>
              <label style={{ fontSize: 12, fontWeight: 700, color: C.muted }}>Currency
                <select value={fCurrency} onChange={e => setFCurrency(e.target.value)} style={{ display: 'block', width: '100%', marginTop: 4, padding: '8px 10px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, fontFamily: 'inherit', color: C.text, background: C.surface }}>{['USD','AED','INR','EUR','GBP'].map(c => <option key={c} value={c}>{c}</option>)}</select>
              </label>
              <label style={{ fontSize: 12, fontWeight: 700, color: C.muted }}>Due Date
                <input type="date" value={fDue} onChange={e => setFDue(e.target.value)} style={{ display: 'block', width: '100%', marginTop: 4, padding: '8px 10px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, fontFamily: 'inherit', color: C.text, boxSizing: 'border-box' }} />
              </label>
            </div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: C.muted, marginBottom: 14 }}>Invoice Number
              <input value={fInvoice} onChange={e => setFInvoice(e.target.value)} placeholder="INV-2026-001" style={{ display: 'block', width: '100%', marginTop: 4, padding: '8px 10px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, fontFamily: 'inherit', color: C.text, boxSizing: 'border-box' }} />
            </label>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: C.muted, marginBottom: 14 }}>Description
              <textarea value={fDesc} onChange={e => setFDesc(e.target.value)} rows={2} placeholder="What is this payment for?" style={{ display: 'block', width: '100%', marginTop: 4, padding: '8px 10px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, fontFamily: 'inherit', color: C.text, resize: 'vertical', boxSizing: 'border-box' }} />
            </label>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowForm(false)} style={{ padding: '9px 18px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.surface, color: C.muted, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
              <button onClick={submitPayment} disabled={saving} style={{ padding: '9px 24px', borderRadius: 8, border: 'none', background: saving ? C.muted : C.blue, color: '#fff', fontSize: 13, fontWeight: 700, cursor: saving ? 'wait' : 'pointer', fontFamily: 'inherit' }}>{saving ? 'Saving...' : 'Add Payment'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
