import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

// GET  ?staff_id=X     — all reviews for a staff member
// GET  ?reviewer_id=X  — reviews submitted by a reviewer
// POST                 — create a review
// PATCH                — update / submit / acknowledge

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const staff_id    = searchParams.get('staff_id')
  const reviewer_id = searchParams.get('reviewer_id')

  if (staff_id) {
    const { data, error } = await supabaseAdmin
      .from('performance_reviews')
      .select('*, reviewer:reviewer_id( id, name )')
      .eq('staff_id', staff_id)
      .order('created_at', { ascending: false })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data ?? [])
  }

  if (reviewer_id) {
    const { data, error } = await supabaseAdmin
      .from('performance_reviews')
      .select('*, staff:staff_id( id, name, department )')
      .eq('reviewer_id', reviewer_id)
      .order('created_at', { ascending: false })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data ?? [])
  }

  return NextResponse.json({ error: 'staff_id or reviewer_id required' }, { status: 400 })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const {
    staff_id, reviewer_id, review_period, review_date,
    overall_rating, kpi_score, strengths, areas_to_improve,
    goals_next_period, reviewer_comments, staff_comments,
  } = body

  if (!staff_id || !review_period) {
    return NextResponse.json({ error: 'staff_id and review_period required' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('performance_reviews')
    .insert({
      staff_id,
      reviewer_id:        reviewer_id        ?? null,
      review_period,
      review_date:        review_date        ?? null,
      overall_rating:     overall_rating     ?? null,
      kpi_score:          kpi_score          ?? null,
      strengths:          strengths          ?? null,
      areas_to_improve:   areas_to_improve   ?? null,
      goals_next_period:  goals_next_period  ?? null,
      reviewer_comments:  reviewer_comments  ?? null,
      staff_comments:     staff_comments     ?? null,
      status: 'draft',
    })
    .select('*').single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest) {
  const { id, ...updates } = await req.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const allowed = [
    'reviewer_id','review_date','overall_rating','kpi_score','strengths',
    'areas_to_improve','goals_next_period','reviewer_comments','staff_comments','status',
  ]
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const k of allowed) if (updates[k] !== undefined) patch[k] = updates[k]

  const { data, error } = await supabaseAdmin
    .from('performance_reviews').update(patch).eq('id', id).select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
