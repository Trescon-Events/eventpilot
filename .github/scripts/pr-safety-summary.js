#!/usr/bin/env node
// Runs on PRs opened by Khalifa (khalifa-branding) against main.
// Summarizes the diff in plain English and flags whether it touches shared/core
// Event Pilot code vs. only the Task Manager module, then posts the result as a
// PR comment mentioning the required reviewer so they get notified.

const { execSync } = require('child_process')

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY
const GITHUB_TOKEN      = process.env.GITHUB_TOKEN
const REPO              = process.env.GITHUB_REPOSITORY // "Trescon-Events/eventpilot"
const PR_NUMBER         = process.env.PR_NUMBER
const BASE_REF          = process.env.BASE_REF
const REVIEWER_HANDLE   = process.env.REVIEWER_HANDLE || 'tresconevents'

if (!ANTHROPIC_API_KEY || !GITHUB_TOKEN || !REPO || !PR_NUMBER || !BASE_REF) {
  console.error('Missing required env vars (ANTHROPIC_API_KEY, GITHUB_TOKEN, PR_NUMBER, BASE_REF).')
  process.exit(1)
}

// Changes confined to these prefixes are candidates for a SAFE verdict.
const ISOLATED_PREFIXES = [
  'app/task-manager/',
  'app/api/task-manager/',
]

function run(cmd) {
  return execSync(cmd, { maxBuffer: 1024 * 1024 * 20 }).toString()
}

async function main() {
  run(`git fetch origin ${BASE_REF}`)

  const diffStat = run(`git diff origin/${BASE_REF}...HEAD --stat`).trim()
  const changedFiles = run(`git diff origin/${BASE_REF}...HEAD --name-only`).trim().split('\n').filter(Boolean)
  let diffContent = run(`git diff origin/${BASE_REF}...HEAD`)
  const truncated = diffContent.length > 150000
  if (truncated) diffContent = diffContent.slice(0, 150000)

  const outsideIsolated = changedFiles.filter(f => !ISOLATED_PREFIXES.some(p => f.startsWith(p)))

  const prompt = `You are a release-safety assistant for Event Pilot, an internal event-management platform at Trescon. A collaborator named Khalifa (building an isolated "Task Manager" module) has opened a pull request. The repo owner reads your summary in an email notification and decides whether to approve the merge — write for a non-technical manager, not a developer.

Base branch: ${BASE_REF}

Files changed:
${diffStat}

Full diff${truncated ? ' (truncated — very large change)' : ''}:
${diffContent}

Respond with valid JSON only, no markdown, matching this shape:
{
  "summary": "2-3 plain-English sentences describing what this change does",
  "areas_touched": ["short phrases naming which parts of Event Pilot this touches, e.g. 'Task Manager module only', 'shared navigation menu', 'database schema'"],
  "verdict": "SAFE" | "REVIEW_CLOSELY",
  "verdict_reason": "one sentence explaining the verdict"
}

Rules for the verdict:
- SAFE means the change is confined to the Task Manager module's own files and does not touch shared/core Event Pilot code (auth, middleware, shared components, config files, database migrations outside the task manager's own tables, CI/CD, other modules).
- REVIEW_CLOSELY means it touches anything shared or outside the Task Manager module, even a small edit — flag it, don't assume it's fine.
- When uncertain, choose REVIEW_CLOSELY.`

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-5',
      max_tokens: 700,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    console.error('Anthropic API error:', err)
    process.exit(1)
  }

  const data = await res.json()
  const rawText = data?.content?.[0]?.text ?? ''

  let result = {
    summary: 'Could not generate an automated summary — please review the diff manually.',
    areas_touched: [],
    verdict: 'REVIEW_CLOSELY',
    verdict_reason: 'Automated summary failed to parse.',
  }
  try {
    const jsonMatch = rawText.match(/\{[\s\S]*\}/)
    if (jsonMatch) result = JSON.parse(jsonMatch[0])
  } catch {
    console.warn('Could not parse Claude JSON output')
  }

  // Never trust a SAFE verdict blindly — override if anything outside the
  // module's own paths changed, regardless of what the model concluded.
  if (result.verdict === 'SAFE' && outsideIsolated.length > 0) {
    result.verdict = 'REVIEW_CLOSELY'
    result.verdict_reason = `Touches files outside the Task Manager module: ${outsideIsolated.slice(0, 10).join(', ')}${outsideIsolated.length > 10 ? '…' : ''}`
  }

  const badge = result.verdict === 'SAFE' ? '🟢 SAFE — isolated to Task Manager' : '🟡 REVIEW CLOSELY'

  const body = [
    `### Automated change summary  @${REVIEWER_HANDLE}`,
    '',
    result.summary,
    '',
    '**Areas touched:** ' + (result.areas_touched.length ? result.areas_touched.join(', ') : '—'),
    '',
    `**Verdict:** ${badge}`,
    result.verdict_reason,
    '',
    '<details><summary>Files changed</summary>\n\n```\n' + diffStat + '\n```\n\n</details>',
    '',
    '_This is an automated read, not a substitute for review — approve or request changes on this PR to decide whether it goes live._',
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

  console.log(`Posted safety summary on PR #${PR_NUMBER} — verdict: ${result.verdict}`)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
