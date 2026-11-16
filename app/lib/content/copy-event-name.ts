/* Copy Library: the event's full name and its links (16 Nov 2026, Madhu). Documents often use a short name ("Dubai FinTech Summit"); every Copy Library item must use the event's own name as recorded,
   year included ("Dubai FinTech Summit 2026"). The YouTube footer also carries the website and each social channel as a real URL (a bare label is not clickable on YouTube). Pure. */

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Times the text names the event without its year. Only applies when the event's name ends in a four-digit year; hashtags (no spaces) never match. */
export function shortNameHits(text: string, eventName: string | null | undefined): number {
  const m = (eventName ?? '').trim().match(/^(.+?)\s+((?:19|20)\d{2})$/)
  if (!m) return 0
  const re = new RegExp(`\\b${escape(m[1])}\\b(?!\\s+${m[2]}\\b)`, 'g')
  return (text.match(re) ?? []).length
}

export type EventLink = { label: string; url: string }
const LINKS: Array<[string, string]> = [['Website', 'website_url'], ['LinkedIn', 'social_linkedin'], ['Instagram', 'social_instagram'], ['YouTube', 'social_youtube'], ['X', 'social_x'], ['Facebook', 'social_facebook']]

export function linksOf(row: Record<string, unknown> | null | undefined): EventLink[] {
  return LINKS.flatMap(([label, col]) => { const u = typeof row?.[col] === 'string' ? (row[col] as string).trim() : ''; return /^https?:\/\//i.test(u) ? [{ label, url: u }] : [] })
}

export const linksBlock = (links: EventLink[]): string => (links.length ? `EVENT LINKS (the only URLs to use, exactly as written)\n${links.map(l => `${l.label}: ${l.url}`).join('\n')}` : 'EVENT LINKS\n(none recorded: write no website or social lines)')

/** Links the text should carry but does not (the footer must have each recorded URL). */
export const missingLinks = (text: string, links: EventLink[]): EventLink[] => links.filter(l => !text.includes(l.url))
