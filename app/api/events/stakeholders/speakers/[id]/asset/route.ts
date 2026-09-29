import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'
import { deletePublicAsset } from '@/app/lib/events/storage'
import type { MissingItemKey } from '@/app/lib/stakeholders/missing-items'

/* DELETE /api/events/stakeholders/speakers/[id]/asset?type=photo|full_bio
   Removes a wrong photo (raw + cleaned cut-out + head box + cleaning state)
   or a wrong Full Bio (PDF + its extracted text), so the item reads as
   Missing again and can be requested from the speaker. The UI gates this
   behind a typed-DELETE confirmation. Passport/National ID have their own
   delete under sensitive-documents/[docId].

   If the speaker has an OPEN request that didn't ask for this item, the item
   is appended to it — the speaker's same link then asks for it again, rather
   than a second link being issued (one open link per speaker). */

const BUCKET_MARKER = '/event-stakeholder-assets/'

async function removeStored(url: string | null | undefined) {
  if (!url || !url.includes(BUCKET_MARKER)) return // externally hosted (e.g. an old HubSpot link) — nothing of ours to delete
  await deletePublicAsset(decodeURIComponent(url.split(BUCKET_MARKER)[1].split('?')[0]))
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: speakerId } = await params
  const type = req.nextUrl.searchParams.get('type')
  if (type !== 'photo' && type !== 'full_bio') return NextResponse.json({ error: 'type must be photo or full_bio' }, { status: 400 })

  const { data: speaker } = await supabaseAdmin
    .from('event_speakers')
    .select('event_id, announcement_status, photo_url, photo_processed_url, bio_full_url')
    .eq('id', speakerId)
    .single()
  if (!speaker) return NextResponse.json({ error: 'Speaker not found' }, { status: 404 })

  const session = getSession(req)
  if (!session?.adm && !(await hasEventPermission(session?.sid, speaker.event_id, 'sae.stakeholders.edit'))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  const patch: Record<string, unknown> = type === 'photo'
    ? { photo_url: null, photo_processed_url: null, photo_head_box: null, photo_low_resolution: false, photo_cleaning_cycle_done: false }
    : { bio_full_url: null, bio_full_source: null, bio_full_text: null }
  // Same rule as every upload path: an approved speaker whose source material changes needs a fresh review.
  if (speaker.announcement_status === 'ready') patch.announcement_status = 'pending_review'
  patch.updated_at = new Date().toISOString()

  const { error } = await supabaseAdmin.from('event_speakers').update(patch).eq('id', speakerId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Storage cleanup is best-effort; the record is already cleared.
  if (type === 'photo') { await removeStored(speaker.photo_url); await removeStored(speaker.photo_processed_url) }
  else await removeStored(speaker.bio_full_url)

  const key: MissingItemKey = type === 'photo' ? 'photo' : 'bio_full'
  const { data: open } = await supabaseAdmin.from('speaker_communication_requests').select('id, requested_fields').eq('speaker_id', speakerId).eq('status', 'pending').limit(1).maybeSingle()
  let reopenedOnOpenRequest = false
  if (open && !((open.requested_fields as string[]) ?? []).includes(key)) {
    await supabaseAdmin.from('speaker_communication_requests').update({ requested_fields: [...(open.requested_fields as string[]), key] }).eq('id', open.id)
    reopenedOnOpenRequest = true
  }
  return NextResponse.json({ ok: true, added_to_open_request: reopenedOnOpenRequest, has_open_request: !!open })
}
