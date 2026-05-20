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
  end_date: string | null
  venue: string | null
  city: string | null
  client_name: string | null
  description: string | null
  expected_attendance: number | null
}

type StaffMember = { id: string; name: string; department: string }

type ExpenseCategory = { id: string; name: string; sort_order: number }

type Deal = {
  id: string; deal_type: string; company_name: string; contact_name: string | null
  description: string | null; amount: number; deal_currency: string
  exchange_rate: number; converted_amount: number; status: string
  deal_date: string | null; notes: string | null; created_at: string
  logged_by: { id: string; name: string } | null
}

type Expense = {
  id: string; description: string; amount: number; expense_currency: string
  exchange_rate: number; converted_amount: number; expense_date: string | null
  receipt_ref: string | null; notes: string | null; created_at: string
  logged_by: { id: string; name: string } | null
  category: { id: string; name: string } | null
}

type Delegate = {
  id: string; full_name: string; company: string | null; job_title: string | null
  industry: string | null; seniority_tier: string; status: string
  invite_date: string | null; notes: string | null; created_at: string
  invited_by: { id: string; name: string } | null
}

type PnlSummary = {
  currency: string; exchange_rate: number; approved_budget: number
  revenue: { confirmed: number; pending: number; by_type: Record<string, number> }
  expenses: { total: number }
  finance_overhead: { allocated: number; total_hours: number; months: Array<{ month: string; hours: number; pct: number; cost: number }>; note: string | null }
  hr_overhead: { allocated: number; total_hours: number; months: Array<{ month: string; hours: number; pct: number; cost: number }>; note: string | null }
  total_cost: number
  net_pnl: number; budget_variance: number
  planner: {
    total_planned: number; unallocated: number
    categories: Array<{
      category_id: string; category_name: string; sort_order: number
      planned: number; actual: number; remaining: number; status: string
    }>
  }
  delegates: { invited: number; confirmed: number; declined: number; attended: number; by_tier: Record<string, number> }
}

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

