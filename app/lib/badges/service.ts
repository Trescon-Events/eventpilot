// Server-side logic for speaker badge batches: auth, loading, per-item rendering (preview + review flags), and the two
// background jobs (render all, build the print PDF). Same pattern as the photo-clean job: the route inserts a job row,
// starts the work WITHOUT awaiting (Railway runs a persistent process; Cloudflare kills a request at ~100 s), and the
// client polls the job row. Unlike that job, every item bumps updated_at so a dead job (restart mid-run) can be spotted.
import { NextRequest, NextResponse } from 'next/server'
import sharp from 'sharp'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession, type TcsSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'
import { compositeAnnouncement, type Variant } from '@/app/lib/announcements/composite'
import { uploadPublicAsset } from '@/app/lib/events/storage'
import { putObject } from '@/app/lib/kb/storage'
import { computeFlags, resolveItemInputs } from '@/app/lib/badges/batch-inputs'
import { buildBadgeBatchPdf } from '@/app/lib/badges/print-pdf'
import type { BadgeItemRow } from '@/app/lib/badges/types'

export type BadgeBatchRow = {
  id: string; event_id: string; variant_id: string; name: string; status: 'draft' | 'review' | 'approved'
  template_snapshot: Variant; pdf_versions: Array<{ key: string; generated_at: string; generated_by: string | null; badges: number }>
  created_by: string | null; approved_by: string | null; created_at: string; updated_at: string; approved_at: string | null
}

export const PREVIEW_SCALE = 0.6
const JOB_DEAD_AFTER_MS = 3 * 60 * 1000
const RENDER_CONCURRENCY = 3

type PermissionKey = 'sae.badges.view' | 'sae.badges.manage' | 'sae.badges.approve'

/** Session + event permission, in the repo's usual shape. Returns the session, or a ready 401/403 response. */
export async function requireBadgePermission(req: NextRequest, eventId: string, key: PermissionKey): Promise<{ session: TcsSession } | { error: NextResponse }> {
  const session = getSession(req)
  if (!session) return { error: NextResponse.json({ error: 'Not signed in.' }, { status: 401 }) }
  if (!session.adm && !(await hasEventPermission(session.sid, eventId, key))) {
    return { error: NextResponse.json({ error: 'Not authorized.' }, { status: 403 }) }
  }
  return { session }
}

/** The session's staff id if it is a real staff_members row (a platform-admin login may not be) — keeps FK columns valid. */
export async function knownStaffId(sid: string | null | undefined): Promise<string | null> {
  if (!sid) return null
  const { data } = await supabaseAdmin.from('staff_members').select('id').eq('id', sid).maybeSingle()
  return (data?.id as string | undefined) ?? null
}

export async function loadBatch(batchId: string): Promise<BadgeBatchRow | null> {
  const { data } = await supabaseAdmin.from('badge_batches').select('*').eq('id', batchId).maybeSingle()
  return (data as BadgeBatchRow | null) ?? null
}

export async function loadItems(batchId: string): Promise<BadgeItemRow[]> {
  const { data } = await supabaseAdmin.from('badge_batch_items').select('*').eq('batch_id', batchId).order('position', { ascending: true })
  return (data ?? []) as BadgeItemRow[]
}

/** Renders one badge: review-grid preview image + automatic flags. Writes the result onto the item row. */
export async function renderItem(batch: BadgeBatchRow, item: BadgeItemRow): Promise<BadgeItemRow> {
  const inputs = await resolveItemInputs(item, batch.template_snapshot)
  const png = await compositeAnnouncement(inputs.variant, inputs.assets, inputs.texts)
  const webp = await sharp(png)
    .resize(Math.round(inputs.variant.canvas_width * PREVIEW_SCALE), Math.round(inputs.variant.canvas_height * PREVIEW_SCALE))
    .flatten({ background: { r: 255, g: 255, b: 255 } }).webp({ quality: 85 }).toBuffer()
  const url = await uploadPublicAsset(`events/${batch.event_id}/badges/${batch.id}/${item.id}-${Date.now()}.webp`, webp, 'image/webp')
  const flags = await computeFlags(item, inputs)
  const { data, error } = await supabaseAdmin.from('badge_batch_items')
    .update({ preview_url: url, preview_stale: false, flags }).eq('id', item.id).select('*').single()
  if (error) throw new Error(error.message)
  return data as BadgeItemRow
}

async function touchJob(jobId: string, patch: Record<string, unknown>) {
  await supabaseAdmin.from('badge_jobs').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', jobId)
}

