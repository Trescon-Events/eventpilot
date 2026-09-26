/* PDF -> plain text, shared by any route that needs to read a stored PDF's
   contents (originally lived only in app/api/bespoke/parse-brief/route.ts,
   extracted 2026-09-04 so app/api/events/stakeholders/speakers/[id]/
   generate-short-bio/route.ts doesn't duplicate this workaround).

   pdf-parse pinned to 1.1.1 (Nic build_request 85d7133d, 27 Jul).

   Why not v2: pdf-parse v2 is ESM-only and internally depends on
   pdfjs-dist v5, which loads a `pdf.worker.mjs` worker file at runtime.
   Next.js's server bundler on Railway does NOT include `.mjs` worker
   files in the deployed chunk output, so at request time the process
   crashes with:
     PDF parse failed: Setting up fake worker failed:
     "Cannot find module '/app/.next/server/chunks/pdf.worker.mjs'"
   v1 is pure JS, single-threaded, no worker file needed.

   Why the internal `lib/pdf-parse.js` path: v1's index.js runs an
   fs.readFile self-test at import time against a fixture PDF that
   doesn't exist inside the Next server bundle, and the CJS->ESM wrap
   in production sometimes yields `{ default: { default: fn } }`. Both
   failure modes surface as "n is not a function". Importing the
   internal module skips the self-test; the shape-walk below handles
   the wrap variance. */
type PdfParseFn = (b: Buffer, opts?: { pagerender?: (pageData: PdfPageData) => Promise<string> }) => Promise<{ text?: string }>
type PdfTextItem = { str: string; width: number; height: number; transform: number[] }
type PdfPageData = { getTextContent: (o?: { normalizeWhitespace?: boolean; disableCombineTextItems?: boolean }) => Promise<{ items: PdfTextItem[] }> }

async function loadPdfParse(): Promise<PdfParseFn> {
  const modPath = 'pdf-parse/lib/pdf-parse.js'
  const mod = (await import(/* webpackIgnore: true */ modPath)) as unknown as {
    default?: PdfParseFn | { default?: PdfParseFn }
  }
  const candidates: unknown[] = [
    mod.default,
    (mod.default as { default?: PdfParseFn } | undefined)?.default,
    mod,
  ]
  for (const c of candidates) {
    if (typeof c === 'function') return c as PdfParseFn
  }
  throw new Error('pdf-parse export shape unexpected — no callable found in default / default.default / module')
}

// pdf-parse's default page renderer glues neighbouring text items together
// with no space. Fine for PDFs whose words are single text runs (Word/Google
// Docs exports), but a PDF converted from a PowerPoint deck stores every word
// as its own item, so the whole bio came out as "MohammedSaifullahKhanisa..."
// (real case, 2026-09-26). This renderer inserts a space wherever two items on
// the same line have a visible gap between them, and a newline when the line
// changes — geometry, not guesswork.
async function renderPageWithSpacing(pageData: PdfPageData): Promise<string> {
  const content = await pageData.getTextContent({ normalizeWhitespace: false, disableCombineTextItems: false })
  let text = ''
  let last: PdfTextItem | null = null
  for (const item of content.items) {
    if (last) {
      const sameLine = Math.abs(item.transform[5] - last.transform[5]) <= Math.max(2, (last.height || 10) * 0.4)
      if (!sameLine) text += '\n'
      else if (item.transform[4] - (last.transform[4] + last.width) > (item.height || 10) * 0.12 && !text.endsWith(' ') && !item.str.startsWith(' ')) text += ' '
    }
    text += item.str
    last = item
  }
  return text + '\n'
}

// Below this share of spaces, extracted prose is almost certainly missing its
// word gaps (normal English is ~15-20% spaces; every real bio so far > 13%).
const MIN_SPACE_RATIO = 0.08

export async function extractPdfText(buffer: Buffer): Promise<string> {
  const pdfParse = await loadPdfParse()
  const text = ((await pdfParse(buffer))?.text ?? '').trim()
  if (text.length > 200 && text.split(' ').length - 1 < text.length * MIN_SPACE_RATIO) {
    const spaced = ((await pdfParse(buffer, { pagerender: renderPageWithSpacing }))?.text ?? '').trim()
    if (spaced.split(' ').length - 1 > text.split(' ').length - 1) return spaced
  }
  return text
}
