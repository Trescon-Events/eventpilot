import { NextRequest, NextResponse } from 'next/server'

interface ExtractResult {
  name?: string
  website?: string
  raw: string
  _row?: Record<string, string>
}

/* ── URL / domain patterns ── */
const URL_RE = /https?:\/\/[^\s,;"'<>()[\]{}]+/gi
const DOMAIN_RE = /(?:www\.)?[a-zA-Z0-9-]+\.[a-zA-Z]{2,}(?:\.[a-zA-Z]{2,})?/g

function extractFromText(text: string): ExtractResult[] {
  const lines  = text.split(/[\n\r]+/).map(l => l.trim()).filter(Boolean)
  const seen   = new Set<string>()
  const results: ExtractResult[] = []

  for (const line of lines) {
    // Try to find URLs in the line
    const urls = line.match(URL_RE) ?? []
    if (urls.length > 0) {
      for (const url of urls) {
        const key = url.toLowerCase()
        if (seen.has(key)) continue
        seen.add(key)
        try {
          const hostname = new URL(url).hostname.replace(/^www\./, '')
          results.push({ website: url, name: hostname, raw: line })
        } catch {
          results.push({ website: url, raw: line })
        }
      }
    } else {
      // Treat non-empty lines as potential company names
      const domains = line.match(DOMAIN_RE) ?? []
      const key = line.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      if (domains.length > 0) {
        results.push({ website: `https://${domains[0]}`, name: line, raw: line })
      } else if (line.length > 2 && line.length < 120) {
        results.push({ name: line, raw: line })
      }
    }
  }

  return results
}

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get('content-type') ?? ''

    /* ── multipart form ── */
    if (contentType.includes('multipart/form-data')) {
      const form = await req.formData()
      const file = form.get('file') as File | null

      if (!file) {
        return NextResponse.json({ error: 'No file provided' }, { status: 400 })
      }

      const ext  = file.name.split('.').pop()?.toLowerCase() ?? ''
      const bytes = await file.arrayBuffer()

      /* ── CSV / TXT ── */
      if (['csv', 'txt'].includes(ext)) {
        const text    = new TextDecoder().decode(bytes)
        const results = extractFromText(text)
        return NextResponse.json({ results, count: results.length })
      }

      /* ── Excel ── */
      if (['xlsx', 'xls'].includes(ext)) {
        try {
          const XLSX = await import('xlsx').catch(() => null)
          if (!XLSX) {
            return NextResponse.json({ error: 'xlsx package not installed. Run: npm install xlsx' }, { status: 500 })
          }
          const wb = XLSX.read(bytes, { type: 'array' })
          const ws = wb.Sheets[wb.SheetNames[0]]

          const NAME_PATTERNS    = /company|name|organisation|organization|firm|brand|sponsor|exhibitor|entity|prospect/i
          const WEBSITE_PATTERNS = /website|url|domain|web|site|link|homepage/i

          // ── Detect title rows and find the real header row ─────────────────
          // Parse raw with header:1 to get all rows as arrays so we can inspect
          const rawRows = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: '' }) as string[][]

          // A "title row" is one where > 60% of cells are empty AND the first cell looks like a title
          const isTitleRow = (row: string[]) => {
            const nonEmpty = row.filter(c => String(c).trim()).length
            return nonEmpty <= 2 && row.length > 2
          }

          // Find the first non-title row — that's the real header row
          let headerRowIdx = 0
          for (let i = 0; i < Math.min(5, rawRows.length); i++) {
            if (!isTitleRow(rawRows[i])) { headerRowIdx = i; break }
          }

          // Re-parse from the real header row
          const rows = XLSX.utils.sheet_to_json<Record<string, any>>(ws, {
            defval: '',
            range: headerRowIdx,  // start parsing from this row (uses it as header)
          })

          if (rows.length === 0) {
            return NextResponse.json({ results: [], count: 0, warning: 'File appears empty or header row not found' })
          }

          const headers = Object.keys(rows[0])

          // ── Smart column detection ─────────────────────────────────────────
          const nameCol    = headers.find(h => NAME_PATTERNS.test(h))
          const websiteCol = headers.find(h => WEBSITE_PATTERNS.test(h))

          // Fallback: first non-__EMPTY column as name, first __EMPTY or second col as website
          const effectiveNameCol    = nameCol    ?? headers.find(h => !h.startsWith('__EMPTY')) ?? headers[0]
          const effectiveWebsiteCol = websiteCol ?? null

          const results: ExtractResult[] = rows.map(row => {
            const nameVal    = effectiveNameCol    ? String(row[effectiveNameCol]    ?? '').trim() : ''
            const websiteVal = effectiveWebsiteCol ? String(row[effectiveWebsiteCol] ?? '').trim() : ''

            // Normalise website
            let website = websiteVal || undefined
            if (website && !website.startsWith('http') && website.includes('.')) {
              website = 'https://' + website
            }

            // Full row (exclude __EMPTY columns)
            const _row: Record<string, string> = {}
            for (const [k, v] of Object.entries(row)) {
              if (!k.startsWith('__EMPTY')) _row[k] = String(v ?? '').trim()
            }

            return {
              name:    nameVal || undefined,
              website: website,
              raw:     Object.values(row).join(' | '),
              _row,
            }
          }).filter(r => r.name || r.website)

          const meta = {
            total_rows:       rows.length,
            header_row_index: headerRowIdx,
            headers_found:    headers,
            name_col_used:    effectiveNameCol,
            website_col_used: effectiveWebsiteCol ?? 'none detected',
          }

          return NextResponse.json({ results, count: results.length, meta })
        } catch (e: any) {
          return NextResponse.json({ error: `Excel parse error: ${e.message}` }, { status: 500 })
        }
      }

      /* ── PDF ── */
      if (ext === 'pdf') {
        try {
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const pdfParse = require('pdf-parse') as (buf: Buffer) => Promise<{ text: string }>
          const parsed  = await pdfParse(Buffer.from(bytes))
          const text    = parsed.text
          const results = extractFromText(text)
          return NextResponse.json({ results, count: results.length })
        } catch (e: any) {
          return NextResponse.json({ error: `PDF parse error: ${e.message}` }, { status: 500 })
        }
      }

      /* ── Image ── */
      if (['png', 'jpg', 'jpeg', 'webp'].includes(ext)) {
        // Attempt Gemini vision if available
        const apiKey = process.env.GEMINI_API_KEY
        if (!apiKey) {
          return NextResponse.json({
            error: 'Image parsing requires GEMINI_API_KEY. Add it to your .env.local.',
          }, { status: 400 })
        }

        try {
          const base64 = Buffer.from(bytes).toString('base64')
          const mime   = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`

          const geminiRes = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
            {
              method:  'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{
                  parts: [
                    { text: 'Extract all company names and website URLs visible in this image. Return as JSON array: [{"name": "...", "website": "..."}]. If no website is visible, omit the website field.' },
                    { inline_data: { mime_type: mime, data: base64 } },
                  ],
                }],
              }),
            }
          )

          const gd   = await geminiRes.json()
          const text = gd?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
          const jsonMatch = text.match(/\[[\s\S]*\]/)
          if (jsonMatch) {
            const parsed  = JSON.parse(jsonMatch[0])
            const results: ExtractResult[] = parsed.map((r: any) => ({
              name:    r.name,
              website: r.website,
              raw:     `${r.name ?? ''} ${r.website ?? ''}`.trim(),
            }))
            return NextResponse.json({ results, count: results.length })
          }

          // Fallback: extract text from response
          const results = extractFromText(text)
          return NextResponse.json({ results, count: results.length })
        } catch (e: any) {
          return NextResponse.json({ error: `Image parse error: ${e.message}` }, { status: 500 })
        }
      }

      /* ── Unknown file type: try text ── */
      try {
        const text    = new TextDecoder().decode(bytes)
        const results = extractFromText(text)
        return NextResponse.json({ results, count: results.length })
      } catch {
        return NextResponse.json({ error: `Unsupported file type: ${ext}` }, { status: 400 })
      }
    }

    return NextResponse.json({ error: 'Expected multipart/form-data' }, { status: 400 })
  } catch (e: any) {
    console.error('[extract/file]', e)
    return NextResponse.json({ error: e.message ?? 'Internal error' }, { status: 500 })
  }
}
