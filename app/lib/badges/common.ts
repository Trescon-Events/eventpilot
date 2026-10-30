/* Common Badges — one finished design printed N times, no names (security, protocol, organiser passes). A "common" batch has `quantity` set and exactly one item: the design. */
export const MAX_COMMON_QUANTITY = 5000

/** A whole number from 1 to MAX_COMMON_QUANTITY, else null. Accepts numbers and digit strings. */
export function parseQuantity(v: unknown): number | null {
  const n = typeof v === 'string' && /^\s*\d+\s*$/.test(v) ? Number(v) : typeof v === 'number' ? v : NaN
  return Number.isInteger(n) && n >= 1 && n <= MAX_COMMON_QUANTITY ? n : null
}
