import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { authCandidate, startResearch } from '@/app/lib/proposals/server'

/* POST { input?, full? } — researches this one speaker again (optionally with corrected name / designation / organisation / country / LinkedIn). Replaces the card, so the page asks first. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const a = await authCandidate(req, id, 'edit'); if ('error' in a) return a.error
  const b = await req.json().catch(() => ({})) as { input?: Record<string, unknown>; full?: boolean }
  // Normally a re-run re-uses the saved source reports (cheap: no new searching) and only re-reads new links + re-checks. `full` starts over.
  if (b.full) { const { data: cur } = await supabaseAdmin.from('speaker_proposal_candidates').select('research').eq('id', id).maybeSingle(); if (cur?.research) await supabaseAdmin.from('speaker_proposal_candidates').update({ research: { ...(cur.research as Record<string, unknown>), pipeline: null } }).eq('id', id) }
  if (b.input) {
    const old = a.candidate.input as Record<string, unknown>, s = (v: unknown) => (typeof v === 'string' ? v.trim().slice(0, 200) : '')
    const next = { ...old, name: s(b.input.name) || old.name, designation: s(b.input.designation) || null, company: s(b.input.company) || null, country: s(b.input.country) || null, linkedin: s(b.input.linkedin) || null, website: s(b.input.website) || null, extra: typeof b.input.extra === 'string' ? b.input.extra.trim().slice(0, 12000) || null : null }
    await supabaseAdmin.from('speaker_proposal_candidates').update({ input: next }).eq('id', id)
  }
  return NextResponse.json(await startResearch(a.candidate.batch_id as string, [id]))
}
