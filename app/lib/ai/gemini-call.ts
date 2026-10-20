import type { GenerativeModel, GenerationConfig } from '@google/generative-ai'

/* Announcement-copy Gemini calls (2026-10-20). Gemini 3.x "thinks" before answering, and on the big prompts SAE sends (a ~29k-token
   messaging document) the default thinking took ~30s of a 60s limit — DFWS announcement generation then failed four times in a row
   when Google was slow. `thinkingLevel: 'low'` brought the same prompt from 31s to 5s. This file holds that setting, one retry
   for a timed-out/dropped call, and a duration log, so every copy call behaves the same way. */

// The SDK's GenerationConfig type predates thinkingConfig; the API accepts it, so it is added through a cast.
export const COPY_GENERATION_CONFIG = {
  responseMimeType: 'application/json',
  thinkingConfig: { thinkingLevel: 'low' },
} as unknown as GenerationConfig

const FIRST_TRY_MS = 45_000
const RETRY_MS = 35_000 // 45 + 35 stays under the ~100s proxy limit in front of production

function isTransient(e: unknown): boolean {
  const m = e instanceof Error ? e.message : String(e)
  return /abort|timed? ?out|ETIMEDOUT|ECONNRESET|fetch failed|\b50[0-4]\b|overloaded|unavailable/i.test(m)
}

export async function generateCopy(model: GenerativeModel, prompt: string, label: string): Promise<string> {
  let last: unknown
  for (const [i, ms] of [FIRST_TRY_MS, RETRY_MS].entries()) {
    const started = Date.now()
    try {
      const result = await model.generateContent([{ text: prompt }], { timeout: ms })
      console.log(`[gemini] ${label} ok in ${Date.now() - started}ms${i ? ' (retry)' : ''}, prompt ${prompt.length} chars`)
      return result.response.text().trim()
    } catch (e) {
      last = e
      console.error(`[gemini] ${label} attempt ${i + 1} failed after ${Date.now() - started}ms:`, e instanceof Error ? e.message : e)
      if (!isTransient(e)) throw e
    }
  }
  throw last
}
