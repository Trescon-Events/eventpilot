'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import PageHeader from '@/app/components/PageHeader'
import ReadinessCard from './ReadinessCard'

type Tab = 'summary' | 'revenue' | 'staff' | 'costs' | 'overheads' | 'pnl' | 'scenarios' | 'approvals'

// ═══════════════════════════════════════
// INTERFACES
// ═══════════════════════════════════════
interface SummaryRow { label: string; budgeted: number; adjusted: number; current: number; difference: number; status: 'good' | 'bad' }
interface SummaryData {
  event_id: string; event_name: string; currency: string; health: string; has_adjusted: boolean
  revenue_target: number; revenue_confirmed: number; revenue_pending: number; revenue_gap: number
  revenue_achievement: number; revenue_with_pipeline: number
  revenue_by_type: Record<string, { confirmed: number; pending: number; count: number }>
  target_by_category: Record<string, { target: number; sold: number; pipeline: number; items: number }>
  cost_budget: number; direct_costs: number; staff_costs: number; overhead_costs: number
  corporate_allocation: number; total_costs: number; cost_burn: number
  paid_expenses: number; unpaid_expenses: number
  gross_profit: number; net_profit: number
  metrics: { gross_margin: number; net_margin: number; revenue_achievement: number; budget_variance: number; cost_variance: number; roi: number }
  staff_count: number; staff_hours: number; staff_by_department: Record<string, { hours: number; cost: number; count: number }>
  overhead_finance: number; overhead_hr: number; overhead_components: Array<{ component: string; model: string; rate: number; monthly_pool: number; allocated: number }>
  rows: SummaryRow[]
  inventory_items: number
}
interface InventoryItem {
  id: string; name: string; category: string; subcategory: string | null; quantity: number; unit_price: number
  currency: string; reserved: number; sold: number; total_potential: number; total_sold_value: number; total_pipeline: number
  adjusted_qty: number | null; adjusted_price: number | null; notes: string
}
interface Deal {
  id: string; deal_type: string; company_name: string; contact_name: string
  amount: number; deal_currency: string; converted_amount: number; status: string; deal_date: string
}
interface StaffCostEntry {
  staff_id: string; name: string; department: string; total_hours: number
  days_worked: number; monthly_salary: number; currency: string; allocated_cost: number; salary_missing: boolean
}
interface StaffCostData { staff: StaffCostEntry[]; total_cost: number; total_hours: number; total_staff: number; by_department: Record<string, { hours: number; cost: number; count: number }> }
interface Scenario {
  id: string; name: string; scenario_type: string; total_revenue: number; total_cost: number; net_profit: number; margin_pct: number
  revenue_adjustments: Array<{ pct: number }>; cost_adjustments: Array<{ pct: number }>
}
interface Approval {
  id: string; approval_type: string; overall_status: string; current_step: number; created_at: string
  step_1_role: string; step_1_status: string; step_1_at: string | null
  step_2_role: string; step_2_status: string; step_2_at: string | null
  step_3_role: string; step_3_status: string; step_3_at: string | null
  step_4_role: string; step_4_status: string; step_4_at: string | null
  requested_by_staff: { id: string; name: string } | null
  request_payload: Record<string, unknown>
}

const TABS: { key: Tab; label: string }[] = [
  { key: 'summary', label: 'Commercial Summary' },
  { key: 'revenue', label: 'Revenue' },
  { key: 'staff', label: 'Staff Costs' },
  { key: 'costs', label: 'Direct Costs' },
  { key: 'overheads', label: 'Overheads' },
  { key: 'pnl', label: 'P&L Statement' },
  { key: 'scenarios', label: 'Scenarios' },
  { key: 'approvals', label: 'Approvals' },
]

const HEALTH_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  profitable: { label: 'Profitable', color: 'var(--success)', bg: 'var(--success-light)' },
  on_track: { label: 'On Track', color: 'var(--info)', bg: 'var(--info-light)' },
  at_risk: { label: 'At Risk', color: 'var(--amber)', bg: 'var(--amber-light)' },
  loss: { label: 'Loss', color: 'var(--red)', bg: 'var(--red-light)' },
}

const DEAL_TYPES = ['sponsorship','exhibition','delegate_package','media_partner','ticket_sales','government_partnership','strategic_partner','awards','workshop','addon','other']

