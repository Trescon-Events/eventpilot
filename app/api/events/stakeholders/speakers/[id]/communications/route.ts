import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'
import { computeMissingItems } from '@/app/lib/stakeholders/missing-items'

/* GET /api/events/stakeholders/speakers/[id]/communications
   Request history for the Communications tab's outstanding-items requests
   — newest first. Also returns the speaker's currently-missing items
   (freshly computed, not a stale snapshot) so the tab can render its
   checklist without a second round-trip. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: speakerId } = await params

  const { data: speaker } = await supabaseAdmin
    .from('event_speakers')
    .select('event_id, bio_full_url, photo_url, is_uae_resident')
    .eq('id', speakerId)
    .single()
  if (!speaker) return NextResponse.json({ error: 'Speaker not found' }, { status: 404 })

  const session = getSession(req)
  if (!session?.adm && !(await hasEventPermission(session?.sid, speaker.event_id, 'sae.stakeholders.edit'))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  const [{ data: rows, error }, { data: docs }] = await Promise.all([
    supabaseAdmin
      .from('speaker_communication_requests')
      .select('id, requested_fields, status, requested_at, submitted_at, reminder_count, last_reminder_at, closed_at')
      .eq('speaker_id', speakerId)
      .order('requested_at', { ascending: false }),
    supabaseAdmin.from('speaker_sensitive_documents').select('document_type').eq('speaker_id', speakerId).is('deleted_at', null),
  ])
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const docTypes = new Set((docs ?? []).map(d => d.document_type as 'passport' | 'national_id'))
  const missingItems = computeMissingItems(speaker, docTypes)

  return NextResponse.json({ requests: rows ?? [], missing_items: missingItems })
}
