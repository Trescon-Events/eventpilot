import { supabaseAdmin } from '@/app/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'

/*
  POST /api/import/commit
  Body: {
    rows: ParsedRow[]          — approved rows from the parse step
    new_columns: NewColumn[]   — admin-approved new columns to add
  }

  TWO-PASS APPROACH:
  Pass 1 — Insert/update all staff WITHOUT manager_id
           Builds a complete name→id + email→id map from the whole imported set
  Pass 2 — Resolve manager_name → manager_id for every row using the full map
           Reports unresolved managers so admin can fix them manually

  This guarantees manager links work regardless of row order in the CSV.
*/

type ParsedRow = {
  name:         string
  email:        string
  office_id:    string
  department:   string
  role:         string
  job_level:    string
  manager_name: string
  team:         string | null
  extra:        Record<string, string>
  warnings:     string[]
}

type NewColumn = {
  col_name:    string
  col_type:    string
  description: string
}

const VALID_OFFICES     = ['dubai', 'bangalore', 'mangalore', 'manipal']
const VALID_JOB_LEVELS  = ['staff', 'team_lead', 'dept_head', 'office_head', 'super_admin']
const MANAGER_LEVELS    = ['team_lead', 'dept_head', 'office_head', 'super_admin']

/* Generate a readable temp password: FirstName + random 4-digit pin + ! */
function makeTempPassword(name: string): string {
  const first = name.trim().split(' ')[0].replace(/[^a-zA-Z]/g, '')
  const pin   = String(Math.floor(1000 + Math.random() * 9000))
  return `${first.charAt(0).toUpperCase()}${first.slice(1).toLowerCase()}@${pin}`
}

/* Normalise a name for fuzzy matching */
function normName(n: string) { return n.toLowerCase().replace(/\s+/g, ' ').trim() }

/* Score how well two names match (0 = no match, higher = better) */
function nameScore(source: string, target: string): number {
  const s = normName(source)
  const t = normName(target)
  if (s === t) return 100                          // exact
  if (t.includes(s) || s.includes(t)) return 80   // one contains the other
  const sParts = s.split(' ')
  const tParts = t.split(' ')
  // first + last name both match
  if (sParts[0] === tParts[0] && sParts[sParts.length - 1] === tParts[tParts.length - 1]) return 90
  // first name match only
  if (sParts[0] === tParts[0]) return 50
  return 0
}

function resolveManager(managerName: string, nameToId: Map<string, string>): string | null {
  if (!managerName?.trim()) return null
  let bestId: string | null = null
  let bestScore = 0
  for (const [name, id] of nameToId) {
    const score = nameScore(managerName, name)
    if (score > bestScore) { bestScore = score; bestId = id }
  }
  return bestScore >= 50 ? bestId : null
}

