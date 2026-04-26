/* Shared TAIRS computation — single source of truth used by API routes and client pages */

/*
  Score = base (from questionnaire ai_readiness) + course completion bonus
  Base:   questionnaire avg maps 1–5 → 10–75
  Bonus:  foundation course passed = +1.5 pts, adoption = +2.5, advanced = +4
  Bonus capped at 25 pts so courses can never fully substitute the questionnaire
  Total capped at 100
*/
export function computeTAIRS(
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
  'AI-Forward': { color: '#C0F43C', bg: '#C0F43C15', border: '#C0F43C40' },
  'AI-Ready':   { color: '#00A5A3', bg: '#00A5A315', border: '#00A5A340' },
  'AI-Aware':   { color: '#F4ED3C', bg: '#F4ED3C15', border: '#F4ED3C40' },
  'AI-Curious': { color: '#FF9F43', bg: '#FF9F4315', border: '#FF9F4340' },
  'AI-Unaware': { color: '#FF6B6B', bg: '#FF6B6B15', border: '#FF6B6B40' },
}

export const TRACK_COLORS: Record<string, { color: string; bg: string; label: string }> = {
  foundation: { color: '#FF9F43', bg: 'rgba(255,159,67,0.12)', label: 'Foundation' },
  adoption:   { color: '#00A5A3', bg: 'rgba(0,165,163,0.12)',  label: 'Adoption'   },
  advanced:   { color: '#C0F43C', bg: 'rgba(192,244,60,0.12)', label: 'Advanced'   },
}
