/**
 * POST /api/admin/dev-approvals/[prNumber]/reject
 * Body: { note: string } — required, becomes the GitHub "Request changes"
 * review body and the note in Khalifa's email. Leaves the PR open — he
 * pushes a fix and it flows back through the same review automatically.
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { requireDevApprovalsAccess } from '@/app/lib/github/dev-approvals-access'
import { requestChanges } from '@/app/lib/github/api'
import { sendPrDecisionAlert } from '@/app/lib/email'
import { generateAgentInstructions } from '@/app/lib/github/agent-instructions'

export const runtime = 'nodejs'
export const maxDuration = 30

const KHALIFA_EMAIL = 'khalifa@tresconglobal.com'

export async function POST(req: NextRequest, { params }: { params: Promise<{ prNumber: string }> }) {
  const access = await requireDevApprovalsAccess(req)
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })

  const prNumber = Number((await params).prNumber)
  if (!Number.isFinite(prNumber)) return NextResponse.json({ error: 'Invalid PR number' }, { status: 400 })

  const body = await req.json().catch(() => null)
  const note = typeof body?.note === 'string' ? body.note.trim() : ''
  if (!note) return NextResponse.json({ error: 'A note explaining what needs to change is required' }, { status: 400 })

  const { data: row } = await supabaseAdmin.from('github_pr_reviews').select('*').eq('pr_number', prNumber).maybeSingle()
  if (!row) return NextResponse.json({ error: 'Unknown PR — no webhook record for it yet' }, { status: 404 })

  const agentInstructions = await generateAgentInstructions({
    prTitle: row.pr_title,
    note,
    areasTouched: row.areas_touched ?? [],
    filesChanged: row.files_changed ?? [],
  })

  try {
    await requestChanges(prNumber, note)
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: `GitHub request-changes failed: ${err instanceof Error ? err.message : String(err)}` }, { status: 502 })
  }

  await supabaseAdmin.from('github_pr_reviews').update({
    status: 'sent_back',
    decided_by: access.staffId,
    decided_at: new Date().toISOString(),
    decision_note: note,
    agent_instructions: agentInstructions,
    merge_error: null,
    updated_at: new Date().toISOString(),
  }).eq('pr_number', prNumber)

  try {
    await sendPrDecisionAlert({ to: KHALIFA_EMAIL, prNumber, prTitle: row.pr_title, decision: 'sent_back', note, agentInstructions, prUrl: row.pr_url })
  } catch (err) {
    console.error('sendPrDecisionAlert (sent_back) failed, non-fatal:', err)
  }

  return NextResponse.json({ ok: true })
}
