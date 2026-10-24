import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession, type TcsSession } from '@/app/lib/access/session'
import { hasEventPermission, isEventFeatureEnabled } from '@/app/lib/access/event-access'
import { uploadPublicAsset } from '@/app/lib/events/storage'
import { cleanLogoFromUrl, normalizeUrl, researchCandidate, type CardVideo, type ProposalInput, type ResearchResult } from './research'
import { countryCode } from './countries'

/* Speaker Proposals — server side. Research runs in the background on the Node server (the HTTP call returns at once, the browser polls), at most 3 candidates at a time.
   Two shapes are stored per candidate and kept apart on purpose:
     research — INTERNAL: findings, concerns, sources, how the checks agreed, candidate photos/logos. Producers only.
     card     — CLEAN: exactly what the client sees. No notes, no warnings. */

export type Card = {
  name: string; title: string | null; organization: string | null; nationality_iso2: string | null
  linkedin_url: string | null; bio: string | null; videos: CardVideo[]; photo_url: string | null; logo_url: string | null; website_url: string | null
}
export type Internal = ResearchResult & { footprint_note: string | null }

export async function requireProposalAccess(req: NextRequest, eventId: string, level: 'view' | 'edit'): Promise<{ session: TcsSession } | { error: NextResponse }> {
  const session = getSession(req)
  if (!session) return { error: NextResponse.json({ error: 'Not signed in.' }, { status: 401 }) }
  if (!session.adm && !(await hasEventPermission(session.sid, eventId, level === 'edit' ? 'sae.stakeholders.edit' : 'sae.stakeholders.view'))) return { error: NextResponse.json({ error: 'Not authorized.' }, { status: 403 }) }
  if (!(await isEventFeatureEnabled(eventId, 'speaker-proposals'))) return { error: NextResponse.json({ error: 'Speaker Proposals isn’t switched on for this event.' }, { status: 403 }) }
  return { session }
}

const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' }

/** Downloads a public image and stores our own copy (so the client page never depends on someone else's server). */
export async function rehostPhoto(eventId: string, candidateId: string, url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20_000), headers: { 'User-Agent': 'Mozilla/5.0 (compatible; EventPilot photo fetch)' } })
    if (!res.ok) return null
    const type = (res.headers.get('content-type') ?? '').split(';')[0]
    if (!EXT[type]) return null
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.length < 5_000 || buf.length > 10 * 1024 * 1024) return null
    return await uploadPublicAsset(`events/${eventId}/proposals/${candidateId}/photo-${Date.now()}.${EXT[type]}`, buf, type)
  } catch { return null }
}

export async function storeLogo(eventId: string, candidateId: string, png: Buffer): Promise<string> {
  return uploadPublicAsset(`events/${eventId}/proposals/${candidateId}/logo-${Date.now()}.png`, png, 'image/png')
}

/** Why the card is thin, in one plain sentence for the producer — never shown to the client. */
function footprintNote(r: ResearchResult): string | null {
  if (r.status === 'not_found') return 'No public footprint found: searches returned no page matching this name with this role and organisation, so the card shows the sheet’s details only. A producer should supply or confirm them.'
  if (!r.bio) return 'Little public information: the pages found did not support a bio, so the card has no bio. Confirm the person and add a bio if the client needs one.'
  return null
}

