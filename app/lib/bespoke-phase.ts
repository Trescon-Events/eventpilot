/*
  Bespoke Tracker · shared phase logic.

  One source of truth for turning a project's (contract_signed_date, event_date)
  pair into the active phase. Used by:
    - the single-event dashboard's PHASE stat card + Phase Progress strip
    - the main tracker board's dynamic Kanban column filtering

  Phases (founder-locked labels, 2026-07-23 rename per Nic build_request #490f6974):
    1. Kickoff & Alignment   — first 15% of runway
    2. Outreach Runway       — 15% to 83%
    3. Live Execution        — 83% to 100% (or event today)
    4. Reporting & Settlement — current date is past event_date

  Safe-by-default: any missing / unparseable date returns null so the caller
  can render a fallback ("Kickoff & Alignment" for the PHASE card, "no
  timeline" for the progress strip). Never throws.
*/

export type BespokePhaseNum = 1 | 2 | 3 | 4

export type BespokePhaseInfo = {
  activePhase: BespokePhaseNum
  key: 'kickoff' | 'outreach' | 'live' | 'settlement'
  label: string
  color: string
  bgColor: string
  dayOf: number
  totalRunway: number
  daysRemaining: number
  concluded: boolean
}

export const BESPOKE_PHASES: Array<{ num: BespokePhaseNum; key: BespokePhaseInfo['key']; label: string; color: string; bgColor: string }> = [
  { num: 1, key: 'kickoff',    label: 'Kickoff & Alignment',   color: '#B45309', bgColor: '#FFF8E1' }, // Orange / Amber
  { num: 2, key: 'outreach',   label: 'Outreach Runway',       color: '#00695C', bgColor: '#E0F2F1' }, // Teal
  { num: 3, key: 'live',       label: 'Live Execution',        color: '#2E7D32', bgColor: '#E8F5E9' }, // Green
  { num: 4, key: 'settlement', label: 'Reporting & Settlement', color: '#6B7280', bgColor: '#F0F4F8' }, // Gray
]

const KICKOFF_UNTIL = 0.15
const OUTREACH_UNTIL = 0.83

// Returns null when either date is missing / invalid. Never throws.
export function computeBespokePhase(
  contractSignedDate: string | null | undefined,
  eventDate: string | null | undefined,
  now: Date = new Date(),
): BespokePhaseInfo | null {
  try {
    if (!contractSignedDate || !eventDate) return null
    const start = new Date(contractSignedDate)
    const end = new Date(eventDate)
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return null

    const today = new Date(now.toISOString().split('T')[0])
    const totalRunway = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86400000))
    const dayOf = Math.max(0, Math.ceil((today.getTime() - start.getTime()) / 86400000))
    const daysRemaining = Math.max(0, Math.ceil((end.getTime() - today.getTime()) / 86400000))

    if (today > end) {
      const p = BESPOKE_PHASES[3]
      return { activePhase: 4, key: p.key, label: p.label, color: p.color, bgColor: p.bgColor, dayOf, totalRunway, daysRemaining: 0, concluded: true }
    }

    const frac = dayOf / totalRunway
    const idx: 0 | 1 | 2 = frac < KICKOFF_UNTIL ? 0 : frac < OUTREACH_UNTIL ? 1 : 2
    const p = BESPOKE_PHASES[idx]
    return { activePhase: (idx + 1) as BespokePhaseNum, key: p.key, label: p.label, color: p.color, bgColor: p.bgColor, dayOf, totalRunway, daysRemaining, concluded: false }
  } catch {
    return null
  }
}

// Fallback label + color for when compute returns null (missing dates).
export const BESPOKE_PHASE_FALLBACK = BESPOKE_PHASES[0]

// Format days-left / days-ago into a human string. Concluded events collapse
// to the literal "Concluded" so we never render "-1 days ago" / "1d ago".
export function formatDaysRelative(eventDate: string | null | undefined): { label: string; isConcluded: boolean; days: number | null } {
  if (!eventDate) return { label: '--', isConcluded: false, days: null }
  try {
    const days = Math.ceil((new Date(eventDate).getTime() - Date.now()) / 86400000)
    if (isNaN(days)) return { label: '--', isConcluded: false, days: null }
    if (days < 0)  return { label: 'Concluded', isConcluded: true, days }
    if (days === 0) return { label: 'Event Day', isConcluded: false, days: 0 }
    return { label: `${days} days left`, isConcluded: false, days }
  } catch {
    return { label: '--', isConcluded: false, days: null }
  }
}
