/* eslint-disable no-restricted-syntax -- these hex values are DATA sent to
   KonfHub (session_colour is a hex string there), not styling: the UI itself
   only ever uses the theme tokens below, via var(--token). */

// Session colour is stored either as a theme token name ("teal", "purple", …
// — what the Agenda Builder writes) or as a raw hex string (what KonfHub
// sessions arrive with). The UI resolves both through colourToCss().
export const COLOUR_TOKENS = ['teal', 'info', 'purple', 'amber', 'red', 'orange', 'indigo', 'success'] as const
export type ColourToken = typeof COLOUR_TOKENS[number]

const HEX_FOR_KONFHUB: Record<ColourToken, string> = {
  teal: '#0EA79D', info: '#5AA9F2', purple: '#A78BFA', amber: '#F5B94D', red: '#F1667A', orange: '#FB923C', indigo: '#818CF8', success: '#34D399',
}

export const isColourToken = (v: string | null | undefined): v is ColourToken => !!v && (COLOUR_TOKENS as readonly string[]).includes(v)

/** CSS colour for a stored session colour (token name, hex, or null → fallback token). */
export function colourToCss(v: string | null | undefined, fallback: ColourToken = 'teal'): string {
  if (isColourToken(v)) return `var(--${v})`
  if (v && /^#[0-9a-f]{3,8}$/i.test(v)) return v
  return `var(--${fallback})`
}

/** Hex for KonfHub's session_colour (it only accepts hex); hex passes through, tokens map to their theme value. */
export function colourToKonfhubHex(v: string | null | undefined): string | undefined {
  if (!v) return undefined
  if (isColourToken(v)) return HEX_FOR_KONFHUB[v]
  return /^#[0-9a-f]{3,8}$/i.test(v) ? v : undefined
}
