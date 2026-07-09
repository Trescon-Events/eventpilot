// Permalink domain is chosen per-document by visibility, not a single constant:
// - public documents  -> docs.tresconevents.com (a separate domain Trescon owns,
//   kept apart from tresconglobal.com so a large, growing volume of public
//   document links/crawler traffic never touches the main platform domain)
// - internal documents -> docuhub.tresconglobal.com, unchanged — internal-visibility
//   access relies on the tcs_session cookie, which is only ever shareable within
//   the tresconglobal.com domain family (cookies can't cross to a different
//   registrable domain like tresconevents.com).
export const PUBLIC_DOCUHUB_DOMAIN = 'docs.tresconevents.com'
export const INTERNAL_DOCUHUB_DOMAIN = 'docuhub.tresconglobal.com'

export function docuhubDomain(visibility: string): string {
  return visibility === 'public' ? PUBLIC_DOCUHUB_DOMAIN : INTERNAL_DOCUHUB_DOMAIN
}
