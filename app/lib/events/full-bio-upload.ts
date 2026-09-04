import { convertDocxToPdf } from '@/app/lib/media/cloudconvert-client'

/* Shared by every "Full Bio" upload entry point (the public onboarding
   form's file field, and the Details page's manual upload) — a PDF is
   stored as-is; a Word doc (.doc/.docx) is converted via CloudConvert and
   ONLY the resulting PDF is ever stored (per Madhu, 2026-09-04: the
   original Word bytes must never touch storage). Extension checked first,
   MIME type as fallback — same convention as upload-asset/route.ts's
   ALLOWED_LOGO_TYPES, since browsers inconsistently report MIME for
   legacy/office formats. */
export async function toStoredBioPdf(buffer: Buffer, filename: string, mimeType: string): Promise<{ pdfBuffer: Buffer; source: 'pdf' | 'docx_converted' }> {
  const ext = (filename.includes('.') ? filename.split('.').pop() : '')?.toLowerCase() ?? ''

  if (ext === 'pdf' || mimeType === 'application/pdf') {
    return { pdfBuffer: buffer, source: 'pdf' }
  }

  const inputFormat: 'doc' | 'docx' | null =
    ext === 'docx' ? 'docx'
    : ext === 'doc' ? 'doc'
    : mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ? 'docx'
    : mimeType === 'application/msword' ? 'doc'
    : null

  if (!inputFormat) {
    throw new Error(`Unsupported file type for Full Bio (expected PDF or Word document): ${mimeType || ext || 'unknown'}`)
  }

  const pdfBuffer = await convertDocxToPdf(buffer, inputFormat)
  return { pdfBuffer, source: 'docx_converted' }
}
