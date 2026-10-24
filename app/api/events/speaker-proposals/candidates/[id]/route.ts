import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { authCandidate } from '@/app/lib/proposals/server'
import { countryCode } from '@/app/lib/proposals/countries'
import { deletePublicAssetByUrl } from '@/app/lib/events/storage'
import { normalizeUrl } from '@/app/lib/proposals/research'

/* PATCH { card?, review_state?, producer_notes?, track_id? } — the producer's edits. The card is validated and trimmed here; internal findings are never touched. */
const text = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null)

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const a = await authCandidate(req, id, 'edit'); if ('error' in a) return a.error
  const b = await req.json().catch(() => null) as { card?: Record<string, unknown>; review_state?: string; producer_notes?: string | null; track_id?: string | null } | null
  if (!b) return NextResponse.json({ error: 'Bad request.' }, { status: 400 })
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (b.card) {
    const old = a.candidate.card as Record<string, unknown>, c = b.card
    const videos = Array.isArray(c.videos) ? c.videos.filter((v): v is Record<string, unknown> => !!v && typeof v === 'object' && /^https?:\/\//i.test(String((v as Record<string, unknown>).url ?? ''))).slice(0, 3).map(v => ({ url: String(v.url), title: text(v.title, 200) ?? String(v.url), channel: text(v.channel, 100), date: text(v.date, 40), duration: text(v.duration, 20), thumbnail: text(v.thumbnail, 500), checked: v.checked === 'watched' || v.checked === 'named' ? v.checked : null, evidence: text(v.evidence, 400) })) : old.videos
    const iso = c.nationality_iso2 === null || c.nationality_iso2 === '' ? null : countryCode(String(c.nationality_iso2 ?? '')) ?? old.nationality_iso2
    const li = c.linkedin_url === undefined ? old.linkedin_url : text(c.linkedin_url, 300)
    patch.card = {
      name: text(c.name, 120) ?? old.name, title: c.title === undefined ? old.title : text(c.title, 200), organization: c.organization === undefined ? old.organization : text(c.organization, 160),
      nationality_iso2: c.nationality_iso2 === undefined ? old.nationality_iso2 : iso, linkedin_url: li && /^https?:\/\//i.test(li as string) ? li : null,
      bio: c.bio === undefined ? old.bio : text(c.bio, 1500), videos, photo_url: c.photo_url === undefined ? old.photo_url : text(c.photo_url, 600), logo_url: c.logo_url === undefined ? old.logo_url : text(c.logo_url, 600),
      website_url: c.website_url === undefined ? old.website_url ?? null : normalizeUrl(typeof c.website_url === 'string' ? c.website_url : null),
    }
    // A removed photo or logo is also deleted from storage (only our own copies are ever touched).
    const next = patch.card as Record<string, unknown>
    for (const k of ['photo_url', 'logo_url'] as const) if (old[k] && next[k] !== old[k]) await deletePublicAssetByUrl(old[k] as string).catch(() => {})
  }
  if (b.review_state !== undefined) { if (!['pending', 'ready', 'excluded'].includes(b.review_state)) return NextResponse.json({ error: 'Bad state.' }, { status: 400 }); patch.review_state = b.review_state }
  if (b.producer_notes !== undefined) patch.producer_notes = text(b.producer_notes, 2000)
  if (b.track_id !== undefined) patch.track_id = b.track_id || null
  const { error } = await supabaseAdmin.from('speaker_proposal_candidates').update(patch).eq('id', id)
  if (error) return NextResponse.json({ error: 'Could not save.' }, { status: 500 })
  return NextResponse.json({ ok: true })
}

/** Removes a speaker from the drop (e.g. one added by mistake). Their stored photo/logo go too. */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const a = await authCandidate(req, id, 'edit'); if ('error' in a) return a.error
  const card = a.candidate.card as Record<string, unknown>
  await deletePublicAssetByUrl(card.photo_url as string | null).catch(() => {}); await deletePublicAssetByUrl(card.logo_url as string | null).catch(() => {})
  await supabaseAdmin.from('speaker_proposal_candidates').delete().eq('id', id)
  return NextResponse.json({ ok: true })
}
