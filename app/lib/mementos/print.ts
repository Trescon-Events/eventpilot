import { supabaseAdmin } from '@/app/lib/supabase'
import { putObject, presignGet } from '@/app/lib/kb/storage'
import { fetchAssetBuffer } from '@/app/lib/announcements/asset-buffer-cache'
import type { CreativeTemplateConfig, Variant } from '@/app/lib/announcements/composite'
import type { HeadBox } from '@/app/lib/media/face-alignment'
import { buildBadgeBatchPdf } from '@/app/lib/badges/print-pdf'
import { listMementoVariants } from './render'

/* Memento print file: one multi-page PDF per batch — contents page(s) naming each speaker, then one page per memento (vector background + the speaker
   head-aligned, CMYK). Built in the background on the Node server (the request returns at once, the page polls the batch). The file is private (R2);
   Ops and the vendor get it through server routes, never a storage link. */

const DEAD_AFTER_MS = 10 * 60 * 1000

export async function eventMementoVariantFor(eventId: string, variantId: string | null): Promise<Variant | undefined> {
  const { data } = await supabaseAdmin.from('events').select('creative_template_config').eq('id', eventId).single()
  const variants = listMementoVariants(data?.creative_template_config as CreativeTemplateConfig | null)
  return variantId ? variants.find(v => v.id === variantId) : undefined
}

export type PrintState = { status: 'none' | 'processing' | 'done' | 'error'; done: number; total: number; error: string | null; generated_at: string | null; bytes: number | null; stale: boolean; speakers: number }

/** Is the finished file out of date? True when a speaker was added/removed or a Cleaned Photo changed after it was built. */
export async function printState(batch: { id: string; print_status: string | null; print_started_at: string | null; print_done: number; print_total: number; print_error: string | null; print_pdf_key: string | null; print_generated_at: string | null; print_pdf_bytes: number | null; print_sources: Record<string, string> | null }): Promise<PrintState> {
  let status: PrintState['status'] = batch.print_status === 'processing' || batch.print_status === 'error' ? batch.print_status : batch.print_pdf_key ? 'done' : 'none'
  if (status === 'processing' && batch.print_started_at && Date.now() - new Date(batch.print_started_at).getTime() > DEAD_AFTER_MS) status = 'error'
  let stale = false
  if (batch.print_pdf_key && batch.print_sources) {
    const { data: items } = await supabaseAdmin.from('memento_batch_items').select('speaker_id').eq('batch_id', batch.id)
    const ids = (items ?? []).map(i => i.speaker_id as string)
    const { data: sp } = ids.length ? await supabaseAdmin.from('event_speakers').select('id, photo_processed_url').in('id', ids) : { data: [] as { id: string; photo_processed_url: string | null }[] }
    const now = new Map((sp ?? []).map(s => [s.id as string, s.photo_processed_url as string | null]))
    const used = batch.print_sources
    stale = ids.length !== Object.keys(used).length || ids.some(id => used[id] !== now.get(id))
  }
  return { status, done: batch.print_done, total: batch.print_total, error: status === 'error' && batch.print_status !== 'error' ? 'The job stopped unexpectedly (the server restarted). Generate again.' : batch.print_error, generated_at: batch.print_generated_at, bytes: batch.print_pdf_bytes, stale, speakers: batch.print_total }
}

const running = new Set<string>()

/** Starts building the print file for a draft batch. Returns an error message when it can't start. */
export async function startMementoPrint(batchId: string): Promise<{ error: string } | { ok: true }> {
  if (running.has(batchId)) return { ok: true }
  const { data: batch } = await supabaseAdmin.from('memento_batches').select('id, event_id, name, variant_id, status, print_status, print_started_at').eq('id', batchId).maybeSingle()
  if (!batch) return { error: 'Batch not found.' }
  if (batch.status !== 'draft') return { error: 'This batch has already been pushed to Ops, so its print file can no longer be changed.' }
  const variant = await eventMementoVariantFor(batch.event_id as string, batch.variant_id as string | null)
  if (!variant?.print) return { error: 'This batch was not made with a print Memento template, so it has no print file.' }
  if (batch.print_status === 'processing' && batch.print_started_at && Date.now() - new Date(batch.print_started_at as string).getTime() < DEAD_AFTER_MS) return { ok: true }
  const { count } = await supabaseAdmin.from('memento_batch_items').select('id', { count: 'exact', head: true }).eq('batch_id', batchId)
  if (!count) return { error: 'The batch has no speakers.' }
  await supabaseAdmin.from('memento_batches').update({ print_status: 'processing', print_started_at: new Date().toISOString(), print_done: 0, print_total: count, print_error: null }).eq('id', batchId)
  running.add(batchId)
  void runMementoPrint(batchId, variant).finally(() => running.delete(batchId))
  return { ok: true }
}

