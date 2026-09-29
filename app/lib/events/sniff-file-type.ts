/* Real file type from the bytes, never from the filename or the browser's
   declared MIME (2026-09-29). Producers rename/misname files constantly — a
   PDF saved as ".jpg" (FSF's Manosij Ganguli passport), a Word file with a
   .pdf extension, an iPhone HEIC named .jpg — and every upload path (manual
   upload or speaker submission) should just cope. Callers fall back to the
   declared type only when this returns null. */
export type SniffedType = { mime: string; ext: string }

export function sniffFileType(buf: Buffer): SniffedType | null {
  if (buf.length < 12) return null
  if (buf.subarray(0, 5).toString('latin1') === '%PDF-') return { mime: 'application/pdf', ext: 'pdf' }
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' }
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mime: 'image/png', ext: 'png' }
  if (buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return { mime: 'image/webp', ext: 'webp' }
  if (buf.subarray(0, 2).toString('latin1') === 'PK') {
    // OOXML container: tell Word from PowerPoint by an entry path present in the zip directory.
    const head = buf.toString('latin1')
    if (head.includes('word/')) return { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', ext: 'docx' }
    if (head.includes('ppt/')) return { mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', ext: 'pptx' }
  }
  if (buf.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]))) return { mime: 'application/msword', ext: 'doc' } // legacy .doc/.ppt share this container; callers' extension picks between them
  return null
}
