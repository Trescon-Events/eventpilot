/* Shared AIRS computation — single source of truth used by API routes and client pages */

/*
  Score = base (from questionnaire ai_readiness) + course completion bonus
  Base:   questionnaire avg maps 1–5 → 10–75
  Bonus:  foundation course passed = +1.5 pts, adoption = +2.5, advanced = +4
  Bonus capped at 25 pts so courses can never fully substitute the questionnaire
  Total capped at 100
*/
export function computeAIRS(
  tasks:       { ai_readiness: number }[],
  completions?: { passed: boolean; courses?: { tier_level: string } | null }[],
): number {
  if (!tasks.length) return 0
  const avg  = tasks.reduce((s, t) => s + (t.ai_readiness ?? 1), 0) / tasks.length
  const base = Math.round(((avg - 1) / 4) * 65 + 10)

  if (!completions?.length) return base

  const bonus = completions
    .filter(c => c.passed)
    .reduce((total, c) => {
      const tier = c.courses?.tier_level
      if (tier === 'advanced')   return total + 4
      if (tier === 'adoption')   return total + 2.5
      if (tier === 'foundation') return total + 1.5
      return total + 1
    }, 0)

  return Math.min(100, Math.round(base + Math.min(25, bonus)))
}

export function getTier(score: number): string {
  if (score >= 75) return 'AI-Forward'
  if (score >= 55) return 'AI-Ready'
  if (score >= 35) return 'AI-Aware'
  if (score >= 15) return 'AI-Curious'
  return 'AI-Unaware'
}

export function getTrack(score: number): 'foundation' | 'adoption' | 'advanced' {
  if (score >= 55) return 'advanced'
  if (score >= 35) return 'adoption'
  return 'foundation'
}

export const TIER_COLORS: Record<string, { color: string; bg: string; border: string }> = {
  'AI-Forward': { color: '#166534', bg: '#16653415', border: '#16653440' },
  'AI-Ready':   { color: '#0E7490', bg: '#0E749015', border: '#0E749040' },
  'AI-Aware':   { color: '#92400E', bg: '#92400E15', border: '#92400E40' },
  'AI-Curious': { color: '#C2410C', bg: '#C2410C15', border: '#C2410C40' },
  'AI-Unaware': { color: '#991B1B', bg: '#991B1B15', border: '#991B1B40' },
}

export const TRACK_COLORS: Record<string, { color: string; bg: string; label: string }> = {
  foundation: { color: '#0E7490', bg: 'rgba(14,116,144,0.12)',  label: 'Foundation' },
  adoption:   { color: '#7C3AED', bg: 'rgba(124,58,237,0.12)', label: 'Adoption'   },
  advanced:   { color: '#166534', bg: 'rgba(22,101,52,0.12)',  label: 'Advanced'   },
}