/** The card a speaker starts with, before any research: just what the producer typed (or the sheet said). */
export function initialCard(input: ProposalInput): Card {
  return { name: input.name, title: input.designation, organization: input.company, nationality_iso2: countryCode(input.country), linkedin_url: input.linkedin && /linkedin\.com\/in\//i.test(input.linkedin) ? input.linkedin : null, bio: null, videos: [], photo_url: null, logo_url: null, website_url: normalizeUrl(input.website) }
}

export function buildCard(input: ProposalInput, r: ResearchResult): Card {
  return {
    name: (r.identified && r.full_name) || input.name,
    title: (r.identified && r.title) || input.designation,
    organization: (r.identified && r.organization) || input.company,
    nationality_iso2: r.nationality_iso2 || countryCode(input.country),
    linkedin_url: r.linkedin_url ?? (input.linkedin && /linkedin\.com\/in\//i.test(input.linkedin) ? input.linkedin : null),
    bio: r.bio, videos: r.videos, photo_url: null, logo_url: null,
    website_url: normalizeUrl(input.website) ?? normalizeUrl(r.org_website),
  }
}

async function processCandidate(candidateId: string): Promise<void> {
  const { data: c } = await supabaseAdmin.from('speaker_proposal_candidates').select('id, event_id, input').eq('id', candidateId).maybeSingle()
  if (!c) return
  const input = c.input as ProposalInput
  try {
    const r = await researchCandidate(input)
    const card = buildCard(input, r)
    // Logo: first candidate that downloads and cleans to something visible, through the platform's logo engine (600×300, white).
    for (const l of r.logo_candidates.slice(0, 4)) {
      const png = await cleanLogoFromUrl(l.url)
      if (png) { card.logo_url = await storeLogo(c.event_id as string, candidateId, png); break }
    }
    // Photo: our own copy of the first candidate; the producer confirms or swaps it.
    for (const p of r.photo_candidates.slice(0, 3)) { const u = await rehostPhoto(c.event_id as string, candidateId, p.url); if (u) { card.photo_url = u; break } }
    const internal: Internal = { ...r, footprint_note: footprintNote(r) }
    await supabaseAdmin.from('speaker_proposal_candidates').update({ status: 'researched', research: internal, card, error: null, researched_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', candidateId)
  } catch (e) {
    console.error('[proposals] research failed for', candidateId, e instanceof Error ? e.message : e)
    await supabaseAdmin.from('speaker_proposal_candidates').update({ status: 'error', error: e instanceof Error ? e.message.slice(0, 300) : 'Research failed', updated_at: new Date().toISOString() }).eq('id', candidateId)
  }
}

const running = new Set<string>()
const STUCK_MS = 10 * 60 * 1000
const WORKERS = 3

/** Queues the given candidates (or everything not yet researched) and works through them in the background. Safe to call twice: one worker group per batch. */
export async function startResearch(batchId: string, candidateIds?: string[]): Promise<{ queued: number }> {
  await supabaseAdmin.from('speaker_proposal_candidates').update({ status: 'queued', started_at: null }).eq('batch_id', batchId).eq('status', 'researching').lt('started_at', new Date(Date.now() - STUCK_MS).toISOString())
  let q = supabaseAdmin.from('speaker_proposal_candidates').update({ status: 'queued', error: null, updated_at: new Date().toISOString() }, { count: 'exact' }).eq('batch_id', batchId).neq('status', 'researching')
  q = candidateIds?.length ? q.in('id', candidateIds) : q.in('status', ['new', 'queued', 'error'])
  const { count } = await q
  if (!running.has(batchId)) {
    running.add(batchId)
    void (async () => {
      try {
        await Promise.all(Array.from({ length: WORKERS }, async () => {
          for (;;) {
            const { data: next } = await supabaseAdmin.from('speaker_proposal_candidates').select('id').eq('batch_id', batchId).eq('status', 'queued').order('position').limit(1).maybeSingle()
            if (!next) return
            const { data: claimed } = await supabaseAdmin.from('speaker_proposal_candidates').update({ status: 'researching', started_at: new Date().toISOString() }).eq('id', next.id).eq('status', 'queued').select('id').maybeSingle()
            if (claimed) await processCandidate(next.id as string)
          }
        }))
      } finally { running.delete(batchId) }
    })()
  }
  return { queued: count ?? 0 }
}

type BatchRow = { id: string; event_id: string; name: string; source_filename: string | null; status: string; created_at: string }
export async function authBatch(req: NextRequest, batchId: string, level: 'view' | 'edit'): Promise<{ batch: BatchRow; session: TcsSession } | { error: NextResponse }> {
  const { data: batch } = await supabaseAdmin.from('speaker_proposal_batches').select('id, event_id, name, source_filename, status, created_at').eq('id', batchId).maybeSingle()
  if (!batch) return { error: NextResponse.json({ error: 'Batch not found.' }, { status: 404 }) }
  const a = await requireProposalAccess(req, batch.event_id as string, level)
  return 'error' in a ? a : { batch: batch as BatchRow, session: a.session }
}
export async function authCandidate(req: NextRequest, candidateId: string, level: 'view' | 'edit') {
  const { data: c } = await supabaseAdmin.from('speaker_proposal_candidates').select('id, batch_id, event_id, input, card, research').eq('id', candidateId).maybeSingle()
  if (!c) return { error: NextResponse.json({ error: 'Not found.' }, { status: 404 }) } as const
  const a = await requireProposalAccess(req, c.event_id as string, level)
  return 'error' in a ? a : { candidate: c, session: a.session }
}
