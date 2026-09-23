// Shared server-side length safety net for AI-generated short text — an
// LLM instruction to stay under a character count is a strong steer, not
// a guarantee. Trims to the last whitespace at or before the limit (never
// mid-word) and drops a trailing orphan comma/dash, so a rare overshoot
// degrades to a clean cut instead of an enforced-but-ugly hard chop.
// Hoisted out of generate-short-bio/route.ts (2026-09-22) once the speaker
// headline generator became its second call site.
export function enforceMaxChars(text: string, max: number): string {
  if (text.length <= max) return text
  const cut = text.slice(0, max)
  const lastSpace = cut.lastIndexOf(' ')
  return (lastSpace > 0 ? cut.slice(0, lastSpace) : cut).replace(/[,;:\-–—\s]+$/, '')
}