type EventStaffMember = {
  id: string; role: string | null; assigned_at: string | null
  staff_members: { id: string; name: string; email: string; department: string | null; role: string | null } | null
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

  // Event editing
  const [editing,        setEditing]        = useState(false)
  const [editForm,       setEditForm]       = useState({ name: '', type: '', status: '', event_date: '', end_date: '', venue: '', city: '', client_name: '', description: '', expected_attendance: '' })
  const [savingEdit,     setSavingEdit]     = useState(false)

  // Team tab
  const [eventStaff,     setEventStaff]     = useState<EventStaffMember[]>([])
  const [teamSearch,     setTeamSearch]     = useState('')
  const [addingStaff,    setAddingStaff]    = useState(false)
  const [staffRole,      setStaffRole]      = useState('')

  // P&L state
  const [pnlTab,         setPnlTab]         = useState<'overview'|'planner'|'deals'|'expenses'|'delegates'|'finance'|'team'|'hr'>('overview')
  const [pnl,            setPnl]            = useState<PnlSummary | null>(null)
  const [deals,          setDeals]          = useState<Deal[]>([])
  const [expenses,       setExpenses]       = useState<Expense[]>([])
  const [delegates,      setDelegates]      = useState<Delegate[]>([])
  const [categories,     setCategories]     = useState<ExpenseCategory[]>([])
  const [budget,         setBudget]         = useState<{ budget: { currency: string; approved_budget: number; exchange_rate_to_usd: number; notes?: string | null } | null; allocations: Array<{ category_id: string; planned_amount: number; category: ExpenseCategory }> } | null>(null)
  const [pnlLoading,     setPnlLoading]     = useState(false)
  const [pnlMsg,         setPnlMsg]         = useState('')

  // Budget form
  const [budgetForm,     setBudgetForm]     = useState({ currency: 'USD', approved_budget: '', exchange_rate_to_usd: '84', notes: '' })
  const [allocations,    setAllocations]    = useState<Record<string, string>>({})
  const [savingBudget,   setSavingBudget]   = useState(false)

  // Deal form
  const [dealForm,       setDealForm]       = useState({ deal_type: 'sponsorship', company_name: '', contact_name: '', description: '', amount: '', deal_currency: 'USD', exchange_rate: '1', status: 'pending', deal_date: '', notes: '' })
  const [savingDeal,     setSavingDeal]     = useState(false)
  const [showDealForm,   setShowDealForm]   = useState(false)

  // Expense form
  const [expForm,        setExpForm]        = useState({ category_id: '', description: '', amount: '', expense_currency: 'USD', exchange_rate: '1', expense_date: '', receipt_ref: '', notes: '' })
  const [savingExp,      setSavingExp]      = useState(false)
  const [showExpForm,    setShowExpForm]    = useState(false)

  // Finance work log state
  const [finLogs,        setFinLogs]        = useState<Array<{ id: string; hours: number; description: string; log_date: string; event: { id: string; name: string } | null; staff: { id: string; name: string } | null }>>([])
  const [finForm,        setFinForm]        = useState({ hours: '', description: '', log_date: new Date().toISOString().slice(0, 10) })
  const [savingFin,      setSavingFin]      = useState(false)
  const [showFinForm,    setShowFinForm]    = useState(false)

  // Delegate form
  const [delForm,        setDelForm]        = useState({ full_name: '', company: '', job_title: '', industry: '', seniority_tier: 'other', status: 'pending', invite_date: '', notes: '' })
  const [savingDel,      setSavingDel]      = useState(false)
  const [showDelForm,    setShowDelForm]    = useState(false)

  useEffect(() => {
    fetchAll()
    fetchPnlData()
    fetchFinanceLogs()
    fetchEventStaff()
  }, [eventId])

  async function fetchEventStaff() {
    const res  = await fetch(`/api/events/staff?event_id=${eventId}`)
    const data = await res.json().catch(() => [])
    setEventStaff(Array.isArray(data) ? data : [])
  }

  async function saveEventEdit() {
    setSavingEdit(true)
    const body: Record<string, string | number | null> = {
      name:        editForm.name,
      type:        editForm.type,
      status:      editForm.status,
      event_date:  editForm.event_date || null,
      end_date:    editForm.end_date || null,
      venue:       editForm.venue || null,
      city:        editForm.city || null,
      client_name: editForm.client_name || null,
      description: editForm.description || null,
      expected_attendance: editForm.expected_attendance ? Number(editForm.expected_attendance) : null,
    }
    const res  = await fetch(`/api/events?id=${eventId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    if (res.ok) { setEditing(false); fetchAll() }
    setSavingEdit(false)
  }

  async function assignStaff(staffId: string) {
    setAddingStaff(true)
    await fetch('/api/events/staff', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_id: eventId, staff_id: staffId, role: staffRole || null }),
    })
    setTeamSearch(''); setStaffRole(''); setAddingStaff(false)
    fetchEventStaff()
  }

  async function removeStaff(staffId: string) {
    await fetch(`/api/events/staff?event_id=${eventId}&staff_id=${staffId}`, { method: 'DELETE' })
    fetchEventStaff()
  }

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

    const ev = Array.isArray(evData) ? evData[0] : evData
    setEvent(ev)
    if (ev) {
      setEditForm({
        name:                ev.name ?? '',
        type:                ev.type ?? '',
        status:              ev.status ?? '',
        event_date:          ev.event_date?.slice(0, 10) ?? '',
        end_date:            ev.end_date?.slice(0, 10) ?? '',
        venue:               ev.venue ?? '',
        city:                ev.city ?? '',
        client_name:         ev.client_name ?? '',
        description:         ev.description ?? '',
        expected_attendance: ev.expected_attendance ? String(ev.expected_attendance) : '',
      })
    }
    setChecklist(Array.isArray(clData) ? clData : [])
    setStaffList(Array.isArray(stData) ? stData : [])
    const rp = rpData?.id ? rpData : null
    setReport(rp)
    if (rp) fetchComments(rp.id)
    setLoading(false)
  }

  async function fetchPnlData() {
    setPnlLoading(true)
    const [pnlRes, dealsRes, expRes, delRes, catRes, budRes] = await Promise.all([
      fetch(`/api/events/pnl?event_id=${eventId}`),
      fetch(`/api/events/deals?event_id=${eventId}`),
      fetch(`/api/events/expenses?event_id=${eventId}`),
      fetch(`/api/events/delegates?event_id=${eventId}`),
      fetch('/api/expense-categories'),
      fetch(`/api/events/budget?event_id=${eventId}`),
    ])
    const [pnlData, dealsData, expData, delData, catData, budData] = await Promise.all([
      pnlRes.json().catch(() => null),
      dealsRes.json().catch(() => []),
      expRes.json().catch(() => []),
      delRes.json().catch(() => []),
      catRes.json().catch(() => []),
      budRes.json().catch(() => null),
    ])
    if (pnlData && !pnlData.error) setPnl(pnlData)
    setDeals(Array.isArray(dealsData) ? dealsData : [])
    setExpenses(Array.isArray(expData) ? expData : [])
    setDelegates(Array.isArray(delData) ? delData : [])
    setCategories(Array.isArray(catData) ? catData.filter((c: ExpenseCategory & { is_active: boolean }) => c.is_active) : [])
    if (budData && !budData.error) {
      setBudget(budData)
      if (budData.budget) {
        setBudgetForm(f => ({ ...f, currency: budData.budget.currency, approved_budget: String(budData.budget.approved_budget), exchange_rate_to_usd: String(budData.budget.exchange_rate_to_usd), notes: budData.budget.notes ?? '' }))
        const allocMap: Record<string, string> = {}
        for (const a of budData.allocations ?? []) allocMap[a.category_id] = String(a.planned_amount)
        setAllocations(allocMap)
      }
    }
    setPnlLoading(false)
  }

  const fmt = (n: number, currency?: string) => {
    const cur = currency ?? budget?.budget?.currency ?? 'USD'
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: cur, maximumFractionDigits: 0 }).format(n)
  }

  async function saveBudget() {
    setSavingBudget(true); setPnlMsg('')
    const allocationRows = categories.map(c => ({ category_id: c.id, planned_amount: Number(allocations[c.id] ?? 0) }))
    const res = await fetch('/api/events/budget', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_id: eventId, ...budgetForm, approved_budget: Number(budgetForm.approved_budget), exchange_rate_to_usd: Number(budgetForm.exchange_rate_to_usd), allocations: allocationRows }),
    })
    const data = await res.json()
    if (res.ok) { setPnlMsg('Budget saved.'); fetchPnlData() } else { setPnlMsg(data.error ?? 'Failed to save budget.') }
    setSavingBudget(false)
  }

  async function saveDeal() {
    setSavingDeal(true); setPnlMsg('')
    const res = await fetch('/api/events/deals', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_id: eventId, ...dealForm, amount: Number(dealForm.amount), exchange_rate: Number(dealForm.exchange_rate) }),
    })
    const data = await res.json()
    if (res.ok) { setShowDealForm(false); setDealForm({ deal_type: 'sponsorship', company_name: '', contact_name: '', description: '', amount: '', deal_currency: 'USD', exchange_rate: '1', status: 'pending', deal_date: '', notes: '' }); fetchPnlData() }
    else { setPnlMsg(data.error ?? 'Failed to save deal.') }
    setSavingDeal(false)
  }

  async function updateDealStatus(id: string, status: string) {
    await fetch('/api/events/deals', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, status }) })
    fetchPnlData()
  }

  async function deleteDeal(id: string) {
    await fetch(`/api/events/deals?id=${id}`, { method: 'DELETE' })
    fetchPnlData()
  }

  async function saveExpense() {
    setSavingExp(true); setPnlMsg('')
    const res = await fetch('/api/events/expenses', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_id: eventId, ...expForm, amount: Number(expForm.amount), exchange_rate: Number(expForm.exchange_rate), category_id: expForm.category_id || null }),
    })
    const data = await res.json()
    if (res.ok) { setShowExpForm(false); setExpForm({ category_id: '', description: '', amount: '', expense_currency: 'USD', exchange_rate: '1', expense_date: '', receipt_ref: '', notes: '' }); fetchPnlData() }
    else { setPnlMsg(data.error ?? 'Failed to save expense.') }
    setSavingExp(false)
  }

  async function deleteExpense(id: string) {
    await fetch(`/api/events/expenses?id=${id}`, { method: 'DELETE' })
    fetchPnlData()
  }

  async function fetchFinanceLogs() {
    const res  = await fetch(`/api/finance/work-logs?event_id=${eventId}`)
    const data = await res.json().catch(() => [])
    setFinLogs(Array.isArray(data) ? data : [])
  }

  async function saveFinLog() {
    setSavingFin(true); setPnlMsg('')
    const res = await fetch('/api/finance/work-logs', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_id: eventId, hours: Number(finForm.hours), description: finForm.description, log_date: finForm.log_date }),
    })
    const data = await res.json()
    if (res.ok) {
      setShowFinForm(false)
      setFinForm({ hours: '', description: '', log_date: new Date().toISOString().slice(0, 10) })
      fetchFinanceLogs(); fetchPnlData()
    } else { setPnlMsg(data.error ?? 'Failed to log hours.') }
    setSavingFin(false)
  }

  async function deleteFinLog(id: string) {
    await fetch(`/api/finance/work-logs?id=${id}`, { method: 'DELETE' })
    fetchFinanceLogs(); fetchPnlData()
  }

  async function saveDelegate() {
    setSavingDel(true); setPnlMsg('')
    const res = await fetch('/api/events/delegates', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_id: eventId, ...delForm }),
    })
    const data = await res.json()
    if (res.ok) { setShowDelForm(false); setDelForm({ full_name: '', company: '', job_title: '', industry: '', seniority_tier: 'other', status: 'pending', invite_date: '', notes: '' }); fetchPnlData() }
    else { setPnlMsg(data.error ?? 'Failed to save delegate.') }
    setSavingDel(false)
  }

  async function updateDelegateStatus(id: string, status: string) {
    await fetch('/api/events/delegates', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, status }) })
    fetchPnlData()
  }

  async function deleteDelegate(id: string) {
    await fetch(`/api/events/delegates?id=${id}`, { method: 'DELETE' })
    fetchPnlData()
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
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                <div style={{ fontSize: '13px', fontWeight: 800, letterSpacing: '2px', textTransform: 'uppercase', color: '#00695C' }}>Event Workspace</div>
                <div style={{ fontSize: '13px', fontWeight: 700, padding: '2px 10px', borderRadius: '16px', background: event.status === 'active' ? 'rgba(192,244,60,0.15)' : '#FFFFFF', color: event.status === 'active' ? '#00695C' : '#2D3E50' }}>
                  {event.status}
                </div>
                <button onClick={() => setEditing(e => !e)}
                  style={{ marginLeft: '4px', padding: '3px 10px', borderRadius: '8px', border: '1px solid #DDE8EE', background: editing ? '#0F1923' : '#FFFFFF', color: editing ? '#C0F43C' : '#5B7080', fontSize: '11px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                  {editing ? 'Cancel' : 'Edit'}
                </button>
              </div>

              {!editing ? (
                <>
                  <h1 style={{ fontSize: '36px', fontWeight: 900, color: '#0F1923', margin: '0 0 6px', letterSpacing: '-0.5px' }}>{event.name}</h1>
                  <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
                    {event.city && <span style={{ fontSize: '13px', color: '#2D3E50' }}>{event.city}</span>}
                    {event.event_date && <span style={{ fontSize: '13px', color: '#2D3E50' }}>{new Date(event.event_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</span>}
                    {event.venue && <span style={{ fontSize: '13px', color: '#2D3E50' }}>{event.venue}</span>}
                    {event.client_name && <span style={{ fontSize: '13px', color: '#2D3E50' }}>{event.client_name}</span>}
                    {event.expected_attendance && <span style={{ fontSize: '13px', color: '#2D3E50' }}>{event.expected_attendance.toLocaleString()} expected</span>}
                  </div>
                </>
              ) : (
                <div style={{ background: '#F8FAFF', border: '1px solid #DDE8EE', borderRadius: '14px', padding: '20px', marginTop: '4px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div style={{ gridColumn: '1/-1' }}>
                      <label style={{ fontSize: '11px', fontWeight: 700, color: '#5B7080', display: 'block', marginBottom: '4px' }}>EVENT NAME</label>
                      <input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                        style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #DDE8EE', fontSize: '15px', fontWeight: 700, fontFamily: 'inherit', color: '#0F1923', boxSizing: 'border-box' }} />
                    </div>
                    {([
                      ['STATUS', 'status', null, ['planning','upcoming','active','completed','cancelled']],
                      ['TYPE',   'type',   null, ['conference','summit','forum','awards','workshop','flagship','managed','bespoke','corporate','other']],
                      ['START DATE', 'event_date', 'date', null],
                      ['END DATE',   'end_date',   'date', null],
                      ['VENUE',  'venue',  null, null],
                      ['CITY',   'city',   null, null],
                      ['CLIENT', 'client_name', null, null],
                      ['EXPECTED ATTENDANCE', 'expected_attendance', 'number', null],
                    ] as [string, string, string | null, string[] | null][]).map(([label, key, type, opts]) => (
                      <div key={key}>
                        <label style={{ fontSize: '11px', fontWeight: 700, color: '#5B7080', display: 'block', marginBottom: '4px' }}>{label}</label>
                        {opts ? (
                          <select value={editForm[key as keyof typeof editForm]} onChange={e => setEditForm(f => ({ ...f, [key]: e.target.value }))}
                            style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #DDE8EE', fontSize: '13px', fontFamily: 'inherit', color: '#0F1923' }}>
                            {opts.map(o => <option key={o} value={o}>{o}</option>)}
                          </select>
                        ) : (
                          <input type={type ?? 'text'} value={editForm[key as keyof typeof editForm]} onChange={e => setEditForm(f => ({ ...f, [key]: e.target.value }))}
                            style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #DDE8EE', fontSize: '13px', fontFamily: 'inherit', color: '#0F1923', boxSizing: 'border-box' }} />
                        )}
                      </div>
                    ))}
                    <div style={{ gridColumn: '1/-1' }}>
                      <label style={{ fontSize: '11px', fontWeight: 700, color: '#5B7080', display: 'block', marginBottom: '4px' }}>DESCRIPTION</label>
                      <textarea value={editForm.description} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} rows={3}
                        style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #DDE8EE', fontSize: '13px', fontFamily: 'inherit', color: '#0F1923', resize: 'vertical', boxSizing: 'border-box' }} />
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', marginTop: '14px' }}>
                    <button onClick={saveEventEdit} disabled={savingEdit || !editForm.name}
                      style={{ padding: '10px 22px', borderRadius: '8px', border: 'none', background: '#C0F43C', color: '#0F1923', fontSize: '13px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', opacity: savingEdit ? 0.6 : 1 }}>
                      {savingEdit ? 'Saving…' : 'Save Changes'}
                    </button>
                    <button onClick={() => setEditing(false)}
                      style={{ padding: '10px 16px', borderRadius: '8px', border: '1px solid #DDE8EE', background: 'transparent', color: '#5B7080', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit' }}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Generate checklist button */}
            {!editing && (
              <button
                onClick={generateChecklist}
                disabled={generating}
                style={{ padding: '14px 26px', borderRadius: '12px', border: 'none', background: generating ? '#E4EEF2' : '#C0F43C', color: '#0F1923', fontSize: '13px', fontWeight: 800, cursor: generating ? 'not-allowed' : 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '8px', whiteSpace: 'nowrap', flexShrink: 0 }}>
                <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                {generating ? 'AI generating checklist…' : checklist.length > 0 ? 'Regenerate Checklist' : 'Generate Checklist with AI'}
              </button>
            )}
          </div>

          {msg && (
            <div style={{ marginTop: '16px', padding: '10px 16px', borderRadius: '10px', background: msg.includes('generated') || msg.includes('Generated') ? 'rgba(192,244,60,0.08)' : 'rgba(255,107,107,0.08)', border: `1px solid ${msg.includes('generated') || msg.includes('Generated') ? 'rgba(192,244,60,0.25)' : 'rgba(255,107,107,0.25)'}`, color: msg.includes('generated') || msg.includes('Generated') ? '#00695C' : '#FF6B6B', fontSize: '13px' }}>
              {msg}
            </div>
          )}
        </div>

        {/* Execution Flow shortcut */}
        <div style={{ marginBottom: '16px', background: 'rgba(124,58,237,0.05)', border: '1px solid rgba(124,58,237,0.25)', borderRadius: '16px', padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ width: '44px', height: '44px', background: 'rgba(124,58,237,0.12)', border: '1px solid rgba(124,58,237,0.3)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '20px' }}>
              🎯
            </div>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 800, color: '#0F1923', marginBottom: '3px' }}>Execution Flow & RACI</div>
              <div style={{ fontSize: '13px', color: '#2D3E50' }}>5-phase RACI governance — responsibilities, approvals, milestone tracking, red flags, COO overrides</div>
            </div>
          </div>
          <Link
            href={`/admin/events/${eventId}/execution`}
            style={{ padding: '10px 20px', borderRadius: '10px', background: '#7C3AED', border: 'none', color: '#fff', fontSize: '13px', fontWeight: 800, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '8px', whiteSpace: 'nowrap' }}
          >
            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            Open Execution Flow
          </Link>
        </div>

        {/* Planning Board shortcut */}
        <div style={{ marginBottom: '16px', background: 'rgba(192,244,60,0.05)', border: '1px solid rgba(192,244,60,0.25)', borderRadius: '16px', padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ width: '44px', height: '44px', background: 'rgba(192,244,60,0.12)', border: '1px solid rgba(192,244,60,0.3)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '20px' }}>
              📋
            </div>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 800, color: '#0F1923', marginBottom: '3px' }}>AI Planning Board</div>
              <div style={{ fontSize: '13px', color: '#2D3E50' }}>Kanban + dependency tracking + AI risk analysis across all departments</div>
            </div>
          </div>
          <Link
            href={`/admin/events/${eventId}/plan`}
            style={{ padding: '10px 20px', borderRadius: '10px', background: '#C0F43C', border: 'none', color: '#0F1923', fontSize: '13px', fontWeight: 800, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '8px', whiteSpace: 'nowrap' }}
          >
            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            Open Planning Board
          </Link>
        </div>

        {/* Content Campaigns shortcut */}
        <div style={{ marginBottom: '16px', background: 'rgba(167,139,250,0.05)', border: '1px solid rgba(167,139,250,0.18)', borderRadius: '16px', padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
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

        {/* Event Website shortcut */}
        <div style={{ marginBottom: '16px', background: 'rgba(0,105,92,0.04)', border: '1px solid rgba(0,105,92,0.18)', borderRadius: '16px', padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ width: '44px', height: '44px', background: 'rgba(0,105,92,0.1)', border: '1px solid rgba(0,105,92,0.2)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '20px' }}>
              🌐
            </div>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 800, color: '#0F1923', marginBottom: '3px' }}>Event Website</div>
              <div style={{ fontSize: '13px', color: '#2D3E50' }}>Build and publish a public-facing marketing website for this event</div>
            </div>
          </div>
          <Link
            href={`/admin/events/${eventId}/website`}
            style={{ padding: '10px 20px', borderRadius: '10px', background: 'rgba(0,105,92,0.12)', border: '1px solid rgba(0,105,92,0.25)', color: '#00695C', fontSize: '13px', fontWeight: 700, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '8px', whiteSpace: 'nowrap' }}
          >
            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            Build Website
          </Link>
        </div>

        {/* ── P&L Section ───────────────────────────────────────────────── */}
        <div style={{ marginBottom: '40px', background: '#FFFFFF', border: '1px solid #D8EAEB', borderRadius: '20px', overflow: 'hidden' }}>

          {/* Section header */}
          <div style={{ padding: '22px 28px', borderBottom: '1px solid #D8EAEB', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '2px', textTransform: 'uppercase', color: '#34D399', marginBottom: '4px' }}>Finance</div>
              <h2 style={{ fontSize: '22px', fontWeight: 900, color: '#0F1923', margin: 0 }}>Event P&amp;L</h2>
            </div>
            {pnl && (
              <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '11px', color: '#5B7080', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px' }}>Net P&amp;L</div>
                  <div style={{ fontSize: '22px', fontWeight: 900, color: pnl.net_pnl >= 0 ? '#3D6B00' : '#DC2626' }}>{fmt(pnl.net_pnl)}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '11px', color: '#5B7080', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px' }}>Revenue</div>
                  <div style={{ fontSize: '22px', fontWeight: 900, color: '#00695C' }}>{fmt(pnl.revenue.confirmed)}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '11px', color: '#5B7080', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px' }}>Expenses</div>
                  <div style={{ fontSize: '22px', fontWeight: 900, color: '#0F1923' }}>{fmt(pnl.expenses.total)}</div>
                </div>
              </div>
            )}
          </div>

          {/* Sub-tab nav */}
          <div style={{ display: 'flex', borderBottom: '1px solid #D8EAEB', overflowX: 'auto' }}>
            {(['overview','planner','deals','expenses','delegates','finance','hr','team'] as const).map(tab => (
              <button key={tab} onClick={() => setPnlTab(tab)}
                style={{ padding: '14px 22px', border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '13px', fontWeight: pnlTab === tab ? 800 : 600, color: pnlTab === tab ? '#0F1923' : '#5B7080', borderBottom: pnlTab === tab ? '2px solid #C0F43C' : '2px solid transparent', whiteSpace: 'nowrap', textTransform: 'capitalize' }}>
                {tab === 'overview'   ? 'Overview'
                 : tab === 'planner' ? 'Budget Planner'
                 : tab === 'deals'   ? `Deals (${deals.length})`
                 : tab === 'expenses' ? `Expenses (${expenses.length})`
                 : tab === 'finance' ? `Finance Hrs (${finLogs.length})`
                 : tab === 'hr'      ? `HR Overhead`
                 : tab === 'team'    ? `Team (${eventStaff.length})`
                 : `Delegates (${delegates.length})`}
              </button>
            ))}
          </div>

          <div style={{ padding: '24px 28px' }}>
            {pnlMsg && <div style={{ marginBottom: '16px', padding: '10px 14px', borderRadius: '8px', background: pnlMsg.includes('ailed') ? 'rgba(255,107,107,0.08)' : 'rgba(192,244,60,0.08)', border: `1px solid ${pnlMsg.includes('ailed') ? 'rgba(255,107,107,0.2)' : 'rgba(192,244,60,0.2)'}`, color: pnlMsg.includes('ailed') ? '#DC2626' : '#3D6B00', fontSize: '13px' }}>{pnlMsg}</div>}

            {/* OVERVIEW */}
            {pnlTab === 'overview' && (
              <div>
                {pnlLoading ? <div style={{ textAlign: 'center', padding: '40px', color: '#5B7080', fontSize: '13px' }}>Loading P&amp;L…</div> : !pnl ? (
                  <div style={{ textAlign: 'center', padding: '48px', color: '#5B7080', fontSize: '13px' }}>
                    No budget set yet. Go to <strong>Budget Planner</strong> to set an approved budget.
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                    {/* Revenue */}
                    <div style={{ background: '#F8FFFE', border: '1px solid #D8EAEB', borderRadius: '14px', padding: '20px' }}>
                      <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#00695C', marginBottom: '14px' }}>Revenue</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: '13px', color: '#2D3E50' }}>Confirmed</span>
                          <span style={{ fontSize: '13px', fontWeight: 800, color: '#00695C' }}>{fmt(pnl.revenue.confirmed)}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: '13px', color: '#2D3E50' }}>Pending</span>
                          <span style={{ fontSize: '13px', fontWeight: 600, color: '#D97706' }}>{fmt(pnl.revenue.pending)}</span>
                        </div>
                        {Object.entries(pnl.revenue.by_type).map(([type, amt]) => (
                          <div key={type} style={{ display: 'flex', justifyContent: 'space-between', paddingLeft: '12px', borderLeft: '2px solid rgba(0,165,163,0.2)' }}>
                            <span style={{ fontSize: '13px', color: '#5B7080', textTransform: 'capitalize' }}>{type.replace(/_/g, ' ')}</span>
                            <span style={{ fontSize: '13px', color: '#2D3E50' }}>{fmt(amt)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    {/* Expenses + Finance overhead */}
                    <div style={{ background: '#FFF9F9', border: '1px solid #D8EAEB', borderRadius: '14px', padding: '20px' }}>
                      <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#DC2626', marginBottom: '14px' }}>Costs</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: '13px', color: '#2D3E50' }}>Direct expenses</span>
                          <span style={{ fontSize: '13px', fontWeight: 700, color: '#0F1923' }}>{fmt(pnl.expenses.total)}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: '13px', color: '#2D3E50' }}>Finance overhead
                            {pnl.finance_overhead.total_hours > 0 && <span style={{ marginLeft: '6px', fontSize: '11px', color: '#5B7080' }}>{pnl.finance_overhead.total_hours}h</span>}
                          </span>
                          <span style={{ fontSize: '13px', fontWeight: 700, color: pnl.finance_overhead.allocated > 0 ? '#0F1923' : '#5B7080' }}>
                            {pnl.finance_overhead.allocated > 0 ? fmt(pnl.finance_overhead.allocated) : '—'}
                          </span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: '13px', color: '#2D3E50' }}>HR overhead
                            {pnl.hr_overhead.total_hours > 0 && <span style={{ marginLeft: '6px', fontSize: '11px', color: '#5B7080' }}>{pnl.hr_overhead.total_hours}h</span>}
                          </span>
                          <span style={{ fontSize: '13px', fontWeight: 700, color: pnl.hr_overhead.allocated > 0 ? '#0F1923' : '#5B7080' }}>
                            {pnl.hr_overhead.allocated > 0 ? fmt(pnl.hr_overhead.allocated) : '—'}
                          </span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '8px', borderTop: '1px solid #EEF2F7' }}>
                          <span style={{ fontSize: '13px', fontWeight: 800, color: '#0F1923' }}>Total cost</span>
                          <span style={{ fontSize: '13px', fontWeight: 900, color: '#0F1923' }}>{fmt(pnl.total_cost)}</span>
                        </div>
                      </div>
                    </div>
                    {/* Net P&L */}
                    <div style={{ background: pnl.net_pnl >= 0 ? 'rgba(192,244,60,0.06)' : 'rgba(255,107,107,0.06)', border: `1px solid ${pnl.net_pnl >= 0 ? 'rgba(192,244,60,0.25)' : 'rgba(255,107,107,0.25)'}`, borderRadius: '14px', padding: '20px' }}>
                      <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase', color: pnl.net_pnl >= 0 ? '#3D6B00' : '#DC2626', marginBottom: '6px' }}>Net P&amp;L (confirmed)</div>
                      <div style={{ fontSize: '36px', fontWeight: 900, color: pnl.net_pnl >= 0 ? '#3D6B00' : '#DC2626' }}>{fmt(pnl.net_pnl)}</div>
                    </div>
                    {/* Budget vs Actuals */}
                    <div style={{ background: '#F8FAFF', border: '1px solid #D8EAEB', borderRadius: '14px', padding: '20px' }}>
                      <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#5B7080', marginBottom: '8px' }}>Budget vs Actuals</div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                        <span style={{ fontSize: '13px', color: '#2D3E50' }}>Approved budget</span>
                        <span style={{ fontSize: '13px', fontWeight: 700, color: '#0F1923' }}>{fmt(pnl.approved_budget)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                        <span style={{ fontSize: '13px', color: '#2D3E50' }}>Spent</span>
                        <span style={{ fontSize: '13px', fontWeight: 700, color: '#0F1923' }}>{fmt(pnl.expenses.total)}</span>
                      </div>
                      <div style={{ height: '6px', background: '#EEF2F7', borderRadius: '3px', overflow: 'hidden', marginBottom: '6px' }}>
                        <div style={{ height: '100%', width: `${Math.min(100, pnl.approved_budget > 0 ? (pnl.total_cost / pnl.approved_budget) * 100 : 0)}%`, background: pnl.budget_variance < 0 ? '#DC2626' : '#C0F43C', borderRadius: '3px' }} />
                      </div>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: pnl.budget_variance >= 0 ? '#3D6B00' : '#DC2626' }}>
                        {pnl.budget_variance >= 0 ? `${fmt(pnl.budget_variance)} remaining` : `${fmt(Math.abs(pnl.budget_variance))} over budget`}
                      </div>
                    </div>
                    {/* Delegates snapshot */}
                    <div style={{ gridColumn: '1 / -1', background: '#F8FAFF', border: '1px solid #D8EAEB', borderRadius: '14px', padding: '20px' }}>
                      <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#5B7080', marginBottom: '14px' }}>Delegates</div>
                      <div style={{ display: 'flex', gap: '32px', flexWrap: 'wrap' }}>
                        {[
                          { label: 'Invited',   val: pnl.delegates.invited   },
                          { label: 'Confirmed', val: pnl.delegates.confirmed, color: '#3D6B00' },
                          { label: 'Attended',  val: pnl.delegates.attended,  color: '#00695C' },
                          { label: 'Declined',  val: pnl.delegates.declined,  color: '#DC2626' },
                        ].map(s => (
                          <div key={s.label}>
                            <div style={{ fontSize: '28px', fontWeight: 900, color: s.color ?? '#0F1923' }}>{s.val}</div>
                            <div style={{ fontSize: '11px', color: '#5B7080', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px' }}>{s.label}</div>
                          </div>
                        ))}
                        <div style={{ marginLeft: 'auto', display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
                          {Object.entries(pnl.delegates.by_tier).map(([tier, count]) => (
                            <div key={tier} style={{ textAlign: 'center' }}>
                              <div style={{ fontSize: '20px', fontWeight: 800, color: '#0F1923' }}>{count}</div>
                              <div style={{ fontSize: '11px', color: '#5B7080', textTransform: 'capitalize' }}>{tier.replace(/_/g, ' ')}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* BUDGET PLANNER */}
            {pnlTab === 'planner' && (
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: '28px', alignItems: 'flex-start' }}>
                  {/* Budget setup form */}
                  <div style={{ background: '#F8FAFF', border: '1px solid #D8EAEB', borderRadius: '14px', padding: '20px' }}>
                    <div style={{ fontSize: '13px', fontWeight: 800, color: '#0F1923', marginBottom: '16px' }}>Approved Budget</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <div>
                        <label style={{ fontSize: '11px', fontWeight: 700, color: '#5B7080', display: 'block', marginBottom: '4px' }}>CURRENCY</label>
                        <select value={budgetForm.currency} onChange={e => setBudgetForm(f => ({ ...f, currency: e.target.value }))}
                          style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #D8EAEB', background: '#FFFFFF', color: '#0F1923', fontSize: '13px', fontFamily: 'inherit' }}>
                          <option value="USD">USD — US Dollar</option>
                          <option value="INR">INR — Indian Rupee</option>
                        </select>
                      </div>
                      <div>
                        <label style={{ fontSize: '11px', fontWeight: 700, color: '#5B7080', display: 'block', marginBottom: '4px' }}>TOTAL BUDGET</label>
                        <input type="number" placeholder="0" value={budgetForm.approved_budget} onChange={e => setBudgetForm(f => ({ ...f, approved_budget: e.target.value }))}
                          style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #D8EAEB', background: '#FFFFFF', color: '#0F1923', fontSize: '13px', fontFamily: 'inherit' }} />
                      </div>
                      {budgetForm.currency === 'INR' && (
                        <div>
                          <label style={{ fontSize: '11px', fontWeight: 700, color: '#5B7080', display: 'block', marginBottom: '4px' }}>INR → USD RATE</label>
                          <input type="number" placeholder="84" value={budgetForm.exchange_rate_to_usd} onChange={e => setBudgetForm(f => ({ ...f, exchange_rate_to_usd: e.target.value }))}
                            style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #D8EAEB', background: '#FFFFFF', color: '#0F1923', fontSize: '13px', fontFamily: 'inherit' }} />
                        </div>
                      )}
                      <div>
                        <label style={{ fontSize: '11px', fontWeight: 700, color: '#5B7080', display: 'block', marginBottom: '4px' }}>NOTES</label>
                        <textarea rows={2} placeholder="Optional notes…" value={budgetForm.notes} onChange={e => setBudgetForm(f => ({ ...f, notes: e.target.value }))}
                          style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #D8EAEB', background: '#FFFFFF', color: '#0F1923', fontSize: '13px', fontFamily: 'inherit', resize: 'vertical' }} />
                      </div>
                      <div style={{ paddingTop: '8px', borderTop: '1px solid #D8EAEB' }}>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: '#0F1923', marginBottom: '10px' }}>Allocate by Category</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          {categories.map(cat => (
                            <div key={cat.id} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{ fontSize: '13px', color: '#2D3E50', flex: 1, minWidth: 0 }}>{cat.name}</span>
                              <input type="number" placeholder="0" value={allocations[cat.id] ?? ''} onChange={e => setAllocations(a => ({ ...a, [cat.id]: e.target.value }))}
                                style={{ width: '90px', padding: '6px 10px', borderRadius: '6px', border: '1px solid #D8EAEB', background: '#FFFFFF', color: '#0F1923', fontSize: '13px', fontFamily: 'inherit', textAlign: 'right' }} />
                            </div>
                          ))}
                          <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '6px', borderTop: '1px solid #EEF2F7' }}>
                            <span style={{ fontSize: '13px', color: '#5B7080' }}>Total allocated</span>
                            <span style={{ fontSize: '13px', fontWeight: 800, color: '#0F1923' }}>
                              {(budgetForm.currency === 'INR' ? '₹' : '$')}{Object.values(allocations).reduce((s, v) => s + (Number(v) || 0), 0).toLocaleString()}
                            </span>
                          </div>
                        </div>
                      </div>
                      <button onClick={saveBudget} disabled={savingBudget || !budgetForm.approved_budget}
                        style={{ padding: '12px', borderRadius: '10px', border: 'none', background: budgetForm.approved_budget ? '#C0F43C' : '#EEF2F7', color: '#0F1923', fontSize: '13px', fontWeight: 800, cursor: budgetForm.approved_budget ? 'pointer' : 'not-allowed', fontFamily: 'inherit', marginTop: '4px' }}>
                        {savingBudget ? 'Saving…' : 'Save Budget'}
                      </button>
                    </div>
                  </div>

                  {/* Planner table */}
                  <div>
                    {!pnl || pnl.planner.categories.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '60px', color: '#5B7080', fontSize: '13px', background: '#F8FAFF', borderRadius: '14px', border: '1px solid #D8EAEB' }}>
                        Set allocations on the left to see the dynamic planner.
                      </div>
                    ) : (
                      <div style={{ background: '#FFFFFF', border: '1px solid #D8EAEB', borderRadius: '14px', overflow: 'hidden' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px 110px 110px 90px', gap: '0', padding: '12px 18px', background: '#F8FAFF', borderBottom: '1px solid #D8EAEB' }}>
                          {['Category','Planned','Actual','Remaining',''].map(h => (
                            <div key={h} style={{ fontSize: '11px', fontWeight: 800, color: '#5B7080', textTransform: 'uppercase', letterSpacing: '1px', textAlign: h === 'Category' ? 'left' : 'right' }}>{h}</div>
                          ))}
                        </div>
                        {pnl.planner.categories.map(cat => {
                          const statusColor = cat.status === 'over_budget' ? '#DC2626' : cat.status === 'near_limit' ? '#D97706' : cat.status === 'unplanned' ? '#DC2626' : cat.status === 'not_started' ? '#5B7080' : '#3D6B00'
                          const barPct = cat.planned > 0 ? Math.min(100, (cat.actual / cat.planned) * 100) : cat.actual > 0 ? 100 : 0
                          return (
                            <div key={cat.category_id} style={{ display: 'grid', gridTemplateColumns: '1fr 110px 110px 110px 90px', padding: '14px 18px', borderBottom: '1px solid #EEF2F7', alignItems: 'center' }}>
                              <div>
                                <div style={{ fontSize: '13px', fontWeight: 600, color: '#0F1923', marginBottom: '4px' }}>{cat.category_name}</div>
                                <div style={{ height: '4px', background: '#EEF2F7', borderRadius: '2px', overflow: 'hidden', maxWidth: '160px' }}>
                                  <div style={{ height: '100%', width: `${barPct}%`, background: cat.status === 'over_budget' ? '#DC2626' : cat.status === 'near_limit' ? '#D97706' : '#C0F43C', borderRadius: '2px', transition: 'width 0.4s ease' }} />
                                </div>
                              </div>
                              <div style={{ textAlign: 'right', fontSize: '13px', color: '#2D3E50' }}>{fmt(cat.planned)}</div>
                              <div style={{ textAlign: 'right', fontSize: '13px', fontWeight: 700, color: '#0F1923' }}>{fmt(cat.actual)}</div>
                              <div style={{ textAlign: 'right', fontSize: '13px', fontWeight: 800, color: statusColor }}>{fmt(Math.abs(cat.remaining))}{cat.remaining < 0 ? ' over' : ''}</div>
                              <div style={{ textAlign: 'right' }}>
                                <span style={{ fontSize: '11px', fontWeight: 700, padding: '3px 8px', borderRadius: '10px', background: `${statusColor}18`, color: statusColor, textTransform: 'capitalize', whiteSpace: 'nowrap' }}>
                                  {cat.status.replace(/_/g, ' ')}
                                </span>
                              </div>
                            </div>
                          )
                        })}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px 110px 110px 90px', padding: '14px 18px', background: '#F8FAFF', borderTop: '1px solid #D8EAEB' }}>
                          <div style={{ fontSize: '13px', fontWeight: 800, color: '#0F1923' }}>Total</div>
                          <div style={{ textAlign: 'right', fontSize: '13px', fontWeight: 800, color: '#0F1923' }}>{fmt(pnl.planner.total_planned)}</div>
                          <div style={{ textAlign: 'right', fontSize: '13px', fontWeight: 800, color: '#0F1923' }}>{fmt(pnl.expenses.total)}</div>
                          <div style={{ textAlign: 'right', fontSize: '13px', fontWeight: 800, color: pnl.budget_variance >= 0 ? '#3D6B00' : '#DC2626' }}>{fmt(Math.abs(pnl.budget_variance))}{pnl.budget_variance < 0 ? ' over' : ' left'}</div>
                          <div />
                        </div>
                        {pnl.planner.unallocated !== 0 && (
                          <div style={{ padding: '10px 18px', background: 'rgba(245,158,11,0.04)', borderTop: '1px solid rgba(245,158,11,0.15)', fontSize: '13px', color: '#D97706', fontWeight: 600 }}>
                            {fmt(Math.abs(pnl.planner.unallocated))} {pnl.planner.unallocated > 0 ? 'unallocated from total budget' : 'allocated beyond total budget'}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* DEALS */}
            {pnlTab === 'deals' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
                  <button onClick={() => setShowDealForm(v => !v)}
                    style={{ padding: '10px 20px', borderRadius: '10px', border: 'none', background: '#C0F43C', color: '#0F1923', fontSize: '13px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    Add Deal
                  </button>
                </div>

                {showDealForm && (
                  <div style={{ background: '#F8FAFF', border: '1px solid #D8EAEB', borderRadius: '14px', padding: '20px', marginBottom: '20px' }}>
                    <div style={{ fontSize: '13px', fontWeight: 800, color: '#0F1923', marginBottom: '14px' }}>New Deal</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                      <div>
                        <label style={{ fontSize: '11px', fontWeight: 700, color: '#5B7080', display: 'block', marginBottom: '4px' }}>TYPE</label>
                        <select value={dealForm.deal_type} onChange={e => setDealForm(f => ({ ...f, deal_type: e.target.value }))}
                          style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #D8EAEB', background: '#FFFFFF', color: '#0F1923', fontSize: '13px', fontFamily: 'inherit' }}>
                          {['sponsorship','exhibition','delegate_package','media_partner','other'].map(t => <option key={t} value={t}>{t.replace(/_/g,' ')}</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={{ fontSize: '11px', fontWeight: 700, color: '#5B7080', display: 'block', marginBottom: '4px' }}>STATUS</label>
                        <select value={dealForm.status} onChange={e => setDealForm(f => ({ ...f, status: e.target.value }))}
                          style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #D8EAEB', background: '#FFFFFF', color: '#0F1923', fontSize: '13px', fontFamily: 'inherit' }}>
                          {['pending','confirmed','cancelled'].map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </div>
                      <div style={{ gridColumn: '1 / -1' }}>
                        <label style={{ fontSize: '11px', fontWeight: 700, color: '#5B7080', display: 'block', marginBottom: '4px' }}>COMPANY *</label>
                        <input value={dealForm.company_name} onChange={e => setDealForm(f => ({ ...f, company_name: e.target.value }))} placeholder="Company name"
                          style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #D8EAEB', background: '#FFFFFF', color: '#0F1923', fontSize: '13px', fontFamily: 'inherit' }} />
                      </div>
                      <div>
                        <label style={{ fontSize: '11px', fontWeight: 700, color: '#5B7080', display: 'block', marginBottom: '4px' }}>CONTACT</label>
                        <input value={dealForm.contact_name} onChange={e => setDealForm(f => ({ ...f, contact_name: e.target.value }))} placeholder="Contact name"
                          style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #D8EAEB', background: '#FFFFFF', color: '#0F1923', fontSize: '13px', fontFamily: 'inherit' }} />
                      </div>
                      <div>
                        <label style={{ fontSize: '11px', fontWeight: 700, color: '#5B7080', display: 'block', marginBottom: '4px' }}>DATE</label>
                        <input type="date" value={dealForm.deal_date} onChange={e => setDealForm(f => ({ ...f, deal_date: e.target.value }))}
                          style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #D8EAEB', background: '#FFFFFF', color: '#0F1923', fontSize: '13px', fontFamily: 'inherit' }} />
                      </div>
                      <div>
                        <label style={{ fontSize: '11px', fontWeight: 700, color: '#5B7080', display: 'block', marginBottom: '4px' }}>AMOUNT *</label>
                        <input type="number" value={dealForm.amount} onChange={e => setDealForm(f => ({ ...f, amount: e.target.value }))} placeholder="0"
                          style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #D8EAEB', background: '#FFFFFF', color: '#0F1923', fontSize: '13px', fontFamily: 'inherit' }} />
                      </div>
                      <div>
                        <label style={{ fontSize: '11px', fontWeight: 700, color: '#5B7080', display: 'block', marginBottom: '4px' }}>CURRENCY</label>
                        <input value={dealForm.deal_currency} onChange={e => setDealForm(f => ({ ...f, deal_currency: e.target.value.toUpperCase() }))} placeholder="USD"
                          style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #D8EAEB', background: '#FFFFFF', color: '#0F1923', fontSize: '13px', fontFamily: 'inherit' }} />
                      </div>
                      <div>
                        <label style={{ fontSize: '11px', fontWeight: 700, color: '#5B7080', display: 'block', marginBottom: '4px' }}>EXCHANGE RATE → event currency</label>
                        <input type="number" step="0.0001" value={dealForm.exchange_rate} onChange={e => setDealForm(f => ({ ...f, exchange_rate: e.target.value }))} placeholder="1"
                          style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #D8EAEB', background: '#FFFFFF', color: '#0F1923', fontSize: '13px', fontFamily: 'inherit' }} />
                      </div>
                      <div style={{ gridColumn: '1 / -1' }}>
                        <label style={{ fontSize: '11px', fontWeight: 700, color: '#5B7080', display: 'block', marginBottom: '4px' }}>NOTES</label>
                        <input value={dealForm.notes} onChange={e => setDealForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional notes"
                          style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #D8EAEB', background: '#FFFFFF', color: '#0F1923', fontSize: '13px', fontFamily: 'inherit' }} />
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', marginTop: '14px' }}>
                      <button onClick={saveDeal} disabled={savingDeal || !dealForm.company_name || !dealForm.amount}
                        style={{ padding: '10px 22px', borderRadius: '8px', border: 'none', background: '#C0F43C', color: '#0F1923', fontSize: '13px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
                        {savingDeal ? 'Saving…' : 'Save Deal'}
                      </button>
                      <button onClick={() => setShowDealForm(false)} style={{ padding: '10px 16px', borderRadius: '8px', border: '1px solid #D8EAEB', background: 'transparent', color: '#0F1923', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
                    </div>
                  </div>
                )}

                {deals.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '48px', color: '#5B7080', fontSize: '13px', background: '#F8FAFF', borderRadius: '14px', border: '1px solid #D8EAEB' }}>No deals logged yet.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {deals.map(deal => (
                      <div key={deal.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto auto', gap: '12px', alignItems: 'center', padding: '14px 18px', background: '#FFFFFF', border: '1px solid #D8EAEB', borderRadius: '12px' }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
                            <span style={{ fontSize: '13px', fontWeight: 800, color: '#0F1923' }}>{deal.company_name}</span>
                            <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 7px', borderRadius: '8px', background: deal.status === 'confirmed' ? 'rgba(192,244,60,0.15)' : deal.status === 'cancelled' ? 'rgba(255,107,107,0.1)' : 'rgba(245,158,11,0.1)', color: deal.status === 'confirmed' ? '#3D6B00' : deal.status === 'cancelled' ? '#DC2626' : '#D97706' }}>
                              {deal.status}
                            </span>
                            <span style={{ fontSize: '11px', color: '#5B7080', textTransform: 'capitalize' }}>{deal.deal_type.replace(/_/g,' ')}</span>
                          </div>
                          {deal.contact_name && <div style={{ fontSize: '13px', color: '#5B7080' }}>{deal.contact_name}</div>}
                          {deal.notes && <div style={{ fontSize: '13px', color: '#5B7080', marginTop: '2px' }}>{deal.notes}</div>}
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: '15px', fontWeight: 900, color: '#0F1923' }}>{new Intl.NumberFormat('en-US', { style: 'currency', currency: deal.deal_currency, maximumFractionDigits: 0 }).format(deal.amount)}</div>
                          {deal.deal_currency !== (budget?.budget?.currency ?? 'USD') && (
                            <div style={{ fontSize: '11px', color: '#5B7080' }}>= {fmt(deal.converted_amount)}</div>
                          )}
                        </div>
                        <select value={deal.status} onChange={e => updateDealStatus(deal.id, e.target.value)}
                          style={{ padding: '6px 10px', borderRadius: '8px', border: '1px solid #D8EAEB', background: '#FFFFFF', color: '#0F1923', fontSize: '13px', fontFamily: 'inherit', cursor: 'pointer' }}>
                          {['pending','confirmed','cancelled'].map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                        <button onClick={() => deleteDeal(deal.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,107,107,0.5)', padding: '4px', display: 'flex', alignItems: 'center' }}>
                          <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                        </button>
                      </div>
                    ))}
                    <div style={{ padding: '12px 18px', background: '#F8FAFF', border: '1px solid #D8EAEB', borderRadius: '10px', display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '13px', fontWeight: 700, color: '#2D3E50' }}>Confirmed revenue</span>
                      <span style={{ fontSize: '13px', fontWeight: 900, color: '#3D6B00' }}>{fmt(deals.filter(d => d.status === 'confirmed').reduce((s, d) => s + d.converted_amount, 0))}</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* EXPENSES */}
            {pnlTab === 'expenses' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
                  <button onClick={() => setShowExpForm(v => !v)}
                    style={{ padding: '10px 20px', borderRadius: '10px', border: 'none', background: '#C0F43C', color: '#0F1923', fontSize: '13px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    Log Expense
                  </button>
                </div>

                {showExpForm && (
                  <div style={{ background: '#F8FAFF', border: '1px solid #D8EAEB', borderRadius: '14px', padding: '20px', marginBottom: '20px' }}>
                    <div style={{ fontSize: '13px', fontWeight: 800, color: '#0F1923', marginBottom: '14px' }}>New Expense</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                      <div style={{ gridColumn: '1 / -1' }}>
                        <label style={{ fontSize: '11px', fontWeight: 700, color: '#5B7080', display: 'block', marginBottom: '4px' }}>CATEGORY</label>
                        <select value={expForm.category_id} onChange={e => setExpForm(f => ({ ...f, category_id: e.target.value }))}
                          style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #D8EAEB', background: '#FFFFFF', color: '#0F1923', fontSize: '13px', fontFamily: 'inherit' }}>
                          <option value="">Select category…</option>
                          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      </div>
                      <div style={{ gridColumn: '1 / -1' }}>
                        <label style={{ fontSize: '11px', fontWeight: 700, color: '#5B7080', display: 'block', marginBottom: '4px' }}>DESCRIPTION *</label>
                        <input value={expForm.description} onChange={e => setExpForm(f => ({ ...f, description: e.target.value }))} placeholder="What is this expense for?"
                          style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #D8EAEB', background: '#FFFFFF', color: '#0F1923', fontSize: '13px', fontFamily: 'inherit' }} />
                      </div>
                      <div>
                        <label style={{ fontSize: '11px', fontWeight: 700, color: '#5B7080', display: 'block', marginBottom: '4px' }}>AMOUNT *</label>
                        <input type="number" value={expForm.amount} onChange={e => setExpForm(f => ({ ...f, amount: e.target.value }))} placeholder="0"
                          style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #D8EAEB', background: '#FFFFFF', color: '#0F1923', fontSize: '13px', fontFamily: 'inherit' }} />
                      </div>
                      <div>
                        <label style={{ fontSize: '11px', fontWeight: 700, color: '#5B7080', display: 'block', marginBottom: '4px' }}>CURRENCY</label>
                        <input value={expForm.expense_currency} onChange={e => setExpForm(f => ({ ...f, expense_currency: e.target.value.toUpperCase() }))} placeholder="USD"
                          style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #D8EAEB', background: '#FFFFFF', color: '#0F1923', fontSize: '13px', fontFamily: 'inherit' }} />
                      </div>
                      <div>
                        <label style={{ fontSize: '11px', fontWeight: 700, color: '#5B7080', display: 'block', marginBottom: '4px' }}>EXCHANGE RATE → event currency</label>
                        <input type="number" step="0.0001" value={expForm.exchange_rate} onChange={e => setExpForm(f => ({ ...f, exchange_rate: e.target.value }))} placeholder="1"
                          style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #D8EAEB', background: '#FFFFFF', color: '#0F1923', fontSize: '13px', fontFamily: 'inherit' }} />
                      </div>
                      <div>
                        <label style={{ fontSize: '11px', fontWeight: 700, color: '#5B7080', display: 'block', marginBottom: '4px' }}>DATE</label>
                        <input type="date" value={expForm.expense_date} onChange={e => setExpForm(f => ({ ...f, expense_date: e.target.value }))}
                          style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #D8EAEB', background: '#FFFFFF', color: '#0F1923', fontSize: '13px', fontFamily: 'inherit' }} />
                      </div>
                      <div>
                        <label style={{ fontSize: '11px', fontWeight: 700, color: '#5B7080', display: 'block', marginBottom: '4px' }}>RECEIPT REF</label>
                        <input value={expForm.receipt_ref} onChange={e => setExpForm(f => ({ ...f, receipt_ref: e.target.value }))} placeholder="Reference #"
                          style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #D8EAEB', background: '#FFFFFF', color: '#0F1923', fontSize: '13px', fontFamily: 'inherit' }} />
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', marginTop: '14px' }}>
                      <button onClick={saveExpense} disabled={savingExp || !expForm.description || !expForm.amount}
                        style={{ padding: '10px 22px', borderRadius: '8px', border: 'none', background: '#C0F43C', color: '#0F1923', fontSize: '13px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
                        {savingExp ? 'Saving…' : 'Log Expense'}
                      </button>
                      <button onClick={() => setShowExpForm(false)} style={{ padding: '10px 16px', borderRadius: '8px', border: '1px solid #D8EAEB', background: 'transparent', color: '#0F1923', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
                    </div>
                  </div>
                )}

                {expenses.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '48px', color: '#5B7080', fontSize: '13px', background: '#F8FAFF', borderRadius: '14px', border: '1px solid #D8EAEB' }}>No expenses logged yet.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {expenses.map(exp => (
                      <div key={exp.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '12px', alignItems: 'center', padding: '12px 18px', background: '#FFFFFF', border: '1px solid #D8EAEB', borderRadius: '10px' }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                            <span style={{ fontSize: '13px', fontWeight: 700, color: '#0F1923' }}>{exp.description}</span>
                            {exp.category && <span style={{ fontSize: '11px', color: '#5B7080', padding: '2px 7px', borderRadius: '6px', background: '#EEF2F7' }}>{exp.category.name}</span>}
                          </div>
                          <div style={{ fontSize: '12px', color: '#5B7080' }}>
                            {exp.expense_date && <span>{new Date(exp.expense_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>}
                            {exp.receipt_ref && <span style={{ marginLeft: '10px' }}>Ref: {exp.receipt_ref}</span>}
                            {exp.logged_by && <span style={{ marginLeft: '10px' }}>by {exp.logged_by.name}</span>}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: '14px', fontWeight: 900, color: '#0F1923' }}>{new Intl.NumberFormat('en-US', { style: 'currency', currency: exp.expense_currency, maximumFractionDigits: 0 }).format(exp.amount)}</div>
                          {exp.expense_currency !== (budget?.budget?.currency ?? 'USD') && (
                            <div style={{ fontSize: '11px', color: '#5B7080' }}>= {fmt(exp.converted_amount)}</div>
                          )}
                        </div>
                        <button onClick={() => deleteExpense(exp.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,107,107,0.5)', padding: '4px', display: 'flex', alignItems: 'center' }}>
                          <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                        </button>
                      </div>
                    ))}
                    <div style={{ padding: '12px 18px', background: '#F8FAFF', border: '1px solid #D8EAEB', borderRadius: '10px', display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '13px', fontWeight: 700, color: '#2D3E50' }}>Total expenses</span>
                      <span style={{ fontSize: '13px', fontWeight: 900, color: '#0F1923' }}>{fmt(expenses.reduce((s, e) => s + e.converted_amount, 0))}</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* DELEGATES */}
            {pnlTab === 'delegates' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
                  <button onClick={() => setShowDelForm(v => !v)}
                    style={{ padding: '10px 20px', borderRadius: '10px', border: 'none', background: '#C0F43C', color: '#0F1923', fontSize: '13px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    Add Delegate
                  </button>
                </div>

                {showDelForm && (
                  <div style={{ background: '#F8FAFF', border: '1px solid #D8EAEB', borderRadius: '14px', padding: '20px', marginBottom: '20px' }}>
                    <div style={{ fontSize: '13px', fontWeight: 800, color: '#0F1923', marginBottom: '14px' }}>New Delegate</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                      {[
                        { label: 'FULL NAME *', key: 'full_name', placeholder: 'Full name' },
                        { label: 'COMPANY', key: 'company', placeholder: 'Organisation' },
                        { label: 'JOB TITLE', key: 'job_title', placeholder: 'Title' },
                        { label: 'INDUSTRY', key: 'industry', placeholder: 'Industry' },
                      ].map(f => (
                        <div key={f.key}>
                          <label style={{ fontSize: '11px', fontWeight: 700, color: '#5B7080', display: 'block', marginBottom: '4px' }}>{f.label}</label>
                          <input value={(delForm as Record<string,string>)[f.key]} onChange={e => setDelForm(d => ({ ...d, [f.key]: e.target.value }))} placeholder={f.placeholder}
                            style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #D8EAEB', background: '#FFFFFF', color: '#0F1923', fontSize: '13px', fontFamily: 'inherit' }} />
                        </div>
                      ))}
                      <div>
                        <label style={{ fontSize: '11px', fontWeight: 700, color: '#5B7080', display: 'block', marginBottom: '4px' }}>SENIORITY</label>
                        <select value={delForm.seniority_tier} onChange={e => setDelForm(f => ({ ...f, seniority_tier: e.target.value }))}
                          style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #D8EAEB', background: '#FFFFFF', color: '#0F1923', fontSize: '13px', fontFamily: 'inherit' }}>
                          {[['c_suite','C-Suite'],['director','Director'],['senior_manager','Senior Manager'],['manager','Manager'],['other','Other']].map(([v,l]) => <option key={v} value={v}>{l}</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={{ fontSize: '11px', fontWeight: 700, color: '#5B7080', display: 'block', marginBottom: '4px' }}>STATUS</label>
                        <select value={delForm.status} onChange={e => setDelForm(f => ({ ...f, status: e.target.value }))}
                          style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #D8EAEB', background: '#FFFFFF', color: '#0F1923', fontSize: '13px', fontFamily: 'inherit' }}>
                          {['pending','confirmed','declined','attended'].map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={{ fontSize: '11px', fontWeight: 700, color: '#5B7080', display: 'block', marginBottom: '4px' }}>INVITE DATE</label>
                        <input type="date" value={delForm.invite_date} onChange={e => setDelForm(f => ({ ...f, invite_date: e.target.value }))}
                          style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #D8EAEB', background: '#FFFFFF', color: '#0F1923', fontSize: '13px', fontFamily: 'inherit' }} />
                      </div>
                      <div style={{ gridColumn: '1 / -1' }}>
                        <label style={{ fontSize: '11px', fontWeight: 700, color: '#5B7080', display: 'block', marginBottom: '4px' }}>NOTES</label>
                        <input value={delForm.notes} onChange={e => setDelForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional notes"
                          style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #D8EAEB', background: '#FFFFFF', color: '#0F1923', fontSize: '13px', fontFamily: 'inherit' }} />
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', marginTop: '14px' }}>
                      <button onClick={saveDelegate} disabled={savingDel || !delForm.full_name}
                        style={{ padding: '10px 22px', borderRadius: '8px', border: 'none', background: '#C0F43C', color: '#0F1923', fontSize: '13px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
                        {savingDel ? 'Saving…' : 'Add Delegate'}
                      </button>
                      <button onClick={() => setShowDelForm(false)} style={{ padding: '10px 16px', borderRadius: '8px', border: '1px solid #D8EAEB', background: 'transparent', color: '#0F1923', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
                    </div>
                  </div>
                )}

                {delegates.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '48px', color: '#5B7080', fontSize: '13px', background: '#F8FAFF', borderRadius: '14px', border: '1px solid #D8EAEB' }}>No delegates added yet.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {delegates.map(d => {
                      const tierLabel: Record<string,string> = { c_suite: 'C-Suite', director: 'Director', senior_manager: 'Sr. Manager', manager: 'Manager', other: 'Other' }
                      const statusColor: Record<string,string> = { pending: '#D97706', confirmed: '#3D6B00', declined: '#DC2626', attended: '#00695C' }
                      return (
                        <div key={d.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto auto', gap: '12px', alignItems: 'center', padding: '12px 18px', background: '#FFFFFF', border: '1px solid #D8EAEB', borderRadius: '10px' }}>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                              <span style={{ fontSize: '13px', fontWeight: 800, color: '#0F1923' }}>{d.full_name}</span>
                              <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 7px', borderRadius: '8px', background: `${statusColor[d.status] ?? '#5B7080'}18`, color: statusColor[d.status] ?? '#5B7080' }}>{d.status}</span>
                              <span style={{ fontSize: '11px', color: '#5B7080', padding: '2px 7px', borderRadius: '6px', background: '#EEF2F7' }}>{tierLabel[d.seniority_tier] ?? d.seniority_tier}</span>
                            </div>
                            <div style={{ fontSize: '12px', color: '#5B7080' }}>
                              {d.job_title && <span>{d.job_title}</span>}
                              {d.company && <span>{d.job_title ? ' · ' : ''}{d.company}</span>}
                              {d.industry && <span> · {d.industry}</span>}
                            </div>
                          </div>
                          <select value={d.status} onChange={e => updateDelegateStatus(d.id, e.target.value)}
                            style={{ padding: '6px 10px', borderRadius: '8px', border: '1px solid #D8EAEB', background: '#FFFFFF', color: '#0F1923', fontSize: '13px', fontFamily: 'inherit', cursor: 'pointer' }}>
                            {['pending','confirmed','declined','attended'].map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                          <button onClick={() => deleteDelegate(d.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,107,107,0.5)', padding: '4px', display: 'flex', alignItems: 'center' }}>
                            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
            {/* FINANCE HOURS */}
            {pnlTab === 'finance' && (
              <div>
                <div style={{ background: 'rgba(52,211,153,0.05)', border: '1px solid rgba(52,211,153,0.2)', borderRadius: '12px', padding: '14px 18px', marginBottom: '20px', fontSize: '13px', color: '#2D3E50', lineHeight: 1.65 }}>
                  Finance logs hours against this event. Their monthly cost pool is shared across all events proportionally — the more hours Finance spends on this event, the larger its share of Finance overhead in the P&L.
                  {pnl?.finance_overhead.allocated ? (
                    <strong style={{ display: 'block', marginTop: '6px', color: '#0F1923' }}>
                      Current allocation: {fmt(pnl.finance_overhead.allocated)} ({pnl.finance_overhead.total_hours}h logged)
                    </strong>
                  ) : (
                    <strong style={{ display: 'block', marginTop: '6px', color: '#5B7080' }}>No hours logged yet — Finance overhead shows as zero in this event&apos;s P&amp;L.</strong>
                  )}
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
                  <button onClick={() => setShowFinForm(v => !v)}
                    style={{ padding: '10px 20px', borderRadius: '10px', border: 'none', background: '#C0F43C', color: '#0F1923', fontSize: '13px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    Log Hours
                  </button>
                </div>

                {showFinForm && (
                  <div style={{ background: '#F8FAFF', border: '1px solid #D8EAEB', borderRadius: '14px', padding: '20px', marginBottom: '20px' }}>
                    <div style={{ fontSize: '13px', fontWeight: 800, color: '#0F1923', marginBottom: '14px' }}>Log Finance Hours</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                      <div>
                        <label style={{ fontSize: '11px', fontWeight: 700, color: '#5B7080', display: 'block', marginBottom: '4px' }}>HOURS *</label>
                        <input type="number" step="0.5" min="0.5" value={finForm.hours} onChange={e => setFinForm(f => ({ ...f, hours: e.target.value }))} placeholder="e.g. 2.5"
                          style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #D8EAEB', background: '#FFFFFF', color: '#0F1923', fontSize: '13px', fontFamily: 'inherit' }} />
                      </div>
                      <div>
                        <label style={{ fontSize: '11px', fontWeight: 700, color: '#5B7080', display: 'block', marginBottom: '4px' }}>DATE</label>
                        <input type="date" value={finForm.log_date} onChange={e => setFinForm(f => ({ ...f, log_date: e.target.value }))}
                          style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #D8EAEB', background: '#FFFFFF', color: '#0F1923', fontSize: '13px', fontFamily: 'inherit' }} />
                      </div>
                      <div style={{ gridColumn: '1 / -1' }}>
                        <label style={{ fontSize: '11px', fontWeight: 700, color: '#5B7080', display: 'block', marginBottom: '4px' }}>DESCRIPTION *</label>
                        <input value={finForm.description} onChange={e => setFinForm(f => ({ ...f, description: e.target.value }))} placeholder="What Finance work was done for this event?"
                          style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #D8EAEB', background: '#FFFFFF', color: '#0F1923', fontSize: '13px', fontFamily: 'inherit' }} />
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', marginTop: '14px' }}>
                      <button onClick={saveFinLog} disabled={savingFin || !finForm.hours || !finForm.description}
                        style={{ padding: '10px 22px', borderRadius: '8px', border: 'none', background: '#C0F43C', color: '#0F1923', fontSize: '13px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
                        {savingFin ? 'Saving…' : 'Log Hours'}
                      </button>
                      <button onClick={() => setShowFinForm(false)} style={{ padding: '10px 16px', borderRadius: '8px', border: '1px solid #D8EAEB', background: 'transparent', color: '#0F1923', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
                    </div>
                  </div>
                )}

                {/* Monthly breakdown */}
                {(pnl?.finance_overhead.months?.length ?? 0) > 0 && (
                  <div style={{ background: '#F8FAFF', border: '1px solid #D8EAEB', borderRadius: '12px', padding: '16px 18px', marginBottom: '16px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 800, color: '#5B7080', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '12px' }}>Allocation by Month</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {pnl?.finance_overhead.months.map(m => (
                        <div key={m.month} style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                          <span style={{ fontSize: '13px', color: '#2D3E50', width: '80px' }}>{m.month}</span>
                          <span style={{ fontSize: '13px', color: '#0F1923' }}>{m.hours}h</span>
                          <span style={{ fontSize: '13px', color: '#5B7080' }}>{m.pct}% of Finance pool</span>
                          <span style={{ fontSize: '13px', fontWeight: 800, color: '#0F1923', marginLeft: 'auto' }}>{fmt(m.cost)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {finLogs.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '48px', color: '#5B7080', fontSize: '13px', background: '#F8FAFF', borderRadius: '14px', border: '1px solid #D8EAEB' }}>No Finance hours logged for this event yet.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {finLogs.map(log => (
                      <div key={log.id} style={{ display: 'grid', gridTemplateColumns: '60px 1fr auto auto', gap: '12px', alignItems: 'center', padding: '12px 18px', background: '#FFFFFF', border: '1px solid #D8EAEB', borderRadius: '10px' }}>
                        <div style={{ fontSize: '15px', fontWeight: 900, color: '#34D399' }}>{log.hours}h</div>
                        <div>
                          <div style={{ fontSize: '13px', fontWeight: 600, color: '#0F1923' }}>{log.description}</div>
                          {log.staff && <div style={{ fontSize: '12px', color: '#5B7080' }}>{log.staff.name}</div>}
                        </div>
                        <div style={{ fontSize: '12px', color: '#5B7080', whiteSpace: 'nowrap' }}>
                          {new Date(log.log_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </div>
                        <button onClick={() => deleteFinLog(log.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,107,107,0.5)', padding: '4px', display: 'flex', alignItems: 'center' }}>
                          <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                        </button>
                      </div>
                    ))}
                    <div style={{ padding: '12px 18px', background: '#F8FAFF', border: '1px solid #D8EAEB', borderRadius: '10px', display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '13px', fontWeight: 700, color: '#2D3E50' }}>Total hours logged</span>
                      <span style={{ fontSize: '13px', fontWeight: 900, color: '#34D399' }}>{finLogs.reduce((s, l) => s + l.hours, 0)}h</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* HR OVERHEAD */}
            {pnlTab === 'hr' && (
              <div>
                <div style={{ background: 'rgba(244,114,182,0.05)', border: '1px solid rgba(244,114,182,0.2)', borderRadius: '12px', padding: '14px 18px', marginBottom: '20px', fontSize: '13px', color: '#2D3E50', lineHeight: 1.65 }}>
                  HR overhead is derived from timesheet hours logged in the HRMS against this event&apos;s project. The cost is proportionally allocated from the monthly HR cost pool.
                  {pnl?.hr_overhead?.allocated ? (
                    <strong style={{ display: 'block', marginTop: '6px', color: '#0F1923' }}>
                      Current allocation: {fmt(pnl.hr_overhead.allocated)} ({pnl.hr_overhead.total_hours}h logged across HRMS timesheets)
                    </strong>
                  ) : (
                    <strong style={{ display: 'block', marginTop: '6px', color: '#5B7080' }}>No HR hours linked yet — HR overhead shows as zero in this event&apos;s P&amp;L. Hours are pulled from HRMS timesheets on each nightly sync.</strong>
                  )}
                </div>

                {(pnl?.hr_overhead?.months?.length ?? 0) > 0 && (
                  <div style={{ background: '#F8FAFF', border: '1px solid #D8EAEB', borderRadius: '12px', padding: '16px 18px', marginBottom: '16px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 800, color: '#5B7080', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '12px' }}>Allocation by Month</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {pnl?.hr_overhead.months.map(m => (
                        <div key={m.month} style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                          <span style={{ fontSize: '13px', color: '#2D3E50', width: '80px' }}>{m.month}</span>
                          <span style={{ fontSize: '13px', color: '#0F1923' }}>{m.hours}h</span>
                          <span style={{ fontSize: '13px', color: '#5B7080' }}>{m.pct}% of HR pool</span>
                          <span style={{ fontSize: '13px', fontWeight: 800, color: '#0F1923', marginLeft: 'auto' }}>{fmt(m.cost)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Team timesheets from HRMS */}
                {eventStaff.length > 0 && (
                  <div style={{ background: '#F8FAFF', border: '1px solid #D8EAEB', borderRadius: '12px', padding: '16px 18px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 800, color: '#5B7080', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '12px' }}>Staff Deployed ({eventStaff.length})</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {eventStaff.map(es => (
                        <div key={es.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px', background: '#FFFFFF', border: '1px solid #DDE8EE', borderRadius: '10px' }}>
                          <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(244,114,182,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: 800, color: '#F472B6', flexShrink: 0 }}>
                            {es.staff_members?.name?.charAt(0).toUpperCase() ?? '?'}
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: '13px', fontWeight: 700, color: '#0F1923' }}>{es.staff_members?.name ?? '—'}</div>
                            <div style={{ fontSize: '12px', color: '#5B7080' }}>{es.staff_members?.department ?? ''}{es.role ? ` · ${es.role}` : ''}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TEAM */}
            {pnlTab === 'team' && (
              <div>
                {/* Search + assign */}
                <div style={{ background: '#F8FAFF', border: '1px solid #D8EAEB', borderRadius: '14px', padding: '18px', marginBottom: '20px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 800, color: '#0F1923', marginBottom: '12px' }}>Assign Staff to Event</div>
                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    <div style={{ flex: 2, minWidth: '200px' }}>
                      <label style={{ fontSize: '11px', fontWeight: 700, color: '#5B7080', display: 'block', marginBottom: '4px' }}>SEARCH STAFF</label>
                      <input value={teamSearch} onChange={e => setTeamSearch(e.target.value)} placeholder="Type name to filter…"
                        style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #D8EAEB', fontSize: '13px', fontFamily: 'inherit', color: '#0F1923', boxSizing: 'border-box' }} />
                    </div>
                    <div style={{ flex: 1, minWidth: '160px' }}>
                      <label style={{ fontSize: '11px', fontWeight: 700, color: '#5B7080', display: 'block', marginBottom: '4px' }}>ROLE (OPTIONAL)</label>
                      <input value={staffRole} onChange={e => setStaffRole(e.target.value)} placeholder="e.g. Operations Lead"
                        style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #D8EAEB', fontSize: '13px', fontFamily: 'inherit', color: '#0F1923', boxSizing: 'border-box' }} />
                    </div>
                  </div>

                  {/* Filtered staff list */}
                  {teamSearch.length > 1 && (
                    <div style={{ marginTop: '10px', maxHeight: '220px', overflowY: 'auto', border: '1px solid #D8EAEB', borderRadius: '10px', background: '#FFFFFF' }}>
                      {staffList
                        .filter(s => s.name.toLowerCase().includes(teamSearch.toLowerCase()) && !eventStaff.some(es => es.staff_members?.id === s.id))
                        .slice(0, 10)
                        .map(s => (
                          <div key={s.id} onClick={() => assignStaff(s.id)}
                            style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px', borderBottom: '1px solid #EEF4F4', cursor: 'pointer' }}
                            onMouseOver={e => (e.currentTarget.style.background = '#F8FAFF')}
                            onMouseOut={e  => (e.currentTarget.style.background = 'transparent')}>
                            <div style={{ width: '30px', height: '30px', borderRadius: '8px', background: 'rgba(0,137,123,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 800, color: '#00897B', flexShrink: 0 }}>
                              {s.name.charAt(0)}
                            </div>
                            <div>
                              <div style={{ fontSize: '13px', fontWeight: 700, color: '#0F1923' }}>{s.name}</div>
                              <div style={{ fontSize: '12px', color: '#5B7080' }}>{s.department}</div>
                            </div>
                            <div style={{ marginLeft: 'auto', fontSize: '12px', color: '#00897B', fontWeight: 700 }}>+ Assign</div>
                          </div>
                        ))}
                      {staffList.filter(s => s.name.toLowerCase().includes(teamSearch.toLowerCase()) && !eventStaff.some(es => es.staff_members?.id === s.id)).length === 0 && (
                        <div style={{ padding: '16px', textAlign: 'center', color: '#5B7080', fontSize: '13px' }}>No unassigned staff match &quot;{teamSearch}&quot;</div>
                      )}
                    </div>
                  )}
                </div>

                {/* Current team */}
                {eventStaff.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '48px', color: '#5B7080', fontSize: '13px', background: '#F8FAFF', borderRadius: '14px', border: '1px solid #D8EAEB' }}>
                    No staff assigned to this event yet. Search above to add team members.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 800, color: '#5B7080', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '4px' }}>Event Team ({eventStaff.length})</div>
                    {eventStaff.map(es => (
                      <div key={es.id} style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '14px 16px', background: '#FFFFFF', border: '1px solid #D8EAEB', borderRadius: '12px' }}>
                        <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: 'rgba(0,137,123,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '15px', fontWeight: 800, color: '#00897B', flexShrink: 0 }}>
                          {es.staff_members?.name?.charAt(0).toUpperCase() ?? '?'}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '14px', fontWeight: 700, color: '#0F1923' }}>{es.staff_members?.name ?? '—'}</div>
                          <div style={{ fontSize: '12px', color: '#5B7080' }}>
                            {es.staff_members?.department ?? ''}
                            {es.staff_members?.role ? ` · ${es.staff_members.role}` : ''}
                          </div>
                        </div>
                        {es.role && (
                          <span style={{ fontSize: '12px', fontWeight: 700, padding: '3px 10px', borderRadius: '8px', background: 'rgba(0,137,123,0.08)', color: '#00897B' }}>{es.role}</span>
                        )}
                        <button onClick={() => removeStaff(es.staff_members!.id)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,107,107,0.5)', padding: '6px', display: 'flex', alignItems: 'center', flexShrink: 0 }}
                          title="Remove from event">
                          <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

          </div>
        </div>
        {/* ── End P&L Section ────────────────────────────────────────────── */}

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
