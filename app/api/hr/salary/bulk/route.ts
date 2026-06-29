import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

/**
 * POST /api/hr/salary/bulk
 * Body: { rows: Array<{ email, basic_salary, allowances?, deductions?, currency?, grade_code?, effective_from?, notes? }>, created_by? }
 * Matches staff by email, creates salary records in bulk.
 * Returns { created, skipped, errors }
 */
export async function POST(req: NextRequest) {
  const { rows, created_by } = await req.json()

  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: 'rows array is required' }, { status: 400 })
  }

  // Fetch all staff by email for matching
  const emails = rows.map((r: { email?: string }) => r.email?.trim().toLowerCase()).filter(Boolean) as string[]
  const { data: staffList } = await supabaseAdmin
    .from('staff_members')
    .select('id, email, name')
    .in('email', emails)

  const staffByEmail: Record<string, { id: string; name: string }> = {}
  for (const s of staffList ?? []) {
    staffByEmail[s.email.toLowerCase()] = { id: s.id, name: s.name }
  }

  // Fetch grades for code matching
  const { data: grades } = await supabaseAdmin.from('payroll_grades').select('id, code')
  const gradeByCode: Record<string, string> = {}
  for (const g of grades ?? []) {
    gradeByCode[g.code.toUpperCase()] = g.id
  }

  const created: Array<{ email: string; name: string }> = []
  const skipped: Array<{ email: string; reason: string }> = []
  const errors: Array<{ email: string; error: string }> = []

  for (const row of rows) {
    const email = (row.email ?? '').trim().toLowerCase()
    if (!email) { skipped.push({ email: '(empty)', reason: 'No email provided' }); continue }

    const staff = staffByEmail[email]
    if (!staff) { skipped.push({ email, reason: 'Staff not found' }); continue }

    const basicSalary = Number(row.basic_salary)
    if (!basicSalary || basicSalary <= 0) { skipped.push({ email, reason: 'Invalid basic_salary' }); continue }

    const effectiveFrom = row.effective_from || new Date().toISOString().slice(0, 10)

    // Close any existing current record
    await supabaseAdmin
      .from('staff_salary_records')
      .update({ effective_to: effectiveFrom, updated_at: new Date().toISOString() })
      .eq('staff_id', staff.id)
      .is('effective_to', null)

    const gradeId = row.grade_code ? (gradeByCode[row.grade_code.toUpperCase()] ?? null) : null

    const { error } = await supabaseAdmin
      .from('staff_salary_records')
      .insert({
        staff_id: staff.id,
        effective_from: effectiveFrom,
        effective_to: null,
        basic_salary: basicSalary,
        allowances: Number(row.allowances) || 0,
        deductions: Number(row.deductions) || 0,
        currency: row.currency || 'USD',
        grade_id: gradeId,
        notes: row.notes || 'Bulk import',
        created_by: created_by ?? null,
      })

    if (error) {
      errors.push({ email, error: error.message })
    } else {
      created.push({ email, name: staff.name })
    }
  }

  return NextResponse.json({
    total: rows.length,
    created: created.length,
    skipped: skipped.length,
    error_count: errors.length,
    created_list: created,
    skipped_list: skipped,
    errors_list: errors,
  })
}
