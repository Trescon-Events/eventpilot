import { supabaseAdmin } from '@/app/lib/supabase'
import { getPublicFigures, type PublicFigure } from './public-figures-read'
import { STAT_RULE, figureValue, figuresPromptBlockFor, promptFigures, unapprovedNumbers, type Phase } from './copy-figures'

/* What a tool that writes ONE document for an event (a press release, later others) needs from the approved figures: the event's current phase, that phase's approved figures
   as a prompt block, the dates and venue (numbers that are not statistics), and a check for numbers that are not approved figures. Never throws: no figures = no statistics. */

export type FiguresContext = { phase: Phase; figures: PublicFigure[]; facts: string; block: string; rule: string }

export async function figuresContextFor(eventId: string): Promise<FiguresContext> {
  try {
    const { data: ev } = await supabaseAdmin.from('events').select('content_phase, public_dates_display, public_venue_display, venue, city, name').eq('id', eventId).maybeSingle()
    const phase: Phase = ev?.content_phase === 'post' ? 'post' : 'pre'
    const figures = await getPublicFigures(eventId, { phase })
    const facts = [ev?.name, ev?.public_dates_display, ev?.public_venue_display, ev?.venue, ev?.city].filter(Boolean).join('\n')
    return { phase, figures, facts, block: figuresPromptBlockFor(phase, figures), rule: STAT_RULE }
  } catch { return { phase: 'pre', figures: [], facts: '', block: figuresPromptBlockFor('pre', []), rule: STAT_RULE } }
}

/** Numbers in generated text that are not approved figures of the phase (or the event's dates and venue). */
export const unapprovedIn = (text: string, c: FiguresContext): string[] => unapprovedNumbers(text, c.figures, c.facts)

/** For tools that feed the doc's sections into a prompt themselves: the same sections plus one closing "Statistics" section holding the event's approved figures for its current phase.
    The doc's own sections no longer carry statistics once they are moved to Stats, so without this such a tool would have none (and must state none). Never throws. */
export async function withStatisticsSection<T>(eventId: string, sections: T[] | null | undefined): Promise<T[] | null> {
  const c = await figuresContextFor(eventId)
  const lines = promptFigures(c.figures).map(f => `- ${f.group_label ? `${f.group_label}: ` : ''}${f.label}: ${figureValue(f)}`)
  const stats = {
    id: 'statistics', order: 9999, title: `Statistics (${c.phase === 'pre' ? 'pre-event' : 'post-event'}, approved)`, kind: 'text',
    content: lines.length ? `These are the ONLY statistics to use for this phase. Copy each exactly as written; no other statistic may appear.\n${lines.join('\n')}` : 'No statistics are approved for this phase yet: state no statistics.',
  } as unknown as T
  return [...(sections ?? []), stats]
}
