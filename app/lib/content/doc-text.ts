import { contentText } from './edit-diff'

/* The text of a reference doc as the tools see it. Pure, no database.

   A doc row keeps two copies of its text. `structured_json.sections` is the LIVE doc: it is what Copy Library, the reference compiler and the guidelines API read, and what every
   edit (chat edit, producer edit) changes. `raw_text` is the text extracted from the uploaded PDF at upload time. It is the ORIGINAL UPLOAD and goes stale as soon as a section is
   edited: a wording fixed in the sections stays as it was in raw_text. So tools use the sections, and raw_text only for a doc that has no sections yet (extraction not finished or failed).

   Only PUBLISHED section text is returned: the title and the content. A section's `change_note` is an internal record of how it was edited ("Replace X with Y"), often quoting the old,
   wrong wording, so it is never text to read, generate from or rule-check. Any check that scans doc sections must go through here. */

export type DocSectionLike = { id?: unknown; title?: unknown; content?: unknown; change_note?: unknown; [k: string]: unknown }
export type DocLike = { structured_json?: { sections?: unknown } | null; raw_text?: string | null }

/** Published text of each section (title and content only), skipping sections with no content. */
export function publishedSectionTexts(sections: unknown): { id: string; title: string; text: string }[] {
  if (!Array.isArray(sections)) return []
  return (sections as DocSectionLike[])
    .map(s => ({ id: String(s?.id ?? ''), title: typeof s?.title === 'string' ? s.title : '', text: contentText(s?.content).trim() }))
    .filter(s => s.text)
}

/** The doc's text for a tool that needs the document itself: the live sections, else the original upload. `from` says which. */
export function docSourceText(doc: DocLike): { text: string; from: 'sections' | 'raw_text' | 'none' } {
  const sections = publishedSectionTexts(doc.structured_json?.sections)
  if (sections.length) return { text: sections.map(s => (s.title ? `${s.title}\n${s.text}` : s.text)).join('\n\n'), from: 'sections' }
  const raw = (doc.raw_text ?? '').trim()
  return raw ? { text: raw, from: 'raw_text' } : { text: '', from: 'none' }
}
