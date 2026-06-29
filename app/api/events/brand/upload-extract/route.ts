import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 300

/* POST /api/events/brand/upload-extract
   FormData: { pdf: File }
   1. Reads the uploaded PDF bytes
   2. Uploads directly to Gemini Files API
   3. Asks Gemini to extract colours + fonts
   4. Returns { colors: string[], heading_font: string, body_font: string, brand_name: string }
*/

const GEMINI_KEY   = process.env.GEMINI_API_KEY!
const UPLOAD_URL   = `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${GEMINI_KEY}`
const GENERATE_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`

const PROMPT = `You are a brand identity analyst. Read this brand guidelines PDF carefully.

Extract the following and return ONLY a JSON object — no markdown, no explanation:

{
  "colors": ["#XXXXXX", "#XXXXXX"],
  "heading_font": "Font Name",
  "body_font": "Font Name",
  "brand_name": "Brand Name"
}

Rules:
- colors: list up to 5 primary brand hex codes in order of importance (primary first). Only real hex codes like #1A2B3C — no names, no rgba.
- heading_font: the main display/heading typeface. Must be a Google Fonts name (e.g. "Inter", "Sora", "Montserrat"). If not on Google Fonts, pick the closest equivalent.
- body_font: the body/paragraph typeface. Must be a Google Fonts name. Can be the same as heading_font if only one font is used.
- brand_name: the event or brand name from the document.

If you cannot find a value, use null for that field.`

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const pdfFile  = formData.get('pdf') as File | null

    if (!pdfFile) {
      return NextResponse.json({ error: 'No PDF file provided' }, { status: 400 })
    }
    if (pdfFile.type !== 'application/pdf') {
      return NextResponse.json({ error: 'File must be a PDF' }, { status: 400 })
    }
    if (pdfFile.size > 30 * 1024 * 1024) {
      return NextResponse.json({ error: 'PDF must be under 30 MB' }, { status: 400 })
    }

    const pdfBuffer  = await pdfFile.arrayBuffer()
    const byteLength = pdfBuffer.byteLength

    // ── Upload to Gemini Files API ────────────────────────────────────────
    const uploadRes = await fetch(UPLOAD_URL, {
      method:  'POST',
      headers: {
        'Content-Type':                        'application/pdf',
        'Content-Length':                       String(byteLength),
        'X-Goog-Upload-Protocol':              'raw',
        'X-Goog-Upload-Command':               'upload, finalize',
        'X-Goog-Upload-Header-Content-Type':   'application/pdf',
        'X-Goog-Upload-Header-Content-Length': String(byteLength),
      },
      body: pdfBuffer,
    })

    const uploadData = await uploadRes.json()
    if (!uploadData?.file?.uri) {
      console.error('Gemini upload response:', JSON.stringify(uploadData))
      return NextResponse.json({ error: 'Failed to upload PDF to Gemini' }, { status: 500 })
    }

    const fileUri = uploadData.file.uri

    // ── Ask Gemini to extract brand info ─────────────────────────────────
    const gemRes = await fetch(GENERATE_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: PROMPT },
            { file_data: { mime_type: 'application/pdf', file_uri: fileUri } },
          ],
        }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 4096 },
      }),
    })

    if (!gemRes.ok) {
      const errText = await gemRes.text()
      console.error('Gemini generation failed:', gemRes.status, errText.slice(0, 500))
      return NextResponse.json({ error: 'AI extraction failed. Please try again.' }, { status: 502 })
    }

    const gemData = await gemRes.json()
    if (gemData?.error) {
      console.error('Gemini API error:', JSON.stringify(gemData.error))
      return NextResponse.json({ error: `Gemini error: ${gemData.error.message ?? 'unknown'}` }, { status: 502 })
    }

    const parts = gemData?.candidates?.[0]?.content?.parts ?? []
    const textPart = parts.find((p: Record<string, unknown>) => typeof p.text === 'string' && p.text.trim().length > 0)
    const raw = textPart?.text ?? ''

    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      console.error('Gemini raw response:', raw.slice(0, 500))
      return NextResponse.json({ error: 'Could not parse brand data from PDF. Please try again.' }, { status: 500 })
    }

    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(jsonMatch[0])
    } catch {
      console.error('JSON parse error, raw:', raw.slice(0, 500))
      return NextResponse.json({ error: 'AI returned malformed data. Please try again.' }, { status: 500 })
    }

    const colors = Array.isArray(parsed.colors) ? parsed.colors : []
    return NextResponse.json({
      colors:       colors.filter((c: string) => /^#[0-9A-Fa-f]{6}$/.test(c)).slice(0, 5),
      heading_font: (parsed.heading_font as string) ?? null,
      body_font:    (parsed.body_font as string)    ?? null,
      brand_name:   (parsed.brand_name as string)   ?? null,
    })

  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
