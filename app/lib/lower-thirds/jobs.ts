import { supabaseAdmin } from '@/app/lib/supabase'

/* Creative render job queue (creative_render_jobs). Currently used only for lower_third jobs. Same claim/fail pattern as video_jobs. */

export type CreativeJobKind = 'lower_third'
export type CreativeJob = {
  id: string; event_id: string; agenda_session_id: string; speaker_id: string
  kind: CreativeJobKind; status: string; attempts: number
  params: Record<string, unknown>
}

export const CREATIVE_MAX_ATTEMPTS = 2
export const CREATIVE_STALE_MS = 15 * 60 * 1000  // 15 min

export async function claimNextCreativeJob(): Promise<CreativeJob | null> {
  const { data: next } = await supabaseAdmin.from('creative_render_jobs').select('id').eq('status', 'pending').order('created_at').limit(1).maybeSingle()
  if (!next) return null
  const { data: got } = await supabaseAdmin.from('creative_render_jobs').update({ status: 'running', claimed_at: new Date().toISOString() }).eq('id', next.id).eq('status', 'pending').select('id, event_id, agenda_session_id, speaker_id, kind, status, attempts, params').maybeSingle()
  if (!got) return null
  await supabaseAdmin.from('creative_render_jobs').update({ attempts: (got.attempts as number) + 1 }).eq('id', got.id)
  return { ...(got as CreativeJob), attempts: (got.attempts as number) + 1 }
}

export async function finishCreativeJob(jobId: string): Promise<void> {
  await supabaseAdmin.from('creative_render_jobs').update({ status: 'done', finished_at: new Date().toISOString(), error: null }).eq('id', jobId)
}

export async function failCreativeJob(job: CreativeJob, message: string): Promise<'requeued' | 'failed'> {
  const msg = message.slice(0, 1500)
  if (job.attempts < CREATIVE_MAX_ATTEMPTS) {
    await supabaseAdmin.from('creative_render_jobs').update({ status: 'pending', error: msg }).eq('id', job.id)
    return 'requeued'
  }
  await supabaseAdmin.from('creative_render_jobs').update({ status: 'failed', error: msg, finished_at: new Date().toISOString() }).eq('id', job.id)
  await supabaseAdmin.from('session_lower_thirds').update({ status: 'draft', updated_at: new Date().toISOString() }).eq('agenda_session_id', job.agenda_session_id).eq('speaker_id', job.speaker_id)
  return 'failed'
}

export async function requeueStaleCreativeJobs(): Promise<number> {
  const cutoff = new Date(Date.now() - CREATIVE_STALE_MS).toISOString()
  const { data } = await supabaseAdmin.from('creative_render_jobs').update({ status: 'pending', error: 'Requeued: worker timed out.' }).eq('status', 'running').lt('claimed_at', cutoff).select('id')
  return data?.length ?? 0
}
