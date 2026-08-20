/*
  One friendly, non-technical sentence or two describing what a Khalifa PR
  actually does, for the in-app PR Approvals page. Best-effort — falls back
  to the mechanical "N files changed" summary (always available, computed
  by pr-safety-summary.js with no AI call) if Gemini is unavailable or the
  diff patch wasn't included, so a Gemini outage never blocks the review flow.
*/
import { GoogleGenerativeAI } from '@google/generative-ai'

export async function summarizePrForHuman(opts: {
  prTitle: string
  areasTouched: string[]
  filesChanged: string[]
  diffPatch: string
  fallback: string
}): Promise<string> {
  if (!process.env.GEMINI_API_KEY || !opts.diffPatch) return opts.fallback

  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })

    const prompt = `You're explaining a code change to a non-technical product owner who needs to decide whether to approve it — he does not read code.

PR title: ${opts.prTitle}
Files touched: ${opts.filesChanged.join(', ')}

Diff (may be truncated):
\`\`\`
${opts.diffPatch}
\`\`\`

Write 1-2 short plain-English sentences describing what this change actually does for someone using the app — not which files or functions changed, what the user-facing or behavioral effect is. No code terms, no file names. If you genuinely can't tell from the diff, say so plainly instead of guessing. Output ONLY the 1-2 sentences, no preamble.`

    const result = await model.generateContent(prompt)
    const text = result.response.text().trim()
    return text || opts.fallback
  } catch (err) {
    console.error('summarizePrForHuman failed, using mechanical fallback:', err)
    return opts.fallback
  }
}