export async function startJob(batchId: string, kind: 'render' | 'pdf', total: number, staffId: string | null): Promise<string> {
  const { data, error } = await supabaseAdmin.from('badge_jobs')
    .insert({ batch_id: batchId, kind, progress_total: total, created_by: await knownStaffId(staffId) }).select('id').single()
  if (error || !data) throw new Error(error?.message ?? 'Could not start the job.')
  return data.id as string
}

/** Render every item that has no fresh preview. Resumable: finished items are skipped. */
export async function runRenderJob(jobId: string, batchId: string): Promise<void> {
  try {
    const batch = await loadBatch(batchId)
    if (!batch) throw new Error('Batch not found.')
    const todo = (await loadItems(batchId)).filter(i => !i.removed && (i.preview_stale || !i.preview_url))
    await touchJob(jobId, { progress_total: todo.length, progress_done: 0 })
    let done = 0, next = 0
    const failures: string[] = []
    await Promise.all(Array.from({ length: Math.min(RENDER_CONCURRENCY, todo.length) }, async () => {
      while (next < todo.length) {
        const item = todo[next++]
        try { await renderItem(batch, item) } catch (e) { failures.push(`${item.name ?? 'Unnamed'}: ${e instanceof Error ? e.message : 'render failed'}`) }
        done++
        await touchJob(jobId, { progress_done: done })
      }
    }))
    if (batch.status === 'draft') await supabaseAdmin.from('badge_batches').update({ status: 'review', updated_at: new Date().toISOString() }).eq('id', batchId)
    await touchJob(jobId, { status: failures.length && failures.length === todo.length ? 'error' : 'done', completed_at: new Date().toISOString(), result: { failures }, error_message: failures.length ? failures.slice(0, 5).join(' | ').slice(0, 2000) : null })
  } catch (e) {
    await touchJob(jobId, { status: 'error', completed_at: new Date().toISOString(), error_message: (e instanceof Error ? e.message : 'Render failed').slice(0, 2000) })
  }
}

/** Build the print PDF from the approved items and store it in private R2. */
export async function runPdfJob(jobId: string, batchId: string, staffId: string | null): Promise<void> {
  try {
    const batch = await loadBatch(batchId)
    if (!batch) throw new Error('Batch not found.')
    const items = (await loadItems(batchId)).filter(i => !i.removed && i.approved)
    if (items.length === 0) throw new Error('No approved badges in this batch.')
    const { data: ev } = await supabaseAdmin.from('events').select('name').eq('id', batch.event_id).single()
    await touchJob(jobId, { progress_total: items.length, progress_done: 0 })
    const pdf = await buildBadgeBatchPdf({
      variant: batch.template_snapshot, count: items.length, eventName: (ev?.name as string | undefined) ?? 'Event', batchName: batch.name,
      getItem: async i => { const r = await resolveItemInputs(items[i], batch.template_snapshot); return { variant: r.variant, assets: r.assets, texts: r.texts } },
      onProgress: (done) => touchJob(jobId, { progress_done: done }),
    })
    const key = `badges/${batch.event_id}/${batch.id}/${Date.now()}.pdf`
    await putObject(key, pdf, 'application/pdf')
    const versions = [...(batch.pdf_versions ?? []), { key, generated_at: new Date().toISOString(), generated_by: await knownStaffId(staffId), badges: items.length }]
    await supabaseAdmin.from('badge_batches').update({ pdf_versions: versions, updated_at: new Date().toISOString() }).eq('id', batchId)
    await touchJob(jobId, { status: 'done', completed_at: new Date().toISOString(), result: { key, badges: items.length, bytes: pdf.length } })
  } catch (e) {
    await touchJob(jobId, { status: 'error', completed_at: new Date().toISOString(), error_message: (e instanceof Error ? e.message : 'Could not build the print file.').slice(0, 2000) })
  }
}

/** A 'processing' job nobody has touched for a few minutes died with its server (restart/redeploy) — mark it so the UI can offer a retry. */
export async function sweepDeadJobs(batchId: string): Promise<void> {
  const cutoff = new Date(Date.now() - JOB_DEAD_AFTER_MS).toISOString()
  await supabaseAdmin.from('badge_jobs')
    .update({ status: 'error', error_message: 'The job stopped unexpectedly (the server restarted). Try again — finished badges are kept.', completed_at: new Date().toISOString() })
    .eq('batch_id', batchId).eq('status', 'processing').lt('updated_at', cutoff)
}