async function runMementoPrint(batchId: string, variant: Variant): Promise<void> {
  try {
    const { data: batch } = await supabaseAdmin.from('memento_batches').select('id, event_id, name, print_pdf_key').eq('id', batchId).single()
    const { data: items } = await supabaseAdmin.from('memento_batch_items').select('speaker_id, speaker_name').eq('batch_id', batchId).order('speaker_name')
    if (!batch || !items?.length) throw new Error('The batch has no speakers.')
    const { data: sp } = await supabaseAdmin.from('event_speakers').select('id, photo_processed_url, photo_head_box').in('id', items.map(i => i.speaker_id as string))
    const byId = new Map((sp ?? []).map(s => [s.id as string, s]))
    const missing = items.filter(i => !byId.get(i.speaker_id as string)?.photo_processed_url).map(i => i.speaker_name as string)
    if (missing.length) throw new Error(`No Cleaned Photo for: ${missing.join(', ')}. Remove them from the batch first.`)
    const { data: ev } = await supabaseAdmin.from('events').select('name').eq('id', batch.event_id).single()
    const sources: Record<string, string> = {}
    for (const i of items) sources[i.speaker_id as string] = byId.get(i.speaker_id as string)!.photo_processed_url as string
    let lastTouch = 0
    const pdf = await buildBadgeBatchPdf({
      variant, count: items.length, eventName: (ev?.name as string | undefined) ?? 'Event', batchName: batch.name as string, mementoNames: items.map(i => i.speaker_name as string),
      getItem: async idx => {
        const s = byId.get(items[idx].speaker_id as string)!
        const buffer = await fetchAssetBuffer(s.photo_processed_url as string)
        if (!buffer) throw new Error(`Could not load the Cleaned Photo of ${items[idx].speaker_name}.`)
        return { variant, assets: { speaker_photo: { buffer, url: s.photo_processed_url as string, head_box: (s.photo_head_box as HeadBox | null) ?? null } }, texts: {} }
      },
      onProgress: async done => { if (Date.now() - lastTouch > 1500 || done === items.length) { lastTouch = Date.now(); await supabaseAdmin.from('memento_batches').update({ print_done: done }).eq('id', batchId) } },
    })
    const key = `mementos/${batch.event_id}/${batchId}/${Date.now()}.pdf`
    await putObject(key, pdf, 'application/pdf')
    await supabaseAdmin.from('memento_batches').update({ print_status: 'done', print_pdf_key: key, print_generated_at: new Date().toISOString(), print_pdf_bytes: pdf.length, print_sources: sources, print_done: items.length, print_error: null }).eq('id', batchId)
  } catch (e) {
    console.error('[mementos] print file failed for', batchId, e instanceof Error ? e.message : e)
    await supabaseAdmin.from('memento_batches').update({ print_status: 'error', print_error: (e instanceof Error ? e.message : 'Could not build the print file.').slice(0, 1500) }).eq('id', batchId)
  }
}

export async function presignMementoPrint(key: string): Promise<string> { return presignGet(key) }

/** The finished PDF as a stream for server routes that hand it to Ops / the vendor (they never see a storage link). */
export async function mementoPrintStream(key: string): Promise<{ body: ReadableStream<Uint8Array>; size: string | null }> {
  const res = await fetch(await presignGet(key))
  if (!res.ok || !res.body) throw new Error('The print file could not be read.')
  return { body: res.body, size: res.headers.get('content-length') }
}
