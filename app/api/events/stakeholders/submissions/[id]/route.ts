import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'

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

  const { data: existing } = await supabaseAdmin.from('stakeholder_form_submissions').select('event_id').eq('id', id).single()
  if (!existing) return NextResponse.json({ error: 'Submission not found' }, { status: 404 })

  const session = getSession(req)
  if (!session?.adm && !(await hasEventPermission(session?.sid, existing.event_id, 'sae.submissions.reject'))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
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
