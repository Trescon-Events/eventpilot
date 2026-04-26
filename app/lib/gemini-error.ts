/**
 * Detects Gemini quota / rate-limit errors so every API route
 * can return the same friendly test-stage message.
 */
export function isQuotaError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  return (
    msg.includes('RESOURCE_EXHAUSTED') ||
    msg.includes('quota') ||
    msg.includes('rate limit') ||
    msg.includes('429') ||
    msg.toLowerCase().includes('too many requests')
  )
}

export const QUOTA_ERROR_MESSAGE =
  'Tresci is Trescademy\'s internal AI — built to handle all employee queries, event briefs, AI training, course guidance, and more. ' +
  'We are currently in the testing phase and using a free AI tier — the daily request limit has been reached. ' +
  'Tresci will be fully active in the live version. Please try again later.'
