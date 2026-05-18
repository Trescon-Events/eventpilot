import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

// POST /api/hr/init
// One-time bootstrap: for every active staff member, create:
//   1. A default 'active' contract (if none exists)
//   2. Leave balances for current year (if none exist)
//   3. A 'hire' employment history entry (if none exists)
// Safe to run multiple times — all operations check before creating.

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const year = body.year ?? new Date().getFullYear()

  // Fetch all active staff
  const { data: staff, error: staffErr } = await supabaseAdmin
    .from('staff_members')
    .select('id, name, department, job_level, joined_at')
    .order('name')

  if (staffErr) return NextResponse.json({ error: staffErr.message }, { status: 500 })
  if (!staff?.length) return NextResponse.json({ message: 'No active staff found.', contracts: 0, balances: 0, history: 0 })

  const staffIds = staff.map(s => s.id)

  // ── What already exists ────────────────────────────────────────────────────
  const [existingContracts, existingBalances, existingHistory] = await Promise.all([
    supabaseAdmin.from('staff_contracts').select('staff_id').in('staff_id', staffIds),
    supabaseAdmin.from('staff_leave_balances').select('staff_id').eq('year', year).in('staff_id', staffIds),
    supabaseAdmin.from('staff_employment_history').select('staff_id').eq('change_type', 'hire').in('staff_id', staffIds),
  ])

  const hasContract  = new Set((existingContracts.data  ?? []).map(r => r.staff_id))
  const hasBalance   = new Set((existingBalances.data   ?? []).map(r => r.staff_id))
  const hasHireEntry = new Set((existingHistory.data    ?? []).map(r => r.staff_id))

  // ── 1. Contracts ──────────────────────────────────────────────────────────
  const contractsToCreate = staff
    .filter(s => !hasContract.has(s.id))
    .map(s => ({
      staff_id:          s.id,
      contract_type:     'full_time',
      employment_status: 'active',
      start_date:        s.joined_at?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
    }))

  let contractsCreated = 0
  if (contractsToCreate.length > 0) {
    const { error } = await supabaseAdmin.from('staff_contracts').insert(contractsToCreate)
    if (!error) contractsCreated = contractsToCreate.length
  }

  // ── 2. Leave balances ─────────────────────────────────────────────────────
  const { data: leaveTypes } = await supabaseAdmin
    .from('leave_types')
    .select('id, default_days_per_year')
    .eq('is_active', true)

  const balancesToCreate: Record<string, unknown>[] = []
  for (const s of staff) {
    if (hasBalance.has(s.id)) continue
    for (const lt of leaveTypes ?? []) {
      balancesToCreate.push({
        staff_id:      s.id,
        leave_type_id: lt.id,
        year,
        entitled_days: lt.default_days_per_year,
        used_days:     0,
        pending_days:  0,
        carried_over:  0,
      })
    }
  }

  let balancesCreated = 0
  if (balancesToCreate.length > 0) {
    const CHUNK = 200
    for (let i = 0; i < balancesToCreate.length; i += CHUNK) {
      const { error } = await supabaseAdmin
        .from('staff_leave_balances')
        .upsert(balancesToCreate.slice(i, i + CHUNK), { onConflict: 'staff_id,leave_type_id,year' })
      if (!error) balancesCreated += Math.min(CHUNK, balancesToCreate.length - i)
    }
  }

  // ── 3. Employment history (hire entry) ────────────────────────────────────
  const historyToCreate = staff
    .filter(s => !hasHireEntry.has(s.id))
    .map(s => ({
      staff_id:    s.id,
      change_type: 'hire',
      new_value: {
        department: s.department,
        job_level:  s.job_level,
        source:     'hrms_migration',
      },
      notes: 'Initial record created during HRMS migration to Trescademy.',
    }))

  let historyCreated = 0
  if (historyToCreate.length > 0) {
    const { error } = await supabaseAdmin.from('staff_employment_history').insert(historyToCreate)
    if (!error) historyCreated = historyToCreate.length
  }

  return NextResponse.json({
    success:          true,
    total_staff:      staff.length,
    contracts_created: contractsCreated,
    contracts_skipped: staff.length - contractsToCreate.length,
    balances_created:  balancesCreated,
    balances_skipped:  hasBalance.size,
    history_created:   historyCreated,
    history_skipped:   hasHireEntry.size,
    year,
  })
}
