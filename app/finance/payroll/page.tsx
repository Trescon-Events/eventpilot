'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'

const C = { bg: '#F6F8FB', surface: '#FFFFFF', border: '#DDE8EE', text: '#0F1923', muted: '#5B7080', green: '#00897B', amber: '#D97706', red: '#8B1A1A', blue: '#0284C7', purple: '#6C54B5' }

type DeptRow = { department: string; count: number; gross: number; net: number; expenses: number; total: number }
type StaffRow = { staff_id: string; name: string; department: string; basic_salary: number; allowances: number; deductions: number; gross_salary: number; net_salary: number; expenses: number; total: number; currency: string }
type Summary = {
  month: string; staff_count: number; total_basic: number; total_allowances: number;
  total_deductions: number; total_gross: number; total_net: number; total_expenses: number;
  grand_total: number; by_department: DeptRow[]; staff: StaffRow[]
}

function fmt(n: number) { return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) }

export default function PayrollPage() {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7))
  const [data, setData] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'department' | 'staff'>('department')

  const fetchData = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/hr/payroll-summary?month=${month}`)
    const d = await res.json()
    setData(d)
    setLoading(false)
  }, [month])

  useEffect(() => { fetchData() }, [fetchData])

  return (
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, padding: '20px 32px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <Link href="/finance" style={{ color: C.muted, textDecoration: 'none', fontSize: 13 }}>Finance</Link>
            <span style={{ color: C.border }}>/</span>
            <span style={{ fontSize: 13, color: C.text, fontWeight: 700 }}>Payroll Summary</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: C.text, margin: 0 }}>Payroll Summary</h1>
            <input type="month" value={month} onChange={e => setMonth(e.target.value)} style={{ padding: '7px 12px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, fontFamily: 'inherit', color: C.text }} />
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 32px' }}>
        {loading && <div style={{ padding: 40, textAlign: 'center', color: C.muted }}>Loading...</div>}

        {!loading && data && (
          <>
            {/* Summary cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 24 }}>
              {[
                { label: 'Staff on Payroll', value: String(data.staff_count), color: C.text },
                { label: 'Total Gross', value: `$${fmt(data.total_gross)}`, color: C.text },
                { label: 'Total Net Salary', value: `$${fmt(data.total_net)}`, color: C.blue },
                { label: 'Expense Claims', value: `$${fmt(data.total_expenses)}`, color: C.amber },
                { label: 'Grand Total', value: `$${fmt(data.grand_total)}`, color: C.purple },
              ].map(c => (
                <div key={c.label} style={{ padding: '18px 16px', borderRadius: 10, background: C.surface, border: `1px solid ${C.border}` }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, marginBottom: 6 }}>{c.label}</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: c.color }}>{c.value}</div>
                </div>
              ))}
            </div>

            {/* Breakdown bar */}
            {data.total_gross > 0 && (
              <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', marginBottom: 24 }}>
                <div style={{ width: `${(data.total_basic / data.total_gross) * 100}%`, background: C.blue }} title={`Basic: $${fmt(data.total_basic)}`} />
                <div style={{ width: `${(data.total_allowances / data.total_gross) * 100}%`, background: C.green }} title={`Allowances: $${fmt(data.total_allowances)}`} />
                <div style={{ width: `${(data.total_deductions / data.total_gross) * 100}%`, background: C.red }} title={`Deductions: $${fmt(data.total_deductions)}`} />
              </div>
            )}

            {/* View toggle */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
              <button onClick={() => setView('department')} style={{ padding: '7px 16px', borderRadius: 8, border: view === 'department' ? `1.5px solid ${C.purple}` : `1px solid ${C.border}`, background: view === 'department' ? C.purple : C.surface, color: view === 'department' ? '#fff' : C.muted, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>By Department</button>
              <button onClick={() => setView('staff')} style={{ padding: '7px 16px', borderRadius: 8, border: view === 'staff' ? `1.5px solid ${C.blue}` : `1px solid ${C.border}`, background: view === 'staff' ? C.blue : C.surface, color: view === 'staff' ? '#fff' : C.muted, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>By Staff</button>
            </div>

            {/* Department view */}
            {view === 'department' && data.by_department.length > 0 && (
              <div style={{ background: C.surface, borderRadius: 12, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr style={{ background: '#F8FAFB' }}>
                    {['Department', 'Headcount', 'Gross Salary', 'Net Salary', 'Expenses', 'Total Cost'].map(h => (
                      <th key={h} style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, color: C.muted, textAlign: 'left', borderBottom: `1px solid ${C.border}` }}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {data.by_department.map(d => (
                      <tr key={d.department} style={{ borderBottom: `1px solid ${C.border}08` }}>
                        <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 700, color: C.text }}>{d.department}</td>
                        <td style={{ padding: '10px 14px', fontSize: 13, color: C.text }}>{d.count}</td>
                        <td style={{ padding: '10px 14px', fontSize: 13, color: C.text }}>${fmt(d.gross)}</td>
                        <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 700, color: C.blue }}>${fmt(d.net)}</td>
                        <td style={{ padding: '10px 14px', fontSize: 13, color: d.expenses > 0 ? C.amber : C.muted }}>${fmt(d.expenses)}</td>
                        <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 800, color: C.purple }}>${fmt(d.total)}</td>
                      </tr>
                    ))}
                    <tr style={{ background: '#F8FAFB' }}>
                      <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 800, color: C.text }}>TOTAL</td>
                      <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 800, color: C.text }}>{data.staff_count}</td>
                      <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 800, color: C.text }}>${fmt(data.total_gross)}</td>
                      <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 800, color: C.blue }}>${fmt(data.total_net)}</td>
                      <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 800, color: C.amber }}>${fmt(data.total_expenses)}</td>
                      <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 800, color: C.purple }}>${fmt(data.grand_total)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

            {/* Staff view */}
            {view === 'staff' && data.staff.length > 0 && (
              <div style={{ background: C.surface, borderRadius: 12, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr style={{ background: '#F8FAFB' }}>
                    {['Name', 'Department', 'Basic', 'Allowances', 'Deductions', 'Net Salary', 'Expenses', 'Total'].map(h => (
                      <th key={h} style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, color: C.muted, textAlign: 'left', borderBottom: `1px solid ${C.border}` }}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {data.staff.map(s => (
                      <tr key={s.staff_id} style={{ borderBottom: `1px solid ${C.border}08` }}>
                        <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 700, color: C.text }}>{s.name}</td>
                        <td style={{ padding: '10px 14px', fontSize: 12, color: C.muted }}>{s.department}</td>
                        <td style={{ padding: '10px 14px', fontSize: 13, color: C.text }}>${fmt(s.basic_salary)}</td>
                        <td style={{ padding: '10px 14px', fontSize: 13, color: C.green }}>${fmt(s.allowances)}</td>
                        <td style={{ padding: '10px 14px', fontSize: 13, color: C.red }}>${fmt(s.deductions)}</td>
                        <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 700, color: C.blue }}>${fmt(s.net_salary)}</td>
                        <td style={{ padding: '10px 14px', fontSize: 13, color: s.expenses > 0 ? C.amber : C.muted }}>${fmt(s.expenses)}</td>
                        <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 800, color: C.purple }}>${fmt(s.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {data.staff_count === 0 && (
              <div style={{ padding: 48, textAlign: 'center', background: C.surface, borderRadius: 12, border: `1px solid ${C.border}` }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>No salary data for {month}</div>
                <div style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>Upload salary records via <Link href="/hr/salary" style={{ color: C.purple, fontWeight: 700 }}>Salary & Compensation</Link> first</div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
