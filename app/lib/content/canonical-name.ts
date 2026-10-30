/* Helpers for the canonical_name rule form (doc-rule-linkage-and-canonical-names.md, Part B): the Rules screen shows two plain fields, "Approved form"
   and "Also catch", and stores them as the rule's JSON pattern. Pure. */

export type CanonicalConfig = { canonical: string; loose: string }

export function readCanonical(pattern: string): CanonicalConfig {
  try {
    const c = JSON.parse(pattern) as Partial<CanonicalConfig>
    return { canonical: typeof c.canonical === 'string' ? c.canonical : '', loose: typeof c.loose === 'string' ? c.loose : '' }
  } catch { return { canonical: '', loose: '' } }
}
export const writeCanonical = (c: CanonicalConfig): string => JSON.stringify({ canonical: c.canonical, loose: c.loose })

const VOWEL = /[aeiouAEIOU]/
const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** A starting point for "Also catch": the most distinctive word of the approved form (the longest, at least 6 letters), with each vowel that sits between two
    consonants made optional, so a dropped letter still lands on it. The person is expected to adjust it. With no such word, the whole name with flexible spacing. */
export function suggestLoose(canonical: string): string {
  const words = canonical.match(/\p{L}+/gu) ?? []
  const best = words.filter(w => w.length >= 6).sort((a, b) => b.length - a.length)[0]
  if (!best) {
    const parts = words.map(escapeRegex)
    return parts.length ? parts.join('\\s+') : ''
  }
  const ch = [...best]
  return ch.map((c, i) => VOWEL.test(c) && i > 0 && i < ch.length - 1 && !VOWEL.test(ch[i - 1]) && !VOWEL.test(ch[i + 1]) ? `${c}?` : c).join('')
}
