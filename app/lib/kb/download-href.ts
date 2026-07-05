// Client-safe helper — no server env access. Documents uploaded through the
// KB pipeline store "r2:<key>" in source_url (private bucket, proxied
// download); documents with a manually-pasted external link store the URL
// as-is and can be linked to directly.
const KB_R2_PREFIX = 'r2:'

export function kbDownloadHref(sourceUrl: string | null, documentId: string, staffId?: string | null): string | null {
  if (!sourceUrl) return null
  if (sourceUrl.startsWith(KB_R2_PREFIX)) {
    return `/api/kb/download?document_id=${documentId}${staffId ? `&staff_id=${staffId}` : ''}`
  }
  return sourceUrl
}
