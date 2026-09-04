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
export async function extractPdfText(buffer: Buffer): Promise<string> {
  type PdfParseFn = (b: Buffer) => Promise<{ text?: string }>
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
    if (typeof c === 'function') {
      const result = await (c as PdfParseFn)(buffer)
      return (result?.text ?? '').trim()
    }
  }
  throw new Error('pdf-parse export shape unexpected — no callable found in default / default.default / module')
}
