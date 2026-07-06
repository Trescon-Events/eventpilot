import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { canAccessDocument, LEVEL_RANK } from '@/app/lib/kb/access'

/*
  GET /api/documents/list

  Params:
    admin=1               → all live documents (admin pipeline view)
    staff_id=uuid         → documents this staff member can access (Pilot / staff view)
    pipeline=1            → all documents including pending/flagged (admin pipeline)

  Access rules for staff — see app/lib/kb/access.ts
*/

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
          source_url, version, document_group_id, superseded_by, workspace_id,
          doc_category,
          extracted_text,
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
          source_url, version, document_group_id, superseded_by, workspace_id,
          doc_category,
          events(name)
        `)
        .eq('is_active', true)
        .eq('status', 'live')
        .is('superseded_by', null)
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
      .select('id, title, type, word_count, layer, department, min_level, pilot_use, ai_reasoning, source_url, extracted_text, created_at')
      .eq('is_active', true)
      .eq('status', 'live')
      .is('superseded_by', null)
      .order('created_at', { ascending: false })

    if (error) throw error

    const accessible = (docs ?? []).filter(doc => canAccessDocument(doc, staffDept, staffLevel))

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
