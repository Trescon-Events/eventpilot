#!/usr/bin/env node
// Runs inside GitHub Actions after every push to main.
// Reads the commit diff → sends to Gemini → stores enriched entry in Supabase.

const { execSync } = require('child_process')

const SUPABASE_URL         = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const GEMINI_KEY           = process.env.GEMINI_API_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !GEMINI_KEY) {
  console.error('Missing env vars. Need SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GEMINI_API_KEY')
  process.exit(1)
}

// ── Noise filter ──────────────────────────────────────────────────────────────
const NOISE_PATTERNS = [
  /^merge/i,
  /^update (handoff|build log|readme|whats.next)/i,
  /^fix (typo|syntax|lint)/i,
  /^wip\b/i,
  /^chore\(handoff\)/i,
]

function isNoise(msg) {
  return NOISE_PATTERNS.some(p => p.test(msg.trim()))
}

// ── Author resolution ─────────────────────────────────────────────────────────
function resolveAuthor(email, name) {
  if (email.includes('dc@tresconglobal') || name.toLowerCase().includes('durga') || email.includes('durgacharan')) return 'Durga'
  if (email.includes('md@tresconglobal') || name.toLowerCase().includes('madhu'))  return 'Madhu'
  return name.split(' ')[0] || 'Team'
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const sha        = execSync('git rev-parse HEAD').toString().trim()
  const authorEmail = execSync('git log -1 --format="%ae"').toString().trim()
  const authorName  = execSync('git log -1 --format="%an"').toString().trim()
  const committedAt = execSync('git log -1 --format="%aI"').toString().trim()
  const rawMessage  = execSync('git log -1 --format="%B"').toString().trim()

  console.log(`Processing commit ${sha.slice(0, 7)} by ${authorName}`)

  if (isNoise(rawMessage)) {
    console.log('Noise commit — skipping.')
    return
  }

  // Get the diff — stat + first 6000 chars of actual diff (ts/tsx/js files only)
  let diffStat    = ''
  let diffContent = ''
  try {
    diffStat    = execSync('git diff HEAD~1 HEAD --stat 2>/dev/null || echo "Initial commit"').toString().trim()
    diffContent = execSync('git diff HEAD~1 HEAD -- "*.ts" "*.tsx" "*.js" "*.jsx" "*.sql" 2>/dev/null | head -c 6000').toString()
  } catch {
    diffContent = rawMessage
  }

  // ── Gemini prompt ─────────────────────────────────────────────────────────
  const prompt = `You are writing a build log for an internal platform called Event Pilot (B2B event management SaaS for Trescon, a Dubai-based company).

Analyze this code change and write a build log entry from the perspective of what was shipped.

Commit message: ${rawMessage}

Files changed:
${diffStat}

Code diff (first 6000 chars):
${diffContent}

Write a JSON object with:
- "title": One clear sentence describing what was built (plain English, no technical jargon, no feat:/fix: prefixes). Focus on the feature or fix from a user/admin perspective.
- "bullets": Array of 2-5 strings, each describing one specific thing that was added or fixed. Be concrete. Mention page names, API routes, or UI elements where relevant. Max 120 chars each.

Rules:
- Do not mention file names or variable names
- Do not say "refactored" or "updated" unless it materially changes what the user sees
- Write as if explaining to a non-developer manager what shipped
- Skip obvious infrastructure details (TypeScript types, imports, etc.)

Respond with valid JSON only. No markdown, no explanation.`

  const geminiRes = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    }
  )

  if (!geminiRes.ok) {
    const err = await geminiRes.text()
    console.error('Gemini error:', err)
    process.exit(1)
  }

  const geminiData = await geminiRes.json()
  const rawText    = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''

  let enriched = { title: rawMessage.split('\n')[0], bullets: [] }
  try {
    const jsonMatch = rawText.match(/\{[\s\S]*\}/)
    if (jsonMatch) enriched = JSON.parse(jsonMatch[0])
  } catch {
    console.warn('Could not parse Gemini JSON — using raw commit message as title')
  }

  console.log('Title:', enriched.title)
  console.log('Bullets:', enriched.bullets)

  // ── Store in Supabase ─────────────────────────────────────────────────────
  const sbRes = await fetch(`${SUPABASE_URL}/rest/v1/build_log_enriched`, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'apikey':        SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Prefer':        'resolution=merge-duplicates',
    },
    body: JSON.stringify({
      commit_sha:   sha,
      author_email: authorEmail,
      author_name:  resolveAuthor(authorEmail, authorName),
      committed_at: committedAt,
      title:        enriched.title,
      bullets:      enriched.bullets ?? [],
      raw_message:  rawMessage,
    }),
  })

  if (!sbRes.ok) {
    const err = await sbRes.text()
    console.error('Supabase error:', err)
    process.exit(1)
  }

  console.log(`Stored enriched entry for ${sha.slice(0, 7)}`)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
