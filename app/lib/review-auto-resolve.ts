/*
  Deploy-verified auto-resolve for platform reviews.

  When an admin marks a review as `in_progress` and sets `fix_commit_sha` to
  the commit that fixes it, this module — invoked on every server boot from
  instrumentation.ts — resolves the review once that commit is confirmed to
  be in the currently deployed build. Resolving fires the Admin auto-response
  comment (via the shared resolveReview() helper) so the reporter gets
  notified without an admin having to flip the status manually.

  The equivalent PATCH path in app/api/reviews/[id]/route.ts also calls
  resolveReview() when an admin flips status via the UI. Both entry points
  share the same logic — the boot resolver is just the automated trigger.
*/

import { supabaseAdmin } from '@/app/lib/supabase'
import { generateAdminResponse, firstName } from './review-auto-response'

const GITHUB_REPO = 'Trescon-Events/eventpilot'

type ResolveOutcome = { resolved: boolean; reason?: string; error?: string }

/*
  Flip one review to `resolved`, add the status-change trail entry, and — if
  no admin response has been posted yet — draft + insert the Admin
  auto-response comment plus the reporter's bell notification.

  Idempotent. Callers may invoke on an already-resolved review (returns
  { resolved: false, reason: 'already resolved' }). Auto-response is skipped
  when a prior admin comment exists so we never post duplicates.
*/
export async function resolveReview(
  reviewId: string,
  adminName = 'Admin',
): Promise<ResolveOutcome> {
  const { data: review, error: rErr } = await supabaseAdmin
    .from('platform_reviews')
    .select('id, title, description, status, staff_id, staff_name, admin_notes')
    .eq('id', reviewId)
    .single()

  if (rErr || !review) return { resolved: false, error: rErr?.message ?? 'review not found' }
  if (review.status === 'resolved') return { resolved: false, reason: 'already resolved' }

  const { error: uErr } = await supabaseAdmin.from('platform_reviews').update({
    status:           'resolved',
    resolved_at:      new Date().toISOString(),
    resolved_by_name: adminName,
  }).eq('id', reviewId)
  if (uErr) return { resolved: false, error: uErr.message }

  await supabaseAdmin.from('review_comments').insert({
    review_id:        reviewId,
    author_type:      'admin',
    author_name:      adminName,
    is_status_change: true,
    new_status:       'resolved',
    message:          null,
  })

  // Skip auto-response if an admin has already commented (manual response or
  // an earlier auto-response from a previous resolve).
  const { data: priorAdminComment } = await supabaseAdmin
    .from('review_comments')
    .select('id')
    .eq('review_id', reviewId)
    .eq('author_type', 'admin')
    .eq('is_status_change', false)
    .limit(1)

  if (priorAdminComment && priorAdminComment.length > 0) {
    return { resolved: true, reason: 'admin comment already exists' }
  }

  let reporterName = review.staff_name
  if (!reporterName && review.staff_id && review.staff_id !== 'super-admin') {
    const { data: sm } = await supabaseAdmin
      .from('staff_members').select('name').eq('id', review.staff_id).maybeSingle()
    if (sm?.name) reporterName = sm.name
  }

  const autoText = await generateAdminResponse({
    reviewTitle:       review.title || '',
    reviewDescription: review.description || '',
    reporterFirstName: firstName(reporterName),
    fixSummary:        review.admin_notes || undefined,
  })

  await supabaseAdmin.from('review_comments').insert({
    review_id:        reviewId,
    author_type:      'admin',
    author_name:      'Admin',
    is_status_change: false,
    message:          autoText,
  })

  if (review.staff_id) {
    await supabaseAdmin.from('notifications').insert({
      staff_id:  review.staff_id,
      type:      'review_update',
      title:     'Admin responded to your feedback',
      body:      autoText.slice(0, 140),
      review_id: reviewId,
    })
  }

  return { resolved: true }
}

/*
  Called on server boot (instrumentation.ts). Finds every `in_progress`
  review with a `fix_commit_sha` set, and resolves the ones whose fix commit
  is an ancestor of the currently deployed commit (or equal to it).

  Ancestry is checked via GitHub's public compare API — the repo is public
  so no token is required. Compare returns `status: 'behind' | 'identical'`
  when the base (fix_commit_sha) is reachable from head (deployed_sha),
  meaning the fix is in this deploy.
*/
export async function resolveDeployedReviews(): Promise<{ checked: number; resolved: number }> {
  const deployedSha = process.env.RAILWAY_GIT_COMMIT_SHA
  if (!deployedSha) return { checked: 0, resolved: 0 }

  const { data: pending, error } = await supabaseAdmin
    .from('platform_reviews')
    .select('id, fix_commit_sha')
    .eq('status', 'in_progress')
    .not('fix_commit_sha', 'is', null)

  if (error || !pending || pending.length === 0) return { checked: 0, resolved: 0 }

  let resolved = 0
  for (const r of pending) {
    if (!r.fix_commit_sha) continue
    const included = await isCommitInDeploy(r.fix_commit_sha, deployedSha)
    if (!included) continue
    const outcome = await resolveReview(r.id, 'Admin')
    if (outcome.resolved) resolved++
  }
  return { checked: pending.length, resolved }
}

async function isCommitInDeploy(fixSha: string, deployedSha: string): Promise<boolean> {
  if (fixSha === deployedSha) return true
  try {
    const res = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/compare/${fixSha}...${deployedSha}`,
      { headers: { 'Accept': 'application/vnd.github.v3+json' } },
    )
    if (!res.ok) return false
    const data = await res.json()
    // 'behind'    → fixSha has commits deployedSha lacks (impossible if pushed to main first)
    // 'identical' → fixSha === deployedSha
    // 'ahead'     → deployedSha has commits fixSha lacks (this is what we want — fix is in deploy)
    // 'diverged'  → different history — fix is NOT in deploy
    return data.status === 'ahead' || data.status === 'identical'
  } catch {
    return false
  }
}
