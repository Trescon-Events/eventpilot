import { supabaseAdmin } from '@/app/lib/supabase'
import { uploadPublicAsset } from '@/app/lib/events/storage'
import { loadLowerThirdSetup, lowerThirdFingerprint } from './data'
import { drawLowerThirdStill } from './render'

/* Lower-thirds service: generate the still PNG (web app) and enqueue the MOV job (worker). */

const actor = (by: string | null) => (by && /^[0-9a-f-]{36}$/i.test(by) ? by : null)

export async function generateLowerThirdStill(eventId: string, sessionId: string, speakerId: string, by: string | null): Promise<{ stillUrl: string }> {
  const { variant, missing, cardAnim } = await loadLowerThirdSetup(eventId)
  if (missing.length) throw new Error(`Set up the lower-third template first: ${missing.join('; ')}`)
  if (!variant) throw new Error('No lower-third template configured.')
  // Load speaker data
  const { data: p } = await supabaseAdmin.from('event_speakers').select('name, public_name, role, company, photo_processed_url, photo_head_box').eq('id', speakerId).eq('event_id', eventId).single()
  if (!p) throw new Error('Speaker not found.')
  const name = (typeof p.public_name === 'string' && p.public_name.trim()) || (typeof p.name === 'string' && p.name.trim()) || ''
  const title = typeof p.role === 'string' ? p.role.trim() : ''
  const company = typeof p.company === 'string' ? p.company.trim() : ''
  const photoUrl = (p.photo_processed_url as string | null) ?? null
  const headBox = (p.photo_head_box as unknown) ?? null
  const fp = lowerThirdFingerprint({ name, title, company, photo: photoUrl, variant, anim: cardAnim })
  const still = await drawLowerThirdStill(variant, { speakerId, name, title, company, photoUrl, headBox: headBox as never, stillUrl: null, movUrl: null, previewUrl: null, status: 'draft', fingerprint: null })
  const stillUrl = await uploadPublicAsset(`events/${eventId}/lower-thirds/${sessionId}/${speakerId}/still.png`, still, 'image/png')
  await supabaseAdmin.from('session_lower_thirds').upsert({
    event_id: eventId, agenda_session_id: sessionId, speaker_id: speakerId,
    variant_id: variant.id, fingerprint: fp, still_path: stillUrl,
    status: 'draft', updated_at: new Date().toISOString(),
  }, { onConflict: 'agenda_session_id,speaker_id' })
  return { stillUrl }
}

export async function enqueueLowerThirdJob(eventId: string, sessionId: string, speakerId: string, by: string | null): Promise<void> {
  const { variant, missing } = await loadLowerThirdSetup(eventId)
  if (missing.length) throw new Error(`Set up the lower-third template first: ${missing.join('; ')}`)
  if (!variant) throw new Error('No lower-third template configured.')
  await supabaseAdmin.from('session_lower_thirds').upsert({
    event_id: eventId, agenda_session_id: sessionId, speaker_id: speakerId,
    variant_id: variant.id, status: 'generating', updated_at: new Date().toISOString(),
  }, { onConflict: 'agenda_session_id,speaker_id' })
  await supabaseAdmin.from('creative_render_jobs').insert({
    event_id: eventId, agenda_session_id: sessionId, speaker_id: speakerId,
    kind: 'lower_third', status: 'pending', attempts: 0,
    params: { variant_id: variant.id }, created_by: actor(by), created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  })
}
