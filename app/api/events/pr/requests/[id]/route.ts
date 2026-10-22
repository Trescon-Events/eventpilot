import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { requirePrAccess } from '@/app/lib/pr/access'
import { composeMediaRequest, sendMediaRequest } from '@/app/lib/pr/media-interest'
import { mediaSetupProblem } from '@/app/lib/pr/send-access'

/* PATCH { pr_note } — PR's running note on a speaker. POST { action: 'remind' } — sends the same link again, as the speaker's producer (pending requests only). */
async function load(id: string) {
  const { data } = await supabaseAdmin.from('media_interest_requests').select('id, event_id, speaker_id, status, reminder_count').eq('id', id).maybeSingle()
  return data
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const row = await load(id); if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const auth = await requirePrAccess(req, row.event_id as string, 'manage'); if ('error' in auth) return auth.error
  const body = await req.json().catch(() => null) as { pr_note?: string } | null
  if (typeof body?.pr_note !== 'string') return NextResponse.json({ error: 'pr_note is required' }, { status: 400 })
  await supabaseAdmin.from('media_interest_requests').update({ pr_note: body.pr_note.trim().slice(0, 2000) || null }).eq('id', id)
  return NextResponse.json({ ok: true })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const row = await load(id); if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const auth = await requirePrAccess(req, row.event_id as string, 'manage'); if ('error' in auth) return auth.error
  const body = await req.json().catch(() => null) as { action?: string } | null
  if (body?.action !== 'remind') return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  if (row.status !== 'pending') return NextResponse.json({ error: 'This speaker has already answered.' }, { status: 409 })
  const problem = await mediaSetupProblem(row.event_id as string); if (problem) return NextResponse.json({ error: problem }, { status: 409 })
  const c = await composeMediaRequest(row.speaker_id as string, row.event_id as string, auth.session, { note: 'A gentle reminder: we would love to hear from you.' })
  if ('error' in c) return NextResponse.json({ error: c.error }, { status: c.status })
  const r = await sendMediaRequest(c)
  if ('error' in r) return NextResponse.json({ error: r.error }, { status: 502 })
  await supabaseAdmin.from('media_interest_requests').update({ reminder_count: (row.reminder_count as number) + 1, last_reminder_at: new Date().toISOString() }).eq('id', id)
  return NextResponse.json({ ok: true })
}
