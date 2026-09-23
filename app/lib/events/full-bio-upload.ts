import { convertDocxToPdf } from '@/app/lib/media/cloudconvert-client'
import { extractPdfText } from '@/app/lib/pdf-text'

/* Shared by every "Full Bio" upload entry point (the public onboarding
   form's file field, the public speaker-submission portal, from-submission
   processing, and the Details page's manual upload) — a PDF is stored
   as-is; a Word doc (.doc/.docx) is converted via CloudConvert and ONLY
   the resulting PDF is ever stored (per Madhu, 2026-09-04: the original
   Word bytes must never touch storage). Extension checked first, MIME
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
    const inputFormat: 'doc' | 'docx' | null =
      ext === 'docx' ? 'docx'
      : ext === 'doc' ? 'doc'
      : mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ? 'docx'
      : mimeType === 'application/msword' ? 'doc'
      : null

    if (!inputFormat) {
      throw new Error(`Unsupported file type for Full Bio (expected PDF or Word document): ${mimeType || ext || 'unknown'}`)
    }

    pdfBuffer = await convertDocxToPdf(buffer, inputFormat)
    source = 'docx_converted'
  }

  const bioText = await extractPdfText(pdfBuffer).catch(() => '')
  return { pdfBuffer, source, bioText }
}
