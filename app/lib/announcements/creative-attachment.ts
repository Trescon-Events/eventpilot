// Self Promo "Send to Speaker" (2026-08-18): every consumer of
// stakeholder_announcements.creative_url (Publishing panel's Postiz push,
// Social Calendar previews, this file's own caller) reads the same
// lossless PNG — that's correct for those, but wrong for a Graph sendMail
// attachment: Graph's sendMail is single-shot with no large-attachment
// upload-session path (that only exists on draft-message resources), and
// this canvas size's PNG routinely runs 1.5-4MB, over the practical inline
// ceiling. Re-encode to JPEG at send time only — the stored PNG is never
// touched.
import sharp from 'sharp'
import { fetchAssetBuffer } from './asset-buffer-cache'

// Comfortably under Graph's actual inline-attachment limit (base64 inflates
// the wire size ~33% on top of this) — chosen as a practical ceiling for a
// single-image email attachment, not Graph's hard maximum.
const MAX_ATTACHMENT_BYTES = 3 * 1024 * 1024

export type CreativeAttachmentResult =
  | { kind: 'attachment'; filename: string; contentType: string; contentBytes: string }
  | { kind: 'link_fallback' }

export async function buildCreativeAttachment(creativeUrl: string, filename = 'creative.jpg'): Promise<CreativeAttachmentResult> {
  const buffer = await fetchAssetBuffer(creativeUrl)
  if (!buffer) return { kind: 'link_fallback' }

  const jpeg = await sharp(buffer).jpeg({ quality: 88 }).toBuffer()
  if (jpeg.length > MAX_ATTACHMENT_BYTES) return { kind: 'link_fallback' }

  return { kind: 'attachment', filename, contentType: 'image/jpeg', contentBytes: jpeg.toString('base64') }
}
