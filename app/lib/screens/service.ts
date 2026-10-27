import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'node:crypto'
import { getSession, type TcsSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'
import { supabaseAdmin } from '@/app/lib/supabase'
import { deletePublicAssetByUrl, uploadPublicAsset } from '@/app/lib/events/storage'
import { loadScreenSessions, type ScreenSession } from './data'
import { renderScreen } from './render'

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
      }, { onConflict: 'session_id' })
      if (error) throw new Error(error.message)
      if (s.pngUrl && s.pngUrl !== url) await deletePublicAssetByUrl(s.pngUrl)
      done.push({ id: s.id, png_url: url, width, height })
    } catch (e) { failed.push({ id: s.id, error: e instanceof Error ? e.message : 'Could not generate.' }) }
  }
  for (const id of sessionIds) if (!done.some(d => d.id === id) && !failed.some(f => f.id === id)) failed.push({ id, error: 'Session has no speakers on it yet.' })
  return { done, failed }
}

/** Trimmed shape for the pages. */
export const brief = (s: ScreenSession) => ({
  id: s.id, title: s.title, topic: s.topic, hide_topic: s.hideTopic, stage: s.stage, track_id: s.trackId, date: s.date, start: s.startHM, end: s.endHM, format: s.format, status: s.status,
  layout: s.layout, fingerprint: s.fingerprint, state: s.state, png_url: s.pngUrl, generated_at: s.generatedAt, width: s.width, height: s.height, low_res: s.lowResNames, file_name: s.fileName,
  cards: s.cards.map(c => ({ speaker_id: c.speakerId, moderator: c.moderator, text: c.text, base: c.base, has_photo: !!c.photoUrl, low_res: c.lowRes })),
})

export const newToken = () => randomBytes(24).toString('hex')

/** Resolves an AV link to its event/stage, or null when it is unknown or revoked. */
export async function linkByToken(token: string) {
  if (!/^[0-9a-f]{32,128}$/i.test(token)) return null
  const { data } = await supabaseAdmin.from('event_screen_links').select('id, event_id, track_id, label, revoked_at').eq('token', token).maybeSingle()
  return data && !data.revoked_at ? data : null
}
