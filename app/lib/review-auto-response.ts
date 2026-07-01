import { GoogleGenerativeAI } from '@google/generative-ai'

/**
 * Auto-response generator for platform_reviews.
 *
 * When a review's status transitions to `resolved`, the API layer calls
 * `generateAdminResponse()` to produce a warm, specific in-app comment
 * that will be posted under the "Admin" name.
 *
 * The response NEVER invents fixes: it only surfaces what's in `fixSummary`.
 * If `fixSummary` is thin, the response stays honest ("your report was
 * reviewed and the necessary changes have been implemented").
 */

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })

export interface AutoResponseInput {
  reviewTitle:       string
  reviewDescription: string
  reporterFirstName: string
  /** Verbatim summary of what was actually done. Provided by admin note,
   *  or derived from git commits, or a hand-crafted per-review string
   *  (used by the backfill script). Never leave undefined for a real fix. */
  fixSummary?:       string
}

/**
 * Ask Gemini to draft a specific, warm in-app comment.
 * Returns the raw response text — no markdown, no emojis, no exclamation marks.
 */
export async function generateAdminResponse(input: AutoResponseInput): Promise<string> {
  const first = (input.reporterFirstName || 'there').trim()
  const fix   = (input.fixSummary || '').trim()

  const prompt = `You are the "Admin" responding to internal platform feedback on Event Pilot, Trescon Global's staff platform. A member of the Trescon team submitted a report. The engineering team has addressed the report. Draft a short in-app response that will be posted as a comment under the name "Admin".

REPORTER FIRST NAME: ${first}

REPORTER'S TITLE: ${input.reviewTitle}

REPORTER'S FULL REPORT (verbatim):
"""
${input.reviewDescription.slice(0, 2000)}
"""

WHAT WAS ACTUALLY DONE TO ADDRESS THIS REPORT:
"""
${fix || 'The report was reviewed and the necessary changes have been implemented.'}
"""

STRICT RULES for the response you write:
1. First line is exactly: Hi ${first},
2. Then a blank line.
3. Next paragraph (1-2 sentences): acknowledge what they raised, in your own words. Show you actually read it.
4. Then a blank line.
5. Next paragraph (1-3 sentences): explain what was done. Use plain English. If the "WHAT WAS ACTUALLY DONE" section is specific, reference those specific fixes. If it is generic, keep this paragraph brief and honest — do NOT invent details.
6. Then a blank line.
7. Optional (only if it feels natural): one short "thanks for helping us improve Event Pilot" line.
8. Then a blank line.
9. Last line is exactly: — Admin
10. NO markdown, NO bullet points, NO headers, NO emojis, NO exclamation marks, NO "The Event Pilot Team" — sign as "Admin" only.
11. 70 to 160 words total.
12. Warm and professional. Do not overpromise. Do not apologise excessively.
13. Do NOT invent any fix that is not in the "WHAT WAS ACTUALLY DONE" section.

Return ONLY the response text — no wrappers, no quotes, no meta-commentary.`

  const result = await model.generateContent(prompt)
  let text = result.response.text().trim()

  // Strip accidental code-fences or quotes
  text = text.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim()
  text = text.replace(/^"|"$/g, '').trim()

  // Guardrail: enforce sign-off if the model omitted it
  if (!/[—-]\s*Admin\s*$/i.test(text)) {
    text = text.replace(/\n+—\s*.+$/i, '').trim()
    text = `${text}\n\n— Admin`
  }

  return text
}

/**
 * Derive the reporter's first name from a full staff name.
 * "Md Akram Shekh" → "Md", "Fouzan Abdul Rahim" → "Fouzan".
 */
export function firstName(full: string | null | undefined): string {
  if (!full) return 'there'
  return full.trim().split(/\s+/)[0] || 'there'
}
