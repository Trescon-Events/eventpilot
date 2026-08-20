/**
 * POST /api/webhooks/github-pr
 *
 * Called by the pr-safety-summary GitHub Action every time Khalifa
 * (khalifa-branding) opens or updates a pull request against main.
 * Upserts a row into github_pr_reviews (powers the in-app PR Approvals
 * page, app/admin/dev-approvals) and sends Madhu a direct email — a
 * guaranteed channel, independent of whatever GitHub notification settings
 * the tresconevents account has.
 *
 * A new push always resets status back to 'pending' — a stale approval on
 * since-changed code is never trustworthy, and GitHub's own review UI
 * dismisses stale approvals the same way when protected.
 *
 * Auth: GITHUB_PR_WEBHOOK_SECRET Bearer token (same pattern as cron endpoints).
 */
import { NextRequest, NextResponse } from 'next/server'
import { sendGithubPrAlert } from '@/app/lib/email'
import { supabaseAdmin } from '@/app/lib/supabase'
import { summarizePrForHuman } from '@/app/lib/github/summarize-pr'

export const runtime = 'nodejs'
export const maxDuration = 30

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.GITHUB_PR_WEBHOOK_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })

  const {
    prNumber, prUrl, prTitle, author, baseRef, headSha,
    summary, areasTouched, verdict, verdictReason, filesChanged, diffPatch,
  } = body

  if (
    typeof prNumber !== 'number' ||
    typeof prUrl !== 'string' ||
    typeof prTitle !== 'string' ||
    typeof author !== 'string' ||
    typeof summary !== 'string' ||
    !Array.isArray(areasTouched) ||
    (verdict !== 'SAFE' && verdict !== 'REVIEW_CLOSELY') ||
    typeof verdictReason !== 'string' ||
    !Array.isArray(filesChanged)
  ) {
    return NextResponse.json({ error: 'Missing or malformed fields' }, { status: 400 })
  }

  const aiSummary = await summarizePrForHuman({
    prTitle, areasTouched, filesChanged,
    diffPatch: typeof diffPatch === 'string' ? diffPatch : '',
    fallback: summary,
  })

  const { error: dbError } = await supabaseAdmin.from('github_pr_reviews').upsert({
    pr_number: prNumber,
    pr_url: prUrl,
    pr_title: prTitle,
    author,
    base_ref: typeof baseRef === 'string' ? baseRef : 'main',
    head_sha: typeof headSha === 'string' ? headSha : null,
    ai_summary: aiSummary,
    mechanical_summary: summary,
    areas_touched: areasTouched,
    verdict,
    verdict_reason: verdictReason,
    files_changed: filesChanged,
    status: 'pending',
    decided_by: null,
    decided_at: null,
    decision_note: null,
    merge_error: null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'pr_number' })

  if (dbError) console.error('github_pr_reviews upsert failed (non-fatal, email still sends):', dbError)

  try {
    await sendGithubPrAlert({ prNumber, prUrl, prTitle, author, summary: aiSummary, areasTouched, verdict, verdictReason, filesChanged })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('sendGithubPrAlert failed:', err)
    return NextResponse.json({ error: 'Email send failed' }, { status: 500 })
  }
}
