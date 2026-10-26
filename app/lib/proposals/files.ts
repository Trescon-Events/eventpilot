import { unzipSync, strFromU8 } from 'fflate'
import { extractPdfText } from '@/app/lib/pdf-text'

/* Speaker Proposals — files a producer drops in the "Files" box. What each kind gives the research:
     image    → a headshot (becomes a photo) or a screenshot of text (read) — decided by the AI in the drop route
     PDF, Word (.docx), PowerPoint (.pptx), text → the words in them
   The text is stored with the speaker's info and read when the research runs. */

export type ProposalFile = { id: string; name: string; kind: 'photo' | 'text' | 'ignored'; chars: number; text?: string; url?: string; note?: string }
export const MAX_FILES = 10
export const MAX_FILE_TEXT = 20_000
export const MAX_FILE_BYTES = 12 * 1024 * 1024
export const IMAGE_TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }
export const DOC_EXT = /\.(pdf|docx|pptx|txt|md)$/i

const unxml = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')

/** Words of a Word file: paragraph by paragraph, tabs and line breaks kept. */
export function docxText(buf: Uint8Array): string {
  const files = unzipSync(buf, { filter: f => f.name === 'word/document.xml' })
  const xml = files['word/document.xml']; if (!xml) throw new Error('This does not look like a Word file.')
  return unxml(strFromU8(xml).replace(/<w:tab\b[^>]*\/>/g, '\t').replace(/<w:br\b[^>]*\/>/g, '\n').replace(/<\/w:p>/g, '\n').replace(/<[^>]+>/g, '')).replace(/\n{3,}/g, '\n\n').trim()
}
/** Words of a PowerPoint file: each slide in order. */
export function pptxText(buf: Uint8Array): string {
  const files = unzipSync(buf, { filter: f => /^ppt\/slides\/slide\d+\.xml$/.test(f.name) })
  const slides = Object.keys(files).sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]))
  if (!slides.length) throw new Error('This does not look like a PowerPoint file.')
  return slides.map(n => unxml(strFromU8(files[n]).replace(/<\/a:p>/g, '\n').replace(/<[^>]+>/g, '')).replace(/\n{2,}/g, '\n').trim()).filter(Boolean).join('\n\n')
}

export async function extractFileText(buf: Buffer, name: string): Promise<string> {
  const ext = name.toLowerCase().slice(name.lastIndexOf('.'))
  const text = ext === '.pdf' ? await extractPdfText(buf) : ext === '.docx' ? docxText(buf) : ext === '.pptx' ? pptxText(buf) : ext === '.txt' || ext === '.md' ? buf.toString('utf-8') : null
  if (text === null) throw new Error('Use a PDF, Word (.docx), PowerPoint (.pptx), text file or an image. Older .doc / .ppt files: save them as .docx / .pptx first.')
  return text.trim().slice(0, MAX_FILE_TEXT)
}

/** What the research reads from the files: every text file under its name. */
export const filesBlock = (files: ProposalFile[] | null | undefined): string => (files ?? []).filter(f => f.kind === 'text' && f.text).map(f => `[File: ${f.name}]\n${f.text}`).join('\n\n').slice(0, 30_000)

/** Links the producer listed, one per line. Anything that is not a web address is returned separately so the page can say so. */
export function parseLinks(raw: string | null | undefined): { urls: string[]; bad: string[] } {
  const urls: string[] = [], bad: string[] = []
  for (const line of (raw ?? '').split(/\r?\n/)) {
    const t = line.trim(); if (!t) continue
    const u = /^https?:\/\//i.test(t) ? t : /^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(t) ? `https://${t}` : null
    try { if (u && new URL(u).hostname.includes('.')) { if (!urls.includes(u)) urls.push(u); continue } } catch { /* falls through to bad */ }
    bad.push(t)
  }
  return { urls: urls.slice(0, 20), bad }
}
