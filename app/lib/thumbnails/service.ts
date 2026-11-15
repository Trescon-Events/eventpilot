import { zipSync } from 'fflate'
import { supabaseAdmin } from '@/app/lib/supabase'
import { deletePublicAssetByUrl, uploadPublicAsset } from '@/app/lib/events/storage'
import { loadSetup, loadThumbnailSessions, LAYOUTS, type ThumbSession } from './data'
import { renderThumbnail } from './render'
import { cleanOverrides, type CardTextMode, type ThumbLayout, type ThumbOverrides } from './geometry'

/* Session thumbnails — generation, overrides, settings, approval and the ZIP. Every change is audited (session_thumbnail_changes). Access is checked by the routes (requireScreens). */

export class ThumbError extends Error { constructor(message: string, public status = 400) { super(message) } }
const actor = (by: string | null) => (by && /^[0-9a-f-]{36}$/i.test(by) ? by : null)

async function audit(e: { event_id: string; session_id?: string | null; action: string; before?: unknown; after?: unknown; by: string | null }) {
  await supabaseAdmin.from('session_thumbnail_changes').insert({ event_id: e.event_id, agenda_session_id: e.session_id ?? null, action: e.action, before: e.before ?? null, after: e.after ?? null, changed_by: actor(e.by) })
}

async function sessionOf(eventId: string, sessionId: string): Promise<ThumbSession> {
  const { sessions } = await loadThumbnailSessions(eventId, { sessionIds: [sessionId] })
  const s = sessions[0]
  if (!s) throw new ThumbError('That session has no speakers on the agenda, or is not in this event.', 404)
  return s
}

export async function saveSettings(eventId: string, body: { card_variant_id?: unknown; layout_variant_ids?: unknown; card_text?: unknown }, by: string | null) {
  const { setup } = { setup: await loadSetup(eventId) }
  const before = setup.settings
  const known = new Map(setup.variants.map(v => [v.id, v]))
  const cardId = typeof body.card_variant_id === 'string' && body.card_variant_id ? body.card_variant_id : null
  if (cardId && known.get(cardId)?.category !== 'thumbnail_card') throw new ThumbError('That is not a thumbnail card template.')
  const layouts: Partial<Record<ThumbLayout, string>> = {}
  const raw = (body.layout_variant_ids && typeof body.layout_variant_ids === 'object' ? body.layout_variant_ids : {}) as Record<string, unknown>
  for (const k of LAYOUTS) {
    const id = raw[k]
    if (typeof id !== 'string' || !id) continue
    const v = known.get(id)
    if (v?.category !== 'thumbnail_layout') throw new ThumbError(`That is not a thumbnail layout template (${k}).`)
    layouts[k] = id
  }
  const cardText: CardTextMode = body.card_text === 'name_company' ? 'name_company' : 'name'
  const { error } = await supabaseAdmin.from('event_thumbnail_settings').upsert({ event_id: eventId, card_variant_id: cardId, layout_variant_ids: layouts, card_text: cardText, updated_by: actor(by), updated_at: new Date().toISOString() }, { onConflict: 'event_id' })
  if (error) throw new ThumbError(error.message, 500)
  await audit({ event_id: eventId, action: 'settings', before, after: { cardVariantId: cardId, layoutVariantIds: layouts, cardText }, by })
}

export async function saveOverrides(eventId: string, sessionId: string, raw: unknown, by: string | null): Promise<ThumbOverrides> {
  const s = await sessionOf(eventId, sessionId)
  const next = cleanOverrides(raw)
  const valid = new Set(s.candidates.map(c => c.speakerId))
  next.exclude = (next.exclude ?? []).filter(id => valid.has(id)); if (!next.exclude.length) delete next.exclude
  next.order = (next.order ?? []).filter(id => valid.has(id)); if (!next.order.length) delete next.order
  const { error } = await supabaseAdmin.from('session_thumbnails').upsert({ event_id: eventId, agenda_session_id: sessionId, overrides: next, updated_at: new Date().toISOString() }, { onConflict: 'agenda_session_id' })
  if (error) throw new ThumbError(error.message, 500)
  await audit({ event_id: eventId, session_id: sessionId, action: 'overrides', before: s.overrides, after: next, by })
  return next
}

