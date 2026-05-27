import { NextRequest, NextResponse } from 'next/server'

interface ExtractResult {
  name?: string
  website?: string
  raw: string
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
          // Dynamic import to avoid build errors if package is missing
          const XLSX = await import('xlsx').catch(() => null)
          if (!XLSX) {
            return NextResponse.json({ error: 'xlsx package not installed. Run: npm install xlsx' }, { status: 500 })
          }
          const wb   = XLSX.read(bytes, { type: 'array' })
          const ws   = wb.Sheets[wb.SheetNames[0]]
          const rows = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: '' })

          const results: ExtractResult[] = rows.map(row => {
            // Look for common column names
            const name    = row['Company Name'] ?? row['company_name'] ?? row['Company'] ?? row['company'] ?? row['Name'] ?? row['name'] ?? ''
            const website = row['Website'] ?? row['website'] ?? row['Domain'] ?? row['domain'] ?? row['URL'] ?? row['url'] ?? ''
            return {
              name:    String(name).trim() || undefined,
              website: String(website).trim() || undefined,
              raw:     Object.values(row).join(' | '),
            }
          }).filter(r => r.name || r.website)

          return NextResponse.json({ results, count: results.length })
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
