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

// Department accent colors — kept as literal hex (not var()) because dColor is
// used at runtime to build an rgba() tint string (see the department-header
// background below) and as a solid button fill; CSS custom properties can't be
// decomposed into rgb components that way. Values below are the dark-theme
// equivalents of each family token (var(--teal-mid), var(--purple),
// var(--amber), var(--success), var(--info)); HR has no family token so it
// keeps the already-brightened literal pink used elsewhere in the app.
const DEPT_COLORS: Record<string, string> = {
  Operations: '#12C9BD', // var(--teal-mid)
  Marketing:  '#A78BFA', // var(--purple)
  Sales:      '#F5B94D', // var(--amber)
  Finance:    '#34D399', // var(--success)
  Content:    '#5AA9F2', // var(--info)
  HR:         '#F472B6', // brightened pink, no family token
}

const STATUS_CONFIG = {
  // Bespoke gray tint tuned for the dark card — no family maps to "not started".
  not_started: { label: 'Not Started', color: 'var(--ink2)',    bg: 'rgba(255,255,255,0.06)' },
  in_progress: { label: 'In Progress', color: 'var(--amber)',   bg: 'var(--amber-light)' },
  done:        { label: 'Done',        color: 'var(--lime)',    bg: 'var(--lime-light)' },
  overdue:     { label: 'Overdue',     color: 'var(--red)',     bg: 'var(--red-light)' },
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
  const [pnlTab,         setPnlTab]         = useState<'overview'|'planner'|'deals'|'expenses'|'delegates'|'finance'|'team'|'hr'|'social'|'content'>('overview')
  // Social accounts tab
  type SocialAccount = { id: string; platform: string; page_name: string; page_url: string; page_id: string; access_token: string; updated_at: string }
  const [socialAccounts,   setSocialAccounts]   = useState<SocialAccount[]>([])
  const [socialLoading,    setSocialLoading]    = useState(false)
  const [socialForm,       setSocialForm]       = useState({ platform: 'Facebook', page_name: '', page_url: '', page_id: '', access_token: '' })
  const [socialSaving,     setSocialSaving]     = useState(false)
  const [socialMsg,        setSocialMsg]        = useState('')
  // Content campaigns tab
  type ContentCampaign = { id: string; name: string; phase: string; status: string; platforms: string[]; created_at: string; content_posts: { count: number }[] | null }
  const [contentCampaigns, setContentCampaigns] = useState<ContentCampaign[]>([])
  const [contentLoading,   setContentLoading]   = useState(false)
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
  const [dealForm,       setDealForm]       = useState({ deal_type: 'sponsorship', company_name: '', contact_name: '', description: '', amount: '', deal_currency: 'USD', exchange_rate: '1', status: 'pending', deal_date: '', notes: '', inventory_item_id: '' })
  const [inventoryItems, setInventoryItems] = useState<Array<{ id: string; name: string; category: string; quantity: number; sold: number; reserved: number }>>([])
  const [inventoryLoaded, setInventoryLoaded] = useState(false)
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
      body: JSON.stringify({ event_id: eventId, ...dealForm, amount: Number(dealForm.amount), exchange_rate: Number(dealForm.exchange_rate), inventory_item_id: dealForm.inventory_item_id || null }),
    })
    const data = await res.json()
    if (res.ok) { setShowDealForm(false); setDealForm({ deal_type: 'sponsorship', company_name: '', contact_name: '', description: '', amount: '', deal_currency: 'USD', exchange_rate: '1', status: 'pending', deal_date: '', notes: '', inventory_item_id: '' }); fetchPnlData() }
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
      setMsg('Report concluded. It is now live in the knowledge base — Pilot can answer questions from it.')
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
    <div style={{ fontFamily: 'var(--font-manrope), Manrope, sans-serif', background: 'var(--surface)', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: 'var(--ink)', fontSize: '13px' }}>Loading event workspace…</div>
    </div>
  )

  if (!event) return (
    <div style={{ fontFamily: 'var(--font-manrope), Manrope, sans-serif', background: 'var(--surface)', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: 'var(--red)', fontSize: '13px' }}>Event not found.</div>
    </div>
  )

  return (
    <div style={{ fontFamily: 'var(--font-manrope), Manrope, sans-serif', background: 'var(--surface)', minHeight: '100vh', color: 'var(--ink)' }}>

      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '40px 32px' }}>

        {/* Event header */}
        <div style={{ marginBottom: '32px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '24px', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                <div style={{ fontSize: '13px', fontWeight: 800, letterSpacing: '2px', textTransform: 'uppercase', color: 'var(--teal)' }}>Event Workspace</div>
                <div style={{ fontSize: '13px', fontWeight: 700, padding: '2px 10px', borderRadius: '16px', background: event.status === 'active' ? 'rgba(192,244,60,0.15)' : 'var(--card)', color: event.status === 'active' ? 'var(--teal)' : 'var(--ink2)' }}>
                  {event.status}
                </div>
                <button onClick={() => setEditing(e => !e)}
                  style={{ marginLeft: '4px', padding: '3px 10px', borderRadius: '8px', border: '1px solid var(--border)', background: editing ? 'var(--surface)' : 'var(--card)', color: editing ? 'var(--lime)' : 'var(--ink3)', fontSize: '11px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                  {editing ? 'Cancel' : 'Edit'}
                </button>
              </div>

              {!editing ? (
                <>
                  <h1 style={{ fontSize: '36px', fontWeight: 900, color: 'var(--ink)', margin: '0 0 6px', letterSpacing: '-0.5px' }}>{event.name}</h1>
                  <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
                    {event.city && <span style={{ fontSize: '13px', color: 'var(--ink2)' }}>{event.city}</span>}
                    {event.event_date && <span style={{ fontSize: '13px', color: 'var(--ink2)' }}>{new Date(event.event_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</span>}
                    {event.venue && <span style={{ fontSize: '13px', color: 'var(--ink2)' }}>{event.venue}</span>}
                    {event.client_name && <span style={{ fontSize: '13px', color: 'var(--ink2)' }}>{event.client_name}</span>}
                    {event.expected_attendance && <span style={{ fontSize: '13px', color: 'var(--ink2)' }}>{event.expected_attendance.toLocaleString()} expected</span>}
                  </div>
                </>
              ) : (
                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px', padding: '20px', marginTop: '4px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div style={{ gridColumn: '1/-1' }}>
                      <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink3)', display: 'block', marginBottom: '4px' }}>EVENT NAME</label>
                      <input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                        style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '15px', fontWeight: 700, fontFamily: 'inherit', color: 'var(--ink)', boxSizing: 'border-box' }} />
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
                        <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink3)', display: 'block', marginBottom: '4px' }}>{label}</label>
                        {opts ? (
                          <select value={editForm[key as keyof typeof editForm]} onChange={e => setEditForm(f => ({ ...f, [key]: e.target.value }))}
                            style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px', fontFamily: 'inherit', color: 'var(--ink)' }}>
                            {opts.map(o => <option key={o} value={o}>{o}</option>)}
                          </select>
                        ) : (
                          <input type={type ?? 'text'} value={editForm[key as keyof typeof editForm]} onChange={e => setEditForm(f => ({ ...f, [key]: e.target.value }))}
                            style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px', fontFamily: 'inherit', color: 'var(--ink)', boxSizing: 'border-box' }} />
                        )}
                      </div>
                    ))}
                    <div style={{ gridColumn: '1/-1' }}>
                      <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink3)', display: 'block', marginBottom: '4px' }}>DESCRIPTION</label>
                      <textarea value={editForm.description} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} rows={3}
                        style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px', fontFamily: 'inherit', color: 'var(--ink)', resize: 'vertical', boxSizing: 'border-box' }} />
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', marginTop: '14px' }}>
                    <button onClick={saveEventEdit} disabled={savingEdit || !editForm.name}
                      style={{ padding: '10px 22px', borderRadius: '8px', border: 'none', background: 'var(--lime)', color: 'var(--lime-dark)', fontSize: '13px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', opacity: savingEdit ? 0.6 : 1 }}>
                      {savingEdit ? 'Saving…' : 'Save Changes'}
                    </button>
                    <button onClick={() => setEditing(false)}
                      style={{ padding: '10px 16px', borderRadius: '8px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--ink3)', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit' }}>
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
                style={{ padding: '14px 26px', borderRadius: '12px', border: 'none', background: generating ? 'var(--card-hi)' : 'var(--lime)', color: generating ? 'var(--ink3)' : 'var(--lime-dark)', fontSize: '13px', fontWeight: 800, cursor: generating ? 'not-allowed' : 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '8px', whiteSpace: 'nowrap', flexShrink: 0 }}>
                <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                {generating ? 'AI generating checklist…' : checklist.length > 0 ? 'Regenerate Checklist' : 'Generate Checklist with AI'}
              </button>
            )}
          </div>

          {msg && (
            <div style={{ marginTop: '16px', padding: '10px 16px', borderRadius: '10px', background: msg.includes('generated') || msg.includes('Generated') ? 'rgba(192,244,60,0.08)' : 'rgba(241,102,122,0.08)', border: `1px solid ${msg.includes('generated') || msg.includes('Generated') ? 'rgba(192,244,60,0.25)' : 'rgba(241,102,122,0.25)'}`, color: msg.includes('generated') || msg.includes('Generated') ? 'var(--teal)' : 'var(--red)', fontSize: '13px' }}>
              {msg}
            </div>
          )}
        </div>

        {/* ══════════ RACI PHASE FLOW ══════════ */}
        <div style={{ marginBottom: '24px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '16px', padding: '24px 28px' }}>
          <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--ink)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '20px' }}>Event Lifecycle</div>

          {/* Phase 1 — Concept & Strategy */}
          <div style={{ marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
              <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: 'var(--info)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 900, color: 'var(--info-light)', flexShrink: 0 }}>1</div>
              <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--info)' }}>Concept & Strategy</span>
              <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', paddingLeft: '34px' }}>
              <Link href={`/admin/events/${eventId}/brief`} style={{ textDecoration: 'none', padding: '14px 16px', borderRadius: '10px', background: 'rgba(90,169,242,0.04)', border: '1px solid rgba(90,169,242,0.2)', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <svg width="18" height="18" fill="none" stroke="var(--info)" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                <div><div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink)' }}>Event Brief</div><div style={{ fontSize: '11px', color: 'var(--ink3)', marginTop: '2px' }}>Positioning, messaging, commercial targets, competition</div></div>
              </Link>
              <Link href={`/admin/events/${eventId}/execution`} style={{ textDecoration: 'none', padding: '14px 16px', borderRadius: '10px', background: 'rgba(167,139,250,0.04)', border: '1px solid rgba(167,139,250,0.2)', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <svg width="18" height="18" fill="none" stroke="var(--purple)" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                <div><div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink)' }}>Execution Flow & RACI</div><div style={{ fontSize: '11px', color: 'var(--ink3)', marginTop: '2px' }}>5-phase governance, approvals, COO overrides</div></div>
              </Link>
            </div>
          </div>

          {/* Phase 2 — Planning & Brand */}
          <div style={{ marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
              <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: 'var(--purple)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 900, color: 'var(--purple-light)', flexShrink: 0 }}>2</div>
              <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--purple)' }}>Planning, Commercial & Brand</span>
              <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', paddingLeft: '34px' }}>
              <Link href={`/admin/events/${eventId}/plan`} style={{ textDecoration: 'none', padding: '14px 16px', borderRadius: '10px', background: 'rgba(192,244,60,0.06)', border: '1px solid rgba(192,244,60,0.3)', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <svg width="18" height="18" fill="none" stroke="var(--teal)" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
                <div><div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink)' }}>Planning Board</div><div style={{ fontSize: '11px', color: 'var(--ink3)', marginTop: '2px' }}>Kanban + dependencies + AI risk</div></div>
              </Link>
              <Link href={`/admin/commercial/${eventId}`} style={{ textDecoration: 'none', padding: '14px 16px', borderRadius: '10px', background: 'rgba(18,201,189,0.04)', border: '1px solid rgba(18,201,189,0.2)', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <svg width="18" height="18" fill="none" stroke="var(--teal-mid)" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/></svg>
                <div><div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink)' }}>Commercial P&L</div><div style={{ fontSize: '11px', color: 'var(--ink3)', marginTop: '2px' }}>Revenue, costs, margins, approvals</div></div>
              </Link>
              <Link href={`/admin/events/${eventId}/brand`} style={{ textDecoration: 'none', padding: '14px 16px', borderRadius: '10px', background: 'rgba(167,139,250,0.04)', border: '1px solid rgba(167,139,250,0.2)', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <svg width="18" height="18" fill="none" stroke="var(--purple)" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><circle cx="13.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="10.5" r="2.5"/><circle cx="8.5" cy="7.5" r="2.5"/><circle cx="6.5" cy="12.5" r="2.5"/><path d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10"/></svg>
                <div><div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink)' }}>Brand Studio</div><div style={{ fontSize: '11px', color: 'var(--ink3)', marginTop: '2px' }}>Upload brand PDF, extract colours/fonts</div></div>
              </Link>
            </div>
          </div>

          {/* Phase 3 — Public-Facing Assets */}
          <div style={{ marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
              <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: 'var(--teal)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 900, color: 'var(--teal-light)', flexShrink: 0 }}>3</div>
              <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--teal)' }}>Public-Facing Assets</span>
              <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', paddingLeft: '34px' }}>
              <Link href={`/admin/events/${eventId}/website`} style={{ textDecoration: 'none', padding: '14px 16px', borderRadius: '10px', background: 'rgba(14,167,157,0.04)', border: '1px solid rgba(14,167,157,0.2)', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <svg width="18" height="18" fill="none" stroke="var(--teal)" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M3 9h18M9 21V9"/></svg>
                <div><div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink)' }}>Website Builder</div><div style={{ fontSize: '11px', color: 'var(--ink3)', marginTop: '2px' }}>Template, sync brand, build, publish</div></div>
              </Link>
              <Link href={`/content?event_id=${eventId}`} style={{ textDecoration: 'none', padding: '14px 16px', borderRadius: '10px', background: 'rgba(167,139,250,0.04)', border: '1px solid rgba(167,139,250,0.18)', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <svg width="18" height="18" fill="none" stroke="var(--purple)" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                <div><div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink)' }}>Content Campaigns</div><div style={{ fontSize: '11px', color: 'var(--ink3)', marginTop: '2px' }}>Social media posts for this event</div></div>
              </Link>
            </div>
          </div>

          {/* Phase 4 & 5 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                {/* D97706 -> literal #F5B94D per migration table (already-brightened amber; identical to var(--amber) but kept literal per spec) */}
                <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: '#F5B94D', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 900, color: 'var(--amber-light)', flexShrink: 0 }}>4</div>
                <span style={{ fontSize: '13px', fontWeight: 800, color: '#F5B94D' }}>Cycle Execution</span>
              </div>
              <div style={{ paddingLeft: '34px', fontSize: '12px', color: 'var(--ink3)', lineHeight: 1.6 }}>
                Speakers, sponsors, delegates, marketing campaigns, operations, partnerships — tracked in Execution Flow with milestone percentages.
              </div>
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: 'var(--red)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 900, color: 'var(--red-light)', flexShrink: 0 }}>5</div>
                <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--red)' }}>Pre-Event Lock</span>
              </div>
              <div style={{ paddingLeft: '34px', fontSize: '12px', color: 'var(--ink3)', lineHeight: 1.6 }}>
                21 days to 1 day before event — agenda freeze, print materials, registrations close, final operational readiness.
              </div>
            </div>
          </div>
        </div>

        {/* Website Production Flow */}
        <div style={{ marginBottom: '16px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '16px', padding: '20px 24px' }}>
          <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--teal-mid)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '16px' }}>Website Production Flow</div>
          <div style={{ display: 'flex', alignItems: 'stretch', gap: '0' }}>

            {/* Step 1 — Brand Studio */}
            <div style={{ flex: 1, background: 'rgba(167,139,250,0.04)', border: '1px solid rgba(167,139,250,0.22)', borderRadius: '12px', padding: '18px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: 'var(--purple)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 900, color: 'var(--purple-light)', flexShrink: 0 }}>1</div>
                <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--ink)' }}>Brand Studio</div>
              </div>
              <div style={{ fontSize: '12px', color: 'var(--ink3)', lineHeight: 1.55, marginBottom: '14px' }}>
                Upload the brand guidelines PDF. AI extracts colours and fonts — save before building the website.
              </div>
              <Link
                href={`/admin/events/${eventId}/brand`}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '8px', background: 'rgba(167,139,250,0.12)', border: '1px solid rgba(167,139,250,0.3)', color: 'var(--purple)', fontSize: '12px', fontWeight: 700, textDecoration: 'none' }}
              >
                <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                Open Brand Studio
              </Link>
            </div>

            {/* Arrow */}
            <div style={{ display: 'flex', alignItems: 'center', padding: '0 12px', flexShrink: 0 }}>
              <svg width="20" height="20" fill="none" stroke="var(--ink4)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            </div>

            {/* Step 2 — Build Website */}
            <div style={{ flex: 1, background: 'rgba(14,167,157,0.04)', border: '1px solid rgba(14,167,157,0.18)', borderRadius: '12px', padding: '18px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: 'var(--teal)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 900, color: 'var(--teal-light)', flexShrink: 0 }}>2</div>
                <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--ink)' }}>Build Website</div>
              </div>
              <div style={{ fontSize: '12px', color: 'var(--ink3)', lineHeight: 1.55, marginBottom: '14px' }}>
                Pick a template, sync brand guidelines, build page structure, and publish to a live URL.
              </div>
              <Link
                href={`/admin/events/${eventId}/website`}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '8px', background: 'rgba(14,167,157,0.12)', border: '1px solid rgba(14,167,157,0.25)', color: 'var(--teal)', fontSize: '12px', fontWeight: 700, textDecoration: 'none' }}
              >
                <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                Build Website
              </Link>
            </div>

          </div>
        </div>

        {/* spacing before checklist */}
        <div style={{ marginBottom: '24px' }} />


        {/* Progress stats */}
        {checklist.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '32px' }}>
            {[
              { label: 'Total Items',  value: total,   accent: 'var(--teal-mid)' },
              { label: 'Completed',    value: done,    accent: 'var(--lime)' },
              { label: 'In Progress',  value: inProg,  accent: '#F5B94D' /* D97706 -> literal per migration table */ },
              { label: 'Overdue',      value: overdue, accent: 'var(--red)' },
            ].map(s => (
              <div key={s.label} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderTop: `4px solid ${s.accent}`, borderRadius: '14px', padding: '20px', boxShadow: 'var(--shadow-sm)' }}>
                <div style={{ fontSize: '40px', fontWeight: 900, color: s.accent, lineHeight: 1, marginBottom: '6px' }}>{s.value}</div>
                <div style={{ fontSize: '11px', color: 'var(--ink3)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1.2px' }}>{s.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Progress bar */}
        {checklist.length > 0 && (
          <div style={{ marginBottom: '32px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink2)' }}>Overall Progress</span>
              <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--lime)' }}>{pct}%</span>
            </div>
            <div style={{ height: '6px', background: 'var(--border-light)', borderRadius: '3px', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${pct}%`, background: 'linear-gradient(90deg, var(--teal-mid), var(--lime))', borderRadius: '3px', transition: 'width 0.5s ease' }} />
            </div>
          </div>
        )}

        {/* Empty state */}
        {checklist.length === 0 && !generating && (
          <div style={{ textAlign: 'center', padding: '80px 0' }}>
            <div style={{ width: '64px', height: '64px', background: 'rgba(192,244,60,0.08)', border: '1px solid rgba(192,244,60,0.2)', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
              <svg width="28" height="28" fill="none" stroke="var(--teal)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
            </div>
            <h3 style={{ fontSize: '36px', fontWeight: 800, color: 'var(--ink)', margin: '0 0 8px' }}>No checklist yet</h3>
            <p style={{ fontSize: '13px', color: 'var(--ink2)', margin: '0 0 28px' }}>
              Click "Generate Checklist with AI" — Pilot will build a complete<br />department-by-department checklist for this event instantly.
            </p>
          </div>
        )}

        {/* Checklist by department */}
        {Object.keys(byDept).sort().map(dept => {
          const items   = byDept[dept]
          const dColor  = DEPT_COLORS[dept] ?? '#12C9BD'
          const dDone   = items.filter(i => i.status === 'done').length
          const dTotal  = items.length

          return (
            <div key={dept} style={{ marginBottom: '24px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '16px', overflow: 'hidden' }}>

              {/* Department header */}
              <div style={{ padding: '16px 22px', borderBottom: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', gap: '12px', background: `rgba(${dColor === '#12C9BD' ? '18,201,189' : dColor === '#A78BFA' ? '167,139,250' : dColor === '#F5B94D' ? '245,185,77' : dColor === '#34D399' ? '52,211,153' : dColor === '#5AA9F2' ? '90,169,242' : '244,114,182'},0.06)` }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: dColor }} />
                <span style={{ fontSize: '13px', fontWeight: 800, color: dColor, letterSpacing: '0.5px' }}>{dept}</span>
                <span style={{ fontSize: '13px', color: 'var(--ink)', marginLeft: 'auto' }}>{dDone}/{dTotal} done</span>
                {/* Mini progress */}
                <div style={{ width: '80px', height: '4px', background: 'var(--border-light)', borderRadius: '2px', overflow: 'hidden' }}>
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
                    <div key={item.id} style={{ padding: '14px 22px', borderBottom: idx < items.length - 1 ? '1px solid var(--border-light)' : 'none', display: 'flex', alignItems: 'flex-start', gap: '14px' }}>

                      {/* Status toggle */}
                      <button
                        onClick={() => {
                          const next = item.status === 'not_started' ? 'in_progress' : item.status === 'in_progress' ? 'done' : 'not_started'
                          updateItem(item.id, { status: next })
                        }}
                        style={{ width: '22px', height: '22px', borderRadius: '6px', border: `2px solid ${item.status === 'done' ? 'var(--lime)' : 'var(--border)'}`, background: item.status === 'done' ? 'var(--lime)' : 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '1px', transition: 'all 0.15s' }}>
                        {item.status === 'done' && (
                          <svg width="12" height="12" fill="none" stroke="var(--lime-dark)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                        )}
                        {item.status === 'in_progress' && (
                          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--amber)' }} />
                        )}
                      </button>

                      {/* Content */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {isEditing ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <input
                              value={editDraft.title ?? item.title}
                              onChange={e => setEditDraft(p => ({ ...p, title: e.target.value }))}
                              style={{ padding: '7px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--ink)', fontSize: '13px', fontFamily: 'inherit' }}
                            />
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                              <input type="date"
                                value={editDraft.due_date ?? item.due_date ?? ''}
                                onChange={e => setEditDraft(p => ({ ...p, due_date: e.target.value }))}
                                style={{ padding: '6px 10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--ink)', fontSize: '13px', fontFamily: 'inherit' }}
                              />
                              <select
                                value={editDraft.owner?.id ?? item.owner?.id ?? ''}
                                onChange={e => {
                                  const s = staffList.find(x => x.id === e.target.value)
                                  setEditDraft(p => ({ ...p, owner: s ? { id: s.id, name: s.name, department: s.department } : undefined }))
                                }}
                                style={{ padding: '6px 10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--ink)', fontSize: '13px', fontFamily: 'inherit', flex: 1 }}
                              >
                                <option value="">Assign owner…</option>
                                {staffList.map(s => <option key={s.id} value={s.id}>{s.name} — {s.department}</option>)}
                              </select>
                              <textarea
                                value={editDraft.notes ?? item.notes ?? ''}
                                onChange={e => setEditDraft(p => ({ ...p, notes: e.target.value }))}
                                placeholder="Notes…"
                                rows={2}
                                style={{ width: '100%', padding: '7px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--ink)', fontSize: '13px', fontFamily: 'inherit', resize: 'vertical' }}
                              />
                            </div>
                            <div style={{ display: 'flex', gap: '8px' }}>
                              <button onClick={() => saveEdit(item.id)} style={{ padding: '6px 16px', borderRadius: '8px', border: 'none', background: 'var(--lime)', color: 'var(--lime-dark)', fontSize: '13px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>Save</button>
                              <button onClick={() => { setEditingId(null); setEditDraft({}) }} style={{ padding: '6px 14px', borderRadius: '8px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--ink3)', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
                              <button onClick={() => deleteItem(item.id)} style={{ padding: '6px 14px', borderRadius: '8px', border: 'none', background: 'rgba(241,102,122,0.1)', color: 'var(--red)', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', marginLeft: 'auto' }}>Delete</button>
                            </div>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink)', textDecoration: item.status === 'done' ? 'line-through' : 'none', flex: 1 }}>
                              {item.title}
                            </span>
                            {item.owner && (
                              <span style={{ fontSize: '13px', color: 'var(--ink2)', background: 'var(--card-hi)', padding: '2px 8px', borderRadius: '6px', whiteSpace: 'nowrap' }}>
                                {item.owner.name}
                              </span>
                            )}
                            {item.due_date && (
                              <span style={{ fontSize: '13px', fontWeight: 600, color: isLate ? 'var(--red)' : 'var(--ink2)', whiteSpace: 'nowrap' }}>
                                {isLate ? 'Overdue · ' : ''}{new Date(item.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                              </span>
                            )}
                            <span style={{ fontSize: '13px', fontWeight: 700, padding: '2px 8px', borderRadius: '6px', background: sCfg.bg, color: sCfg.color, whiteSpace: 'nowrap' }}>
                              {sCfg.label}
                            </span>
                            <button onClick={() => { setEditingId(item.id); setEditDraft({}) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', padding: '2px', display: 'flex', alignItems: 'center' }}>
                              <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                            </button>
                          </div>
                        )}
                        {item.notes && !isEditing && (
                          <p style={{ fontSize: '13px', color: 'var(--ink2)', margin: '4px 0 0', lineHeight: 1.65 }}>{item.notes}</p>
                        )}
                      </div>
                    </div>
                  )
                })}

                {/* Add item row */}
                {addingDept === dept ? (
                  <div style={{ padding: '12px 22px', borderTop: '1px solid var(--border)', display: 'flex', gap: '8px' }}>
                    <input
                      autoFocus
                      value={newItemTitle}
                      onChange={e => setNewItemTitle(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') addItem(dept); if (e.key === 'Escape') { setAddingDept(null); setNewItemTitle('') } }}
                      placeholder="Add checklist item…"
                      style={{ flex: 1, padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--ink)', fontSize: '13px', fontFamily: 'inherit' }}
                    />
                    <button onClick={() => addItem(dept)} style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', background: dColor, color: 'var(--surface)', fontSize: '13px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>Add</button>
                    <button onClick={() => { setAddingDept(null); setNewItemTitle('') }} style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--ink3)', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
                  </div>
                ) : (
                  <button onClick={() => setAddingDept(dept)} style={{ width: '100%', padding: '10px 22px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', fontSize: '13px', fontWeight: 600, textAlign: 'left', fontFamily: 'inherit', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    Add item to {dept}
                  </button>
                )}
              </div>
            </div>
          )
        })}
        {/* ── Event Report Section ── */}
        <div style={{ marginTop: '48px', paddingTop: '40px', borderTop: '1px solid var(--border)' }}>

          {/* Section header */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '20px', marginBottom: '28px', flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 800, letterSpacing: '2px', textTransform: 'uppercase', color: 'var(--purple)', marginBottom: '6px' }}>AI Generated</div>
              <h2 style={{ fontSize: '36px', fontWeight: 900, color: 'var(--ink)', margin: '0 0 6px', letterSpacing: '-0.3px' }}>Event Report</h2>
              <p style={{ fontSize: '13px', color: 'var(--ink2)', margin: 0 }}>
                Generated from the checklist and team inputs. Add comments before concluding.
              </p>
            </div>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
              {report && (
                <span style={{ fontSize: '13px', fontWeight: 700, padding: '4px 12px', borderRadius: '16px', background: report.status === 'live' ? 'rgba(192,244,60,0.12)' : 'rgba(167,139,250,0.12)', color: report.status === 'live' ? 'var(--teal)' : 'var(--purple)', border: `1px solid ${report.status === 'live' ? 'rgba(192,244,60,0.25)' : 'rgba(167,139,250,0.25)'}` }}>
                  {report.status === 'live' ? 'Live · In Knowledge Base' : 'Draft · Pending Review'}
                </span>
              )}
              {checklist.length > 0 && (
                <button
                  onClick={generateReport}
                  disabled={reportBusy}
                  style={{ padding: '10px 20px', borderRadius: '10px', border: '1px solid rgba(167,139,250,0.3)', background: reportBusy ? 'var(--card)' : 'rgba(167,139,250,0.1)', color: reportBusy ? 'var(--ink3)' : 'var(--purple)', fontSize: '13px', fontWeight: 700, cursor: reportBusy ? 'not-allowed' : 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '7px' }}>
                  <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                  {reportBusy ? 'Generating…' : report ? 'Regenerate Report' : 'Generate Report'}
                </button>
              )}
            </div>
          </div>

          {!report && checklist.length === 0 && (
            <div style={{ padding: '40px', textAlign: 'center', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '16px' }}>
              <p style={{ fontSize: '13px', color: 'var(--ink)', margin: 0 }}>Generate a checklist first — the report is built from checklist items and team notes.</p>
            </div>
          )}

          {!report && checklist.length > 0 && !reportBusy && (
            <div style={{ padding: '48px', textAlign: 'center', background: 'rgba(167,139,250,0.04)', border: '1px dashed rgba(167,139,250,0.2)', borderRadius: '16px' }}>
              <div style={{ width: '52px', height: '52px', background: 'rgba(167,139,250,0.1)', border: '1px solid rgba(167,139,250,0.2)', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                <svg width="24" height="24" fill="none" stroke="var(--purple)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
              </div>
              <h3 style={{ fontSize: '13px', fontWeight: 800, color: 'var(--ink)', margin: '0 0 8px' }}>No report yet</h3>
              <p style={{ fontSize: '13px', color: 'var(--ink2)', margin: '0 0 24px', lineHeight: 1.65 }}>
                Click "Generate Report" — AI reads all {checklist.length} checklist items, team notes,<br />and event details to produce a structured status report.
              </p>
              <button onClick={generateReport} disabled={reportBusy}
                style={{ padding: '14px 28px', borderRadius: '12px', border: 'none', background: 'var(--purple)', color: 'var(--purple-light)', fontSize: '13px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
                Generate Report with AI
              </button>
            </div>
          )}

          {report && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: '24px', alignItems: 'flex-start' }}>

              {/* Report content */}
              <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '16px', overflow: 'hidden' }}>
                <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink)' }}>{report.title}</span>
                  <span style={{ fontSize: '13px', color: 'var(--ink)' }}>
                    {new Date(report.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                </div>
                <div style={{ padding: '24px', maxHeight: '600px', overflowY: 'auto' }}>
                  <pre style={{ fontFamily: 'var(--font-manrope), Manrope, sans-serif', fontSize: '13px', color: 'var(--ink2)', lineHeight: 1.65, whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0 }}>
                    {report.extracted_text}
                  </pre>
                </div>
                {report.status === 'draft' && (
                  <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
                    <span style={{ fontSize: '13px', color: 'var(--ink2)' }}>
                      {comments.filter(c => !c.resolved).length > 0
                        ? `${comments.filter(c => !c.resolved).length} unresolved comment${comments.filter(c => !c.resolved).length > 1 ? 's' : ''} — resolve all before concluding`
                        : 'All comments resolved — ready to conclude'}
                    </span>
                    <button
                      onClick={concludeReport}
                      disabled={reportBusy || comments.some(c => !c.resolved)}
                      style={{ padding: '11px 22px', borderRadius: '10px', border: 'none', background: comments.some(c => !c.resolved) || reportBusy ? 'var(--card)' : 'var(--lime)', color: comments.some(c => !c.resolved) || reportBusy ? 'var(--ink3)' : 'var(--lime-dark)', fontSize: '13px', fontWeight: 800, cursor: comments.some(c => !c.resolved) || reportBusy ? 'not-allowed' : 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                      {reportBusy ? 'Concluding…' : 'Conclude Report'}
                    </button>
                  </div>
                )}
                {report.status === 'live' && (
                  <div style={{ padding: '14px 24px', borderTop: '1px solid var(--border)', background: 'rgba(192,244,60,0.04)' }}>
                    <span style={{ fontSize: '13px', color: 'var(--lime)', fontWeight: 600 }}>
                      Live in knowledge base — Pilot can now answer questions from this report.
                    </span>
                  </div>
                )}
              </div>

              {/* Comments panel */}
              <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '16px', overflow: 'hidden' }}>
                <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink)' }}>
                    Comments
                    {comments.length > 0 && (
                      <span style={{ marginLeft: '8px', fontSize: '13px', fontWeight: 700, padding: '2px 8px', borderRadius: '10px', background: comments.some(c => !c.resolved) ? 'rgba(245,185,77,0.15)' : 'rgba(192,244,60,0.1)', color: comments.some(c => !c.resolved) ? 'var(--amber)' : 'var(--lime)' }}>
                        {comments.filter(c => !c.resolved).length} open
                      </span>
                    )}
                  </span>
                </div>

                {/* Comment thread */}
                <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                  {comments.length === 0 ? (
                    <div style={{ padding: '28px 20px', textAlign: 'center', color: 'var(--ink2)', fontSize: '13px' }}>
                      No comments yet. Add corrections or clarifications before concluding.
                    </div>
                  ) : (
                    <div style={{ padding: '12px 0' }}>
                      {comments.map(c => (
                        <div key={c.id} style={{ padding: '12px 20px', borderBottom: '1px solid var(--border-light)', opacity: c.resolved ? 0.5 : 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '6px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                              <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: 'rgba(167,139,250,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                <span style={{ fontSize: '9px', fontWeight: 800, color: 'var(--purple)' }}>
                                  {c.staff?.name?.charAt(0) ?? 'A'}
                                </span>
                              </div>
                              <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink2)' }}>
                                {c.staff?.name ?? 'Admin'}
                              </span>
                              <span style={{ fontSize: '13px', color: 'var(--ink3)' }}>
                                {new Date(c.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                              </span>
                            </div>
                            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                              {c.resolved ? (
                                <button onClick={() => resolveComment(c.id, false)}
                                  style={{ fontSize: '13px', color: 'var(--ink3)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}>
                                  Reopen
                                </button>
                              ) : (
                                <button onClick={() => resolveComment(c.id, true)}
                                  style={{ fontSize: '13px', color: 'var(--lime)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700 }}>
                                  Resolve
                                </button>
                              )}
                              <button onClick={() => deleteComment(c.id)}
                                style={{ fontSize: '13px', color: 'rgba(241,102,122,0.6)' /* var(--red) at reduced alpha; kept literal, CSS vars can't carry an alpha suffix */, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
                                Delete
                              </button>
                            </div>
                          </div>
                          <p style={{ fontSize: '13px', color: c.resolved ? 'var(--ink3)' : 'var(--ink2)', margin: 0, lineHeight: 1.65, textDecoration: c.resolved ? 'line-through' : 'none' }}>
                            {c.comment}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Add comment */}
                {report.status === 'draft' && (
                  <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)' }}>
                    <textarea
                      value={commentText}
                      onChange={e => setCommentText(e.target.value)}
                      placeholder="Add a comment or correction…"
                      rows={3}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--ink)', fontSize: '13px', fontFamily: 'inherit', resize: 'none', boxSizing: 'border-box', marginBottom: '8px' }}
                    />
                    <button onClick={addComment} disabled={commentSaving || !commentText.trim()}
                      style={{ width: '100%', padding: '10px', borderRadius: '8px', border: 'none', background: commentText.trim() ? 'var(--purple)' : 'var(--card)', color: commentText.trim() ? 'var(--purple-light)' : 'var(--ink3)', fontSize: '13px', fontWeight: 700, cursor: commentText.trim() ? 'pointer' : 'not-allowed', fontFamily: 'inherit' }}>
                      {commentSaving ? 'Saving…' : 'Add Comment'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

      </div>

      {/* ── SOCIAL ACCOUNTS TAB ── */}
      {pnlTab === 'social' && (
        <div style={{ padding: '24px 28px' }}>
          <div style={{ marginBottom: '24px' }}>
            {/* #0A66C2 (LinkedIn blue) only measured 2.81:1 as plain text on --card; brightened via HSL-lightness bump to clear 4.5:1 (actual 4.67:1) */}
            <div style={{ fontSize: '13px', fontWeight: 800, letterSpacing: '2px', textTransform: 'uppercase', color: '#258CF4', marginBottom: '4px' }}>Social Accounts</div>
            <div style={{ fontSize: '14px', color: 'var(--ink3)' }}>Connect the social media pages for this event. Paste the page URL and access token once — used for all publishing.</div>
          </div>

          {/* Connected accounts */}
          {socialLoading ? (
            <div style={{ padding: '32px', textAlign: 'center', color: 'var(--ink3)', fontSize: '13px' }}>Loading…</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '28px' }}>
              {(['Facebook', 'Instagram', 'LinkedIn'] as const).map(platform => {
                const acc = socialAccounts.find(a => a.platform === platform)
                // Real-world platform brand colors — kept literal (industry-standard icon/button
                // colors, not part of our teal/lime/etc. token families) and used at runtime with
                // concatenated alpha suffixes (`color + '30'`, `${color}15`) which var() can't do.
                const colors: Record<string, string> = { Facebook: '#1877F2', Instagram: '#E1306C', LinkedIn: '#0A66C2' }
                const color = colors[platform]
                return (
                  <div key={platform} style={{ background: 'var(--card)', border: `1px solid ${acc ? color + '30' : 'var(--border)'}`, borderRadius: '14px', padding: '18px 20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: acc ? '12px' : '0' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: `${color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <svg width="16" height="16" fill={color} viewBox="0 0 24 24">
                            {platform === 'Facebook' && <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/>}
                            {platform === 'Instagram' && <><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" fill="white"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5" stroke="white" strokeWidth="2"/></>}
                            {platform === 'LinkedIn' && <><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/></>}
                          </svg>
                        </div>
                        <div>
                          <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--ink)' }}>{platform}</div>
                          {acc?.page_name && <div style={{ fontSize: '11px', color: 'var(--ink3)' }}>{acc.page_name}</div>}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {acc ? (
                          <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--lime)', background: 'rgba(192,244,60,0.12)', padding: '3px 10px', borderRadius: '8px' }}>Connected</span>
                        ) : (
                          <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink3)', background: 'var(--border-light)', padding: '3px 10px', borderRadius: '8px' }}>Not connected</span>
                        )}
                        {acc && (
                          <button onClick={async () => {
                            await fetch(`/api/events/social-accounts?id=${acc.id}`, { method: 'DELETE' })
                            setSocialAccounts(prev => prev.filter(a => a.id !== acc.id))
                          }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', fontSize: '11px', fontWeight: 700, padding: '3px 8px', borderRadius: '6px' }}>
                            Remove
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Inline form — always shown for quick edit */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '10px', fontWeight: 700, color: 'var(--ink3)', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '4px' }}>Page Name</label>
                        <input defaultValue={acc?.page_name ?? ''} id={`${platform}-name`}
                          placeholder="e.g. World AI Show Dubai"
                          style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px', fontFamily: 'inherit', color: 'var(--ink)', boxSizing: 'border-box' }} />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '10px', fontWeight: 700, color: 'var(--ink3)', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '4px' }}>Page URL</label>
                        <input defaultValue={acc?.page_url ?? ''} id={`${platform}-url`}
                          placeholder="https://facebook.com/worldaishow"
                          style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px', fontFamily: 'inherit', color: 'var(--ink)', boxSizing: 'border-box' }} />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '10px', fontWeight: 700, color: 'var(--ink3)', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '4px' }}>Page ID</label>
                        <input defaultValue={acc?.page_id ?? ''} id={`${platform}-id`}
                          placeholder="Numeric page ID"
                          style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px', fontFamily: 'inherit', color: 'var(--ink)', boxSizing: 'border-box' }} />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '10px', fontWeight: 700, color: 'var(--ink3)', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '4px' }}>
                          Access Token <span style={{ color: 'var(--ink4)', fontWeight: 500 }}>(paste from Meta/LinkedIn)</span>
                        </label>
                        <input defaultValue={acc?.access_token ?? ''} id={`${platform}-token`}
                          type="password"
                          placeholder={acc ? '••••••••' : 'Paste token here — or type DUMMY to test'}
                          style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px', fontFamily: 'inherit', color: 'var(--ink)', boxSizing: 'border-box' }} />
                      </div>
                    </div>
                    <button
                      onClick={async () => {
                        const name  = (document.getElementById(`${platform}-name`)  as HTMLInputElement).value
                        const url   = (document.getElementById(`${platform}-url`)   as HTMLInputElement).value
                        const pid   = (document.getElementById(`${platform}-id`)    as HTMLInputElement).value
                        const token = (document.getElementById(`${platform}-token`) as HTMLInputElement).value
                        if (!token) return
                        setSocialSaving(true)
                        const res  = await fetch('/api/events/social-accounts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event_id: eventId, platform, page_name: name, page_url: url, page_id: pid, access_token: token }) })
                        const data = await res.json()
                        if (res.ok) setSocialAccounts(prev => { const next = prev.filter(a => a.platform !== platform); return [...next, data] })
                        setSocialSaving(false)
                        setSocialMsg(res.ok ? `${platform} saved.` : data.error ?? 'Error')
                        setTimeout(() => setSocialMsg(''), 3000)
                      }}
                      // White text on a solid brand-platform button is the industry-standard
                      // treatment for Facebook/Instagram/LinkedIn buttons — exempted from the
                      // family-token text rule since these aren't our design-system colors.
                      style={{ marginTop: '10px', padding: '8px 18px', borderRadius: '8px', background: color, color: '#FFFFFF', fontSize: '12px', fontWeight: 800, border: 'none', cursor: 'pointer', fontFamily: 'inherit', opacity: socialSaving ? 0.7 : 1 }}>
                      {socialSaving ? 'Saving…' : `Save ${platform}`}
                    </button>
                  </div>
                )
              })}
            </div>
          )}

          {socialMsg && <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'rgba(192,244,60,0.08)', border: '1px solid rgba(192,244,60,0.2)', color: 'var(--lime)', fontSize: '13px', fontWeight: 600 }}>{socialMsg}</div>}

          <div style={{ marginTop: '20px', padding: '14px 16px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', fontSize: '12px', color: 'var(--ink3)', lineHeight: 1.65 }}>
            <strong style={{ color: 'var(--ink)' }}>Where to get your access token:</strong><br />
            <strong>Facebook / Instagram:</strong> Meta Business Manager → Settings → Page Access Tokens<br />
            <strong>LinkedIn:</strong> LinkedIn Developer Portal → Your App → Auth → OAuth Tokens<br />
            Type <code style={{ background: 'var(--border-light)', padding: '1px 5px', borderRadius: '4px' }}>DUMMY</code> in the token field to test publishing in simulation mode.
          </div>
        </div>
      )}

      {/* ── CONTENT CAMPAIGNS TAB ── */}
      {pnlTab === 'content' && (
        <div style={{ padding: '24px 28px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 800, letterSpacing: '2px', textTransform: 'uppercase', color: 'var(--purple)', marginBottom: '4px' }}>Content Campaigns</div>
              <div style={{ fontSize: '14px', color: 'var(--ink3)' }}>All social media campaigns linked to this event.</div>
            </div>
            <a href={`/content?event_id=${eventId}`}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '9px 18px', borderRadius: '10px', background: 'var(--purple)', color: 'var(--purple-light)', fontSize: '13px', fontWeight: 800, textDecoration: 'none' }}>
              + New Campaign
            </a>
          </div>

          {contentLoading ? (
            <div style={{ padding: '32px', textAlign: 'center', color: 'var(--ink3)', fontSize: '13px' }}>Loading…</div>
          ) : contentCampaigns.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px' }}>
              <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--ink)', marginBottom: '8px' }}>No campaigns yet</div>
              <div style={{ fontSize: '13px', color: 'var(--ink3)', marginBottom: '20px' }}>Create your first campaign for this event.</div>
              <a href={`/content?event_id=${eventId}`} style={{ display: 'inline-block', padding: '10px 24px', borderRadius: '10px', background: 'var(--purple)', color: 'var(--purple-light)', fontSize: '13px', fontWeight: 800, textDecoration: 'none' }}>
                Create Campaign
              </a>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {contentCampaigns.map((c: ContentCampaign) => {
                // Kept literal (not var()) — these get concatenated with a runtime alpha suffix
                // (`${PHASE_COLOR[...]}15` below), which CSS custom properties can't do. Values are
                // the dark-theme equivalents of var(--purple)/var(--lime)/var(--teal)/var(--amber).
                const PHASE_COLOR: Record<string, string> = { pre_event: '#A78BFA', live_week: '#C0F43C', post_event: '#0EA79D', always_on: '#F5B94D' }
                const PHASE_LABEL: Record<string, string> = { pre_event: 'Pre-Event', live_week: 'Live Week', post_event: 'Post-Event', always_on: 'Always On' }
                const postCount = c.content_posts?.[0]?.count ?? 0
                return (
                  <a key={c.id} href={`/content/campaigns/${c.id}`}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px', textDecoration: 'none', gap: '12px' }}>
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--ink)', marginBottom: '4px' }}>{c.name}</div>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '11px', fontWeight: 700, color: PHASE_COLOR[c.phase] ?? '#7E93A1', background: `${PHASE_COLOR[c.phase] ?? '#7E93A1'}15`, padding: '2px 8px', borderRadius: '6px' }}>{PHASE_LABEL[c.phase] ?? c.phase}</span>
                        <span style={{ fontSize: '11px', color: 'var(--ink3)' }}>{postCount} posts</span>
                        {c.platforms?.map((p: string) => <span key={p} style={{ fontSize: '11px', color: 'var(--ink3)', background: 'var(--border-light)', padding: '2px 7px', borderRadius: '5px' }}>{p}</span>)}
                      </div>
                    </div>
                    <svg width="14" height="14" fill="none" stroke="var(--purple)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>
                  </a>
                )
              })}
            </div>
          )}
        </div>
      )}

      <style>{`
        input[type="date"]::-webkit-calendar-picker-indicator { filter: invert(0.5); }
        * { box-sizing: border-box; }
      `}</style>
    </div>
  )
}
