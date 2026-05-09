import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

/*
  PATCH /api/documents/review
  Body: { document_id, reviewer_id, action: 'approve' | 'reject', note?: string }

  approve → status = 'live'
  reject  → status = 'rejected', notify submitter
*/
export async function PATCH(req: NextRequest) {
  const { document_id, reviewer_id, action, note } = await req.json()

  if (!document_id || !reviewer_id || !['approve', 'reject'].includes(action)) {
    return NextResponse.json({ error: 'document_id, reviewer_id and action required' }, { status: 400 })
  }

  const newStatus = action === 'approve' ? 'live' : 'rejected'

  const { data: doc, error } = await supabaseAdmin
    .from('documents')
    .update({
      status:      newStatus,
      reviewed_by: reviewer_id,
      review_note: note ?? null,
    })
    .eq('id', document_id)
    .select('id, title, submitted_by, status')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Notify the submitter of the outcome
  if (doc.submitted_by) {
    const { data: reviewer } = await supabaseAdmin
      .from('staff_members')
      .select('name')
      .eq('id', reviewer_id)
      .single()

    await supabaseAdmin.from('notifications').insert({
      staff_id:  doc.submitted_by,
      type:      'document_review',
      title:     action === 'approve' ? 'Your document was approved' : 'Your document needs revision',
      body:      action === 'approve'
        ? `"${doc.title}" has been approved by ${reviewer?.name ?? 'your manager'} and is now live on the platform.`
        : `"${doc.title}" was returned by ${reviewer?.name ?? 'your manager'}. Note: ${note ?? 'Please review and resubmit.'}`,
      course_id: null,
      read:      false,
    })
  }

  return NextResponse.json({ success: true, document: doc })
}
