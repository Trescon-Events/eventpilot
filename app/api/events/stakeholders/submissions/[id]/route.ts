import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

/* PATCH /api/events/stakeholders/submissions/[id]
   Body: { status: 'rejected' }
   Used by the "Reject" action in the Stakeholder Hub's submissions inbox
   (PRD SS9.4) — discards a submission without converting it. Processing
   ("Process" action) goes through .../speakers/from-submission or
   .../partners/from-submission instead, which set status='processed'. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json().catch(() => null) as { status?: string } | null
  if (body?.status !== 'rejected') {
    return NextResponse.json({ error: "only status: 'rejected' is supported here" }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('stakeholder_form_submissions')
    .update({ status: 'rejected' })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
