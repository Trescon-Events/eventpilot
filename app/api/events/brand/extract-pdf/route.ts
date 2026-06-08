import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 300  // 5-minute timeout — needed for 30MB PDF upload to Gemini

/* POST /api/events/brand/extract-pdf
   { pdf_url: string }
   1. Fetches the brand PDF from Supabase Storage
   2. Uploads it to Gemini Files API
   3. Asks Gemini to extract colours + fonts
   4. Returns { colors: string[], heading_font: string, body_font: string }
*/

const GEMINI_KEY    = process.env.GEMINI_API_KEY!
const UPLOAD_URL    = `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${GEMINI_KEY}`
const GENERATE_URL  = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`

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
    const { pdf_url } = await req.json()
    if (!pdf_url) return NextResponse.json({ error: 'pdf_url is required' }, { status: 400 })

    // ── Step 1: Fetch the PDF ──────────────────────────────────────────────
    const pdfRes = await fetch(pdf_url)
    if (!pdfRes.ok) return NextResponse.json({ error: 'Could not fetch PDF from storage' }, { status: 400 })

    const pdfBuffer  = await pdfRes.arrayBuffer()
    const byteLength = pdfBuffer.byteLength

    // ── Step 2: Upload to Gemini Files API ────────────────────────────────
    const uploadRes = await fetch(UPLOAD_URL, {
      method:  'POST',
      headers: {
        'Content-Type':           'application/pdf',
        'Content-Length':          String(byteLength),
        'X-Goog-Upload-Protocol': 'raw',
        'X-Goog-Upload-Command':  'upload, finalize',
        'X-Goog-Upload-Header-Content-Type': 'application/pdf',
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

    // ── Step 3: Ask Gemini to extract brand info ──────────────────────────
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
        generationConfig: { temperature: 0.1, maxOutputTokens: 1024, thinkingConfig: { thinkingBudget: 0 } },
      }),
    })

    const gemData = await gemRes.json()
    const raw     = gemData?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''

    // ── Step 4: Parse the JSON response ───────────────────────────────────
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      console.error('Gemini raw response:', raw)
      return NextResponse.json({ error: 'Could not parse brand data from PDF', raw }, { status: 500 })
    }

    const parsed = JSON.parse(jsonMatch[0])

    return NextResponse.json({
      colors:       (parsed.colors ?? []).filter((c: string) => /^#[0-9A-Fa-f]{6}$/.test(c)).slice(0, 5),
      heading_font: parsed.heading_font ?? null,
      body_font:    parsed.body_font    ?? null,
      brand_name:   parsed.brand_name   ?? null,
    })

  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
