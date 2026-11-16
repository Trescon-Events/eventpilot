import type { PublicFigure } from './public-figures-read'
import { numberTokens } from './public-figures-model'

/* Copy Library x public figures (step 2 of "figures in two phases"). Pure, no database.
   The approved figures are the ONLY source of statistics in generated copy: the pre-event figures for "pre" copy, the post-event figures for "post" copy, none for "any" copy.
   The messaging document supplies names, wording and tone; its own numbers can be old plans or targets and are not statistics to repeat. */

export type Phase = 'pre' | 'post'

export const figureValue = (f: PublicFigure): string => {
  const p = f.payload
  return f.kind === 'figure' ? (p.display ?? '') : f.kind === 'outcome' ? (p.text ?? '') : (p.rows ?? []).map(r => `${r.label} ${r.display}`).join('; ')
}
const line = (f: PublicFigure) => `- ${f.group_label ? `${f.group_label}: ` : ''}${f.label}: ${figureValue(f)}`

/** The figures a model may be shown: single figures and outcomes (breakdowns stay out of prose, as in the key-figures block). */
export const promptFigures = (figs: PublicFigure[]): PublicFigure[] => figs.filter(f => f.kind !== 'breakdown' && figureValue(f).trim())

/** The block that goes into a generation prompt: the approved figures per phase, or a plain "none approved yet". */
export function figuresPromptBlock(byPhase: Record<Phase, PublicFigure[]>): string {
  const part = (ph: Phase, title: string) => { const fs = promptFigures(byPhase[ph]); return `${title}\n${fs.length ? fs.map(line).join('\n') : '(none approved yet: state NO statistics in these variants)'}` }
  return `APPROVED FIGURES (the ONLY source of statistics; copy each exactly as written)\n${part('pre', 'For variants with phase="pre" (before the event):')}\n\n${part('post', 'For variants with phase="post" (after the event):')}\n\nVariants with phase="any" must not state any statistics.`
}

/** The same block for a tool that writes for ONE phase (a press release for the event's current phase). */
export function figuresPromptBlockFor(phase: Phase, figs: PublicFigure[]): string {
  const fs = promptFigures(figs)
  return `APPROVED ${phase === 'pre' ? 'PRE-EVENT' : 'POST-EVENT'} FIGURES (the ONLY source of statistics; copy each exactly as written)\n${fs.length ? fs.map(line).join('\n') : '(none approved yet: state NO statistics)'}`
}

export const STAT_RULE = `- STATISTICS (attendance, counts of speakers, sessions, countries, partners, exhibitors, media numbers, money, percentages, results or targets) may be taken ONLY from the APPROVED FIGURES for that variant's phase, copied exactly as written. The documents' own statistics may be old plans or targets: never repeat them. If there is no approved figure for something, leave the number out; do not estimate, round or combine figures. Names, titles, dates, places and wording still come from the documents and event facts.`

/** Years and single digits are not statistics (dates, "two-day", "Phase 2"). Everything else is a number claim that needs a source. */
const isClaim = (n: string): boolean => !/^(19|20)\d{2}$/.test(n) && n.replace(/[^\d]/g, '').length > 1 || /\./.test(n)

/** The numbers in `text` that are neither in the approved figures for its phase nor in the event facts (dates, venue). Empty = every number is accounted for. */
export function unapprovedNumbers(text: string, figs: PublicFigure[], facts: string): string[] {
  const allowed = new Set(numberTokens(`${figs.map(figureValue).join('\n')}\n${figs.map(f => f.label).join('\n')}\n${facts}`))
  return [...new Set(numberTokens(text).filter(n => isClaim(n) && !allowed.has(n)))]
}

/** Which figures a piece of text actually uses: those whose displayed value appears in it. Recorded as source references, so re-approving or withdrawing a figure flags exactly these items. */
export function figureRefsIn(text: string, figs: PublicFigure[]): PublicFigure[] {
  const have = new Set(numberTokens(text))
  return figs.filter(f => {
    const toks = numberTokens(figureValue(f)).filter(isClaim)
    return toks.length > 0 && toks.every(t => have.has(t))
  })
}

/** The figures that apply to a copy variant: its own phase's; "any" copy has none (it must read right before and after the event, so it carries no statistics). */
export const figuresForVariant = (phase: 'pre' | 'post' | 'any', byPhase: Record<Phase, PublicFigure[]>): PublicFigure[] => (phase === 'any' ? [] : byPhase[phase])

/** Asset keys whose text is the client's own words or fixed lines, not generated prose: never number-checked. */
export const NO_STAT_CHECK = new Set(['approved_quotes', 'cta', 'attribution'])
