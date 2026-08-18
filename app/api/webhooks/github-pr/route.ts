/**
 * POST /api/webhooks/github-pr
 *
 * Called by the pr-safety-summary GitHub Action every time Khalifa
 * (khalifa-branding) opens or updates a pull request against main.
 * Sends Madhu a direct email — a guaranteed channel, independent of
 * whatever GitHub notification settings the tresconevents account has.
 *
 * Auth: GITHUB_PR_WEBHOOK_SECRET Bearer token (same pattern as cron endpoints).
 */
import { NextRequest, NextResponse } from 'next/server'
import { sendGithubPrAlert } from '@/app/lib/email'

export const runtime = 'nodejs'
export const maxDuration = 30

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.GITHUB_PR_WEBHOOK_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })

  const { prNumber, prUrl, prTitle, author, summary, areasTouched, verdict, verdictReason, filesChanged } = body

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

  try {
    await sendGithubPrAlert({ prNumber, prUrl, prTitle, author, summary, areasTouched, verdict, verdictReason, filesChanged })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('sendGithubPrAlert failed:', err)
    return NextResponse.json({ error: 'Email send failed' }, { status: 500 })
  }
}
