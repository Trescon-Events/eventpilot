/**
 * GET /api/admin/dev-approvals
 *
 * Lists pending Khalifa PRs for the in-app PR Approvals page
 * (app/admin/dev-approvals), merging the stored row (from the webhook) with
 * a live GitHub check-runs fetch — CI status is always fresh, never a
 * stale cached badge, since that's exactly what caused confusion the last
 * time this was done by hand on GitHub itself.
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { requireDevApprovalsAccess } from '@/app/lib/github/dev-approvals-access'
import { fetchCheckRunsSummary } from '@/app/lib/github/api'

export const runtime = 'nodejs'
export const maxDuration = 30

export async function GET(req: NextRequest) {
  const access = await requireDevApprovalsAccess(req)
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })

  const { data, error } = await supabaseAdmin
    .from('github_pr_reviews')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(25)

  if (error) return NextResponse.json({ error: 'Failed to load PR reviews' }, { status: 500 })

  const withChecks = await Promise.all((data ?? []).map(async row => {
    if (!row.head_sha) return { ...row, checks: { state: 'none', runs: [] } }
    try {
      const checks = await fetchCheckRunsSummary(row.head_sha)
      return { ...row, checks }
    } catch (err) {
      console.error(`fetchCheckRunsSummary failed for PR #${row.pr_number}:`, err)
      return { ...row, checks: { state: 'none', runs: [] } }
    }
  }))

  return NextResponse.json({ reviews: withChecks })
}
