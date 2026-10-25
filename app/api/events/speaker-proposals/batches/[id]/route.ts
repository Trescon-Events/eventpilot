import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { authBatch, resumeIfStalled } from '@/app/lib/proposals/server'
import { ownersOf, recipientSids, senderForDrop } from '@/app/lib/proposals/owners'

/* GET    → the batch, its candidates (internal findings + clean card) and the event's tracks — the review page's one data call
   PATCH  { name }
   DELETE { confirm: 'DELETE' } */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const a = await authBatch(req, id, 'view'); if ('error' in a) return a.error
  await resumeIfStalled(id).catch(() => {}) // a redeploy can kill the background workers; the page opening is what wakes them again
  const [{ data: candidates }, { data: tracks }, { data: reviewers }, { data: share }] = await Promise.all([
    supabaseAdmin.from('speaker_proposal_candidates').select('id, position, raw, input, track_id, status, research, card, review_state, producer_notes, error, researched_at, started_at, progress').eq('batch_id', id).order('position'),
    supabaseAdmin.from('speaker_proposal_tracks').select('id, name, day_label, stage, time_label, position').eq('event_id', a.batch.event_id).order('position'),
    supabaseAdmin.from('speaker_proposal_reviewers').select('id, name, email, token, notified_at, last_opened_at, reminder_count, last_reminder_at').eq('batch_id', id).order('created_at'),
    supabaseAdmin.from('speaker_proposal_batches').select('shared_at, shared_by_name, share_message').eq('id', id).single(),
  ])
  const ids = (candidates ?? []).map(c => c.id as string)
  const [{ data: decisions }, { data: comments }, { data: others }] = await Promise.all([
    supabaseAdmin.from('speaker_proposal_decisions').select('candidate_id, decision, reviewer_name, decided_at').in('candidate_id', ids),
    supabaseAdmin.from('speaker_proposal_comments').select('id, candidate_id, reviewer_name, body, created_at').in('candidate_id', ids).order('created_at'),
    supabaseAdmin.from('speaker_proposal_batches').select('id').eq('event_id', a.batch.event_id).neq('id', id).not('shared_at', 'is', null).order('shared_at', { ascending: false }).limit(1),
  ])
  const { data: prev } = others?.length ? await supabaseAdmin.from('speaker_proposal_reviewers').select('name, email').eq('batch_id', others[0].id as string).order('created_at') : { data: [] }
  const decOf = new Map((decisions ?? []).map(d => [d.candidate_id as string, d]))
  // The saved source reports can be large (they are only needed server-side for cheap re-runs): the page gets a summary of them.
  const slim = (research: unknown) => {
    const r = research as { pipeline?: { pages_read?: number; rounds?: number; reports?: { about?: string }[] } | null } | null
    return r?.pipeline ? { ...r, pipeline: { pages_read: r.pipeline.pages_read ?? 0, rounds: r.pipeline.rounds ?? 1, reports: (r.pipeline.reports ?? []).map(x => ({ about: x.about ?? 'maybe' })) } } : research
  }
  const withOutcome = (candidates ?? []).map(c => ({ ...c, research: slim(c.research), client_decision: decOf.get(c.id as string) ?? null, client_comments: (comments ?? []).filter(m => m.candidate_id === c.id) }))
  const base = process.env.NEXT_PUBLIC_SITE_URL || 'https://eventpilot.tresconglobal.com'
  const reviewerOut = (reviewers ?? []).map(r => ({ ...r, link: `${base.replace(/\/$/, '')}/public/speaker-proposals/${r.token}`, token: undefined }))
  const owners = await ownersOf(id)
  const sender = await senderForDrop(owners, a.session.sid) // who client emails go out as: the owner, else the viewer
  return NextResponse.json({ sender: { name: sender.name, email: sender.email }, owner: owners.owner, co_owners: owners.coOwners, batch: { ...a.batch, ...share }, candidates: withOutcome, tracks: tracks ?? [], reviewers: reviewerOut, previous_reviewers: prev ?? [] })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const a = await authBatch(req, id, 'edit'); if ('error' in a) return a.error
  const b = await req.json().catch(() => null) as { name?: string } | null
  if (!b?.name?.trim()) return NextResponse.json({ error: 'A name is required.' }, { status: 400 })
  await supabaseAdmin.from('speaker_proposal_batches').update({ name: b.name.trim(), updated_at: new Date().toISOString() }).eq('id', id)
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const a = await authBatch(req, id, 'edit'); if ('error' in a) return a.error
  // Deleting a whole drop is for an admin, the drop's owner or a co-owner (anyone who can edit, while nobody owns it yet).
  const o = await ownersOf(id)
  if (!a.session.adm && o.owner && !recipientSids(o).includes(a.session.sid ?? '')) return NextResponse.json({ error: 'Only the drop’s owner or a co-owner can delete it.' }, { status: 403 })
  const b = await req.json().catch(() => null) as { confirm?: string } | null
  if (b?.confirm !== 'DELETE') return NextResponse.json({ error: 'Type DELETE to confirm.' }, { status: 400 })
  await supabaseAdmin.from('speaker_proposal_batches').delete().eq('id', id)
  return NextResponse.json({ ok: true })
}
