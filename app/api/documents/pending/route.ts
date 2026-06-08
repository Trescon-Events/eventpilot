import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

/*
  GET /api/documents/pending?manager_id=uuid
  Returns documents pending this manager's review.
  Includes submitter name and AI analysis fields.
*/
export async function GET(req: NextRequest) {
  const managerId = req.nextUrl.searchParams.get('manager_id')
  if (!managerId) return NextResponse.json({ error: 'manager_id required' }, { status: 400 })

  // Get all staff who report to this manager
  const { data: reports } = await supabaseAdmin
    .from('staff_members')
    .select('id, name, department, role')
    .eq('manager_id', managerId)

  if (!reports || reports.length === 0) return NextResponse.json([])

  const reportIds = reports.map(r => r.id)
  const reportMap = Object.fromEntries(reports.map(r => [r.id, r]))

  // Get pending documents from those staff
  const { data: docs, error } = await supabaseAdmin
    .from('documents')
    .select('id, title, type, word_count, layer, department, min_level, pilot_use, ai_reasoning, confidence, status, submitted_by, review_note, created_at')
    .in('submitted_by', reportIds)
    .in('status', ['pending_manager', 'pending_depthead'])
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Attach submitter info
  const enriched = (docs ?? []).map(doc => ({
    ...doc,
    submitter: reportMap[doc.submitted_by ?? ''] ?? null,
  }))

  return NextResponse.json(enriched)
}