// ═══════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════
export default function CommercialWorkspace() {
  const { eventId } = useParams<{ eventId: string }>()
  const [tab, setTab] = useState<Tab>('summary')
  const [summary, setSummary] = useState<SummaryData | null>(null)
  const [inventory, setInventory] = useState<InventoryItem[]>([])
  const [deals, setDeals] = useState<Deal[]>([])
  const [staffData, setStaffData] = useState<StaffCostData | null>(null)
  const [scenarios, setScenarios] = useState<Scenario[]>([])
  const [approvals, setApprovals] = useState<Approval[]>([])
  const [loading, setLoading] = useState(true)

  const fmt = useCallback((n: number, c?: string) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: c || summary?.currency || 'USD', maximumFractionDigits: 0 }).format(n)
  , [summary?.currency])

  const fc = (n: number) => { if (Math.abs(n) >= 1e6) return `$${(n/1e6).toFixed(1)}M`; if (Math.abs(n) >= 1e3) return `$${(n/1e3).toFixed(0)}K`; return `$${n.toFixed(0)}` }

  // Load summary on mount
  useEffect(() => {
    if (!eventId) return
    fetch(`/api/events/commercial/summary?event_id=${eventId}`)
      .then(r => r.json()).then(d => { if (d.rows) setSummary(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [eventId])

  // Load tab-specific data
  useEffect(() => {
    if (!eventId) return
    if (tab === 'revenue') {
      Promise.all([
        fetch(`/api/events/commercial/inventory?event_id=${eventId}`).then(r => r.json()),
        fetch(`/api/events/deals?event_id=${eventId}`).then(r => r.json()),
      ]).then(([inv, dls]) => { setInventory(Array.isArray(inv) ? inv : []); setDeals(Array.isArray(dls) ? dls : []) })
    } else if (tab === 'staff') {
      fetch(`/api/events/commercial/staff-costs?event_id=${eventId}`).then(r => r.json()).then(d => setStaffData(d))
    } else if (tab === 'scenarios') {
      fetch(`/api/events/commercial/scenarios?event_id=${eventId}`).then(r => r.json()).then(d => setScenarios(Array.isArray(d) ? d : []))
    } else if (tab === 'approvals') {
      fetch(`/api/events/commercial/approvals?event_id=${eventId}`).then(r => r.json()).then(d => setApprovals(Array.isArray(d) ? d : []))
    }
  }, [eventId, tab])

  if (loading) return (
    <div style={{ background: 'var(--surface)', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: '28px', height: '28px', border: '3px solid var(--border)', borderTopColor: 'var(--teal-mid)', borderRadius: '50%', animation: 'spin .7s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  const h = HEALTH_CONFIG[summary?.health || 'loss']

  return (
    <div style={{ background: 'var(--surface)', minHeight: '100vh' }}>
      <PageHeader
        title={summary?.event_name || 'Event Workspace'}
        actions={
          <>
            {summary && <span style={{ fontSize: '11px', fontWeight: 700, padding: '3px 10px', borderRadius: '6px', background: h.bg, color: h.color }}>{h.label}</span>}
            <Link href={`/admin/events/${eventId}`} style={{ fontSize: '12px', fontWeight: 700, color: 'var(--ink3)', textDecoration: 'none', padding: '6px 14px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--card)', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/></svg>
              Event Operations
            </Link>
          </>
        }
      />
      <div style={{ maxWidth: '1440px', margin: '0 auto', padding: '20px 24px' }}>

        {/* ── P&L Readiness (surfaces missing inputs before rendering the P&L) ── */}
        {eventId && <ReadinessCard eventId={eventId} />}

        {/* ── QUICK KPIs (always visible) ── */}
        {summary && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '10px', marginBottom: '16px' }}>
            {[
              { l: 'Revenue Target', v: fc(summary.revenue_target), c: 'var(--info)' },
              { l: 'Confirmed', v: fc(summary.revenue_confirmed), c: 'var(--teal-mid)' },
              { l: 'Pipeline', v: fc(summary.revenue_pending), c: '#F5B94D' },
              { l: 'Gap to Target', v: fc(summary.revenue_gap), c: summary.revenue_gap > 0 ? 'var(--red)' : 'var(--success)' },
              { l: 'Total Costs', v: fc(summary.total_costs), c: 'var(--red)' },
              { l: 'Net Profit', v: fc(summary.net_profit), c: summary.net_profit >= 0 ? 'var(--success)' : 'var(--red)' },
              { l: 'Achievement', v: `${summary.revenue_achievement}%`, c: summary.revenue_achievement >= 80 ? 'var(--success)' : '#F5B94D' },
            ].map((k, i) => (
              <div key={i} style={{ ...card, padding: '14px 16px' }}>
                <p style={{ ...kpiLabel }}>{k.l}</p>
                <p style={{ fontSize: '18px', fontWeight: 900, color: k.c, margin: '4px 0 0', fontFamily: 'Manrope, system-ui' }}>{k.v}</p>
              </div>
            ))}
          </div>
        )}

        {/* ── TAB BAR ── */}
        <div style={{ display: 'flex', gap: '2px', borderBottom: '1px solid var(--border)', marginBottom: '20px', overflowX: 'auto' }}>
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} style={{
              padding: '9px 18px', fontSize: '12px', fontWeight: tab === t.key ? 800 : 600,
              color: tab === t.key ? 'var(--ink)' : 'var(--ink3)', background: tab === t.key ? 'var(--card)' : 'transparent',
              border: 'none', borderBottom: tab === t.key ? '2px solid var(--teal-mid)' : '2px solid transparent',
              borderRadius: tab === t.key ? '8px 8px 0 0' : '0', cursor: 'pointer', whiteSpace: 'nowrap' as const,
              marginBottom: '-1px', fontFamily: 'inherit',
            }}>{t.label}</button>
          ))}
        </div>

        {/* ── TAB CONTENT ── */}
        {tab === 'summary' && <SummaryTab s={summary} fmt={fmt} />}
        {tab === 'revenue' && <RevenueTab inventory={inventory} deals={deals} summary={summary} eventId={eventId} fmt={fmt} fc={fc} onRefresh={() => {
          Promise.all([
            fetch(`/api/events/commercial/inventory?event_id=${eventId}`).then(r => r.json()),
            fetch(`/api/events/deals?event_id=${eventId}`).then(r => r.json()),
          ]).then(([inv, dls]) => { setInventory(Array.isArray(inv) ? inv : []); setDeals(Array.isArray(dls) ? dls : []) })
        }} />}
        {tab === 'staff' && <StaffTab data={staffData} fmt={fmt} />}
        {tab === 'costs' && <CostsTab eventId={eventId} fmt={fmt} />}
        {tab === 'overheads' && <OverheadsTab summary={summary} fmt={fmt} />}
        {tab === 'pnl' && <PnLTab s={summary} fmt={fmt} fc={fc} />}
        {tab === 'scenarios' && <ScenariosTab scenarios={scenarios} eventId={eventId} fmt={fmt} fc={fc} />}
        {tab === 'approvals' && <ApprovalsTab approvals={approvals} eventId={eventId} />}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════
// SUMMARY TAB — BRD Section 6B
// ═══════════════════════════════════════
function SummaryTab({ s, fmt }: { s: SummaryData | null; fmt: (n: number) => string }) {
  if (!s) return <Empty msg="No financial data yet. Set a revenue target and start logging deals." />

  return (
    <div>
      {/* Info note */}
      <div style={{ ...infoBox, marginBottom: '16px' }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--info)" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
        <p style={{ fontSize: '12px', color: 'var(--info)', margin: 0 }}>
          <strong>Target</strong> = revenue target from commercial inventory. <strong>Adjusted</strong> = revised forecast by finance. <strong>Current</strong> = live actuals. <strong>Difference</strong> = Current - Adjusted.
        </p>
      </div>

      {/* 6 Key Metrics — BRD Section 11 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '10px', marginBottom: '18px' }}>
        {[
          { l: 'Gross Margin', v: `${s.metrics.gross_margin}%`, c: s.metrics.gross_margin >= 20 ? 'var(--success)' : '#F5B94D' },
          { l: 'Net Margin', v: `${s.metrics.net_margin}%`, c: s.metrics.net_margin >= 15 ? 'var(--success)' : s.metrics.net_margin >= 0 ? '#F5B94D' : 'var(--red)' },
          { l: 'Rev Achievement', v: `${s.metrics.revenue_achievement}%`, c: s.metrics.revenue_achievement >= 80 ? 'var(--success)' : '#F5B94D' },
          { l: 'Budget Variance', v: `${s.metrics.budget_variance}%`, c: s.metrics.budget_variance >= 0 ? 'var(--success)' : 'var(--red)' },
          { l: 'Cost Variance', v: `${s.metrics.cost_variance}%`, c: s.metrics.cost_variance <= 0 ? 'var(--success)' : 'var(--red)' },
          { l: 'ROI', v: `${s.metrics.roi}%`, c: s.metrics.roi >= 0 ? 'var(--success)' : 'var(--red)' },
        ].map((m, i) => (
          <div key={i} style={{ ...card, padding: '14px 16px', textAlign: 'center' as const }}>
            <p style={{ ...kpiLabel }}>{m.l}</p>
            <p style={{ fontSize: '20px', fontWeight: 900, color: m.c, margin: '4px 0 0' }}>{m.v}</p>
          </div>
        ))}
      </div>

      {/* 4-Column Table — BRD Section 6B + 13 */}
      <div style={{ ...card, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'var(--surface)' }}>
              <th style={{ ...th, textAlign: 'left' as const, width: '180px' }}>Metric</th>
              <th style={{ ...th, textAlign: 'right' as const }}>Target</th>
              <th style={{ ...th, textAlign: 'right' as const }}>Adjusted</th>
              <th style={{ ...th, textAlign: 'right' as const }}>Current</th>
              <th style={{ ...th, textAlign: 'right' as const }}>Difference</th>
            </tr>
          </thead>
          <tbody>
            {s.rows.map((row, i) => {
              const isPercent = row.label.includes('%')
              const isProfit = row.label.includes('Profit')
              const isSep = row.label === 'Gross Profit' || row.label === 'Net Profit'
              return (
                <tr key={i} style={{ borderBottom: '1px solid var(--surface)', background: isProfit ? 'var(--surface)' : 'transparent', borderTop: isSep ? '2px solid var(--border)' : undefined }}>
                  <td style={{ padding: '12px 14px', fontSize: '13px', fontWeight: isProfit ? 800 : 600, color: 'var(--ink)' }}>{row.label}</td>
                  <td style={{ padding: '12px 14px', fontSize: '13px', fontWeight: 600, color: 'var(--ink3)', textAlign: 'right' as const }}>{isPercent ? `${row.budgeted}%` : fmt(row.budgeted)}</td>
                  <td style={{ padding: '12px 14px', fontSize: '13px', fontWeight: 600, color: 'var(--ink3)', textAlign: 'right' as const }}>{isPercent ? `${row.adjusted}%` : fmt(row.adjusted)}</td>
                  <td style={{ padding: '12px 14px', fontSize: '14px', fontWeight: 800, textAlign: 'right' as const,
                    color: isProfit ? (row.current >= 0 ? 'var(--success)' : 'var(--red)') : row.label === 'Revenue' ? 'var(--teal-mid)' : 'var(--ink)' }}>
                    {isPercent ? `${row.current}%` : fmt(row.current)}
                  </td>
                  <td style={{ padding: '12px 14px', fontSize: '13px', fontWeight: 700, textAlign: 'right' as const, color: row.status === 'good' ? 'var(--success)' : 'var(--red)' }}>
                    {row.difference > 0 ? '+' : ''}{isPercent ? `${row.difference}%` : fmt(row.difference)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════
// REVENUE TAB — BRD Section 7
// ═══════════════════════════════════════
function RevenueTab({ inventory, deals, summary, eventId, fmt, fc, onRefresh }: {
  inventory: InventoryItem[]; deals: Deal[]; summary: SummaryData | null; eventId: string; fmt: (n: number) => string; fc: (n: number) => string; onRefresh: () => void
}) {
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', category: 'sponsorship', subcategory: '', quantity: 1, unit_price: 0, currency: 'USD', notes: '' })
  const [saving, setSaving] = useState(false)

  async function handleAdd() {
    if (!form.name || !form.unit_price) return
    setSaving(true)
    await fetch('/api/events/commercial/inventory', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event_id: eventId, ...form }) })
    setForm({ name: '', category: 'sponsorship', subcategory: '', quantity: 1, unit_price: 0, currency: 'USD', notes: '' })
    setShowForm(false); setSaving(false); onRefresh()
  }

  const totalTarget = inventory.reduce((s, i) => s + Number(i.total_potential || 0), 0)
  const totalSold = inventory.reduce((s, i) => s + Number(i.total_sold_value || 0), 0)
  const totalPipeline = inventory.reduce((s, i) => s + Number(i.total_pipeline || 0), 0)

  return (
    <div>
      {/* Revenue pipeline KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '10px', marginBottom: '18px' }}>
        {[
          { l: 'Revenue Target', v: fc(totalTarget), c: 'var(--info)' },
          { l: 'Confirmed (Sold)', v: fc(totalSold), c: 'var(--success)' },
          { l: 'Pipeline (Reserved)', v: fc(totalPipeline), c: '#F5B94D' },
          { l: 'Available', v: fc(totalTarget - totalSold - totalPipeline), c: 'var(--ink3)' },
        ].map((k, i) => (
          <div key={i} style={{ ...card, padding: '16px 18px', textAlign: 'center' as const }}>
            <p style={{ ...kpiLabel }}>{k.l}</p>
            <p style={{ fontSize: '20px', fontWeight: 900, color: k.c, margin: '4px 0 0', fontFamily: 'Manrope, system-ui' }}>{k.v}</p>
          </div>
        ))}
      </div>

      {/* Add inventory button */}
      <div style={{ marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ fontSize: '14px', fontWeight: 800, color: 'var(--ink)', margin: 0 }}>Commercial Inventory</h3>
        <button onClick={() => setShowForm(!showForm)} style={{ ...btnLime }}>{showForm ? 'Cancel' : '+ Add Item'}</button>
      </div>

      {/* Add form */}
      {showForm && (
        <div style={{ ...card, padding: '18px', marginBottom: '14px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr', gap: '10px', marginBottom: '12px' }}>
            <div><label style={labelSt}>Name *</label><input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} style={inputSt} placeholder="Platinum Sponsor" /></div>
            <div><label style={labelSt}>Category</label>
              <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} style={inputSt}>
                {DEAL_TYPES.map(c => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}
              </select>
            </div>
            <div><label style={labelSt}>Subcategory</label><input value={form.subcategory} onChange={e => setForm(f => ({ ...f, subcategory: e.target.value }))} style={inputSt} placeholder="Optional" /></div>
            <div><label style={labelSt}>Qty</label><input type="number" value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: parseInt(e.target.value) || 1 }))} style={inputSt} /></div>
            <div><label style={labelSt}>Unit Price *</label><input type="number" value={form.unit_price || ''} onChange={e => setForm(f => ({ ...f, unit_price: parseFloat(e.target.value) || 0 }))} style={inputSt} placeholder="50000" /></div>
          </div>
          <button onClick={handleAdd} disabled={saving} style={{ ...btnLime, opacity: saving ? 0.5 : 1 }}>{saving ? 'Saving...' : 'Add Item'}</button>
        </div>
      )}

      {/* Inventory table — BRD: Item, Qty, Unit Price, Budgeted, Adjusted, Current, Difference */}
      <div style={{ ...card, overflow: 'hidden', marginBottom: '24px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr style={{ background: 'var(--surface)' }}>
            {['Item', 'Category', 'Qty', 'Unit Price', 'Budgeted', 'Adjusted', 'Sold', 'Pipeline', 'Difference'].map(h => (
              <TH key={h} left={h === 'Item'}>{h}</TH>
            ))}
          </tr></thead>
          <tbody>
            {inventory.map(item => {
              const budgeted = Number(item.total_potential)
              const adjQty = item.adjusted_qty != null ? item.adjusted_qty : item.quantity
              const adjPrice = item.adjusted_price != null ? item.adjusted_price : item.unit_price
              const adjusted = adjQty * adjPrice
              const current = Number(item.total_sold_value)
              const diff = current - adjusted
              return (
                <tr key={item.id} style={{ borderBottom: '1px solid var(--surface)' }}>
                  <td style={{ padding: '10px 14px' }}>
                    <p style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink)', margin: 0 }}>{item.name}</p>
                    {item.subcategory && <p style={{ fontSize: '10px', color: 'var(--ink3)', margin: '1px 0 0' }}>{item.subcategory}</p>}
                  </td>
                  <td style={{ ...tdR, fontSize: '11px', color: 'var(--ink3)', textTransform: 'capitalize' as const }}>{item.category.replace(/_/g, ' ')}</td>
                  <td style={tdR}>{item.quantity}</td>
                  <td style={tdR}>{fmt(item.unit_price)}</td>
                  <td style={{ ...tdR, color: 'var(--info)' }}>{fmt(budgeted)}</td>
                  <td style={{ ...tdR, color: 'var(--ink3)' }}>{fmt(adjusted)}</td>
                  <td style={{ ...tdR, fontWeight: 700, color: 'var(--success)' }}>{fmt(current)}</td>
                  <td style={{ ...tdR, color: '#F5B94D' }}>{fmt(Number(item.total_pipeline))}</td>
                  <td style={{ ...tdR, fontWeight: 700, color: diff >= 0 ? 'var(--success)' : 'var(--red)' }}>{diff > 0 ? '+' : ''}{fmt(diff)}</td>
                </tr>
              )
            })}
            {inventory.length === 0 && <tr><td colSpan={9} style={emptyTd}>No inventory items. Add your revenue targets above.</td></tr>}
          </tbody>
        </table>
      </div>

      {/* Logged Deals */}
      <h3 style={{ fontSize: '14px', fontWeight: 800, color: 'var(--ink)', margin: '0 0 12px' }}>Logged Deals ({deals.length})</h3>
      <div style={{ ...card, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr style={{ background: 'var(--surface)' }}>
            {['Company', 'Type', 'Amount', 'Status', 'Date'].map(h => <TH key={h} left={h === 'Company'}>{h}</TH>)}
          </tr></thead>
          <tbody>
            {deals.map(d => (
              <tr key={d.id} style={{ borderBottom: '1px solid var(--surface)' }}>
                <td style={{ padding: '10px 14px' }}>
                  <p style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink)', margin: 0 }}>{d.company_name}</p>
                  {d.contact_name && <p style={{ fontSize: '10px', color: 'var(--ink3)', margin: '1px 0 0' }}>{d.contact_name}</p>}
                </td>
                <td style={{ ...tdR, fontSize: '11px', textTransform: 'capitalize' as const, color: 'var(--ink3)' }}>{d.deal_type.replace(/_/g, ' ')}</td>
                <td style={{ ...tdR, fontWeight: 700, color: 'var(--teal-mid)' }}>{fmt(d.converted_amount || d.amount)}</td>
                <td style={tdR}><StatusBadge status={d.status} /></td>
                <td style={{ ...tdR, color: 'var(--ink3)', fontSize: '12px' }}>{d.deal_date || '-'}</td>
              </tr>
            ))}
            {deals.length === 0 && <tr><td colSpan={5} style={emptyTd}>No deals logged. Add deals from Event Workspace.</td></tr>}
          </tbody>
        </table>
        {deals.length > 0 && (
          <div style={{ padding: '12px 14px', borderTop: '2px solid var(--border)', display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--ink3)' }}>{deals.filter(d => d.status === 'confirmed').length} confirmed, {deals.filter(d => d.status === 'pending').length} pending</span>
            <span style={{ fontSize: '14px', fontWeight: 800, color: 'var(--success)' }}>Confirmed: {fmt(deals.filter(d => d.status === 'confirmed').reduce((s, d) => s + Number(d.converted_amount || d.amount || 0), 0))}</span>
          </div>
        )}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════
// STAFF COSTS TAB — BRD Section 8
// ═══════════════════════════════════════
function StaffTab({ data, fmt }: { data: StaffCostData | null; fmt: (n: number) => string }) {
  if (!data || data.staff.length === 0) return <Empty msg="No approved timesheet data for this event. Staff costs auto-calculate from approved timesheets + salary records." />

  const missing = data.staff.filter(s => s.salary_missing).length

  return (
    <div>
      {missing > 0 && (
        <div style={{ ...warnBox, marginBottom: '14px' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--amber)" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          <p style={{ fontSize: '12px', fontWeight: 600, color: 'var(--amber)', margin: 0 }}>{missing} staff member{missing > 1 ? 's have' : ' has'} no salary record. Cost shows as $0. Add salary records in HR.</p>
        </div>
      )}

      {/* Total + formula */}
      <div style={{ ...card, padding: '18px 20px', marginBottom: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <p style={kpiLabel}>Total Staff Cost Allocation</p>
          <p style={{ fontSize: '24px', fontWeight: 900, color: 'var(--red)', margin: '4px 0 0' }}>{fmt(data.total_cost)}</p>
        </div>
        <div style={{ textAlign: 'right' as const }}>
          <p style={{ fontSize: '11px', color: 'var(--ink3)', margin: 0 }}>{data.total_staff} staff, {data.total_hours}h logged</p>
          <p style={{ fontSize: '10px', color: 'var(--ink3)', margin: '2px 0 0' }}>Formula: (Salary x Days) / Working Days</p>
        </div>
      </div>

      {/* Department breakdown */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '10px', marginBottom: '16px' }}>
        {Object.entries(data.by_department).map(([dept, info]) => (
          <div key={dept} style={{ ...card, padding: '14px 16px' }}>
            <p style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink3)', margin: '0 0 2px' }}>{dept}</p>
            <p style={{ fontSize: '16px', fontWeight: 900, color: 'var(--ink)', margin: 0 }}>{fmt(info.cost)}</p>
            <p style={{ fontSize: '10px', color: 'var(--ink3)', margin: '2px 0 0' }}>{info.count} staff, {info.hours}h</p>
          </div>
        ))}
      </div>

      {/* Staff table — BRD: Employee, Department, Days Worked, Allocated Salary, Budgeted, Current, Difference */}
      <div style={{ ...card, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr style={{ background: 'var(--surface)' }}>
            {['Employee', 'Department', 'Hours', 'Days', 'Monthly Salary', 'Allocated Cost'].map(h => <TH key={h} left={h === 'Employee'}>{h}</TH>)}
          </tr></thead>
          <tbody>
            {data.staff.map(s => (
              <tr key={s.staff_id} style={{ borderBottom: '1px solid var(--surface)', background: s.salary_missing ? 'var(--amber-light)' : 'transparent' }}>
                <td style={{ padding: '10px 14px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink)' }}>{s.name}</span>
                  {s.salary_missing && <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--amber)', marginLeft: '6px' }}>No salary</span>}
                </td>
                <td style={{ ...tdR, color: 'var(--ink3)', fontSize: '12px' }}>{s.department}</td>
                <td style={tdR}>{s.total_hours}h</td>
                <td style={tdR}>{s.days_worked}</td>
                <td style={{ ...tdR, color: s.salary_missing ? 'var(--amber)' : 'var(--ink3)' }}>{s.salary_missing ? 'Missing' : fmt(s.monthly_salary)}</td>
                <td style={{ ...tdR, fontWeight: 800, color: s.salary_missing ? 'var(--amber)' : 'var(--red)' }}>{s.salary_missing ? '$0' : fmt(s.allocated_cost)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════
// DIRECT COSTS TAB — BRD Section 9
// ═══════════════════════════════════════
function CostsTab({ eventId, fmt }: { eventId: string; fmt: (n: number) => string }) {
  const [expenses, setExpenses] = useState<Array<{ id: string; description: string; converted_amount: number; expense_date: string; vendor_name: string | null; po_number: string | null; invoice_number: string | null; payment_status: string; approval_status: string; category: { id: string; name: string; parent_id: string | null } | null }>>([])
  const [categories, setCategories] = useState<Array<{ id: string; name: string; parent_id: string | null }>>([])

  useEffect(() => {
    Promise.all([
      fetch(`/api/events/expenses?event_id=${eventId}`).then(r => r.json()),
      fetch('/api/expense-categories').then(r => r.json()),
    ]).then(([exp, cats]) => {
      setExpenses(Array.isArray(exp) ? exp : [])
      setCategories(Array.isArray(cats) ? cats : [])
    })
  }, [eventId])

  // Group by parent category
  const parentCats = categories.filter(c => !c.parent_id)
  const grouped: Record<string, { name: string; total: number; items: typeof expenses }> = {}
  for (const cat of parentCats) {
    const childIds = categories.filter(c => c.parent_id === cat.id).map(c => c.id)
    const allIds = [cat.id, ...childIds]
    const items = expenses.filter(e => e.category && allIds.includes(e.category.id))
    if (items.length > 0) {
      grouped[cat.id] = { name: cat.name, total: items.reduce((s, e) => s + Number(e.converted_amount || 0), 0), items }
    }
  }
  // Uncategorized
  const categorized = Object.values(grouped).flatMap(g => g.items.map(i => i.id))
  const uncategorized = expenses.filter(e => !categorized.includes(e.id))
  if (uncategorized.length > 0) {
    grouped['uncategorized'] = { name: 'Uncategorized', total: uncategorized.reduce((s, e) => s + Number(e.converted_amount || 0), 0), items: uncategorized }
  }

  const total = expenses.reduce((s, e) => s + Number(e.converted_amount || 0), 0)

  return (
    <div>
      <div style={{ ...card, padding: '18px 20px', marginBottom: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <p style={kpiLabel}>Total Direct Costs</p>
          <p style={{ fontSize: '24px', fontWeight: 900, color: 'var(--red)', margin: '4px 0 0' }}>{fmt(total)}</p>
        </div>
        <p style={{ fontSize: '12px', color: 'var(--ink3)' }}>{expenses.length} line items across {Object.keys(grouped).length} categories</p>
      </div>

      {/* Category breakdown — BRD: Category, Item, Budgeted, Adjusted, Current, Difference */}
      {Object.entries(grouped).map(([catId, group]) => (
        <div key={catId} style={{ ...card, marginBottom: '10px', overflow: 'hidden' }}>
          <div style={{ padding: '12px 14px', background: 'var(--surface)', borderBottom: '1px solid var(--surface)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--ink)' }}>{group.name}</span>
            <span style={{ fontSize: '14px', fontWeight: 800, color: 'var(--red)' }}>{fmt(group.total)}</span>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              {group.items.map(exp => (
                <tr key={exp.id} style={{ borderBottom: '1px solid var(--surface)' }}>
                  <td style={{ padding: '9px 14px', fontSize: '13px', color: 'var(--ink)' }}>{exp.description}</td>
                  <td style={{ ...tdR, fontSize: '11px', color: 'var(--ink3)' }}>{exp.vendor_name || '-'}</td>
                  <td style={{ ...tdR, fontSize: '11px', color: 'var(--ink3)' }}>{exp.po_number ? `PO: ${exp.po_number}` : ''}{exp.invoice_number ? ` INV: ${exp.invoice_number}` : ''}</td>
                  <td style={tdR}><StatusBadge status={exp.payment_status} /></td>
                  <td style={{ ...tdR, fontSize: '12px', color: 'var(--ink3)' }}>{exp.expense_date || '-'}</td>
                  <td style={{ ...tdR, fontWeight: 700, color: 'var(--red)' }}>{fmt(Number(exp.converted_amount))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      {Object.keys(grouped).length === 0 && <Empty msg="No expenses logged yet." />}
    </div>
  )
}

// ═══════════════════════════════════════
// OVERHEADS TAB — BRD Section 10
// ═══════════════════════════════════════
function OverheadsTab({ summary, fmt }: { summary: SummaryData | null; fmt: (n: number) => string }) {
  if (!summary) return <Empty msg="No overhead data." />
  return (
    <div>
      <div style={{ ...card, padding: '18px 20px', marginBottom: '14px' }}>
        <p style={kpiLabel}>Total Overhead Allocation</p>
        <p style={{ fontSize: '24px', fontWeight: 900, color: 'var(--red)', margin: '4px 0 0' }}>{fmt(summary.overhead_costs)}</p>
        <div style={{ display: 'flex', gap: '20px', marginTop: '8px' }}>
          <span style={{ fontSize: '12px', color: 'var(--ink3)' }}>Finance: {fmt(summary.overhead_finance)}</span>
          <span style={{ fontSize: '12px', color: 'var(--ink3)' }}>HR: {fmt(summary.overhead_hr)}</span>
          <span style={{ fontSize: '12px', color: 'var(--ink3)' }}>Custom: {fmt(summary.overhead_costs - summary.overhead_finance - summary.overhead_hr)}</span>
        </div>
      </div>

      <div style={{ ...card, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr style={{ background: 'var(--surface)' }}>
            {['Component', 'Model', 'Rate', 'Pool', 'Allocated'].map(h => <TH key={h} left={h === 'Component'}>{h}</TH>)}
          </tr></thead>
          <tbody>
            <tr style={{ borderBottom: '1px solid var(--surface)', background: 'var(--surface)' }}>
              <td style={{ padding: '10px 14px', fontSize: '13px', fontWeight: 700, color: 'var(--ink)' }}>Finance Department</td>
              <td style={{ ...tdR, fontSize: '11px', color: 'var(--ink3)' }}>Proportional (hours)</td>
              <td style={tdR}>-</td><td style={tdR}>-</td>
              <td style={{ ...tdR, fontWeight: 700 }}>{fmt(summary.overhead_finance)}</td>
            </tr>
            <tr style={{ borderBottom: '1px solid var(--surface)', background: 'var(--surface)' }}>
              <td style={{ padding: '10px 14px', fontSize: '13px', fontWeight: 700, color: 'var(--ink)' }}>HR Department</td>
              <td style={{ ...tdR, fontSize: '11px', color: 'var(--ink3)' }}>Proportional (hours)</td>
              <td style={tdR}>-</td><td style={tdR}>-</td>
              <td style={{ ...tdR, fontWeight: 700 }}>{fmt(summary.overhead_hr)}</td>
            </tr>
            {summary.overhead_components.map((c, i) => (
              <tr key={i} style={{ borderBottom: '1px solid var(--surface)' }}>
                <td style={{ padding: '10px 14px', fontSize: '13px', fontWeight: 700, color: 'var(--ink)', textTransform: 'capitalize' as const }}>{c.component.replace(/_/g, ' ')}</td>
                <td style={{ ...tdR, fontSize: '11px', color: 'var(--ink3)', textTransform: 'capitalize' as const }}>{c.model.replace(/_/g, ' ')}</td>
                <td style={tdR}>{c.rate}%</td>
                <td style={{ ...tdR, color: 'var(--ink3)' }}>{fmt(c.monthly_pool)}</td>
                <td style={{ ...tdR, fontWeight: 700 }}>{fmt(c.allocated)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════
// P&L STATEMENT TAB — BRD Section 11
// ═══════════════════════════════════════
function PnLTab({ s, fmt, fc }: { s: SummaryData | null; fmt: (n: number) => string; fc: (n: number) => string }) {
  if (!s) return <Empty msg="No P&L data." />

  const pnlRows = [
    { label: 'Revenue', value: s.revenue_confirmed, color: 'var(--teal-mid)', indent: 0, bold: true },
    { label: 'Less: Direct Costs', value: -s.direct_costs, color: 'var(--red)', indent: 1, bold: false },
    { label: 'Less: Staff Costs', value: -s.staff_costs, color: 'var(--red)', indent: 1, bold: false },
    { label: 'Less: Overheads', value: -s.overhead_costs, color: 'var(--red)', indent: 1, bold: false },
    { label: 'Gross Profit', value: s.gross_profit, color: s.gross_profit >= 0 ? 'var(--success)' : 'var(--red)', indent: 0, bold: true, sep: true },
    { label: 'Less: Corporate Allocations', value: -s.corporate_allocation, color: 'var(--red)', indent: 1, bold: false },
    { label: 'Net Profit', value: s.net_profit, color: s.net_profit >= 0 ? 'var(--success)' : 'var(--red)', indent: 0, bold: true, sep: true },
  ]

  return (
    <div>
      {/* Headline cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '20px' }}>
        {[
          { l: 'Revenue', v: s.revenue_confirmed, c: 'var(--teal-mid)' },
          { l: 'Gross Profit', v: s.gross_profit, c: s.gross_profit >= 0 ? 'var(--success)' : 'var(--red)' },
          { l: 'Net Profit', v: s.net_profit, c: s.net_profit >= 0 ? 'var(--success)' : 'var(--red)' },
        ].map((k, i) => (
          <div key={i} style={{ ...card, padding: '20px', textAlign: 'center' as const }}>
            <p style={kpiLabel}>{k.l}</p>
            <p style={{ fontSize: '28px', fontWeight: 900, color: k.c, margin: '6px 0 0', fontFamily: 'Manrope, system-ui' }}>{fc(k.v)}</p>
          </div>
        ))}
      </div>

      {/* P&L statement — BRD Section 11 structure */}
      <div style={{ ...card, padding: '24px' }}>
        <h3 style={{ fontSize: '14px', fontWeight: 800, color: 'var(--ink)', margin: '0 0 16px' }}>Profit & Loss Statement</h3>
        {pnlRows.map((row, i) => (
          <div key={i} style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: row.bold ? '14px 0' : '8px 0', paddingLeft: row.indent ? '24px' : '0',
            borderTop: row.sep ? '2px solid var(--border)' : i > 0 ? '1px solid var(--surface)' : 'none',
          }}>
            <span style={{ fontSize: row.bold ? '14px' : '13px', fontWeight: row.bold ? 800 : 500, color: 'var(--ink)' }}>{row.label}</span>
            <span style={{ fontSize: row.bold ? '16px' : '14px', fontWeight: 800, color: row.color, fontFamily: 'Manrope, system-ui' }}>{fmt(Math.abs(row.value))}</span>
          </div>
        ))}

        {/* Metrics footer */}
        <div style={{ display: 'flex', gap: '24px', marginTop: '20px', paddingTop: '16px', borderTop: '2px solid var(--border)' }}>
          {[
            { l: 'Gross Margin', v: `${s.metrics.gross_margin}%` },
            { l: 'Net Margin', v: `${s.metrics.net_margin}%` },
            { l: 'ROI', v: `${s.metrics.roi}%` },
            { l: 'Cost Burn', v: `${s.cost_burn}%` },
          ].map((m, i) => (
            <div key={i}>
              <p style={{ fontSize: '10px', fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' as const, letterSpacing: '1px', margin: '0 0 2px' }}>{m.l}</p>
              <p style={{ fontSize: '16px', fontWeight: 800, color: 'var(--ink)', margin: 0 }}>{m.v}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════
// SCENARIOS TAB — BRD Section 12
// ═══════════════════════════════════════
function ScenariosTab({ scenarios, eventId, fmt, fc }: { scenarios: Scenario[]; eventId: string; fmt: (n: number) => string; fc: (n: number) => string }) {
  const [creating, setCreating] = useState(false)

  async function create(type: 'best' | 'expected' | 'worst') {
    setCreating(true)
    const adj: Record<string, { pct: number }[]> = { best: [{ pct: 20 }], expected: [{ pct: 0 }], worst: [{ pct: -25 }] }
    await fetch('/api/events/commercial/scenarios', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_id: eventId, name: `${type.charAt(0).toUpperCase() + type.slice(1)} Case`, scenario_type: type, revenue_adjustments: adj[type], cost_adjustments: type === 'worst' ? [{ pct: 15 }] : [{ pct: 0 }] }),
    })
    setCreating(false); window.location.reload()
  }

  if (scenarios.length === 0) return (
    <div style={{ ...card, padding: '40px', textAlign: 'center' as const }}>
      <p style={{ fontSize: '14px', color: 'var(--ink3)', marginBottom: '16px' }}>No scenarios created. Generate default scenarios to see what-if analysis.</p>
      <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
        {(['best', 'expected', 'worst'] as const).map(t => (
          <button key={t} onClick={() => create(t)} disabled={creating} style={{
            padding: '10px 20px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
            background: t === 'best' ? 'var(--success-light)' : t === 'expected' ? 'var(--info-light)' : 'var(--red-light)',
            color: t === 'best' ? 'var(--success)' : t === 'expected' ? 'var(--info)' : 'var(--red)',
            fontSize: '13px', fontWeight: 700, textTransform: 'capitalize' as const, opacity: creating ? 0.5 : 1,
          }}>{t} Case</button>
        ))}
      </div>
    </div>
  )

  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(scenarios.length, 3)}, 1fr)`, gap: '14px' }}>
      {scenarios.map(sc => (
        <div key={sc.id} style={{ ...card, padding: '20px', borderTop: `3px solid ${sc.scenario_type === 'best' ? 'var(--success)' : sc.scenario_type === 'worst' ? 'var(--red)' : 'var(--info)'}` }}>
          <h4 style={{ fontSize: '15px', fontWeight: 800, color: 'var(--ink)', margin: '0 0 16px' }}>{sc.name}</h4>
          {sc.revenue_adjustments?.[0]?.pct !== undefined && (
            <p style={{ fontSize: '11px', color: 'var(--ink3)', margin: '0 0 12px' }}>Revenue {sc.revenue_adjustments[0].pct >= 0 ? '+' : ''}{sc.revenue_adjustments[0].pct}% adjustment</p>
          )}
          {[
            { l: 'Revenue', v: fc(sc.total_revenue || 0), c: 'var(--teal-mid)' },
            { l: 'Total Cost', v: fc(sc.total_cost || 0), c: 'var(--red)' },
            { l: 'Net Profit', v: fc(sc.net_profit || 0), c: (sc.net_profit || 0) >= 0 ? 'var(--success)' : 'var(--red)' },
            { l: 'Margin', v: `${sc.margin_pct || 0}%`, c: (sc.margin_pct || 0) >= 20 ? 'var(--success)' : '#F5B94D' },
          ].map((r, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderTop: i > 0 ? '1px solid var(--surface)' : 'none' }}>
              <span style={{ fontSize: '12px', color: 'var(--ink3)' }}>{r.l}</span>
              <span style={{ fontSize: '14px', fontWeight: 800, color: r.c }}>{r.v}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

// ═══════════════════════════════════════
// APPROVALS TAB — BRD Section 16
// ═══════════════════════════════════════
function ApprovalsTab({ approvals, eventId }: { approvals: Approval[]; eventId: string }) {
  const stepColors: Record<string, { bg: string; fg: string }> = {
    pending: { bg: 'var(--amber-light)', fg: 'var(--amber)' },
    approved: { bg: 'var(--success-light)', fg: 'var(--success)' },
    rejected: { bg: 'var(--red-light)', fg: 'var(--red)' },
    skipped: { bg: 'rgba(255,255,255,0.06)', fg: 'var(--ink3)' },
  }

  if (approvals.length === 0) return (
    <div style={{ ...card, padding: '40px', textAlign: 'center' as const }}>
      <p style={{ fontSize: '14px', color: 'var(--ink3)' }}>No approval requests yet. Budget approvals and cost change requests will appear here.</p>
      <p style={{ fontSize: '12px', color: 'var(--ink3)', marginTop: '8px' }}>Approval chain: BU Head, Commercial Director, Finance, CEO</p>
    </div>
  )

  return (
    <div>
      {approvals.map(a => (
        <div key={a.id} style={{ ...card, padding: '18px 20px', marginBottom: '10px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <div>
              <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--ink)', textTransform: 'capitalize' as const }}>{a.approval_type.replace(/_/g, ' ')}</span>
              <span style={{ fontSize: '11px', color: 'var(--ink3)', marginLeft: '8px' }}>by {a.requested_by_staff?.name || 'Unknown'}</span>
            </div>
            <StatusBadge status={a.overall_status} />
          </div>
          {/* Step chain */}
          <div style={{ display: 'flex', gap: '8px' }}>
            {[1, 2, 3, 4].map(step => {
              const role = a[`step_${step}_role` as keyof Approval] as string
              const status = a[`step_${step}_status` as keyof Approval] as string
              if (!role) return null
              const sc = stepColors[status] || stepColors.pending
              return (
                <div key={step} style={{ flex: 1, background: sc.bg, borderRadius: '8px', padding: '10px 12px', textAlign: 'center' as const }}>
                  <p style={{ fontSize: '9px', fontWeight: 800, letterSpacing: '1px', textTransform: 'uppercase' as const, color: 'var(--ink3)', margin: '0 0 4px' }}>Step {step}</p>
                  <p style={{ fontSize: '12px', fontWeight: 700, color: sc.fg, margin: '0 0 2px', textTransform: 'capitalize' as const }}>{role.replace(/_/g, ' ')}</p>
                  <p style={{ fontSize: '10px', fontWeight: 700, color: sc.fg, margin: 0, textTransform: 'capitalize' as const }}>{status}</p>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

// ═══════════════════════════════════════
// SHARED COMPONENTS + STYLES
// ═══════════════════════════════════════
function TH({ children, left }: { children: React.ReactNode; left?: boolean }) {
  return <th style={{ ...th, textAlign: left ? 'left' as const : 'right' as const }}>{children}</th>
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, { bg: string; fg: string }> = {
    confirmed: { bg: 'var(--success-light)', fg: 'var(--success)' }, approved: { bg: 'var(--success-light)', fg: 'var(--success)' }, paid: { bg: 'var(--success-light)', fg: 'var(--success)' },
    pending: { bg: 'var(--amber-light)', fg: 'var(--amber)' }, in_progress: { bg: 'var(--amber-light)', fg: 'var(--amber)' }, unpaid: { bg: 'var(--amber-light)', fg: 'var(--amber)' },
    cancelled: { bg: 'var(--red-light)', fg: 'var(--red)' }, rejected: { bg: 'var(--red-light)', fg: 'var(--red)' }, overdue: { bg: 'var(--red-light)', fg: 'var(--red)' },
    partially_paid: { bg: 'var(--info-light)', fg: 'var(--info)' },
  }
  const c = colors[status] || colors.pending
  return <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: '5px', background: c.bg, color: c.fg, textTransform: 'capitalize' as const }}>{status.replace(/_/g, ' ')}</span>
}

function Empty({ msg }: { msg: string }) {
  return <div style={{ ...card, padding: '40px', textAlign: 'center' as const, color: 'var(--ink3)', fontSize: '14px' }}>{msg}</div>
}

const card: React.CSSProperties = { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }
const th: React.CSSProperties = { padding: '10px 14px', fontSize: '10px', fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--ink3)', borderBottom: '1px solid var(--surface)' }
const tdR: React.CSSProperties = { padding: '10px 14px', fontSize: '13px', fontWeight: 600, color: 'var(--ink)', textAlign: 'right' }
const emptyTd: React.CSSProperties = { padding: '30px', textAlign: 'center', color: 'var(--ink3)', fontSize: '13px' }
const kpiLabel: React.CSSProperties = { fontSize: '10px', fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--ink3)', margin: 0 }
const labelSt: React.CSSProperties = { display: 'block', fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1.5px', color: 'var(--ink3)', marginBottom: '4px' }
const inputSt: React.CSSProperties = { width: '100%', padding: '8px 10px', borderRadius: '7px', border: '1px solid var(--border)', fontSize: '13px', color: 'var(--ink)', fontFamily: 'Manrope, system-ui, sans-serif' }
// Solid-fill lime button — text uses --lime-dark (rule 3: text on a solid saturated
// family background must use that family's -light/-dark token, never --ink).
const btnLime: React.CSSProperties = { padding: '8px 20px', borderRadius: '8px', border: 'none', cursor: 'pointer', background: 'var(--lime)', color: 'var(--lime-dark)', fontSize: '12px', fontWeight: 700, fontFamily: 'inherit' }
const infoBox: React.CSSProperties = { background: 'var(--info-light)', border: '1px solid color-mix(in srgb, var(--info) 35%, transparent)', borderRadius: '8px', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '8px' }
const warnBox: React.CSSProperties = { background: 'var(--amber-light)', border: '1px solid var(--amber-border)', borderRadius: '8px', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '8px' }
