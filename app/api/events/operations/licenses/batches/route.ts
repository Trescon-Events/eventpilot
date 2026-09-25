import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'
import { loadLicenseCandidates } from '@/app/lib/ops/license-readiness'
import { logOpsAccess, clientIp } from '@/app/lib/ops/audit'

/* POST /api/events/operations/licenses/batches
   Body: { event_id, vendor_id, speaker_ids: string[], access_days?: 1-30 (default 7), notes? }

   Creates a DRAFT batch from speakers that are currently ready (every
   required document reviewed, not already in an active batch) and freezes
   each speaker's display fields and exact document rows into the batch.
   Nothing is sent to the vendor here — sending arrives with the vendor
   portal. Gated by ops.licenses.manage. */

const MAX_SPEAKERS_PER_BATCH = 100

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as {
    event_id?: string; vendor_id?: string; speaker_ids?: string[]; access_days?: number; notes?: string
  } | null
  if (!body?.event_id || !body.vendor_id || !Array.isArray(body.speaker_ids) || body.speaker_ids.length === 0) {
    return NextResponse.json({ error: 'event_id, vendor_id and at least one speaker are required.' }, { status: 400 })
  }
  const speakerIds = [...new Set(body.speaker_ids)]
  if (speakerIds.length > MAX_SPEAKERS_PER_BATCH) {
    return NextResponse.json({ error: `A batch can hold at most ${MAX_SPEAKERS_PER_BATCH} speakers.` }, { status: 400 })
  }
  const accessDays = body.access_days ?? 7
  if (!Number.isInteger(accessDays) || accessDays < 1 || accessDays > 30) {
    return NextResponse.json({ error: 'Vendor access must be between 1 and 30 days.' }, { status: 400 })
  }

  const session = getSession(req)
  if (!session?.adm && !(await hasEventPermission(session?.sid, body.event_id, 'ops.licenses.manage'))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  // The vendor must be an active licence vendor assigned to THIS event.
  const { data: link } = await supabaseAdmin
    .from('ops_event_vendors')
    .select('ops_vendors(active)')
    .eq('event_id', body.event_id).eq('vendor_id', body.vendor_id).eq('purpose', 'speaker_license')
    .maybeSingle()
  const linkedVendor = link && (Array.isArray(link.ops_vendors) ? link.ops_vendors[0] : link.ops_vendors)
  if (!linkedVendor?.active) {
    return NextResponse.json({ error: 'That vendor is not assigned to this event for speaker licences.' }, { status: 400 })
  }

  // Re-derive readiness server-side — never trust the client's list.
  const { ready } = await loadLicenseCandidates(body.event_id)
  const readyById = new Map(ready.map(c => [c.id, c]))
  const notReady = speakerIds.filter(id => !readyById.has(id))
  if (notReady.length) {
    return NextResponse.json({ error: `${notReady.length} selected speaker(s) are no longer ready or are already in a batch. Refresh and try again.` }, { status: 409 })
  }

  // Next per-event batch number; the UNIQUE (event_id, batch_number)
  // constraint arbitrates a race, so retry a couple of times on a clash.
  let batchId: string | null = null
  let batchNumber = 0
  for (let attempt = 0; attempt < 3 && !batchId; attempt++) {
    const { data: last } = await supabaseAdmin
      .from('ops_license_batches').select('batch_number').eq('event_id', body.event_id)
      .order('batch_number', { ascending: false }).limit(1).maybeSingle()
    batchNumber = (last?.batch_number ?? 0) + 1
    const { data: created, error } = await supabaseAdmin
      .from('ops_license_batches')
      .insert({
        event_id: body.event_id, vendor_id: body.vendor_id, batch_number: batchNumber, access_days: accessDays,
        notes: body.notes?.trim() || null, created_by: session?.sid ?? null,
      })
      .select('id').single()
    if (created) batchId = created.id
    else if (error?.code !== '23505') return NextResponse.json({ error: error?.message ?? 'Could not create batch.' }, { status: 500 })
  }
  if (!batchId) return NextResponse.json({ error: 'Could not allocate a batch number, please try again.' }, { status: 409 })

  const { error: itemsErr } = await supabaseAdmin.from('ops_license_batch_items').insert(
    speakerIds.map(id => {
      const c = readyById.get(id)!
      return {
        batch_id: batchId, speaker_id: id, speaker_name: c.name, job_title: c.job_title, company: c.company,
        country: c.country, is_uae_resident: c.is_uae_resident,
        passport_doc_id: c.passport.id, national_id_doc_id: c.national_id?.id ?? null,
      }
    }),
  )
  if (itemsErr) {
    // Don't leave an empty batch behind. 23505 here = the DB's one-active-
    // batch-per-speaker rule caught a concurrent double-booking.
    await supabaseAdmin.from('ops_license_batches').delete().eq('id', batchId)
    const clash = itemsErr.code === '23505'
    return NextResponse.json(
      { error: clash ? 'One of those speakers was just added to another batch. Refresh and try again.' : itemsErr.message },
      { status: clash ? 409 : 500 },
    )
  }

  await logOpsAccess({
    eventId: body.event_id, actorType: 'staff', actorId: session?.sid ?? null, action: 'batch_created',
    targetType: 'license_batch', targetId: batchId, meta: { batch_number: batchNumber, vendor_id: body.vendor_id, speakers: speakerIds.length }, ip: clientIp(req),
  })
  return NextResponse.json({ id: batchId, batch_number: batchNumber })
}
