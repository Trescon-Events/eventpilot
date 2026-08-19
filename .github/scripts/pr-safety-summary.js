#!/usr/bin/env node
// Runs on PRs opened by Khalifa (khalifa-branding) against main.
// Mechanically classifies which parts of Event Pilot the diff touches (no AI
// call, no API key) and posts the result as a PR comment mentioning the
// required reviewer so they get notified.

const { execSync } = require('child_process')

const GITHUB_TOKEN       = process.env.GITHUB_TOKEN
const REPO               = process.env.GITHUB_REPOSITORY // "Trescon-Events/eventpilot"
const PR_NUMBER          = process.env.PR_NUMBER
const PR_URL             = process.env.PR_URL
const PR_TITLE           = process.env.PR_TITLE
const PR_AUTHOR          = process.env.PR_AUTHOR
const BASE_REF           = process.env.BASE_REF
const REVIEWER_HANDLE    = process.env.REVIEWER_HANDLE || 'tresconevents'
const WEBHOOK_URL        = process.env.EVENTPILOT_WEBHOOK_URL
const WEBHOOK_SECRET     = process.env.GITHUB_PR_WEBHOOK_SECRET

if (!GITHUB_TOKEN || !REPO || !PR_NUMBER || !BASE_REF) {
  console.error('Missing required env vars (GITHUB_TOKEN, PR_NUMBER, BASE_REF).')
  process.exit(1)
}

// Changes confined to these prefixes are the SAFE case.
const ISOLATED_PREFIXES = [
  'app/admin/task-manager/',
  'app/api/task-manager/',
]

// Human-readable labels for anything outside the isolated paths, checked in order.
const AREA_LABELS = [
  ['.github/', 'CI/CD and repo security settings'],
  ['middleware.ts', 'authentication/routing middleware'],
  ['next.config', 'app configuration'],
  ['package.json', 'project dependencies'],
  ['package-lock.json', 'project dependencies'],
  ['supabase/migrations/', 'database schema'],
  ['app/lib/', 'shared backend logic'],
  ['app/api/', 'other API routes'],
  ['app/admin/', 'admin dashboard'],
  ['app/components/', 'shared UI components'],
  ['components/', 'shared UI components'],
]

function run(cmd) {
  return execSync(cmd, { maxBuffer: 1024 * 1024 * 20 }).toString()
}

function labelFor(file) {
  const hit = AREA_LABELS.find(([prefix]) => file.startsWith(prefix))
  return hit ? hit[1] : 'other repo files'
}

async function main() {
  run(`git fetch origin ${BASE_REF}`)

  const diffStat = run(`git diff origin/${BASE_REF}...HEAD --stat`).trim()
  const shortstat = run(`git diff origin/${BASE_REF}...HEAD --shortstat`).trim()
  const changedFiles = run(`git diff origin/${BASE_REF}...HEAD --name-only`).trim().split('\n').filter(Boolean)

  const outsideIsolated = changedFiles.filter(f => !ISOLATED_PREFIXES.some(p => f.startsWith(p)))

  const areasTouched = outsideIsolated.length
    ? [...new Set(outsideIsolated.map(labelFor))]
    : ['Task Manager module only']

  const verdict = outsideIsolated.length === 0 ? 'SAFE' : 'REVIEW_CLOSELY'
  const badge = verdict === 'SAFE' ? '🟢 SAFE — isolated to Task Manager' : '🟡 REVIEW CLOSELY'
  const verdictReason = verdict === 'SAFE'
    ? 'Every changed file is inside the Task Manager module.'
    : `Touches files outside the Task Manager module: ${outsideIsolated.slice(0, 10).join(', ')}${outsideIsolated.length > 10 ? '…' : ''}`

  const summary = `${changedFiles.length} file${changedFiles.length === 1 ? '' : 's'} changed (${shortstat || 'no line-count data'}).`

  const body = [
    `### Automated change summary  @${REVIEWER_HANDLE}`,
    '',
    summary,
    '',
    '**Areas touched:** ' + areasTouched.join(', '),
    '',
    `**Verdict:** ${badge}`,
    verdictReason,
    '',
    '<details><summary>Files changed</summary>\n\n```\n' + diffStat + '\n```\n\n</details>',
    '',
    '_This is a mechanical file-path check, not a code review — approve or request changes on this PR to decide whether it goes live._',
  ].join('\n')

  const commentRes = await fetch(`https://api.github.com/repos/${REPO}/issues/${PR_NUMBER}/comments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github+json',
    },
    body: JSON.stringify({ body }),
  })

  if (!commentRes.ok) {
    const err = await commentRes.text()
    console.error('GitHub comment error:', err)
    process.exit(1)
  }

  console.log(`Posted safety summary on PR #${PR_NUMBER} — verdict: ${verdict}`)

  // ── Email Madhu directly via EventPilot's own Resend setup ─────────────────
  // Guaranteed channel — doesn't depend on the tresconevents account's GitHub
  // notification settings. Non-fatal if not configured yet: the PR comment
  // above already provides visibility, so a missing secret shouldn't fail CI.
  if (!WEBHOOK_URL || !WEBHOOK_SECRET) {
    console.warn('EVENTPILOT_WEBHOOK_URL / GITHUB_PR_WEBHOOK_SECRET not set — skipping email alert.')
    return
  }

  const webhookRes = await fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${WEBHOOK_SECRET}`,
    },
    body: JSON.stringify({
      prNumber: Number(PR_NUMBER),
      prUrl: PR_URL,
      prTitle: PR_TITLE,
      author: PR_AUTHOR,
      summary,
      areasTouched,
      verdict,
      verdictReason,
      filesChanged: changedFiles,
    }),
  })

  if (!webhookRes.ok) {
    const err = await webhookRes.text()
    console.error('EventPilot webhook error (non-fatal):', err)
    return
  }

  console.log('Email alert sent via EventPilot.')
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
