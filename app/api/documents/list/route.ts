import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

/*
  GET /api/documents/list

  Params:
    admin=1               → all live documents (admin pipeline view)
    staff_id=uuid         → documents this staff member can access (Pilot / staff view)
    pipeline=1            → all documents including pending/flagged (admin pipeline)

  Access rules for staff:
    Layer 1 (knowledge_base) → always visible to everyone
    Layer 2 (general)        → visible to all staff
    Layer 3 (specific)       → only if department matches AND job_level meets min_level
*/

const LEVEL_RANK: Record<string, number> = {
  staff: 0, team_lead: 1, dept_head: 2, office_head: 3, super_admin: 4,
}
const MIN_LEVEL_RANK: Record<string, number> = {
  all: 0, team_lead: 1, management: 3,
}

export async function GET(req: NextRequest) {
  const staffId  = req.nextUrl.searchParams.get('staff_id')
  const admin    = req.nextUrl.searchParams.get('admin') === '1'
  const pipeline = req.nextUrl.searchParams.get('pipeline') === '1'

  try {
    // ── Admin pipeline view — all docs with all statuses ──
    if (pipeline) {
      const { data, error } = await supabaseAdmin
        .from('documents')
        .select(`
          id, title, type, visibility, word_count, layer, department, min_level,
          pilot_use, ai_reasoning, confidence, status, flagged,
          submitted_by, reviewed_by, review_note, created_at,
          events(name)
        `)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
      if (error) throw error
      return NextResponse.json(data ?? [])
    }

    // ── Admin live docs view ──
    if (admin) {
      const { data, error } = await supabaseAdmin
        .from('documents')
        .select(`
          id, title, type, visibility, word_count, layer, department, min_level,
          pilot_use, ai_reasoning, confidence, status, flagged, created_at,
          events(name)
        `)
        .eq('is_active', true)
        .eq('status', 'live')
        .order('created_at', { ascending: false })
      if (error) throw error
      return NextResponse.json(data ?? [])
    }

    // ── Staff / Pilot view — access-filtered ──
    if (!staffId) return NextResponse.json({ error: 'staff_id required' }, { status: 400 })

    // Get staff profile for access check
    const { data: staff } = await supabaseAdmin
      .from('staff_members')
      .select('department, job_level')
      .eq('id', staffId)
      .single()

    const staffDept  = (staff?.department ?? '').toLowerCase()
    const staffLevel = LEVEL_RANK[staff?.job_level ?? 'staff'] ?? 0

    // Fetch all live documents
    const { data: docs, error } = await supabaseAdmin
      .from('documents')
      .select('id, title, type, word_count, layer, department, min_level, pilot_use, ai_reasoning, created_at')
      .eq('is_active', true)
      .eq('status', 'live')
      .order('created_at', { ascending: false })

    if (error) throw error

    // Filter by access rules
    const accessible = (docs ?? []).filter(doc => {
      // Layer 1 — always accessible
      if (doc.layer === 'knowledge_base') return true
      // Layer 2 — accessible to all staff
      if (doc.layer === 'general') return true
      // Layer 3 — department + level check
      if (doc.layer === 'specific') {
        const deptMatch  = doc.department === 'all' || doc.department === staffDept
        const levelMatch = staffLevel >= (MIN_LEVEL_RANK[doc.min_level] ?? 0)
        return deptMatch && levelMatch
      }
      return true
    })

    return NextResponse.json(accessible)
  } catch (e) {
    console.error('documents list error:', e)
    return NextResponse.json([], { status: 500 })
  }
}

/* DELETE — soft delete */
export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  await supabaseAdmin.from('documents').update({ is_active: false }).eq('id', id)
  return NextResponse.json({ success: true })
}
