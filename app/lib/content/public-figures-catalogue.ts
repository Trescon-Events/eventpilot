/* Public figures catalogue and starter template (docs/build_suggestions/public-figures.md §5). Pure data. Built from the DFS 2025 and BSS 2025 post-event reports combined.
   "Start from template" creates every entry as an EMPTY draft; the producer keeps what applies, fills values, renames labels and adds their own.
   Public only: internal actuals and targets are not catalogued here and never will be (§3.1). */

export type FigureKind = 'figure' | 'breakdown' | 'outcome'

export type CatalogueCategory = { key: string; label: string }
export type FigureCatalogueEntry = { key: string; category: string; kind: FigureKind; label: string; help: string; basis?: 'measured' | 'estimate'; repeatable?: boolean }

export const FIGURE_CATEGORIES: CatalogueCategory[] = [
  { key: 'at_a_glance', label: 'At a glance' },
  { key: 'programme', label: 'Programme' },
  { key: 'outcomes', label: 'Outcomes' },
  { key: 'audience', label: 'Audience profile' },
  { key: 'investors', label: 'Investors' },
  { key: 'competitions', label: 'Competitions and awards' },
  { key: 'media', label: 'Media and PR' },
  { key: 'digital', label: 'Digital and social' },
]

const f = (key: string, category: string, label: string, help: string, extra: Partial<FigureCatalogueEntry> = {}): FigureCatalogueEntry => ({ key, category, kind: 'figure', label, help, ...extra })
const b = (key: string, category: string, label: string, help: string): FigureCatalogueEntry => ({ key, category, kind: 'breakdown', label, help })
const o = (key: string, category: string, label: string, help: string, extra: Partial<FigureCatalogueEntry> = {}): FigureCatalogueEntry => ({ key, category, kind: 'outcome', label, help, ...extra })

