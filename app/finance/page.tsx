'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import PageHeader from '@/app/components/PageHeader'

const C = {
  bg: 'var(--surface)', surface: 'var(--card)', border: 'var(--border)', text: 'var(--ink)', muted: 'var(--ink3)',
  green: 'var(--teal-mid)', // NOTE: named "green" historically, this is brand teal
  amber: '#F5B94D', red: 'var(--red)', blue: 'var(--info)', purple: 'var(--purple)',
}

type Summary = { staff_count: number; total_gross: number; total_net: number; total_expenses: number; grand_total: number }
type ExpenseStat = { pending: number; approved: number; pending_amount: number }
type VendorStat = { pending: number; overdue: number; pending_amount: number; overdue_amount: number }

function fmt(n: number) { return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) }

export default function FinanceDashboard() {
  const [payroll, setPayroll] = useState<Summary | null>(null)
  const [expStat, setExpStat] = useState<ExpenseStat>({ pending: 0, approved: 0, pending_amount: 0 })
  const [vendStat, setVendStat] = useState<VendorStat>({ pending: 0, overdue: 0, pending_amount: 0, overdue_amount: 0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const month = new Date().toISOString().slice(0, 7)
    Promise.all([
      fetch(`/api/hr/payroll-summary?month=${month}`).then(r => r.json()).catch(() => null),
      fetch('/api/hr/expenses?pending=true').then(r => r.json()).catch(() => []),
      fetch('/api/hr/vendor-payments').then(r => r.json()).catch(() => []),
    ]).then(([p, exp, vend]) => {
      if (p) setPayroll(p)
      const exps = Array.isArray(exp) ? exp : []
      setExpStat({
        pending: exps.length,
        approved: 0,
        pending_amount: exps.reduce((s: number, e: { amount: number }) => s + Number(e.amount), 0),
      })
      const vends = Array.isArray(vend) ? vend : []
      const pendingV = vends.filter((v: { status: string }) => v.status === 'pending' || v.status === 'approved')
      const overdueV = vends.filter((v: { status: string }) => v.status === 'overdue')
      setVendStat({
        pending: pendingV.length,
        overdue: overdueV.length,
        pending_amount: pendingV.reduce((s: number, v: { amount: number }) => s + Number(v.amount), 0),
        overdue_amount: overdueV.reduce((s: number, v: { amount: number }) => s + Number(v.amount), 0),
      })
      setLoading(false)
    })
  }, [])

  const MODULES = [
    { label: 'Salary & Compensation', desc: 'Manage staff salary records, bulk CSV import, payroll grades', path: '/finance/salary', color: C.purple, icon: <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg> },
    { label: 'Expense Claims', desc: 'Review and approve staff expense submissions', path: '/finance/expenses', color: C.amber, icon: <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>, badge: expStat.pending > 0 ? `${expStat.pending} pending` : undefined },
    { label: 'Vendor Payments', desc: 'Track vendor invoices, approve payments, monitor overdue', path: '/finance/vendors', color: C.blue, icon: <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>, badge: vendStat.overdue > 0 ? `${vendStat.overdue} overdue` : undefined },
    { label: 'Payroll Summary', desc: 'Monthly payroll overview — salaries + expenses by department', path: '/finance/payroll', color: C.green, icon: <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg> },
    { label: 'Commercial P&L', desc: 'Event profitability — revenue, costs, margins, approvals', path: '/admin/commercial', color: 'var(--teal)', icon: <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/></svg> },
  ]

  return (
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: "'Inter', system-ui, sans-serif" }}>
      <PageHeader eyebrow="Finance" title="Overview" description="Monthly payroll, expense claims, and vendor payment status at a glance." />

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 32px' }}>
        {/* KPI cards */}
        {!loading && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 28 }}>
            <div style={{ padding: '18px 16px', borderRadius: 10, background: C.surface, border: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, marginBottom: 6 }}>Monthly Payroll</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: C.purple }}>${fmt(payroll?.grand_total ?? 0)}</div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>{payroll?.staff_count ?? 0} staff on payroll</div>
            </div>
            <div style={{ padding: '18px 16px', borderRadius: 10, background: C.surface, border: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, marginBottom: 6 }}>Pending Expenses</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: C.amber }}>${fmt(expStat.pending_amount)}</div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>{expStat.pending} claims awaiting approval</div>
            </div>
            <div style={{ padding: '18px 16px', borderRadius: 10, background: C.surface, border: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, marginBottom: 6 }}>Vendor Pending</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: C.blue }}>${fmt(vendStat.pending_amount)}</div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>{vendStat.pending} invoices to process</div>
            </div>
            <div style={{ padding: '18px 16px', borderRadius: 10, background: C.surface, border: vendStat.overdue > 0 ? `2px solid ${C.red}` : `1px solid ${C.border}` }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: vendStat.overdue > 0 ? C.red : C.muted, marginBottom: 6 }}>Overdue Payments</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: vendStat.overdue > 0 ? C.red : C.muted }}>${fmt(vendStat.overdue_amount)}</div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>{vendStat.overdue} overdue invoices</div>
            </div>
          </div>
        )}

        {loading && <div style={{ padding: 40, textAlign: 'center', color: C.muted, fontSize: 14 }}>Loading...</div>}

        {/* Module cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14 }}>
          {MODULES.map(m => (
            <Link key={m.path} href={m.path} style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 16, padding: '20px 22px', borderRadius: 12, background: C.surface, border: `1px solid ${C.border}`, transition: 'all 0.15s' }}>
              <div style={{ width: 44, height: 44, borderRadius: 10, background: `${'color-mix(in srgb, ' + (m.color) + ' 6%, transparent)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: m.color }}>{m.icon}</div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 15, fontWeight: 800, color: C.text }}>{m.label}</span>
                  {m.badge && <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: `${'color-mix(in srgb, ' + (C.red) + ' 7%, transparent)'}`, color: C.red }}>{m.badge}</span>}
                </div>
                <div style={{ fontSize: 13, color: C.muted, marginTop: 3 }}>{m.desc}</div>
              </div>
              <svg width="14" height="14" fill="none" stroke={C.muted} strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><path d="M9 18l6-6-6-6"/></svg>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
