/*
  Server-side GitHub REST calls for the in-app PR Approvals page
  (app/admin/dev-approvals). Acts as Madhu's own GitHub identity via a
  fine-grained personal access token (GITHUB_APPROVER_TOKEN, Railway env
  var — scoped to just Trescon-Events/eventpilot, Pull requests read/write +
  Contents read). Deliberately NOT the Actions-ephemeral GITHUB_TOKEN used
  by pr-safety-summary.js — that token only exists during a workflow run,
  the deployed app can't use it, and GitHub blocks a PR author (Khalifa)
  from approving their own PR, so this has to be a real reviewer identity.
*/

const OWNER = 'Trescon-Events'
const REPO = 'eventpilot'
const API = 'https://api.github.com'

function token() {
  const t = process.env.GITHUB_APPROVER_TOKEN
  if (!t) throw new Error('GITHUB_APPROVER_TOKEN is not set')
  return t
}

async function gh(path: string, init?: RequestInit) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      'Authorization': `Bearer ${token()}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
    cache: 'no-store',
  })
  return res
}

export type CheckRunsSummary = {
  state: 'passing' | 'failing' | 'pending' | 'none'
  runs: { name: string; status: string; conclusion: string | null; url: string }[]
}

export async function fetchPr(prNumber: number) {
  const res = await gh(`/repos/${OWNER}/${REPO}/pulls/${prNumber}`)
  if (!res.ok) throw new Error(`GitHub fetchPr failed (${res.status}): ${await res.text()}`)
  return res.json() as Promise<{
    number: number; state: string; merged: boolean; mergeable: boolean | null; mergeable_state: string
    title: string; html_url: string; user: { login: string }
    head: { sha: string; ref: string }; base: { ref: string }
  }>
}

export async function fetchCheckRunsSummary(sha: string): Promise<CheckRunsSummary> {
  const res = await gh(`/repos/${OWNER}/${REPO}/commits/${sha}/check-runs?per_page=50`)
  if (!res.ok) throw new Error(`GitHub check-runs failed (${res.status}): ${await res.text()}`)
  const data = await res.json() as { check_runs: { name: string; status: string; conclusion: string | null; html_url: string }[] }
  const runs = data.check_runs.map(r => ({ name: r.name, status: r.status, conclusion: r.conclusion, url: r.html_url }))
  if (runs.length === 0) return { state: 'none', runs }
  if (runs.some(r => r.status !== 'completed')) return { state: 'pending', runs }
  const state = runs.every(r => r.conclusion === 'success' || r.conclusion === 'neutral' || r.conclusion === 'skipped')
    ? 'passing' : 'failing'
  return { state, runs }
}

export async function approveReview(prNumber: number) {
  const res = await gh(`/repos/${OWNER}/${REPO}/pulls/${prNumber}/reviews`, {
    method: 'POST',
    body: JSON.stringify({ event: 'APPROVE' }),
  })
  if (!res.ok) throw new Error(`GitHub approve failed (${res.status}): ${await res.text()}`)
}

export async function requestChanges(prNumber: number, note: string) {
  const res = await gh(`/repos/${OWNER}/${REPO}/pulls/${prNumber}/reviews`, {
    method: 'POST',
    body: JSON.stringify({ event: 'REQUEST_CHANGES', body: note }),
  })
  if (!res.ok) throw new Error(`GitHub request-changes failed (${res.status}): ${await res.text()}`)
}

// Returns { ok: true } on success, or { ok: false; reason } — callers decide
// whether the reason is worth a retry (e.g. "out of date", surfaced by
// mergePr's out-of-date detection below) or a hard stop.
export async function mergePr(prNumber: number): Promise<{ ok: true } | { ok: false; status: number; message: string }> {
  const res = await gh(`/repos/${OWNER}/${REPO}/pulls/${prNumber}/merge`, {
    method: 'PUT',
    body: JSON.stringify({ merge_method: 'merge' }),
  })
  if (res.ok) return { ok: true }
  const body = await res.json().catch(() => ({} as { message?: string }))
  return { ok: false, status: res.status, message: body.message ?? `HTTP ${res.status}` }
}

export function isOutOfDateMergeError(message: string) {
  return /not mergeable|behind|out.of.date|update.*branch/i.test(message)
}

// Merges latest base into the PR's head branch (same as GitHub's "Update
// branch" button) — used as a one-shot recovery when mergePr reports the
// branch is behind. Creates a real commit on Khalifa's branch.
export async function updateBranch(prNumber: number) {
  const res = await gh(`/repos/${OWNER}/${REPO}/pulls/${prNumber}/update-branch`, { method: 'PUT' })
  if (!res.ok && res.status !== 422) {
    // 422 here commonly means "GitHub hasn't finished computing mergeability
    // yet" (confirmed live, 2026-08-20) rather than a real conflict — treat
    // as non-fatal, the caller's retry loop re-checks state afterwards.
    throw new Error(`GitHub update-branch failed (${res.status}): ${await res.text()}`)
  }
}
