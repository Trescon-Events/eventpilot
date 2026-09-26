import { convertDocxToPdf, type OfficeInputFormat } from '@/app/lib/media/cloudconvert-client'
import { extractPdfText } from '@/app/lib/pdf-text'

/* Shared by every "Full Bio" upload entry point (the public onboarding
   form's file field, the public speaker-submission portal, from-submission
   processing, and the Details page's manual upload) — a PDF is stored
   as-is; a Word doc (.doc/.docx) or PowerPoint (.ppt/.pptx, added 2026-09-26 —
   a real speaker's bio arrived as a deck) is converted via CloudConvert and ONLY
   the resulting PDF is ever stored (per Madhu, 2026-09-04: the original
   Word/PowerPoint bytes must never touch storage; `source` stays 'docx_converted'
   for both, since bio_full_source's DB check only allows pdf/docx_converted).
   Extension checked first, MIME
   type as fallback — same convention as upload-asset/route.ts's
   ALLOWED_LOGO_TYPES, since browsers inconsistently report MIME for
   legacy/office formats.

   Also extracts machine-readable text from the final PDF (2026-09-22, per
   Madhu) — every caller stores it as event_speakers.bio_full_text
   alongside bio_full_url/bio_full_source, so Short Bio generation and
   Creative Headline generation can read the bio's actual content cheaply
   (one column read) instead of downloading and re-parsing the PDF on
   every single AI call. The PDF itself stays the only thing a producer
   ever reviews in the UI — this text is never shown, purely a machine
   input. Best-effort: a scanned/image-only PDF has no extractable text,
   which is not a failure — the PDF still gets stored either way, this
   just returns '' for it rather than throwing and blocking the upload. */
export async function toStoredBioPdf(buffer: Buffer, filename: string, mimeType: string): Promise<{ pdfBuffer: Buffer; source: 'pdf' | 'docx_converted'; bioText: string }> {
  const ext = (filename.includes('.') ? filename.split('.').pop() : '')?.toLowerCase() ?? ''

  let pdfBuffer: Buffer
  let source: 'pdf' | 'docx_converted'

  if (ext === 'pdf' || mimeType === 'application/pdf') {
    pdfBuffer = buffer
    source = 'pdf'
  } else {
    const inputFormat: OfficeInputFormat | null =
      ext === 'docx' ? 'docx'
      : ext === 'doc' ? 'doc'
      : ext === 'pptx' ? 'pptx'
      : ext === 'ppt' ? 'ppt'
      : mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ? 'docx'
      : mimeType === 'application/msword' ? 'doc'
      : mimeType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' ? 'pptx'
      : mimeType === 'application/vnd.ms-powerpoint' ? 'ppt'
      : null

    if (!inputFormat) {
      throw new Error(`Unsupported file type for Full Bio (expected PDF, Word or PowerPoint): ${mimeType || ext || 'unknown'}`)
    }

    pdfBuffer = await convertDocxToPdf(buffer, inputFormat)
    source = 'docx_converted'
  }

  const bioText = await extractPdfText(pdfBuffer).catch(() => '')
  return { pdfBuffer, source, bioText }
}
