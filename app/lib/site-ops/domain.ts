/* Site Operations module, Phase 4 — registrable-domain extraction for the
   Commissioning Orchestrator's Classify step (spec section 3: classify by
   domain, not event lineage).

   Deliberately NOT a full public-suffix-list implementation — this
   codebase has no such dependency, and every real domain seen in this
   project so far (aiinfranext.com, worldaishow.com,
   futuresustainabilityforum.com, worldcxsummit.com, etc.) is a plain
   second-level .com/.org/.io domain. The short list below covers the
   common two-part-TLD cases (co.uk, com.au, ...) so those don't silently
   misclassify; anything genuinely exotic falls back to the last-two-labels
   heuristic. If this module ever needs to handle real ccTLD-heavy
   domains, replace this with a proper `psl`/`tldts` dependency rather than
   growing this list further. */

const TWO_PART_TLDS = new Set([
  'co.uk', 'org.uk', 'ac.uk', 'gov.uk',
  'com.au', 'net.au', 'org.au',
  'co.in', 'co.nz', 'co.za',
  'com.sg', 'com.my', 'com.hk',
])

export function registrableDomain(url: string): string | null {
  let hostname: string
  try {
    hostname = new URL(url).hostname.toLowerCase()
  } catch {
    return null
  }
  const labels = hostname.split('.').filter(Boolean)
  if (labels.length < 2) return hostname || null

  const lastTwo = labels.slice(-2).join('.')
  if (TWO_PART_TLDS.has(lastTwo) && labels.length >= 3) {
    return labels.slice(-3).join('.')
  }
  return lastTwo
}
