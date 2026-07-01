/*
  Next.js instrumentation hook — runs once when the Node.js server boots on
  Railway. Delegates to resolveDeployedReviews() to auto-resolve any
  in_progress reviews whose fix_commit_sha is now present in the deployed
  commit tree (checked via GitHub compare API).

  Never throws — a failure here would take the whole app down on boot, which
  we categorically do not want for a background housekeeping task.
*/
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  try {
    const { resolveDeployedReviews } = await import('./app/lib/review-auto-resolve')
    const result = await resolveDeployedReviews()
    if (result.resolved > 0) {
      console.log(
        `[boot] auto-resolved ${result.resolved} of ${result.checked} pending review(s)`,
      )
    }
  } catch (err) {
    console.error('[boot] resolveDeployedReviews failed:', err)
  }
}
