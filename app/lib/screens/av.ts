import { supabaseAdmin } from '@/app/lib/supabase'
import { loadScreenSessions, type ScreenSession } from './data'
import { avStatus, diffSnapshots, versionKey, type AvStatus, type Snapshot } from './av-state'

/* Stage Screens — the AV console's view of its link: every session with what the console has downloaded, what has changed since and why. Shared by the page API,
   the single-file download and the zip downloads, so they can never disagree about what counts as "changed". */

export type AvLink = { id: string; event_id: string; track_id: string | null; label: string; baseline_at?: string | null }
export type AvRow = {
  session: ScreenSession; status: AvStatus; reasons: string[]; downloadedAt: string | null; currentKey: string; preparing: boolean
}

const keyOf = (s: ScreenSession) => versionKey(s.savedFingerprint ?? '', s.snapshot)

export async function avView(link: AvLink): Promise<{ rows: AvRow[]; sessions: ScreenSession[]; timezone: string; autoRedraw: boolean; panel: 'light' | 'dark'; baselineAt: string | null }> {
  const [{ sessions, timezone, look }, { data: dl }, { data: fresh }] = await Promise.all([
    loadScreenSessions(link.event_id, { trackId: link.track_id }),
    supabaseAdmin.from('event_screen_link_downloads').select('session_id, version_key, snapshot, downloaded_at').eq('link_id', link.id),
    supabaseAdmin.from('event_screen_links').select('baseline_at').eq('id', link.id).maybeSingle(),
  ])
  const baselineAt = (fresh?.baseline_at as string | null) ?? link.baseline_at ?? null
  const got = new Map((dl ?? []).map(r => [r.session_id as string, r]))
  const rows: AvRow[] = []
  for (const s of sessions) {
    const hasFile = !!s.pngUrl
    // Before the console's first download there is nothing to compare with, so only drawn screens are listed; afterwards a session still being drawn is listed too ("being prepared").
    if (!hasFile && !baselineAt) continue
    const d = got.get(s.id)
    const stale = s.state !== 'ready'
    const currentKey = keyOf(s)
    const status = avStatus({ hasFile, stale, downloadedKey: (d?.version_key as string | undefined) ?? null, currentKey, generatedAt: s.generatedAt, baselineAt })
    const reasons = (status === 'changed' || status === 'updating') ? diffSnapshots((d?.snapshot as Snapshot | null) ?? null, s.snapshot) : []
    rows.push({ session: s, status, reasons, downloadedAt: (d?.downloaded_at as string | undefined) ?? null, currentKey, preparing: !hasFile })
  }
  return { rows, sessions, timezone, autoRedraw: look.autoRedraw, panel: look.panel, baselineAt }
}

/** Remembers what the console downloaded (the file's content + the schedule it carries in its name). The first download starts the console's baseline. */
export async function recordDownloads(link: AvLink, items: ScreenSession[]): Promise<void> {
  if (!items.length) return
  const now = new Date().toISOString()
  await supabaseAdmin.from('event_screen_link_downloads').upsert(items.map(s => ({
    link_id: link.id, session_id: s.id, version_key: keyOf(s), downloaded_at: now,
    snapshot: { ...(s.savedSnapshot ?? s.snapshot), date: s.snapshot.date, start: s.snapshot.start, end: s.snapshot.end, stage: s.snapshot.stage },   // the picture as drawn, the schedule as named
  })), { onConflict: 'link_id,session_id' })
  await supabaseAdmin.from('event_screen_links').update({ baseline_at: now }).eq('id', link.id).is('baseline_at', null)
}
