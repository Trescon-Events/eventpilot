import type { NextRequest } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

/* Who a photo route is working on (2026-10-19). The speaker photo routes (upload-asset, head-box, clean-photo/*) also serve VIPs when called
   with ?kind=vip: same pipeline, different table. Default (no kind) is a speaker, so every existing call behaves exactly as before.
   A VIP has no announcement_status (nothing to re-approve), so that column is only ever read for speakers. */

export type PhotoSubject = { kind: 'speaker' | 'vip'; table: 'event_speakers' | 'event_vips'; jobColumn: 'speaker_id' | 'vip_id'; folder: 'speakers' | 'vips' }

export function photoSubject(req: NextRequest): PhotoSubject {
  return req.nextUrl.searchParams.get('kind') === 'vip'
    ? { kind: 'vip', table: 'event_vips', jobColumn: 'vip_id', folder: 'vips' }
    : { kind: 'speaker', table: 'event_speakers', jobColumn: 'speaker_id', folder: 'speakers' }
}

/** One row of the subject's table with the given comma-separated columns (announcement_status is dropped for VIPs). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- columns are chosen at runtime, so the row type can't be inferred
export async function loadPhotoSubject(subject: PhotoSubject, id: string, columns: string): Promise<Record<string, any> | null> {
  const cols = subject.kind === 'vip' ? columns.split(',').map(c => c.trim()).filter(c => c !== 'announcement_status').join(', ') : columns
  const { data } = await supabaseAdmin.from(subject.table).select(cols).eq('id', id).single()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data as unknown as Record<string, any>) ?? null
}
