/* Copy Library catalogue (docs/build_suggestions/copy-library.md §4). Pure data: which items exist, which variants each has, who may own it, and the
   guidance a generator gets. Tools never write their own version of these; they read the approved one (copy-library.ts). */

export type VariantLength = 'one_liner' | 'short' | 'medium' | 'long' | 'x' | 'n/a'
export type VariantPhase = 'pre' | 'post' | 'any'
export type OwnerKind = 'event' | 'umbrella' | 'org'
export type CatalogueSection = 'Identity' | 'Attribution' | 'Proof' | 'Calls to action' | 'Channel blocks' | 'Post-event'

export type Variant = { length: VariantLength; phase: VariantPhase }
export type CatalogueEntry = {
  key: string
  label: string
  section: CatalogueSection
  variants: Variant[]
  owners: OwnerKind[]
  /** Copied verbatim from the document, never generated, read-only in the library. */
  fromDoc?: boolean
  /** Writing guidance for the generator, one per variant length where it matters. */
  guidance: string
  wordTarget?: Partial<Record<VariantLength, string>>
  /** Words the text must never contain (whole word, any case). A draft that contains one is regenerated, then refused. */
  forbidden?: string[]
  /** Which tools read it (informational; shown in the UI). */
  consumers: string[]
}

const v = (length: VariantLength, phase: VariantPhase): Variant => ({ length, phase })
const both = (lengths: VariantLength[]): Variant[] => lengths.flatMap(l => [v(l, 'pre'), v(l, 'post')])