export async function POST(req: NextRequest) {
  const { rows, new_columns } = await req.json().catch(() => ({}))
  if (!Array.isArray(rows)) {
    return NextResponse.json({ error: 'rows array required' }, { status: 400 })
  }

  const results = {
    inserted:            0,
    updated:             0,
    skipped:             0,
    manager_links_set:   0,
    manager_unresolved:  [] as { name: string; manager_name: string }[],
    errors:              [] as string[],
    credentials:         [] as { name: string; email: string; temp_password: string; access_enabled: boolean; job_level: string }[],
  }

  /* ── Step 1: Add approved new columns ── */
  const addedCols: string[] = []
  if (Array.isArray(new_columns) && new_columns.length > 0) {
    for (const col of new_columns as NewColumn[]) {
      if (!col.col_name || !/^[a-z_][a-z0-9_]*$/.test(col.col_name)) continue
      const sqlType = ['text', 'integer', 'date', 'boolean'].includes(col.col_type)
        ? col.col_type : 'text'
      try {
        await supabaseAdmin.rpc('run_sql', {
          query: `ALTER TABLE staff_members ADD COLUMN IF NOT EXISTS "${col.col_name}" ${sqlType}`
        })
        addedCols.push(col.col_name)
      } catch { /* column may already exist */ }
    }
  }

  /* ── Build lookup from ALL existing staff before we start ── */
  const { data: existingStaff } = await supabaseAdmin
    .from('staff_members')
    .select('id, name, email')

  const nameToId  = new Map<string, string>()
  const emailToId = new Map<string, string>()
  for (const s of existingStaff ?? []) {
    nameToId.set(normName(s.name), s.id)
    emailToId.set(s.email.toLowerCase().trim(), s.id)
  }

  /* Track email→id for rows we import this batch */
  const batchEmailToId = new Map<string, string>()
  const batchNameToId  = new Map<string, string>()

  /* ── PASS 1: Insert / update all staff (no manager_id yet) ── */
  for (const row of rows as ParsedRow[]) {
    if (!row.name?.trim() || !row.email?.trim()) {
      results.skipped++
      results.errors.push(`Skipped — missing name or email: "${row.name || 'unnamed'}"`)
      continue
    }

    const email          = row.email.toLowerCase().trim()
    const officeId       = VALID_OFFICES.includes(row.office_id) ? row.office_id : null
    const jobLevel       = VALID_JOB_LEVELS.includes(row.job_level) ? row.job_level : 'staff'
    const isManager      = MANAGER_LEVELS.includes(jobLevel)
    const tempPassword   = makeTempPassword(row.name)
    const passwordHash   = await bcrypt.hash(tempPassword, 10)

    const payload: Record<string, unknown> = {
      name:             row.name.trim(),
      email,
      office_id:        officeId,
      department:       row.department?.trim() || null,
      role:             row.role?.trim() || null,
      job_level:        jobLevel,
      team:             row.team?.trim() || null,
      profile_complete: false,
      password_hash:    passwordHash,
      access_enabled:   isManager,   /* Phase 1: only managers get access */
      /* manager_id intentionally omitted — set in pass 2 */
    }

    /* Add extra fields for approved new columns */
    if (row.extra && typeof row.extra === 'object') {
      for (const [key, val] of Object.entries(row.extra)) {
        if (addedCols.includes(key)) payload[key] = val || null
      }
    }

    const existingId = emailToId.get(email)
    if (existingId) {
      const { error } = await supabaseAdmin
        .from('staff_members')
        .update(payload)
        .eq('id', existingId)
      if (error) {
        results.errors.push(`Update failed for ${email}: ${error.message}`)
      } else {
        results.updated++
        batchEmailToId.set(email, existingId)
        batchNameToId.set(normName(row.name), existingId)
        nameToId.set(normName(row.name), existingId)
        results.credentials.push({ name: row.name.trim(), email, temp_password: tempPassword, access_enabled: isManager, job_level: jobLevel })
      }
    } else {
      const { data: inserted, error } = await supabaseAdmin
        .from('staff_members')
        .insert(payload)
        .select('id')
        .single()
      if (error) {
        results.skipped++
        results.errors.push(`Insert failed for ${email}: ${error.message}`)
      } else {
        results.inserted++
        if (inserted?.id) {
          batchEmailToId.set(email, inserted.id)
          batchNameToId.set(normName(row.name), inserted.id)
          nameToId.set(normName(row.name), inserted.id)
          emailToId.set(email, inserted.id)
        }
        results.credentials.push({ name: row.name.trim(), email, temp_password: tempPassword, access_enabled: isManager, job_level: jobLevel })
      }
    }
  }

  /* ── PASS 2: Resolve manager links now that all staff exist ── */
  for (const row of rows as ParsedRow[]) {
    if (!row.manager_name?.trim()) continue

    const email = row.email?.toLowerCase().trim()
    if (!email) continue

    const staffId = batchEmailToId.get(email) ?? emailToId.get(email)
    if (!staffId) continue

    const managerId = resolveManager(row.manager_name, nameToId)

    if (managerId) {
      const { error } = await supabaseAdmin
        .from('staff_members')
        .update({ manager_id: managerId })
        .eq('id', staffId)
      if (!error) results.manager_links_set++
    } else {
      results.manager_unresolved.push({
        name:         row.name?.trim() || email,
        manager_name: row.manager_name.trim(),
      })
    }
  }

  return NextResponse.json({
    inserted:           results.inserted,
    updated:            results.updated,
    skipped:            results.skipped,
    manager_links_set:  results.manager_links_set,
    manager_unresolved: results.manager_unresolved,
    errors:             results.errors,
    new_columns_added:  addedCols,
    total_processed:    rows.length,
  })
}
