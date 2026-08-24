/*
  Turns Madhu's freeform "Send Back" note into a clean, copy-pasteable
  instruction block for Khalifa to hand straight to Antigravity. Best-effort —
  falls back to the raw note (wrapped, not rephrased) if Gemini is unavailable
  or fails, so a Gemini outage never blocks the send-back flow.
*/
import { GoogleGenerativeAI } from '@google/generative-ai'

export async function generateAgentInstructions(opts: {
  prTitle: string
  note: string
  areasTouched: string[]
  filesChanged: string[]
}): Promise<string> {
  const fallback = opts.note

  if (!process.env.GEMINI_API_KEY) return fallback

  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })

    const prompt = `A product owner (Madhu) is sending a pull request back to a developer (Khalifa) who works with an AI coding assistant called Antigravity. Turn Madhu's note below into a clear, direct instruction set that Khalifa can paste into Antigravity as-is to make the fix.

PR title: ${opts.prTitle}
Files touched: ${opts.filesChanged.join(', ') || 'unknown'}
Areas touched: ${opts.areasTouched.join(', ') || 'unknown'}

Madhu's note:
"""
${opts.note}
"""

Rules:
- Write in second person, imperative voice, as if instructing the AI assistant directly ("Do X instead of Y.", "Don't touch Z.").
- Preserve every constraint and instruction in Madhu's note — do not drop, soften, or invent anything.
- If Madhu's note is ambiguous, keep it as stated rather than guessing his intent.
- Plain text only — no markdown headers, no code fences, no preamble like "Here are the instructions."
- Short numbered list if there's more than one instruction; otherwise a short paragraph.
- Output ONLY the instructions themselves, ready to paste directly into Antigravity.`

    const result = await model.generateContent(prompt)
    const text = result.response.text().trim()
    return text || fallback
  } catch (err) {
    console.error('generateAgentInstructions failed, using raw note:', err)
    return fallback
  }
}
