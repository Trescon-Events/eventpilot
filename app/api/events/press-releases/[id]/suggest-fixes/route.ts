import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { loadPressReleaseAndAuthorize, FLASH_MODEL } from '@/app/lib/content/press-release-access'

type FindingInput = { key: string; field: string; rule_key: string; message: string; match: string; source_clause: string | null }
type FixResult = { key: string; suggested_text?: string; needs_discussion: boolean }

/* POST /api/events/press-releases/[id]/suggest-fixes
   Body: { findings: FindingInput[] }

   Enriches deterministic compliance findings (app/lib/content/validate.ts)
   that have no mechanical suggested_fix (only required_format rules carry
   one) with an AI-proposed direct replacement, so most findings can be
   fixed inline with one click instead of falling back to "discuss in
   chat" — per Madhu, that fallback should be reserved for findings that
   genuinely need a PR-team decision, not the default. One batched Gemini
   call for every open finding, not one call each. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await loadPressReleaseAndAuthorize(req, id, 'sae.content_studio.press_release.generate')
  if (!auth.ok) return auth.error

  const body = await req.json().catch(() => null) as { findings?: FindingInput[] } | null
  const findings = body?.findings ?? []
  if (findings.length === 0) return NextResponse.json({ fixes: {} })

  const prompt = `You are helping fix compliance issues in a press release. For each finding below, either give a concrete corrected replacement for the exact matched text, or mark it as needing discussion with the PR team if a mechanical rewrite genuinely isn't possible (it needs a business decision, a missing fact, or a choice only they can make). Most findings should get a direct fix — only mark needs_discussion when truly necessary.

Findings:
${findings.map(f => `- key: ${f.key}\n  matched text: "${f.match}"\n  rule: ${f.message}${f.source_clause ? `\n  source: ${f.source_clause}` : ''}`).join('\n')}

Return ONLY a JSON array, no preamble, no markdown fences:
[{ "key": "...", "suggested_text": "... (omit or leave empty when needs_discussion is true)", "needs_discussion": false }]`

  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
    const model = genAI.getGenerativeModel({ model: FLASH_MODEL })
    const result = await model.generateContent(prompt)
    const text = result.response.text().trim()
    const match = text.match(/\[[\s\S]*\]/)
    if (!match) return NextResponse.json({ fixes: {} })

    const parsed = JSON.parse(match[0]) as FixResult[]
    const fixes: Record<string, FixResult> = {}
    for (const f of parsed) if (f?.key) fixes[f.key] = f
    return NextResponse.json({ fixes })
  } catch (err) {
    console.error('press-release suggest-fixes error:', err)
    return NextResponse.json({ fixes: {} })
  }
}