export const FIGURE_CATALOGUE: FigureCatalogueEntry[] = [
  // At a glance
  f('attendance', 'at_a_glance', 'Participants', 'Total people who took part. Usually the check-in export. Some events say "Footfall".'),
  f('speakers', 'at_a_glance', 'Speakers', 'Speakers who appeared on a stage.'),
  f('government_leaders', 'at_a_glance', 'Government leaders', 'Government representatives who attended.'),
  f('ministers', 'at_a_glance', 'Ministers and governors', 'Ministerial representations. Some events say "Ministerial representations".'),
  f('regulators', 'at_a_glance', 'Regulators', 'Regulators who attended.'),
  f('investors', 'at_a_glance', 'Investors', 'Investors who attended.'),
  f('startups', 'at_a_glance', 'Startups', 'Startups that took part.'),
  f('exhibitors', 'at_a_glance', 'Exhibitors', 'Exhibitors. Some events say "Brands".'),
  f('countries', 'at_a_glance', 'Countries', 'Countries represented.'),
  f('ecosystem_partners', 'at_a_glance', 'Ecosystem partners', 'Partners and supporters.'),
  f('unicorns', 'at_a_glance', 'Unicorns', 'Unicorn companies present.'),
  f('exchange_ceos', 'at_a_glance', 'Stock exchange CEOs', 'Stock exchange CEOs present.'),
  // Programme
  f('content_hours', 'programme', 'Content hours', 'Hours of programme.'),
  f('sessions', 'programme', 'Sessions', 'Number of sessions.'),
  f('stages', 'programme', 'Stages', 'Number of stages.'),
  f('themes', 'programme', 'Themes', 'Themes or thematic tracks.'),
  f('plenaries', 'programme', 'Plenaries', 'Plenary sessions.'),
  f('roundtables', 'programme', 'Roundtables', 'Roundtables.'),
  f('forums', 'programme', 'Forums', 'Forums.'),
  f('dialogues', 'programme', 'Dialogues', 'Dialogues.'),
  f('exhibition_arenas', 'programme', 'Exhibition arenas', 'Exhibition arenas.'),
  f('side_events', 'programme', 'Side events', 'Ecosystem or side events.'),
  o('programme_line', 'programme', 'Programme structure', 'One line, e.g. "1 Anchor Plenary · 4 Thematic Tracks · 20 Sessions".'),
  // Outcomes
  f('mous', 'outcomes', 'MoUs and partnership announcements', 'Signed or announced.'),
  f('launches', 'outcomes', 'Launches', 'Products, programmes or reports launched.'),
  o('key_announcement', 'outcomes', 'Key announcement', 'A policy launch or major announcement. Add one item per announcement.', { repeatable: true }),
  // Audience profile
  b('audience_region', 'audience', 'Audience by region', 'Percent by region.'),
  b('audience_industry', 'audience', 'Industry representation', 'Percent by industry.'),
  b('audience_role', 'audience', 'Audience by role', 'Percent by role or seniority.'),
  b('audience_decision_authority', 'audience', 'Decision authority', 'Percent by decision-making authority.'),
  b('solutions_sought', 'audience', 'Solutions sought', 'What attendees came looking for.'),
  b('exhibiting_nations', 'audience', 'Exhibiting nations', 'Where exhibitors came from.'),
  b('solutions_showcased', 'audience', 'Solutions showcased', 'What exhibitors showed.'),
  // Investors
  f('investor_aum', 'investors', 'Investor assets under management', 'Combined AUM of the investors present.'),
  b('investor_ticket_size', 'investors', 'Investor ticket sizes', 'Ticket size bands.'),
  b('investor_type', 'investors', 'Investor types', 'Type of investor.'),
  // Competitions & awards (repeat per programme with a group label)
  f('applications', 'competitions', 'Applications', 'Applications received. Use a group per competition.'),
  f('finalists', 'competitions', 'Finalists', 'Finalists chosen.'),
  f('winners', 'competitions', 'Winners', 'Number of winners.'),
  f('prize_value', 'competitions', 'Prize value', 'Total prize value.'),
  o('winner_line', 'competitions', 'Winner and runners-up', 'Winner and runners-up with their institution.'),
  f('award_categories', 'competitions', 'Award categories', 'Number of award categories.'),
  o('award_winners_line', 'competitions', 'Award winners', 'Award winners by category.'),
  // Media & PR
  f('media_outreach', 'media', 'Media outreach', 'Outlets reached.'),
  f('pr_value', 'media', 'PR value', 'Agency-estimated PR value.', { basis: 'estimate' }),
  f('media_reps', 'media', 'Media representatives', 'Journalists who attended.'),
  f('press_releases', 'media', 'Press releases', 'Press releases issued.'),
  f('articles', 'media', 'Articles', 'Articles published.'),
  f('total_coverage', 'media', 'Total coverage', 'Pieces of coverage.'),
  f('broadcast', 'media', 'TV and radio', 'Broadcast coverage.'),
  f('interviews', 'media', 'Interviews', 'Interviews given.'),
  f('circulation', 'media', 'Circulation and potential page views', 'Agency estimate of potential readers.', { basis: 'estimate' }),
  // Digital & social (a group per channel: LinkedIn, Meta, Google)
  f('digital_reach', 'digital', 'Total reach', 'Reach. Use a group per channel.'),
  f('impressions', 'digital', 'Impressions', 'Impressions.'),
  f('views', 'digital', 'Views', 'Views.'),
  f('interactions', 'digital', 'Interactions', 'Interactions.'),
  f('accounts_reached', 'digital', 'Accounts reached', 'Accounts reached.'),
  f('website_visits', 'digital', 'Website visits', 'Visits to the event website.'),
]

export const FIGURE_CATALOGUE_BY_KEY = new Map(FIGURE_CATALOGUE.map(e => [e.key, e]))
export const FIGURE_CATEGORY_LABEL = new Map(FIGURE_CATEGORIES.map(c => [c.key, c.label]))

/** The entries "Add group" copies for a category (a second competition, a channel). */
export const entriesForCategory = (category: string): FigureCatalogueEntry[] => FIGURE_CATALOGUE.filter(e => e.category === category)

/** Categories where a group label makes sense (the same set of figures repeated per programme or channel). */
export const GROUPABLE_CATEGORIES = new Set(['competitions', 'digital'])

export function categoryLabel(key: string): string { return FIGURE_CATEGORY_LABEL.get(key) ?? key }