export const COPY_CATALOGUE: CatalogueEntry[] = [
  { key: 'about_event', label: 'About the event', section: 'Identity', owners: ['event', 'umbrella'], consumers: ['Press release (later)', 'Invites (later)', 'SAE (later)'],
    variants: both(['one_liner', 'short', 'medium', 'long']),
    wordTarget: { one_liner: 'one sentence, about 20 words', short: 'about 50 words', medium: 'about 100 words', long: 'about 250 words' },
    guidance: 'What the event is, built only from the reference documents. Pre-event variants are in future tense ("will bring together…"); post-event variants are in past tense ("brought together…"). Use only facts and figures that appear in the documents.' },
  { key: 'organiser_line', label: 'Organiser line', section: 'Attribution', owners: ['event', 'umbrella'], consumers: ['Press release (later)', 'YouTube (later)'],
    variants: [v('long', 'any'), v('short', 'any')], wordTarget: { long: 'full form, naming every organiser, partner and the "Managed by Trescon" line as the documents give them', short: 'a real short form: the organiser and the government or client body only, for example "Organised by KSDC, Government of Karnataka". Leave out partners, supporters and the managed-by line. It must be clearly shorter than the long form' },
    guidance: 'The organiser credit exactly as the documents state it: who organises, who supports, who manages. Do not invent or reorder organisations. The long form names everyone; the short form names only the organiser and the government or client body.' },
  { key: 'attribution_line', label: 'Attribution line', section: 'Attribution', owners: ['event', 'umbrella'], consumers: ['SAE announcements'],
    variants: [v('n/a', 'any')],
    guidance: 'The approved attribution line placed after the date and venue line of an announcement. Use the client\'s approved wording from the documents verbatim if it exists; do not extend it.' },
  { key: 'cta', label: 'Call to action', section: 'Calls to action', owners: ['event', 'umbrella'], consumers: ['SAE announcements'],
    variants: [v('n/a', 'pre'), v('n/a', 'post')],
    guidance: 'One short call-to-action label (no URL; the registration link is added by the tool). The before-event version is not generated: it is copied from Common Details (the event\'s call-to-action label and registration link) so it matches what is already live. Post-event: watch the sessions or hear about the next edition.' },
  { key: 'figures_block', label: 'Key figures', section: 'Proof', owners: ['event', 'umbrella'], consumers: ['Press release (later)'],
    variants: both(['short', 'long']),
    forbidden: ['targets', 'target'],
    guidance: 'Only figures that appear in the documents\' facts sections, nothing rounded up or estimated. Frame each figure exactly the way the document frames it (its own words for what the number is, such as expected, over, more than, up to), in future tense before the event and past tense after it. Never use the word "target" or "targets" to describe a figure: say what the number is, as the document does.' },
  { key: 'programme_highlights', label: 'Programme highlights', section: 'Proof', owners: ['event', 'umbrella'], consumers: ['Press release (later)', 'Invites (later)'],
    variants: [v('short', 'any')],
    guidance: 'One line per signature programme element named in the documents, as a plain list with one line each.' },
  { key: 'press_release_ending', label: 'Press release ending', section: 'Channel blocks', owners: ['event', 'umbrella'], consumers: ['Press release (later)'],
    variants: [v('n/a', 'pre'), v('n/a', 'post')],
    guidance: 'The closing block of a press release (future tense before the event, past tense after it): an "About the event" paragraph, then the managed-by line, then the media contact if the documents give one. For a Trescon-owned event, write the About paragraph and then the single sentence "Read more about Trescon at the link below." and do NOT write or copy any Trescon company description (that is kept in one approved place).' },
  { key: 'youtube_footer', label: 'YouTube description footer', section: 'Post-event', owners: ['event', 'umbrella'], consumers: ['YouTube pipeline (later)'],
    variants: [v('n/a', 'post')],
    guidance: 'In this order: About the event (post-event tense), the organiser line, "Watch all sessions: {playlist_link}", "Website: {website}", the social links the documents give, "Subscribe to the channel for more", then three event hashtags. Keep the placeholders {playlist_link} and {website} exactly as written.' },
  { key: 'social_signoff', label: 'Social sign-off', section: 'Channel blocks', owners: ['event', 'umbrella'], consumers: ['Social posts (later)'],
    variants: [v('n/a', 'any')],
    guidance: 'The closing line of a social post: the hashtag set and the handles the documents give. Nothing else.' },
  { key: 'konfhub_description', label: 'KonfHub description', section: 'Channel blocks', owners: ['event', 'umbrella'], consumers: ['KonfHub (later)'],
    variants: [v('long', 'pre')], wordTarget: { long: 'about 200 words' },
    guidance: 'The ticketing and event-app description: what the event is, who should attend, what they will get. Future tense.' },
  { key: 'recap', label: 'Post-event recap', section: 'Post-event', owners: ['event', 'umbrella'], consumers: ['Website, social (later)'],
    variants: [v('medium', 'post')], wordTarget: { medium: 'about 100 words' },
    guidance: 'A post-event recap paragraph in past tense. Use only outcomes and figures that appear in the documents.' },
  { key: 'approved_quotes', label: 'Approved quotes', section: 'Proof', owners: ['event', 'umbrella'], fromDoc: true, consumers: ['Press release (later)', 'Invites (later)'],
    variants: [v('n/a', 'any')],
    guidance: 'A read-only mirror of the document\'s client-verbatim quotes with their exact attribution.' },
]

export const CATALOGUE_BY_KEY = new Map(COPY_CATALOGUE.map(e => [e.key, e]))
export const CATALOGUE_SECTIONS: CatalogueSection[] = ['Identity', 'Attribution', 'Proof', 'Calls to action', 'Channel blocks', 'Post-event']

export function variantLabel(v: Variant): string {
  const len = { one_liner: 'One-liner', short: 'Short', medium: 'Medium', long: 'Long', x: 'X', 'n/a': '' }[v.length]
  const ph = { pre: 'before the event', post: 'after the event', any: '' }[v.phase]
  return [len, ph].filter(Boolean).join(' · ') || 'Standard'
}

/** Every (asset_key, variant) in the starter set. */
export function starterVariants(): Array<{ asset_key: string } & Variant> {
  return COPY_CATALOGUE.flatMap(e => e.variants.map(vr => ({ asset_key: e.key, ...vr })))
}

export function isValidVariant(assetKey: string, length: string, phase: string): boolean {
  return !!CATALOGUE_BY_KEY.get(assetKey)?.variants.some(vr => vr.length === length && vr.phase === phase)
}
