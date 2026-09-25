/* Standard file names for Passport / National ID documents (2026-09-25).

   Every document is named the moment it arrives in EventPilot:
       <Public Name>-passport.<ext>      <Public Name>-EID.<ext>
   using the speaker's Public Name field (Madhu: no legal-name handling, and no
   renaming when a name changes later — the name is set once, at arrival).

   The STORAGE KEY stays ID-based (event/speaker-id/passport-<timestamp>.<ext>) on
   purpose: no personal names in bucket paths, and nothing to keep in sync. This is
   the file_name shown in the UI, the deletion history and the vendor's ZIP.

   Public Name is filled in at speaker creation (first + last name). If it is ever
   blank when a document arrives, fall back to the record name so the file is never
   unnamed — pass both to publicNameForFile(). */

export type SensitiveDocType = 'passport' | 'national_id'

const SUFFIX: Record<SensitiveDocType, string> = { passport: 'passport', national_id: 'EID' }
const EXT_BY_MIME: Record<string, string> = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }

/** Public Name, falling back to the record name only if Public Name is blank. */
export function publicNameForFile(speaker: { public_name?: string | null; name?: string | null }): string {
  return (speaker.public_name ?? '').trim() || (speaker.name ?? '').trim()
}

// Keeps letters (incl. non-Latin), digits, spaces and ordinary punctuation; removes
// characters that are illegal or unsafe in file names / paths.
function cleanName(raw: string): string {
  return raw
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^[.\s]+|[.\s]+$/g, '')
    .slice(0, 100)
}

/** e.g. sensitiveDocumentFileName('John Travis', 'national_id', 'image/jpeg') -> 'John Travis-EID.jpg' */
export function sensitiveDocumentFileName(displayName: string, docType: SensitiveDocType, extOrMime: string): string {
  // A MIME type we don't recognise (contains '/') must not leak into the extension.
  const ext = EXT_BY_MIME[extOrMime] ?? (extOrMime.includes('/') ? '' : extOrMime.replace(/^\./, '').toLowerCase().replace(/[^a-z0-9]/g, ''))
  return `${cleanName(displayName) || 'speaker'}-${SUFFIX[docType]}.${ext || 'bin'}`
}
