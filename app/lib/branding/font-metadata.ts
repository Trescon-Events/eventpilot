// Reads the family/style name straight out of an uploaded font file's own
// binary metadata (the OpenType 'name' table, present in TTF/OTF/WOFF/
// WOFF2 alike) — so the branding team never types a font name by hand.
// Madhu's reasoning: free-typed names are unreliable ("they'll type
// something random") and won't match what the font actually is, whereas
// the file itself always knows its own real name.
import { create as createFont } from 'fontkit'

export type ParsedFontFile = {
  familyName: string
  subfamilyName: string
  isBold: boolean
  weight: number // 100-900, nearest standard CSS weight bucket
}

// Subfamily-name fallback (2026-08-04, full weight support) — not every
// font file's OS/2.usWeightClass is reliably set (some hand-exported/older
// files leave it at the 400 default regardless of actual weight), but the
// STYLE name almost always says what it is. Longest/most-specific terms
// first so "Extra Bold" matches before the plainer "Bold" pattern would.
const WEIGHT_NAME_PATTERNS: [RegExp, number][] = [
  [/extra\s*-?\s*light|ultra\s*-?\s*light/i, 200],
  [/semi\s*-?\s*bold|demi\s*-?\s*bold/i, 600],
  [/extra\s*-?\s*bold|ultra\s*-?\s*bold/i, 800],
  [/thin|hairline/i, 100],
  [/light/i, 300],
  [/medium/i, 500],
  [/black|heavy/i, 900],
  [/bold/i, 700],
  [/regular|normal|book/i, 400],
]

// Rounds an arbitrary OS/2 weight class (spec allows 1-1000, real files
// sometimes use odd values) to the nearest standard 100-step CSS bucket —
// matches how browsers/OSes already treat font-weight matching.
function roundToStandardWeight(raw: number): number {
  const clamped = Math.max(100, Math.min(900, raw))
  return Math.round(clamped / 100) * 100
}

export function parseFontMetadata(buffer: Buffer): ParsedFontFile {
  // fontkit.create() returns a single Font for TTF/OTF/WOFF/WOFF2, or a
  // FontCollection (.fonts[]) for a .ttc/.otc bundle — take the first face
  // in that case, matching how a single upload slot is used elsewhere here.
  const parsed = createFont(buffer)
  const font = 'fonts' in parsed ? parsed.fonts[0] : parsed
  if (!font) throw new Error('Could not read any font face from this file')

  // Preferred (Typographic) Family — OpenType 'name' table ID 16 — BEFORE
  // the legacy family (.familyName, ID 1) (2026-09-28, real bug found live:
  // Lufga's own files). ID 1 exists for old software that only ever
  // supported four styles per family (Regular/Bold/Italic/BoldItalic), so
  // many professionally-built families with more than four weights set a
  // DIFFERENT legacy family per weight (e.g. "Lufga Thin", "Lufga Medium")
  // while ID 16 correctly says "Lufga" for every one of them — confirmed
  // directly against the real files: 14 of Lufga's 18 have preferredFamily
  // "Lufga", the other 4 (Regular/Bold/Italic/BoldItalic) have none set at
  // all but their legacy name already happens to be "Lufga" too, so this
  // unifies all 18 under one family either way. Falls back to the legacy
  // name when ID 16 is absent, same as before this fix, for every font
  // that never had this problem in the first place.
  // @types/fontkit marks `lang` as required even though the JS
  // implementation defaults it — 'en' matches getName()'s own internal
  // fallback chain regardless of what's actually passed.
  const preferredFamily = typeof font.getName === 'function' ? font.getName('preferredFamily', 'en')?.trim() : null
  const familyName = preferredFamily || font.familyName?.trim()
  if (!familyName) throw new Error('This font file has no family name in its metadata')

  const subfamilyName = font.subfamilyName?.trim() ?? ''
  const weightClass = font['OS/2']?.usWeightClass

  // Prefer a real OS/2 weight class UNLESS it's sitting at the generic 400
  // default while the subfamily name clearly claims something else (the
  // "reliably-unset" case this fallback exists for) — a genuine 400 file
  // whose name also says "Regular" still correctly resolves to 400 either way.
  const namedWeight = WEIGHT_NAME_PATTERNS.find(([re]) => re.test(subfamilyName))?.[1]
  const weight = (typeof weightClass === 'number' && weightClass > 0 && !(weightClass === 400 && namedWeight && namedWeight !== 400))
    ? roundToStandardWeight(weightClass)
    : (namedWeight ?? 400)

  const isBold = weight >= 600 || /bold/i.test(subfamilyName)

  return { familyName, subfamilyName, isBold, weight }
}
