import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

/* GET /api/events/stakeholders/submissions?event_id=X&form_type=Y&status=Z
   Lists stakeholder_form_submissions for the MM's "form submissions inbox"
   (PRD SS9.4) — not in the PRD's original file list, but required by its
   own UI spec (unprocessed-count badge, process/reject list) since nothing
   else surfaces raw submissions before they're converted. Defaults to
   status=new (the inbox view) unless a status is explicitly requested. */
export async function GET(req: NextRequest) {
  const eventId  = req.nextUrl.searchParams.get('event_id')
  const formType = req.nextUrl.searchParams.get('form_type')
  const status   = req.nextUrl.searchParams.get('status')
  if (!eventId) return NextResponse.json({ error: 'event_id required' }, { status: 400 })

  let q = supabaseAdmin
    .from('stakeholder_form_submissions')
    .select('*')
    .eq('event_id', eventId)
    .order('submitted_at', { ascending: false })

  q = q.eq('status', status ?? 'new')
  if (formType) q = q.eq('form_type', formType)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}
