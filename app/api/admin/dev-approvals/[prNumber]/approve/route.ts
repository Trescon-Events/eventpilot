/**
 * POST /api/admin/dev-approvals/[prNumber]/approve
 *
 * One-click "Approve & Ship": submits an approving review on GitHub (acting
 * as Madhu, via GITHUB_APPROVER_TOKEN — never Khalifa's own token, GitHub
 * blocks self-approval anyway), merges the PR, and emails Khalifa that it's
 * live. Refuses if CI isn't green — never approves something red.
 *
 * If the branch is behind main (the same "merge conflict" surprise hit
 * manually on 2026-08-20), this does the GitHub "Update branch" merge
 * itself and retries once before giving up — no separate button needed.
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { requireDevApprovalsAccess } from '@/app/lib/github/dev-approvals-access'
import { fetchPr, fetchCheckRunsSummary, approveReview, mergePr, updateBranch, isOutOfDateMergeError } from '@/app/lib/github/api'
import { sendPrDecisionAlert } from '@/app/lib/email'

export const runtime = 'nodejs'
export const maxDuration = 45

const KHALIFA_EMAIL = 'khalifa@tresconglobal.com'

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

export async function POST(req: NextRequest, { params }: { params: Promise<{ prNumber: string }> }) {
  const access = await requireDevApprovalsAccess(req)
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })

  const prNumber = Number((await params).prNumber)
  if (!Number.isFinite(prNumber)) return NextResponse.json({ error: 'Invalid PR number' }, { status: 400 })

  const { data: row } = await supabaseAdmin.from('github_pr_reviews').select('*').eq('pr_number', prNumber).maybeSingle()
  if (!row) return NextResponse.json({ error: 'Unknown PR — no webhook record for it yet' }, { status: 404 })

  let pr
  try {
    pr = await fetchPr(prNumber)
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Could not reach GitHub to fetch the PR' }, { status: 502 })
  }

  if (pr.merged) return NextResponse.json({ error: 'Already merged' }, { status: 409 })
  if (pr.state !== 'open') return NextResponse.json({ error: `PR is ${pr.state}, not open` }, { status: 409 })

  const checks = await fetchCheckRunsSummary(pr.head.sha).catch(() => ({ state: 'none' as const, runs: [] }))
  if (checks.state !== 'passing') {
    return NextResponse.json({ error: `CI hasn't passed yet (status: ${checks.state}) — can't approve something that isn't green.`, checks }, { status: 409 })
  }

  try {
    await approveReview(prNumber)
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: `Approved review failed: ${err instanceof Error ? err.message : String(err)}` }, { status: 502 })
  }

  let mergeResult = await mergePr(prNumber)

  if (!mergeResult.ok && isOutOfDateMergeError(mergeResult.message)) {
    try {
      await updateBranch(prNumber)
      // GitHub computes mergeability asynchronously — poll briefly rather
      // than retrying immediately into the same stale state.
      for (let i = 0; i < 4 && !mergeResult.ok; i++) {
        await sleep(2500)
        mergeResult = await mergePr(prNumber)
      }
    } catch (err) {
      console.error('updateBranch retry failed:', err)
    }
  }

  if (!mergeResult.ok) {
    await supabaseAdmin.from('github_pr_reviews').update({
      status: 'approved', // the review itself went through — only the merge is stuck
      decided_by: access.staffId,
      decided_at: new Date().toISOString(),
      merge_error: mergeResult.message,
      updated_at: new Date().toISOString(),
    }).eq('pr_number', prNumber)

    return NextResponse.json({
      error: `Approved on GitHub, but couldn't merge automatically: ${mergeResult.message}. Try again shortly, or finish it on GitHub.`,
    }, { status: 502 })
  }

  await supabaseAdmin.from('github_pr_reviews').update({
    status: 'approved',
    decided_by: access.staffId,
    decided_at: new Date().toISOString(),
    merge_error: null,
    updated_at: new Date().toISOString(),
  }).eq('pr_number', prNumber)

  try {
    await sendPrDecisionAlert({ to: KHALIFA_EMAIL, prNumber, prTitle: row.pr_title, decision: 'approved', prUrl: row.pr_url })
  } catch (err) {
    console.error('sendPrDecisionAlert (approved) failed, non-fatal:', err)
  }

  return NextResponse.json({ ok: true })
}