/** Draws and stores the PNG and JPG for each session. Sessions that need attention are not drawn (the reason is returned). Regenerating clears the approval. */
export async function generateThumbnails(eventId: string, sessionIds: string[], by: string | null): Promise<{ done: { id: string }[]; failed: { id: string; error: string }[] }> {
  const { setup, sessions } = await loadThumbnailSessions(eventId, { sessionIds })
  const done: { id: string }[] = [], failed: { id: string; error: string }[] = []
  if (setup.missing.length) return { done, failed: sessionIds.map(id => ({ id, error: `Set up the templates first: ${setup.missing.join('; ')}` })) }
  for (const s of sessions) {
    try {
      const block = s.issues.find(i => i.level === 'attention')
      if (block) throw new Error(block.text)
      const { png, jpg, width, height } = await renderThumbnail(s, setup)
      const stamp = `${s.fingerprint}-${Date.now()}`
      const [pngUrl, jpgUrl] = await Promise.all([
        uploadPublicAsset(`events/${eventId}/thumbnails/${s.id}/${stamp}.png`, png, 'image/png'),
        uploadPublicAsset(`events/${eventId}/thumbnails/${s.id}/${stamp}.jpg`, jpg, 'image/jpeg'),
      ])
      const { error } = await supabaseAdmin.from('session_thumbnails').upsert({
        event_id: eventId, agenda_session_id: s.id, fingerprint: s.fingerprint, image_png_path: pngUrl, image_jpg_path: jpgUrl, width, height, status: 'generated', warnings: s.issues,
        generated_by: actor(by), generated_at: new Date().toISOString(), approved_by: null, approved_at: null, updated_at: new Date().toISOString(),
      }, { onConflict: 'agenda_session_id' })
      if (error) throw new Error(error.message)
      if (s.pngUrl && s.pngUrl !== pngUrl) await deletePublicAssetByUrl(s.pngUrl)
      if (s.jpgUrl && s.jpgUrl !== jpgUrl) await deletePublicAssetByUrl(s.jpgUrl)
      await audit({ event_id: eventId, session_id: s.id, action: 'generate', before: { fingerprint: s.state === 'new' ? null : undefined }, after: { fingerprint: s.fingerprint }, by })
      done.push({ id: s.id })
    } catch (e) { failed.push({ id: s.id, error: e instanceof Error ? e.message : 'Could not generate.' }) }
  }
  for (const id of sessionIds) if (!done.some(d => d.id === id) && !failed.some(f => f.id === id)) failed.push({ id, error: 'Session has no speakers on it yet.' })
  return { done, failed }
}

/** Approve what is on screen now: only an up-to-date thumbnail, with no rule errors. */
export async function approveThumbnail(eventId: string, sessionId: string, by: string | null) {
  const s = await sessionOf(eventId, sessionId)
  if (s.state === 'approved') return
  if (s.state !== 'ready') throw new ThumbError(s.state === 'changed' ? 'This thumbnail is out of date: generate it again first.' : s.state === 'needs_attention' ? 'This thumbnail needs attention first.' : 'Generate the thumbnail first.')
  const err = s.issues.find(i => i.level === 'error')
  if (err) throw new ThumbError(`Rule error: ${err.text}`)
  const { error } = await supabaseAdmin.from('session_thumbnails').update({ status: 'approved', approved_by: actor(by), approved_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('agenda_session_id', sessionId)
  if (error) throw new ThumbError(error.message, 500)
  await audit({ event_id: eventId, session_id: sessionId, action: 'approve', before: { status: 'generated' }, after: { status: 'approved', fingerprint: s.fingerprint }, by })
}

export async function unapproveThumbnail(eventId: string, sessionId: string, by: string | null) {
  const s = await sessionOf(eventId, sessionId)
  if (s.thumbId === null || s.approvedAt === null) return
  const { error } = await supabaseAdmin.from('session_thumbnails').update({ status: 'generated', approved_by: null, approved_at: null, updated_at: new Date().toISOString() }).eq('agenda_session_id', sessionId)
  if (error) throw new ThumbError(error.message, 500)
  await audit({ event_id: eventId, session_id: sessionId, action: 'unapprove', before: { status: 'approved' }, after: { status: 'generated' }, by })
}

async function fetchBuf(url: string): Promise<Buffer | null> {
  try { const r = await fetch(url, { signal: AbortSignal.timeout(25_000) }); return r.ok ? Buffer.from(await r.arrayBuffer()) : null } catch { return null }
}

/** Approved thumbnails only (an approved one that has since changed is "changed" and is left out). */
export async function zipApproved(eventId: string): Promise<{ buffer: Buffer; count: number }> {
  const { sessions } = await loadThumbnailSessions(eventId)
  const approved = sessions.filter(s => s.state === 'approved' && s.pngUrl && s.jpgUrl)
  const files: Record<string, Uint8Array> = {}
  for (const s of approved) {
    const [png, jpg] = await Promise.all([fetchBuf(s.pngUrl!), fetchBuf(s.jpgUrl!)])
    if (jpg) files[`youtube-1280x720-jpg/${s.fileBase}.jpg`] = new Uint8Array(jpg)
    if (png) files[`design-1920x1080-png/${s.fileBase}.png`] = new Uint8Array(png)
  }
  return { buffer: Buffer.from(zipSync(files, { level: 0 })), count: approved.length }
}

export async function fileFor(eventId: string, sessionId: string, format: 'png' | 'jpg'): Promise<{ buffer: Buffer; name: string; type: string }> {
  const s = await sessionOf(eventId, sessionId)
  const url = format === 'png' ? s.pngUrl : s.jpgUrl
  if (!url) throw new ThumbError('Not generated yet.', 404)
  const buffer = await fetchBuf(url)
  if (!buffer) throw new ThumbError('Could not read the file.', 502)
  return { buffer, name: `${s.fileBase}.${format}`, type: format === 'png' ? 'image/png' : 'image/jpeg' }
}
