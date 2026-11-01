import { supabaseAdmin } from '@/app/lib/supabase'
import { loadScreenSessions, type ScreenSession } from './data'
import { avStatus, diffSnapshots, removedSessions, versionKey, type AvStatus, type RemovedItem, type Snapshot } from './av-state'

/* Stage Screens — the AV console's view of its link: every session with what the console has downloaded, what has changed since and why. Shared by the page API,
   the single-file download and the zip downloads, so they can never disagree about what counts as "changed". */

export type AvLink = { id: string; event_id: string; track_id: string | null; label: string; baseline_at?: string | null }
export type AvRow = {
  session: ScreenSession; status: AvStatus; reasons: string[]; downloadedAt: string | null; currentKey: string; preparing: boolean
}

const keyOf = (s: ScreenSession) => versionKey(s.savedFingerprint ?? '', s.snapshot)

/** The rows for one link from the sessions in its scope and what it downloaded — shared by the AV page and the marketing page's per-link status. */
export function avRowsFor(sessions: ScreenSession[], got: Map<string, { version_key?: unknown; snapshot?: unknown; downloaded_at?: unknown }>, baselineAt: string | null): AvRow[] {
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
  return rows
}

/** Downloaded sessions that are no longer in the link's list (moved to another stage, or no speakers any more). */
export const removedFor = (sessions: ScreenSession[], got: Map<string, { snapshot?: unknown; downloaded_at?: unknown }>): RemovedItem[] =>
  removedSessions(new Set(sessions.filter(x => x.cards.length).map(x => x.id)), new Map([...got].map(([id, r]) => [id, { snapshot: (r.snapshot as Snapshot | null) ?? null, downloadedAt: (r.downloaded_at as string | null) ?? null }])))

export async function avView(link: AvLink): Promise<{ rows: AvRow[]; removed: RemovedItem[]; sessions: ScreenSession[]; timezone: string; autoRedraw: boolean; panel: 'light' | 'dark'; baselineAt: string | null }> {
  const [{ sessions, timezone, look }, { data: dl }, { data: fresh }] = await Promise.all([
    loadScreenSessions(link.event_id, { trackId: link.track_id }),
    supabaseAdmin.from('event_screen_link_downloads').select('session_id, version_key, snapshot, downloaded_at').eq('link_id', link.id),
    supabaseAdmin.from('event_screen_links').select('baseline_at').eq('id', link.id).maybeSingle(),
  ])
  const baselineAt = (fresh?.baseline_at as string | null) ?? link.baseline_at ?? null
  const got = new Map((dl ?? []).map(r => [r.session_id as string, r]))
  const rows = avRowsFor(sessions, got, baselineAt)
  return { rows, removed: removedFor(sessions, got), sessions, timezone, autoRedraw: look.autoRedraw, panel: look.panel, baselineAt }
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
