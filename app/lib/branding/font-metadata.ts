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
}

export function parseFontMetadata(buffer: Buffer): ParsedFontFile {
  // fontkit.create() returns a single Font for TTF/OTF/WOFF/WOFF2, or a
  // FontCollection (.fonts[]) for a .ttc/.otc bundle — take the first face
  // in that case, matching how a single upload slot is used elsewhere here.
  const parsed = createFont(buffer)
  const font = 'fonts' in parsed ? parsed.fonts[0] : parsed
  if (!font) throw new Error('Could not read any font face from this file')

  const familyName = font.familyName?.trim()
  if (!familyName) throw new Error('This font file has no family name in its metadata')

  const subfamilyName = font.subfamilyName?.trim() ?? ''
  const weightClass = font['OS/2']?.usWeightClass
  const isBold = /bold/i.test(subfamilyName) || (typeof weightClass === 'number' && weightClass >= 700)

  return { familyName, subfamilyName, isBold }
}
