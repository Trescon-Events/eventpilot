/* Does a client's comment on a badge sound like "don't print this one"? Used to nudge the client to press Reject (their page) and to highlight the comment for the team (batch page).
   Deliberately generous but phrase-based, so "Approved" or "please fix the title" never match. Pure and unit-tested. */

const PATTERNS: RegExp[] = [
  /\bno\s+need\b/i, /\bnot\s+(?:be\s+)?(?:needed|required|necessary)\b/i, /\b(?:don'?t|do\s+not|doesn'?t|does\s+not)\s+(?:need|want|require|print)\b/i,
  /\balready\s+(?:printed|have|has|got|done|collected|received|issued)\b/i, /\bignore\b/i, /\b(?:remove|delete|drop|skip|cancel|exclude|omit|withdraw)\b/i,
  /\bnot\s+(?:attending|coming|joining|participating|speaking)\b/i, /\bno\s+longer\b/i, /\bwon'?t\s+(?:be\s+)?(?:attend|attending|need|print)/i, /\bwithout\s+(?:a\s+)?badge\b/i,
]

export function looksLikeSkip(comment: string | null | undefined): boolean {
  const t = (comment ?? '').trim()
  return t.length > 0 && PATTERNS.some(p => p.test(t))
}
