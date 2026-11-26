import { supabaseAdmin } from '@/app/lib/supabase'

/* The worker's queue (video_jobs). The web app only ever ENQUEUES; the worker on Railway claims, runs and finishes. Nothing heavy runs in a request. */

export type JobKind = 'drive_import' | 'ingest' | 'transcribe' | 'identify' | 'text_pack' | 'render_preview' | 'render' | 'cue_scan'
export type Job = { id: string; session_video_id: string; kind: JobKind; status: string; attempts: number }
export const MAX_ATTEMPTS = 2
export const STALE_RUNNING_MS = 90 * 60 * 1000   // a job "running" for longer than this was lost with its worker: it goes back in the queue

export async function enqueueJob(videoId: string, kind: JobKind): Promise<string> {
  const { data: open } = await supabaseAdmin.from('video_jobs').select('id').eq('session_video_id', videoId).eq('kind', kind).in('status', ['queued', 'running']).maybeSingle()
  if (open) return open.id as string   // already waiting: never two of the same
  const { data, error } = await supabaseAdmin.from('video_jobs').insert({ session_video_id: videoId, kind }).select('id').single()
  if (error) throw new Error(error.message)
  return data.id as string
}

/** Oldest queued job, claimed atomically (only the worker whose update still sees it queued gets it). */
export async function claimNextJob(): Promise<Job | null> {
  const { data: next } = await supabaseAdmin.from('video_jobs').select('id').eq('status', 'queued').order('created_at').limit(1).maybeSingle()
  if (!next) return null
  const { data: got } = await supabaseAdmin.from('video_jobs').update({ status: 'running', started_at: new Date().toISOString() }).eq('id', next.id).eq('status', 'queued').select('id, session_video_id, kind, status, attempts').maybeSingle()
  if (!got) return null
  await supabaseAdmin.from('video_jobs').update({ attempts: (got.attempts as number) + 1 }).eq('id', got.id)
  return { ...(got as Job), attempts: (got.attempts as number) + 1 }
}

export async function requeueStale(): Promise<number> {
  const cutoff = new Date(Date.now() - STALE_RUNNING_MS).toISOString()
  const { data } = await supabaseAdmin.from('video_jobs').update({ status: 'queued', error: 'Requeued: the worker stopped while this was running.' }).eq('status', 'running').lt('started_at', cutoff).select('id')
  return data?.length ?? 0
}

export async function logJob(jobId: string, line: string): Promise<void> {
  const { data } = await supabaseAdmin.from('video_jobs').select('log').eq('id', jobId).maybeSingle()
  const log = [...((data?.log as Array<{ at: string; line: string }> | null) ?? []), { at: new Date().toISOString(), line }].slice(-200)
  await supabaseAdmin.from('video_jobs').update({ log }).eq('id', jobId)
}

export async function finishJob(jobId: string): Promise<void> {
  await supabaseAdmin.from('video_jobs').update({ status: 'done', finished_at: new Date().toISOString(), error: null }).eq('id', jobId)
}

/** A failed run goes back in the queue once; the second failure is final and the video shows the error. */
export async function failJob(job: Job, message: string): Promise<'requeued' | 'failed'> {
  const msg = message.slice(0, 1500)
  if (job.attempts < MAX_ATTEMPTS) { await supabaseAdmin.from('video_jobs').update({ status: 'queued', error: msg }).eq('id', job.id); return 'requeued' }
  await supabaseAdmin.from('video_jobs').update({ status: 'failed', error: msg, finished_at: new Date().toISOString() }).eq('id', job.id)
  await supabaseAdmin.from('session_videos').update({ status: 'failed', error: `${job.kind}: ${msg}`, updated_at: new Date().toISOString() }).eq('id', job.session_video_id)
  return 'failed'
}
