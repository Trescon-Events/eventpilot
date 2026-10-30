import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'node:crypto'
import { getSession, type TcsSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'
import { supabaseAdmin } from '@/app/lib/supabase'
import { deletePublicAssetByUrl, uploadPublicAsset } from '@/app/lib/events/storage'
import { loadScreenSessions, type ScreenSession } from './data'
import { renderScreen } from './render'
import { diffSnapshots, quietEnough } from './av-state'

/* Stage Screens — access, generation and the AV links. Producers (Stakeholder Hub view/edit) manage the graphics; the AV team only ever holds a private link. */

export async function requireScreens(req: NextRequest, eventId: string, level: 'view' | 'edit' | 'look'): Promise<{ session: TcsSession } | { error: NextResponse }> {
  const session = getSession(req)
  if (!session) return { error: NextResponse.json({ error: 'Not signed in.' }, { status: 401 }) }
  const has = (key: string) => hasEventPermission(session.sid, eventId, key)
  // 'look' = defining how the graphic looks (Admin Console › Stage Speaker Pic); 'edit' = running the screens (generate, edit a session's text, AV links); 'view' = seeing them.
  // The older Hub keys still work, and anyone who can change the look can also see the screens.
  const allowed = session.adm || (level === 'look'
    ? (await has('sae.admin.access')) || (await has('sae.admin.stage_screens'))
    : level === 'edit'
      ? (await has('sae.screens.manage')) || (await has('sae.stakeholders.edit'))
      : (await has('sae.screens.view')) || (await has('sae.screens.manage')) || (await has('sae.stakeholders.view')) || (await has('sae.admin.access')) || (await has('sae.admin.stage_screens')))
  if (!allowed) return { error: NextResponse.json({ error: 'Not authorized.' }, { status: 403 }) }
  return { session }
}

export const MAX_PER_CALL = 4

/** Draws and stores the PNG for each session. The file lives at a fresh address every time (so nobody ever sees a cached old one); the previous file is removed. */
export async function generateScreens(eventId: string, sessionIds: string[], by: string): Promise<{ done: { id: string; png_url: string; width: number; height: number }[]; failed: { id: string; error: string }[] }> {
  const { sessions, look } = await loadScreenSessions(eventId, { sessionIds })
  const done: { id: string; png_url: string; width: number; height: number }[] = [], failed: { id: string; error: string }[] = []
  for (const s of sessions) {
    try {
      const { buffer, width, height } = await renderScreen(s, look)
      const url = await uploadPublicAsset(`events/${eventId}/screens/${s.id}/${s.fingerprint}-${Date.now()}.png`, buffer, 'image/png')
      const { error } = await supabaseAdmin.from('event_screen_sessions').upsert({
        session_id: s.id, event_id: eventId, png_url: url, fingerprint: s.fingerprint, layout: s.layout, width, height,
        low_res: s.lowResNames, generated_at: new Date().toISOString(), generated_by: by,
        snapshot: s.snapshot, stale_fingerprint: null, stale_changed_at: null, redrawing_until: null,
      }, { onConflict: 'session_id' })
      if (error) throw new Error(error.message)
      if (s.pngUrl && s.pngUrl !== url) await deletePublicAssetByUrl(s.pngUrl)
      done.push({ id: s.id, png_url: url, width, height })
    } catch (e) { failed.push({ id: s.id, error: e instanceof Error ? e.message : 'Could not generate.' }) }
  }
  for (const id of sessionIds) if (!done.some(d => d.id === id) && !failed.some(f => f.id === id)) failed.push({ id, error: 'Session has no speakers on it yet.' })
  return { done, failed }
}

const QUIET_MS = 60_000      // a screen is redrawn once its content has been still this long, so half-finished edits do not alert the AV desk
const LOCK_MS = 120_000      // one page draws a given screen at a time
const PER_ROUND = 4

/** Sessions on stage or about to be, soonest first; ones already over go last. */
function byUrgency<T extends { startsAt: string | null; endsAt: string | null; date: string; startHM: string }>(list: T[], now = Date.now()): T[] {
  const over = (x: T) => !!x.endsAt && new Date(x.endsAt).getTime() < now
  return [...list].sort((a, b) => Number(over(a)) - Number(over(b)) || (a.date + a.startHM).localeCompare(b.date + b.startHM))
}

/** Redraws changed / new screens. Marks the moment a change is first noticed (the quiet time counts from there) and, once quiet — or at once with `force` — draws up to
    PER_ROUND of the most urgent, claiming each first so two open pages never draw the same one. Returns how many are still waiting. */
export async function redrawStale(eventId: string, scope: { sessions: ScreenSession[] }, opts: { force?: boolean; by: string; onlyIds?: string[] }): Promise<{ drawn: number; waiting: number }> {
  const now = Date.now()
  const stale = scope.sessions.filter(s => s.state !== 'ready' && (!opts.onlyIds || opts.onlyIds.includes(s.id)))
  if (!stale.length) return { drawn: 0, waiting: 0 }
  // note the change (no-op when already noted at this content)
  const unnoted = stale.filter(s => s.staleFingerprint !== s.fingerprint)
  if (unnoted.length) {
    await supabaseAdmin.from('event_screen_sessions').upsert(unnoted.map(s => ({ session_id: s.id, event_id: eventId, stale_fingerprint: s.fingerprint, stale_changed_at: new Date(now).toISOString() })), { onConflict: 'session_id' })
    for (const s of unnoted) { s.staleFingerprint = s.fingerprint; s.staleChangedAt = new Date(now).toISOString() }
  }
  const ready = byUrgency(stale.filter(s => (opts.force || quietEnough(s.staleChangedAt, now, QUIET_MS)) && !(s.redrawingUntil && new Date(s.redrawingUntil).getTime() > now)), now).slice(0, PER_ROUND)
  if (!ready.length) return { drawn: 0, waiting: stale.length }
  // atomic claim: only rows nobody else holds
  const { data: claimed } = await supabaseAdmin.from('event_screen_sessions')
    .update({ redrawing_until: new Date(now + LOCK_MS).toISOString() })
    .in('session_id', ready.map(s => s.id)).or(`redrawing_until.is.null,redrawing_until.lt.${new Date(now).toISOString()}`).select('session_id')
  const ids = (claimed ?? []).map(r => r.session_id as string)
  if (!ids.length) return { drawn: 0, waiting: stale.length }
  const r = await generateScreens(eventId, ids, opts.by)
  const drawn = r.done.length
  const failedIds = r.failed.map(f => f.id)
  if (failedIds.length) await supabaseAdmin.from('event_screen_sessions').update({ redrawing_until: null }).in('session_id', failedIds)
  return { drawn, waiting: Math.max(0, stale.length - drawn) }
}

/** What changed since the file was drawn, in words (for the marketing page). */
export const reasonsFor = (s: ScreenSession): string[] => (s.state === 'changed' ? diffSnapshots(s.savedSnapshot, s.snapshot) : [])

/** Trimmed shape for the pages. */
export const brief = (s: ScreenSession) => ({
  id: s.id, title: s.title, topic: s.topic, hide_topic: s.hideTopic, stage: s.stage, track_id: s.trackId, date: s.date, start: s.startHM, end: s.endHM, format: s.format, status: s.status,
  layout: s.layout, fingerprint: s.fingerprint, state: s.state, png_url: s.pngUrl, generated_at: s.generatedAt, width: s.width, height: s.height, low_res: s.lowResNames, file_name: s.fileName,
  cards: s.cards.map(c => ({ speaker_id: c.speakerId, moderator: c.moderator, text: c.text, base: c.base, has_photo: !!c.photoUrl, low_res: c.lowRes })),
  reasons: reasonsFor(s), starts_at: s.startsAt, ends_at: s.endsAt,
})

export const newToken = () => randomBytes(24).toString('hex')

/** Resolves a private link to its event/stage, or null when it is unknown, revoked or of another kind. A link is for the stage graphics ('stage', the default) or for the Table Screens ('tables'). */
export async function linkByToken(token: string, kind: 'stage' | 'tables' = 'stage') {
  if (!/^[0-9a-f]{32,128}$/i.test(token)) return null
  const { data } = await supabaseAdmin.from('event_screen_links').select('*').eq('token', token).maybeSingle()   // '*': also works before the kind column exists
  if (!data || data.revoked_at || ((data.kind as string | undefined) ?? 'stage') !== kind) return null
  return { id: data.id as string, event_id: data.event_id as string, track_id: data.track_id as string | null, label: data.label as string, revoked_at: null, baseline_at: (data.baseline_at as string | null) ?? null, kind }
}
