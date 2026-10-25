import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { authCandidate, type Previous } from '@/app/lib/proposals/server'

/* POST — puts a speaker back to how they were before the last re-run (the card and the findings). One step only: the version the re-run replaced.
   Refused while the speaker is being researched. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const a = await authCandidate(req, id, 'edit'); if ('error' in a) return a.error
  const { data: c } = await supabaseAdmin.from('speaker_proposal_candidates').select('status, research').eq('id', id).maybeSingle()
  if (!c || c.status === 'queued' || c.status === 'researching') return NextResponse.json({ error: 'Wait for the research to finish first.' }, { status: 409 })
  const prev = (c.research as { previous?: Previous | null } | null)?.previous
  if (!prev?.card) return NextResponse.json({ error: 'There is no earlier version to go back to.' }, { status: 404 })
  const { error } = await supabaseAdmin.from('speaker_proposal_candidates').update({ card: prev.card, research: prev.research ? { ...prev.research, previous: null } : null, status: 'researched', error: null, progress: null, researched_at: prev.at, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) return NextResponse.json({ error: 'Could not go back.' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
